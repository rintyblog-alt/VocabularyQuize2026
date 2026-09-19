/* ══════════════════════════════════════════════════════════════════════
   export/mux/mp4.js — 自前の MP4（ISOBMFF）muxer。外部依存ゼロ

   ★ 何をする所か
     契約書 §5 / §11 の `precise` 書き出しの出口。WebCodecs の
     `VideoEncoder` / `AudioEncoder` が吐く EncodedChunk を受けて、
     iPhone（Safari / QuickTime / 写真アプリ / 共有シート）で再生できる
     .mp4 のバイト列を組む。

   ★ なぜ fragmented MP4（fMP4）なのか
     出来上がりは **ftyp + moov(空の trak + mvex) + [moof + mdat]×n**。
     ・非フラグメント（moov に stts/stsz/stco を持つ普通の mp4）は、
       全サンプルの「長さ・大きさ・ファイル内位置」が確定してからでないと
       moov を書けない。つまり **全フレームをメモリに溜める**必要がある。
       1080p 数分でも数百 MB になり、iPhone Safari では確実に落ちる。
     ・fMP4 なら 1 秒ごとに moof+mdat を書き出して捨てられる（`onData`）。
       Safari / Chrome / QuickTime / 写真アプリは fMP4 をそのまま再生できる。
     ・よって v1 は fMP4 固定。非フラグメント方式は採らない（将来 stbl を
       組む物を足すとしても、この muxer とは別の関数にする）。

   ★ 再生できる / できないの境目（ここを間違えると黒画面になる）
     ・`avcC`（AVCDecoderConfigurationRecord）は `VideoEncoder` の
       `metadata.decoderConfig.description` を **そのまま** 使う。
       これが無い（= Annex-B がそのまま来る）実装のために、SPS/PPS を
       切り出して avcC を組み、サンプル本体を Annex-B → 4 バイト長接頭に
       変換する道も持つ。avcC の長さフィールドは 4 バイト固定
       （lengthSizeMinusOne = 3）なので、変換側も必ず 4 バイトで書く。
     ・**Annex-B と長さ接頭の見分けは `isAnnexB` だけでは付かない**。
       長さ 256〜511 の NAL の長さ接頭は `00 00 01 xx` で、3 バイトの
       スタートコードと 1 バイトも違わない。`looksAnnexB()` で
       「長さで歩き切れる物は Annex-B ではない」を先に見る（ここを
       間違えると全サンプルが 0 バイトになる。§3 の CONTRACT-NOTE を見る）。
     ・`tfdt`（baseMediaDecodeTime）を必ず入れる。これが無いと Safari は
       2 つ目以降の fragment の時刻を 0 と解釈して音がずれる。
     ・timescale は 映像 = fps×1000（30fps なら 30000）、音声 = sampleRate。
       こうすると 1 フレーム = ちょうど 1000、AAC 1 フレーム = ちょうど 1024
       になり、丸め誤差が積もらない。
     ・キーフレームは `sample_depends_on=2` / `is_non_sync=0`、
       それ以外は `sample_depends_on=1` / `is_non_sync=1`。ここを全部
       「同期」にすると シークが壊れる（どこへ飛んでも緑になる）。
     ・`trun` の `data_offset` は moof 先頭からの相対（tfhd に
       default-base-is-moof を立てているため）。moof の長さが分からないと
       決まらないので **2 回組んで長さを測ってから確定**する。

   ★ 触るときの注意
     ・`finalize()` / `finalizeBytes()` の時に moov の duration を実測値へ
       書き直し、末尾に `mfra`（ランダムアクセス表）を足す。**`onData` で
       流れていくバイト列にはこの後始末が載らない**（moov は既に出て
       しまっている）。シーク可能な 1 本が欲しい所は `finalizeBytes()` を
       使うこと。`onData` は「書きながら別の所へ流したい」用。
       **v1 では `onData` を渡してもメモリは減らない**（finalizeBytes で
       moov を差し替えられるように破片は抱えたまま）。真に捨てるには
       「finalize を諦める streaming 版」が要る。未実装の穴として挙げる。
     ・`finalize()` は破片の配列をそのまま `Blob` へ渡す（1 本の
       Uint8Array に繋がない）。繋ぐと同じ中身が一時的に 2 重に載り、
       4K 数分で iPhone Safari が落ちる。
     ・box の size は u32。1 つの box が 4GiB を超えたら throw する
       （largesize は使わない。1 秒 fragment なら届かない）。
     ・Node の試験から呼ばれる。DOM も Blob も無い前提で動く所と、
       `finalize()`（Blob を作る）だけを分けている。
     ・例外は握りつぶさない。復帰できる物（音声 codec が読めない等）は
       warn を出して音声を落とし、映像だけは必ず出す。

   ★ CONTRACT-NOTE: 1 ファイル 700 行の目安を超えている（約 1000 行）
     ISOBMFF は「原料（u8…str4/box/fullBox）→ 各 box → muxer」の 3 段が
     全部繋がっていて、切ると片方だけでは何も組めない。分けるなら
     `export/mux/isobmff.js`（原料 + box）と `export/mux/mp4.js`（muxer）
     だが、**担当ファイル以外を作らない**という取り決めがあるため
     v1 では 1 ファイルに置く。§1〜§7 の区切りはそのまま分割線になる。
   ══════════════════════════════════════════════════════════════════════ */

import { warn } from "../../core/log.js";

const TAG = "mux/mp4";

/** 映画全体の timescale（mvhd / tkhd の duration の単位） */
export const MOVIE_TIMESCALE = 1000;
/** fragment の狙いの長さ（秒）。キーフレーム境界を優先して切る */
const FRAGMENT_SEC = 1;
/** キーフレームが来なくてもここまで来たら切る（秒） */
const FRAGMENT_MAX_SEC = 4;
/** 音声を待つ上限（秒）。これを超えたら音声を諦めて映像だけ出す */
const HEAD_WAIT_SEC = 8;

/** キーフレーム（同期サンプル）の sample_flags */
export const SAMPLE_FLAGS_SYNC = 0x02000000;
/** 非キーフレームの sample_flags（depends_on=1 / non_sync=1） */
export const SAMPLE_FLAGS_DELTA = 0x01010000;

/** 映像 codec → 設定 box の型 */
const VIDEO_CONFIG_BOX = {
  avc1: "avcC", avc3: "avcC", hvc1: "hvcC", hev1: "hvcC",
  av01: "av1C", vp09: "vpcC", vp08: "vpcC",
};
/** 設定 box が無いと再生できない codec（vp8/vp9 は無くても読める実装が在る） */
const CONFIG_REQUIRED = { avcC: true, hvcC: true, av1C: true, vpcC: false };

