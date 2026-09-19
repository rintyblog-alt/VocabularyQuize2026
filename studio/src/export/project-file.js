/* ══════════════════════════════════════════════════════════════════════════
   studio/src/export/project-file.js — .vqstudio の読み書き（契約書 §11-6）

   ★ 何をする所か
     プロジェクト（JSON）と素材（動画・音・画像の実体）を **1 ファイル**に
     詰めて持ち出せるようにする。形は自前の単純コンテナ:

       "VQSTUDIO1"  … 9 バイトの印（magic）
       u32          … ヘッダ JSON の長さ（little endian）
       JSON         … { version, project, assets[], parts[] , … }（UTF-8）
       素材の中身   … parts[i].offset / length で切り出す（ただの連結）

     併せて EDL 相当の JSON（exportEDLJson / importEDLJson）も置く。

   ★ なぜこの形か
     ・ZIP を自前で書くと「中央ディレクトリ・ローカルヘッダ・CRC32・
       Zip64・符号化」の全部が壊れどころになる。GIF の LZW と違って
       ZIP である必要（他のソフトで開く）が v1 には無いので、**壊れにくい方**を選ぶ。
     ・ヘッダを先頭に置き、素材は «offset + length» で指す形にすると、
       読み込みで **Blob.slice が使える**（= 何百 MB でもメモリに載せない）。
       書き出しも `new Blob([header, ...blobs])` で済むので写しを作らない。
     ・組み立てと解釈（buildContainer / parseContainer）は **純関数**。
       Blob も DOM も要らないので Node の試験でバイト列ごと押さえられる。
     ・version を持つ。**未来の版は黙って壊れず、理由を言って throw する**
       （「新しい版で作られた物です。VQ Studio を更新してください」）。

   ★ 触るときの注意
     ・素材を含めない時は project.assets[].storage を
       `{ kind:"missing", name, size }` にする（契約どおり）。読み込み側が
       「素材を再指定してください」と言えるようにするため。
     ・CONTRACT-NOTE: core/schema.js の normalizeProject() は storage.kind を
       ["idb","opfs","url","none"] に丸め、余分な枝（name/size/index）を落とす。
       そこで unpackProject は **normalize の後に storage を書き戻す**。
       normalize を後から通すと missing の印が消えるので、読み込んだ物を
       そのまま store へ入れる所（ui）は relinkAssets() で差し替えるまで
       normalize を通さないこと。返り値の `assets` / `missing` /
       `warnings` だけを見ても同じ判断ができるようにしてある。
     ・JSON.stringify は Infinity/NaN を null にする。asset.duration に
       Infinity を入れない（契約書 §1 も image は 0 と決めている）。
     ・ヘッダは «人が読める» ままにしておく（圧縮しない）。壊れたファイルを
       hexdump で追える事の方が、数 KB 縮む事より大事。
     ・保存する project は jsonSafe() を通す。TypedArray（解析結果の曲線が
       Float32Array で来る道が在る）は JSON.stringify だと配列ではなく
       {"0":…} という object になり、読み戻した側の values.length が
       undefined になって黙って壊れるため。NaN / Infinity は null に、
       循環参照はその枝だけ切る（「保存できません」に倒さない）。
     ・CONTRACT-NOTE: 契約書 §0 の «1 ファイル 700 行» を 100 行ほど超えている。
       担当の割り当てが この 1 ファイルなので今は分けない。分けるなら
       §7（EDL の JSON）を export/edl.js へ出すのが素直。
     ・packProject は Blob を返す（契約どおり）。**Blob が無い環境
       （Node の試験）だけ Uint8Array を返す**。unpackProject は
       どちらでも受けるので往復は成り立つ。
   ══════════════════════════════════════════════════════════════════════════ */

import { scope } from "../core/log.js";
import { finite, clampInt } from "../core/util.js";
import { SCHEMA_VERSION, migrate, normalizeProject } from "../core/schema.js";
import { buildEDL } from "./exporter.js";

const L = scope("project-file");

/* ── 0. 形の決め事 ─────────────────────────────────────────────── */

/** 先頭の印。9 バイト固定（末尾の "1" は «この容器の世代»） */
export const MAGIC = "VQSTUDIO1";
/** ヘッダ JSON の長さを書く所（印の直後・u32 little endian） */
export const HEADER_LENGTH_OFFSET = 9;
/** 中身が始まる最小の位置（印 9 + 長さ 4） */
export const PAYLOAD_BASE = 13;
/** この版が書く header.version。読めるのは これ以下 */
export const CONTAINER_VERSION = 1;
/** ヘッダ JSON の上限（壊れた u32 で 4GB 読みに行かないための安全弁） */
export const MAX_HEADER_BYTES = 64 * 1024 * 1024;
/** 拡張子と MIME */
export const FILE_EXT = ".vqstudio";
export const FILE_MIME = "application/x-vqstudio";
/** storage.kind の追加分（契約書 §11-6。core/schema.js は知らない） */
export const MISSING_KIND = "missing";
export const PACK_KIND = "pack";

