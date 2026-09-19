/* ══════════════════════════════════════════════════════════════════════════
   studio/src/export/mux/webm.js — WebM（Matroska / EBML）を自前で組む muxer

   ★ 何をする所か
     WebCodecs の VideoEncoder（VP9 / VP8 / AV1）と AudioEncoder（Opus）が
     吐いた EncodedVideoChunk / EncodedAudioChunk を受け取り、そのまま
     再生できる .webm を書く。構造は
       EBML Header → Segment（SeekHead・Info・Tracks・Cluster*・Cues）。
     契約書 §5 / §11 の mode:"precise" の出口。**外部依存ゼロ**。

   ★ 2 つの動き方（ここを取り違えると壊れる）
     ・**既定（onData を渡さない）= 全部溜めて finalize で書く。**
       chunk を全部持っておき、finalize() の時に
       「Duration 入りの Info」「Cues（索引）」「正しい位置の SeekHead」を
       含む完全なファイルを 1 度で組む。総時間の表示も seek も効く。
     ・**onData を渡した = 逐次。** Segment を「大きさ不明」で開き、
       Cluster が出来る度に onData(bytes) を呼ぶ。Info を先に流してしまう
       ので **Duration は書けない**（再生機の総時間が出ない事がある）。
       Cues は finalize() で末尾に足すので seek は効く。SeekHead は
       位置が先に分からないので付けない。既定では流した分を持たない
       （`retain:true` を渡せば持つ → finalizeBytes() が使える）。

   ★ なぜこの形か
     ・ブラウザに muxer は無い。MediaRecorder はフレームを落とすので、
       «1 フレームも落とさない書き出し» は自前で組むしかない。
     ・EBML は「id + 大きさ + 中身」の入れ子だけ。難しいのは
       ①Cluster をどこで切るか ②後から位置を書く所（SeekHead / Cues）
       の 2 つだけなので、そこを 1 箇所（buildFile / emitCluster）に集めた。
     ・Block の相対時刻は **16bit 符号付き**（±32767）。timecodeScale を
       1,000,000（= 1ms 刻み）に固定し、Cluster を 2 秒 / 4MB ごとに
       切るので絶対に溢れない。
     ・出力は **決定的**（時計も乱数も使わない）。tests/mux-webm.test.mjs が
       バイト列を直に比べられるようにするため。

   ★ 触るときの注意
     ・Cluster は **必ずキーフレームで始める**。例外は「相対時刻が 16bit を
       超える」時だけ（Matroska 的には非キー始まりも合法。壊れたバイト列を
       出すより良い）。その時は warn を出す。
     ・Opus は **常に 48kHz で復号する** codec。SamplingFrequency と
       CodecDelay（pre-skip の ns 換算）は渡された sampleRate ではなく
       48000 で書く（RFC 7845 §5.1）。渡された値は OpusHead の
       「元の音の周波数」欄に入るだけ。ここを取り違えると
       exportAudio(44100Hz) が 9% 遅く鳴る。
     ・逐次出力で Cluster を閉じて良いのは「**全トラックが**その時刻を
       越えた」時だけ（watermarkMs）。全体の max で判断すると、映像だけ
       先に進んだ場面で Cluster を閉じてしまい、後から来た音声の相対時刻が
       16bit を外れて **書き出しの途中で throw** する。
     ・完成品は assembleFile で **1 回だけ確保**する。ebmlElement と
       concatBytes を重ねると中身の 3 倍を一度に握る（110MB の書き出しで
       330MB。iPhone で落ちる）。
     ・memory の様子は stats().bufferedBytes で見られる（既定モードは
       全 chunk を抱えるので、長尺は onData へ切り替える判断に使う）。
     ・EncodedVideoChunk は中身を直接読めない実装が在る。copyTo() で写す
       （normalizeChunk がどちらの形でも受ける）。渡された bytes は必ず
       **複製**して持つ（呼び出し側が使い回しても壊れないため）。
     ・低レベル（writeVInt / ebmlElement …）は試験のために export している。
       署名を変えると tests/mux-webm.test.mjs が落ちる。
     ・CONTRACT-NOTE: 共通前提の「1 ファイル 700 行超えたら分割」を
       超えている（検収後 989 行）。低レベル §1〜§3（writeVInt /
       writeUInt / writeFloat / ebmlElement / EBML_IDS / build* の純関数）を
       export/mux/ebml.js へ出せば 600 行を割るが、module の境界を動かす
       のは統合担当の判断なので ここでは分けていない。分ける時は
       webm.js から re-export すれば tests/mux-webm.test.mjs の import は
       そのままで済む。
     ・CONTRACT-NOTE: 契約書 §5 は muxer の関数名を定めていない。
       exporter.js の loadMuxer() は `createWebmMuxer` → `createWebMMuxer`
       → `createMuxer` → `default` の順で探し、設定を **平らな形**
       （{width,height,fps,videoCodec,audioCodec,sampleRate,numberOfChannels}）
       で渡してくる。そこで createWebMMuxer は入れ子（{video,audio}）と
       平らな形の **両方** を受け、別名も全部 export する。
   ══════════════════════════════════════════════════════════════════════════ */

import { warn } from "../../core/log.js";

/* ── 0. 定数 ───────────────────────────────────────────────────── */

