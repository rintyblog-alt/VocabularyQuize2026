/* ══════════════════════════════════════════════════════════════════════════
   studio/src/core/persist.js — 素材とプロジェクトの保存庫（IndexedDB + OPFS）

   ★ 何をする所か
     契約書 §3 の `openStorage() -> Storage`。素材（動画/画像/音）の実体、
     プロキシ、サムネのシート、波形のピーク、プロジェクト JSON を **端末の中だけ**に
     保つ。ここ以外で IndexedDB を開かない（開くと版の食い違いで黙って壊れる）。

   ★ なぜこの形か
     ・**実体と JSON を分ける**: プロジェクト JSON は自動保存で数秒ごとに上書きされる。
       ここに blob や解析結果（motion の数千個の数値）が混ざると、毎回その全部を
       書き直すことになり、iOS では数百 ms 止まる。だから
         - blob は assets / proxies / thumbs、
         - ピークは peaks（ArrayBuffer で型を失わないように）、
         - 解析結果は meta の別 record（analysis:<assetId>）、
       に切り出し、projects には **小さな JSON 文字列** だけを置く（契約書 §13 の
       「iOS は数日で消えることがある」への備え。小さければ書き直しも復旧も速い）。
     ・**objectURL は参照数つきで貸す**: 再生中の <video>.src を revoke すると映像が
       消える。0 になっても 30 秒は残し（同じ素材がすぐ戻ってくるのが普通）、
       それでも誰も来なければ解放する。dispose() で全部返す。
     ・**溢れたら順番に捨てる**: QuotaExceededError を捕まえ、作り直せる物から
       （プロキシ → サムネ → 古いプロジェクト）LRU で捨てて **1 回だけ** 再試行。
       選定は純関数 `planEviction()` に出してあるので Node の試験で固定できる。
     ・**溢れたかどうかを安く調べる**: 捨てる物を選ぶのに blob 本体を読むのは論外
       （読んだ瞬間にメモリが死ぬ）。そこで proxies / thumbs / projects の書き込みは
       meta に `idx:<store>:<key>` という小さな台帳（size と updatedAt だけ）を
       同じトランザクションで一緒に書く。選定はその台帳だけを読む。
     ・**使えない環境でも編集は続ける**: iOS のプライベートモードでは
       indexedDB.open が例外を投げる／永遠に応答しないことがある。4 秒で見切って
       Map の揮発ストレージに落ち、`storage.volatile = true` と申告する
       （呼ぶ側は「閉じたら消えます」と出せる）。
     ・**OPFS は「在れば使う」**: 24MB を超える素材は OPFS のファイルに置く
       （巨大 blob を IndexedDB に入れると iOS で転ぶ）。書けなければ黙って
       IndexedDB に戻す。無い環境（古い Safari）でも動く。

   ★ 触るときの注意
     ・**読む API は throw しない**（null / "" / [] を返して warn）。
       **書く API は `{ok:false, reason}` を返す**。ただし `putProject` だけは
       失敗時に throw する（ui/app.js の自動保存が「保存済み」と嘘を表示しないため。
       CONTRACT-NOTE: 契約書 §3 は「返すか throw を明示」なのでこれは許されている）。
     ・`updatedAt` は索引の key なので **必ず有限の数**を入れる（undefined を入れると
       その record は索引から消え、LRU の候補から漏れる）。
     ・object store を増やすときは STORE_SPEC に足すだけ。onupgradeneeded は
       「無い物だけ作る」ので、version を上げても既存の中身は消えない。
     ・純関数（planEviction / assetFingerprint / ledgerKey / splitProject /
       summarizeEstimate …）は tests/persist-keys.test.mjs が見ている。形を変えるなら
       試験も直す。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";

import { warn, error } from "./log.js";
import { uid, clamp, finite } from "./util.js";

/* ── 1. 決めごと（数値は全部ここ） ─────────────────────────────── */

/** 既定の DB 名（契約書 §3） */
export const DB_NAME = "vqstudio";
/** 既定の版 */
export const DB_VERSION = 1;

/** object store の名前（契約書 §3 の 6 つ） */
export const STORES = Object.freeze({
  assets: "assets", projects: "projects", proxies: "proxies",
  thumbs: "thumbs", peaks: "peaks", meta: "meta"
});

/** store の一覧（作る順） */
export const STORE_NAMES = Object.freeze([
  STORES.assets, STORES.projects, STORES.proxies, STORES.thumbs, STORES.peaks, STORES.meta
]);

/**
 * 溢れたときに捨てる順。
 * assets（利用者の原本）と peaks（小さい上に decode が高い）は **絶対に捨てない**。
 */
export const EVICTION_ORDER = Object.freeze([STORES.proxies, STORES.thumbs, STORES.projects]);

/** objectURL を誰も使わなくなってから revoke するまでの猶予（再生中の事故を防ぐ） */
export const URL_GRACE_MS = 30000;
/** indexedDB.open がこの時間だけ黙っていたら諦めて揮発に落ちる */
export const OPEN_TIMEOUT_MS = 4000;
/** これより大きい素材は OPFS に置く（在れば） */
export const OPFS_MIN_BYTES = 24 * 1024 * 1024;
/** 書き込みのために余分に空けておきたい量 */
export const SAFETY_BYTES = 8 * 1024 * 1024;
/** 解析結果の record 名の頭 */
export const ANALYSIS_PREFIX = "analysis:";
/** 台帳 record 名の頭 */
export const LEDGER_PREFIX = "idx:";
/** この割合を超えたら「そろそろ危ない」と申告する */
export const LOW_SPACE_RATIO = 0.92;
/** OPFS の置き場 */
export const OPFS_DIR = "vqstudio-assets";

/** store の形（onupgradeneeded はこれを見て「無い物だけ」作る） */
const STORE_SPEC = Object.freeze([
  { name: STORES.assets, keyPath: "key", indexes: [["updatedAt", "updatedAt"], ["fingerprint", "fingerprint"]] },
  { name: STORES.projects, keyPath: "id", indexes: [["updatedAt", "updatedAt"]] },
  { name: STORES.proxies, keyPath: "id", indexes: [["updatedAt", "updatedAt"]] },
  { name: STORES.thumbs, keyPath: "id", indexes: [["updatedAt", "updatedAt"]] },
  { name: STORES.peaks, keyPath: "id", indexes: [["updatedAt", "updatedAt"]] },
  { name: STORES.meta, keyPath: "key", indexes: [["updatedAt", "updatedAt"]] }
]);

/** 失敗を呼ぶ側が見分けられる形にする（reason は画面に出せる日本語） */
export class StorageError extends Error {
  constructor(reason, cause) {
    super(String(reason || "保存庫の失敗"));
    this.name = "StorageError";
    this.reason = String(reason || "保存庫の失敗");
    this.cause = cause || null;
  }
}