/** 単位行列（tkhd / mvhd の matrix。回転は掛けない） */
const UNITY_MATRIX = [0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000];
/** ISO 639-2/T の "und"（未定）を 5bit×3 に詰めた値 */
const LANG_UND = 0x55c4;

/* ── 1. 数とバイト列の原料 ─────────────────────────────────── */

function toBytes(v) {
  if (v == null) return null;
  if (v instanceof Uint8Array) return v;
  if (ArrayBuffer.isView(v)) return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  return null;
}

function flatten(parts, out) {
  for (const p of parts) {
    if (p == null) continue;
    if (Array.isArray(p)) { flatten(p, out); continue; }
    const b = toBytes(p);
    if (!b) throw new TypeError(`box に入れられない部品です（${typeof p}）`);
    out.push(b);
  }
  return out;
}

/** 部品（Uint8Array / 入れ子の配列）を 1 本の Uint8Array に繋ぐ */
export function cat(...parts) {
  const list = flatten(parts, []);
  let n = 0;
  for (const b of list) n += b.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const b of list) { out.set(b, o); o += b.length; }
  return out;
}

export function u8(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 0xff) throw new RangeError(`u8 の範囲外です: ${v}`);
  return new Uint8Array([Math.round(n) & 0xff]);
}

export function u16(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 0xffff) throw new RangeError(`u16 の範囲外です: ${v}`);
  const r = Math.round(n);
  return new Uint8Array([(r >>> 8) & 0xff, r & 0xff]);
}

export function u24(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 0xffffff) throw new RangeError(`u24 の範囲外です: ${v}`);
  const r = Math.round(n);
  return new Uint8Array([(r >>> 16) & 0xff, (r >>> 8) & 0xff, r & 0xff]);
}

export function u32(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 0xffffffff) throw new RangeError(`u32 の範囲外です: ${v}`);
  const r = Math.round(n);
  return new Uint8Array([(r >>> 24) & 0xff, (r >>> 16) & 0xff, (r >>> 8) & 0xff, r & 0xff]);
}

/** 符号付き 32bit（trun の data_offset / composition offset） */
export function i32(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < -2147483648 || n > 2147483647) {
    throw new RangeError(`i32 の範囲外です: ${v}`);
  }
  return u32(Math.round(n) >>> 0);
}

/** 符号付き 16bit（dOps の output gain） */
export function i16(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < -32768 || n > 32767) throw new RangeError(`i16 の範囲外です: ${v}`);
  return u16(Math.round(n) & 0xffff);
}

/** 64bit。数値（MAX_SAFE_INTEGER まで）か BigInt を受ける */
export function u64(v) {
  let hi = 0;
  let lo = 0;
  if (typeof v === "bigint") {
    if (v < 0n || v > 0xffffffffffffffffn) throw new RangeError(`u64 の範囲外です: ${v}`);
    hi = Number((v >> 32n) & 0xffffffffn);
    lo = Number(v & 0xffffffffn);
  } else {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > Number.MAX_SAFE_INTEGER) {
      throw new RangeError(`u64 の範囲外です: ${v}`);
    }
    const r = Math.round(n);
    hi = Math.floor(r / 4294967296);
    lo = r - hi * 4294967296;
  }
  return cat(u32(hi), u32(lo));
}

/** 16.16 固定小数（rate / width / height / samplerate） */
export function fixed16_16(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new RangeError(`fixed16_16 の範囲外です: ${v}`);
  return i32(Math.round(n * 65536));
}

/** 4 文字の box type / brand。長さが違えば throw（typo を早く殺す） */
export function str4(s) {
  const t = String(s == null ? "" : s);
  if (t.length !== 4) throw new RangeError(`4 文字が必要です: "${t}"`);
  const b = new Uint8Array(4);
  for (let i = 0; i < 4; i++) {
    const c = t.charCodeAt(i);
    if (c > 0xff) throw new RangeError(`box type に使えない文字です: "${t}"`);
    b[i] = c;
  }
  return b;
}

/** size(u32) + type(4) + 中身 */
export function box(type, ...parts) {
  const body = cat(parts);
  const size = body.length + 8;
  if (size > 0xffffffff) throw new RangeError(`box("${type}") が 4GiB を超えました`);
  return cat(u32(size), str4(type), body);
}

/** FullBox: box の中身の頭に version(u8) + flags(u24) が付く */
export function fullBox(type, version, flags, ...parts) {
  return box(type, u8(version), u24(flags), parts);
}

function u32At(b, o) {
  return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
}

/** 整数へ（null/undefined/"" は既定値へ落とす） */
function int(v, d) {
  const n = v === null || v === undefined || v === "" ? NaN : Number(v);
  if (Number.isFinite(n)) return Math.round(n);
  return Number.isFinite(d) ? Math.round(d) : 0;
}

/** 正の実数へ（0 / NaN は既定値へ） */
function pos(v, d) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
}

function clampU32(v) {
  const n = int(v, 0);
  return n < 0 ? 0 : n > 0xffffffff ? 0xffffffff : n;
}

/* ── 2. ftyp ───────────────────────────────────────────────── */

/**
 * ftyp。major は isom、互換 brand は iso6（fMP4）/ mp41 / codec の brand。
 * @param {{major?:string, minor?:number, brands?:string[]}} [opts]
 */
export function buildFtyp(opts) {
  const o = opts || {};
  const major = o.major || "isom";
  const brands = Array.isArray(o.brands) && o.brands.length ? o.brands : ["isom", "iso6", "mp41", "avc1"];
  return box("ftyp", str4(major), u32(int(o.minor, 0x200)), brands.map((b) => str4(b)));
}

function ftypBrands(fourcc) {
  const list = ["isom", "iso6", "mp41"];
  const extra = fourcc === "avc3" ? "avc1" : fourcc === "hev1" ? "hvc1" : fourcc;
  if (extra && extra.length === 4 && list.indexOf(extra) < 0) list.push(extra);
  return list;
}

/* ── 3. Annex-B ↔ avcC ─────────────────────────────────────── */

/** 先頭が 00 00 01 / 00 00 00 01 なら Annex-B */
export function isAnnexB(bytes) {
  const b = toBytes(bytes);
  if (!b || b.length < 4) return false;
  if (b[0] !== 0 || b[1] !== 0) return false;
  return b[2] === 1 || (b[2] === 0 && b[3] === 1);
}

