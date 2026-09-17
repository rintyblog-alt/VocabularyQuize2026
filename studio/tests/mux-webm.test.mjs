/* ══════════════════════════════════════════════════════════════════════════
   studio/tests/mux-webm.test.mjs — WebM muxer のバイト列を固める試験（契約書 §8）

   ★ 何をする所か
     export/mux/webm.js が出すバイト列を Node だけで確かめる。
     ①低レベル（writeVInt / writeUInt / writeFloat / ebmlElement / simpleBlock）は
       **手計算した期待値**と 1 バイトずつ比べる。
     ②偽の chunk を流して .webm を組み、この試験の中に書いた小さな EBML 読み器で
       「EBML Header → Segment（Info・Tracks・Cluster*・Cues）」の出現順・
       Cluster の切れ目・相対時刻・Cues の指す先を確かめる。

   ★ なぜこの形か
     ・muxer が壊れたバイト列を出しても、ブラウザは «再生できません» としか
       言わない。原因を追えるのは「どのバイトがおかしいか」を見る試験だけ。
     ・読み器を試験側に置くのは わざと。**書き手と読み手を別に書く**ことで
       「書いた物を自分の解釈で読み直して丸を付ける」ごまかしを防ぐ。
     ・Blob が無い環境でも回るよう finalizeBytes() を使う（契約どおり）。

   ★ 触るときの注意
     ・`cd /home/user/VocabularyQuize2026 && node --test studio/tests/mux-webm.test.mjs`
     ・時計も乱数も使わない = 出力は決定的。ここで比べた値が変わったら
       それは仕様変更なので、webm.js の見出しコメントも直す。
   ══════════════════════════════════════════════════════════════════════════ */

import test from "node:test";
import assert from "node:assert/strict";

import createDefault, {
  writeVInt, writeVIntUnknown, writeUInt, writeFloat, ebmlElement, idBytes, concatBytes,
  EBML_IDS, buildEBMLHeader, buildSegmentInfo, buildTracks, buildCluster, simpleBlock,
  buildOpusHead, buildCues, buildSeekHead, videoCodecId, audioCodecId,
  createWebMMuxer, createWebmMuxer, createMuxer,
  DEFAULT_TIMECODE_SCALE, VIDEO_TRACK, AUDIO_TRACK, MAX_BLOCK_REL,
  CLUSTER_MAX_MS,
} from "../src/export/mux/webm.js";

/* ── 小道具: バイト列の比較 ───────────────────────────────────── */

const hex = (u8) => Array.from(u8).map((b) => b.toString(16).padStart(2, "0")).join(" ");
function eqBytes(got, want, msg) {
  assert.deepEqual(Array.from(got), want, `${msg || "バイト列"} / 実際は [${hex(got)}]`);
}

/* ── 小道具: 試験側に置いた最小の EBML 読み器 ─────────────────── */

const MASTERS = new Set([
  EBML_IDS.EBML, EBML_IDS.Segment, EBML_IDS.SeekHead, EBML_IDS.Seek,
  EBML_IDS.Info, EBML_IDS.Tracks, EBML_IDS.TrackEntry, EBML_IDS.Video, EBML_IDS.Audio,
  EBML_IDS.Cluster, EBML_IDS.BlockGroup, EBML_IDS.Cues, EBML_IDS.CuePoint,
  EBML_IDS.CueTrackPositions,
]);

/** 先頭バイトの立っているビットから「何バイトか」を読む（id と大きさで同じ規則） */
function vintWidth(first, max) {
  for (let k = 0; k < max; k++) if (first & (0x80 >> k)) return k + 1;
  throw new Error(`vint が読めません（先頭 0x${first.toString(16)}）`);
}

function readId(b, i) {
  const width = vintWidth(b[i], 4);
  let id = 0;
  for (let k = 0; k < width; k++) id = id * 256 + b[i + k];
  return { id, width };
}

function readSize(b, i) {
  const width = vintWidth(b[i], 8);
  const mask = 0xff >> width;
  let size = b[i] & mask;
  let unknown = size === mask;
  for (let k = 1; k < width; k++) {
    size = size * 256 + b[i + k];
    if (b[i + k] !== 0xff) unknown = false;
  }
  return { size, width, unknown };
}

/** [start, end) を要素の並びとして読む。master 要素は children を持つ */
function walk(b, start, end) {
  const out = [];
  let i = start;
  while (i < end) {
    const id = readId(b, i);
    const sz = readSize(b, i + id.width);
    const dataStart = i + id.width + sz.width;
    const dataEnd = Math.min(sz.unknown ? end : dataStart + sz.size, end);
    const node = {
      id: id.id, start: i, dataStart, dataEnd,
      size: sz.size, unknown: sz.unknown,
      data: b.subarray(dataStart, dataEnd), children: null,
    };
    if (MASTERS.has(id.id)) node.children = walk(b, dataStart, dataEnd);
    out.push(node);
    i = dataEnd;
  }
  return out;
}

const kids = (node) => node.children || [];
const findEl = (nodes, id) => nodes.find((n) => n.id === id) || null;
const allEl = (nodes, id) => nodes.filter((n) => n.id === id);
const idsOf = (nodes) => nodes.map((n) => n.id);

function uintOf(node) {
  assert.ok(node, "要素が在りません");
  let v = 0;
  for (let i = 0; i < node.data.length; i++) v = v * 256 + node.data[i];
  return v;
}
function floatOf(node) {
  const d = node.data;
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  return d.length === 4 ? dv.getFloat32(0, false) : dv.getFloat64(0, false);
}
function strOf(node) { return Buffer.from(node.data).toString("utf8"); }

/** SimpleBlock の中身をほどく */
function parseBlock(node) {
  const d = node.data;
  const t = readSize(d, 0);
  const rel = (((d[t.width] << 8) | d[t.width + 1]) << 16) >> 16;
  return { track: t.size, relMs: rel, key: !!(d[t.width + 2] & 0x80), payload: d.subarray(t.width + 3) };
}

