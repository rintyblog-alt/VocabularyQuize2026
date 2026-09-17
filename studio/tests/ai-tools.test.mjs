/* ══════════════════════════════════════════════════════════════════════
   tests/ai-tools.test.mjs — ai/tools.js・ai/captions.js・ai/refine.js の試験

   ★ 何を見ているか
     1. **契約の形**: auto* は全部 `{ ops, summary, warnings }` を返す
        （ui/inspector/audio.js が `res.ops` をそのまま store.batch へ流す）。
     2. **ops が本当に当たる**こと: 作った ops を `core/ops.js` の applyOp で
        順番に当て、`validateProject()` が ok を返すまで見る。
        ここが一番大事: 1 つでも OpError を投げる ops を作ると、
        store.batch が丸ごと巻き戻って **何も当たらない**。
     3. `autoLevels`（pure）: 白飛び・黒潰れを **増やさない**上限。
     4. `wrapJa`（pure）: 日本語 20 例の改行位置・禁則・英数の非分割。
     5. SRT / VTT の **往復**（書いて読んで同じ）。
     6. `refineLocal`（pure）: 30 通り以上の言い方が、期待する op type を出す。
     7. `autoCutSilence` の ops の整合（split → 元の id の trim・削った秒）。
     8. `autoDuck` のキーフレームが **0..1 に収まる**こと。

   走らせ方: cd studio && npm test（= node --test "tests/*.test.mjs"）
   ══════════════════════════════════════════════════════════════════════ */

import { test } from "node:test";
import assert from "node:assert/strict";

import { applyOp } from "../src/core/ops.js";
import { newProject, validateProject, MIN_CLIP, findClip, clipEnd, trackEnd } from "../src/core/schema.js";
import { deepClone } from "../src/core/util.js";
import * as tools from "../src/ai/tools.js";
import * as captions from "../src/ai/captions.js";
import * as refine from "../src/ai/refine.js";

/* ── 道具: 試験用のプロジェクト（解析済みの素材つき）───────────── */

const curve = (hz, n, fn) => ({ hz, values: Array.from({ length: n }, (_, i) => fn(i / hz)) });
const inSilence = (t) => (t >= 2 && t < 4) || (t >= 8 && t < 9);

function videoAnalysis() {
  return {
    version: 1,
    scenes: [{ start: 0, end: 10, score: 0.5 }, { start: 10, end: 20, score: 0.6 }, { start: 20, end: 30, score: 0.4 }],
    motion: curve(2, 60, (t) => 0.3 + 0.2 * Math.sin(t)),
    sharp: curve(2, 60, () => 0.6),
    bright: curve(2, 60, () => 0.28),          // 暗めの素材（自動カラーが持ち上げる）
    sat: curve(2, 60, () => 0.25),
    faces: Array.from({ length: 10 }, (_, i) => ({ t: i, boxes: [[0.5 + i * 0.03, 0.3, 0.2, 0.3]] })),
    loudness: curve(20, 600, (t) => (inSilence(t) ? -70 : -18)),
    silence: [{ start: 2, end: 4 }, { start: 8, end: 9 }],
    speech: [{ start: 0, end: 2, conf: 0.9 }, { start: 4, end: 8, conf: 0.85 }, { start: 9, end: 30, conf: 0.7 }],
    beats: null,
    highlights: []
  };
}
function musicAnalysis() {
  const times = [];
  for (let t = 0; t < 60; t += 0.5) times.push(t);      // 120BPM
  return {
    version: 1, scenes: [], motion: null, sharp: null, bright: null, sat: null, faces: null,
    loudness: curve(20, 1200, () => -22), silence: [], speech: null,
    beats: { bpm: 120, offset: 0, times, downbeats: times.filter((_, i) => i % 4 === 0), conf: 0.8 },
    highlights: []
  };
}

/** 映像 2 カット（境界は 9.9 秒 = 拍から 0.1 秒ずれている）+ BGM + 空の overlay */
function baseProject(extra) {
  return newProject(Object.assign({
    name: "試験",
    settings: { width: 1920, height: 1080, ratio: "16:9", fps: 30 },
    assets: [
      {
        id: "as_v", kind: "video", name: "a.mp4", mime: "video/mp4", duration: 30,
        width: 1920, height: 1080, fps: 30, hasAudio: true,
        storage: { kind: "idb", key: "k1" }, analysis: videoAnalysis()
      },
      {
        id: "as_m", kind: "audio", name: "bgm.m4a", mime: "audio/mp4", duration: 60,
        hasAudio: true, storage: { kind: "idb", key: "k2" }, analysis: musicAnalysis()
      }
    ],
    tracks: [
      {
        id: "tr_v", kind: "video", name: "V1", clips: [
          { id: "cl_1", kind: "video", assetId: "as_v", start: 0, duration: 9.9, in: 0, out: 9.9 },
          { id: "cl_2", kind: "video", assetId: "as_v", start: 9.9, duration: 8.1, in: 9.9, out: 18 }
        ]
      },
      { id: "tr_a", kind: "audio", name: "BGM", clips: [{ id: "cl_m", kind: "audio", assetId: "as_m", start: 0, duration: 18, in: 0, out: 18 }] },
      { id: "tr_t", kind: "overlay", name: "テロップ", clips: [] }
    ]
  }, extra || {}));
}

/** ops を順番に当てる（1 つでも投げたら試験を落とす）。返り値は新しい project */
function apply(project, ops, label = "ops") {
  const draft = deepClone(project);
  let i = 0;
  for (const op of ops) {
    assert.ok(op && typeof op.type === "string" && op.type, `${label}[${i}] に type が無い`);
    assert.ok(op.payload === undefined || (op.payload && typeof op.payload === "object"), `${label}[${i}] の payload が object ではない`);
    try {
      applyOp(draft, op.type, op.payload, { fps: 30, playhead: 0 });
    } catch (e) {
      assert.fail(`${label}[${i}] (${op.type}) が当たらなかった: ${e && e.message}`);
    }
    i++;
  }
  const v = validateProject(draft);
  assert.ok(v.ok, `${label} を当てた後の project が壊れている: ${JSON.stringify(v.errors)}`);
  return draft;
}

/** 契約の形（{ops,summary,warnings}）を確かめる */
function assertResult(res, label) {
  assert.ok(res && typeof res === "object", `${label}: 返り値が object ではない`);
  assert.ok(Array.isArray(res.ops), `${label}: ops が配列ではない`);
  assert.equal(typeof res.summary, "string", `${label}: summary が文字列ではない`);
  assert.ok(Array.isArray(res.warnings), `${label}: warnings が配列ではない`);
  assert.ok(res.summary.length > 0, `${label}: summary が空`);
  for (const w of res.warnings) assert.equal(typeof w, "string", `${label}: warnings に文字列以外`);
  return res;
}

/* ══ 1. 契約の形（全部の道具） ═══════════════════════════════════ */