/* ── 2. 純関数（ここだけ Node の試験で固定できる） ───────────────── */

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const nowMs = () => Date.now();

/** setTimeout の戻りを Node で握らない（試験が終わらなくなるのを防ぐ） */
function unref(t) {
  if (t && typeof t === "object" && typeof t.unref === "function") {
    try { t.unref(); } catch (_e) { /* noop */ }
  }
  return t;
}

/** FNV-1a の 32bit（暗号用途ではない。名前の同一性を短く表すだけ） */
function hash32(s) {
  let h = 0x811c9dc5;
  const str = String(s);
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

/**
 * 文字列の UTF-8 バイト数（TextEncoder が無い環境でも動く）。
 * 台帳の size と「JSON が小さいか」の判断に使うので、厳密さより速さを取る。
 * @param {string} s @returns {number}
 */
export function utf8Size(s) {
  const str = String(s === null || s === undefined ? "" : s);
  let n = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c < 0xdc00 && i + 1 < str.length) { n += 4; i++; }
    else n += 3;
  }
  return n;
}

/**
 * だいたいのバイト数（Blob / ArrayBuffer / 文字列 / 普通の物）。
 * @param {any} v @returns {number}
 */
export function roughByteSize(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === "string") return utf8Size(v);
  if (typeof v === "number" || typeof v === "boolean") return 8;
  if (typeof Blob !== "undefined" && v instanceof Blob) return Math.max(0, finite(v.size, 0));
  if (typeof ArrayBuffer !== "undefined" && v instanceof ArrayBuffer) return v.byteLength;
  if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView(v)) return v.byteLength;
  if (typeof v === "object") { try { return utf8Size(JSON.stringify(v)); } catch (_e) { return 0; } }
  return 0;
}

/**
 * 素材の簡易指紋（size + name + lastModified）。同じ物を二度保存しないための鍵。
 * **name か lastModified が無い物（素の Blob）は null**。size だけで同一と見なすと
 * 別の素材を取り違える（1MB の動画は世に無数に在る）。
 * @param {{name?:string,size?:number,lastModified?:number}} file
 * @returns {string|null}
 */
export function assetFingerprint(file) {
  if (!file || typeof file !== "object") return null;
  const name = typeof file.name === "string" ? file.name : "";
  const size = Number(file.size);
  const lm = Number(file.lastModified);
  if (!name) return null;
  if (!Number.isFinite(size) || size < 0) return null;
  if (!Number.isFinite(lm)) return null;
  const h = hash32(name).toString(36);
  return "fp1_" + Math.floor(size).toString(36) + "_" + Math.floor(lm).toString(36) +
    "_" + h + "_" + name.length.toString(36);
}

/**
 * 指紋から素材の key（契約書 §1 の `storage.key` = "blob_xxx"）。
 * @param {string} fingerprint @returns {string}
 */
export function assetKey(fingerprint) {
  const fp = String(fingerprint === null || fingerprint === undefined ? "" : fingerprint);
  if (!fp) throw new StorageError("指紋が空です");
  return "blob_" + fp;
}

/** 指紋が取れない物（素の Blob・録音）用の使い捨て key */
export function newAssetKey() { return "blob_" + uid("v"); }

/** 解析結果の record 名 */
export function analysisKey(assetId) {
  return ANALYSIS_PREFIX + String(assetId === null || assetId === undefined ? "" : assetId);
}

/**
 * 台帳（meta に置く小さな record）の key。
 * `idx:<store>:<本来の key>`。本来の key に ":" が入っていても壊れないように、
 * parse は **前から 2 つ目の ":" まで**で切る。
 * @param {string} store @param {string} key @returns {string}
 */
export function ledgerKey(store, key) {
  const s = String(store === null || store === undefined ? "" : store);
  const k = String(key === null || key === undefined ? "" : key);
  return LEDGER_PREFIX + s + ":" + k;
}

/**
 * 台帳の key を戻す。台帳でない物は null。
 * @param {string} s @returns {{store:string,key:string}|null}
 */
export function parseLedgerKey(s) {
  const str = String(s === null || s === undefined ? "" : s);
  if (str.indexOf(LEDGER_PREFIX) !== 0) return null;
  const rest = str.slice(LEDGER_PREFIX.length);
  const i = rest.indexOf(":");
  if (i <= 0) return null;
  const store = rest.slice(0, i);
  const key = rest.slice(i + 1);
  if (!store || !key) return null;
  return { store, key };
}

/**
 * OPFS のファイル名にできる形へ（"/" や制御文字を落とし、長さも縛る）。
 * 落とした結果が衝突しないよう、元の key の hash を必ず足す。
 * @param {string} key @returns {string}
 */
export function safeFileName(key) {
  const src = String(key === null || key === undefined ? "" : key);
  const h = hash32(src).toString(36);
  let safe = "";
  for (let i = 0; i < src.length && safe.length < 64; i++) {
    const ch = src.charAt(i);
    safe += /[A-Za-z0-9._-]/.test(ch) ? ch : "_";
  }
  return (safe || "asset") + "-" + h + ".bin";
}