/**
 * 4 バイト長接頭（avcC 形式のサンプル本体）として **ぴったり歩き切れる**か。
 * 1 本目の長さを読んで飛び、最後がちょうど末尾に落ちれば真。
 */
export function isLengthPrefixed(bytes) {
  const b = toBytes(bytes);
  if (!b || b.length < 5) return false;
  let o = 0;
  while (o + 4 <= b.length) {
    const len = u32At(b, o);
    // len=0 は無限ループの元。残りを超える長さも長さ接頭ではない
    if (len < 1 || len > b.length - o - 4) return false;
    o += 4 + len;
  }
  return o === b.length;
}

/**
 * 「本当に Annex-B か」の判定。**`isAnnexB` だけでは足りない**。
 *
 * CONTRACT-NOTE: ここは実機で黒画面を作った所。WebCodecs が
 * `format:"avc"`（= 4 バイト長接頭。description が在るときの既定）で吐いた
 * サンプルでも、**先頭 NAL の長さが 256〜511 だと長さ接頭が `00 00 01 xx`**
 * になり、3 バイトのスタートコードと 1 バイトも違わない。静かな場面の
 * P フレームはこの範囲に普通に入る。誤判定すると `annexBToAvcc` が
 * 先頭バイト（長さの下位 = 0x2c 等）を NAL ヘッダと読み、type が 12
 * （filler）になって **全部捨てられ、サンプルが 0 バイトになる**。
 * よって「長さで歩き切れる物は Annex-B ではない」を先に見る。
 * ただし先頭が 4 バイトスタートコード（00 00 00 01）の場合は、長さ接頭と
 * 読むと「1 バイトの NAL が先頭」になる。encoder がそれを出すことは無いので
 * Annex-B を採る（Annex-B の 5 バイト chunk との取り違えを防ぐ）。
 */
function looksAnnexB(bytes) {
  const b = toBytes(bytes);
  if (!isAnnexB(b)) return false;
  if (b[2] === 0 && b[3] === 1) return true;
  return !isLengthPrefixed(b);
}

function trimZeros(b, start, end) {
  let e = end;
  while (e > start && b[e - 1] === 0) e--;
  return e;
}

/** Annex-B のバイト列を NAL の配列へ（3 バイト / 4 バイトのスタートコード混在可） */
export function splitAnnexB(bytes) {
  const b = toBytes(bytes);
  if (!b || !b.length) return [];
  /** @type {Uint8Array[]} */
  const nals = [];
  let i = 0;
  let start = -1;
  while (i < b.length) {
    if (b[i] === 0 && b[i + 1] === 0 && (b[i + 2] === 1 || (b[i + 2] === 0 && b[i + 3] === 1))) {
      const sc = b[i + 2] === 1 ? 3 : 4;
      if (start >= 0) {
        const e = trimZeros(b, start, i);
        if (e > start) nals.push(b.subarray(start, e));
      }
      i += sc;
      start = i;
      continue;
    }
    i++;
  }
  if (start >= 0) {
    const e = trimZeros(b, start, b.length);
    if (e > start) nals.push(b.subarray(start, e));
  }
  return nals;
}

/**
 * Annex-B → 4 バイト長接頭（avcC 形式のサンプル本体）。
 * SPS/PPS は既定では残す（in-band でも再生できるし、avcC と二重でも問題ない）。
 * @param {Uint8Array|ArrayBuffer} bytes
 * @param {{dropParameterSets?:boolean}} [opts]
 */
export function annexBToAvcc(bytes, opts) {
  const o = opts || {};
  const nals = splitAnnexB(bytes);
  if (!nals.length) {
    const b = toBytes(bytes);
    return b ? new Uint8Array(b) : new Uint8Array(0);
  }
  const keep = [];
  for (const n of nals) {
    const t = n[0] & 0x1f;
    if (o.dropParameterSets && (t === 7 || t === 8 || t === 13)) continue;
    if (t === 12) continue; // filler は要らない
    keep.push(n);
  }
  let total = 0;
  for (const n of keep) total += 4 + n.length;
  const out = new Uint8Array(total);
  let p = 0;
  for (const n of keep) {
    out[p] = (n.length >>> 24) & 0xff;
    out[p + 1] = (n.length >>> 16) & 0xff;
    out[p + 2] = (n.length >>> 8) & 0xff;
    out[p + 3] = n.length & 0xff;
    out.set(n, p + 4);
    p += 4 + n.length;
  }
  return out;
}

/**
 * Annex-B から SPS/PPS を拾って avcC（AVCDecoderConfigurationRecord）の
 * **中身**を組む。box にはしない（呼ぶ側が box("avcC", ...) する）。
 * SPS か PPS が無ければ null（呼び出し側が復帰できるように）。
 * CONTRACT-NOTE: High profile 用の末尾拡張（chroma_format 等）は省く。
 * 任意項目であり、これが無くて再生できなかった実装は知られていない。
 */
export function avccFromAnnexB(bytes) {
  const nals = splitAnnexB(bytes);
  const sps = [];
  const pps = [];
  for (const n of nals) {
    const t = n[0] & 0x1f;
    if (t === 7) sps.push(n);
    else if (t === 8) pps.push(n);
  }
  if (!sps.length || !pps.length) return null;
  const s0 = sps[0];
  if (s0.length < 4) return null;
  const parts = [u8(1), u8(s0[1]), u8(s0[2]), u8(s0[3]), u8(0xff), u8(0xe0 | Math.min(31, sps.length))];
  for (const n of sps) parts.push(u16(n.length), n);
  parts.push(u8(Math.min(255, pps.length)));
  for (const n of pps) parts.push(u16(n.length), n);
  return cat(parts);
}

/** description が box ごと（size + 'avcC' + …）で来たら中身だけにする */
function unwrapConfigBox(desc, type) {
  const b = toBytes(desc);
  if (!b || b.length < 8) return b;
  const size = u32At(b, 0);
  const t = String.fromCharCode(b[4], b[5], b[6], b[7]);
  if (size === b.length && t === type) return b.subarray(8);
  return b;
}

/* ── 4. 音声の設定 box（esds / dOps） ──────────────────────── */

/** MPEG-4 descriptor の可変長サイズ（7bit ずつ、継続ビット 0x80） */
function descLen(n) {
  if (n < 0 || n > 0x0fffffff) throw new RangeError(`descriptor が長すぎます: ${n}`);
  const out = [];
  let v = n;
  do {
    out.unshift(v & 0x7f);
    v >>>= 7;
  } while (v > 0);
  for (let i = 0; i < out.length - 1; i++) out[i] |= 0x80;
  return new Uint8Array(out);
}