test("auto* は全部 { ops, summary, warnings } を返す", () => {
  const p = baseProject();
  const names = [
    "autoCutSilence", "autoBeatSync", "autoReframe", "autoColor", "autoNormalize",
    "autoDuck", "autoChapters", "autoZoomPunch", "autoTransitions",
    "autoTelopFromSilence", "autoSubtitleFromSpeech", "removeGaps", "evenOut", "autoFadeInOut"
  ];
  for (const name of names) {
    assert.equal(typeof tools[name], "function", `${name} が export されていない`);
    assertResult(tools[name](p, {}), name);
  }
  /* autoHighlights は ranges も返す（契約書 §6） */
  const hi = tools.autoHighlights(p, {});
  assertResult(hi, "autoHighlights");
  assert.ok(Array.isArray(hi.ranges), "autoHighlights: ranges が配列ではない");
});

test("素材も解析も無い project でも落ちない（ops は空・理由は warnings）", () => {
  const empty = newProject({ name: "空" });
  for (const name of ["autoCutSilence", "autoBeatSync", "autoReframe", "autoColor", "autoNormalize",
    "autoDuck", "autoChapters", "autoZoomPunch", "autoTransitions", "autoTelopFromSilence",
    "removeGaps", "evenOut", "autoFadeInOut"]) {
    const res = assertResult(tools[name](empty, {}), name);
    assert.equal(res.ops.length, 0, `${name}: 何も無いのに ops を作った`);
    assert.ok(res.warnings.length > 0, `${name}: 理由を warnings に入れていない`);
  }
});

/* ══ 2. autoLevels（pure・白飛びと黒潰れを増やさない）════════════ */

/** 中心 c・幅 w の輝度ヒスト（bins 段。合計 1） */
function lumaHist(bins, c, w) {
  const out = new Float64Array(bins);
  for (let i = 0; i < bins; i++) {
    const v = (i + 0.5) / bins;
    out[i] = Math.exp(-((v - c) * (v - c)) / (2 * w * w));
  }
  const sum = out.reduce((a, b) => a + b, 0);
  for (let i = 0; i < bins; i++) out[i] /= sum;
  return Array.from(out);
}

test("autoLevels は契約の 5 つの鍵だけを返し、値は -1..1 の有限値", () => {
  const cases = [lumaHist(256, 0.2, 0.08), lumaHist(256, 0.5, 0.2), lumaHist(64, 0.85, 0.05), lumaHist(32, 0.5, 0.001)];
  for (const h of cases) {
    const lv = tools.autoLevels(h);
    assert.deepEqual(Object.keys(lv).sort(), ["blacks", "contrast", "exposure", "temperature", "whites"]);
    for (const k of Object.keys(lv)) {
      assert.ok(Number.isFinite(lv[k]), `${k} が有限でない (${lv[k]})`);
      assert.ok(lv[k] >= -1 && lv[k] <= 1, `${k} が範囲外 (${lv[k]})`);
    }
  }
  /* 読めない入力でも 0 を返す（落とさない） */
  for (const bad of [null, undefined, {}, [], "abc", 0, [0, 0, 0]]) {
    const lv = tools.autoLevels(bad);
    assert.deepEqual(lv, { exposure: 0, contrast: 0, blacks: 0, whites: 0, temperature: 0 });
  }
});

test("autoLevels: 暗い素材は明るく、眠い素材はコントラストを足す", () => {
  const dark = tools.autoLevels(lumaHist(256, 0.18, 0.06));
  assert.ok(dark.exposure > 0.05, `暗い素材を明るくしていない (${dark.exposure})`);
  const flat = tools.autoLevels(lumaHist(256, 0.5, 0.06));
  assert.ok(flat.contrast > 0, `眠い素材にコントラストを足していない (${flat.contrast})`);
  const wide = tools.autoLevels(lumaHist(256, 0.5, 0.45));
  assert.ok(wide.contrast <= flat.contrast, "広がった素材に余計なコントラストを足している");
});

test("autoLevels: 白飛び・黒潰れを増やさない（上限が効く）", () => {
  const cases = [
    lumaHist(256, 0.9, 0.06),        // 既に明るい
    lumaHist(256, 0.05, 0.03),       // 既に暗い
    lumaHist(256, 0.5, 0.35),        // 端まで使っている
    lumaHist(128, 0.75, 0.2),
    lumaHist(64, 0.3, 0.12)
  ];
  for (const h of cases) {
    const base = tools.levelsClipping(h, { exposure: 0, contrast: 0, whites: 0, blacks: 0 });
    const lv = tools.autoLevels(h);
    const after = tools.levelsClipping(h, lv);
    assert.ok(after.blown <= base.blown + 0.0051, `白飛びが増えた ${base.blown} -> ${after.blown}`);
    assert.ok(after.crushed <= base.crushed + 0.0051, `黒潰れが増えた ${base.crushed} -> ${after.crushed}`);
  }
  /* 既に白が飛んでいる素材には whites を足さない */
  const blown = Array.from({ length: 256 }, (_, i) => (i > 250 ? 1 : 0.001));
  assert.equal(tools.autoLevels(blown).whites, 0);
});

test("autoLevels: 青かぶりは暖色へ、赤かぶりは寒色へ（temperature の向き）", () => {
  const bins = 64;
  const blueish = { r: lumaHist(bins, 0.35, 0.1), g: lumaHist(bins, 0.45, 0.1), b: lumaHist(bins, 0.65, 0.1) };
  const reddish = { r: lumaHist(bins, 0.65, 0.1), g: lumaHist(bins, 0.45, 0.1), b: lumaHist(bins, 0.35, 0.1) };
  assert.ok(tools.autoLevels(blueish).temperature > 0.05, "青かぶりを暖色へ寄せていない");
  assert.ok(tools.autoLevels(reddish).temperature < -0.05, "赤かぶりを寒色へ寄せていない");
  /* 灰色（かぶり無し）は触らない */
  const gray = { r: lumaHist(bins, 0.5, 0.1), g: lumaHist(bins, 0.5, 0.1), b: lumaHist(bins, 0.5, 0.1) };
  assert.ok(Math.abs(tools.autoLevels(gray).temperature) < 0.02);
});

test("autoLevels は 8x8x8 の RGB ヒスト（analysis/video.js の形）も読む", () => {
  const b = 8;
  const cube = new Float32Array(b * b * b);
  /* 青が強い暗めの絵 */
  cube[(1 * b + 2) * b + 5] = 0.6;
  cube[(2 * b + 2) * b + 6] = 0.4;
  const lv = tools.autoLevels(cube);
  assert.ok(Number.isFinite(lv.exposure) && lv.exposure > 0, "暗い RGB ヒストを明るくしていない");
  assert.ok(lv.temperature > 0, "青かぶりの RGB ヒストを暖色へ寄せていない");
  /* readHistogram は周辺分布を返す */
  const h = tools.readHistogram(cube);
  assert.ok(h && h.luma && h.r && h.g && h.b, "RGB ヒストの周辺分布が取れない");
  assert.ok(Math.abs(h.r.reduce((a, x) => a + x, 0) - 1) < 1e-9, "周辺分布が合計 1 になっていない");
});

/* ══ 3. 日本語の改行（captions.wrapJa・20 例）════════════════════ */

/** 行頭に置けない文字（禁則）。実装と同じ並びを試験側にも持つ */
const NO_START = "、。，．,.!?！？…‥・:;：；」』）］｝〉》】”’ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮーヽヾゝゞ%％";
const NO_END = "「『（［｛〈《【“‘";
/** 末尾の句読点 1 文字はぶら下げるので数えない */
const vlen = (s) => ("。、，．,.!?！？…".indexOf(s.slice(-1)) >= 0 ? s.length - 1 : s.length);