/** QuotaExceededError か（名前・code・message の 3 通りで見る。実装差が大きい） */
export function isQuotaError(e) {
  if (!e) return false;
  const name = String(e.name || "");
  if (name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED") return true;
  if (Number(e.code) === 22) return true;
  const msg = String(e.message || e.reason || "");
  return /quota|storage full|容量/i.test(msg);
}

/**
 * これだけ空けたい、という量（素材の大きさ + 余裕）。
 * 素材と同じだけ空けても索引や台帳の分でまた溢れるので 1.25 倍 + 余白。
 * @param {number} size @returns {number}
 */
export function requiredFreeBytes(size) {
  const n = Math.max(0, Math.ceil(finite(size, 0)));
  return Math.ceil(n * 1.25) + SAFETY_BYTES;
}

/**
 * navigator.storage.estimate の結果を丸めて使いやすくする。
 * 端末は usage だけ／quota だけを返すことがあり、usage > quota も起こる。
 * @param {{usage?:number,quota?:number}|null} raw
 * @returns {{usage:number,quota:number,free:number,ratio:number,percent:number,low:boolean}|null}
 */
export function summarizeEstimate(raw) {
  if (!raw || typeof raw !== "object") return null;
  const u = Number(raw.usage), q = Number(raw.quota);
  const hasU = Number.isFinite(u), hasQ = Number.isFinite(q);
  if (!hasU && !hasQ) return null;
  const usage = Math.max(0, Math.round(hasU ? u : 0));
  const quota = Math.max(0, Math.round(hasQ ? q : 0));
  const free = Math.max(0, quota - usage);
  const ratio = quota > 0 ? clamp(usage / quota, 0, 1) : 0;
  return {
    usage: usage, quota: quota, free: free, ratio: ratio,
    percent: Math.round(ratio * 1000) / 10,          /* 0.1% 刻み */
    low: quota > 0 && (ratio >= LOW_SPACE_RATIO || free <= SAFETY_BYTES)
  };
}

/**
 * 溢れたときに「何を捨てるか」を決める（純関数）。
 *
 * ・順番は EVICTION_ORDER（プロキシ → サムネ → 古いプロジェクト）。
 *   プロキシとサムネは素材から作り直せる。プロジェクトは作り直せないので最後。
 * ・同じ store の中は updatedAt の古い順（LRU）。同時刻なら key 順で決める
 *   （試験と実機で同じ答えになるように）。
 * ・need に届いた時点で止める（必要以上に捨てない）。
 * ・`keep` に挙げた key と `pinned` は触らない。さらに **一番新しいプロジェクトは
 *   既定で残す**（今開いている物を消すのが最悪の事故なので。keepNewestProjects で変えられる）。
 * ・size が 0 か不明の物は候補に入れない（消してもバイトが空かないのにデータだけ失う）。
 *
 * @param {Array<{store:string,key?:string,id?:string,size?:number,updatedAt?:number,pinned?:boolean}>} entries
 * @param {number} need 空けたいバイト数
 * @param {{keep?:string[], keepNewestProjects?:number}} [opts]
 * @returns {{need:number,victims:Array<{store:string,key:string,size:number,updatedAt:number}>,
 *            freed:number,enough:boolean,byStore:Object}}
 */
export function planEviction(entries, need, opts) {
  const o = opts && typeof opts === "object" ? opts : {};
  const want = Math.max(0, Math.ceil(finite(need, 0)));
  const keep = new Set((Array.isArray(o.keep) ? o.keep : []).map((k) => String(k)));
  const keepNewest = Math.max(0, Math.floor(finite(o.keepNewestProjects, 1)));
  const out = { need: want, victims: [], freed: 0, enough: want === 0, byStore: {} };
  if (want === 0 || !Array.isArray(entries) || !entries.length) return out;

  /* ① 候補を絞る（捨ててよい store・重複除去・守る物を外す） */
  const seen = new Set();
  const groups = new Map();
  for (let i = 0; i < entries.length; i++) {
    const raw = entries[i];
    if (!raw || typeof raw !== "object") continue;
    const store = String(raw.store || "");
    if (EVICTION_ORDER.indexOf(store) < 0) continue;      /* assets / peaks / meta は対象外 */
    const key = String(raw.key !== undefined && raw.key !== null ? raw.key
      : (raw.id !== undefined && raw.id !== null ? raw.id : ""));
    if (!key) continue;
    const tag = store + "|" + key;
    if (seen.has(tag)) continue;
    seen.add(tag);
    if (raw.pinned) continue;
    if (keep.has(key)) continue;
    const size = Math.max(0, Math.floor(finite(raw.size, 0)));
    if (size <= 0) continue;
    if (!groups.has(store)) groups.set(store, []);
    groups.get(store).push({ store: store, key: key, size: size, updatedAt: finite(raw.updatedAt, 0) });
  }

  /* ② 決めた順に、古い物から積む */
  for (let g = 0; g < EVICTION_ORDER.length; g++) {
    const store = EVICTION_ORDER[g];
    const list = groups.get(store);
    if (!list || !list.length) continue;
    list.sort((a, b) => (a.updatedAt - b.updatedAt) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    let pool = list;
    if (store === STORES.projects && keepNewest > 0) {
      pool = keepNewest >= list.length ? [] : list.slice(0, list.length - keepNewest);
    }
    for (let i = 0; i < pool.length && out.freed < want; i++) {
      const e = pool[i];
      out.victims.push(e);
      out.freed += e.size;
      out.byStore[store] = (out.byStore[store] || 0) + 1;
    }
    if (out.freed >= want) break;
  }
  out.enough = out.freed >= want;
  return out;
}

/**
 * プロジェクトから「重い物」を外して JSON を小さく保つ（純関数）。
 * 今のところ外すのは `assets[].analysis`（解析結果。作り直せる・巨大）。
 * 元のオブジェクトは書き換えない。
 * @param {Object} project
 * @returns {{slim:Object|null, sidecars:Array<{key:string,assetId:string,data:any}>}}
 */
export function splitProject(project) {
  if (!project || typeof project !== "object") return { slim: null, sidecars: [] };
  const sidecars = [];
  const slim = {};
  for (const k in project) if (hasOwn(project, k)) slim[k] = project[k];
  if (Array.isArray(project.assets)) {
    slim.assets = project.assets.map((a) => {
      if (!a || typeof a !== "object") return a;
      const id = a.id === undefined || a.id === null ? "" : String(a.id);
      if (!id || !a.analysis) return a;
      const copy = {};
      for (const k in a) if (hasOwn(a, k)) copy[k] = a[k];
      copy.analysis = null;
      sidecars.push({ key: analysisKey(id), assetId: id, data: a.analysis });
      return copy;
    });
  }
  return { slim: slim, sidecars: sidecars };
}

/**
 * splitProject の逆（純関数）。sidecar が無い素材は analysis: null のままにする
 * （解析は作り直せる。無い物を無理に埋めない）。
 * @param {Object} slim
 * @param {Map|Object} sidecars キーは analysisKey(assetId)
 * @returns {Object|null}
 */
export function mergeProject(slim, sidecars) {
  if (!slim || typeof slim !== "object") return null;
  const map = sidecars instanceof Map ? sidecars
    : new Map(Object.keys(sidecars || {}).map((k) => [k, sidecars[k]]));
  const out = {};
  for (const k in slim) if (hasOwn(slim, k)) out[k] = slim[k];
  if (Array.isArray(slim.assets)) {
    out.assets = slim.assets.map((a) => {
      if (!a || typeof a !== "object") return a;
      const id = a.id === undefined || a.id === null ? "" : String(a.id);
      if (!id) return a;
      const k = analysisKey(id);
      if (!map.has(k)) return a;
      const copy = {};
      for (const kk in a) if (hasOwn(a, kk)) copy[kk] = a[kk];
      copy.analysis = map.get(k);
      return copy;
    });
  }
  return out;
}

/**
 * 一覧画面に出す分だけを取り出す（純関数）。JSON を毎回 parse しないよう
 * 保存時にこれを record へ焼き付ける。
 * @param {Object} project @returns {Object}
 */
export function projectSummary(project) {
  const p = project && typeof project === "object" ? project : {};
  const s = p.settings && typeof p.settings === "object" ? p.settings : {};
  const tracks = Array.isArray(p.tracks) ? p.tracks : [];
  let clipCount = 0, end = 0;
  for (let i = 0; i < tracks.length; i++) {
    const cl = tracks[i] && Array.isArray(tracks[i].clips) ? tracks[i].clips : [];
    clipCount += cl.length;
    for (let j = 0; j < cl.length; j++) {
      const e = finite(cl[j] && cl[j].start, 0) + finite(cl[j] && cl[j].duration, 0);
      if (e > end) end = e;
    }
  }
  return {
    id: String(p.id || ""), name: String(p.name || ""),
    createdAt: finite(p.createdAt, 0), updatedAt: finite(p.updatedAt, 0),
    schema: finite(p.schema, 0),
    width: finite(s.width, 0), height: finite(s.height, 0),
    fps: finite(s.fps, 0), ratio: String(s.ratio || ""),
    duration: Math.round(Math.max(0, end) * 1000) / 1000,   /* ms まで（1e-9 のゴミを出さない） */
    trackCount: tracks.length, clipCount: clipCount,
    assetCount: Array.isArray(p.assets) ? p.assets.length : 0
  };
}

/* ── 3. IndexedDB の土台 ─────────────────────────────────────── */

function specOf(store) {
  for (let i = 0; i < STORE_SPEC.length; i++) if (STORE_SPEC[i].name === store) return STORE_SPEC[i];
  return null;
}

/** onupgradeneeded: 無い store / index だけ作る（版を上げても中身は消さない） */
function upgrade(db, ev) {
  const tx = ev && ev.target ? ev.target.transaction : null;
  for (let i = 0; i < STORE_SPEC.length; i++) {
    const spec = STORE_SPEC[i];
    let os = null;
    if (!db.objectStoreNames.contains(spec.name)) {
      os = db.createObjectStore(spec.name, { keyPath: spec.keyPath });
    } else if (tx) {
      try { os = tx.objectStore(spec.name); } catch (_e) { os = null; }
    }
    if (!os) continue;
    for (let j = 0; j < spec.indexes.length; j++) {
      const ix = spec.indexes[j];
      if (os.indexNames.contains(ix[0])) continue;
      try { os.createIndex(ix[0], ix[1]); } catch (_e) { /* 既に在る／作れないだけ */ }
    }
  }
}

/** DB を開く（応答しない環境を OPEN_TIMEOUT_MS で見切る） */
function idbOpen(dbName, version) {
  return new Promise((resolve, reject) => {
    const idb = globalThis.indexedDB;
    if (!idb) { reject(new StorageError("IndexedDB が在りません")); return; }
    let req = null;
    try { req = version ? idb.open(dbName, version) : idb.open(dbName); }
    catch (e) { reject(new StorageError("IndexedDB を開けません", e)); return; }
    let done = false;
    const timer = unref(setTimeout(() => {
      if (done) return;
      done = true;
      reject(new StorageError("IndexedDB が応答しません"));
    }, OPEN_TIMEOUT_MS));
    req.onupgradeneeded = (ev) => {
      try { upgrade(req.result, ev); }
      catch (e) { error("persist", "store を作れません", e); }
    };
    req.onblocked = () => { warn("persist", "別のタブが古い版を掴んでいます"); };
    req.onsuccess = () => {
      if (done) { try { req.result.close(); } catch (_e) { /* noop */ } return; }
      done = true; clearTimeout(timer); resolve(req.result);
    };
    req.onerror = () => {
      if (done) return;
      done = true; clearTimeout(timer);
      reject(new StorageError("IndexedDB を開けません", req.error));
    };
  });
}

/** IndexedDB 版の低層（get/put/del/list だけ。上の層はこの 4 つしか知らない） */
function idbBackend(db) {
  const has = (s) => { try { return db.objectStoreNames.contains(s); } catch (_e) { return false; } };
  const req = (r) => new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error || new StorageError("IndexedDB の要求が失敗しました"));
  });
  const txDone = (t) => new Promise((res, rej) => {
    t.oncomplete = () => res(true);
    t.onabort = () => rej(t.error || new StorageError("書き込みが中止されました"));
    t.onerror = () => rej(t.error || new StorageError("書き込みが失敗しました"));
  });
  /** 書き込みは「本体 + 台帳」を 1 つのトランザクションで（片方だけ残さない） */
  async function write(store, fn) {
    const names = store === STORES.meta ? [STORES.meta] : [store, STORES.meta];
    const usable = names.filter(has);
    if (usable.indexOf(store) < 0) throw new StorageError("store が在りません: " + store);
    const t = db.transaction(usable, "readwrite");
    const done = txDone(t);
    let first = null;
    try {
      fn((s) => t.objectStore(s), (r) => { r.onerror = () => { if (!first) first = r.error; }; });
    } catch (e) {
      try { t.abort(); } catch (_e) { /* noop */ }
      throw e;
    }
    try { await done; } catch (e) { throw first || e; }   /* 溢れた原因は要求側に出る */
    return true;
  }
  return {
    kind: "idb", volatile: false,
    async get(store, key) {
      if (!has(store)) return null;
      const t = db.transaction(store, "readonly");
      const r = await req(t.objectStore(store).get(key));
      return r === undefined ? null : r;
    },
    put(store, rec, ledger) {
      return write(store, (os, watch) => {
        watch(os(store).put(rec));
        if (ledger && has(STORES.meta)) watch(os(STORES.meta).put(ledger));
      });
    },
    async del(store, key, ledgerName) {
      if (!has(store)) return false;
      return write(store, (os, watch) => {
        watch(os(store).delete(key));
        if (ledgerName && has(STORES.meta)) watch(os(STORES.meta).delete(ledgerName));
      });
    },
    async list(store, opts) {
      const o = opts || {};
      if (!has(store)) return [];
      const t = db.transaction(store, "readonly");
      const os = t.objectStore(store);
      const src = o.index && os.indexNames.contains(o.index) ? os.index(o.index) : os;
      let range = null;
      if (o.prefix) {
        try { range = IDBKeyRange.bound(o.prefix, o.prefix + "￿"); } catch (_e) { range = null; }
      }
      const out = [];
      await new Promise((res, rej) => {
        let r = null;
        try { r = src.openCursor(range, o.dir === "prev" ? "prev" : "next"); }
        catch (e) { rej(e); return; }
        r.onsuccess = () => {
          const c = r.result;
          if (!c) { res(true); return; }
          out.push(c.value);
          if (o.limit && out.length >= o.limit) { res(true); return; }
          c.continue();
        };
        r.onerror = () => rej(r.error);
      });
      return out;
    },
    close() { try { db.close(); } catch (_e) { /* noop */ } }
  };
}