/** ファイル全体をほどいて、よく見る所を取り出す */
function openFile(bytes) {
  const top = walk(bytes, 0, bytes.length);
  const header = findEl(top, EBML_IDS.EBML);
  const segment = findEl(top, EBML_IDS.Segment);
  assert.ok(header, "EBML Header が在りません");
  assert.ok(segment, "Segment が在りません");
  const seg = kids(segment);
  const clusters = allEl(seg, EBML_IDS.Cluster).map((c) => ({
    node: c,
    timecodeMs: uintOf(findEl(kids(c), EBML_IDS.Timecode)),
    blocks: allEl(kids(c), EBML_IDS.SimpleBlock).map(parseBlock),
    pos: c.start - segment.dataStart,
  }));
  return {
    bytes, top, header, segment, seg,
    info: findEl(seg, EBML_IDS.Info),
    tracks: findEl(seg, EBML_IDS.Tracks),
    cues: findEl(seg, EBML_IDS.Cues),
    seekHead: findEl(seg, EBML_IDS.SeekHead),
    clusters,
  };
}

/* ── 小道具: 偽の chunk ───────────────────────────────────────── */

/** fps 10・既定 30 個 = 0〜2900ms。キーフレームは 10 個ごと（= 1 秒ごと） */
function fakeVideo(opts) {
  const o = opts || {};
  const n = o.n === undefined ? 30 : o.n;
  const fps = o.fps || 10;
  const keyEvery = o.keyEvery || 10;
  const size = o.size || 40;
  const dur = Math.round(1e6 / fps);
  const out = [];
  for (let i = 0; i < n; i++) {
    const key = i % keyEvery === 0;
    const data = new Uint8Array(key ? size * 2 : size);
    data.fill((i + 1) & 0xff);
    out.push({ data, timestampUs: i * dur, durationUs: dur, key });
  }
  return out;
}

/** Opus 風（20ms ごと。全部キーフレーム扱い） */
function fakeAudio(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const data = new Uint8Array(12);
    data.fill(0xa0 | (i & 15));
    out.push({ data, timestampUs: i * 20000, durationUs: 20000 });
  }
  return out;
}

const VIDEO = { codec: "V_VP9", width: 640, height: 360, fps: 10 };
const AUDIO = { codec: "A_OPUS", sampleRate: 48000, channels: 2 };

/** 映像（+ 音声）を流し込んで完成品のバイト列を貰う */
function muxFile(opts) {
  const o = opts || {};
  const m = createWebMMuxer({ video: o.video || VIDEO, audio: o.audio || null });
  for (const c of (o.videoChunks || fakeVideo())) m.addVideoChunk(c);
  for (const c of (o.audioChunks || [])) m.addAudioChunk(c);
  return { m, bytes: m.finalizeBytes() };
}

/* ══ 1. writeVInt（要素の大きさ・トラック番号） ══════════════════ */

test("writeVInt: 境界（全ビット 1 は «大きさ不明» の予約なので 1 バイト伸びる）", () => {
  eqBytes(writeVInt(0), [0x80], "0");
  eqBytes(writeVInt(1), [0x81], "1");
  eqBytes(writeVInt(126), [0xfe], "126 = 1 バイトの上限");
  eqBytes(writeVInt(127), [0x40, 0x7f], "127 は 0x7F（不明）と被るので 2 バイト");
  eqBytes(writeVInt(128), [0x40, 0x80], "128");
  eqBytes(writeVInt(16382), [0x7f, 0xfe], "16382 = 2 バイトの上限");
  eqBytes(writeVInt(16383), [0x20, 0x3f, 0xff], "16383 は 3 バイト");
  eqBytes(writeVInt(2097150), [0x3f, 0xff, 0xfe], "2^21-2 = 3 バイトの上限");
  eqBytes(writeVInt(2097151), [0x10, 0x1f, 0xff, 0xff], "2^21-1 は 4 バイト");
  eqBytes(writeVInt(2 ** 21), [0x10, 0x20, 0x00, 0x00], "2^21");
});

test("writeVInt: minBytes で幅を固定できる（位置を後で書く所で使う）", () => {
  eqBytes(writeVInt(0, 4), [0x10, 0x00, 0x00, 0x00], "0 を 4 バイトで");
  eqBytes(writeVInt(1, 8), [0x01, 0, 0, 0, 0, 0, 0, 0x01], "1 を 8 バイトで");
  assert.equal(writeVInt(5, 2).length, 2);
});

test("writeVInt: 負値・小数・NaN・大きすぎる値は throw", () => {
  assert.throws(() => writeVInt(-1), RangeError, "負値");
  assert.throws(() => writeVInt(-0.5), RangeError, "負の小数");
  assert.throws(() => writeVInt(1.5), RangeError, "小数");
  assert.throws(() => writeVInt(NaN), TypeError, "NaN");
  assert.throws(() => writeVInt(Infinity), TypeError, "Infinity");
  assert.throws(() => writeVInt("128"), TypeError, "文字列");
  assert.throws(() => writeVInt(Number.MAX_SAFE_INTEGER + 2), RangeError, "2^53 超え");
  assert.throws(() => writeVInt(0, 9), RangeError, "minBytes が 9");
});

test("writeVIntUnknown: 8 バイトの «大きさ不明»", () => {
  eqBytes(writeVIntUnknown(), [0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff], "不明");
});

/* ══ 2. writeUInt / writeFloat ══════════════════════════════════ */

test("writeUInt: 境界（vint と違い 127/128 は 1 バイト）", () => {
  eqBytes(writeUInt(0), [0x00], "0");
  eqBytes(writeUInt(127), [0x7f], "127");
  eqBytes(writeUInt(128), [0x80], "128");
  eqBytes(writeUInt(255), [0xff], "255");
  eqBytes(writeUInt(256), [0x01, 0x00], "256");
  eqBytes(writeUInt(16383), [0x3f, 0xff], "16383");
  eqBytes(writeUInt(65535), [0xff, 0xff], "65535");
  eqBytes(writeUInt(2 ** 21), [0x20, 0x00, 0x00], "2^21");
  eqBytes(writeUInt(1000000), [0x0f, 0x42, 0x40], "timecodeScale の 1,000,000");
  eqBytes(writeUInt(7, 8), [0, 0, 0, 0, 0, 0, 0, 7], "8 バイト固定");
});

test("writeUInt: 負値・小数は throw", () => {
  assert.throws(() => writeUInt(-1), RangeError, "負値");
  assert.throws(() => writeUInt(1.5), RangeError, "小数");
  assert.throws(() => writeUInt(undefined), TypeError, "undefined");
});