const WRAP_CASES = [
  { text: "今日はカメラの設定について話します。", max: 18, expect: ["今日はカメラの設定について話します。"] },
  { text: "この設定を変えると、映像の明るさが大きく変わります。", max: 18, expect: ["この設定を変えると、映像の明るさが", "大きく変わります。"] },
  { text: "まず最初に、電源を入れてください。", max: 18 },
  { text: "私は昨日、友達と一緒に映画を見に行きました。", max: 18, expect: ["私は昨日、友達と一緒に映画を見に", "行きました。"] },
  { text: "えっ、本当にそんなことができるんですか？", max: 18, expect: ["えっ、本当にそんなことが", "できるんですか？"] },
  { text: "「これは大事です」と先生が言いました。", max: 18 },
  { text: "ISO感度は800くらいがちょうどいいです。", max: 18, expect: ["ISO感度は800くらいが", "ちょうどいいです。"] },
  { text: "1920x1080の解像度で書き出します。", max: 18, expect: ["1920x1080の解像度で", "書き出します。"] },
  { text: "ありがとうございました！また次回お会いしましょう。", max: 18, expect: ["ありがとうございました！", "また次回お会いしましょう。"] },
  { text: "そのボタンを押すと、自動で無音がカットされます。", max: 18 },
  { text: "短い文。", max: 18, expect: ["短い文。"] },
  { text: "あいうえおかきくけこさしすせそたちつてとなにぬねの", max: 18 },
  { text: "iPhoneでもAndroidでも同じように動きます。", max: 18, expect: ["iPhoneでもAndroidでも", "同じように動きます。"] },
  { text: "でも、うまくいかないときもありますよね…", max: 18 },
  { text: "彼は「待って」と叫んだが、電車は行ってしまった。", max: 18, expect: ["彼は「待って」と叫んだが、", "電車は行ってしまった。"] },
  { text: "この機能を使えば、編集の時間が半分になります。", max: 18 },
  { text: "新しいバージョンでは、書き出しが2倍速くなりました。", max: 18, expect: ["新しいバージョンでは、", "書き出しが2倍速くなりました。"] },
  { text: "音量をそろえてから、BGMを入れるのがコツです。", max: 18 },
  { text: "テロップの位置は、下から少し上げると読みやすい。", max: 18 },
  { text: "終わりに、今日のまとめをお伝えします。", max: 12, expect: ["終わりに、今日のまとめを", "お伝えします。"] }
];

test("wrapJa: 20 例が禁則と行長を守る（pure）", () => {
  assert.equal(WRAP_CASES.length, 20);
  for (const c of WRAP_CASES) {
    const lines = captions.wrapJa(c.text, c.max);
    const label = JSON.stringify(c.text);
    assert.ok(lines.length >= 1, `${label}: 1 行も出ていない`);
    for (const line of lines) {
      assert.ok(line.length > 0, `${label}: 空行が出た`);
      assert.ok(vlen(line) <= c.max, `${label}: 行が長い「${line}」(${vlen(line)} > ${c.max})`);
      assert.ok(NO_START.indexOf(line[0]) < 0, `${label}: 行頭に置けない文字「${line[0]}」`);
      assert.ok(NO_END.indexOf(line[line.length - 1]) < 0, `${label}: 行末に置けない文字「${line[line.length - 1]}」`);
    }
    /* 文字を落としていない・増やしていない */
    assert.equal(lines.join(""), c.text.replace(/[ 　]/g, ""), `${label}: 文字が変わった`);
    /* 英数の語を途中で割っていない */
    for (let i = 1; i < lines.length; i++) {
      const a = lines[i - 1].slice(-1), b = lines[i][0];
      assert.ok(!(/[0-9A-Za-z]/.test(a) && /[0-9A-Za-z]/.test(b)), `${label}: 英数の語を割った（${a}|${b}）`);
    }
    if (c.expect) assert.deepEqual(lines, c.expect, `${label}: 改行位置が変わった`);
  }
});

test("wrapJa: 入力の改行は残り、空白は畳まれ、空の入力は 0 行", () => {
  assert.deepEqual(captions.wrapJa("一行目\n二行目", 18), ["一行目", "二行目"]);
  assert.deepEqual(captions.wrapJa("  余白   あり  ", 18), ["余白 あり"]);
  assert.deepEqual(captions.wrapJa("", 18), []);
  assert.deepEqual(captions.wrapJa(null, 18), []);
  /* 1 つの塊で溢れるとき（長い英単語）は諦めて 1 行に出す（消さない） */
  const long = captions.wrapJa("AAAAAAAAAAAAAAAAAAAAAAAA", 8);
  assert.equal(long.join(""), "AAAAAAAAAAAAAAAAAAAAAAAA");
});

test("splitCaptionText: maxLines ごとの塊に割る", () => {
  const groups = captions.splitCaptionText("あ".repeat(80), 18, 2);
  assert.ok(groups.length >= 2, "長い台詞が 1 つの塊のまま");
  for (const g of groups) assert.ok(g.length <= 2, "maxLines を超えた");
  assert.equal(groups.flat().join(""), "あ".repeat(80));
});

/* ══ 4. captionsToClips（ops になり、当たる）══════════════════════ */

test("captionsToClips: text クリップの ops になり、そのまま当たる", () => {
  const p = baseProject();
  const list = [
    { start: 0.5, end: 2.5, text: "この設定を変えると、映像の明るさが大きく変わります。" },
    { start: 3, end: 4.5, text: "短い文。" },
    { start: 5, end: 9, text: "あ".repeat(60) }
  ];
  const ops = captions.captionsToClips(list, { trackId: "tr_t", maxCharsPerLine: 18, maxLines: 2, project: p });
  assert.ok(Array.isArray(ops) && ops.length >= 3, "ops が配列で返っていない");
  for (const op of ops) {
    assert.equal(op.type, "clip.add");
    assert.equal(op.payload.trackId, "tr_t");
    assert.equal(op.payload.clip.kind, "text");
    assert.ok(op.payload.clip.text.content.split("\n").length <= 2, "maxLines を超えたクリップが出た");
    assert.ok(op.payload.clip.duration >= MIN_CLIP);
  }
  const after = apply(p, ops, "captionsToClips");
  const tr = after.tracks.find((t) => t.id === "tr_t");
  assert.equal(tr.clips.length, ops.length, "置いたクリップの数が合わない");
  /* 重ならない・順番どおり */
  for (let i = 1; i < tr.clips.length; i++) {
    assert.ok(tr.clips[i].start + 1e-9 >= clipEnd(tr.clips[i - 1]), "字幕が重なっている");
  }
  /* 空の字幕でも落ちない */
  assert.deepEqual(captions.captionsToClips([], {}), []);
  assert.deepEqual(captions.captionsToClips(null, {}), []);
});

test("autoSubtitleStyle: 画面の寸法から読める大きさを決める", () => {
  const yoko = captions.autoSubtitleStyle({ settings: { width: 1920, height: 1080 } });
  const tate = captions.autoSubtitleStyle({ settings: { width: 1080, height: 1920 } });
  for (const st of [yoko, tate]) {
    assert.ok(st.size >= 18 && st.size <= 220, `size が範囲外 (${st.size})`);
    assert.equal(typeof st.color, "string");
    assert.ok(st.stroke && st.stroke.width >= 2, "縁取りが無い（背景の上で読めない）");
    assert.ok(st.shadow && st.shadow.blur > 0, "影が無い");
  }
  assert.ok(tate.bg, "縦動画には帯を付ける");
  assert.equal(captions.autoSubtitleStyle(null).size > 0, true);
});