/** Map 版の低層（IndexedDB が使えない環境。閉じたら消える） */
function memoryBackend() {
  const mem = new Map();
  for (let i = 0; i < STORE_NAMES.length; i++) mem.set(STORE_NAMES[i], new Map());
  const of = (s) => mem.get(s) || null;
  return {
    kind: "memory", volatile: true,
    async get(store, key) {
      const m = of(store);
      const v = m ? m.get(String(key)) : undefined;
      return v === undefined ? null : v;
    },
    async put(store, rec, ledger) {
      const spec = specOf(store);
      const m = of(store);
      if (!m || !spec) throw new StorageError("store が在りません: " + store);
      m.set(String(rec[spec.keyPath]), rec);
      if (ledger) { const mm = of(STORES.meta); if (mm) mm.set(String(ledger.key), ledger); }
      return true;
    },
    async del(store, key, ledgerName) {
      const m = of(store);
      if (m) m.delete(String(key));
      if (ledgerName) { const mm = of(STORES.meta); if (mm) mm.delete(String(ledgerName)); }
      return true;
    },
    async list(store, opts) {
      const o = opts || {};
      const m = of(store);
      if (!m) return [];
      let out = Array.from(m.values());
      if (o.prefix) {
        const spec = specOf(store);
        const kp = spec ? spec.keyPath : "key";
        out = out.filter((r) => String(r && r[kp]).indexOf(o.prefix) === 0);
      }
      if (o.index) out.sort((a, b) => finite(a && a[o.index], 0) - finite(b && b[o.index], 0));
      if (o.dir === "prev") out.reverse();
      if (o.limit) out = out.slice(0, o.limit);
      return out;
    },
    close() { mem.forEach((m) => m.clear()); }
  };
}