test("writeFloat: ビッグエンディアンの IEEE754", () => {
  eqBytes(writeFloat(1, 4), [0x3f, 0x80, 0x00, 0x00], "1.0（32bit）");
  eqBytes(writeFloat(-2, 4), [0xc0, 0x00, 0x00, 0x00], "-2.0（32bit）");
  eqBytes(writeFloat(0, 4), [0, 0, 0, 0], "0（32bit）");
  eqBytes(writeFloat(1, 8), [0x3f, 0xf0, 0, 0, 0, 0, 0, 0], "1.0（64bit）");
  eqBytes(writeFloat(48000, 8), [0x40, 0xe7, 0x70, 0, 0, 0, 0, 0], "48000（64bit）");
  assert.equal(writeFloat(3000, 8).length, 8, "既定の幅");
  assert.throws(() => writeFloat(1, 3), RangeError, "3 バイトは無い");
  assert.throws(() => writeFloat(NaN, 8), TypeError, "NaN");
});

/* ══ 3. ebmlElement / simpleBlock ═══════════════════════════════ */

test("ebmlElement: id + 大きさ + 中身（手計算）", () => {
  eqBytes(ebmlElement(0x4286, writeUInt(1)), [0x42, 0x86, 0x81, 0x01], "EBMLVersion=1");
  eqBytes(ebmlElement(EBML_IDS.DocType, "webm"),
    [0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d], "DocType=webm");
  eqBytes(ebmlElement(EBML_IDS.SimpleBlock, new Uint8Array(0)), [0xa3, 0x80], "中身が空");
  eqBytes(ebmlElement(0xec, [1, 2, 3]), [0xec, 0x83, 1, 2, 3], "数の並びも受ける");
  // 130 バイトは 1 バイトの vint（上限 126）に入らないので大きさが 2 バイトになる
  const big = ebmlElement(0xec, new Uint8Array(130));
  eqBytes(big.subarray(0, 3), [0xec, 0x40, 0x82], "130 バイトの大きさ");
  assert.equal(big.length, 3 + 130, "全長");
  eqBytes(idBytes(EBML_IDS.EBML), [0x1a, 0x45, 0xdf, 0xa3], "EBML の id");
  eqBytes(concatBytes([[0x01], new Uint8Array([0x02]), null, [[0x03]]]), [1, 2, 3], "入れ子の連結");
});

test("simpleBlock: トラック番号 + 相対時刻(int16) + flags + 生データ", () => {
  eqBytes(simpleBlock(1, 0, new Uint8Array([1, 2, 3]), true),
    [0xa3, 0x87, 0x81, 0x00, 0x00, 0x80, 1, 2, 3], "キーフレーム");
  eqBytes(simpleBlock(1, 0, new Uint8Array([1, 2, 3]), false),
    [0xa3, 0x87, 0x81, 0x00, 0x00, 0x00, 1, 2, 3], "非キー");
  eqBytes(simpleBlock(2, 1000, new Uint8Array([9]), true),
    [0xa3, 0x85, 0x82, 0x03, 0xe8, 0x80, 9], "トラック 2・1000ms");
  eqBytes(simpleBlock(1, -1, new Uint8Array([9]), false),
    [0xa3, 0x85, 0x81, 0xff, 0xff, 0x00, 9], "負の相対時刻も書ける");
  eqBytes(simpleBlock(1, MAX_BLOCK_REL, new Uint8Array([9]), true),
    [0xa3, 0x85, 0x81, 0x7f, 0xff, 0x80, 9], "16bit の上限");
  assert.throws(() => simpleBlock(1, 40000, new Uint8Array([9]), true), RangeError, "16bit 超え");
  assert.throws(() => simpleBlock(1, -40000, new Uint8Array([9]), true), RangeError, "16bit 下回り");
  assert.throws(() => simpleBlock(1, 1.5, new Uint8Array([9]), true), TypeError, "小数の ms");
});

/* ══ 4. 各部の組み立て ═════════════════════════════════════════ */

test("buildEBMLHeader: 先頭が 1A 45 DF A3 で DocType が webm", () => {
  const h = buildEBMLHeader({});
  eqBytes(h.subarray(0, 4), [0x1a, 0x45, 0xdf, 0xa3], "EBML の id");
  const el = walk(h, 0, h.length);
  assert.equal(el.length, 1);
  const c = kids(el[0]);
  assert.equal(strOf(findEl(c, EBML_IDS.DocType)), "webm");
  assert.equal(uintOf(findEl(c, EBML_IDS.EBMLVersion)), 1);
  assert.equal(uintOf(findEl(c, EBML_IDS.EBMLMaxIDLength)), 4);
  assert.equal(uintOf(findEl(c, EBML_IDS.EBMLMaxSizeLength)), 8);
  assert.equal(uintOf(findEl(c, EBML_IDS.DocTypeVersion)), 2);
  const mk = buildEBMLHeader({ docType: "matroska" });
  assert.equal(strOf(findEl(kids(walk(mk, 0, mk.length)[0]), EBML_IDS.DocType)), "matroska", "DocType は選べる");
});

test("buildSegmentInfo: timecodeScale は 1,000,000 / Duration は有無を選べる", () => {
  const a = buildSegmentInfo({});
  const ka = kids(walk(a, 0, a.length)[0]);
  assert.equal(uintOf(findEl(ka, EBML_IDS.TimecodeScale)), DEFAULT_TIMECODE_SCALE);
  assert.equal(findEl(ka, EBML_IDS.Duration), null, "既定では Duration を書かない");
  assert.ok(strOf(findEl(ka, EBML_IDS.MuxingApp)).length > 0, "MuxingApp");

  const b = buildSegmentInfo({ duration: 3000 });
  const kb = kids(walk(b, 0, b.length)[0]);
  const d = findEl(kb, EBML_IDS.Duration);
  assert.equal(d.data.length, 8, "Duration は 64bit float");
  assert.equal(floatOf(d), 3000);
  assert.throws(() => buildSegmentInfo({ duration: -1 }), RangeError, "負の Duration");
});

test("buildOpusHead: 19 バイト。中身は全部リトルエンディアン", () => {
  const h = buildOpusHead({ channels: 2, sampleRate: 48000, preSkip: 312 });
  assert.equal(h.length, 19, "OpusHead は 19 バイト");
  assert.equal(Buffer.from(h.subarray(0, 8)).toString("ascii"), "OpusHead");
  assert.equal(h[8], 1, "version");
  assert.equal(h[9], 2, "channels");
  eqBytes(h.subarray(10, 12), [0x38, 0x01], "pre-skip 312 = 0x0138（LE）");
  eqBytes(h.subarray(12, 16), [0x80, 0xbb, 0x00, 0x00], "48000 = 0x0000BB80（LE）");
  eqBytes(h.subarray(16, 18), [0x00, 0x00], "output gain");
  assert.equal(h[18], 0, "channel mapping family");
  const mono = buildOpusHead({ channels: 1, sampleRate: 24000, preSkip: 0 });
  assert.equal(mono[9], 1);
  eqBytes(mono.subarray(12, 16), [0xc0, 0x5d, 0x00, 0x00], "24000（LE）");
  assert.throws(() => buildOpusHead({ channels: 0 }), RangeError, "0 チャンネル");
});