/* ══ 5. SRT / VTT の往復 ════════════════════════════════════════ */

const ROUND = [
  { start: 0, end: 1.5, text: "はじめまして。" },
  { start: 1.5, end: 3.25, text: "2 行の\n字幕です。" },
  { start: 10, end: 3612.5, text: "1 時間を超える時刻" }
];

test("srt: 書いて読んで同じ（往復）", () => {
  const text = captions.srtStringify(ROUND);
  assert.match(text, /^1\n00:00:00,000 --> 00:00:01,500\n/);
  const back = captions.srtParse(text);
  assert.equal(back.length, ROUND.length);
  for (let i = 0; i < ROUND.length; i++) {
    assert.ok(Math.abs(back[i].start - ROUND[i].start) < 0.0011, `start がずれた ${back[i].start}`);
    assert.ok(Math.abs(back[i].end - ROUND[i].end) < 0.0011, `end がずれた ${back[i].end}`);
    assert.equal(back[i].text, ROUND[i].text);
  }
  /* もう 1 周しても同じ文字列（安定している） */
  assert.equal(captions.srtStringify(back), text);
});

test("vtt: 書いて読んで同じ（往復・小数点は '.'）", () => {
  const text = captions.vttStringify(ROUND);
  assert.match(text, /^WEBVTT\n\n00:00:00\.000 --> 00:00:01\.500\n/);
  const back = captions.vttParse(text);
  assert.equal(back.length, ROUND.length);
  assert.equal(captions.vttStringify(back), text);
  /* srt と vtt は互いに読める */
  const cross = captions.vttParse(captions.srtStringify(ROUND));
  assert.equal(cross.length, ROUND.length);
  assert.equal(cross[1].text, ROUND[1].text);
});

test("srt/vtt: 汚れた入力も読む（BOM・CRLF・NOTE・キュー設定・番号なし）", () => {
  const dirty = "﻿WEBVTT\r\n\r\nNOTE これは注記\r\n\r\ncue-1\r\n00:00:02.000 --> 00:00:04.000 align:start line:90%\r\nこんにちは\r\n\r\n00:00:05.500 --> 00:00:06.000\r\nさようなら\r\n";
  const cues = captions.vttParse(dirty);
  assert.equal(cues.length, 2);
  assert.equal(cues[0].start, 2);
  assert.equal(cues[0].text, "こんにちは");
  assert.equal(cues[1].end, 6);
  /* 時刻が読めない塊は落とす（例外にしない） */
  assert.deepEqual(captions.srtParse("1\nこれは時刻行が無い\n\n"), []);
  assert.deepEqual(captions.srtParse(""), []);
  /* 短い形の時刻も読める */
  assert.equal(captions.parseTimestamp("1:02.5"), 62.5);
  assert.equal(captions.parseTimestamp("62.5"), 62.5);
  assert.equal(captions.parseTimestamp("00:01:02,500"), 62.5);
  assert.equal(captions.parseTimestamp("むり"), null);
  assert.equal(captions.formatTimestamp(62.5), "00:01:02,500");
  assert.equal(captions.formatTimestamp(62.5, { dot: true }), "00:01:02.500");
});

test("normalizeCaptions: 並べ直して重なりを解く", () => {
  const messy = [
    { start: 5, end: 6, text: " 後の字幕 " },
    { start: 0, end: 5.5, text: "前の字幕" },
    { from: 7, to: 8, content: "別の鍵でも読む" }
  ];
  const out = captions.normalizeCaptions(messy);
  assert.equal(out.length, 3);
  assert.equal(out[0].text, "前の字幕");
  assert.ok(out[0].end <= out[1].start + 1e-9, "重なりが残っている");
  assert.equal(out[2].text, "別の鍵でも読む");
});

/* ══ 6. transcribe の三段構え ═══════════════════════════════════ */

test("capabilities: 使える道を申告する（Node では音声認識は無い）", () => {
  captions.resetTranscribeState();
  const c = captions.capabilities();
  assert.equal(typeof c.api, "boolean");
  assert.equal(c.apiDisabled, false);
  assert.equal(typeof c.webSpeech, "boolean");
  assert.equal(c.silence, true);
  assert.ok(c.note.length > 0);
});

test("transcribe: ① API の口が答えたら via:'api'", async () => {
  captions.resetTranscribeState();
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, text: async () => JSON.stringify({ captions: [{ start: 0, end: 1.2, text: "こんにちは" }] }) };
  };
  const seen = [];
  const res = await captions.transcribe(new Blob(["おと"], { type: "audio/webm" }), {
    apiBase: "https://example.test/", fetchImpl, lang: "ja", onProgress: (p) => seen.push(p)
  });
  assert.equal(res.via, "api");
  assert.equal(res.captions.length, 1);
  assert.equal(res.captions[0].text, "こんにちは");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://example.test/api/ai/transcribe?lang=ja");
  assert.equal(calls[0].init.method, "POST");
  assert.ok(seen.length >= 2 && seen[seen.length - 1] === 1, "進捗が最後まで来ていない");
});

test("transcribe: 404 なら口を無効と覚えて、無音の道へ落ちる", async () => {
  captions.resetTranscribeState();
  let hits = 0;
  const fetchImpl = async () => { hits++; return { ok: false, status: 404, text: async () => "" }; };
  const opts = { fetchImpl, silence: [{ start: 2, end: 4 }], duration: 10 };
  const first = await captions.transcribe(new Blob(["おと"], { type: "audio/webm" }), opts);
  assert.equal(first.via, "silence");
  assert.equal(captions.capabilities().apiDisabled, true);
  const second = await captions.transcribe(new Blob(["おと"], { type: "audio/webm" }), opts);
  assert.equal(second.via, "silence");
  assert.equal(hits, 1, "404 を覚えていない（毎回叩いている）");
  captions.resetTranscribeState();
  assert.equal(captions.capabilities().apiDisabled, false);
});

test("transcribe: ③ 無音から「話している区間」だけ（文字は空）", async () => {
  captions.resetTranscribeState();
  const res = await captions.transcribe("as_v", { useApi: false, silence: [{ start: 2, end: 4 }], duration: 10 });
  assert.equal(res.via, "silence");
  assert.deepEqual(res.captions.map((c) => [c.start, c.end]), [[0, 2], [4, 10]]);
  for (const c of res.captions) assert.equal(c.text, "", "文字を勝手に作っている");
  assert.ok(res.warnings.some((w) => /空の枠/.test(w)), "文字起こしが使えなかったことを伝えていない");
  /* 何も分からないときは via:"none"（例外にしない） */
  const none = await captions.transcribe("as_v", { useApi: false, silence: [], duration: 0 });
  assert.equal(none.via, "none");
  assert.equal(none.captions.length, 0);
});

test("transcribe: signal で中止できる", async () => {
  captions.resetTranscribeState();
  const ctrl = new AbortController();
  ctrl.abort();
  await assert.rejects(
    () => captions.transcribe(new Blob(["x"]), { signal: ctrl.signal, useApi: false, silence: [] }),
    (e) => e.name === "AbortError"
  );
});