function descriptor(tag, ...payload) {
  const body = cat(payload);
  return cat(u8(tag), descLen(body.length), body);
}

const AAC_RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];

/** description が来なかったときの AudioSpecificConfig（AAC-LC 2 バイト） */
function aacASC(sampleRate, channels) {
  let idx = AAC_RATES.indexOf(int(sampleRate, 48000));
  if (idx < 0) idx = 3; // 48000
  const ch = Math.min(7, Math.max(1, int(channels, 2)));
  const v = (2 << 11) | (idx << 7) | (ch << 3);
  return new Uint8Array([(v >>> 8) & 0xff, v & 0xff]);
}

/**
 * AAC の esds。`config.description`（AudioEncoder の decoderConfig.description
 * = AudioSpecificConfig）が在ればそれを、無ければ sampleRate/channels から組む。
 * @param {{description?:Uint8Array, sampleRate?:number, channels?:number,
 *          maxBitrate?:number, avgBitrate?:number, bufferSize?:number, esId?:number}} config
 */
export function buildEsdsForAAC(config) {
  const c = config || {};
  const asc = toBytes(c.description) || aacASC(c.sampleRate, c.channels);
  if (!asc.length) throw new Error("AAC の AudioSpecificConfig が空です");
  const dsi = descriptor(0x05, asc);
  // objectTypeIndication=0x40（Audio ISO/IEC 14496-3）/ streamType=0x05（audio）
  const dcd = descriptor(
    0x04,
    u8(0x40), u8(0x15), u24(int(c.bufferSize, 0)),
    u32(clampU32(int(c.maxBitrate, 0))), u32(clampU32(int(c.avgBitrate, 0))),
    dsi
  );
  const sl = descriptor(0x06, u8(0x02)); // MP4 既定の SLConfig
  const es = descriptor(0x03, u16(int(c.esId, 1)), u8(0), dcd, sl);
  return fullBox("esds", 0, 0, es);
}

/**
 * Opus の dOps。`opusHead`（OpusHead 識別ヘッダ = WebCodecs の description）か、
 * 既に dOps の中身のバイト列か、`{channels, sampleRate, preSkip, gain}` を受ける。
 * OpusHead はリトルエンディアン、dOps はビッグエンディアンなので詰め直す。
 */
export function buildDOps(opusHead) {
  let channels = 2;
  let preSkip = 312;
  let rate = 48000;
  let gain = 0;
  let family = 0;
  let tail = null;
  // description が dOps box ごと（size + 'dOps' + …）で来ても中身だけにする
  const h = unwrapConfigBox(toBytes(opusHead), "dOps");
  if (h && h.length >= 19 && h[0] === 0x4f && h[1] === 0x70 && h[2] === 0x75 && h[3] === 0x73) {
    channels = h[9];
    preSkip = h[10] | (h[11] << 8);
    rate = (h[12] | (h[13] << 8) | (h[14] << 16) | (h[15] << 24)) >>> 0;
    gain = ((h[16] | (h[17] << 8)) << 16) >> 16;
    family = h[18];
    if (family !== 0 && h.length > 19) tail = h.subarray(19);
  } else if (h && h.length >= 11 && h[0] === 0) {
    return box("dOps", h); // 既に dOps の中身（version=0）
  } else if (opusHead && typeof opusHead === "object" && !h) {
    channels = int(opusHead.channels, 2);
    rate = int(opusHead.sampleRate, 48000);
    preSkip = int(opusHead.preSkip, 312);
    gain = int(opusHead.gain, 0);
  }
  return box(
    "dOps",
    u8(0), u8(Math.min(255, Math.max(1, channels))), u16(Math.min(0xffff, Math.max(0, preSkip))),
    u32(clampU32(rate)), i16(Math.min(32767, Math.max(-32768, gain))), u8(family), tail
  );
}

/* ── 5. moov（空の trak + mvex） ───────────────────────────── */

function compressorName() {
  return new Uint8Array(32); // 長さ 0 の固定長文字列
}

function videoFourcc(codec) {
  const head = String(codec || "").toLowerCase().split(".")[0];
  if (head === "avc1" || head === "avc" || head === "h264") return "avc1";
  if (head === "avc3") return "avc3";
  if (head === "hvc1" || head === "hevc" || head === "h265") return "hvc1";
  if (head === "hev1") return "hev1";
  if (head === "av01" || head === "av1") return "av01";
  if (head === "vp09" || head === "vp9") return "vp09";
  if (head === "vp08" || head === "vp8") return "vp08";
  return "";
}

function audioFourcc(codec) {
  const c = String(codec || "").toLowerCase();
  if (!c) return "";
  if (c.indexOf("opus") >= 0) return "Opus";
  if (c.indexOf("mp4a") === 0 || c.indexOf("aac") >= 0) return "mp4a";
  return "";
}

function videoSampleEntry(t) {
  const fourcc = videoFourcc(t.codec) || "avc1";
  const cfgType = VIDEO_CONFIG_BOX[fourcc] || "avcC";
  const desc = unwrapConfigBox(t.description, cfgType);
  if ((!desc || !desc.length) && CONFIG_REQUIRED[cfgType]) {
    throw new Error(`映像の decoderConfig.description（${cfgType}）が在りません。これが無いと再生できません`);
  }
  const w = int(t.width, 0);
  const h = int(t.height, 0);
  if (w <= 0 || h <= 0) throw new Error(`映像の width/height が不正です（${w}x${h}）`);
  return box(
    fourcc,
    new Uint8Array(6), u16(1),
    u16(0), u16(0), u32(0), u32(0), u32(0),
    u16(Math.min(0xffff, w)), u16(Math.min(0xffff, h)),
    u32(0x00480000), u32(0x00480000), u32(0), u16(1),
    compressorName(), u16(0x0018), u16(0xffff),
    desc && desc.length ? box(cfgType, desc) : null,
    box("pasp", u32(1), u32(1))
  );
}