test("buildTracks: 映像 1 本 / 映像 + 音声で TrackEntry が 2 つ", () => {
  const one = buildTracks({ video: VIDEO });
  const kOne = kids(walk(one, 0, one.length)[0]);
  assert.equal(allEl(kOne, EBML_IDS.TrackEntry).length, 1, "映像だけなら 1 本");

  const two = buildTracks({ video: VIDEO, audio: AUDIO });
  const entries = allEl(kids(walk(two, 0, two.length)[0]), EBML_IDS.TrackEntry);
  assert.equal(entries.length, 2, "映像 + 音声で 2 本");

  const v = kids(entries[0]);
  assert.equal(uintOf(findEl(v, EBML_IDS.TrackNumber)), VIDEO_TRACK);
  assert.equal(uintOf(findEl(v, EBML_IDS.TrackType)), 1, "1 = 映像");
  assert.equal(strOf(findEl(v, EBML_IDS.CodecID)), "V_VP9");
  assert.equal(uintOf(findEl(v, EBML_IDS.DefaultDuration)), 1e8, "fps 10 → 100,000,000ns");
  assert.equal(uintOf(findEl(v, EBML_IDS.FlagLacing)), 0, "lacing は使わない");
  const vv = kids(findEl(v, EBML_IDS.Video));
  assert.equal(uintOf(findEl(vv, EBML_IDS.PixelWidth)), 640);
  assert.equal(uintOf(findEl(vv, EBML_IDS.PixelHeight)), 360);
  assert.equal(uintOf(findEl(vv, EBML_IDS.DisplayWidth)), 640);

  const a = kids(entries[1]);
  assert.equal(uintOf(findEl(a, EBML_IDS.TrackNumber)), AUDIO_TRACK);
  assert.equal(uintOf(findEl(a, EBML_IDS.TrackType)), 2, "2 = 音声");
  assert.equal(strOf(findEl(a, EBML_IDS.CodecID)), "A_OPUS");
  assert.equal(uintOf(findEl(a, EBML_IDS.SeekPreRoll)), 80000000, "Opus の助走 80ms");
  assert.equal(uintOf(findEl(a, EBML_IDS.CodecDelay)), Math.round((312 / 48000) * 1e9), "pre-skip 分の遅れ");
  const priv = findEl(a, EBML_IDS.CodecPrivate);
  assert.equal(priv.data.length, 19, "CodecPrivate = OpusHead 19 バイト");
  eqBytes(priv.data, Array.from(buildOpusHead({ channels: 2, sampleRate: 48000, preSkip: 312 })), "OpusHead");
  const aa = kids(findEl(a, EBML_IDS.Audio));
  assert.equal(floatOf(findEl(aa, EBML_IDS.SamplingFrequency)), 48000);
  assert.equal(uintOf(findEl(aa, EBML_IDS.Channels)), 2);

  assert.throws(() => buildTracks({}), /トラックが 1 つも/, "空");
  assert.throws(() => buildTracks({ video: { codec: "V_VP9", width: 0, height: 0 } }), RangeError, "大きさ無し");
});

test("buildCluster: Timecode と blocks[].offset（Cues が指す位置）", () => {
  const frames = [
    { track: 1, ms: 2000, key: true, data: new Uint8Array([1, 2, 3, 4]) },
    { track: 2, ms: 2020, key: true, data: new Uint8Array([5, 6]) },
    { track: 1, ms: 2100, key: false, data: new Uint8Array([7]) },
  ];
  const c = buildCluster({ timecodeMs: 2000, frames });
  assert.equal(c.timecodeMs, 2000);
  assert.deepEqual(c.blocks.map((b) => b.relMs), [0, 20, 100], "相対時刻");
  assert.deepEqual(c.blocks.map((b) => b.track), [1, 2, 1]);
  // Timecode 要素（0xE7 + 大きさ + 2000 の 2 バイト）= 4 バイト。最初の Block はその直後
  assert.equal(c.blocks[0].offset, 4, "Cluster の中身の先頭からの位置");
  assert.equal(c.blocks[1].offset, 4 + c.blocks[0].size);
  const el = walk(c.bytes, 0, c.bytes.length)[0];
  assert.equal(el.id, EBML_IDS.Cluster);
  assert.equal(uintOf(findEl(kids(el), EBML_IDS.Timecode)), 2000);
  // blocks[].offset が本当にその位置を指しているか、バイト列側から確かめる
  const inside = c.bytes.subarray(el.dataStart);
  assert.equal(inside[c.blocks[0].offset], 0xa3, "offset の所に SimpleBlock が在る");
  assert.equal(inside[c.blocks[1].offset], 0xa3);
  assert.throws(() => buildCluster({ frames: [] }), /frame が 1 つも/, "空");
});

test("buildCues / buildSeekHead: SeekPosition は 8 バイト固定で長さが揺れない", () => {
  const cues = buildCues([{ timeMs: 0, clusterPos: 10, relPos: 4, track: 1 }]);
  const cp = allEl(kids(walk(cues, 0, cues.length)[0]), EBML_IDS.CuePoint);
  assert.equal(cp.length, 1);
  assert.equal(uintOf(findEl(kids(cp[0]), EBML_IDS.CueTime)), 0);
  const tp = kids(findEl(kids(cp[0]), EBML_IDS.CueTrackPositions));
  assert.equal(uintOf(findEl(tp, EBML_IDS.CueClusterPosition)), 10);
  assert.equal(uintOf(findEl(tp, EBML_IDS.CueRelativePosition)), 4);

  const plan = [{ id: EBML_IDS.Info, pos: 0 }, { id: EBML_IDS.Tracks, pos: 0 }];
  const zero = buildSeekHead(plan);
  const real = buildSeekHead([{ id: EBML_IDS.Info, pos: 12345678 }, { id: EBML_IDS.Tracks, pos: 99 }]);
  assert.equal(zero.length, real.length, "位置が変わっても長さは同じ（先に大きさを決めるため）");
  const seeks = allEl(kids(walk(real, 0, real.length)[0]), EBML_IDS.Seek);
  assert.equal(uintOf(findEl(kids(seeks[0]), EBML_IDS.SeekPosition)), 12345678);
  eqBytes(findEl(kids(seeks[0]), EBML_IDS.SeekID).data, [0x15, 0x49, 0xa9, 0x66], "Info の id");
});

