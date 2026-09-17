/* ══════════════════════════════════════════════════════════════════════
   tests/mux-mp4.test.mjs — export/mux/mp4.js の試験（node --test）

   muxer の間違いは「壊れた mp4 が出来る」という形でしか現れず、
   iPhone では **黒画面 / 再生できません** の一言しか返って来ない。
   だから Node の段階で バイト列そのものを疑う。

   ここで守りたいのは 5 つ。
   1) 原料（u8…u64 / str4 / box / fullBox）が既知のバイト列と一致する。
      ここが 1 バイトずれると 以降の全ての box の size がずれる。
   2) box の size が実際の長さと一致し、入れ子の合計が親をぴったり埋める
      （walkBoxes）。ISOBMFF の読み手は size だけを頼りに歩くので、
      1 つでも合わないとそこから先が全部ゴミになる。
   3) 並びが ftyp → moov → (moof → mdat)× → mfra であること。
   4) Annex-B ↔ avcC の変換（3/4 バイトのスタートコード混在・SPS/PPS 抽出）。
      ここを間違えると「音は出るが映像が出ない」になる。
   5) tfdt の累積と、trun の sample 数 / size 合計が mdat の実長と合うこと。
      ここがずれると 2 つ目の fragment から音がずれる。
   ══════════════════════════════════════════════════════════════════════ */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cat, u8, u16, u24, u32, u64, i32, i16, fixed16_16, str4,
  box, fullBox,
  buildFtyp, buildMoov, buildMoof, buildMdat, buildTrun, buildMfra,
  avccFromAnnexB, annexBToAvcc, splitAnnexB, isAnnexB, isLengthPrefixed,
  buildEsdsForAAC, buildDOps,
  createMP4Muxer, createMp4Muxer,
  MOVIE_TIMESCALE, SAMPLE_FLAGS_SYNC, SAMPLE_FLAGS_DELTA,
} from "../src/export/mux/mp4.js";

/* ── 読み手（試験の中だけの ISOBMFF パーサ） ────────────────── */

/** 純粋な入れ物 box（中身が box の列だけ） */
const CONTAINERS = new Set([
  "moov", "trak", "mdia", "minf", "stbl", "dinf", "mvex", "moof", "traf", "mfra", "edts", "udta",
]);
/** sample entry は「固定長の頭」の後ろに box が並ぶ。頭の長さ */
const ENTRY_PREFIX = { avc1: 78, avc3: 78, hvc1: 78, hev1: 78, av01: 78, mp4a: 28, Opus: 28 };

function u32At(b, o) {
  return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
}
function typeAt(b, o) {
  return String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
}

/**
 * box を再帰的に歩く。size が実長と合わない / 子の合計が親を埋めない、
 * のどちらでも assert で落ちる。
 */
function walkBoxes(b, start = 0, end = b.length, path = "") {
  const list = [];
  let o = start;
  while (o < end) {
    assert.ok(end - o >= 8, `${path}: box の header が足りません（@${o}, 残り ${end - o}）`);
    const size = u32At(b, o);
    const type = typeAt(b, o + 4);
    assert.ok(size >= 8, `${path}/${type}: size が 8 未満（${size} @${o}）`);
    assert.ok(
      o + size <= end,
      `${path}/${type}: size ${size} が親の残り ${end - o} を超えています（@${o}）`
    );
    const node = { type, size, offset: o, children: [] };
    const here = `${path}/${type}`;
    if (CONTAINERS.has(type)) node.children = walkBoxes(b, o + 8, o + size, here);
    else if (type === "stsd") node.children = walkBoxes(b, o + 16, o + size, here);
    else if (ENTRY_PREFIX[type] !== undefined) {
      node.children = walkBoxes(b, o + 8 + ENTRY_PREFIX[type], o + size, here);
    }
    list.push(node);
    o += size;
  }
  assert.equal(o, end, `${path}: 子 box の合計（${o - start}）が親の長さ（${end - start}）と違います`);
  return list;
}

function find(nodes, type) {
  for (const n of nodes) {
    if (n.type === type) return n;
    const r = find(n.children, type);
    if (r) return r;
  }
  return null;
}
function findAll(nodes, type, acc = []) {
  for (const n of nodes) {
    if (n.type === type) acc.push(n);
    findAll(n.children, type, acc);
  }
  return acc;
}

function parseTfdt(b, o) {
  const version = b[o + 8];
  if (version === 1) return u32At(b, o + 12) * 4294967296 + u32At(b, o + 16);
  return u32At(b, o + 12);
}

function parseTrun(b, o) {
  const size = u32At(b, o);
  const version = b[o + 8];
  const flags = (b[o + 9] << 16) | (b[o + 10] << 8) | b[o + 11];
  let p = o + 12;
  const count = u32At(b, p); p += 4;
  let dataOffset = null;
  if (flags & 0x000001) { dataOffset = u32At(b, p) | 0; p += 4; }
  if (flags & 0x000004) p += 4;
  const samples = [];
  for (let i = 0; i < count; i++) {
    const s = {};
    if (flags & 0x000100) { s.duration = u32At(b, p); p += 4; }
    if (flags & 0x000200) { s.size = u32At(b, p); p += 4; }
    if (flags & 0x000400) { s.flags = u32At(b, p); p += 4; }
    if (flags & 0x000800) { s.cto = version === 1 ? (u32At(b, p) | 0) : u32At(b, p); p += 4; }
    samples.push(s);
  }
  assert.equal(p, o + size, "trun を読み切れませんでした（flags と中身が合っていません）");
  return { version, flags, count, dataOffset, samples };
}

const hex = (b) => Array.from(b, (v) => v.toString(16).padStart(2, "0")).join(" ");

/* ── 1. 原料 ───────────────────────────────────────────────── */