/* ── 4. OPFS（在れば大きい素材をこちらへ） ───────────────────── */

async function openOpfs() {
  try {
    const nav = globalThis.navigator;
    if (!nav || !nav.storage || typeof nav.storage.getDirectory !== "function") return null;
    const root = await nav.storage.getDirectory();
    return await root.getDirectoryHandle(OPFS_DIR, { create: true });
  } catch (_e) { return null; }   /* プライベートモード等。黙って IndexedDB で行く */
}

async function opfsWrite(dir, name, blob) {
  if (!dir) return false;
  try {
    const fh = await dir.getFileHandle(name, { create: true });
    if (typeof fh.createWritable !== "function") return false;
    const w = await fh.createWritable();
    await w.write(blob);
    await w.close();
    return true;
  } catch (e) { warn("persist", "OPFS に書けません", e); return false; }
}

async function opfsRead(dir, name) {
  if (!dir) return null;
  try {
    const fh = await dir.getFileHandle(name);
    return await fh.getFile();
  } catch (_e) { return null; }
}

async function opfsDelete(dir, name) {
  if (!dir || !name) return false;
  try { await dir.removeEntry(name); return true; } catch (_e) { return false; }
}

/* ── 5. 保存庫を開く ─────────────────────────────────────────── */

/**
 * 保存庫を開く（契約書 §3）。**失敗しても throw しない**。
 * IndexedDB が駄目なら揮発（Map）に落ち、`volatile: true` で申告する。
 * @param {{dbName?:string, version?:number, memory?:boolean}} [opts]
 * @returns {Promise<Object>} Storage
 */