test("readTranscript: 色々な返事の形を読む", () => {
  assert.equal(captions.readTranscript({ segments: [{ from: 1, to: 2, text: "あ" }] })[0].text, "あ");
  assert.equal(captions.readTranscript({ srt: "1\n00:00:01,000 --> 00:00:02,000\nい\n" })[0].text, "い");
  assert.equal(captions.readTranscript("1\n00:00:01,000 --> 00:00:02,000\nう\n")[0].text, "う");
  assert.equal(captions.readTranscript("ただの文章", { duration: 3 })[0].text, "ただの文章");
  assert.deepEqual(captions.readTranscript(null), []);
});

/* ══ 7. tools の ops が本当に当たる ═════════════════════════════ */

test("autoCutSilence: split → 元の id の trim（後ろの無音から）", () => {
  const p = baseProject();
  const res = assertResult(tools.autoCutSilence(p, {}), "autoCutSilence");
  assert.deepEqual(res.ops.map((o) => o.type), ["clip.split", "clip.trim", "clip.split", "clip.trim"]);
  for (const op of res.ops) assert.equal(op.payload.clipId, "cl_1", "新しく出来るクリップの id を指している（当てられない）");
  assert.deepEqual(res.ops.filter((o) => o.type === "clip.split").map((o) => o.payload.t), [9, 4], "後ろの無音から処理していない");
  const trims = res.ops.filter((o) => o.type === "clip.trim");
  assert.ok(trims.every((o) => o.payload.edge === "end" && o.payload.ripple === true));
  assert.ok(Math.abs(trims[0].payload.delta - 1) < 1e-9, `1 秒詰めるはず (${trims[0].payload.delta})`);
  assert.ok(Math.abs(trims[1].payload.delta - 2) < 1e-9, `2 秒詰めるはず (${trims[1].payload.delta})`);
  assert.match(res.summary, /3\.0 秒/);

  const after = apply(p, res.ops, "autoCutSilence");
  const tr = after.tracks.find((t) => t.id === "tr_v");
  assert.ok(Math.abs(trackEnd(tr) - 15) < 1e-6, `18 秒 - 3 秒 = 15 秒になるはず (${trackEnd(tr)})`);
  for (let i = 1; i < tr.clips.length; i++) {
    assert.ok(Math.abs(tr.clips[i].start - clipEnd(tr.clips[i - 1])) < 1e-6, "詰めたのに隙間が残っている");
  }
  /* 残ったクリップの素材範囲に無音（2..4 / 8..9）が入っていない */
  for (const cl of tr.clips) {
    for (const sil of [[2, 4], [8, 9]]) {
      const overlap = Math.min(cl.out, sil[1]) - Math.max(cl.in, sil[0]);
      assert.ok(overlap < 0.05, `無音 ${sil} が ${cl.id} (${cl.in}..${cl.out}) に残っている`);
    }
  }
  /* ripple:false なら詰めない（穴が空く） */
  const keep = tools.autoCutSilence(p, { ripple: false });
  assert.ok(keep.ops.every((o) => o.type !== "clip.trim" || o.payload.ripple === false));
  apply(p, keep.ops, "autoCutSilence(ripple:false)");
  /* 選択したクリップだけ触る */
  const only2 = tools.autoCutSilence(p, { clipIds: ["cl_2"] });
  assert.equal(only2.ops.length, 0, "cl_2 の素材範囲には無音が無いのに触った");
});

test("autoDuck: BGM の音量キーが 0..1 に収まり、t は昇順", () => {
  const p = baseProject();
  const res = assertResult(tools.autoDuck(p, {}), "autoDuck");
  assert.ok(res.ops.length >= 4);
  let last = -1;
  for (const op of res.ops) {
    assert.equal(op.type, "key.add");
    assert.equal(op.payload.path, "volume");
    assert.equal(op.payload.clipId, "cl_m");
    assert.ok(op.payload.v >= 0 && op.payload.v <= 1, `キーの値が 0..1 の外 (${op.payload.v})`);
    assert.ok(op.payload.t >= last, "t が昇順でない");
    last = op.payload.t;
  }
  /* 下げた値と素の値が両方ある（＝下げて戻している） */
  const vs = res.ops.map((o) => o.payload.v);
  assert.ok(Math.max(...vs) > Math.min(...vs), "下げるだけで戻していない");
  assert.ok(Math.abs(Math.min(...vs) - 0.3) < 1e-6, `amount 0.7 なら 0.3 まで下がるはず (${Math.min(...vs)})`);

  const after = apply(p, res.ops, "autoDuck");
  const music = findClip(after, "cl_m").clip;
  const keys = music.keys.volume;
  assert.ok(Array.isArray(keys) && keys.length >= 4, "キーが入っていない");
  for (let i = 0; i < keys.length; i++) {
    assert.ok(keys[i].v >= 0 && keys[i].v <= 1, `保存されたキーが 0..1 の外 (${keys[i].v})`);
    if (i) assert.ok(keys[i].t > keys[i - 1].t, "キーの t が昇順・重複なしでない");
  }
  /* amount を強めても 0 未満にならない */
  const hard = tools.autoDuck(p, { amount: 0.95 });
  for (const op of hard.ops) assert.ok(op.payload.v >= 0 && op.payload.v <= 1);
});

test("autoBeatSync: clip.roll で寄せる（総尺は変わらない）", () => {
  const p = baseProject();
  const res = assertResult(tools.autoBeatSync(p, {}), "autoBeatSync");
  assert.deepEqual(res.ops.map((o) => o.type), ["clip.roll"]);
  assert.equal(res.ops[0].payload.clipId, "cl_1");
  assert.ok(Math.abs(res.ops[0].payload.delta - 0.1) < 1e-6, `9.9 秒の境界を 10 秒へ (${res.ops[0].payload.delta})`);
  const before = trackEnd(p.tracks.find((t) => t.id === "tr_v"));
  const after = apply(p, res.ops, "autoBeatSync");
  const tr = after.tracks.find((t) => t.id === "tr_v");
  assert.ok(Math.abs(trackEnd(tr) - before) < 1e-6, "総尺が変わってしまった");
  assert.ok(Math.abs(clipEnd(tr.clips[0]) - 10) < 1e-6, "境界が拍に乗っていない");
  /* maxShift より遠い拍へは動かさない */
  const tight = tools.autoBeatSync(p, { maxShift: 0.05 });
  assert.equal(tight.ops.length, 0);
  assert.equal(tools.beatGridFor(p, { divide: 2 }).times[1], 0.25, "divide で拍を割れていない");
});