test("u8/u16/u24/u32: 既知の値と境界", () => {
  assert.deepEqual([...u8(0)], [0]);
  assert.deepEqual([...u8(255)], [255]);
  assert.deepEqual([...u16(0x1234)], [0x12, 0x34]);
  assert.deepEqual([...u16(0xffff)], [0xff, 0xff]);
  assert.deepEqual([...u24(0x010203)], [1, 2, 3]);
  assert.deepEqual([...u24(0xffffff)], [0xff, 0xff, 0xff]);
  assert.deepEqual([...u32(0)], [0, 0, 0, 0]);
  assert.deepEqual([...u32(1)], [0, 0, 0, 1]);
  assert.deepEqual([...u32(0x89abcdef)], [0x89, 0xab, 0xcd, 0xef]);
  assert.deepEqual([...u32(0xffffffff)], [0xff, 0xff, 0xff, 0xff]);
  // 範囲外は黙って丸めず throw（ここを通すと size がずれた mp4 が出る）
  assert.throws(() => u8(256), RangeError);
  assert.throws(() => u8(-1), RangeError);
  assert.throws(() => u16(0x10000), RangeError);
  assert.throws(() => u24(0x1000000), RangeError);
  assert.throws(() => u32(0x100000000), RangeError);
  assert.throws(() => u32(-1), RangeError);
  assert.throws(() => u32(NaN), RangeError);
  assert.throws(() => u32(Infinity), RangeError);
});