export async function openStorage(opts) {
  const o = opts && typeof opts === "object" ? opts : {};
  const dbName = typeof o.dbName === "string" && o.dbName ? o.dbName : DB_NAME;
  const version = Math.max(1, Math.floor(finite(o.version, DB_VERSION)));

  let backend = null;
  if (!o.memory && globalThis.indexedDB) {
    try { backend = idbBackend(await idbOpen(dbName, version)); }
    catch (e) {
      /* 既存 DB の方が新しい（別のタブで新版を開いた）ときは版を指定せず開き直す */
      const cause = e && e.cause ? e.cause : null;
      if (cause && String(cause.name) === "VersionError") {
        try { backend = idbBackend(await idbOpen(dbName, 0)); } catch (_e2) { /* 下で揮発に落ちる */ }
      }
      if (!backend) warn("persist", "IndexedDB が使えないので揮発に落ちます", e);
    }
  }
  if (!backend) backend = memoryBackend();
  const opfsDir = backend.kind === "idb" ? await openOpfs() : null;

  let alive = true;
  /** objectURL の貸し出し表: slot -> { url, refs, timer, pinned } */
  const urls = new Map();
  /** 捨ててはいけないプロジェクト（最近保存・読み込みした物＝今開いている物） */
  const keepIds = new Set();

  const ledgerOf = (store, key, size, updatedAt) => ({
    key: ledgerKey(store, key), store: store, ref: String(key),
    size: Math.max(0, Math.floor(finite(size, 0))),
    updatedAt: finite(updatedAt, nowMs())
  });
  const reasonOf = (e) => (e && e.reason) ? String(e.reason)
    : isQuotaError(e) ? "端末の保存領域が足りません"
      : String((e && e.message) || e || "不明な失敗");

  async function getRec(store, key) {
    const k = String(key === undefined || key === null ? "" : key);
    if (!alive || !k) return null;
    try { return await backend.get(store, k); }
    catch (e) { warn("persist", "読めません " + store + "/" + k, e); return null; }
  }

  /* ── 溢れたときの始末（捨てて 1 回だけ再試行） ───────────────── */
  async function evictionEntries() {
    const out = [];
    try {
      const led = await backend.list(STORES.meta, { prefix: LEDGER_PREFIX });
      for (let i = 0; i < led.length; i++) {
        const p = parseLedgerKey(led[i] && led[i].key);
        if (!p) continue;
        out.push({
          store: p.store, key: String(led[i].ref || p.key),
          size: finite(led[i].size, 0), updatedAt: finite(led[i].updatedAt, 0)
        });
      }
    } catch (e) { warn("persist", "台帳が読めません", e); }
    /* 台帳が無い（古い版で作られた）プロジェクトも候補に入れる。JSON は小さいので安い */
    try {
      const prj = await backend.list(STORES.projects, { index: "updatedAt" });
      for (let i = 0; i < prj.length; i++) {
        out.push({
          store: STORES.projects, key: String(prj[i].id),
          size: finite(prj[i].bytes, 0), updatedAt: finite(prj[i].updatedAt, 0)
        });
      }
    } catch (_e) { /* 無ければ台帳の分だけで選ぶ */ }
    return out;
  }

  async function applyEviction(plan) {
    for (let i = 0; i < plan.victims.length; i++) {
      const v = plan.victims[i];
      try {
        if (v.store === STORES.projects) await deleteProject(v.key);
        else {
          dropURL(v.store + ":" + v.key);
          await backend.del(v.store, v.key, ledgerKey(v.store, v.key));
        }
      } catch (e) { warn("persist", "捨てられません " + v.store + "/" + v.key, e); }
    }
    warn("persist", "容量が足りないので " + plan.victims.length + " 件捨てました", plan.byStore);
  }

  /** 書き込み → 溢れたら捨てて 1 回だけ再試行 */
  async function writeWithEviction(run, need) {
    try { return await run(); }
    catch (e) {
      if (!isQuotaError(e)) throw e;
      let plan = null;
      try { plan = planEviction(await evictionEntries(), need, { keep: Array.from(keepIds) }); }
      catch (e2) { warn("persist", "捨てる物を選べません", e2); }
      if (!plan || !plan.victims.length) throw e;
      await applyEviction(plan);
      return await run();
    }
  }

  /* ── objectURL の貸し出し（参照数 + 30 秒の猶予） ─────────────── */
  function makeURL(blob) {
    try {
      const U = globalThis.URL;
      if (!U || typeof U.createObjectURL !== "function") return "";
      return U.createObjectURL(blob);
    } catch (e) { warn("persist", "objectURL を作れません", e); return ""; }
  }
  function revokeURL(url) {
    try {
      const U = globalThis.URL;
      if (U && typeof U.revokeObjectURL === "function") U.revokeObjectURL(url);
    } catch (_e) { /* noop */ }
  }
  /** 今すぐ捨てる（record を消した／作り直したときだけ） */
  function dropURL(slot) {
    const rec = urls.get(slot);
    if (!rec) return;
    if (rec.timer) clearTimeout(rec.timer);
    urls.delete(slot);
    revokeURL(rec.url);
  }
  async function leaseURL(slot, load, pinned) {
    if (!alive) return "";
    const had = urls.get(slot);
    if (had) {
      had.refs++;
      if (had.timer) { clearTimeout(had.timer); had.timer = 0; }
      return had.url;
    }
    const blob = await load();
    if (!blob) return "";
    const again = urls.get(slot);          /* 待っている間に誰かが作っていたらそれに乗る */
    if (again) {
      again.refs++;
      if (again.timer) { clearTimeout(again.timer); again.timer = 0; }
      return again.url;
    }
    const url = makeURL(blob);
    if (!url) return "";
    if (!alive) { revokeURL(url); return ""; }
    urls.set(slot, { url: url, refs: 1, timer: 0, pinned: !!pinned });
    return url;
  }
  function releaseSlot(slot) {
    const rec = urls.get(slot);
    if (!rec) return;
    rec.refs = Math.max(0, rec.refs - 1);
    if (rec.refs > 0 || rec.pinned) return;
    if (rec.timer) clearTimeout(rec.timer);
    /* 0 になっても即 revoke しない。再生中に消えると映像が落ちる（契約書 §3） */
    rec.timer = unref(setTimeout(() => {
      const cur = urls.get(slot);
      if (!cur || cur.refs > 0) return;
      urls.delete(slot);
      revokeURL(cur.url);
    }, URL_GRACE_MS));
  }

  /* ── 素材 ───────────────────────────────────────────────────── */
  /**
   * 素材をそのまま（再エンコードせず）保存する。
   * 同じ size + name + lastModified の物が既に在れば書かずに key を返す（dedup:true）。
   * @param {Blob|File} file @param {Object} [meta] {name,mime,kind,lastModified}
   * @returns {Promise<{ok:boolean,key:string|null,size:number,reason?:string,dedup?:boolean}>}
   */
  async function putAsset(file, meta) {
    if (!alive) return { ok: false, key: null, size: 0, reason: "保存庫は閉じています" };
    const m = meta && typeof meta === "object" ? meta : {};
    if (!file || typeof file !== "object" || typeof file.size !== "number") {
      return { ok: false, key: null, size: 0, reason: "素材が Blob ではありません" };
    }
    const size = Math.max(0, Math.floor(finite(file.size, 0)));
    const name = String(m.name || file.name || "");
    const mime = String(m.mime || file.type || "");
    const fp = assetFingerprint(file) ||
      assetFingerprint({ name: name, size: size, lastModified: m.lastModified });
    const key = fp ? assetKey(fp) : newAssetKey();

    if (fp) {
      const found = await getRec(STORES.assets, key);
      if (found) {
        return {
          ok: true, key: key, size: finite(found.size, size), mime: String(found.mime || mime),
          name: String(found.name || name), fingerprint: fp, dedup: true,
          storage: { kind: found.opfs ? "opfs" : "idb", key: key }
        };
      }
    }

    const rec = {
      key: key, name: name, mime: mime, size: size, fingerprint: fp || null,
      kind: String(m.kind || ""), updatedAt: nowMs(), blob: null, opfs: null
    };
    /* 巨大 blob を IndexedDB に入れると iOS が転ぶ（契約書 §13.3）。OPFS が在ればそちらへ */
    if (opfsDir && size >= OPFS_MIN_BYTES) {
      const fn = safeFileName(key);
      if (await opfsWrite(opfsDir, fn, file)) rec.opfs = fn;
    }
    if (!rec.opfs) rec.blob = file;

    try {
      await writeWithEviction(() => backend.put(STORES.assets, rec, null), requiredFreeBytes(size));
    } catch (e) {
      if (rec.opfs) await opfsDelete(opfsDir, rec.opfs);
      error("persist", "素材を保存できません", e);
      return { ok: false, key: null, size: size, reason: reasonOf(e) };
    }
    return {
      ok: true, key: key, size: size, mime: mime, name: name,
      fingerprint: fp || null, dedup: false,
      storage: { kind: rec.opfs ? "opfs" : "idb", key: key }
    };
  }

  /** @returns {Promise<Blob|null>} 無い／読めない → null（throw しない） */
  async function getAssetBlob(key) {
    const rec = await getRec(STORES.assets, key);
    if (!rec) return null;
    if (rec.opfs) {
      const f = await opfsRead(opfsDir, rec.opfs);
      if (f) return f;
      warn("persist", "OPFS の実体が見つかりません " + rec.opfs);
      return null;
    }
    return rec.blob || null;
  }

  /** objectURL を借りる（参照数 +1）。取れなければ ""（throw しない） */
  function getAssetURL(key) {
    const k = String(key === undefined || key === null ? "" : key);
    if (!k) return Promise.resolve("");
    return leaseURL(STORES.assets + ":" + k, () => getAssetBlob(k), false);
  }
  /** 借りた objectURL を返す（参照数 -1。0 でも 30 秒は残る） */
  function releaseAssetURL(key) { releaseSlot(STORES.assets + ":" + String(key)); }

  async function deleteAsset(key) {
    const k = String(key || "");
    if (!k) return { ok: false, reason: "key が空です" };
    const rec = await getRec(STORES.assets, k);
    dropURL(STORES.assets + ":" + k);
    if (rec && rec.opfs) await opfsDelete(opfsDir, rec.opfs);
    try { await backend.del(STORES.assets, k, null); }
    catch (e) { return { ok: false, reason: reasonOf(e) }; }
    return { ok: true, key: k };
  }

  /* ── プロジェクト ───────────────────────────────────────────── */
  /**
   * プロジェクトを保存する。**失敗すると throw する**
   * （自動保存が「保存済み」と嘘を出さないため。CONTRACT-NOTE: 契約書 §3 の
   *  「{ok:false} を返すか throw を明示」のうち throw 側を選んだ）。
   * @param {Object} project @returns {Promise<{ok:true,id:string,bytes:number}>}
   */
  async function putProject(project) {
    if (!alive) throw new StorageError("保存庫は閉じています");
    if (!project || typeof project !== "object" || !project.id) {
      throw new StorageError("プロジェクトに id が在りません");
    }
    const id = String(project.id);
    const split = splitProject(project);
    let json = "";
    try { json = JSON.stringify(split.slim); }
    catch (e) { throw new StorageError("プロジェクトを JSON にできません", e); }
    const bytes = utf8Size(json);
    const updatedAt = finite(project.updatedAt, 0) || nowMs();
    const rec = {
      id: id, json: json, bytes: bytes, updatedAt: updatedAt,
      name: String(project.name || ""), createdAt: finite(project.createdAt, updatedAt),
      schema: finite(project.schema, 0),
      summary: projectSummary(project), sidecars: split.sidecars.map((s) => s.key)
    };
    keepIds.add(id);
    try {
      await writeWithEviction(
        () => backend.put(STORES.projects, rec, ledgerOf(STORES.projects, id, bytes, updatedAt)),
        requiredFreeBytes(bytes)
      );
    } catch (e) {
      error("persist", "プロジェクトを保存できません", e);
      throw new StorageError("プロジェクトを保存できません: " + reasonOf(e), e);
    }
    /* 解析結果は別 record（失敗しても編集は続く。作り直せる物なので warn だけ） */
    for (let i = 0; i < split.sidecars.length; i++) {
      const s = split.sidecars[i];
      try { await backend.put(STORES.meta, { key: s.key, value: s.data, updatedAt: updatedAt }, null); }
      catch (e) { warn("persist", "解析結果を保存できません " + s.key, e); }
    }
    return { ok: true, id: id, bytes: bytes, volatile: !!backend.volatile };
  }

  /** @returns {Promise<Object|null>} 見つからない／壊れている → null */
  async function loadProject(id) {
    const rec = await getRec(STORES.projects, id);
    if (!rec) return null;
    let slim = null;
    if (typeof rec.json === "string") {
      try { slim = JSON.parse(rec.json); }
      catch (e) { error("persist", "プロジェクトの JSON が壊れています " + id, e); return null; }
    } else if (rec.project && typeof rec.project === "object") {
      slim = rec.project;               /* 古い版が残していた形 */
    }
    if (!slim) return null;
    const map = new Map();
    const assets = Array.isArray(slim.assets) ? slim.assets : [];
    for (let i = 0; i < assets.length; i++) {
      const aid = assets[i] && assets[i].id ? String(assets[i].id) : "";
      if (!aid) continue;
      const got = await getRec(STORES.meta, analysisKey(aid));
      if (got && got.value) map.set(analysisKey(aid), got.value);
    }
    keepIds.add(String(id));
    return mergeProject(slim, map);
  }

  /**
   * 新しい順の一覧。**中身は projectSummary + bytes の要約**（一覧画面はこれで足りる。
   * 全部の JSON を parse すると iOS で固まる）。丸ごと要るときは loadProject を呼ぶ。
   * @returns {Promise<Array<Object>>}
   */
  async function listProjects() {
    if (!alive) return [];
    let recs = [];
    try { recs = await backend.list(STORES.projects, { index: "updatedAt", dir: "prev" }); }
    catch (e) { warn("persist", "一覧が読めません", e); return []; }
    const out = recs.map((r) => {
      const s = r && r.summary && typeof r.summary === "object" ? r.summary : null;
      const base = s ? Object.assign({}, s) : { id: String(r.id), name: String(r.name || ""), duration: 0 };
      base.id = String(r.id);
      base.updatedAt = finite(r.updatedAt, finite(base.updatedAt, 0));
      base.createdAt = finite(r.createdAt, finite(base.createdAt, 0));
      base.bytes = finite(r.bytes, 0);
      return base;
    });
    out.sort((a, b) => b.updatedAt - a.updatedAt);
    return out;
  }

  async function deleteProject(id) {
    const pid = String(id || "");
    if (!pid) return { ok: false, reason: "id が空です" };
    const rec = await getRec(STORES.projects, pid);
    /* 解析結果の置き忘れを掃除する（record に残した一覧を使い、無ければ JSON から拾う） */
    let side = rec && Array.isArray(rec.sidecars) ? rec.sidecars.slice() : [];
    if (!side.length && rec && typeof rec.json === "string") {
      try {
        const slim = JSON.parse(rec.json);
        const assets = Array.isArray(slim.assets) ? slim.assets : [];
        side = assets.filter((a) => a && a.id).map((a) => analysisKey(String(a.id)));
      } catch (_e) { side = []; }
    }
    try { await backend.del(STORES.projects, pid, ledgerKey(STORES.projects, pid)); }
    catch (e) { return { ok: false, reason: reasonOf(e) }; }
    for (let i = 0; i < side.length; i++) {
      try { await backend.del(STORES.meta, side[i], null); } catch (_e) { /* 残っても害は無い */ }
    }
    keepIds.delete(pid);
    return { ok: true, id: pid };
  }

  /**
   * exportProject（契約書 §11.6 の .vqstudio）が要る物を一度に集める。
   * blob も一緒に返すので、呼ぶ側は使い終わったら参照を捨てること。
   * @returns {Promise<{ok:boolean,project:Object|null,assets:Array,missing:Array,totalBytes:number,reason?:string}>}
   */
  async function getAllForExport(projectId) {
    const project = await loadProject(projectId);
    if (!project) {
      return { ok: false, reason: "プロジェクトが見つかりません", project: null, assets: [], missing: [], totalBytes: 0 };
    }
    const assets = [], missing = [];
    const list = Array.isArray(project.assets) ? project.assets : [];
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      const key = a && a.storage && a.storage.key ? String(a.storage.key) : "";
      if (!key) { missing.push({ id: a && a.id ? String(a.id) : "", key: "", reason: "storage.key が無い" }); continue; }
      const blob = await getAssetBlob(key);
      if (!blob) { missing.push({ id: String(a.id || ""), key: key, reason: "実体が見つからない" }); continue; }
      assets.push({
        id: String(a.id || ""), key: key, name: String(a.name || ""),
        mime: String(a.mime || blob.type || ""), size: Math.max(0, finite(blob.size, 0)), blob: blob
      });
    }
    let total = 0;
    for (let i = 0; i < assets.length; i++) total += assets[i].size;
    return { ok: true, project: project, assets: assets, missing: missing, totalBytes: total };
  }

  /* ── プロキシ / サムネ / ピーク ─────────────────────────────── */
  async function putBlobLike(store, id, value, extra) {
    if (!alive) return { ok: false, reason: "保存庫は閉じています" };
    const key = String(id || "");
    if (!key) return { ok: false, reason: "assetId が空です" };
    if (!value) return { ok: false, reason: "中身が空です" };
    const size = roughByteSize(value);
    const updatedAt = nowMs();
    const rec = Object.assign({ id: key, blob: value, size: size, updatedAt: updatedAt }, extra || {});
    try {
      await writeWithEviction(
        () => backend.put(store, rec, ledgerOf(store, key, size, updatedAt)),
        requiredFreeBytes(size)
      );
    } catch (e) {
      warn("persist", store + " を保存できません " + key, e);
      return { ok: false, reason: reasonOf(e) };
    }
    dropURL(store + ":" + key);        /* 作り直したので古い URL は捨てる */
    return { ok: true, id: key, size: size };
  }

  const putProxy = (assetId, blob) =>
    putBlobLike(STORES.proxies, assetId, blob, { mime: String((blob && blob.type) || "") });

  async function getProxyBlob(assetId) {
    const rec = await getRec(STORES.proxies, assetId);
    return rec && rec.blob ? rec.blob : null;
  }
  /**
   * プロキシの objectURL。**呼ぶ側は返さない**（filmstrip / sources は release しない）ので
   * pinned で貸し、dispose() までこちらが持つ。無ければ ""。
   */
  function getProxyURL(assetId) {
    const k = String(assetId || "");
    if (!k) return Promise.resolve("");
    return leaseURL(STORES.proxies + ":" + k, () => getProxyBlob(k), true);
  }

  const putThumbSheet = (assetId, value) => putBlobLike(STORES.thumbs, assetId, value, null);

  /** @returns {Promise<Blob|Array|null>} 契約書どおり Blob と ImageBitmap[] の両方を通す */
  async function getThumbSheet(assetId) {
    const rec = await getRec(STORES.thumbs, assetId);
    if (!rec) return null;
    return rec.blob === undefined || rec.blob === null ? null : rec.blob;
  }

  /**
   * 波形のピーク。**ArrayBuffer で保存する**（Float32Array のまま入れると
   * 環境によって型が落ち、読み戻した側が普通の Array を掴んで壊れる）。
   */
  async function putPeaks(assetId, data) {
    if (!alive) return { ok: false, reason: "保存庫は閉じています" };
    const key = String(assetId || "");
    if (!key) return { ok: false, reason: "assetId が空です" };
    let arr = null;
    if (data instanceof Float32Array) arr = data;
    else if (data && typeof data.length === "number") {
      try { arr = new Float32Array(data); } catch (_e) { arr = null; }
    }
    if (!arr) return { ok: false, reason: "peaks が Float32Array ではありません" };
    const copy = arr.slice();                       /* 呼ぶ側が後で書き換えても平気なように */
    const buf = copy.buffer;
    const updatedAt = nowMs();
    const rec = {
      id: key, buf: buf, length: copy.length, size: buf.byteLength, updatedAt: updatedAt,
      bucket: finite(arr.vqBucket, 0), sampleRate: finite(arr.vqSampleRate, 0),
      duration: finite(arr.vqDuration, 0)
    };
    try {
      await writeWithEviction(() => backend.put(STORES.peaks, rec, null), requiredFreeBytes(buf.byteLength));
    } catch (e) {
      warn("persist", "peaks を保存できません " + key, e);
      return { ok: false, reason: reasonOf(e) };
    }
    return { ok: true, id: key, length: copy.length, size: buf.byteLength };
  }

  /** @returns {Promise<Float32Array|null>} 型を必ず Float32Array に戻す */
  async function getPeaks(assetId) {
    const rec = await getRec(STORES.peaks, assetId);
    if (!rec) return null;
    let out = null;
    try {
      if (rec.buf instanceof ArrayBuffer) out = new Float32Array(rec.buf);
      else if (rec.buf && typeof rec.buf.byteLength === "number") out = new Float32Array(rec.buf.buffer || rec.buf);
      else if (rec.data && typeof rec.data.length === "number") out = new Float32Array(rec.data);
    } catch (e) { warn("persist", "peaks を戻せません " + assetId, e); return null; }
    if (!out || !out.length) return null;
    try {
      out.vqBucket = finite(rec.bucket, 0);
      out.vqSampleRate = finite(rec.sampleRate, 0);
      out.vqDuration = finite(rec.duration, 0);
    } catch (_e) { /* 属性が付かない環境。値だけで十分 */ }
    return out;
  }

  /* ── 容量 ───────────────────────────────────────────────────── */
  /** @returns {Promise<Object|null>} 分からない環境では null（契約書 §3） */
  async function estimate() {
    const nav = globalThis.navigator;
    if (!nav || !nav.storage || typeof nav.storage.estimate !== "function") return null;
    try { return summarizeEstimate(await nav.storage.estimate()); }
    catch (e) { warn("persist", "容量が分かりません", e); return null; }
  }

  /** @returns {Promise<boolean>} */
  async function requestPersist() {
    const nav = globalThis.navigator;
    if (!nav || !nav.storage || typeof nav.storage.persist !== "function") return false;
    try {
      if (typeof nav.storage.persisted === "function" && await nav.storage.persisted()) return true;
      return !!(await nav.storage.persist());
    } catch (e) { warn("persist", "persist を頼めません", e); return false; }
  }

  /** 先に空ける（書き出しや取り込みの前）。planEviction の結果をそのまま実行する */
  async function evict(need) {
    const plan = planEviction(await evictionEntries(), need, { keep: Array.from(keepIds) });
    if (plan.victims.length) await applyEviction(plan);
    return plan;
  }

  const getMeta = async (key) => { const r = await getRec(STORES.meta, key); return r ? r.value : null; };
  async function putMeta(key, value) {
    const k = String(key || "");
    if (!k) return { ok: false, reason: "key が空です" };
    if (k.indexOf(LEDGER_PREFIX) === 0) return { ok: false, reason: "台帳の名前は使えません" };
    try { await backend.put(STORES.meta, { key: k, value: value, updatedAt: nowMs() }, null); }
    catch (e) { return { ok: false, reason: reasonOf(e) }; }
    return { ok: true, key: k };
  }

  /** 全部返す（objectURL・タイマー・DB）。画面を離れるときに必ず呼ぶ */
  function dispose() {
    alive = false;
    urls.forEach((rec) => { if (rec.timer) clearTimeout(rec.timer); revokeURL(rec.url); });
    urls.clear();
    keepIds.clear();
    try { backend.close(); } catch (_e) { /* noop */ }
  }

  return {
    /* 素性（呼ぶ側が「消えるかも」を出せるように） */
    dbName: dbName, version: version, backend: backend.kind,
    volatile: !!backend.volatile, opfs: !!opfsDir,
    get alive() { return alive; },
    /* 素材 */
    putAsset, getAssetBlob, getAssetURL, releaseAssetURL, deleteAsset,
    /* プロジェクト */
    putProject, loadProject, listProjects, deleteProject, getAllForExport,
    /* 付随物 */
    putProxy, getProxyBlob, getProxyURL, putThumbSheet, getThumbSheet, putPeaks, getPeaks,
    /* 容量と後片付け */
    estimate, requestPersist, evict, getMeta, putMeta, dispose
  };
}