test("videoCodecId / audioCodecId: WebCodecs の綴りを CodecID に直す", () => {
  assert.equal(videoCodecId("vp09.00.10.08"), "V_VP9");
  assert.equal(videoCodecId("vp8"), "V_VP8");
  assert.equal(videoCodecId("av01.0.04M.08"), "V_AV1");
  assert.equal(videoCodecId("V_VP9"), "V_VP9");
  assert.equal(videoCodecId(undefined), "V_VP9", "未指定は VP9");
  assert.throws(() => videoCodecId("avc1.640028"), /入れられない/, "H.264 は webm に入らない");
  assert.equal(audioCodecId("opus"), "A_OPUS");
  assert.equal(audioCodecId("A_OPUS"), "A_OPUS");
  assert.throws(() => audioCodecId("mp4a.40.2"), /入れられない/, "AAC は webm に入らない");
});

/* ══ 5. 通しで組む（偽 chunk 30 個） ═══════════════════════════ */

test("偽 chunk 30 個: 先頭が 1A45DFA3 で Segment の中が Info→Tracks→Cluster→Cues の順", () => {
  const { bytes } = muxFile({});
  eqBytes(bytes.subarray(0, 4), [0x1a, 0x45, 0xdf, 0xa3], "ファイルの先頭");
  const f = openFile(bytes);
  assert.deepEqual(idsOf(f.top), [EBML_IDS.EBML, EBML_IDS.Segment], "最上位は 2 つだけ");
  assert.equal(f.segment.unknown, false, "溜める方式では Segment の大きさが判っている");
  assert.equal(f.segment.dataEnd, bytes.length, "Segment がファイルの最後まで");

  const order = idsOf(f.seg);
  assert.deepEqual(order.slice(0, 3), [EBML_IDS.SeekHead, EBML_IDS.Info, EBML_IDS.Tracks], "頭の並び");
  assert.equal(order[order.length - 1], EBML_IDS.Cues, "Cues は最後");
  assert.equal(order.indexOf(EBML_IDS.Cluster) > order.indexOf(EBML_IDS.Tracks), true, "Cluster は Tracks の後");
  assert.equal(allEl(f.seg, EBML_IDS.Cluster).length, f.clusters.length);

  // Duration = 最後のフレームの終わり = 2900 + 100 = 3000ms
  assert.equal(floatOf(findEl(kids(f.info), EBML_IDS.Duration)), 3000, "Duration");
  assert.equal(uintOf(findEl(kids(f.info), EBML_IDS.TimecodeScale)), 1000000, "1ms 刻み");
  assert.equal(allEl(kids(f.tracks), EBML_IDS.TrackEntry).length, 1, "映像だけ");
});

test("偽 chunk 30 個: Cluster は 2 秒ごとに切れ、SimpleBlock の相対時刻が合う", () => {
  const { bytes } = muxFile({});
  const f = openFile(bytes);
  assert.deepEqual(f.clusters.map((c) => c.timecodeMs), [0, 2000], "0ms と 2000ms で始まる");
  assert.deepEqual(f.clusters.map((c) => c.blocks.length), [20, 10], "20 枚 + 10 枚");
  // 1 つ目: 0,100,…,1900 / 2 つ目: 0,100,…,900
  assert.deepEqual(f.clusters[0].blocks.map((b) => b.relMs),
    [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900]);
  assert.deepEqual(f.clusters[1].blocks.map((b) => b.relMs),
    [0, 100, 200, 300, 400, 500, 600, 700, 800, 900]);
  for (const c of f.clusters) {
    for (const b of c.blocks) {
      assert.equal(b.track, VIDEO_TRACK, "全部映像トラック");
      assert.ok(b.relMs >= 0 && b.relMs <= MAX_BLOCK_REL, `相対時刻が 16bit に収まる（${b.relMs}）`);
    }
  }
  // 生データがそのまま入っているか（1 枚目は 1 で埋めた 80 バイト）
  const first = f.clusters[0].blocks[0].payload;
  assert.equal(first.length, 80);
  assert.equal(first[0], 1);
  assert.equal(f.clusters[1].blocks[0].payload[0], 21, "21 枚目のフレーム");
});

test("Cluster は必ずキーフレームで始まる（2 秒を過ぎてもキーを待つ）", () => {
  const { bytes } = muxFile({});
  const f = openFile(bytes);
  for (const c of f.clusters) assert.equal(c.blocks[0].key, true, `Cluster ${c.timecodeMs}ms の頭がキー`);

  // キーフレームが 2.5 秒ごとしか無い素材 → 切れ目は 2000 ではなく 2500
  const sparse = muxFile({ videoChunks: fakeVideo({ n: 60, keyEvery: 25 }) });
  const g = openFile(sparse.bytes);
  assert.deepEqual(g.clusters.map((c) => c.timecodeMs), [0, 2500, 5000], "キーの所まで待つ");
  for (const c of g.clusters) assert.equal(c.blocks[0].key, true, "非キーで始まらない");

  // 9 秒 = 2 秒ごとに切れて 5 つ
  const long = muxFile({ videoChunks: fakeVideo({ n: 90 }) });
  const h = openFile(long.bytes);
  assert.deepEqual(h.clusters.map((c) => c.timecodeMs), [0, 2000, 4000, 6000, 8000], "2 秒ごと");
  assert.equal(h.clusters.reduce((s, c) => s + c.blocks.length, 0), 90, "90 枚が全部入る");
});

test("Cues が Cluster の実際の位置を指している（seek できる）", () => {
  const { bytes } = muxFile({});
  const f = openFile(bytes);
  const points = allEl(kids(f.cues), EBML_IDS.CuePoint);
  assert.equal(points.length, f.clusters.length, "Cluster ごとに 1 つ");
  points.forEach((p, i) => {
    const time = uintOf(findEl(kids(p), EBML_IDS.CueTime));
    const tp = kids(findEl(kids(p), EBML_IDS.CueTrackPositions));
    const cpos = uintOf(findEl(tp, EBML_IDS.CueClusterPosition));
    const rpos = uintOf(findEl(tp, EBML_IDS.CueRelativePosition));
    assert.equal(uintOf(findEl(tp, EBML_IDS.CueTrack)), VIDEO_TRACK);
    assert.equal(time, f.clusters[i].timecodeMs, "CueTime");
    assert.equal(cpos, f.clusters[i].pos, "CueClusterPosition は Segment の中身からの位置");
    // その位置へ飛ぶと本当に Cluster の id が在る
    const at = f.segment.dataStart + cpos;
    eqBytes(bytes.subarray(at, at + 4), [0x1f, 0x43, 0xb6, 0x75], "飛び先が Cluster");
    const inside = at + (f.clusters[i].node.dataStart - f.clusters[i].node.start);
    assert.equal(bytes[inside + rpos], 0xa3, "CueRelativePosition の所に SimpleBlock");
  });
});