test("u64: 32bit 跨ぎ・MAX_SAFE_INTEGER・BigInt", () => {
  assert.deepEqual([...u64(0)], [0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual([...u64(0xffffffff)], [0, 0, 0, 0, 0xff, 0xff, 0xff, 0xff]);
  assert.deepEqual([...u64(4294967296)], [0, 0, 0, 1, 0, 0, 0, 0]);
  assert.deepEqual([...u64(4294967297)], [0, 0, 0, 1, 0, 0, 0, 1]);
  assert.deepEqual([...u64(Number.MAX_SAFE_INTEGER)], [0, 0x1f, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
  assert.deepEqual([...u64(0n)], [0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual([...u64(0xffffffffffffffffn)], [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
  assert.deepEqual([...u64(0x0102030405060708n)], [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.throws(() => u64(-1), RangeError);
  assert.throws(() => u64(Number.MAX_SAFE_INTEGER + 1), RangeError);
  assert.throws(() => u64(-1n), RangeError);
});

test("i32/i16/fixed16_16: 負の値が 2 の補数で出る", () => {
  assert.deepEqual([...i32(0)], [0, 0, 0, 0]);
  assert.deepEqual([...i32(-1)], [0xff, 0xff, 0xff, 0xff]);
  assert.deepEqual([...i32(2147483647)], [0x7f, 0xff, 0xff, 0xff]);
  assert.deepEqual([...i32(-2147483648)], [0x80, 0, 0, 0]);
  assert.throws(() => i32(2147483648), RangeError);
  assert.deepEqual([...i16(-1)], [0xff, 0xff]);
  assert.deepEqual([...i16(0)], [0, 0]);
  // 16.16 固定小数
  assert.deepEqual([...fixed16_16(1)], [0, 1, 0, 0]);
  assert.deepEqual([...fixed16_16(1920)], [0x07, 0x80, 0, 0]);
  assert.deepEqual([...fixed16_16(1080)], [0x04, 0x38, 0, 0]);
  assert.deepEqual([...fixed16_16(0.5)], [0, 0, 0x80, 0]);
  assert.deepEqual([...fixed16_16(-1)], [0xff, 0xff, 0, 0]);
});

test("str4: 4 文字だけ通す（空白も可）", () => {
  assert.deepEqual([...str4("ftyp")], [0x66, 0x74, 0x79, 0x70]);
  assert.deepEqual([...str4("url ")], [0x75, 0x72, 0x6c, 0x20]);
  assert.deepEqual([...str4("Opus")], [0x4f, 0x70, 0x75, 0x73]);
  assert.throws(() => str4("abc"), RangeError);
  assert.throws(() => str4("abcde"), RangeError);
  assert.throws(() => str4(""), RangeError);
  assert.throws(() => str4("あいうえ"), RangeError); // 0xFF を超える文字
});

test("cat: 入れ子の配列も繋ぐ / 部品でない物は throw", () => {
  assert.deepEqual([...cat(u8(1), [u8(2), [u8(3)]], null, u8(4))], [1, 2, 3, 4]);
  assert.deepEqual([...cat()], []);
  assert.throws(() => cat(5), TypeError);
  assert.throws(() => cat("free"), TypeError);
});

test("box / fullBox: 既知のバイト列", () => {
  // 中身が空の box は 8 バイト
  assert.deepEqual([...box("free")], [0, 0, 0, 8, 0x66, 0x72, 0x65, 0x65]);
  // size は header を含む
  assert.deepEqual([...box("free", u8(0xaa))], [0, 0, 0, 9, 0x66, 0x72, 0x65, 0x65, 0xaa]);
  // fullBox は version(1) + flags(3) が中身の頭に付く
  assert.deepEqual(
    [...fullBox("tfdt", 1, 0, u64(0))],
    [0, 0, 0, 20, 0x74, 0x66, 0x64, 0x74, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  );
  assert.deepEqual(
    [...fullBox("test", 0, 0x000f, u8(2))],
    [0, 0, 0, 13, 0x74, 0x65, 0x73, 0x74, 0, 0, 0, 0x0f, 2]
  );
  // 入れ子の size も実長と一致
  const nested = box("moov", box("free", u8(1), u8(2)));
  assert.equal(u32At(nested, 0), nested.length);
  assert.equal(nested.length, 8 + 10);
  walkBoxes(nested);
});

test("buildFtyp: 先頭 8 バイトと brand の並び", () => {
  const f = buildFtyp();
  // size = 8(header) + 4(major) + 4(minor) + 4×4(brands) = 32
  assert.equal(f.length, 32);
  assert.deepEqual([...f.subarray(0, 8)], [0, 0, 0, 32, 0x66, 0x74, 0x79, 0x70]);
  assert.equal(u32At(f, 0), f.length);
  assert.equal(typeAt(f, 8), "isom");            // major brand
  assert.deepEqual([...f.subarray(12, 16)], [0, 0, 2, 0]); // minor version 0x200
  const brands = [];
  for (let o = 16; o < f.length; o += 4) brands.push(typeAt(f, o));
  assert.deepEqual(brands, ["isom", "iso6", "mp41", "avc1"]);
  // 差し替えも効く
  const g = buildFtyp({ major: "iso6", minor: 0, brands: ["iso6", "mp41"] });
  assert.equal(typeAt(g, 8), "iso6");
  assert.deepEqual([...g.subarray(12, 16)], [0, 0, 0, 0]);
  assert.equal(g.length, 8 + 4 + 4 + 8);
});

/* ── 2. Annex-B ↔ avcC ─────────────────────────────────────── */

const SPS = new Uint8Array([0x67, 0x64, 0x00, 0x28, 0xac, 0xd9, 0x40, 0x78]);
const PPS = new Uint8Array([0x68, 0xeb, 0xe3, 0xcb, 0x22, 0xc0]);
const SC4 = new Uint8Array([0, 0, 0, 1]);
const SC3 = new Uint8Array([0, 0, 1]);

test("isAnnexB / splitAnnexB: 3 バイトと 4 バイトのスタートコード混在", () => {
  const nalA = new Uint8Array([0x65, 0x11, 0x22]);
  const nalB = new Uint8Array([0x41, 0x9a, 0x02, 0x03, 0x04]);
  const stream = cat(SC4, nalA, SC3, nalB);
  assert.equal(isAnnexB(stream), true);
  assert.equal(isAnnexB(cat(u32(3), nalA)), false); // 既に長さ接頭
  const nals = splitAnnexB(stream);
  assert.equal(nals.length, 2);
  assert.deepEqual([...nals[0]], [...nalA]);
  assert.deepEqual([...nals[1]], [...nalB]);
  // 末尾の trailing_zero_8bits は NAL に含めない
  const padded = cat(SC3, nalA, new Uint8Array([0, 0]));
  assert.deepEqual([...splitAnnexB(padded)[0]], [...nalA]);
  // 4 本（SPS/PPS/IDR）の並びも拾える
  assert.equal(splitAnnexB(cat(SC4, SPS, SC3, PPS, SC4, nalA)).length, 3);
  assert.deepEqual(splitAnnexB(new Uint8Array(0)), []);
});

test("annexBToAvcc: 4 バイト長接頭に揃える（混在入力）", () => {
  const nalA = new Uint8Array([0x65, 0x11, 0x22]);
  const nalB = new Uint8Array([0x41, 0x9a, 0x02, 0x03, 0x04]);
  const out = annexBToAvcc(cat(SC4, nalA, SC3, nalB, new Uint8Array([0])));
  assert.deepEqual(
    [...out],
    [0, 0, 0, 3, 0x65, 0x11, 0x22, 0, 0, 0, 5, 0x41, 0x9a, 0x02, 0x03, 0x04],
    `出力: ${hex(out)}`
  );
  // 長さの合計が実長と一致（読み手はこの長さだけで歩く）
  let o = 0;
  let n = 0;
  while (o < out.length) { o += 4 + u32At(out, o); n++; }
  assert.equal(o, out.length);
  assert.equal(n, 2);
  // dropParameterSets で SPS/PPS を落とせる
  const dropped = annexBToAvcc(cat(SC4, SPS, SC3, PPS, SC4, nalA), { dropParameterSets: true });
  assert.equal(u32At(dropped, 0), nalA.length);
  assert.equal(dropped.length, 4 + nalA.length);
  // 既に長さ接頭の物を渡したら そのまま返る（壊さない）
  const already = cat(u32(3), nalA);
  assert.deepEqual([...annexBToAvcc(already)], [...already]);
});

test("avccFromAnnexB: SPS/PPS を抽出して avcC の中身を組む", () => {
  const rec = avccFromAnnexB(cat(SC4, SPS, SC3, PPS, SC4, new Uint8Array([0x65, 1, 2])));
  assert.ok(rec, "SPS と PPS が在れば null にならない");
  const want = [
    1,          // configurationVersion
    SPS[1],     // AVCProfileIndication
    SPS[2],     // profile_compatibility
    SPS[3],     // AVCLevelIndication
    0xff,       // 111111 + lengthSizeMinusOne=3（= 4 バイト長接頭）
    0xe1,       // 111 + numOfSPS=1
    0, SPS.length, ...SPS,
    1,          // numOfPPS
    0, PPS.length, ...PPS,
  ];
  assert.deepEqual([...rec], want, `avcC: ${hex(rec)}`);
  // SPS か PPS が欠けたら null（呼び出し側が復帰できる形）
  assert.equal(avccFromAnnexB(cat(SC4, SPS)), null);
  assert.equal(avccFromAnnexB(cat(SC4, PPS)), null);
  assert.equal(avccFromAnnexB(new Uint8Array(0)), null);
  // avcC の中身を box にしたら size が合う
  const b = box("avcC", rec);
  assert.equal(u32At(b, 0), b.length);
  walkBoxes(b);
});

const AVCC = avccFromAnnexB(cat(SC4, SPS, SC3, PPS));

/* ── 3. 音声の設定 box ─────────────────────────────────────── */

test("buildEsdsForAAC: descriptor の入れ子と長さ", () => {
  const asc = new Uint8Array([0x11, 0x90]); // AAC-LC 48kHz stereo
  const esds = buildEsdsForAAC({ description: asc, sampleRate: 48000, channels: 2, avgBitrate: 128000 });
  assert.equal(typeAt(esds, 4), "esds");
  assert.equal(u32At(esds, 0), esds.length);
  // version/flags の後は ES_Descriptor（tag 0x03）
  assert.equal(esds[12], 0x03);
  assert.equal(esds[13], esds.length - 14, "ES_Descriptor の長さが残りと一致");
  // DecoderConfigDescriptor(0x04) → objectTypeIndication 0x40 / streamType 0x15
  const i4 = esds.indexOf(0x04, 14);
  assert.ok(i4 > 0);
  assert.equal(esds[i4 + 2], 0x40);
  assert.equal(esds[i4 + 3], 0x15);
  // DecoderSpecificInfo(0x05) に ASC がそのまま入る
  const i5 = esds.length - 2 - 2 - 3; // …0x05 len asc[0] asc[1] + SLConfig(3)
  assert.equal(esds[i5], 0x05);
  assert.equal(esds[i5 + 1], 2);
  assert.deepEqual([...esds.subarray(i5 + 2, i5 + 4)], [...asc]);
  // description が無ければ sampleRate/channels から組む（2 バイトの ASC）
  const made = buildEsdsForAAC({ sampleRate: 44100, channels: 1 });
  assert.equal(typeAt(made, 4), "esds");
  assert.ok(made.length >= esds.length - 1);
  walkBoxes(esds);
});

test("buildDOps: OpusHead（LE）を dOps（BE）へ詰め直す", () => {
  const head = cat(
    new Uint8Array([0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64]), // "OpusHead"
    new Uint8Array([1, 2]),             // version, channels
    new Uint8Array([0x38, 0x01]),       // pre-skip 312（LE）
    new Uint8Array([0x80, 0xbb, 0x00, 0x00]), // 48000（LE）
    new Uint8Array([0, 0]),             // output gain 0
    new Uint8Array([0])                 // channel mapping family 0
  );
  const d = buildDOps(head);
  assert.equal(typeAt(d, 4), "dOps");
  assert.equal(u32At(d, 0), d.length);
  assert.equal(d.length, 8 + 11);
  assert.equal(d[8], 0);            // version
  assert.equal(d[9], 2);            // OutputChannelCount
  assert.equal((d[10] << 8) | d[11], 312);  // PreSkip（BE になっている）
  assert.equal(u32At(d, 12), 48000);        // InputSampleRate（BE）
  assert.equal((d[16] << 8) | d[17], 0);    // OutputGain
  assert.equal(d[18], 0);           // family
  // OpusHead が無いときは object から組める
  const d2 = buildDOps({ channels: 1, sampleRate: 24000 });
  assert.equal(d2[9], 1);
  assert.equal(u32At(d2, 12), 24000);
  walkBoxes(d);
});

/* ── 4. moov / moof / mdat 単体 ────────────────────────────── */

test("buildMoov: mvhd → trak → mvex の並びと size の整合", () => {
  const moov = buildMoov({
    timescale: MOVIE_TIMESCALE, duration: 2000,
    tracks: [
      {
        kind: "video", id: 1, timescale: 30000, duration: 60000,
        width: 1920, height: 1080, codec: "avc1", description: AVCC,
        defaultSampleDuration: 1000, defaultSampleFlags: SAMPLE_FLAGS_DELTA,
      },
      {
        kind: "audio", id: 2, timescale: 48000, duration: 96000,
        codec: "mp4a", sampleRate: 48000, channels: 2,
        description: new Uint8Array([0x11, 0x90]), bitrate: 128000,
      },
    ],
  });
  const tree = walkBoxes(moov);
  assert.equal(tree.length, 1);
  assert.equal(tree[0].type, "moov");
  assert.deepEqual(tree[0].children.map((n) => n.type), ["mvhd", "trak", "trak", "mvex"]);
  // trex は trak と同じ数
  assert.equal(findAll(tree, "trex").length, 2);
  // 映像 trak には avc1 + avcC、音声 trak には mp4a + esds
  assert.ok(find(tree, "avc1"), "avc1 sample entry が在る");
  assert.ok(find(tree, "avcC"), "avcC が在る");
  assert.ok(find(tree, "mp4a"), "mp4a sample entry が在る");
  assert.ok(find(tree, "esds"), "esds が在る");
  assert.ok(find(tree, "pasp"), "pasp が在る");
  // fMP4 なので stbl の表は空（entry_count = 0）
  for (const t of ["stts", "stsc", "stco"]) {
    const n = find(tree, t);
    assert.ok(n, `${t} が在る`);
    assert.equal(u32At(moov, n.offset + 12), 0, `${t} の entry_count は 0`);
  }
  // mvhd の timescale / duration / next_track_ID
  const mvhd = find(tree, "mvhd");
  assert.equal(u32At(moov, mvhd.offset + 20), MOVIE_TIMESCALE);
  assert.equal(u32At(moov, mvhd.offset + 24), 2000);
  assert.equal(u32At(moov, mvhd.offset + mvhd.size - 4), 3);
  // avcC の中身は description そのまま
  const avcC = find(tree, "avcC");
  assert.deepEqual([...moov.subarray(avcC.offset + 8, avcC.offset + avcC.size)], [...AVCC]);
  // description の無い映像は throw（再生できない物を書かない）
  assert.throws(
    () => buildMoov({ tracks: [{ kind: "video", id: 1, width: 640, height: 480, codec: "avc1" }] }),
    /description/
  );
  assert.throws(() => buildMoov({ tracks: [] }), /trak/);
});

test("buildMoov: Opus の音声トラックは dOps を持つ", () => {
  const moov = buildMoov({
    tracks: [
      { kind: "video", id: 1, timescale: 30000, width: 640, height: 360, codec: "avc1", description: AVCC },
      { kind: "audio", id: 2, timescale: 48000, codec: "opus", sampleRate: 48000, channels: 2 },
    ],
  });
  const tree = walkBoxes(moov);
  assert.ok(find(tree, "Opus"), "Opus sample entry が在る");
  assert.ok(find(tree, "dOps"), "dOps が在る");
  assert.equal(find(tree, "esds"), null, "Opus に esds は付けない");
});

test("buildTrun: cts offset が全部 0 なら version 0、在れば version 1", () => {
  const plain = buildTrun([{ duration: 1000, size: 10, flags: SAMPLE_FLAGS_SYNC, cto: 0 }], 120);
  assert.equal(plain[8], 0, "version 0");
  const f0 = (plain[9] << 16) | (plain[10] << 8) | plain[11];
  assert.equal(f0, 0x000701);
  const p0 = parseTrun(plain, 0);
  assert.equal(p0.count, 1);
  assert.equal(p0.dataOffset, 120);
  assert.equal(p0.samples[0].duration, 1000);
  assert.equal(p0.samples[0].size, 10);
  assert.equal(p0.samples[0].flags, SAMPLE_FLAGS_SYNC);

  const withCto = buildTrun([
    { duration: 1000, size: 10, flags: SAMPLE_FLAGS_SYNC, cto: 2000 },
    { duration: 1000, size: 20, flags: SAMPLE_FLAGS_DELTA, cto: -1000 },
  ], 200);
  assert.equal(withCto[8], 1, "version 1（cts offset が符号付き）");
  const p1 = parseTrun(withCto, 0);
  assert.equal((p1.flags & 0x000800) !== 0, true);
  assert.equal(p1.samples[0].cto, 2000);
  assert.equal(p1.samples[1].cto, -1000);
  assert.equal(p1.samples[1].flags, SAMPLE_FLAGS_DELTA);
});

test("buildMoof: data_offset が moof 先頭からの相対で、mdat の中身を指す", () => {
  const vSizes = [100, 50, 50];
  const aSizes = [30, 30];
  const moof = buildMoof({
    sequenceNumber: 1,
    tracks: [
      {
        trackId: 1, baseMediaDecodeTime: 0,
        samples: vSizes.map((s, i) => ({ duration: 1000, size: s, flags: i ? SAMPLE_FLAGS_DELTA : SAMPLE_FLAGS_SYNC, cto: 0 })),
      },
      {
        trackId: 2, baseMediaDecodeTime: 0,
        samples: aSizes.map((s) => ({ duration: 1024, size: s, flags: SAMPLE_FLAGS_SYNC, cto: 0 })),
      },
    ],
  });
  const tree = walkBoxes(moof);
  assert.deepEqual(tree[0].children.map((n) => n.type), ["mfhd", "traf", "traf"]);
  const truns = findAll(tree, "trun").map((n) => parseTrun(moof, n.offset));
  // 1 本目は moof の直後の mdat の中身の先頭、2 本目はその後ろ
  assert.equal(truns[0].dataOffset, moof.length + 8);
  assert.equal(truns[1].dataOffset, moof.length + 8 + 200);
  // tfhd に default-base-is-moof が立っている
  const tfhd = find(tree, "tfhd");
  assert.equal((tfhd ? ((moof[tfhd.offset + 9] << 16) | (moof[tfhd.offset + 10] << 8) | moof[tfhd.offset + 11]) : 0) & 0x020000, 0x020000);
  assert.throws(() => buildMoof({ sequenceNumber: 1, tracks: [] }), /traf/);
});

test("buildMdat / buildMfra: size が実長と一致", () => {
  const mdat = buildMdat([new Uint8Array(10), new Uint8Array(5)]);
  assert.equal(mdat.length, 8 + 15);
  assert.equal(u32At(mdat, 0), mdat.length);
  assert.equal(typeAt(mdat, 4), "mdat");
  const mfra = buildMfra([{ trackId: 1, entries: [{ time: 0, moofOffset: 1000 }, { time: 30000, moofOffset: 50000 }] }]);
  const tree = walkBoxes(mfra);
  assert.deepEqual(tree[0].children.map((n) => n.type), ["tfra", "mfro"]);
  const mfro = find(tree, "mfro");
  assert.equal(u32At(mfra, mfro.offset + 12), mfra.length, "mfro は mfra 全体の長さを持つ");
});

/* ── 5. 通し（偽 chunk を流す） ────────────────────────────── */

function fakeVideoChunks(n, fps, keySec) {
  const keyEvery = Math.max(1, Math.round(fps * keySec));
  const list = [];
  for (let i = 0; i < n; i++) {
    const key = i % keyEvery === 0;
    const data = new Uint8Array(key ? 300 + (i % 7) : 80 + (i % 11));
    data.fill((i * 31) & 0xff);
    list.push({
      type: key ? "key" : "delta",
      timestamp: Math.round((i * 1e6) / fps),
      duration: Math.round(1e6 / fps),
      byteLength: data.byteLength,
      copyTo(dst) { dst.set(data); },
      size: data.length,
      key,
    });
  }
  return list;
}

function fakeAudioChunks(n, sampleRate, perFrame) {
  const list = [];
  for (let i = 0; i < n; i++) {
    const data = new Uint8Array(160 + (i % 5));
    data.fill(i & 0xff);
    list.push({
      type: "key",
      timestamp: Math.round((i * perFrame * 1e6) / sampleRate),
      duration: Math.round((perFrame * 1e6) / sampleRate),
      byteLength: data.byteLength,
      copyTo(dst) { dst.set(data); },
      size: data.length,
    });
  }
  return list;
}

/** 通しの共通検査。top-level の並び・全 box の size・trun と mdat の整合 */
function inspect(bytes) {
  const tree = walkBoxes(bytes);
  const order = tree.map((n) => n.type);
  assert.equal(order[0], "ftyp", `先頭が ftyp でない: ${order.join(",")}`);
  assert.equal(order[1], "moov", `2 番目が moov でない: ${order.join(",")}`);
  const frags = [];
  let i = 2;
  while (i < tree.length && tree[i].type === "moof") {
    assert.ok(tree[i + 1] && tree[i + 1].type === "mdat", "moof の直後は mdat");
    frags.push({ moof: tree[i], mdat: tree[i + 1] });
    i += 2;
  }
  assert.ok(frags.length > 0, "moof が 1 つも無い");
  // 残りは mfra だけ（在れば）
  for (; i < tree.length; i++) assert.equal(tree[i].type, "mfra", `末尾に知らない box: ${tree[i].type}`);
  // 各 fragment: trun の size 合計 = mdat の中身の長さ、data_offset が連続
  const perTrack = new Map();
  for (const f of frags) {
    const truns = findAll([f.moof], "trun").map((n) => parseTrun(bytes, n.offset));
    const tfdts = findAll([f.moof], "tfdt").map((n) => parseTfdt(bytes, n.offset));
    const trafs = f.moof.children.filter((n) => n.type === "traf");
    assert.equal(truns.length, trafs.length);
    assert.equal(tfdts.length, trafs.length);
    let total = 0;
    let expectOffset = f.moof.size + 8;
    for (const t of truns) {
      assert.equal(t.dataOffset, expectOffset, "trun の data_offset が mdat の並びと合わない");
      assert.equal(t.count, t.samples.length);
      let sub = 0;
      for (const s of t.samples) sub += s.size;
      total += sub;
      expectOffset += sub;
    }
    assert.equal(f.mdat.size - 8, total, "mdat の中身の長さが trun の size 合計と違う");
    // track ごとに tfdt と sample 数を積む
    for (let k = 0; k < trafs.length; k++) {
      const tfhd = trafs[k].children.find((n) => n.type === "tfhd");
      const id = u32At(bytes, tfhd.offset + 12);
      if (!perTrack.has(id)) perTrack.set(id, { tfdts: [], count: 0, dur: 0 });
      const rec = perTrack.get(id);
      rec.tfdts.push(tfdts[k]);
      rec.count += truns[k].count;
      for (const s of truns[k].samples) rec.dur += s.duration;
    }
  }
  return { tree, frags, perTrack, order };
}

test("通し: 映像 60 chunk（2 秒ごと key）で ftyp→moov→moof→mdat が並ぶ", () => {
  const fps = 30;
  const chunks = fakeVideoChunks(60, fps, 2);
  const streamed = [];
  const mux = createMP4Muxer({
    video: { codec: "avc1", width: 1280, height: 720, fps, description: AVCC },
    audio: null,
    onData: (b) => streamed.push(b.length),
  });
  chunks.forEach((c, i) => mux.addVideoChunk(c, i === 0 ? { decoderConfig: { codec: "avc1.64001f", description: AVCC } } : undefined));
  const bytes = mux.finalizeBytes();
  const { perTrack, order } = inspect(bytes);
  assert.equal(order[0], "ftyp");
  assert.equal(order[1], "moov");
  assert.ok(order.indexOf("moof") >= 2);
  // 映像トラックだけ。sample 数は入れた数と一致
  assert.deepEqual([...perTrack.keys()], [1]);
  assert.equal(perTrack.get(1).count, 60);
  // 1 フレーム = timescale(30000)/30 = 1000
  assert.equal(perTrack.get(1).dur, 60 * 1000);
  assert.equal(perTrack.get(1).tfdts[0], 0);
  // mdat の中身の合計 = 入れたバイト数の合計
  const want = chunks.reduce((s, c) => s + c.size, 0);
  const tree = walkBoxes(bytes);
  const got = tree.filter((n) => n.type === "mdat").reduce((s, n) => s + n.size - 8, 0);
  assert.equal(got, want);
  // onData で流れた合計は finalize 前のバイト数（moov 差し替え分は含まない）
  assert.ok(streamed.length >= 3, "ftyp / moov / moof / mdat が onData に流れる");
  assert.equal(streamed.reduce((a, b) => a + b, 0), bytes.length);
  // 情報の窓
  assert.equal(mux.info.videoSamples, 60);
  assert.equal(mux.info.hasAudio, false);
  assert.equal(mux.info.videoTimescale, 30000);
  // finalize は冪等
  assert.equal(mux.finalizeBytes(), bytes);
  assert.throws(() => mux.addVideoChunk(chunks[0]), /finalize/);
  mux.dispose();
});

test("通し: key が 2 秒ごとなら fragment はキーフレーム境界で切れ、tfdt が累積する", () => {
  const fps = 30;
  const chunks = fakeVideoChunks(180, fps, 2); // 6 秒 / key は 0, 60, 120
  const mux = createMP4Muxer({
    video: { codec: "avc1", width: 640, height: 360, fps, description: AVCC },
  });
  for (const c of chunks) mux.addVideoChunk(c, null);
  const bytes = mux.finalizeBytes();
  const { frags, perTrack } = inspect(bytes);
  assert.equal(frags.length, 3, "2 秒ごとの key で 3 つの fragment に切れる");
  assert.deepEqual(perTrack.get(1).tfdts, [0, 60000, 120000], "tfdt が 60 フレームずつ積む");
  assert.equal(perTrack.get(1).count, 180);
  // 各 fragment の先頭 sample はキーフレーム、それ以外は delta
  for (const f of frags) {
    const t = parseTrun(bytes, find([f.moof], "trun").offset);
    assert.equal(t.samples[0].flags, SAMPLE_FLAGS_SYNC, "fragment の先頭は同期サンプル");
    for (let k = 1; k < t.samples.length; k++) {
      assert.equal(t.samples[k].flags, SAMPLE_FLAGS_DELTA);
    }
  }
  // mfra に 3 つの random access point
  const mfra = find(walkBoxes(bytes), "mfra");
  assert.ok(mfra, "mfra が在る");
  const tfra = find([mfra], "tfra");
  assert.equal(u32At(bytes, tfra.offset + 20), 3);
  // moov の duration が実測（6 秒）で書き直されている
  const mvhd = find(walkBoxes(bytes), "mvhd");
  assert.equal(u32At(bytes, mvhd.offset + 24), 6000);
  const mdhd = find(walkBoxes(bytes), "mdhd");
  assert.equal(u32At(bytes, mdhd.offset + 24), 180000);
});

test("通し: 音声あり（AAC）でも size と tfdt が合う", () => {
  const fps = 30;
  const sampleRate = 48000;
  const v = fakeVideoChunks(180, fps, 2);
  const a = fakeAudioChunks(280, sampleRate, 1024); // 約 5.97 秒
  const mux = createMp4Muxer({
    width: 1920, height: 1080, fps,
    videoCodec: "avc1.640028",
    audioCodec: "mp4a.40.2", sampleRate, numberOfChannels: 2, audioBitrate: 128000,
  }); // 平たい形（exporter.js が渡してくる形）
  // 映像と音声を交互に流す（実際の exporter と同じ順）
  let ai = 0;
  for (let i = 0; i < v.length; i++) {
    mux.addVideoChunk(v[i], i === 0 ? { decoderConfig: { codec: "avc1.640028", description: AVCC } } : null);
    const until = ((i + 1) / fps) * sampleRate;
    while (ai < a.length && (ai * 1024) < until) {
      mux.addAudioChunk(a[ai], ai === 0 ? { decoderConfig: { codec: "mp4a.40.2", description: new Uint8Array([0x11, 0x90]), sampleRate, numberOfChannels: 2 } } : null);
      ai++;
    }
  }
  while (ai < a.length) { mux.addAudioChunk(a[ai], null); ai++; }
  const bytes = mux.finalizeBytes();
  const { perTrack, frags } = inspect(bytes);
  assert.deepEqual([...perTrack.keys()].sort(), [1, 2]);
  assert.equal(perTrack.get(1).count, 180, "映像 sample 数");
  assert.equal(perTrack.get(2).count, 280, "音声 sample 数");
  // 音声 timescale = sampleRate。AAC 1 フレーム = 1024
  assert.equal(perTrack.get(2).dur, 280 * 1024);
  // tfdt は単調増加かつ前の fragment の終わりと一致
  for (const id of [1, 2]) {
    const rec = perTrack.get(id);
    for (let k = 1; k < rec.tfdts.length; k++) {
      assert.ok(rec.tfdts[k] > rec.tfdts[k - 1], `track ${id} の tfdt が戻っている`);
    }
    assert.equal(rec.tfdts[0], 0);
  }
  // 各 fragment は 映像 traf → 音声 traf の 2 本
  for (const f of frags) {
    const ids = f.moof.children.filter((n) => n.type === "traf")
      .map((n) => u32At(bytes, n.children.find((c) => c.type === "tfhd").offset + 12));
    assert.deepEqual(ids, [1, 2]);
  }
  // moov に trak が 2 つ / trex が 2 つ / esds が在る
  const tree = walkBoxes(bytes);
  const moov = find(tree, "moov");
  assert.equal(moov.children.filter((n) => n.type === "trak").length, 2);
  assert.equal(findAll([moov], "trex").length, 2);
  assert.ok(find([moov], "esds"));
  assert.equal(mux.info.hasAudio, true);
  assert.equal(mux.info.audioTimescale, sampleRate);
});

test("通し: 音声トラックを作ったのに音声が来なければ映像だけで出す", () => {
  const mux = createMP4Muxer({
    video: { codec: "avc1", width: 640, height: 360, fps: 30, description: AVCC },
    audio: { codec: "mp4a", sampleRate: 48000, channels: 2, description: new Uint8Array([0x11, 0x90]) },
  });
  for (const c of fakeVideoChunks(30, 30, 2)) mux.addVideoChunk(c, null);
  const bytes = mux.finalizeBytes();
  const { perTrack } = inspect(bytes);
  assert.deepEqual([...perTrack.keys()], [1]);
  const moov = find(walkBoxes(bytes), "moov");
  assert.equal(moov.children.filter((n) => n.type === "trak").length, 1, "音声 trak は書かない");
  assert.equal(mux.info.hasAudio, false);
});

test("通し: Annex-B が description 無しで来ても avcC を組んで書ける", () => {
  const fps = 30;
  const mux = createMP4Muxer({ video: { codec: "avc1", width: 320, height: 240, fps } });
  for (let i = 0; i < 30; i++) {
    const key = i === 0;
    const body = new Uint8Array([key ? 0x65 : 0x41, i & 0xff, 0x11, 0x22]);
    const data = key ? cat(SC4, SPS, SC3, PPS, SC4, body) : cat(SC3, body);
    mux.addVideoChunk({
      type: key ? "key" : "delta",
      timestamp: Math.round((i * 1e6) / fps), duration: Math.round(1e6 / fps),
      byteLength: data.length, copyTo(dst) { dst.set(data); },
    }, null);
  }
  const bytes = mux.finalizeBytes();
  inspect(bytes);
  // avcC は SPS/PPS から組まれている
  const avcC = find(walkBoxes(bytes), "avcC");
  assert.ok(avcC);
  assert.deepEqual([...bytes.subarray(avcC.offset + 8, avcC.offset + avcC.size)], [...AVCC]);
  // サンプル本体は 4 バイト長接頭になっている（全 mdat を長さだけで歩けること）
  let nals = 0;
  for (const mdat of walkBoxes(bytes).filter((n) => n.type === "mdat")) {
    let o = mdat.offset + 8;
    const end = mdat.offset + mdat.size;
    while (o < end) {
      const len = u32At(bytes, o);
      assert.ok(len > 0 && o + 4 + len <= end, `長さ接頭が壊れています（len=${len} @${o}）`);
      o += 4 + len;
      nals++;
    }
    assert.equal(o, end, "mdat を長さ接頭で歩き切れませんでした");
  }
  // 30 フレーム = 29 本 + 先頭フレームの SPS/PPS/IDR の 3 本
  assert.equal(nals, 32);
});

test("通し: 壊れた入力は黙って通さない", () => {
  // 映像が 1 つも来なければ finalize は throw
  const empty = createMP4Muxer({ video: { codec: "avc1", width: 640, height: 360, fps: 30, description: AVCC } });
  assert.throws(() => empty.finalizeBytes(), /chunk が 1 つも来なかった/);
  // description も Annex-B も無い chunk は throw（黒画面の mp4 を書かない）
  const bad = createMP4Muxer({ video: { codec: "avc1", width: 640, height: 360, fps: 30 } });
  assert.throws(
    () => bad.addVideoChunk({ type: "key", timestamp: 0, duration: 33333, byteLength: 4, copyTo(d) { d.set([0, 0, 0, 4]); } }, null),
    /avcC/
  );
  // dispose 後は受け付けない
  const d = createMP4Muxer({ video: { codec: "avc1", width: 640, height: 360, fps: 30, description: AVCC } });
  d.dispose();
  assert.throws(() => d.addVideoChunk(fakeVideoChunks(1, 30, 2)[0], null), /dispose/);
  // バイト列を取り出せない chunk
  const m = createMP4Muxer({ video: { codec: "avc1", width: 640, height: 360, fps: 30, description: AVCC } });
  assert.throws(() => m.addVideoChunk({ type: "key", timestamp: 0 }, null), TypeError);
});

test("isLengthPrefixed: 4 バイト長接頭として歩き切れる物だけ真", () => {
  const nal = new Uint8Array(300);
  nal[0] = 0x41;
  for (let i = 1; i < nal.length; i++) nal[i] = (i * 7) & 0x7f; // 00 00 01 を含まない
  const sample = cat(u32(nal.length), nal);
  // 長さ 300 の長さ接頭は 00 00 01 2c。3 バイトのスタートコードと同じ形
  assert.deepEqual([...sample.subarray(0, 4)], [0, 0, 1, 0x2c]);
  assert.equal(isAnnexB(sample), true, "isAnnexB だけでは見分けが付かない（ここが罠）");
  assert.equal(isLengthPrefixed(sample), true);
  // Annex-B は長さで歩けない
  assert.equal(isLengthPrefixed(cat(SC4, SPS, SC3, PPS)), false);
  assert.equal(isLengthPrefixed(new Uint8Array([0, 0, 1, 0x41, 0x11])), false);
  // 2 本続けても歩き切れる / 1 バイトでも足りなければ偽
  assert.equal(isLengthPrefixed(cat(u32(3), new Uint8Array([0x65, 1, 2]), u32(2), new Uint8Array([0x41, 9]))), true);
  assert.equal(isLengthPrefixed(cat(u32(3), new Uint8Array([0x65, 1, 2, 0]))), false);
  assert.equal(isLengthPrefixed(new Uint8Array(0)), false);
  assert.equal(isLengthPrefixed(cat(u32(0), new Uint8Array([1, 2]))), false, "長さ 0 は無限ループの元");
});

test("通し: 長さ接頭（avcC 形式）のサンプルを Annex-B と間違えて削らない", () => {
  /* 回帰試験。WebCodecs が format:"avc"（description が在るときの既定）で
     吐いた P フレームの NAL が 256〜511 バイトだと、長さ接頭が 00 00 01 xx に
     なる。以前はこれを Annex-B と誤判定し、先頭バイト 0x2c を NAL ヘッダと
     読んで type=12（filler）→ 全部捨て、**全サンプルが 0 バイト**になっていた。 */
  const nal = new Uint8Array(300);
  nal[0] = 0x41;
  for (let i = 1; i < nal.length; i++) nal[i] = (i * 7) & 0x7f;
  const sample = cat(u32(nal.length), nal);
  const fps = 30;
  const n = 40;
  const mux = createMP4Muxer({ video: { codec: "avc1", width: 640, height: 360, fps, description: AVCC } });
  for (let i = 0; i < n; i++) {
    mux.addVideoChunk({
      type: i % 30 === 0 ? "key" : "delta",
      timestamp: Math.round((i * 1e6) / fps), duration: Math.round(1e6 / fps),
      byteLength: sample.length, copyTo(d) { d.set(sample); },
    }, i === 0 ? { decoderConfig: { codec: "avc1.64001f", description: AVCC } } : null);
  }
  const bytes = mux.finalizeBytes();
  const { perTrack } = inspect(bytes);
  assert.equal(perTrack.get(1).count, n);
  const mdatTotal = walkBoxes(bytes)
    .filter((x) => x.type === "mdat")
    .reduce((s, x) => s + x.size - 8, 0);
  assert.equal(mdatTotal, n * sample.length, "サンプルが削られている（Annex-B と誤判定している）");
  for (const t of findAll(walkBoxes(bytes), "trun").map((x) => parseTrun(bytes, x.offset))) {
    for (const s of t.samples) assert.equal(s.size, sample.length, "trun の size が本体と違う");
  }
  // avcC は description のまま（Annex-B から組み直していない）
  const avcC = find(walkBoxes(bytes), "avcC");
  assert.deepEqual([...bytes.subarray(avcC.offset + 8, avcC.offset + avcC.size)], [...AVCC]);
});

test("chunk は timestampUs / durationUs という名でも受ける（webm.js / selftest.html に揃える）", () => {
  const fps = 30;
  const n = 40;
  const mux = createMP4Muxer({ video: { codec: "avc1", width: 320, height: 180, fps, description: AVCC } });
  for (let i = 0; i < n; i++) {
    const data = cat(u32(6), new Uint8Array([0x41, 9, 48, i & 0xff, 1, 2]));
    // selftest.html が渡してくる形（data / timestampUs / durationUs / key）
    mux.addVideoChunk({ data, timestampUs: Math.round((i * 1e6) / fps), durationUs: Math.round(1e6 / fps), key: i % 30 === 0 }, null);
  }
  const bytes = mux.finalizeBytes();
  const { perTrack, frags } = inspect(bytes);
  assert.equal(perTrack.get(1).count, n);
  assert.equal(frags.length, 2, "timestampUs が読めていれば 1 秒ごとに切れる");
  assert.deepEqual(perTrack.get(1).tfdts, [0, 30000], "pts が 0 に潰れていない");
  assert.equal(perTrack.get(1).dur, n * 1000);
});

test("finalize: Blob の中身が finalizeBytes と 1 バイトも違わない", async () => {
  const fps = 30;
  const mux = createMP4Muxer({ video: { codec: "avc1", width: 320, height: 180, fps, description: AVCC } });
  for (const c of fakeVideoChunks(45, fps, 1)) mux.addVideoChunk(c, null);
  const blob = mux.finalize();
  assert.equal(blob.type, "video/mp4");
  const viaBytes = mux.finalizeBytes();
  assert.equal(blob.size, viaBytes.length, "Blob と finalizeBytes の長さが違う");
  const round = new Uint8Array(await blob.arrayBuffer());
  assert.deepEqual([...round], [...viaBytes], "Blob の中身が finalizeBytes と違う");
  inspect(round);
  assert.equal(mux.finalize().size, blob.size, "finalize は冪等");
  assert.throws(() => mux.addVideoChunk(fakeVideoChunks(1, fps, 1)[0], null), /finalize/);
});

test("空のサンプルは受け取らない（size 0 の trun を書かない）", () => {
  const mux = createMP4Muxer({ video: { codec: "avc1", width: 320, height: 180, fps: 30, description: AVCC } });
  assert.throws(
    () => mux.addVideoChunk({ type: "key", timestamp: 0, duration: 33333, data: new Uint8Array(0) }, null),
    /空です/
  );
  const m2 = createMP4Muxer({
    video: { codec: "avc1", width: 320, height: 180, fps: 30, description: AVCC },
    audio: { codec: "mp4a", sampleRate: 48000, channels: 2, description: new Uint8Array([0x11, 0x90]) },
  });
  m2.addVideoChunk(fakeVideoChunks(1, 30, 1)[0], null);
  assert.throws(
    () => m2.addAudioChunk({ type: "key", timestamp: 0, duration: 21333, data: new Uint8Array(0) }, null),
    /空です/
  );
});

test("通し: 29.97fps でも timescale が fps×1000 で丸めが積もらない", () => {
  const fps = 29.97;
  const mux = createMP4Muxer({ video: { codec: "avc1", width: 1920, height: 1080, fps, description: AVCC } });
  const n = 90;
  for (let i = 0; i < n; i++) {
    const data = new Uint8Array(64);
    mux.addVideoChunk({
      type: i % 60 === 0 ? "key" : "delta",
      timestamp: Math.round((i * 1e6) / fps), duration: Math.round(1e6 / fps),
      byteLength: data.length, copyTo(dst) { dst.set(data); },
    }, null);
  }
  const bytes = mux.finalizeBytes();
  const { perTrack } = inspect(bytes);
  assert.equal(mux.info.videoTimescale, 29970);
  assert.equal(perTrack.get(1).count, n);
  // 1 フレーム = 1000（29970/29.97）なので合計はぴったり
  assert.equal(perTrack.get(1).dur, n * 1000);
});