function audioSampleEntry(t) {
  const fourcc = audioFourcc(t.codec);
  if (fourcc !== "mp4a" && fourcc !== "Opus") {
    throw new Error(`音声 codec "${t.codec}" は mp4 に入れられません（mp4a / opus のみ）`);
  }
  const rate = int(t.sampleRate, 48000);
  const ch = Math.min(255, Math.max(1, int(t.channels, 2)));
  // samplerate は 16.16。Opus は仕様で 48000 固定と書くのが作法
  const entryRate = Math.min(65535, fourcc === "Opus" ? 48000 : rate);
  const cfg = fourcc === "Opus"
    ? buildDOps(t.description || { channels: ch, sampleRate: rate })
    : buildEsdsForAAC({
      description: t.description, sampleRate: rate, channels: ch,
      maxBitrate: int(t.bitrate, 0), avgBitrate: int(t.bitrate, 0),
    });
  return box(
    fourcc,
    new Uint8Array(6), u16(1),
    u16(0), u16(0), u32(0),
    u16(ch), u16(16), u16(0), u16(0),
    u32(entryRate * 65536),
    cfg
  );
}

function buildTrak(t, movieTs) {
  const isVideo = String(t.kind || "video") !== "audio";
  const ts = Math.max(1, int(t.timescale, isVideo ? 30000 : 48000));
  const mdur = Math.max(0, int(t.duration, 0));
  const tdur = Math.round((mdur * movieTs) / ts);
  const tkhd = fullBox(
    "tkhd", 0, 0x3, // enabled | in-movie
    u32(0), u32(0), u32(int(t.id, 1)), u32(0), u32(clampU32(tdur)),
    u32(0), u32(0), u16(0), u16(0),
    u16(isVideo ? 0 : 0x0100), u16(0),
    UNITY_MATRIX.map((m) => u32(m)),
    fixed16_16(isVideo ? int(t.width, 0) : 0), fixed16_16(isVideo ? int(t.height, 0) : 0)
  );
  const mdhd = fullBox("mdhd", 0, 0, u32(0), u32(0), u32(ts), u32(clampU32(mdur)), u16(LANG_UND), u16(0));
  const hdlr = fullBox("hdlr", 0, 0, u32(0), str4(isVideo ? "vide" : "soun"), u32(0), u32(0), u32(0), u8(0));
  const mhd = isVideo
    ? fullBox("vmhd", 0, 1, u16(0), u16(0), u16(0), u16(0))
    : fullBox("smhd", 0, 0, u16(0), u16(0));
  const dinf = box("dinf", fullBox("dref", 0, 0, u32(1), fullBox("url ", 0, 1)));
  // fMP4 なので stbl は空（実データは moof/trun が説明する）
  const stbl = box(
    "stbl",
    fullBox("stsd", 0, 0, u32(1), isVideo ? videoSampleEntry(t) : audioSampleEntry(t)),
    fullBox("stts", 0, 0, u32(0)),
    fullBox("stsc", 0, 0, u32(0)),
    fullBox("stsz", 0, 0, u32(0), u32(0)),
    fullBox("stco", 0, 0, u32(0))
  );
  return box("trak", tkhd, box("mdia", mdhd, hdlr, box("minf", mhd, dinf, stbl)));
}

/**
 * moov（mvhd + trak× + mvex）。trak は空の stbl を持つ fMP4 用。
 * @param {{timescale?:number, duration?:number, tracks:Array<Object>}} spec
 */
export function buildMoov(spec) {
  const s = spec || {};
  const movieTs = Math.max(1, int(s.timescale, MOVIE_TIMESCALE));
  const tracks = Array.isArray(s.tracks) ? s.tracks : [];
  if (!tracks.length) throw new Error("moov に trak が 1 つも在りません");
  const mvhd = fullBox(
    "mvhd", 0, 0,
    u32(0), u32(0), u32(movieTs), u32(clampU32(int(s.duration, 0))),
    fixed16_16(1), u16(0x0100), u16(0), u32(0), u32(0),
    UNITY_MATRIX.map((m) => u32(m)),
    [0, 0, 0, 0, 0, 0].map(() => u32(0)),
    u32(tracks.length + 1)
  );
  const traks = tracks.map((t) => buildTrak(t, movieTs));
  const trexs = tracks.map((t) => fullBox(
    "trex", 0, 0,
    u32(int(t.id, 1)), u32(1),
    u32(clampU32(int(t.defaultSampleDuration, 0))), u32(0),
    u32(clampU32(int(t.defaultSampleFlags, 0)))
  ));
  return box("moov", mvhd, traks, box("mvex", trexs));
}

/* ── 6. moof / mdat / mfra ─────────────────────────────────── */

/**
 * trun。duration/size/flags は全サンプルに明示する（trex の既定に頼らない）。
 * composition offset が 1 つでも 0 でなければ version 1（符号付き）で出す。
 */
export function buildTrun(samples, dataOffset) {
  const list = Array.isArray(samples) ? samples : [];
  let anyCto = false;
  for (const s of list) {
    if (int(s.cto, 0) !== 0) { anyCto = true; break; }
  }
  // data-offset | sample-duration | sample-size | sample-flags [| cts-offset]
  const flags = 0x000001 | 0x000100 | 0x000200 | 0x000400 | (anyCto ? 0x000800 : 0);
  const parts = [u32(list.length), i32(dataOffset)];
  for (const s of list) {
    parts.push(u32(clampU32(int(s.duration, 0))), u32(clampU32(int(s.size, 0))), u32(int(s.flags, 0) >>> 0));
    if (anyCto) parts.push(i32(int(s.cto, 0)));
  }
  return fullBox("trun", anyCto ? 1 : 0, flags, parts);
}

function buildTraf(t, dataOffset) {
  // flags=0x020000: default-base-is-moof（data_offset を moof 先頭からの相対にする）
  const tfhd = fullBox("tfhd", 0, 0x020000, u32(int(t.trackId, 1)));
  // tfdt は version 1（u64）。長い書き出しでも溢れない
  const tfdt = fullBox("tfdt", 1, 0, u64(Math.max(0, int(t.baseMediaDecodeTime, 0))));
  return box("traf", tfhd, tfdt, buildTrun(t.samples, dataOffset));
}

function moofBytes(seq, tracks, offsets) {
  const trafs = tracks.map((t, i) => buildTraf(t, offsets ? offsets[i] : 0));
  return box("moof", fullBox("mfhd", 0, 0, u32(seq)), trafs);
}

/**
 * moof。`trun` の data_offset は moof 先頭からの相対なので、
 * **1 回組んで長さを測り、確定した offset で組み直す**（size は u32 固定長
 * なので 2 回目で長さが変わることは無い。変わったら muxer のバグ）。
 * サンプル本体は tracks の順に隙間無く mdat へ並べる前提。
 * @param {{sequenceNumber:number, tracks:Array<{trackId:number,
 *          baseMediaDecodeTime:number, samples:Array<Object>}>}} frag
 */