test("autoReframe: 比率・変形・キーフレーム（9:16 化）", () => {
  const p = baseProject();
  const res = assertResult(tools.autoReframe(p, { ratio: "9:16" }), "autoReframe");
  assert.equal(res.ops[0].type, "settings.update");
  assert.equal(res.ops[0].payload.patch.ratio, "9:16");
  const tf = res.ops.find((o) => o.type === "clip.setTransform");
  assert.ok(Math.abs(tf.payload.transform.scale - (16 / 9) / (9 / 16)) < 1e-6, "16:9 → 9:16 の拡大率が違う");
  const keys = res.ops.filter((o) => o.type === "key.add");
  assert.ok(keys.length >= 4, "動きがキーフレームになっていない");
  for (const k of keys) {
    assert.ok(["transform.x", "transform.y"].indexOf(k.payload.path) >= 0);
    assert.ok(Number.isFinite(k.payload.v), "キーの値が数でない");
  }
  apply(p, res.ops, "autoReframe");
  /* pure な計算（真ん中は寄らない・右寄りは左へずらす） */
  assert.deepEqual(tools.reframeTransformAt(0.5, 0.5, 16 / 9, 16 / 9), { x: 0, y: 0, scale: 1 });
  const right = tools.reframeTransformAt(0.9, 0.5, 16 / 9, 9 / 16);
  assert.ok(right.x < 0, "右を見るなら絵は左へ動く");
  assert.ok(Math.abs(right.y) < 1e-9, "縦は使い切っているので動かない");
  /* 窓の外へは出ない（端で止まる） */
  const far = tools.reframeTransformAt(2, 2, 16 / 9, 9 / 16);
  assert.ok(Math.abs(far.x) <= (0.5 - 0.5 * (9 / 16) / (16 / 9)) * far.scale + 1e-9);
});

test("autoColor / autoNormalize / autoChapters / autoHighlights / autoTelop が当たる", () => {
  const p = baseProject();
  const color = assertResult(tools.autoColor(p, {}), "autoColor");
  assert.ok(color.ops.every((o) => o.type === "clip.setColor"));
  assert.ok(color.ops[0].payload.color.exposure > 0, "暗い素材を明るくしていない");
  apply(p, color.ops, "autoColor");

  const norm = assertResult(tools.autoNormalize(p, { targetLufs: -14 }), "autoNormalize");
  assert.ok(norm.ops.every((o) => o.type === "clip.update" && o.payload.patch.volume > 0));
  const afterNorm = apply(p, norm.ops, "autoNormalize");
  assert.ok(findClip(afterNorm, "cl_1").clip.volume > 1, "-18dBFS の声を上げていない");
  assert.equal(Math.round(tools.measureLoudness(p.assets[0].analysis.loudness)), -18);
  assert.equal(tools.measureLoudness(null), null);

  const ch = assertResult(tools.autoChapters(p, { minGap: 8 }), "autoChapters");
  assert.deepEqual(ch.ops.map((o) => o.payload.t), [0, 9.9]);
  const afterCh = apply(p, ch.ops, "autoChapters");
  assert.equal(afterCh.chapters.length, 2);
  /* 2 度目は既にあるので打たない */
  assert.equal(tools.autoChapters(afterCh, { minGap: 8 }).ops.length, 0);

  const hi = tools.autoHighlights(p, { count: 3, len: 2 });
  assert.equal(hi.ranges.length, 3);
  for (const r of hi.ranges) assert.ok(Math.abs((r.end - r.start) - 2) < 1e-6, "len が効いていない");
  assert.ok(hi.ops.every((o) => o.type === "marker.add"));
  apply(p, hi.ops, "autoHighlights");

  const telop = assertResult(tools.autoTelopFromSilence(p, {}), "autoTelopFromSilence");
  assert.ok(telop.ops.every((o) => o.type === "clip.add" && o.payload.clip.kind === "text"));
  assert.ok(telop.ops.every((o) => o.payload.clip.text.content === ""), "空の枠ではない");
  const afterTelop = apply(p, telop.ops, "autoTelopFromSilence");
  assert.equal(afterTelop.tracks.find((t) => t.id === "tr_t").clips.length, telop.ops.length);
});

test("autoZoomPunch / autoTransitions / evenOut / removeGaps / autoFadeInOut が当たる", () => {
  const p = baseProject();
  const zoom = assertResult(tools.autoZoomPunch(p, { clipIds: ["cl_1"] }), "autoZoomPunch");
  assert.ok(zoom.ops.every((o) => o.type === "key.add" && o.payload.path === "transform.scale"));
  const afterZoom = apply(p, zoom.ops, "autoZoomPunch");
  const scaleKeys = findClip(afterZoom, "cl_1").clip.keys["transform.scale"];
  assert.ok(scaleKeys.length >= 3);
  assert.ok(Math.max(...scaleKeys.map((k) => k.v)) > 1, "寄っていない");

  const tr = assertResult(tools.autoTransitions(p, { style: "punchy", density: 1 }), "autoTransitions");
  assert.ok(tr.ops.every((o) => o.type === "clip.setTransition" && o.payload.edge === "in"));
  const afterTr = apply(p, tr.ops, "autoTransitions");
  assert.ok(findClip(afterTr, "cl_2").clip.transitionIn, "トランジションが入っていない");

  const even = assertResult(tools.evenOut(p, {}), "evenOut");
  assert.ok(even.ops.every((o) => o.type === "clip.trim" && o.payload.ripple === true));
  const afterEven = apply(p, even.ops, "evenOut");
  const vt = afterEven.tracks.find((t) => t.id === "tr_v");
  assert.ok(Math.abs(vt.clips[0].duration - vt.clips[1].duration) < 0.05, "長さがそろっていない");

  /* 隙間があるときだけ詰める */
  const gapped = baseProject();
  gapped.tracks[0].clips[1].start = 12;
  const gaps = assertResult(tools.removeGaps(gapped, {}), "removeGaps");
  assert.deepEqual(gaps.ops.map((o) => o.type), ["timeline.magneticClose"]);
  const afterGaps = apply(gapped, gaps.ops, "removeGaps");
  assert.ok(Math.abs(afterGaps.tracks[0].clips[1].start - 9.9) < 1e-6, "隙間が詰まっていない");

  const fade = assertResult(tools.autoFadeInOut(p, { in: 0.4, out: 0.6 }), "autoFadeInOut");
  const afterFade = apply(p, fade.ops, "autoFadeInOut");
  assert.ok(Math.abs(findClip(afterFade, "cl_1").clip.audioFade.in - 0.4) < 1e-6);
  const op1 = findClip(afterFade, "cl_1").clip.keys.opacity;
  assert.ok(op1 && op1[0].v === 0 && op1[op1.length - 1].v === 1, "頭が透明から始まっていない");
  assert.ok(Math.abs(findClip(afterFade, "cl_2").clip.audioFade.out - 0.6) < 1e-6);
});

/* ══ 8. refineLocal（30 通り以上の言い方 → 期待する op）══════════ */