test("SeekHead が Info / Tracks / Cues の位置を正しく指している", () => {
  const { bytes } = muxFile({});
  const f = openFile(bytes);
  const seeks = allEl(kids(f.seekHead), EBML_IDS.Seek);
  assert.equal(seeks.length, 3, "Info・Tracks・Cues");
  const want = [f.info, f.tracks, f.cues];
  seeks.forEach((s, i) => {
    const pos = uintOf(findEl(kids(s), EBML_IDS.SeekPosition));
    assert.equal(findEl(kids(s), EBML_IDS.SeekPosition).data.length, 8, "8 バイト固定");
    assert.equal(f.segment.dataStart + pos, want[i].start, "指し先が合っている");
  });
});

/* ══ 6. 音声を混ぜる ═══════════════════════════════════════════ */

test("音声トラックを足すと TrackEntry が 2 つになり、Block が混ざって並ぶ", () => {
  const { bytes } = muxFile({ audio: AUDIO, audioChunks: fakeAudio(150) });
  const f = openFile(bytes);
  const entries = allEl(kids(f.tracks), EBML_IDS.TrackEntry);
  assert.equal(entries.length, 2, "映像 + 音声");
  assert.equal(strOf(findEl(kids(entries[1]), EBML_IDS.CodecID)), "A_OPUS");
  const priv = findEl(kids(entries[1]), EBML_IDS.CodecPrivate);
  assert.equal(priv.data.length, 19, "OpusHead 19 バイト");
  assert.equal(Buffer.from(priv.data.subarray(0, 8)).toString("ascii"), "OpusHead");
  assert.equal(priv.data[9], 2, "2 チャンネル");

  const tracks = f.clusters.flatMap((c) => c.blocks.map((b) => b.track));
  assert.ok(tracks.includes(VIDEO_TRACK) && tracks.includes(AUDIO_TRACK), "両方入っている");
  assert.equal(tracks.filter((t) => t === VIDEO_TRACK).length, 30, "映像 30 枚");
  assert.equal(tracks.filter((t) => t === AUDIO_TRACK).length, 150, "音声 150 個");
  // 各 Cluster の中では時刻が増える順に並ぶ（相対時刻が単調）
  for (const c of f.clusters) {
    assert.equal(c.blocks[0].key, true, "頭はキー");
    assert.equal(c.blocks[0].track, VIDEO_TRACK, "頭は映像のキーフレーム");
    for (let i = 1; i < c.blocks.length; i++) {
      assert.ok(c.blocks[i].relMs >= c.blocks[i - 1].relMs, "時刻が戻らない");
    }
  }
  // 音声の CodecPrivate を貰った時はそれを使う（WebCodecs の decoderConfig 相当）
  const given = buildOpusHead({ channels: 1, sampleRate: 24000, preSkip: 120 });
  const m = createWebMMuxer({ video: VIDEO, audio: { codec: "A_OPUS", sampleRate: 24000, channels: 1 } });
  m.addVideoChunk(fakeVideo({ n: 1 })[0]);
  m.addAudioChunk(fakeAudio(1)[0], { decoderConfig: { description: given } });
  const g = openFile(m.finalizeBytes());
  const p2 = findEl(kids(allEl(kids(g.tracks), EBML_IDS.TrackEntry)[1]), EBML_IDS.CodecPrivate);
  eqBytes(p2.data, Array.from(given), "渡された OpusHead をそのまま使う");
});

test("音声トラックの無い muxer に音声を渡すと throw", () => {
  const m = createWebMMuxer({ video: VIDEO });
  m.addVideoChunk(fakeVideo({ n: 1 })[0]);
  assert.throws(() => m.addAudioChunk(fakeAudio(1)[0]), /音声トラックの無い/);
  m.dispose();
});

/* ══ 7. 使い方の約束 ═══════════════════════════════════════════ */

test("finalize 後に addVideoChunk / addAudioChunk は throw", () => {
  const m = createWebMMuxer({ video: VIDEO, audio: AUDIO });
  for (const c of fakeVideo({ n: 5 })) m.addVideoChunk(c);
  const bytes = m.finalizeBytes();
  assert.ok(bytes.length > 0);
  assert.equal(m.state(), "finalized");
  assert.throws(() => m.addVideoChunk(fakeVideo({ n: 1 })[0]), /finalize 済み/, "映像");
  assert.throws(() => m.addAudioChunk(fakeAudio(1)[0]), /finalize 済み/, "音声");
  // 何度呼んでも同じバイト列（呼び出し側が finalize を 2 回呼んでも壊れない）
  assert.deepEqual(Array.from(m.finalizeBytes()), Array.from(bytes), "2 回目も同じ");
});

test("dispose 後は throw / 空のまま finalize も throw", () => {
  const m = createWebMMuxer({ video: VIDEO });
  m.addVideoChunk(fakeVideo({ n: 1 })[0]);
  m.dispose();
  assert.equal(m.state(), "disposed");
  assert.throws(() => m.addVideoChunk(fakeVideo({ n: 1 })[0]), /dispose 済み/);
  assert.throws(() => m.finalizeBytes(), /dispose 済み/);

  const empty = createWebMMuxer({ video: VIDEO });
  assert.throws(() => empty.finalizeBytes(), /chunk が 1 つも/, "空の webm は作らない");
  assert.equal(empty.bytes().length, 0, "まだ何も無い");
});