/* ── 1. バイト列の小道具 ───────────────────────────────────────── */

const textEnc = typeof TextEncoder === "function" ? new TextEncoder() : null;
const textDec = typeof TextDecoder === "function" ? new TextDecoder("utf-8") : null;

/** 文字列 → UTF-8 のバイト列 */
export function utf8Bytes(s) {
  const str = typeof s === "string" ? s : String(s === undefined ? "" : s);
  if (textEnc) return textEnc.encode(str);
  // TextEncoder が無い環境（古い WebView）向けの手写し
  const out = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.codePointAt(i);
    if (c > 0xffff) i++;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return new Uint8Array(out);
}

/** UTF-8 のバイト列 → 文字列 */
export function utf8String(bytes) {
  const b = toBytes(bytes);
  if (textDec) return textDec.decode(b);
  let s = "";
  for (let i = 0; i < b.length;) {
    const c = b[i];
    if (c < 0x80) { s += String.fromCharCode(c); i += 1; }
    else if (c < 0xe0) { s += String.fromCharCode(((c & 31) << 6) | (b[i + 1] & 63)); i += 2; }
    else if (c < 0xf0) { s += String.fromCharCode(((c & 15) << 12) | ((b[i + 1] & 63) << 6) | (b[i + 2] & 63)); i += 3; }
    else {
      const cp = ((c & 7) << 18) | ((b[i + 1] & 63) << 12) | ((b[i + 2] & 63) << 6) | (b[i + 3] & 63);
      s += String.fromCodePoint(cp); i += 4;
    }
  }
  return s;
}

/** ArrayBuffer / TypedArray / 数の配列 → Uint8Array（写しは作らない） */
function toBytes(v) {
  if (v instanceof Uint8Array) return v;
  if (ArrayBuffer.isView(v)) return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  if (Array.isArray(v)) return new Uint8Array(v);
  if (!v) return new Uint8Array(0);
  throw new Error("project-file: バイト列として読めない物が渡されました");
}

function ascii(s) {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

function u32le(n) {
  const v = n >>> 0;
  return new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]);
}