/** 追い注文の試験台: 映像 3 カット（cl_2 に遷移）・BGM・テロップ 3（1 つは短い） */
function refineProject(ratio = "16:9") {
  return newProject({
    name: "追い注文",
    settings: { width: 1920, height: 1080, ratio, fps: 30 },
    assets: [
      { id: "as_v", kind: "video", name: "a.mp4", mime: "video/mp4", duration: 30, width: 1920, height: 1080, fps: 30, hasAudio: true, storage: { kind: "idb", key: "k1" } },
      { id: "as_m", kind: "audio", name: "bgm.m4a", mime: "audio/mp4", duration: 60, hasAudio: true, storage: { kind: "idb", key: "k2" } }
    ],
    tracks: [
      {
        id: "tr_v", kind: "video", name: "V1", clips: [
          { id: "cl_1", kind: "video", assetId: "as_v", start: 0, duration: 6, in: 0, out: 6, keys: { "transform.scale": [{ t: 0, v: 1, ease: "linear" }, { t: 2, v: 1.1, ease: "linear" }] } },
          { id: "cl_2", kind: "video", assetId: "as_v", start: 6, duration: 6, in: 6, out: 12, transitionIn: { type: "crossfade", duration: 0.4, params: {} } },
          { id: "cl_3", kind: "video", assetId: "as_v", start: 12, duration: 6, in: 12, out: 18 }
        ]
      },
      { id: "tr_a", kind: "audio", name: "BGM", clips: [{ id: "cl_m", kind: "audio", assetId: "as_m", start: 0, duration: 18, in: 0, out: 18 }] },
      {
        id: "tr_t", kind: "overlay", name: "テロップ", clips: [
          { id: "cl_t1", kind: "text", start: 0, duration: 3, text: { content: "タイトル", style: { size: 64 } } },
          { id: "cl_t2", kind: "text", start: 4, duration: 3, text: { content: "次の文", style: { size: 48 } } },
          { id: "cl_t3", kind: "text", start: 8, duration: 0.5, text: { content: "短い", style: { size: 40 } } }
        ]
      }
    ]
  });
}

/** [注文, 期待する op type, （必要なら）選択] */
const REFINE_CASES = [
  ["もっとテンポ速くして", "clip.setSpeed"],
  ["ゆっくりにして", "clip.setSpeed"],
  ["1.5倍速にして", "clip.setSpeed"],
  ["半分の速さにして", "clip.setSpeed"],
  ["2倍速で", "clip.setSpeed"],
  ["最後を5秒短くして", "clip.trim"],
  ["最初を3秒カットして", "clip.trim"],
  ["最後を2秒伸ばして", "clip.trim"],
  ["全体を12秒にして", "clip.trim"],
  ["長さをそろえて", "clip.trim"],
  ["テロップを大きくして", "clip.setText"],
  ["テロップを20%小さくして", "clip.setText"],
  ["字幕を白くして", "clip.setText"],
  ["テロップを下に寄せて", "clip.setText"],
  ["白黒にして", "clip.setColor"],
  ["もっと明るくして", "clip.setColor"],
  ["少し暗くして", "clip.setColor"],
  ["鮮やかにして", "clip.setColor"],
  ["彩度を下げて", "clip.setColor"],
  ["コントラストを上げて", "clip.setColor"],
  ["コントラストを下げて", "clip.setColor"],
  ["暖かい色にして", "clip.setColor"],
  ["冷たい色にして", "clip.setColor"],
  ["BGMを小さくして", "track.update"],
  ["BGMを大きくして", "track.update"],
  ["音量を20%下げて", "clip.update"],
  ["音量を上げて", "clip.update"],
  ["音を消して", "clip.update"],
  ["フェードを付けて", "clip.update"],
  ["トランジションを増やして", "clip.setTransition"],
  ["トランジションを減らして", "clip.removeTransition"],
  ["カットを増やして", "clip.split"],
  ["短いクリップを削除して", "clip.rippleDelete"],
  ["隙間を詰めて", "timeline.magneticClose"],
  ["順番を逆にして", "clip.reorder"],
  ["ズームを入れて", "key.add"],
  ["ズームをやめて", "key.remove"],
  ["90度回転して", "clip.setTransform"],
  ["中央に寄せて", "clip.setTransform"],
  ["手ブレを直して", "clip.update"],
  ["逆再生にして", "clip.update"],
  ["静止させて", "clip.freeze"],
  ["縦にして", "settings.update"],
  ["正方形にして", "settings.update"],
  ["チャプターを打って", "chapter.add"],
  ["この部分を削除して", "clip.rippleDelete", { clipIds: ["cl_2"] }]
];

test("refineLocal: 30 通り以上の言い方が期待する op を出す（pure）", () => {
  assert.ok(REFINE_CASES.length >= 30, `規則の試験が ${REFINE_CASES.length} 通りしかない`);
  const p = refineProject();
  for (const [prompt, want, selection] of REFINE_CASES) {
    const res = refine.refineLocal(prompt, { project: p, selection: selection || null });
    assert.ok(res.ops.length > 0, `「${prompt}」を読み取れなかった（${res.summary}）`);
    const types = res.ops.map((o) => o.type);
    assert.ok(types.indexOf(want) >= 0, `「${prompt}」→ ${want} を期待したが ${JSON.stringify([...new Set(types)])}`);
    assert.equal(typeof res.summary, "string");
    assert.ok(res.summary.length > 0, `「${prompt}」に summary が無い`);
    /* 作った ops は本当に当たる（1 つでも投げると batch が丸ごと巻き戻る） */
    apply(p, res.ops, `refineLocal:${prompt}`);
  }
});

test("refineLocal: 数（倍率・秒・割合）を拾う", () => {
  const p = refineProject();
  const speed = refine.refineLocal("2倍速にして", { project: p });
  assert.ok(speed.ops.every((o) => Math.abs(o.payload.speed - 2) < 1e-9), "2 倍になっていない");
  const half = refine.refineLocal("0.5倍にして", { project: p });
  assert.ok(half.ops.every((o) => Math.abs(o.payload.speed - 0.5) < 1e-9));
  const sec = refine.refineLocal("最後を5秒短くして", { project: p });
  assert.ok(Math.abs(sec.ops[0].payload.delta - 5) < 1e-9, "5 秒になっていない");
  const pct = refine.refineLocal("テロップを50%大きくして", { project: p });
  const sizes = pct.ops.map((o) => o.payload.patch.style.size);
  assert.deepEqual(sizes, [96, 72, 60], "50% 大きく（64→96・48→72・40→60）になっていない");
  const down = refine.refineLocal("音量を20%下げて", { project: p });
  assert.ok(down.ops.every((o) => Math.abs(o.payload.patch.volume - 0.8) < 1e-9), "20% 下がっていない");
  assert.equal(refine.parseMultiplier("1.5倍速で"), 1.5);
  assert.equal(refine.parseMultiplier("半分にして"), 0.5);
  assert.equal(refine.parseMultiplier("ふつうに"), null);
  assert.equal(refine.parsePercent("20%下げて"), 0.2);
  assert.equal(refine.parsePercent("3割ほど"), 0.3);
  assert.equal(refine.parseSeconds("1分30秒"), 90);
  assert.equal(refine.parseSeconds("5秒"), 5);
  assert.equal(refine.parseSeconds("なし"), null);
});

test("refineLocal: 選択が在れば選択だけ・「全部」なら全部", () => {
  const p = refineProject();
  const sel = refine.refineLocal("明るくして", { project: p, selection: { clipIds: ["cl_1"] } });
  assert.equal(sel.ops.length, 1);
  assert.equal(sel.ops[0].payload.clipId, "cl_1");
  const all = refine.refineLocal("全部明るくして", { project: p, selection: { clipIds: ["cl_1"] } });
  assert.equal(all.ops.length, 3, "「全部」と言われたのに選択だけ触っている");
  /* 配列の選択（store.selection.clipIds でなくても読む） */
  const arrSel = refine.refineLocal("明るくして", { project: p, selection: ["cl_2"] });
  assert.equal(arrSel.ops[0].payload.clipId, "cl_2");
});