export function buildMoof(frag) {
  const f = frag || {};
  const seq = Math.max(1, int(f.sequenceNumber, 1));
  const tracks = Array.isArray(f.tracks) ? f.tracks : [];
  if (!tracks.length) throw new Error("moof に traf が 1 つも在りません");
  const probe = moofBytes(seq, tracks, null);
  const base = probe.length + 8; // mdat の size+type
  const offsets = [];
  let acc = 0;
  for (const t of tracks) {
    offsets.push(base + acc);
    for (const s of t.samples || []) acc += int(s.size, 0);
  }
  const out = moofBytes(seq, tracks, offsets);
  if (out.length !== probe.length) throw new Error("moof の長さが 2 回で変わりました（muxer のバグ）");
  return out;
}

/** mdat。サンプル本体を並べるだけ */
export function buildMdat(parts) {
  return box("mdat", Array.isArray(parts) ? parts : [parts]);
}

/**
 * mfra + mfro（ランダムアクセス表）。fMP4 は索引が無いと QuickTime /
 * Safari のシークが弱いので、キーフレームで始まる fragment を並べる。
 */
export function buildMfra(tracks) {
  const list = Array.isArray(tracks) ? tracks : [];
  const tfras = list.map((t) => {
    const es = Array.isArray(t.entries) ? t.entries : [];
    const parts = [u32(int(t.trackId, 1)), u32(0), u32(es.length)];
    for (const e of es) {
      parts.push(u64(Math.max(0, int(e.time, 0))), u64(Math.max(0, int(e.moofOffset, 0))), u8(1), u8(1), u8(1));
    }
    return fullBox("tfra", 1, 0, parts);
  });
  let total = 8 + 16; // mfra の header + mfro（固定 16 バイト）
  for (const t of tfras) total += t.length;
  return box("mfra", tfras, fullBox("mfro", 0, 0, u32(total)));
}

/* ── 7. Muxer 本体 ─────────────────────────────────────────── */

function chunkBytes(c) {
  if (!c) throw new TypeError("EncodedChunk が null です");
  const direct = toBytes(c);
  if (direct) return direct;
  if (typeof c.copyTo === "function" && Number.isFinite(c.byteLength)) {
    const b = new Uint8Array(c.byteLength);
    c.copyTo(b);
    return b;
  }
  const d = toBytes(c.data) || toBytes(c.byteBuffer);
  if (d) return d;
  throw new TypeError("EncodedChunk からバイト列を取り出せません（copyTo も data も在りません）");
}

function chunkIsKey(c) {
  if (c && (c.type === "key" || c.type === "delta")) return c.type === "key";
  if (c && typeof c.key === "boolean") return c.key;
  return false;
}

/**
 * 並んだ候補から最初の有限な数を採る（無ければ NaN）。
 * CONTRACT-NOTE: WebCodecs の EncodedChunk は `timestamp` / `duration`（µs）
 * だが、repo 内の呼び出し側（`export/mux/webm.js` と `selftest.html`）は
 * **`timestampUs` / `durationUs`** という名前で渡す。webm 側は既に両方を
 * 受けているので、mp4 も揃える。揃えないと selftest では全サンプルの
 * pts が 0 になり（Number(undefined)→NaN→0）、時刻の壊れた mp4 が出る。
 */