function readU32le(b, at) {
  return (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;
}

function concat(list) {
  let n = 0;
  for (const b of list) n += b ? b.length : 0;
  const out = new Uint8Array(n);
  let at = 0;
  for (const b of list) { if (b && b.length) { out.set(b, at); at += b.length; } }
  return out;
}

/** jsonSafe が潜る深さの上限（壊れた project で戻り切れなくならないため） */
const JSON_MAX_DEPTH = 64;

/**
 * JSON に素直に落ちない物を «落ちる形» へ均す（純関数・写しを返す）。
 *
 * なぜ要るか:
 *  ・`Float32Array` は `JSON.stringify` に渡すと **配列ではなく object**
 *    （`{"0":0.1,"1":0.2}`）になる。読み戻した側は `values.length` が
 *    undefined になり、曲線が «在るのに空» という顔をして黙って壊れる。
 *    解析結果（契約書 §1 の analysis.motion / loudness の values）は
 *    普通の配列と決まっているが、`structuredClone` は TypedArray を
 *    そのまま通すので、途中の版や probe 経由で紛れ込む道が在る。
 *  ・NaN / Infinity は `JSON.stringify` が **黙って** null にする。
 *    どちらも «無い» と読める null に自分で倒して、気付ける形にする。
 *  ・循環参照は `JSON.stringify` が throw する。ここで切って、
 *    「保存できません」ではなく「その枝だけ落ちた」に倒す。
 * @param {any} v @param {number} [depth] @param {Set<any>} [seen]
 * @returns {any}
 */
function jsonSafe(v, depth, seen) {
  const d = depth || 0;
  if (v === undefined) return undefined;
  if (v === null) return null;
  const t = typeof v;
  if (t === "number") return Number.isFinite(v) ? v : null;
  if (t === "string" || t === "boolean") return v;
  if (t !== "object") return undefined;              // function / symbol / bigint
  if (ArrayBuffer.isView(v)) {
    // TypedArray は普通の配列へ。DataView は数に落とせないので捨てる
    if (typeof v.length !== "number") return null;
    const out = new Array(v.length);
    for (let i = 0; i < v.length; i++) out[i] = Number.isFinite(v[i]) ? v[i] : null;
    return out;
  }
  if (v instanceof ArrayBuffer) return null;
  if (d >= JSON_MAX_DEPTH) return null;
  const set = seen || new Set();
  if (set.has(v)) return null;                       // 循環はここで切る
  set.add(v);
  try {
    if (Array.isArray(v)) {
      const out = new Array(v.length);
      for (let i = 0; i < v.length; i++) {
        const x = jsonSafe(v[i], d + 1, set);
        out[i] = x === undefined ? null : x;         // 配列の穴は null（JSON と同じ）
      }
      return out;
    }
    if (typeof v.toJSON === "function") return jsonSafe(v.toJSON(), d + 1, set);
    const out = {};
    for (const k of Object.keys(v)) {
      const x = jsonSafe(v[k], d + 1, set);
      if (x !== undefined) out[k] = x;               // undefined は JSON でも消える
    }
    return out;
  } finally {
    set.delete(v);   // «今たどっている道» だけを見る（共有参照は消さない）
  }
}

/* ── 2. 容器の組み立て / 解釈（純関数）────────────────────────── */

/**
 * ヘッダだけを作る（印 + 長さ + JSON）。
 * parts の位置は **中身の先頭からの相対**（ヘッダの長さに依らないため）。
 * @param {Object} headerObj JSON にする物（version が無ければ足す）
 * @param {number[]} sizes 各素材のバイト数
 * @returns {Uint8Array}
 */
export function containerHeaderBytes(headerObj, sizes) {
  const lens = (sizes || []).map((n) => Math.max(0, Math.round(finite(n, 0))));
  const parts = [];
  let at = 0;
  for (const n of lens) { parts.push({ offset: at, length: n }); at += n; }
  const header = Object.assign({}, headerObj || {});
  if (!Number.isFinite(header.version)) header.version = CONTAINER_VERSION;
  header.parts = parts;
  header.payloadLength = at;
  const json = utf8Bytes(JSON.stringify(header));
  if (json.length > MAX_HEADER_BYTES) {
    throw new Error(`project-file: ヘッダが大きすぎます（${json.length} バイト・上限 ${MAX_HEADER_BYTES}）`);
  }
  return concat([ascii(MAGIC), u32le(json.length), json]);
}

/**
 * 1 本のバイト列に組む（試験と小さい物向け。大きい素材は packProject が
 * Blob のまま繋ぐので この関数を通さない）。
 * @param {Object} headerObj @param {Array<Uint8Array|ArrayBuffer|number[]>} parts
 * @returns {Uint8Array}
 */
export function buildContainer(headerObj, parts) {
  const list = (parts || []).map(toBytes);
  return concat([containerHeaderBytes(headerObj, list.map((b) => b.length)), ...list]);
}

/**
 * ヘッダだけ読む（中身は読まない）。unpackProject が Blob の頭だけ読んで
 * 使うので分けてある。
 * @param {Uint8Array|ArrayBuffer} bytes 少なくとも 13 + ヘッダ長 バイト
 * @param {{allowFutureVersion?:boolean}} [opts]
 * @returns {{header:Object, headerLength:number, payloadOffset:number}}
 */
export function parseContainerHeader(bytes, opts) {
  const b = toBytes(bytes);
  if (b.length < PAYLOAD_BASE) {
    throw new Error(`.vqstudio として短すぎます（${b.length} バイト。壊れているか別の形式です）`);
  }
  for (let i = 0; i < MAGIC.length; i++) {
    if (b[i] !== MAGIC.charCodeAt(i)) {
      throw new Error('.vqstudio ではありません（先頭の印が "VQSTUDIO1" ではない）');
    }
  }
  const headerLength = readU32le(b, HEADER_LENGTH_OFFSET);
  if (headerLength === 0) throw new Error(".vqstudio が壊れています（ヘッダの長さが 0）");
  if (headerLength > MAX_HEADER_BYTES) {
    throw new Error(`.vqstudio が壊れています（ヘッダの長さが ${headerLength} バイト・上限 ${MAX_HEADER_BYTES}）`);
  }
  if (b.length < PAYLOAD_BASE + headerLength) {
    throw new Error(`.vqstudio が途中で切れています（ヘッダに ${headerLength} バイト必要・実際は ${b.length - PAYLOAD_BASE}）`);
  }
  let header;
  try {
    header = JSON.parse(utf8String(b.subarray(PAYLOAD_BASE, PAYLOAD_BASE + headerLength)));
  } catch (e) {
    throw new Error(`.vqstudio のヘッダ（JSON）を読めません: ${e && e.message ? e.message : e}`);
  }
  if (!header || typeof header !== "object" || Array.isArray(header)) {
    throw new Error(".vqstudio のヘッダが object ではありません");
  }
  const v = finite(header.version, 0);
  if (!(opts && opts.allowFutureVersion) && v > CONTAINER_VERSION) {
    throw new Error(
      `この .vqstudio は新しい版（v${v}）で作られています。この VQ Studio は v${CONTAINER_VERSION} までしか読めません。` +
      "VQ Studio を更新してから開いてください");
  }
  if (v < 1) throw new Error(`.vqstudio の version が不正です（${header.version}）`);
  return { header, headerLength, payloadOffset: PAYLOAD_BASE + headerLength };
}

/**
 * 1 本のバイト列を解釈する（buildContainer の逆）。
 * parts は元の buffer を指す **view**（写しではない）。
 * @param {Uint8Array|ArrayBuffer} bytes
 * @param {{allowFutureVersion?:boolean}} [opts]
 * @returns {{header:Object, parts:Uint8Array[]}}
 */
export function parseContainer(bytes, opts) {
  const b = toBytes(bytes);
  const { header, payloadOffset } = parseContainerHeader(b, opts);
  const list = Array.isArray(header.parts) ? header.parts : [];
  const parts = list.map((p, i) => {
    const offset = Math.max(0, Math.round(finite(p && p.offset, 0)));
    const length = Math.max(0, Math.round(finite(p && p.length, 0)));
    const from = payloadOffset + offset;
    if (from + length > b.length) {
      throw new Error(`.vqstudio が途中で切れています（${i + 1} 個目の素材に ${length} バイト必要・残りは ${Math.max(0, b.length - from)}）`);
    }
    return b.subarray(from, from + length);
  });
  return { header, parts };
}

/* ── 3. 素材の受け取り方（どんな形で渡されても読む）────────────── */

/**
 * assets の指定（Map / object / 配列 / 関数）を «id → 取り出す関数» に均す。
 * @returns {(asset:Object) => Promise<any>}
 */
function assetGetter(assets, storage) {
  if (typeof assets === "function") return async (a) => await assets(a);
  const map = new Map();
  if (assets instanceof Map) {
    for (const [k, v] of assets) map.set(String(k), v);
  } else if (Array.isArray(assets)) {
    for (const it of assets) {
      if (!it) continue;
      const id = it.id || it.assetId;
      if (id) map.set(String(id), it.blob || it.data || it.bytes || it.file || it);
    }
  } else if (assets && typeof assets === "object") {
    for (const k of Object.keys(assets)) map.set(k, assets[k]);
  }
  return async (a) => {
    const id = a && a.id ? String(a.id) : "";
    if (map.has(id)) return map.get(id);
    // storage が在れば persist から引く（契約書 §3 の getAssetBlob）
    const key = a && a.storage ? a.storage.key : null;
    if (storage && key && typeof storage.getAssetBlob === "function") {
      return await storage.getAssetBlob(key);
    }
    return null;
  };
}

/** Blob / File / TypedArray / ArrayBuffer のバイト数 */
function sizeOf(v) {
  if (!v) return 0;
  if (typeof v.size === "number") return v.size;          // Blob / File
  if (typeof v.byteLength === "number") return v.byteLength;
  if (typeof v.length === "number") return v.length;
  return 0;
}

/** Blob なら Blob のまま、それ以外は Uint8Array にして返す */
function asBlobPart(v) {
  if (!v) return null;
  if (typeof Blob === "function" && v instanceof Blob) return v;
  if (ArrayBuffer.isView(v) || v instanceof ArrayBuffer || Array.isArray(v)) return toBytes(v);
  return null;
}

/* ── 4. packProject（書き出し）──────────────────────────────────── */

/**
 * project.assets[].storage を «この容器の中での在り方» に差し替えた
 * project の写しを作る（純関数）。
 * @param {Object} project
 * @param {Map<string,number>} packed id → parts の添字（入っている物だけ）
 * @returns {Object} project の写し
 */
export function projectForPack(project, packed) {
  const p = project && typeof project === "object" ? project : {};
  const assets = Array.isArray(p.assets) ? p.assets : [];
  const out = Object.assign({}, p);
  out.assets = assets.map((a) => {
    const src = a && typeof a === "object" ? a : {};
    const id = src.id ? String(src.id) : "";
    const copy = Object.assign({}, src);
    if (packed && packed.has(id)) copy.storage = { kind: PACK_KIND, index: packed.get(id) };
    else copy.storage = { kind: MISSING_KIND, name: String(src.name || ""), size: Math.max(0, Math.round(finite(src.size, 0))) };
    return copy;
  });
  return out;
}

/**
 * .vqstudio を作る（契約書 §11-6）。
 * @param {Object} project
 * @param {{assets?:any, includeAssets?:boolean, storage?:any,
 *          onProgress?:Function, signal?:any, note?:string}} [opts]
 * @returns {Promise<Blob>}
 */
export async function packProject(project, opts) {
  const o = opts || {};
  const includeAssets = o.includeAssets !== false;
  const list = Array.isArray(project && project.assets) ? project.assets.filter(Boolean) : [];
  const get = assetGetter(o.assets, o.storage);
  const onProgress = typeof o.onProgress === "function" ? o.onProgress : null;
  const total = includeAssets ? list.length : 0;
  const tick = (i, name, stage) => {
    if (!onProgress) return;
    const p = total ? Math.min(1, i / (total + 1)) : (stage === "done" ? 1 : 0.5);
    try { onProgress(p, { stage: stage || "assets", index: i, total, name: name || "" }); }
    catch (e) { L.warn("onProgress が投げました", e); }
  };

  const parts = [];        // Blob か Uint8Array
  const sizes = [];
  const entries = [];      // ヘッダに書く素材の台帳
  const packed = new Map();
  const warnings = [];

  throwIfAborted(o.signal);   // 素材が 0 個 / includeAssets:false でも中止は効く
  tick(0, "", "prepare");
  if (includeAssets) {
    for (let i = 0; i < list.length; i++) {
      throwIfAborted(o.signal);
      const a = list[i];
      /* id の無い素材は入れない。詰めても projectForPack が «packed» に
         載せられず（id で引くため）読み込み側から絶対に辿れないので、
         中身だけがファイルを太らせる死んだバイト列になる。 */
      if (!(a.id && String(a.id))) {
        warnings.push(`素材「${a.name || "(名前なし)"}」に id が無いので入れませんでした`);
        tick(i + 1, a.name, "assets");
        continue;
      }
      let raw = null;
      try { raw = await get(a); }
      catch (e) { L.warn(`素材「${a.name || a.id}」を取り出せません`, e); raw = null; }
      const part = asBlobPart(raw);
      if (!part) {
        warnings.push(`素材「${a.name || a.id}」の実体が見つからないので入れませんでした`);
        tick(i + 1, a.name, "assets");
        continue;
      }
      const index = parts.length;
      parts.push(part);
      sizes.push(sizeOf(part));
      packed.set(String(a.id), index);
      entries.push({
        id: a.id, name: String(a.name || ""), kind: a.kind || "video",
        mime: String(a.mime || (part.type ? part.type : "")) || "application/octet-stream",
        size: sizeOf(part), part: index,
      });
      tick(i + 1, a.name, "assets");
    }
  } else {
    for (const a of list) {
      entries.push({
        id: a.id, name: String(a.name || ""), kind: a.kind || "video",
        mime: String(a.mime || ""), size: Math.max(0, Math.round(finite(a.size, 0))), part: -1,
      });
    }
    if (list.length) warnings.push("素材を含めずに書き出しました（開いた人は素材を再指定する必要があります）");
  }

  const header = {
    kind: "vqstudio",
    version: CONTAINER_VERSION,
    app: "VQ Studio",
    schema: finite(project && project.schema, SCHEMA_VERSION),
    createdAt: new Date().toISOString(),
    includeAssets,
    note: o.note ? String(o.note) : "",
    /* jsonSafe を通すのは «TypedArray が object になって黙って壊れる» のを
       止めるため（上の jsonSafe の説明を見ること）。 */
    project: jsonSafe(projectForPack(project, packed)),
    assets: entries,
    warnings,
  };
  throwIfAborted(o.signal);
  const head = containerHeaderBytes(header, sizes);
  tick(total, "", "write");

  if (typeof Blob !== "function") {
    // Node での試験用。Blob が無ければバイト列を繋いで返す
    const bytes = concat([head, ...parts.map((p) => toBytes(p))]);
    tick(total + 1, "", "done");
    return /** @type {any} */ (bytes);
  }
  const blob = new Blob([head, ...parts], { type: FILE_MIME });
  tick(total + 1, "", "done");
  return blob;
}

function throwIfAborted(signal) {
  if (signal && signal.aborted) {
    const e = new Error("中止しました");
    e.name = "AbortError";
    throw e;
  }
}

/* ── 5. unpackProject（読み込み）────────────────────────────────── */

/** Blob の一部を Uint8Array で読む */
async function readSlice(blob, from, to) {
  const part = blob.slice(from, to);
  if (typeof part.arrayBuffer === "function") return new Uint8Array(await part.arrayBuffer());
  throw new Error("この環境の Blob は arrayBuffer() を持っていません（読み込めません）");
}

/**
 * .vqstudio を読む（契約書 §11-6 / §5 の importProject）。
 * @param {Blob|Uint8Array|ArrayBuffer} blob
 * @param {{onProgress?:Function, putAsset?:Function, migrate?:boolean,
 *          allowFutureVersion?:boolean, signal?:any}} [opts]
 * @returns {Promise<{project:Object, assets:Object[], assetMap:Map<string,Object>,
 *                    missing:Object[], warnings:string[], header:Object}>}
 */
export async function unpackProject(blob, opts) {
  const o = opts || {};
  const onProgress = typeof o.onProgress === "function" ? o.onProgress : null;
  const tick = (p, stage, extra) => {
    if (!onProgress) return;
    try { onProgress(Math.max(0, Math.min(1, p)), Object.assign({ stage }, extra || {})); }
    catch (e) { L.warn("onProgress が投げました", e); }
  };
  if (!blob) throw new Error("unpackProject: 読み込む物が渡されていません");
  throwIfAborted(o.signal);
  tick(0, "header");

  const isBlob = typeof blob.slice === "function" && typeof blob.arrayBuffer === "function" && typeof blob.size === "number";
  let header, payloadOffset, cut;
  if (isBlob) {
    if (blob.size < PAYLOAD_BASE) throw new Error(`.vqstudio として短すぎます（${blob.size} バイト）`);
    const head0 = await readSlice(blob, 0, Math.min(blob.size, PAYLOAD_BASE + 64));
    // 印と長さだけ先に見て、必要なだけ読み直す（巨大な素材を触らない）
    for (let i = 0; i < MAGIC.length; i++) {
      if (head0[i] !== MAGIC.charCodeAt(i)) throw new Error('.vqstudio ではありません（先頭の印が "VQSTUDIO1" ではない）');
    }
    const len = readU32le(head0, HEADER_LENGTH_OFFSET);
    if (!len || len > MAX_HEADER_BYTES) throw new Error(`.vqstudio が壊れています（ヘッダの長さが ${len}）`);
    if (blob.size < PAYLOAD_BASE + len) throw new Error(".vqstudio が途中で切れています（ヘッダが足りません）");
    const headBytes = await readSlice(blob, 0, PAYLOAD_BASE + len);
    const parsed = parseContainerHeader(headBytes, o);
    header = parsed.header;
    payloadOffset = parsed.payloadOffset;
    cut = (from, to) => blob.slice(payloadOffset + from, payloadOffset + to);
  } else {
    const b = toBytes(blob);
    const parsed = parseContainerHeader(b, o);
    header = parsed.header;
    payloadOffset = parsed.payloadOffset;
    cut = (from, to) => {
      if (payloadOffset + to > b.length) throw new Error(".vqstudio が途中で切れています（素材が足りません）");
      return b.subarray(payloadOffset + from, payloadOffset + to);
    };
  }

  const warnings = Array.isArray(header.warnings) ? header.warnings.map(String) : [];
  const rawProject = header.project;
  if (!rawProject || typeof rawProject !== "object") {
    throw new Error(".vqstudio にプロジェクトが入っていません（header.project が無い）");
  }
  const rawSchema = finite(rawProject.schema, 0);
  if (rawSchema > SCHEMA_VERSION) {
    throw new Error(
      `このプロジェクトは新しい保存形式（schema ${rawSchema}）です。この VQ Studio は ${SCHEMA_VERSION} までしか読めません。` +
      "VQ Studio を更新してから開いてください");
  }

  tick(0.15, "project");
  let project;
  if (o.migrate === false) {
    project = normalizeProject(rawProject);
  } else {
    try {
      project = migrate(rawProject);
    } catch (e) {
      warnings.push(`プロジェクトの移行に失敗したので、そのまま整えて開きます（${e && e.message ? e.message : e}）`);
      project = normalizeProject(rawProject);
    }
  }

  /* 素材を切り出す。ここで «入っている / 入っていない» を storage に書き戻す
     （normalizeProject が missing / pack の印を落とすため。上の CONTRACT-NOTE 参照） */
  const partsInfo = Array.isArray(header.parts) ? header.parts : [];
  const entries = Array.isArray(header.assets) ? header.assets : [];
  const byId = new Map();
  for (const e of entries) if (e && e.id) byId.set(String(e.id), e);
  const rawById = new Map();
  for (const a of (Array.isArray(rawProject.assets) ? rawProject.assets : [])) {
    if (a && a.id) rawById.set(String(a.id), a);
  }

  const assets = [];
  const assetMap = new Map();
  const missing = [];
  const total = project.assets.length || 1;
  for (let i = 0; i < project.assets.length; i++) {
    throwIfAborted(o.signal);
    const a = project.assets[i];
    const id = String(a.id);
    const entry = byId.get(id) || null;
    const raw = rawById.get(id) || null;
    const rawStorage = raw && raw.storage && typeof raw.storage === "object" ? raw.storage : {};
    let index = entry && Number.isFinite(entry.part) ? Math.round(entry.part) : -1;
    if (index < 0 && rawStorage.kind === PACK_KIND && Number.isFinite(rawStorage.index)) index = Math.round(rawStorage.index);
    const info = index >= 0 ? partsInfo[index] : null;

    if (!info) {
      const name = String((entry && entry.name) || rawStorage.name || a.name || "");
      const size = Math.max(0, Math.round(finite(entry && entry.size !== undefined ? entry.size : rawStorage.size, a.size)));
      a.storage = { kind: MISSING_KIND, name, size };
      const rec = { id, name, kind: a.kind, mime: String((entry && entry.mime) || a.mime || ""), size, blob: null, missing: true };
      missing.push(rec);
      assets.push(rec);
      assetMap.set(id, rec);
      warnings.push(`素材「${name || id}」はこのファイルに入っていません（素材を再指定してください）`);
      tick(0.15 + 0.85 * ((i + 1) / total), "assets", { index: i + 1, total: project.assets.length, name });
      continue;
    }

    const from = Math.max(0, Math.round(finite(info.offset, 0)));
    const length = Math.max(0, Math.round(finite(info.length, 0)));
    const mime = String((entry && entry.mime) || a.mime || "") || "application/octet-stream";
    let body = cut(from, from + length);
    if (isBlob && typeof Blob === "function" && body && typeof body.slice === "function" && mime && !body.type) {
      // Blob.slice の第 3 引数で MIME を付け直す（<video> が type を見る）
      body = blob.slice(payloadOffset + from, payloadOffset + from + length, mime);
    }
    const rec = {
      id, name: String((entry && entry.name) || a.name || ""), kind: a.kind,
      mime, size: length, blob: body, missing: false,
    };
    if (typeof o.putAsset === "function") {
      try {
        const st = await o.putAsset(rec);
        if (st && typeof st === "object") a.storage = st.storage && typeof st.storage === "object" ? st.storage : st;
        else if (typeof st === "string") a.storage = { kind: "idb", key: st };
        else a.storage = { kind: PACK_KIND, index };
      } catch (e) {
        warnings.push(`素材「${rec.name || id}」を保存できませんでした（${e && e.message ? e.message : e}）`);
        a.storage = { kind: PACK_KIND, index };
      }
    } else {
      a.storage = { kind: PACK_KIND, index };
    }
    assets.push(rec);
    assetMap.set(id, rec);
    tick(0.15 + 0.85 * ((i + 1) / total), "assets", { index: i + 1, total: project.assets.length, name: rec.name });
  }

  if (!o.putAsset && assets.some((a) => !a.missing)) {
    warnings.push("素材は blob で返しています。persist.putAsset で保存して relinkAssets() で storage を差し替えてください");
  }
  tick(1, "done");
  return { project, assets, assetMap, missing, warnings, header };
}

/**
 * CONTRACT-NOTE: 契約書 §5 の `importProject(blob) -> Promise<Project>` は
 * «project だけ» を返す口、契約書 §11-6 の `unpackProject` は
 * «project + 素材 + 警告» を返す口。名前で返り値が違うと事故になるので
 * 別関数にし、§5 の方は 素材と警告を `project.meta.import` に載せて渡す
 * （呼び出し側が「素材を再指定してください」と言えるように）。
 * exporter.js の importProject() は こちらを見つける。
 * @param {Blob|Uint8Array|ArrayBuffer} blob @param {Object} [opts]
 * @returns {Promise<Object>} Project
 */
export async function importProject(blob, opts) {
  const r = await unpackProject(blob, opts);
  const meta = r.project.meta && typeof r.project.meta === "object" ? r.project.meta : {};
  meta.import = {
    at: Date.now(),
    warnings: r.warnings,
    missing: r.missing.map((m) => ({ id: m.id, name: m.name, size: m.size })),
    assetIds: r.assets.filter((a) => !a.missing).map((a) => a.id),
  };
  r.project.meta = meta;
  if (r.warnings.length) L.warn("読み込みの注意", r.warnings);
  return r.project;
}

/** exporter.js の exportProject が探す名前（同じ物） */
export const exportProject = packProject;

/* ── 6. storage の差し替え（読み込んだ後の後始末）──────────────── */

/** storage が «実体を指していない» か */
export function isMissingStorage(asset) {
  const st = asset && asset.storage ? asset.storage : null;
  if (!st || typeof st !== "object") return true;
  if (st.kind === MISSING_KIND || st.kind === PACK_KIND) return true;
  return !st.key;
}

/**
 * 読み込んだ project の storage を本物に差し替える（純関数・写しを返す）。
 * @param {Object} project
 * @param {Map<string,Object>|Object} map id → storage（{kind:"idb",key} 等）
 * @returns {Object} project の写し
 */
export function relinkAssets(project, map) {
  const p = project && typeof project === "object" ? project : {};
  const get = (id) => (map instanceof Map ? map.get(id) : (map ? map[id] : null));
  const out = Object.assign({}, p);
  out.assets = (Array.isArray(p.assets) ? p.assets : []).map((a) => {
    const id = a && a.id ? String(a.id) : "";
    const st = get(id);
    if (!st) return a;
    return Object.assign({}, a, { storage: typeof st === "string" ? { kind: "idb", key: st } : st });
  });
  return out;
}

/* ── 7. EDL 相当の JSON（契約書 §11-7）────────────────────────── */

/**
 * 編集内容だけを JSON の文字列で（素材の実体は入らない。共有・AI の再現用）。
 * 中身の組み立ては exporter.js の buildEDL に任せる（2 箇所で持つと必ずずれる）。
 * @param {Object} project @param {{pretty?:boolean}} [opts] @returns {string}
 */
export function exportEDLJson(project, opts) {
  const pretty = !opts || opts.pretty !== false;
  return JSON.stringify(buildEDL(project), null, pretty ? 2 : 0);
}

/**
 * EDL の JSON を読んでプロジェクトに戻す。
 * EDL には効果・キーフレーム・変形が入っていないので **完全には戻らない**。
 * 戻せなかった物は warnings で言う（黙って «開けた» 顔をしない）。
 * @param {string|Object} text @returns {{project:Object, warnings:string[], edl:Object}}
 */
export function importEDLJson(text) {
  let edl = text;
  if (typeof text === "string") {
    try { edl = JSON.parse(text); }
    catch (e) { throw new Error(`EDL（JSON）を読めません: ${e && e.message ? e.message : e}`); }
  }
  if (!edl || typeof edl !== "object" || Array.isArray(edl)) throw new Error("EDL が object ではありません");
  if (edl.kind && String(edl.kind) !== "vq-studio-edl") {
    throw new Error(`これは VQ Studio の EDL ではありません（kind: ${edl.kind}）`);
  }
  const v = finite(edl.version, 1);
  if (v > 1) throw new Error(`この EDL は新しい版（v${v}）です。VQ Studio を更新してください`);

  const warnings = [];
  const s = edl.settings && typeof edl.settings === "object" ? edl.settings : {};
  const assets = (Array.isArray(edl.assets) ? edl.assets : []).filter(Boolean).map((a) => ({
    id: a.id, kind: a.kind || "video", name: String(a.name || ""), mime: "",
    size: 0, duration: Math.max(0, finite(a.duration, 0)),
    width: clampInt(finite(a.width, 0), 0, 16384), height: clampInt(finite(a.height, 0), 0, 16384),
    fps: 0, hasAudio: (a.kind || "video") !== "image", rotation: 0,
    storage: { kind: MISSING_KIND, name: String(a.name || ""), size: 0 },
    createdAt: 0, analysis: null,
  }));
  const tracks = (Array.isArray(edl.tracks) ? edl.tracks : []).filter(Boolean).map((t) => ({
    id: t.id, kind: t.kind || "video", name: String(t.name || ""), height: 72,
    muted: !!t.muted, locked: false, hidden: !!t.hidden, solo: false,
    volume: finite(t.volume, 1), pan: 0, fx: [],
    clips: (Array.isArray(t.clips) ? t.clips : []).filter(Boolean).map((c) => ({
      id: c.id, name: String(c.name || ""), assetId: c.assetId || null, kind: c.kind || "video",
      start: Math.max(0, finite(c.start, 0)), duration: Math.max(0.04, finite(c.duration, 1)),
      in: Math.max(0, finite(c.in, 0)),
      /* out は «無ければ入れない»。ここで duration を out として入れてしまうと
         in の在るクリップで out < in になり、normalizeProject が §1-2 の
         «out > in» を守るために out = in + MIN_CLIP(0.04) へ潰す（4 秒の
         クリップが素材の 40ms だけを指す形で黙って壊れる）。渡さなければ
         schema.js が決め事どおり out = in + duration * speed を当ててくれる。 */
      out: Number.isFinite(c.out) ? Math.max(0, c.out) : undefined,
      speed: finite(c.speed, 1), reverse: !!c.reverse,
      volume: finite(c.volume, 1), opacity: finite(c.opacity, 1), blend: c.blend || "normal",
      text: c.text ? { content: String(c.text) } : null,
      transitionIn: c.transitionIn || null, transitionOut: c.transitionOut || null,
      source: c.source || null,
    })),
  }));
  const project = normalizeProject({
    schema: SCHEMA_VERSION,
    id: (edl.project && edl.project.id) || undefined,
    name: (edl.project && edl.project.name) || "EDL から復元",
    settings: {
      width: finite(s.width, 1920), height: finite(s.height, 1080),
      fps: finite(s.fps, 30), ratio: s.ratio || "16:9", sampleRate: finite(s.sampleRate, 48000),
    },
    assets, tracks,
    markers: Array.isArray(edl.markers) ? edl.markers : [],
    chapters: Array.isArray(edl.chapters) ? edl.chapters : [],
  });
  /* normalizeProject は storage.kind を idb/opfs/url/none に丸めるので、
     missing の印は **後から** 書き戻す（上の CONTRACT-NOTE と同じ理由）。 */
  for (const a of project.assets) {
    a.storage = { kind: MISSING_KIND, name: String(a.name || ""), size: 0 };
  }
  if (assets.length) warnings.push("EDL に素材の実体は入っていません（素材を再指定してください）");
  warnings.push("EDL には効果・キーフレーム・変形・カラーが入っていないので、それらは戻りません");
  return { project, warnings, edl };
}

export default packProject;