test("refineLocal: 同じ枝の規則は 1 つだけ効く／違う枝は両方効く", () => {
  const p = refineProject();
  /* 「音楽を小さく」は BGM の規則だけ（クリップの音量まで二重に下げない） */
  const bgm = refine.refineLocal("音楽を小さくして", { project: p });
  assert.deepEqual([...new Set(bgm.ops.map((o) => o.type))], ["track.update"]);
  /* 速度とテロップは別の枝なので両方効く */
  const both = refine.refineLocal("もっとテンポ速くしてテロップを大きくして", { project: p });
  const types = new Set(both.ops.map((o) => o.type));
  assert.ok(types.has("clip.setSpeed") && types.has("clip.setText"));
  assert.match(both.summary, / \/ /, "2 つ効いたのに summary が 1 つ");
});

test("refineLocal: 読めない注文は ops を作らず、理由を返す", () => {
  const p = refineProject();
  for (const prompt of ["なんかいい感じにして", "", "?????", "おまかせ"]) {
    const res = refine.refineLocal(prompt, { project: p });
    assert.equal(res.ops.length, 0, `「${prompt}」で勝手に編集した`);
    assert.ok(res.summary.length > 0);
  }
});

test("refineLocal: 規則表の見本（say）は自分の規則に当たる（LLM の言い換え先）", () => {
  const wide = refineProject("16:9");
  const tall = refineProject("9:16");
  /* どの規則も相手が見つかるように、映像・テロップ・音・短いクリップ・遷移つきを混ぜて選ぶ */
  const selection = { clipIds: ["cl_1", "cl_2", "cl_t1", "cl_t3", "cl_m"] };
  assert.equal(refine.RULE_IDS.length, refine.RULES.length);
  assert.ok(refine.RULES.length >= 30, `規則が ${refine.RULES.length} 個しかない`);
  for (const rule of refine.RULES) {
    const hit = [wide, tall].some((p) => refine.refineLocal(rule.say, { project: p, selection }).matched.indexOf(rule.id) >= 0);
    assert.ok(hit, `見本「${rule.say}」が規則 ${rule.id} に当たらない`);
  }
  /* 見本はすべて違う文（同じ文が 2 つあると LLM が選べない） */
  assert.equal(new Set(refine.RULE_PHRASES).size, refine.RULE_PHRASES.length);
});

/* ══ 9. refine（LLM は読めなかった時だけ）════════════════════════ */

test("refine: 規則で読めたら通信しない（source:'local'）", async () => {
  const p = refineProject();
  let called = 0;
  const llm = { available: true, json: async () => { called++; return { phrases: [] }; } };
  const res = await refine.refine({ prompt: "テロップを大きくして", project: p, llm });
  assert.equal(res.source, "local");
  assert.ok(res.ops.length > 0);
  assert.equal(called, 0, "規則で読めたのに LLM を呼んだ");
});

test("refine: 読めない注文は LLM に言い換えてもらい、もう一度規則に通す", async () => {
  const p = refineProject();
  const seen = [];
  const llm = {
    available: true,
    json: async (messages) => { seen.push(messages); return { phrases: ["テロップを大きくして", "BGMを小さくして"] }; }
  };
  const res = await refine.refine({ prompt: "文字が読みにくいから何とかして", project: p, llm });
  assert.equal(res.source, "llm");
  const types = new Set(res.ops.map((o) => o.type));
  assert.ok(types.has("clip.setText") && types.has("track.update"));
  assert.ok(res.warnings.some((w) => /読み替え/.test(w)), "AI が何と読み替えたかを伝えていない");
  /* 送った文に「今の編集」と言い換えの見本が入っている */
  const sent = JSON.stringify(seen[0]);
  assert.ok(sent.indexOf("追い注文") >= 0, "今の編集内容を渡していない");
  assert.ok(sent.indexOf(refine.RULE_PHRASES[0]) >= 0, "言い換えの見本を渡していない");
});

test("refine: LLM が落ちても ops 無しで穏やかに返る（例外にしない）", async () => {
  const p = refineProject();
  const llm = { available: true, json: async () => { throw new Error("繋がらない"); } };
  const res = await refine.refine({ prompt: "何とかして", project: p, llm });
  assert.equal(res.source, "none");
  assert.equal(res.ops.length, 0);
  assert.ok(res.warnings.some((w) => /繋がらない/.test(w)));
  /* llm 無しでも同じ形 */
  const bare = await refine.refine({ prompt: "何とかして", project: p });
  assert.equal(bare.source, "none");
  assert.ok(Array.isArray(bare.ops) && typeof bare.summary === "string");
  /* 中止は投げ直す */
  const abort = { available: true, json: async () => { const e = new Error("中止しました"); e.name = "AbortError"; throw e; } };
  await assert.rejects(() => refine.refine({ prompt: "何とかして", project: p, llm: abort }), (e) => e.name === "AbortError");
});

test("explain: 今の編集内容を日本語で説明する", () => {
  const p = refineProject();
  const text = refine.explain(p);
  assert.ok(text.indexOf("追い注文") >= 0, "プロジェクト名が無い");
  assert.ok(text.indexOf("16:9") >= 0 && text.indexOf("30fps") >= 0, "画面の条件が無い");
  assert.ok(text.indexOf("18.0 秒") >= 0, "長さが無い");
  assert.ok(text.indexOf("タイトル") >= 0, "テロップの中身が無い");
  assert.ok(text.indexOf("トランジション 1 か所") >= 0, "トランジションの数が無い");
  assert.ok(text.indexOf("BGM") >= 0, "BGM の説明が無い");
  assert.ok(text.length < 600, "説明が長すぎる（LLM の文脈に入れられない）");
  /* 空でも落ちない */
  assert.equal(typeof refine.explain(newProject({ name: "空" })), "string");
  assert.equal(typeof refine.explain(null), "string");
});

test("captionsFromProject: text クリップから字幕を集める（書き出し用）", () => {
  const p = refineProject();
  const list = captions.captionsFromProject(p);
  assert.equal(list.length, 3);
  assert.equal(list[0].text, "タイトル");
  assert.ok(Math.abs(list[0].end - 3) < 1e-9);
  /* そのまま SRT / VTT にできる（契約書 §11-5） */
  const srt = captions.srtStringify(list);
  assert.equal(captions.srtParse(srt).length, 3);
  assert.equal(captions.captionsFromProject(p, { trackId: "tr_v" }).length, 0);
  assert.deepEqual(captions.captionsFromProject(null), []);
});

test("autoSubtitleFromSpeech: 字幕を渡せば text クリップの ops になる", () => {
  const p = baseProject();
  const list = [{ start: 0, end: 2, text: "一つ目の字幕です。" }, { start: 2.5, end: 4, text: "二つ目。" }];
  const res = assertResult(tools.autoSubtitleFromSpeech(p, { captions: list, maxCharsPerLine: 12 }), "autoSubtitleFromSpeech");
  assert.ok(res.ops.length >= 2);
  assert.ok(res.ops.every((o) => o.type === "clip.add" || o.type === "track.add"));
  const after = apply(p, res.ops, "autoSubtitleFromSpeech");
  const texts = [];
  for (const tr of after.tracks) for (const cl of tr.clips) if (cl.kind === "text") texts.push(cl.text.content);
  assert.ok(texts.join("").indexOf("一つ目") >= 0, "字幕の文字が入っていない");
});