function firstNum(...vals) {
  for (const v of vals) {
    if (v === null || v === undefined || v === "") continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
}

function usToTs(us, ts) {
  return Math.max(0, Math.round((Number(us) || 0) * ts / 1e6));
}

function normalizeConfig(config) {
  const c = config || {};
  const v = c.video && typeof c.video === "object" ? c.video : {};
  const vFourcc = videoFourcc(v.codec || c.videoCodec) || "avc1";
  const video = {
    codec: vFourcc,
    width: int(v.width, int(c.width, 0)),
    height: int(v.height, int(c.height, 0)),
    fps: pos(v.fps, pos(c.fps, 30)),
    description: unwrapConfigBox(v.description, VIDEO_CONFIG_BOX[vFourcc] || "avcC") || null,
  };
  // CONTRACT-NOTE: 契約書は { video:{…}, audio:{…} } の形だが、実物の
  // exporter.js は平たい形（width/height/fps/videoCodec/audioCodec/
  // sampleRate/numberOfChannels/audioBitrate）で渡してくる。両方受ける。
  let a = null;
  if (c.audio && typeof c.audio === "object") a = c.audio;
  else if (c.audio === undefined && c.audioCodec) {
    a = {
      codec: c.audioCodec, sampleRate: c.sampleRate,
      channels: c.numberOfChannels !== undefined ? c.numberOfChannels : c.channels,
      bitrate: c.audioBitrate, description: c.audioDescription,
    };
  }
  let audio = null;
  if (a) {
    const fourcc = audioFourcc(a.codec);
    if (!fourcc) warn(TAG, `音声 codec "${a.codec}" は mp4 に入れられないので音声無しにします`);
    else {
      audio = {
        codec: fourcc,
        sampleRate: Math.max(1, int(a.sampleRate, 48000)),
        channels: Math.min(255, Math.max(1, int(a.channels, 2))),
        bitrate: int(a.bitrate, 0),
        description: toBytes(a.description) || null,
      };
    }
  }
  return { video, audio };
}

function makeTrack(id, kind, timescale, fallbackDur, description) {
  return {
    id, kind, timescale, fallbackDur, description,
    /** @type {Array<Object>} */ pending: [],
    pendingDur: 0, seen: 0,
    /** 次の fragment の baseMediaDecodeTime（null = まだ 1 本も来ていない） */
    nextDts: null, sumDur: 0, fragBase: 0,
  };
}

/**
 * fMP4 muxer を作る。
 * @param {{video:{codec?:string,width:number,height:number,fps?:number,description?:Uint8Array},
 *          audio?:null|{codec:string,sampleRate:number,channels:number,description?:Uint8Array},
 *          onData?:(bytes:Uint8Array)=>void}} config
 */
export function createMP4Muxer(config) {
  const cfg = normalizeConfig(config);
  const onData = config && typeof config.onData === "function" ? config.onData : null;

  const vTs = Math.max(1000, Math.round(cfg.video.fps * 1000));
  const vTrack = makeTrack(1, "video", vTs, Math.max(1, Math.round(vTs / cfg.video.fps)), cfg.video.description);
  const aTrack = cfg.audio
    ? makeTrack(2, "audio", cfg.audio.sampleRate, cfg.audio.codec === "Opus" ? 960 : 1024, cfg.audio.description)
    : null;

  /** @type {Uint8Array[]} 出来上がったバイト列（moov を後で差し替えるので配列で持つ） */
  const out = [];
  let outLen = 0;
  let moovIndex = -1;
  let headWritten = false;
  let seq = 0;
  let dropAudio = false;
  let finalized = false;
  let disposed = false;
  /** @type {Uint8Array|null} */
  let finalBytes = null;
  /** @type {Array<{time:number, moofOffset:number}>} */
  const mfraEntries = [];
  let warnedNoAudio = false;

  function write(bytes) {
    if (!bytes || !bytes.length) return;
    out.push(bytes);
    outLen += bytes.length;
    if (onData) onData(bytes);
  }

  function ensureOpen() {
    if (disposed) throw new Error("dispose 済みの muxer に chunk を入れようとしました");
    if (finalized) throw new Error("finalize 済みの muxer に chunk を入れようとしました");
  }

  function activeTracks() {
    return aTrack && !dropAudio ? [vTrack, aTrack] : [vTrack];
  }

  function movieDuration() {
    let ms = 0;
    for (const t of activeTracks()) {
      ms = Math.max(ms, Math.round((t.sumDur * MOVIE_TIMESCALE) / t.timescale));
    }
    return ms;
  }

  function moovSpec() {
    const tracks = [{
      kind: "video", id: vTrack.id, timescale: vTrack.timescale, duration: vTrack.sumDur,
      width: cfg.video.width, height: cfg.video.height, codec: cfg.video.codec,
      description: vTrack.description,
      defaultSampleDuration: vTrack.fallbackDur, defaultSampleFlags: SAMPLE_FLAGS_DELTA,
    }];
    if (aTrack && !dropAudio) {
      tracks.push({
        kind: "audio", id: aTrack.id, timescale: aTrack.timescale, duration: aTrack.sumDur,
        codec: cfg.audio.codec, sampleRate: cfg.audio.sampleRate, channels: cfg.audio.channels,
        description: aTrack.description, bitrate: cfg.audio.bitrate,
        defaultSampleDuration: aTrack.fallbackDur, defaultSampleFlags: SAMPLE_FLAGS_SYNC,
      });
    }
    return { timescale: MOVIE_TIMESCALE, duration: movieDuration(), tracks };
  }

  /** 頭（ftyp + moov）を出せる状態か。avcC と、音声を作るなら 1 本目の音声が要る */
  function headReady() {
    if (!vTrack.description && CONFIG_REQUIRED[VIDEO_CONFIG_BOX[cfg.video.codec] || "avcC"]) return false;
    if (vTrack.seen === 0) return false;
    if (aTrack && !dropAudio && aTrack.seen === 0) return false;
    return true;
  }

  function maybeWriteHead() {
    if (headWritten) return;
    // 音声を待ちすぎたら諦める（無音でも映像は出すのが親切）
    if (aTrack && !dropAudio && aTrack.seen === 0 && vTrack.pendingDur / vTrack.timescale >= HEAD_WAIT_SEC) {
      dropAudio = true;
      warn(TAG, "音声 chunk が来ないので音声トラック無しで書き出します");
    }
    if (!headReady()) return;
    write(buildFtyp({ brands: ftypBrands(cfg.video.codec) }));
    moovIndex = out.length;
    write(buildMoov(moovSpec()));
    headWritten = true;
    // 頭が出るまでに溜まった分。まだ 1 秒に満たなければ切らない
    // （切ると 1 サンプルだけの moof が出来て fragment の数が読みにくくなる）。
    // 音声を待って溜め込んだ場合はここで 1 本出す。
    if (vTrack.pendingDur / vTrack.timescale >= FRAGMENT_SEC) flushFragment();
  }

  /** chunk.duration が無かったサンプルの長さを、次のサンプルの pts から埋める */
  function resolveDurations(t) {
    const p = t.pending;
    for (let i = 0; i < p.length; i++) {
      if (p[i].provided) continue;
      const nx = p[i + 1];
      if (!nx) continue;
      const d = nx.pts - p[i].pts;
      if (Number.isFinite(d) && d > 0) {
        t.pendingDur += d - p[i].duration;
        p[i].duration = d;
      }
    }
  }

  function flushFragment() {
    if (!headWritten) return;
    const tracks = [];
    const payload = [];
    let vKeyFirst = false;
    let vBase = 0;
    for (const t of activeTracks()) {
      if (!t.pending.length) continue;
      resolveDurations(t);
      if (t.nextDts === null) t.nextDts = t.pending[0].pts;
      const base = t.nextDts;
      let dts = base;
      const samples = [];
      for (const s of t.pending) {
        samples.push({ duration: s.duration, size: s.size, flags: s.flags, cto: s.pts - dts });
        dts += s.duration;
        t.sumDur += s.duration;
        payload.push(s.data);
      }
      tracks.push({ trackId: t.id, baseMediaDecodeTime: base, samples });
      t.nextDts = dts;
      if (t === vTrack) { vKeyFirst = t.pending[0].key; vBase = base; }
    }
    if (!tracks.length) return;
    seq += 1;
    const moofOffset = outLen;
    write(buildMoof({ sequenceNumber: seq, tracks }));
    write(buildMdat(payload));
    if (vKeyFirst) mfraEntries.push({ time: vBase, moofOffset });
    for (const t of activeTracks()) { t.pending = []; t.pendingDur = 0; }
  }

  function pushSample(t, data, chunk, flags, isKey) {
    // 0 バイトのサンプルは「読めるが再生できない」mp4 になる（trun の size が
    // 0 になり、読み手によっては そこで止まる）。黙って書かずに止める。
    if (!data || !data.length) {
      throw new Error(`${t.kind === "audio" ? "音声" : "映像"} chunk のバイト列が空です（壊れた mp4 を書かないため止めます）`);
    }
    const pts = usToTs(firstNum(chunk && chunk.timestampUs, chunk && chunk.timestamp), t.timescale);
    const raw = firstNum(chunk && chunk.durationUs, chunk && chunk.duration);
    const provided = Number.isFinite(raw) && raw > 0;
    const dur = provided ? Math.max(1, usToTs(raw, t.timescale)) : t.fallbackDur;
    t.pending.push({ data, size: data.length, pts, duration: dur, provided, flags, key: !!isKey });
    t.pendingDur += dur;
    t.seen += 1;
  }

  function addVideoChunk(chunkLike, meta) {
    ensureOpen();
    const conf = meta && meta.decoderConfig ? meta.decoderConfig : null;
    if (conf && !headWritten) {
      const fourcc = videoFourcc(conf.codec);
      if (fourcc) cfg.video.codec = fourcc;
      const type = VIDEO_CONFIG_BOX[cfg.video.codec] || "avcC";
      const d = unwrapConfigBox(conf.description, type);
      if (d && d.length) vTrack.description = d;
      if (!cfg.video.width) cfg.video.width = int(conf.codedWidth, 0);
      if (!cfg.video.height) cfg.video.height = int(conf.codedHeight, 0);
    }
    let data = chunkBytes(chunkLike);
    const isKey = chunkIsKey(chunkLike);
    const isAvc = cfg.video.codec === "avc1" || cfg.video.codec === "avc3";
    if (isAvc && looksAnnexB(data)) {
      // Annex-B で来た。avcC が無ければ SPS/PPS から組み、本体は 4 バイト長接頭へ
      if (!vTrack.description) {
        const rec = avccFromAnnexB(data);
        if (rec) vTrack.description = rec;
      }
      data = annexBToAvcc(data);
    }
    if (!vTrack.description && CONFIG_REQUIRED[VIDEO_CONFIG_BOX[cfg.video.codec] || "avcC"]) {
      throw new Error(
        `映像の decoderConfig.description（${VIDEO_CONFIG_BOX[cfg.video.codec] || "avcC"}）が来ず、` +
        "Annex-B でもないので avcC を組めません（この mp4 は再生できないため書きません）"
      );
    }
    // fragment の区切り: キーフレーム境界を優先しつつ約 1 秒
    const sec = vTrack.pendingDur / vTrack.timescale;
    if (vTrack.pending.length && ((isKey && sec >= FRAGMENT_SEC) || sec >= FRAGMENT_MAX_SEC)) flushFragment();
    pushSample(vTrack, data, chunkLike, isKey ? SAMPLE_FLAGS_SYNC : SAMPLE_FLAGS_DELTA, isKey);
    maybeWriteHead();
  }

  function addAudioChunk(chunkLike, meta) {
    ensureOpen();
    if (!aTrack || dropAudio) {
      if (!warnedNoAudio) {
        warn(TAG, "音声トラックを作っていないので音声 chunk を捨てます");
        warnedNoAudio = true;
      }
      return;
    }
    const conf = meta && meta.decoderConfig ? meta.decoderConfig : null;
    if (conf && !headWritten && aTrack.seen === 0) {
      const d = toBytes(conf.description);
      if (d && d.length) aTrack.description = d;
      const sr = int(conf.sampleRate, 0);
      if (sr > 0 && sr !== cfg.audio.sampleRate) {
        cfg.audio.sampleRate = sr;
        aTrack.timescale = sr;
      }
      const ch = int(conf.numberOfChannels, 0);
      if (ch > 0) cfg.audio.channels = Math.min(255, ch);
    }
    const data = chunkBytes(chunkLike);
    pushSample(aTrack, data, chunkLike, SAMPLE_FLAGS_SYNC, true);
    maybeWriteHead();
  }

  function concatOut() {
    const b = new Uint8Array(outLen);
    let o = 0;
    for (const p of out) { b.set(p, o); o += p.length; }
    return b;
  }

  /**
   * 後始末（残りを flush → moov の duration を実測へ → 末尾に mfra）をして
   * `out`（破片の配列）を確定させる。2 回目以降は何もしない。
   */
  function finishParts() {
    if (finalized) return out;
    if (disposed) throw new Error("dispose 済みの muxer を finalize しようとしました");
    if (aTrack && !dropAudio && aTrack.seen === 0 && !headWritten) {
      dropAudio = true;
      warn(TAG, "音声 chunk が 1 つも来なかったので音声トラックを落とします");
    }
    maybeWriteHead();
    if (!headWritten) {
      throw new Error("映像の chunk が 1 つも来なかったので mp4 を作れません");
    }
    flushFragment();
    // moov の duration を実測へ。trak の構成は変えていないので長さは同じ
    const fixed = buildMoov(moovSpec());
    const old = out[moovIndex];
    if (old && fixed.length === old.length) out[moovIndex] = fixed;
    else warn(TAG, "moov の長さが変わったので duration を書き直せませんでした");
    if (mfraEntries.length) write(buildMfra([{ trackId: vTrack.id, entries: mfraEntries }]));
    finalized = true;
    return out;
  }

  function finalizeBytes() {
    if (finalBytes) return finalBytes;
    finishParts();
    finalBytes = concatOut();
    return finalBytes;
  }

  function finalize() {
    // Blob が無い環境では **状態を壊す前に** throw する（finalizeBytes へ回れる）
    if (typeof Blob !== "function") {
      throw new Error("この環境には Blob が在りません（finalizeBytes を使ってください）");
    }
    if (finalBytes) return new Blob([finalBytes], { type: "video/mp4" });
    /* CONTRACT-NOTE: 1 本の Uint8Array に繋いでから Blob へ渡すと、同じ中身が
       一時的に 2 重に載る。4K を数分だと数百 MB × 2 で iPhone Safari が落ちる。
       Blob は構築時に中身を写すので、破片の配列をそのまま渡して良い
       （この後 dispose() で out を空にしても Blob の中身は残る）。 */
    const parts = finishParts().slice();
    return new Blob(parts, { type: "video/mp4" });
  }

  function bytes() {
    return finalBytes || concatOut();
  }

  function dispose() {
    disposed = true;
    out.length = 0;
    outLen = 0;
    vTrack.pending = [];
    if (aTrack) aTrack.pending = [];
    finalBytes = null;
  }

  return {
    addVideoChunk, addAudioChunk, finalize, finalizeBytes, bytes, dispose,
    /** 診断用（selftest / 試験が覗く）。契約には無い追加 */
    get info() {
      return {
        fragments: seq, videoSamples: vTrack.seen, audioSamples: aTrack ? aTrack.seen : 0,
        videoTimescale: vTrack.timescale, audioTimescale: aTrack ? aTrack.timescale : 0,
        bytes: outLen, hasAudio: !!(aTrack && !dropAudio), finalized,
      };
    },
  };
}

/** exporter.js が最初に探す名前（CONTRACT-NOTE: 大文字違いの別名） */
export const createMp4Muxer = createMP4Muxer;
export default createMP4Muxer;