/** timecodeScale の既定（1,000,000ns = 1ms 刻み）。Block の相対時刻の単位 */
export const DEFAULT_TIMECODE_SCALE = 1000000;
/** Block の相対時刻は 16bit 符号付き。これを超えたら Cluster を切る */
export const MAX_BLOCK_REL = 32767;
/** Cluster を切る目安（契約: 2 秒 か 4MB） */
export const CLUSTER_MAX_MS = 2000;
export const CLUSTER_MAX_BYTES = 4 * 1024 * 1024;
/** トラック番号は固定（1 = 映像 / 2 = 音声）。Cues も 1 を指す */
export const VIDEO_TRACK = 1;
export const AUDIO_TRACK = 2;
/** libopus の既定の先頭切り捨て（サンプル数）と seek 前の助走（ns） */
const OPUS_PRE_SKIP = 312;
const OPUS_SEEK_PRE_ROLL = 80000000;
/** Opus は **常に 48kHz で復号する**（RFC 7845 §5.1）。pre-skip もこの単位 */
const OPUS_RATE = 48000;
const MUXING_APP = "VQ Studio webm muxer";
const MIME = "video/webm";
/** 「大きさ不明」の vint（逐次出力の Segment 用） */
const UNKNOWN_SIZE = new Uint8Array([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);

/* ── 1. 低レベル: 数 → バイト列 ─────────────────────────────────── */

const te = typeof TextEncoder === "function" ? new TextEncoder() : null;

/** 文字列を UTF-8 に（DocType / CodecID / MuxingApp 用。ASCII しか入れない） */
export function utf8(s) {
  if (!te) throw new Error("utf8: この環境に TextEncoder が無いので webm を組めません");
  return te.encode(String(s));
}

/**
 * バイト列にできる物（Uint8Array / ArrayBuffer / 0..255 の数 / 文字列（UTF-8）/
 * それらの入れ子配列 / null（飛ばす））を 1 本に繋ぐ。
 * 注意: 部品が 1 つだけの時は複製せずそれを返す（速さのため）。
 */
export function concatBytes(parts) {
  /** @type {Uint8Array[]} */
  const flat = [];
  let total = 0;
  const push = (p) => {
    if (p === null || p === undefined) return;
    if (p instanceof Uint8Array) { flat.push(p); total += p.length; return; }
    if (typeof p === "string") { push(utf8(p)); return; }
    if (typeof p === "number") {
      if (!Number.isInteger(p) || p < 0 || p > 255) throw new RangeError(`concatBytes: 数は 0..255 のバイトだけです（${p}）`);
      flat.push(new Uint8Array([p])); total += 1; return;
    }
    if (Array.isArray(p)) { for (let i = 0; i < p.length; i++) push(p[i]); return; }
    if (p instanceof ArrayBuffer) { const u = new Uint8Array(p); flat.push(u); total += u.length; return; }
    if (ArrayBuffer.isView(p)) {
      const u = new Uint8Array(p.buffer, p.byteOffset, p.byteLength);
      flat.push(u); total += u.length; return;
    }
    throw new TypeError("concatBytes: バイト列にできない物が混ざっています");
  };
  push(parts);
  if (flat.length === 1) return flat[0];
  const out = new Uint8Array(total);
  let at = 0;
  for (let i = 0; i < flat.length; i++) { out.set(flat[i], at); at += flat[i].length; }
  return out;
}

/** 書ける整数かを確かめる（負・小数・NaN・2^53 超えは全て throw） */
function requireUInt(value, who) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${who}: 数を渡してください（渡された値: ${String(value)}）`);
  }
  if (value < 0) throw new RangeError(`${who}: 負の値は EBML に書けません（${value}）`);
  if (!Number.isInteger(value)) throw new RangeError(`${who}: 整数でないと書けません（${value}）`);
  if (value > Number.MAX_SAFE_INTEGER) throw new RangeError(`${who}: 大きすぎます（${value}）`);
  return value;
}

/** n バイトの vint に入る最大値（全ビット 1 は「大きさ不明」の予約なので -2） */
function vintMax(n) { return Math.pow(2, 7 * n) - 2; }

/**
 * EBML の可変長整数（要素の大きさ・トラック番号に使う）。
 * 1 バイト目の先頭に「何バイトか」を表すビットを立てる。
 * 全ビット 1 は「大きさ不明」の予約値なので、その値は 1 バイト伸ばす
 * （例: 127 は 0x7F ではなく 0x40 0x7F）。
 * @param {number} value 0 以上の整数
 * @param {number} [minBytes] 最低の幅（位置を後で書く所で幅を固定するため）
 */
export function writeVInt(value, minBytes) {
  const v = requireUInt(value, "writeVInt");
  let n = Math.max(1, Math.round(Number(minBytes) || 0));
  if (n > 8) throw new RangeError(`writeVInt: minBytes は 1..8 です（${minBytes}）`);
  while (n <= 8 && v > vintMax(n)) n++;
  if (n > 8) throw new RangeError(`writeVInt: 8 バイトに入りません（${v}）`);
  const out = new Uint8Array(n);
  let rest = v;
  for (let i = n - 1; i >= 0; i--) { out[i] = rest % 256; rest = Math.floor(rest / 256); }
  out[0] |= 1 << (8 - n);
  return out;
}

/** 「大きさ不明」の vint（8 バイト = 0x01FFFFFFFFFFFFFF）。逐次出力の Segment 用 */
export function writeVIntUnknown() { return UNKNOWN_SIZE.slice(); }

/**
 * 符号無し整数（ビッグエンディアン・最短の幅）。EBML の uint 要素の中身。
 * vint と違い 0 は 1 バイト（0x00）、127 は 0x7F、128 は 0x80。
 * @param {number} value 0 以上の整数
 * @param {number} [minBytes] 幅の下限（SeekPosition の幅固定に使う）
 */
export function writeUInt(value, minBytes) {
  const v = requireUInt(value, "writeUInt");
  let n = Math.max(1, Math.round(Number(minBytes) || 0));
  if (n > 8) throw new RangeError(`writeUInt: minBytes は 1..8 です（${minBytes}）`);
  while (n < 8 && v > Math.pow(2, 8 * n) - 1) n++;
  const out = new Uint8Array(n);
  let rest = v;
  for (let i = n - 1; i >= 0; i--) { out[i] = rest % 256; rest = Math.floor(rest / 256); }
  return out;
}

/**
 * IEEE754 の浮動小数（ビッグエンディアン）。Duration と SamplingFrequency 用。
 * @param {number} value
 * @param {4|8} [bytes] 既定 4。Duration は精度が要るので 8 を使う
 */
export function writeFloat(value, bytes) {
  const n = bytes === undefined || bytes === null ? 4 : Math.round(Number(bytes));
  if (n !== 4 && n !== 8) throw new RangeError(`writeFloat: 4 か 8 バイトだけです（${bytes}）`);
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`writeFloat: 有限の数を渡してください（${String(value)}）`);
  }
  const out = new Uint8Array(n);
  const dv = new DataView(out.buffer);
  if (n === 4) dv.setFloat32(0, value, false); else dv.setFloat64(0, value, false);
  return out;
}

/** 要素 id をバイト列に（id は 0x1A45DFA3 のように「印のビット込み」の数） */
export function idBytes(id) {
  if (id instanceof Uint8Array) return id;
  const b = writeUInt(requireUInt(id, "idBytes"));
  if (b.length > 4) throw new RangeError(`idBytes: id が長すぎます（${id}）`);
  return b;
}

/**
 * EBML の要素 1 つ = id + 大きさ(vint) + 中身。
 * @param {number|Uint8Array} id
 * @param {*} payload concatBytes が受ける物（入れ子配列も可）
 * @returns {Uint8Array}
 */
export function ebmlElement(id, payload) {
  const body = concatBytes(payload === undefined ? null : payload);
  return concatBytes([idBytes(id), writeVInt(body.length), body]);
}

/** uint / 文字列 / float の要素を作る小道具 */
function uintEl(id, v, minBytes) { return ebmlElement(id, writeUInt(v, minBytes)); }
function strEl(id, s) { return ebmlElement(id, utf8(s)); }
function floatEl(id, v, n) { return ebmlElement(id, writeFloat(v, n)); }

/* ── 2. EBML の id 表（Matroska の仕様どおり） ────────────────── */

export const EBML_IDS = Object.freeze({
  EBML: 0x1a45dfa3, EBMLVersion: 0x4286, EBMLReadVersion: 0x42f7,
  EBMLMaxIDLength: 0x42f2, EBMLMaxSizeLength: 0x42f3,
  DocType: 0x4282, DocTypeVersion: 0x4287, DocTypeReadVersion: 0x4285,
  Void: 0xec, CRC32: 0xbf,
  Segment: 0x18538067,
  SeekHead: 0x114d9b74, Seek: 0x4dbb, SeekID: 0x53ab, SeekPosition: 0x53ac,
  Info: 0x1549a966, TimecodeScale: 0x2ad7b1, Duration: 0x4489,
  MuxingApp: 0x4d80, WritingApp: 0x5741, DateUTC: 0x4461,
  Tracks: 0x1654ae6b, TrackEntry: 0xae,
  TrackNumber: 0xd7, TrackUID: 0x73c5, TrackType: 0x83,
  FlagEnabled: 0xb9, FlagDefault: 0x88, FlagForced: 0x55aa, FlagLacing: 0x9c,
  Language: 0x22b59c, CodecID: 0x86, CodecPrivate: 0x63a2, CodecName: 0x258688,
  DefaultDuration: 0x23e383, CodecDelay: 0x56aa, SeekPreRoll: 0x56bb,
  Video: 0xe0, PixelWidth: 0xb0, PixelHeight: 0xba,
  DisplayWidth: 0x54b0, DisplayHeight: 0x54ba,
  Audio: 0xe1, SamplingFrequency: 0xb5, Channels: 0x9f, BitDepth: 0x6264,
  Cluster: 0x1f43b675, Timecode: 0xe7, SimpleBlock: 0xa3,
  BlockGroup: 0xa0, Block: 0xa1, BlockDuration: 0x9b,
  Cues: 0x1c53bb6b, CuePoint: 0xbb, CueTime: 0xb3, CueTrackPositions: 0xb7,
  CueTrack: 0xf7, CueClusterPosition: 0xf1, CueRelativePosition: 0xf0,
});

/* ── 3. 各部の組み立て（全部ここで完結する純関数） ──────────────── */

/** EBML Header（ファイルの一番先頭。0x1A45DFA3 から始まる） */
export function buildEBMLHeader(opts) {
  const o = opts || {};
  return ebmlElement(EBML_IDS.EBML, [
    uintEl(EBML_IDS.EBMLVersion, 1), uintEl(EBML_IDS.EBMLReadVersion, 1),
    uintEl(EBML_IDS.EBMLMaxIDLength, 4), uintEl(EBML_IDS.EBMLMaxSizeLength, 8),
    strEl(EBML_IDS.DocType, o.docType || "webm"),
    uintEl(EBML_IDS.DocTypeVersion, int(o.docTypeVersion, 2)),
    uintEl(EBML_IDS.DocTypeReadVersion, int(o.docTypeReadVersion, 2)),
  ]);
}

/**
 * Segment の Info。
 * @param {{timecodeScale?:number, duration?:number|null,
 *          muxingApp?:string, writingApp?:string}} [opts]
 *   duration は **timecodeScale の単位**（既定の 1,000,000 なら ms）。
 *   null / 未指定なら Duration 要素を書かない（逐次出力はこちら）。
 */
export function buildSegmentInfo(opts) {
  const o = opts || {};
  const parts = [
    uintEl(EBML_IDS.TimecodeScale, int(o.timecodeScale, DEFAULT_TIMECODE_SCALE)),
    strEl(EBML_IDS.MuxingApp, o.muxingApp || MUXING_APP),
    strEl(EBML_IDS.WritingApp, o.writingApp || MUXING_APP),
  ];
  if (o.duration !== null && o.duration !== undefined) {
    const d = Number(o.duration);
    if (!Number.isFinite(d) || d < 0) throw new RangeError(`buildSegmentInfo: duration が変です（${String(o.duration)}）`);
    parts.push(floatEl(EBML_IDS.Duration, d, 8));
  }
  return ebmlElement(EBML_IDS.Info, parts);
}

/** Opus の CodecPrivate = OpusHead（**必ず 19 バイト**。全部リトルエンディアン） */
export function buildOpusHead(opts) {
  const o = opts || {};
  const channels = int(o.channels, 2);
  const sampleRate = int(o.sampleRate, 48000);
  const preSkip = int(o.preSkip, OPUS_PRE_SKIP);
  if (channels < 1 || channels > 8) throw new RangeError(`buildOpusHead: channels が変です（${channels}）`);
  if (sampleRate <= 0) throw new RangeError(`buildOpusHead: sampleRate が変です（${sampleRate}）`);
  const out = new Uint8Array(19);
  out.set(utf8("OpusHead"), 0);      // 0..7  印
  out[8] = 1;                        // 8     version
  out[9] = channels;                 // 9     チャンネル数
  const dv = new DataView(out.buffer);
  dv.setUint16(10, preSkip & 0xffff, true);        // 10..11 pre-skip（サンプル）
  dv.setUint32(12, sampleRate >>> 0, true);        // 12..15 元の標本化周波数
  dv.setInt16(16, int(o.outputGain, 0), true);     // 16..17 出力利得（Q7.8）
  out[18] = int(o.mappingFamily, 0);               // 18     チャンネル配置
  return out;
}

/** 渡された OpusHead から pre-skip を読む（CodecDelay を合わせるため） */
function preSkipOf(head, fallback) {
  if (!(head instanceof Uint8Array) || head.length < 12) return fallback;
  return new DataView(head.buffer, head.byteOffset, head.byteLength).getUint16(10, true);
}

/** どのトラックにも同じに書く所（lacing は使わないので 0 で固定） */
function trackCommon(n, uid, type, language) {
  return [
    uintEl(EBML_IDS.TrackNumber, n), uintEl(EBML_IDS.TrackUID, uid),
    uintEl(EBML_IDS.TrackType, type), uintEl(EBML_IDS.FlagEnabled, 1),
    uintEl(EBML_IDS.FlagDefault, 1), uintEl(EBML_IDS.FlagLacing, 0),
    strEl(EBML_IDS.Language, language || "und"),
  ];
}

/** 映像の TrackEntry */
function videoTrackEntry(v) {
  const n = int(v.trackNumber, VIDEO_TRACK);
  const w = int(v.width, 0), h = int(v.height, 0);
  if (!(w > 0) || !(h > 0)) throw new RangeError(`buildTracks: 映像の width/height が要ります（${w}x${h}）`);
  const fps = num(v.fps, 0);
  const parts = [
    ...trackCommon(n, int(v.trackUID, n), 1, v.language),
    strEl(EBML_IDS.CodecID, v.codec),
  ];
  if (v.codecPrivate && v.codecPrivate.length) parts.push(ebmlElement(EBML_IDS.CodecPrivate, v.codecPrivate));
  else if (v.codec === "V_AV1") warn("mux/webm", "AV1 は CodecPrivate が無いと再生できません（meta.decoderConfig.description を addVideoChunk の第 2 引数で渡してください）");
  if (fps > 0) parts.push(uintEl(EBML_IDS.DefaultDuration, Math.round(1e9 / fps)));
  parts.push(ebmlElement(EBML_IDS.Video, [
    uintEl(EBML_IDS.PixelWidth, w), uintEl(EBML_IDS.PixelHeight, h),
    uintEl(EBML_IDS.DisplayWidth, int(v.displayWidth, w)),
    uintEl(EBML_IDS.DisplayHeight, int(v.displayHeight, h)),
  ]));
  return ebmlElement(EBML_IDS.TrackEntry, parts);
}

/** 音声の TrackEntry（Opus は CodecPrivate / CodecDelay / SeekPreRoll が要る） */
function audioTrackEntry(a) {
  const n = int(a.trackNumber, AUDIO_TRACK);
  const rate = num(a.sampleRate, 48000);
  const ch = int(a.channels, 2);
  if (!(rate > 0)) throw new RangeError(`buildTracks: 音声の sampleRate が要ります（${rate}）`);
  if (!(ch > 0)) throw new RangeError(`buildTracks: 音声の channels が要ります（${ch}）`);
  const given = a.codecPrivate && a.codecPrivate.length ? toBytes(a.codecPrivate) : null;
  const isOpus = a.codec === "A_OPUS";
  if (!isOpus && !given) {
    throw new Error(`buildTracks: ${a.codec} は CodecPrivate（符号化器の頭）が無いと入れられません`);
  }
  const priv = given || buildOpusHead({ channels: ch, sampleRate: rate, preSkip: int(a.preSkip, OPUS_PRE_SKIP) });
  const parts = [
    ...trackCommon(n, int(a.trackUID, n), 2, a.language),
    strEl(EBML_IDS.CodecID, a.codec),
    ebmlElement(EBML_IDS.CodecPrivate, priv),
  ];
  /* Opus は 48kHz で復号する codec。OpusHead の sampleRate は「元の音の
     周波数」で再生用ではない（RFC 7845 §5.1）ので、Matroska の
     SamplingFrequency と pre-skip の ns 換算は **48000 で固定**する。
     ここを渡された rate でやると exportAudio(44100Hz) が 9% 狂い、
     24kHz 指定では CodecDelay が 2 倍（音ずれ）になる。 */
  let outRate = rate;
  if (isOpus) {
    if (rate !== OPUS_RATE) {
      warn("mux/webm", "Opus は 48kHz で復号するので SamplingFrequency は 48000 で書きます", rate);
      outRate = OPUS_RATE;
    }
    const skip = preSkipOf(priv, int(a.preSkip, OPUS_PRE_SKIP));
    parts.push(uintEl(EBML_IDS.CodecDelay, Math.round((skip / OPUS_RATE) * 1e9)));
    parts.push(uintEl(EBML_IDS.SeekPreRoll, OPUS_SEEK_PRE_ROLL));
  }
  parts.push(ebmlElement(EBML_IDS.Audio, [floatEl(EBML_IDS.SamplingFrequency, outRate, 8), uintEl(EBML_IDS.Channels, ch)]));
  return ebmlElement(EBML_IDS.TrackEntry, parts);
}

/**
 * Tracks（TrackEntry の並び）。
 * @param {{video?:object|null, audio?:object|null}} opts
 */
export function buildTracks(opts) {
  const o = opts || {};
  const parts = [];
  if (o.video) parts.push(videoTrackEntry(o.video));
  if (o.audio) parts.push(audioTrackEntry(o.audio));
  if (!parts.length) throw new Error("buildTracks: トラックが 1 つも在りません");
  return ebmlElement(EBML_IDS.Tracks, parts);
}

/**
 * SimpleBlock 1 つ（= 1 フレーム。lacing は使わない）。
 * 中身は「トラック番号(vint) + 相対時刻(int16 BE) + flags(1) + 生データ」。
 * @param {number} trackNumber
 * @param {number} relMs Cluster の Timecode からの相対（**16bit 符号付き**）
 * @param {Uint8Array} data
 * @param {boolean} [key] キーフレームなら flags に 0x80 を立てる
 */
export function simpleBlock(trackNumber, relMs, data, key) {
  if (!Number.isInteger(relMs)) throw new TypeError(`simpleBlock: 相対時刻は整数の ms です（${String(relMs)}）`);
  if (relMs < -32768 || relMs > MAX_BLOCK_REL) {
    throw new RangeError(`simpleBlock: 相対時刻 ${relMs} は 16bit 符号付きに入りません（Cluster を切ってください）`);
  }
  const tn = int(trackNumber, VIDEO_TRACK);
  if (!(tn >= 1)) throw new RangeError(`simpleBlock: トラック番号は 1 以上です（${String(trackNumber)}）`);
  const head = new Uint8Array(3);
  new DataView(head.buffer).setInt16(0, relMs, false);
  head[2] = key ? 0x80 : 0x00;
  return ebmlElement(EBML_IDS.SimpleBlock, [writeVInt(tn), head, data]);
}

/**
 * Cluster 1 つ。frame は {track, data, key, ms?, timestampUs?}。
 * @returns {{bytes:Uint8Array, timecodeMs:number,
 *            blocks:Array<{track:number, relMs:number, key:boolean, offset:number, size:number}>}}
 *   blocks[].offset は **Cluster の中身の先頭からの位置**（CueRelativePosition 用）。
 */
export function buildCluster(opts) {
  const o = opts || {};
  const frames = o.frames || [];
  if (!frames.length) throw new Error("buildCluster: frame が 1 つも在りません");
  const scale = int(o.timecodeScale, DEFAULT_TIMECODE_SCALE);
  const base = Math.max(0, o.timecodeMs === undefined || o.timecodeMs === null
    ? msOf(frames[0], scale) : int(o.timecodeMs, 0));
  const parts = [uintEl(EBML_IDS.Timecode, base)];
  const blocks = [];
  let at = parts[0].length;
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const rel = msOf(f, scale) - base;
    const b = simpleBlock(int(f.track, VIDEO_TRACK), rel, toBytes(f.data), !!f.key);
    blocks.push({ track: int(f.track, VIDEO_TRACK), relMs: rel, key: !!f.key, offset: at, size: b.length });
    parts.push(b);
    at += b.length;
  }
  return { bytes: ebmlElement(EBML_IDS.Cluster, parts), timecodeMs: base, blocks };
}

/**
 * Cues（索引）。entry は {timeMs, clusterPos, relPos, track}。
 * clusterPos / relPos は Segment の中身の先頭を 0 とした位置。
 */
export function buildCues(entries) {
  const list = entries || [];
  const points = list.map((e) => ebmlElement(EBML_IDS.CuePoint, [
    uintEl(EBML_IDS.CueTime, Math.max(0, int(e.timeMs, 0))),
    ebmlElement(EBML_IDS.CueTrackPositions, [
      uintEl(EBML_IDS.CueTrack, int(e.track, VIDEO_TRACK)),
      uintEl(EBML_IDS.CueClusterPosition, Math.max(0, int(e.clusterPos, 0))),
      uintEl(EBML_IDS.CueRelativePosition, Math.max(0, int(e.relPos, 0))),
    ]),
  ]));
  return ebmlElement(EBML_IDS.Cues, points);
}

/**
 * SeekHead。位置は **必ず 8 バイト固定**で書く（先に大きさを決めたいので、
 * 値が変わっても要素の長さが揺れてはいけない）。
 */
export function buildSeekHead(entries) {
  const list = entries || [];
  return ebmlElement(EBML_IDS.SeekHead, list.map((e) => ebmlElement(EBML_IDS.Seek, [
    ebmlElement(EBML_IDS.SeekID, idBytes(e.id)),
    uintEl(EBML_IDS.SeekPosition, Math.max(0, int(e.pos, 0)), 8),
  ])));
}

/**
 * 完成品（EBML Header + Segment）を **1 回の確保**で組む。
 * ebmlElement(Segment, body) → concatBytes([header, …]) と重ねると
 * 中身の大きさを **3 回**確保してしまう（1080p 5 分 ≒ 110MB なら 330MB。
 * iPhone ではこれで落ちる）。総量を先に数えて 1 本だけ確保し、
 * 写し終わった部品はその場で手放す。
 * @param {Uint8Array} header
 * @param {Array<Uint8Array|null>} parts Segment の中身（**この配列は壊す**）
 */
function assembleFile(header, parts) {
  let payload = 0;
  for (let i = 0; i < parts.length; i++) payload += parts[i].length;
  const segId = idBytes(EBML_IDS.Segment);
  const segSize = writeVInt(payload);
  const out = new Uint8Array(header.length + segId.length + segSize.length + payload);
  let at = 0;
  out.set(header, at); at += header.length;
  out.set(segId, at); at += segId.length;
  out.set(segSize, at); at += segSize.length;
  for (let i = 0; i < parts.length; i++) {
    out.set(parts[i], at); at += parts[i].length;
    parts[i] = null;                     // 写した物は即座に GC へ返す
  }
  return out;
}

/* ── 4. 小道具 ─────────────────────────────────────────────────── */

function num(v, d) { const n = Number(v); return Number.isFinite(n) ? n : d; }
function int(v, d) { const n = Number(v); return Number.isFinite(n) ? Math.round(n) : d; }
function firstNum(a, b, d) {
  const x = Number(a); if (Number.isFinite(x)) return x;
  const y = Number(b); if (Number.isFinite(y)) return y;
  return d;
}
/** ns → timecodeScale の刻み（既定なら ms）。round で揃える（monotonic） */
function msFromUs(us, scale) { return Math.round((us * 1000) / scale); }
function msOf(f, scale) {
  return Number.isFinite(f.ms) ? Math.round(f.ms) : msFromUs(num(f.timestampUs, 0), scale);
}
function toBytes(d) {
  if (d instanceof Uint8Array) return d;
  if (d instanceof ArrayBuffer) return new Uint8Array(d);
  if (ArrayBuffer.isView(d)) return new Uint8Array(d.buffer, d.byteOffset, d.byteLength);
  throw new TypeError("バイト列ではありません（Uint8Array を渡してください）");
}

/** WebCodecs の codec 文字列 → Matroska の CodecID */
export function videoCodecId(codec) {
  const s = String(codec === undefined || codec === null ? "" : codec).trim();
  if (!s) return "V_VP9";
  if (/^v_/i.test(s)) return s.toUpperCase();
  const t = s.toLowerCase();
  if (t.indexOf("vp9") === 0 || t.indexOf("vp09") === 0) return "V_VP9";
  if (t.indexOf("vp8") === 0 || t.indexOf("vp08") === 0) return "V_VP8";
  if (t.indexOf("av1") === 0 || t.indexOf("av01") === 0) return "V_AV1";
  throw new Error(`webm に入れられない映像コデックです: ${s}（VP9 / VP8 / AV1 だけ）`);
}
export function audioCodecId(codec) {
  const s = String(codec === undefined || codec === null ? "" : codec).trim();
  if (!s) return "A_OPUS";
  if (/^a_/i.test(s)) return s.toUpperCase();
  const t = s.toLowerCase();
  if (t.indexOf("opus") === 0) return "A_OPUS";
  if (t.indexOf("vorbis") === 0) return "A_VORBIS";
  throw new Error(`webm に入れられない音声コデックです: ${s}（Opus だけ）`);
}

/**
 * 設定を 1 つの形に揃える。入れ子（{video:{...},audio:{...}}）と
 * exporter.js が渡す平らな形の両方を受ける（冒頭の CONTRACT-NOTE）。
 */
function normalizeOptions(o) {
  const src = o && typeof o === "object" ? o : {};
  const vsrc = src.video === null ? null
    : src.video && typeof src.video === "object" ? src.video
    : (src.videoCodec || src.width || src.height) ? { codec: src.videoCodec, width: src.width, height: src.height, fps: src.fps } : null;
  const asrc = src.audio === null ? null
    : src.audio && typeof src.audio === "object" ? src.audio
    : src.audioCodec ? { codec: src.audioCodec, sampleRate: src.sampleRate, channels: firstNum(src.numberOfChannels, src.channels, 2) } : null;
  if (!vsrc && !asrc) throw new Error("createWebMMuxer: video か audio のどちらかは要ります");

  const video = vsrc ? {
    codec: videoCodecId(vsrc.codec), fps: num(vsrc.fps, 30),
    width: int(vsrc.width, 0), height: int(vsrc.height, 0),
    displayWidth: int(vsrc.displayWidth, int(vsrc.width, 0)),
    displayHeight: int(vsrc.displayHeight, int(vsrc.height, 0)),
    codecPrivate: vsrc.codecPrivate ? toBytes(vsrc.codecPrivate).slice() : null,
    trackNumber: VIDEO_TRACK, language: vsrc.language || "und",
  } : null;
  if (video && (!(video.width > 0) || !(video.height > 0))) {
    throw new RangeError(`createWebMMuxer: width/height が要ります（${video.width}x${video.height}）`);
  }
  if (video && !(video.fps > 0)) { warn("mux/webm", "fps が変なので 30 とみなします", vsrc.fps); video.fps = 30; }

  const audio = asrc ? {
    codec: audioCodecId(asrc.codec), sampleRate: num(asrc.sampleRate, 48000),
    channels: int(firstNum(asrc.channels, asrc.numberOfChannels, 2), 2),
    preSkip: int(asrc.preSkip, OPUS_PRE_SKIP),
    codecPrivate: asrc.codecPrivate ? toBytes(asrc.codecPrivate).slice() : null,
    trackNumber: AUDIO_TRACK, language: asrc.language || "und",
  } : null;

  if (audio && (!(audio.sampleRate > 0) || !(audio.channels > 0))) {
    throw new RangeError(`createWebMMuxer: 音声の sampleRate / channels が要ります（${audio.sampleRate}Hz ${audio.channels}ch）`);
  }

  const onData = typeof src.onData === "function" ? src.onData : null;
  return {
    video, audio, onData,
    timecodeScale: int(src.timecodeScale, DEFAULT_TIMECODE_SCALE),
    clusterMaxMs: Math.max(100, int(src.clusterMaxMs, CLUSTER_MAX_MS)),
    clusterMaxBytes: Math.max(64 * 1024, int(src.clusterMaxBytes, CLUSTER_MAX_BYTES)),
    /* 逐次出力で «遅れているトラック» を待つ上限。これを越えたら
       待たずに閉じる（待ち続けると溜め込みで逐次出力の意味が無くなる）。
       16bit 符号付き（32767ms）より十分小さく取る。 */
    maxLookaheadMs: Math.max(2000, Math.min(16000, int(src.maxLookaheadMs, 16000))),
    startAtZero: src.startAtZero !== false,
    retain: src.retain === undefined || src.retain === null ? !onData : !!src.retain,
    mime: src.mime || MIME,
  };
}

/**
 * Cluster を切る位置を探す。返り値は「そこから新しい Cluster」の添字（-1 = 切らない）。
 * 切るのは **キーフレームの所だけ**。ただし相対時刻が 16bit を超えるなら
 * 非キーでも切る（壊れたバイト列を出すより良い。Matroska 的にも合法）。
 */
function findCutIndex(frames, cfg, cutTrack) {
  if (frames.length < 2) return -1;
  const start = frames[0].ms;
  let bytes = frames[0].data.length;
  for (let i = 1; i < frames.length; i++) {
    const rel = frames[i].ms - start;
    if (rel > MAX_BLOCK_REL) {
      /* キーフレームの所で偶々この行に来る事も在るので、本当に非キーで
         切る時だけ warn する（嘘の警告で現場を惑わせない）。 */
      if (!(frames[i].track === cutTrack && frames[i].key)) {
        warn("mux/webm", "キーフレームが遠すぎるので非キーで Cluster を切ります", rel);
      }
      return i;
    }
    if (frames[i].track === cutTrack && frames[i].key && (rel >= cfg.clusterMaxMs || bytes >= cfg.clusterMaxBytes)) return i;
    bytes += frames[i].data.length;
  }
  return -1;
}

/** 並び順: 時刻 → トラック番号 → 来た順（stable sort が要る） */
function cmpFrame(a, b) { return (a.tsUs - b.tsUs) || (a.track - b.track) || (a.seq - b.seq); }

/* ── 5. muxer 本体 ─────────────────────────────────────────────── */

/**
 * WebM muxer を作る。
 * @param {{
 *   video?: {codec?:string, width:number, height:number, fps?:number, codecPrivate?:Uint8Array}|null,
 *   audio?: {codec?:string, sampleRate?:number, channels?:number, codecPrivate?:Uint8Array}|null,
 *   onData?: (bytes:Uint8Array) => void,
 *   retain?: boolean, startAtZero?: boolean,
 *   clusterMaxMs?: number, clusterMaxBytes?: number,
 *   width?:number, height?:number, fps?:number, videoCodec?:string,
 *   audioCodec?:string, sampleRate?:number, numberOfChannels?:number
 * }} options
 * @returns {{addVideoChunk:Function, addAudioChunk:Function, finalize:Function,
 *            finalizeBytes:Function, bytes:Function, dispose:Function,
 *            state:Function, stats:Function, mime:string}}
 */
export function createWebMMuxer(options) {
  const cfg = normalizeOptions(options);
  const cutTrack = cfg.video ? VIDEO_TRACK : AUDIO_TRACK;
  const st = {
    phase: "open",        // open → finalized → (disposed)
    frames: [],           // 溜める方式で持つ全 frame
    pending: [],          // 逐次方式でまだ Cluster に出来ていない frame
    emitted: [],          // 逐次方式で流したバイト列（retain の時だけ持つ）
    cues: [],             // {timeMs, clusterPos, relPos, track}
    written: 0,           // 逐次方式で流した総バイト数
    segmentDataStart: 0,  // Segment の中身が始まる絶対位置
    headWritten: false, newestMs: 0, baseUs: null, lastTimecodeMs: 0,
    seq: 0, vCount: 0, aCount: 0,
    /** トラック番号 → «そこまで来た» 時刻。1 本でも遅れていたら待つ */
    seenMs: Object.create(null),
    buffered: 0,          // memory に抱えている chunk の総バイト（iOS の判断材料）
    cueCount: 0,          // 直近に組んだファイルの Cues の数
    file: null,           // finalize 済みのバイト列
  };

  /* --- 受け取り --- */

  function ensureOpen(who) {
    if (st.phase === "disposed") throw new Error(`${who}: この muxer は dispose 済みです`);
    if (st.phase === "finalized") throw new Error(`${who}: finalize 済みなので もう追加できません`);
  }

  /** chunkLike / EncodedVideoChunk / EncodedAudioChunk を内部の形に揃える */
  function normalizeChunk(chunk, track, isVideo) {
    const what = isVideo ? "映像" : "音声";
    if (!chunk || typeof chunk !== "object") throw new TypeError(`${what}の chunk が在りません`);
    let data = null;
    if (chunk.data !== undefined && chunk.data !== null) {
      data = toBytes(chunk.data).slice();
    } else if (typeof chunk.copyTo === "function" && Number.isFinite(Number(chunk.byteLength))) {
      data = new Uint8Array(Number(chunk.byteLength));
      chunk.copyTo(data);
    } else {
      throw new TypeError(`${what}の chunk に data も copyTo も在りません`);
    }
    if (!data.length) throw new RangeError(`中身が空の${what} chunk は入れられません`);
    const tsUs = firstNum(chunk.timestampUs, chunk.timestamp, 0);
    const durUs = Math.max(0, firstNum(chunk.durationUs, chunk.duration, 0));
    const key = isVideo ? (chunk.key === true || chunk.type === "key") : true;
    return { track, data, tsUs, durUs, key, ms: 0, seq: st.seq++ };
  }

  /** meta.decoderConfig.description（符号化器の頭）を貰っておく */
  function captureCodecPrivate(meta, which) {
    const d = meta && meta.decoderConfig && meta.decoderConfig.description;
    if (!d) return;
    const t = which === "video" ? cfg.video : cfg.audio;
    if (!t || t.codecPrivate) return;
    try { t.codecPrivate = toBytes(d).slice(); }
    catch (_e) { warn("mux/webm", "decoderConfig.description を読めませんでした"); }
  }

  function accept(f) {
    st.buffered += f.data.length;
    if (cfg.onData) {
      if (st.baseUs === null) st.baseUs = cfg.startAtZero ? f.tsUs : 0;
      f.ms = msFromUs(f.tsUs - st.baseUs, cfg.timecodeScale);
      st.newestMs = Math.max(st.newestMs, f.ms);
      const seen = st.seenMs[f.track];
      if (seen === undefined || f.ms > seen) st.seenMs[f.track] = f.ms;
      st.pending.push(f);
      st.pending.sort(cmpFrame);
      flushReady(false);
    } else {
      st.frames.push(f);
    }
  }

  function addVideoChunk(chunk, meta) {
    ensureOpen("addVideoChunk");
    if (!cfg.video) throw new Error("addVideoChunk: 映像トラックの無い muxer です");
    const f = normalizeChunk(chunk, VIDEO_TRACK, true);
    captureCodecPrivate(meta, "video");
    if (st.vCount === 0 && !f.key) warn("mux/webm", "最初の映像 chunk がキーフレームではありません（再生機が頭を出せない事が在ります）");
    st.vCount++;
    accept(f);
  }

  function addAudioChunk(chunk, meta) {
    ensureOpen("addAudioChunk");
    if (!cfg.audio) throw new Error("addAudioChunk: 音声トラックの無い muxer です（audio を渡してください）");
    const f = normalizeChunk(chunk, AUDIO_TRACK, false);
    captureCodecPrivate(meta, "audio");
    st.aCount++;
    accept(f);
  }

  /* --- 逐次出力（onData） --- */

  /** 音声が映像より遅れて来る分の余裕。これだけ先が見えてから Cluster を閉じる */
  const GUARD_MS = 400;

  function emit(bytes) {
    st.written += bytes.length;
    if (cfg.retain) st.emitted.push(bytes);
    if (cfg.onData) cfg.onData(bytes);
  }

  /** EBML Header + 大きさ不明の Segment + Info（Duration 無し）+ Tracks */
  function writeHead() {
    if (st.headWritten) return;
    st.headWritten = true;
    const header = buildEBMLHeader({});
    const segHead = concatBytes([idBytes(EBML_IDS.Segment), UNKNOWN_SIZE]);
    st.segmentDataStart = header.length + segHead.length;
    emit(concatBytes([
      header, segHead,
      buildSegmentInfo({ timecodeScale: cfg.timecodeScale, duration: null }),
      buildTracks({ video: cfg.video, audio: cfg.audio }),
    ]));
  }

  function emitCluster(group) {
    writeHead();
    // Timecode は前の Cluster より戻さない（遅れて来た frame の相対時刻が
    // 負になるだけで済む。負の相対時刻は int16 なので合法）。
    // ただし **下に桁溢れる**（-32768 未満）ほど遅れた frame が来たら
    // 時刻を戻す。Cluster の時刻が前後しても再生機は読めるが、
    // 溢れたバイト列は誰も読めない（前は ここで RangeError で落ちていた）。
    let tc = Math.max(0, group[0].ms, st.lastTimecodeMs);
    if (tc - group[0].ms > 32768) {
      warn("mux/webm", "遅れて来た frame のために Cluster の時刻を戻します", group[0].ms, tc);
      tc = Math.max(0, group[0].ms);
    }
    st.lastTimecodeMs = tc;
    for (let i = 0; i < group.length; i++) st.buffered -= group[i].data.length;
    const c = buildCluster({ timecodeMs: tc, frames: group, timecodeScale: cfg.timecodeScale });
    const pos = st.written - st.segmentDataStart;
    addCue(c, pos);
    emit(c.bytes);
  }

  function addCue(c, clusterPos) {
    for (let i = 0; i < c.blocks.length; i++) {
      const b = c.blocks[i];
      if (b.track !== cutTrack || !b.key) continue;
      st.cues.push({ timeMs: c.timecodeMs + b.relMs, clusterPos, relPos: b.offset, track: b.track });
      return;
    }
  }

  /**
   * どのトラックも «ここまでは来た» と言える時刻。
   * 1 枚も来ていないトラックは数えない（音声が最初から無い書き出しで
   * 止まってしまわないため）。max ではなく **min** を見るのが要点で、
   * ここを全体の max にすると「映像だけ先に 40 秒進んだ」場面で
   * Cluster を閉じてしまい、後から来た音声の相対時刻が桁溢れして
   * 書き出しの途中で RangeError になる。
   */
  function watermarkMs() {
    let w = Infinity;
    for (const k in st.seenMs) { const v = st.seenMs[k]; if (v < w) w = v; }
    return w === Infinity ? -Infinity : w;
  }

  /** 切れる所まで Cluster にして流す。force は finalize の時（全部出す） */
  function flushReady(force) {
    for (;;) {
      if (!st.pending.length) return;
      const cut = findCutIndex(st.pending, cfg, cutTrack);
      if (cut < 0) break;
      if (!force) {
        const cutMs = st.pending[cut].ms;
        if (watermarkMs() - cutMs < GUARD_MS) {
          // 遅れているトラックを待つ。ただし待ち続けると溜め込みで
          // 逐次出力の意味が無くなるので、上限を越えたら諦めて閉じる。
          if (st.newestMs - cutMs < cfg.maxLookaheadMs) break;
          warn("mux/webm", "片方のトラックが遅れているので待たずに Cluster を閉じます", cutMs);
        }
      }
      emitCluster(st.pending.splice(0, cut));
    }
    if (force && st.pending.length) {
      emitCluster(st.pending);
      st.pending = [];
    }
  }

  /* --- 溜めて書く（既定） --- */

  /** 全 frame から完成品を組む。withDuration=false なら Duration を書かない */
  function buildFile(withDuration) {
    if (!st.frames.length) throw new Error("finalize: chunk が 1 つも在りません（空の webm は作れません）");
    const frames = st.frames.slice().sort(cmpFrame);
    const base = cfg.startAtZero ? frames[0].tsUs : 0;
    /* WebCodecs の EncodedAudioChunk は duration を **必ず入れてくれるとは
       限らない**。0 のまま最後の 1 枚を数えないと Info/Duration が
       1 packet 分（Opus なら 20ms）足りず、再生機が末尾を切る。
       そこで「そのトラックで最後に見た間隔」を控えて尺の代わりに使う。 */
    const lastTs = Object.create(null);
    const gapUs = Object.create(null);
    let endUs = 0;
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      f.ms = msFromUs(f.tsUs - base, cfg.timecodeScale);
      const prev = lastTs[f.track];
      if (prev !== undefined && f.tsUs > prev) gapUs[f.track] = f.tsUs - prev;
      lastTs[f.track] = f.tsUs;
      if (f.durUs > 0) endUs = Math.max(endUs, f.tsUs - base + f.durUs);
    }
    for (const k in lastTs) {
      const t = Number(k);
      const fallback = t === VIDEO_TRACK && cfg.video && cfg.video.fps > 0
        ? 1e6 / cfg.video.fps : num(gapUs[t], 0);
      endUs = Math.max(endUs, lastTs[t] - base + Math.max(0, fallback));
    }

    // Cluster を切って組む（bytes は位置に依らないので先に作れる）
    const clusters = [];
    let rest = frames;
    for (;;) {
      const cut = findCutIndex(rest, cfg, cutTrack);
      const group = cut < 0 ? rest : rest.slice(0, cut);
      clusters.push(buildCluster({ timecodeMs: Math.max(0, group[0].ms), frames: group, timecodeScale: cfg.timecodeScale }));
      if (cut < 0) break;
      rest = rest.slice(cut);
    }

    const info = buildSegmentInfo({
      timecodeScale: cfg.timecodeScale,
      duration: withDuration ? msFromUs(endUs, cfg.timecodeScale) : null,
    });
    const tracks = buildTracks({ video: cfg.video, audio: cfg.audio });

    // 位置（Segment の中身の先頭を 0 とする）を数える。
    // SeekHead は SeekPosition を 8 バイト固定にしているので、
    // 中身が 0 でも本物でも長さが変わらない → 先に長さだけ測れる。
    const seekPlan = [
      { id: EBML_IDS.Info, pos: 0 },
      { id: EBML_IDS.Tracks, pos: 0 },
      { id: EBML_IDS.Cues, pos: 0 },
    ];
    const seekLen = buildSeekHead(seekPlan).length;
    let at = seekLen;
    seekPlan[0].pos = at; at += info.length;
    seekPlan[1].pos = at; at += tracks.length;
    const cues = [];
    for (let i = 0; i < clusters.length; i++) {
      const c = clusters[i];
      for (let j = 0; j < c.blocks.length; j++) {
        const b = c.blocks[j];
        if (b.track !== cutTrack || !b.key) continue;
        cues.push({ timeMs: c.timecodeMs + b.relMs, clusterPos: at, relPos: b.offset, track: b.track });
        break;
      }
      at += c.bytes.length;
    }
    seekPlan[2].pos = at;
    const seekHead = buildSeekHead(seekPlan);
    if (seekHead.length !== seekLen) throw new Error("内部エラー: SeekHead の大きさが揺れました");

    st.cueCount = cues.length;
    const body = [seekHead, info, tracks];
    for (let i = 0; i < clusters.length; i++) { body.push(clusters[i].bytes); clusters[i].bytes = null; }
    body.push(buildCues(cues));
    return assembleFile(buildEBMLHeader({}), body);
  }

  /* --- 仕上げ --- */

  function doFinalize() {
    if (cfg.onData) {
      flushReady(true);
      writeHead();                       // chunk が 0 個でも頭は出す
      if (st.cues.length) emit(buildCues(st.cues));
      st.file = cfg.retain ? concatBytes(st.emitted) : null;
    } else {
      st.file = buildFile(true);
      st.written = st.file.length;       // 既定モードでも «出した量» を答える
    }
    st.phase = "finalized";
    st.frames = [];
    st.pending = [];
    st.buffered = 0;
  }

  function finalizeBytes() {
    if (st.phase === "disposed") throw new Error("finalizeBytes: この muxer は dispose 済みです");
    if (st.phase !== "finalized") doFinalize();
    if (!st.file) {
      throw new Error("finalizeBytes: onData（逐次出力）では全体のバイト列を持っていません（retain:true を渡すか onData で受けた bytes を繋いでください）");
    }
    return st.file;
  }

  function finalize() {
    const b = finalizeBytes();
    if (typeof Blob !== "function") throw new Error("finalize: この環境に Blob が無いので finalizeBytes() を使ってください");
    return new Blob([b], { type: cfg.mime });
  }

  function bytes() {
    if (st.phase === "disposed") throw new Error("bytes: この muxer は dispose 済みです");
    if (st.phase === "finalized") return st.file || new Uint8Array(0);
    if (cfg.onData) return cfg.retain ? concatBytes(st.emitted) : new Uint8Array(0);
    // 溜める方式では まだ何も書いていないので、今の chunk で «下書き» を組む
    return st.frames.length ? buildFile(true) : new Uint8Array(0);
  }

  function dispose() {
    st.phase = "disposed";
    st.frames = [];
    st.pending = [];
    st.emitted = [];
    st.cues = [];
    st.buffered = 0;
    st.file = null;
  }

  return {
    addVideoChunk, addAudioChunk,
    finalize, finalizeBytes, bytes, dispose,
    /** 今の様子（試験と画面の表示用） */
    state() { return st.phase; },
    stats() {
      return {
        phase: st.phase, videoChunks: st.vCount, audioChunks: st.aCount,
        /* 逐次は流しながら数えた分、既定は直近に組んだファイルの分。
           どちらのモードでも 0 のまま返さない（前は既定モードで
           cues も bytesWritten も常に 0 だった）。 */
        cues: cfg.onData ? st.cues.length : st.cueCount,
        pending: st.pending.length,
        streaming: !!cfg.onData, bytesWritten: st.written,
        /** memory に抱えている chunk の総バイト（長尺で onData に切り替える判断材料） */
        bufferedBytes: st.buffered,
      };
    },
    mime: cfg.mime,
  };
}

/* CONTRACT-NOTE: exporter.js の loadMuxer() が探す綴り全部に別名を付ける。
   どれで呼ばれても同じ物が返る（綴り違いで «muxer が無い» と言われないため）。 */
export const createWebmMuxer = createWebMMuxer;
export const createMuxer = createWebMMuxer;
export default createWebMMuxer;