test("EncodedVideoChunk 風（copyTo）も受ける / 中身の複製を持つ", () => {
  const raw = new Uint8Array([9, 9, 9, 9, 9, 9]);
  const chunkLike = {
    type: "key", timestamp: 0, duration: 100000, byteLength: raw.length,
    copyTo(dest) { dest.set(raw); },
  };
  const m = createWebMMuxer({ video: VIDEO });
  m.addVideoChunk(chunkLike);
  // 呼び出し側が同じ Uint8Array を使い回しても、既に入れた分は変わらない
  const reused = new Uint8Array([1, 2, 3]);
  m.addVideoChunk({ data: reused, timestampUs: 100000, durationUs: 100000, key: false });
  reused.fill(0xff);
  const f = openFile(m.finalizeBytes());
  const blocks = f.clusters[0].blocks;
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].key, true, "type:'key' を読む");
  eqBytes(blocks[0].payload, [9, 9, 9, 9, 9, 9], "copyTo で写した中身");
  eqBytes(blocks[1].payload, [1, 2, 3], "後から書き換えられていない");
  assert.equal(blocks[1].relMs, 100, "timestamp（us）→ ms");
  assert.throws(() => createWebMMuxer({ video: VIDEO }).addVideoChunk({ timestampUs: 0 }), TypeError, "data も copyTo も無い");
  assert.throws(() => createWebMMuxer({ video: VIDEO }).addVideoChunk({ data: new Uint8Array(0) }), RangeError, "空");
});

test("timestamp が 0 から始まらない素材は先頭を 0 に寄せる", () => {
  const m = createWebMMuxer({ video: VIDEO });
  for (const c of fakeVideo({ n: 5 })) m.addVideoChunk({ ...c, timestampUs: c.timestampUs + 5000000 });
  const f = openFile(m.finalizeBytes());
  assert.equal(f.clusters[0].timecodeMs, 0, "5 秒から始まる素材でも 0ms から");
  assert.deepEqual(f.clusters[0].blocks.map((b) => b.relMs), [0, 100, 200, 300, 400]);
});

/* ══ 8. 逐次出力（onData） ═════════════════════════════════════ */

test("onData: Segment は «大きさ不明» で Duration を書かない（Cues は末尾に付く）", () => {
  const got = [];
  const m = createWebMMuxer({ video: VIDEO, onData: (b) => got.push(b) });
  for (const c of fakeVideo({ n: 30 })) m.addVideoChunk(c);
  assert.ok(got.length >= 2, "Cluster が出来た所で流れる（溜めきらない）");
  m.finalizeBytes;                     // 参照だけ（下で throw を見る）
  const beforeFinalize = got.length;
  assert.throws(() => m.finalizeBytes(), /全体のバイト列を持っていません/, "retain 無しでは全体を返さない");
  assert.ok(got.length >= beforeFinalize, "finalize でも流れる");

  const bytes = concatBytes(got);
  eqBytes(bytes.subarray(0, 4), [0x1a, 0x45, 0xdf, 0xa3], "先頭");
  const f = openFile(bytes);
  assert.equal(f.segment.unknown, true, "Segment は大きさ不明");
  assert.equal(findEl(kids(f.info), EBML_IDS.Duration), null, "Duration は書けない");
  assert.equal(f.seekHead, null, "SeekHead は付けない（位置が先に判らないため）");
  assert.deepEqual(idsOf(f.seg).slice(0, 2), [EBML_IDS.Info, EBML_IDS.Tracks], "Info → Tracks");
  assert.deepEqual(f.clusters.map((c) => c.timecodeMs), [0, 2000], "切れ目は溜める方式と同じ");
  assert.equal(f.clusters.reduce((s, c) => s + c.blocks.length, 0), 30, "全部入る");
  assert.equal(idsOf(f.seg)[idsOf(f.seg).length - 1], EBML_IDS.Cues, "Cues は最後");
  const pts = allEl(kids(f.cues), EBML_IDS.CuePoint);
  assert.equal(pts.length, 2, "Cluster ごとに 1 つ");
  // 逐次でも Cues の位置が本物か（流しながら数えた位置がずれていないか）
  pts.forEach((pt, i) => {
    const tp = kids(findEl(kids(pt), EBML_IDS.CueTrackPositions));
    const cpos = uintOf(findEl(tp, EBML_IDS.CueClusterPosition));
    assert.equal(cpos, f.clusters[i].pos, "CueClusterPosition");
    const at = f.segment.dataStart + cpos;
    eqBytes(bytes.subarray(at, at + 4), [0x1f, 0x43, 0xb6, 0x75], "飛び先が Cluster");
    const inside = at + (f.clusters[i].node.dataStart - f.clusters[i].node.start);
    assert.equal(bytes[inside + uintOf(findEl(tp, EBML_IDS.CueRelativePosition))], 0xa3, "SimpleBlock");
  });
  for (const c of f.clusters) assert.equal(c.blocks[0].key, true, "頭はキーフレーム");
});

test("onData + retain:true なら finalizeBytes() が流した物と一致する", () => {
  const got = [];
  const m = createWebMMuxer({ video: VIDEO, audio: AUDIO, retain: true, onData: (b) => got.push(b) });
  const vs = fakeVideo({ n: 30 });
  const as = fakeAudio(150);
  // 現場のように 映像と音声を前後させて入れる
  let ai = 0;
  for (const v of vs) {
    m.addVideoChunk(v);
    for (let k = 0; k < 5 && ai < as.length; k++, ai++) m.addAudioChunk(as[ai]);
  }
  const bytes = m.finalizeBytes();
  assert.deepEqual(Array.from(bytes), Array.from(concatBytes(got)), "retain と onData が同じ");
  const f = openFile(bytes);
  assert.equal(allEl(kids(f.tracks), EBML_IDS.TrackEntry).length, 2);
  const total = f.clusters.reduce((s, c) => s + c.blocks.length, 0);
  assert.equal(total, 180, "映像 30 + 音声 150");
  for (const c of f.clusters) {
    assert.ok(c.blocks.every((b) => b.relMs >= 0 && b.relMs <= MAX_BLOCK_REL), "相対時刻が範囲内");
  }
  assert.equal(m.stats().streaming, true);
  assert.equal(m.stats().videoChunks, 30);
  assert.equal(m.stats().audioChunks, 150);
});

test("onData: 遅れて来た chunk でも Cluster の Timecode は戻らない", () => {
  // 現場では音声が映像より かなり遅れて届く事がある。その時に Cluster の
  // Timecode が巻き戻ると seek が壊れるので、戻さない事を固める。
  const got = [];
  const m = createWebMMuxer({ video: VIDEO, audio: AUDIO, retain: true, onData: (b) => got.push(b) });
  for (const c of fakeVideo({ n: 30 })) m.addVideoChunk(c);   // 先に映像だけ全部
  for (const c of fakeAudio(100)) m.addAudioChunk(c);         // 後から 0ms の音声が届く
  const f = openFile(m.finalizeBytes());
  const tcs = f.clusters.map((c) => c.timecodeMs);
  for (let i = 1; i < tcs.length; i++) {
    assert.ok(tcs[i] >= tcs[i - 1], `Timecode が戻っていない（${tcs.join(",")}）`);
  }
  for (const c of f.clusters) {
    for (const b of c.blocks) {
      assert.ok(b.relMs >= -32768 && b.relMs <= MAX_BLOCK_REL, `相対時刻が 16bit に収まる（${b.relMs}）`);
    }
  }
  const total = f.clusters.reduce((s2, c) => s2 + c.blocks.length, 0);
  assert.equal(total, 130, "映像 30 + 音声 100 が 1 つも落ちない");
});

test("壊れた設定は «作る時» に throw する（finalize まで待たない）", () => {
  assert.throws(() => createWebMMuxer({ video: VIDEO, audio: { codec: "opus", sampleRate: 0, channels: 2 } }),
    RangeError, "sampleRate 0");
  assert.throws(() => createWebMMuxer({ video: VIDEO, audio: { codec: "opus", sampleRate: 48000, channels: 0 } }),
    RangeError, "channels 0");
  assert.throws(() => createWebMMuxer({ video: { codec: "vp9", width: 1920, height: 0 } }),
    RangeError, "高さ 0");
});

test("AV1 は meta の CodecPrivate（配列の頭）をそのまま書く", () => {
  const seq = new Uint8Array([0x0a, 0x0b, 0x00, 0x00, 0x00, 0x24, 0xcf, 0x7f]);
  const m = createWebMMuxer({ video: { codec: "av01.0.04M.08", width: 320, height: 180, fps: 30 } });
  m.addVideoChunk({ data: new Uint8Array([1, 2, 3]), timestampUs: 0, durationUs: 33333, key: true },
    { decoderConfig: { codec: "av01.0.04M.08", description: seq } });
  const f = openFile(m.finalizeBytes());
  const entry = kids(allEl(kids(f.tracks), EBML_IDS.TrackEntry)[0]);
  assert.equal(strOf(findEl(entry, EBML_IDS.CodecID)), "V_AV1");
  eqBytes(findEl(entry, EBML_IDS.CodecPrivate).data, Array.from(seq), "配列の頭");
});

/* ══ 9. exporter.js からの呼ばれ方 ═════════════════════════════ */

test("exporter.js が渡す «平らな» 設定でも作れる（別名 export も全部同じ）", () => {
  assert.equal(createWebmMuxer, createWebMMuxer, "綴り違いの別名");
  assert.equal(createMuxer, createWebMMuxer);
  assert.equal(createDefault, createWebMMuxer, "default");

  const m = createWebmMuxer({
    width: 1920, height: 1080, fps: 30,
    videoCodec: "vp09.00.10.08", videoBitrate: 8000000,
    audioCodec: "opus", sampleRate: 48000, numberOfChannels: 2, audioBitrate: 192000,
    duration: 1,
  });
  const dur = Math.round(1e6 / 30);
  for (let i = 0; i < 30; i++) {
    m.addVideoChunk({ data: new Uint8Array(16).fill(i + 1), timestampUs: i * dur, durationUs: dur, key: i % 30 === 0 },
      { decoderConfig: { codec: "vp09.00.10.08" } });
  }
  const f = openFile(m.finalizeBytes());
  const entries = allEl(kids(f.tracks), EBML_IDS.TrackEntry);
  assert.equal(entries.length, 2, "音声トラックも作られる");
  assert.equal(strOf(findEl(kids(entries[0]), EBML_IDS.CodecID)), "V_VP9", "vp09… → V_VP9");
  const vv = kids(findEl(kids(entries[0]), EBML_IDS.Video));
  assert.equal(uintOf(findEl(vv, EBML_IDS.PixelWidth)), 1920);
  assert.equal(uintOf(findEl(vv, EBML_IDS.PixelHeight)), 1080);
  assert.equal(uintOf(findEl(kids(entries[0]), EBML_IDS.DefaultDuration)), Math.round(1e9 / 30));
  assert.equal(m.mime, "video/webm");

  assert.throws(() => createWebMMuxer({}), /video か audio/, "設定が空");
  assert.throws(() => createWebMMuxer({ video: { codec: "vp9" } }), RangeError, "大きさ無し");
  assert.throws(() => createWebMMuxer({ video: { codec: "avc1.640028", width: 16, height: 16 } }), /入れられない/, "H.264");
});

test("音声だけの webm も組める（将来の exportAudio(webm) 用）", () => {
  const m = createWebMMuxer({ video: null, audio: AUDIO });
  for (const c of fakeAudio(300)) m.addAudioChunk(c);   // 20ms × 300 = 6 秒
  assert.throws(() => m.addVideoChunk(fakeVideo({ n: 1 })[0]), /映像トラックの無い/);
  const f = openFile(m.finalizeBytes());
  assert.equal(allEl(kids(f.tracks), EBML_IDS.TrackEntry).length, 1, "音声 1 本");
  assert.equal(uintOf(findEl(kids(allEl(kids(f.tracks), EBML_IDS.TrackEntry)[0]), EBML_IDS.TrackType)), 2);
  assert.deepEqual(f.clusters.map((c) => c.timecodeMs), [0, 2000, 4000], "音声でも 2 秒ごと");
  assert.equal(f.clusters.reduce((s2, c) => s2 + c.blocks.length, 0), 300);
  assert.equal(floatOf(findEl(kids(f.info), EBML_IDS.Duration)), 6000, "Duration 6 秒");
  assert.equal(allEl(kids(f.cues), EBML_IDS.CuePoint).length, 3, "索引も付く");
});

test("finalize(): Blob が在る環境では video/webm の Blob を返す", () => {
  const m = createWebMMuxer({ video: VIDEO });
  for (const c of fakeVideo({ n: 3 })) m.addVideoChunk(c);
  const bytes = m.bytes();                       // finalize 前の «下書き»
  assert.ok(bytes.length > 0, "下書きも組める");
  if (typeof Blob === "function") {
    const blob = m.finalize();
    assert.ok(blob instanceof Blob);
    assert.equal(blob.type, "video/webm");
    assert.equal(blob.size, m.finalizeBytes().length, "Blob の大きさ = バイト列の長さ");
  } else {
    assert.ok(m.finalizeBytes().length > 0);
  }
});
