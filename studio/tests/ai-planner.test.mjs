/* ══════════════════════════════════════════════════════════════════════════
   studio/tests/ai-planner.test.mjs — 自動編集の「頭」の試験
   （ai/llm.js の jsonRepair / ai/intent.js / ai/templates.js / ai/planner.js）

   ★ 何を固定するか
     ① `jsonRepair` … LLM が返しがちな壊れ方（``` で囲む・前後の言い訳・末尾の
        カンマ・全角の引用符・コメント・裸の鍵・途中で切れた）を全部直せること。
        直せない物は **null**（黙って空の object を返さない）。
     ② `parseIntentLocal` … 日本語 20 例以上。ネットが無くても
        「尺・比率・テンポ・テロップ・色・BGM・避けたい物・速度」が埋まること。
     ③ `planLocal` … 決定論 / 目標尺 ±10% / 全素材を少なくとも 1 回 /
        pacing ごとの 1 ショット長 / 冒頭のフック / 遷移の規則。
     ④ `validatePlan` `repairPlan` … 壊れた Plan を見つけて直せること。
     ⑤ `createLLM` … 偽の fetch で「JSON が読めなければ言い直させる」
        「401 で available が落ちる」「タイムアウトが AbortController で効く」。
     ⑥ `planEdit` … LLM が壊れていても **必ず Plan が返る**（契約書 §6 の合格条件）。

   ★ 走らせ方
     cd /home/user/VocabularyQuize2026/studio && npm test
     （1 ファイルだけなら node --test studio/tests/ai-planner.test.mjs）
   ══════════════════════════════════════════════════════════════════════════ */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  jsonRepair, parseJsonLoose, extractText, createLLM, LLMError,
  stripJsonComments, stripTrailingCommas, normalizeFullWidth, quoteBareKeys, closeOpenJson, sliceJsonSpan
} from "../src/ai/llm.js";
import {
  parseIntentLocal, parseIntent, normalizeIntent, normalizeJa, clauses, isNegative,
  parseTargetDuration, parseSpeed, quotedParts, MIN_TARGET, MAX_TARGET
} from "../src/ai/intent.js";
import {
  TEMPLATES, TEMPLATE_IDS, STYLE_IDS, TEXT_PRESETS, COLOR_LOOKS, PACING_SHOT,
  getTemplate, pickTemplate, templateDefaults, roleSpec, gradeForLook, shotLengthFor
} from "../src/ai/templates.js";
import {
  planLocal, planEdit, planFromTemplate, validatePlan, repairPlan,
  assetScore, assetDuration, pickMusicAsset, PLAN_KEYS, SEGMENT_KEYS, TRANSITIONS
} from "../src/ai/planner.js";

/* ── 足場 ─────────────────────────────────────────────────────── */

/** 素材 1 つ（解析は渡された物だけ。契約書 §1 の Asset の形） */
function mkAsset(id, kind, duration, extra) {
  return Object.assign({
    id, kind, name: `${id}.${kind === "image" ? "png" : kind === "audio" ? "m4a" : "mp4"}`,
    mime: kind === "image" ? "image/png" : kind === "audio" ? "audio/mp4" : "video/mp4",
    size: 1024, duration, width: 1920, height: 1080, fps: 30,
    hasAudio: kind !== "image", rotation: 0, createdAt: 0, analysis: null
  }, extra || null);
}

/** 等間隔の curve（analysis/video.js の makeCurve と同じ形） */
const curve = (hz, sec, f) => ({ hz, values: Array.from({ length: Math.max(1, Math.round(hz * sec)) }, (_, i) => f(i / hz)) });

/** それらしい analysis（点数付けと範囲選びを効かせる） */
function mkAnalysis(dur, opts = {}) {
  return {
    version: 1, duration: dur,
    scenes: [{ start: 0, end: dur / 2, score: 0.5 }, { start: dur / 2, end: dur, score: 0.6 }],
    motion: curve(2, dur, (t) => 0.3 + 0.25 * Math.sin(t)),
    sharp: curve(2, dur, () => (opts.sharp === undefined ? 0.7 : opts.sharp)),
    bright: curve(2, dur, () => (opts.bright === undefined ? 0.5 : opts.bright)),
    sat: curve(2, dur, () => 0.4),
    faces: null, loudness: null,
    silence: opts.silence || [], speech: null,
    beats: opts.beats || null, highlights: [], shake: opts.shake || 0.1, warnings: []
  };
}

const mkBeats = (bpm, n) => ({
  bpm, offset: 0.2,
  times: Array.from({ length: n }, (_, i) => 0.2 + i * (60 / bpm)),
  downbeats: Array.from({ length: Math.ceil(n / 4) }, (_, i) => 0.2 + i * (240 / bpm)),
  conf: 0.9
});

/** 3 本の映像 + 1 本の音（尺も作成時刻もばらす） */
function mkAssets() {
  return [
    mkAsset("as_a", "video", 12, { createdAt: 100, analysis: mkAnalysis(12) }),
    mkAsset("as_b", "video", 30, { createdAt: 200, analysis: mkAnalysis(30, { sharp: 0.9 }) }),
    mkAsset("as_c", "image", 0, { createdAt: 300, name: "photo.png" }),
    mkAsset("as_m", "audio", 90, { createdAt: 50, name: "bgm.m4a", analysis: mkAnalysis(90, { beats: mkBeats(120, 180) }) })
  ];
}

/** 注文票を手で作る（規則で読まず、鍵だけ差し替えたいとき） */
const mkIntent = (over) => Object.assign(parseIntentLocal("", null), over || null);

/** want は **タイムライン上で見せる秒数**（speed を掛ける前ではない）。
    ai/resolve.js が `srcWant = want × speed` として素材側の秒へ直すので、
    でき上がりの尺は speed に関係なく want の総和になる。 */
const sum = (plan) => plan.segments.reduce((m, s) => m + s.want, 0);

/* ══ ① jsonRepair ═════════════════════════════════════════════════ */

test("jsonRepair: 素の JSON はそのまま読める", () => {
  assert.deepEqual(parseJsonLoose('{"a":1,"b":[1,2]}'), { a: 1, b: [1, 2] });
  assert.deepEqual(parseJsonLoose('[{"a":1}]'), [{ a: 1 }]);
});

test("jsonRepair: LLM の壊れ方を全部直す", () => {
  const cases = [
    ["``` で囲む", "はい、これです。\n```json\n{\"a\": 1}\n```\n以上", { a: 1 }],
    ["言語名なしの ```", "```\n{\"a\": 1}\n```", { a: 1 }],
    ["閉じ忘れの ```", "```json\n{\"a\": 1}", { a: 1 }],
    ["前後の言い訳", "承知しました。{\"a\": 1} でどうでしょう？", { a: 1 }],
    ["末尾カンマ", '{"a": 1, "b": [1, 2, ], }', { a: 1, b: [1, 2] }],
    ["全角引用符", "{“a”：1，“b”：“日本語”}", { a: 1, b: "日本語" }],
    ["行コメント", '{\n // 説明\n "a": 1\n}', { a: 1 }],
    ["範囲コメント", '{ "a": 1 /* ここ */, "b": 2 }', { a: 1, b: 2 }],
    ["裸の鍵", "{a: 1, b_2: \"x\"}", { a: 1, b_2: "x" }],
    ["単引用符", "{'a': 'x'}", { a: "x" }],
    ["途中で切れた", '{"a": 1, "b": [1, 2', { a: 1, b: [1, 2] }],
    ["文字列が切れた", '{"a": "とちゅ', { a: "とちゅ" }],
    ["入れ子", '{"segments":[{"assetId":"as_1","want":2,},],}', { segments: [{ assetId: "as_1", want: 2 }] }]
  ];
  for (const [name, input, want] of cases) {
    const fixed = jsonRepair(input);
    assert.ok(fixed !== null, `${name}: 直せなかった`);
    assert.deepEqual(JSON.parse(fixed), want, name);
  }
});

test("jsonRepair: 直せない物は null（空の object を返さない）", () => {
  assert.equal(jsonRepair("すみません、分かりません"), null);
  assert.equal(jsonRepair(""), null);
  assert.equal(jsonRepair(null), null);
  assert.equal(parseJsonLoose("ただの文章"), null);
});

test("jsonRepair: 文字列の中身は壊さない", () => {
  // 括弧・カンマ・コメント記号が文字列の中に在っても消さない
  assert.deepEqual(parseJsonLoose('{"a": "} , // なぞ /* */"}'), { a: "} , // なぞ /* */" });
  assert.deepEqual(parseJsonLoose('{"note": "1, 2, 3,"}'), { note: "1, 2, 3," });
  assert.equal(stripTrailingCommas('{"a":"x,"}'), '{"a":"x,"}');
  assert.equal(stripJsonComments('{"a":"http://x"}'), '{"a":"http://x"}');
  /* 裸の鍵を直すとき、本文の「, 英字 :」を鍵と見間違えないこと
     （見間違えると文字列が割れて、直せる JSON が直せなくなる） */
  assert.equal(quoteBareKeys('{"note":"a, b: c", x:1}'), '{"note":"a, b: c", "x":1}');
  assert.deepEqual(parseJsonLoose('{"note":"a, b: c", x:1}'), { note: "a, b: c", x: 1 });
  assert.deepEqual(parseJsonLoose('{"jp":"夏, 海: 思い出", seg:[]}'), { jp: "夏, 海: 思い出", seg: [] });
  assert.deepEqual(parseJsonLoose('{"esc":"a\\", b: c", k:2}'), { esc: 'a", b: c', k: 2 });
  assert.equal(quoteBareKeys('{"ok":1}'), '{"ok":1}');
  assert.equal(quoteBareKeys("{2a:1}"), "{2a:1}");   // 数字始まりは鍵にしない
});

test("jsonRepair: 部品もそれぞれ pure に動く", () => {
  assert.equal(sliceJsonSpan("まえ {\"a\":1} あと"), '{"a":1}');
  assert.equal(quoteBareKeys("{a:1}"), '{"a":1}');
  assert.equal(closeOpenJson('{"a":[1'), '{"a":[1]}');
  assert.equal(normalizeFullWidth("｛a：1｝"), "{a:1}");
  // 同じ入力なら必ず同じ出力（pure）
  const s = '```json\n{"a":1,}\n```';
  assert.equal(jsonRepair(s), jsonRepair(s));
});

test("extractText: どの形の応答からも本文を拾う", () => {
  assert.equal(extractText("そのまま"), "そのまま");
  assert.equal(extractText({ text: "a" }), "a");
  assert.equal(extractText({ content: "b" }), "b");
  assert.equal(extractText({ message: { content: "c" } }), "c");
  assert.equal(extractText({ choices: [{ message: { content: "d" } }] }), "d");
  assert.equal(extractText({ content: [{ text: "e" }, { text: "f" }] }), "ef");
  assert.equal(extractText({ nothing: 1 }), "");
});

/* ══ ② parseIntentLocal（日本語 20 例以上）════════════════════════ */

test("parseIntentLocal: 日本語の注文を規則だけで読む（20 例以上）", () => {
  const assets = mkAssets();
  const cases = [
    ["30秒のテンポいい旅行Vlogにして、テロップ入れて、BGMのビートで切って", { targetDuration: 30, pacing: "beat", style: "travel", captions: "auto" }],
    ["1分くらいの商品紹介。縦で", { targetDuration: 60, ratio: "9:16", style: "product" }],
    ["しっとりした結婚式のムービーを2分で", { targetDuration: 120, pacing: "slow", style: "wedding" }],
    ["TikTok用にサクサク切って", { ratio: "9:16", pacing: "fast" }],
    ["映画風の色で、ゆっくり見せて", { pacing: "slow", colorLook: "cinematic" }],
    ["解説動画。字幕は不要", { style: "explainer", captions: "none" }],
    ["ブレてる所は使わないで", { avoid: ["shaky"] }],
    ["暗いところはカットして", { avoid: ["dark"] }],
    ["2倍速で全部つなげて", { speed: 2 }],
    ["1分30秒のダイジェスト、音ハメで", { targetDuration: 90, pacing: "beat", style: "digest" }],
    ["猫の動画を30秒", { targetDuration: 30, style: "pet" }],
    ["料理の作り方。手順ごとにテロップ", { style: "food", captions: "auto" }],
    ["ニュース風に。BGMなし", { style: "news" }],
    ["ゲーム実況のハイライト、グリッチ入れて", { style: "game", effects: ["glitch"] }],
    ["正方形でモノクロにして", { ratio: "1:1", colorLook: "mono" }],
    ["スポーツの試合のいいとこだけ45秒で", { targetDuration: 45, style: "sports" }],
    ["最後にチャンネル登録のお願いを入れて", { endCardText: "チャンネル登録をお願いします" }],
    ["英語のテロップで", { language: "en" }],
    ["90秒、しっとり、シネスコで", { targetDuration: 90, pacing: "slow", ratio: "2.35:1" }],
    ["インタビューを丁寧にまとめて。BGMは小さめ", { style: "interview", mood: "serious", gain: 0.15 }],
    ["20〜30秒でペットのショート", { targetDuration: 25, ratio: "9:16", style: "pet" }],
    ["1時間の講義を10分にまとめて", { targetDuration: 600 }],
    ["手ぶれ補正をかけて、明るくして", { effects: ["stabilize"], colorLook: "bright" }],
    ["レトロなフィルム風でゆったり", { colorLook: "retro", pacing: "slow" }],
    ["MVっぽく音ハメで、縦", { pacing: "beat", ratio: "9:16" }],
    ["", { targetDuration: 60, ratio: "16:9", pacing: "medium", captions: "auto" }]
  ];
  assert.ok(cases.length >= 20, "例が 20 個に足りない");
  for (const [prompt, want] of cases) {
    const it = parseIntentLocal(prompt, { assets });
    for (const key of Object.keys(want)) {
      if (key === "avoid" || key === "effects") {
        for (const token of want[key]) assert.ok(it[key].indexOf(token) >= 0, `「${prompt}」→ ${key} に ${token} が無い（${JSON.stringify(it[key])}）`);
      } else if (key === "endCardText") {
        assert.ok(it.endCard && it.endCard.text === want[key], `「${prompt}」→ endCard が違う（${JSON.stringify(it.endCard)}）`);
      } else if (key === "gain") {
        assert.equal(it.music.gain, want[key], `「${prompt}」→ BGM の音量が違う`);
      } else {
        assert.equal(it[key], want[key], `「${prompt}」→ ${key} が違う（${it[key]}）`);
      }
    }
    /* どの注文でも Intent の形は必ず埋まっている */
    assert.ok(it.targetDuration >= MIN_TARGET && it.targetDuration <= MAX_TARGET);
    assert.ok(["slow", "medium", "fast", "beat"].indexOf(it.pacing) >= 0);
    assert.ok(["none", "auto", "prompt"].indexOf(it.captions) >= 0);
    assert.ok(Array.isArray(it.mustInclude) && Array.isArray(it.avoid) && Array.isArray(it.notes));
    assert.equal(it.source, "local");
  }
});

test("parseIntentLocal: BGM の有無と否定の掛かり方", () => {
  assert.equal(parseIntentLocal("BGMは入れないで", null).music.wanted, false);
  assert.equal(parseIntentLocal("無音でお願い", null).music.wanted, false);
  assert.equal(parseIntentLocal("BGMをしっかり入れて", null).music.wanted, true);
  assert.equal(parseIntentLocal("BGMを大きめで", null).music.gain, 0.4);
  // 「テロップは入れないで」は否定が後ろに来る（節で見ないと拾えない）
  assert.equal(parseIntentLocal("テンポよく、テロップは入れないで", null).captions, "none");
  assert.equal(parseIntentLocal("テンポよく、テロップを入れて", null).captions, "auto");
  assert.ok(isNegative("暗いところは使わないで"));
  assert.ok(!isNegative("暗いところを明るくして"));
  assert.deepEqual(clauses("A、B。C"), ["a", "b", "c"]);
  assert.equal(normalizeJa("３０秒"), "30秒");
});

test("parseIntentLocal: 素材の名前を言われたら mustInclude に入る", () => {
  const assets = [mkAsset("as_1", "video", 5, { name: "海辺の夕日.mp4" }), mkAsset("as_2", "video", 5, { name: "山.mp4" })];
  const it = parseIntentLocal("海辺の夕日は必ず入れて", { assets });
  assert.deepEqual(it.mustInclude, ["as_1"]);
});

test("parseTargetDuration / parseSpeed / quotedParts", () => {
  assert.equal(parseTargetDuration("30秒"), 30);
  assert.equal(parseTargetDuration("1分30秒"), 90);
  assert.equal(parseTargetDuration("2分"), 120);
  assert.equal(parseTargetDuration("1分半"), 90);
  assert.equal(parseTargetDuration("尺は1:30"), 90);
  assert.equal(parseTargetDuration("20〜30秒"), 25);
  assert.equal(parseTargetDuration("指定なし"), null);
  assert.equal(parseSpeed("1.5倍速"), 1.5);
  assert.equal(parseSpeed("倍速ではない"), null);
  assert.deepEqual(quotedParts("「夏の思い出」と『続編』"), ["夏の思い出", "続編"]);
  /* 「X分Y秒 に/で 〜して」… 分 を落として秒だけ拾わないこと */
  assert.equal(parseTargetDuration("1分30秒にまとめて"), 90);
  assert.equal(parseTargetDuration("2分30秒に収めて"), 150);
  assert.equal(parseTargetDuration("1分30秒で作って"), 90);
  /* 仕上がりの長さの言い方は素材の長さより強い（順番を崩していないこと） */
  assert.equal(parseTargetDuration("1時間の講義を10分にまとめて"), 600);
  assert.equal(parseTargetDuration("10分にまとめて"), 600);
  /* 範囲の区切りは「〜」でも「から」でも同じ（真ん中を採る） */
  assert.equal(parseTargetDuration("30から40秒"), 35);
  assert.equal(parseTargetDuration("1から3分"), 120);
  /* 速さ以外の「N 倍」を速度にしない（動画全体が 2 倍速になってしまう） */
  assert.equal(parseSpeed("音量を2倍にして"), null);
  assert.equal(parseSpeed("明るさ2倍"), null);
  assert.equal(parseSpeed("2倍速で全部つなげて"), 2);
  assert.equal(parseSpeed("1.5倍で再生して"), 1.5);
  assert.equal(parseSpeed("音量は2倍、3倍速で"), 3);   // 速さの方を拾う
  assert.equal(parseSpeed("10倍速"), 8);               // 上限まで
});

test("normalizeIntent: LLM の壊れた注文票でも Intent が壊れない", () => {
  const base = parseIntentLocal("30秒で縦", null);
  const merged = normalizeIntent({ targetDuration: "ごじゅう", ratio: "9:99", pacing: "超速", captions: "maybe", colorLook: "???", music: { gain: 9 } }, base);
  assert.equal(merged.targetDuration, base.targetDuration);
  assert.equal(merged.ratio, "9:16");
  assert.equal(merged.pacing, base.pacing);
  assert.equal(merged.captions, base.captions);
  assert.equal(merged.music.gain, 1);       // 0..1 に収める
  assert.equal(merged.source, "llm");
  /* `music:null` は「BGM は敷かない」（契約書 §6 の Plan.music と同じ読み方）。
     鍵ごと無いときは規則で読んだ値をそのまま使う。 */
  assert.equal(normalizeIntent({ music: null }, base).music.wanted, false);
  assert.equal(normalizeIntent({ music: false }, base).music.wanted, false);
  assert.equal(normalizeIntent({}, base).music.wanted, base.music.wanted);
});

/* ══ ③ templates ══════════════════════════════════════════════════ */

test("templates: 型が 10 個以上あって、どれも形が揃っている", () => {
  assert.ok(TEMPLATE_IDS.length >= 10, `型が ${TEMPLATE_IDS.length} 個しかない`);
  for (const id of TEMPLATE_IDS) {
    const t = TEMPLATES[id];
    assert.equal(t.id, id);
    assert.ok(t.name && /[^\x00-\x7F]/.test(t.name), `${id} の name が日本語でない`);
    assert.ok(t.description.length > 5, `${id} の description が短い`);
    assert.ok(t.targetDuration > 0 && t.avgShot > 0);
    assert.ok(["slow", "medium", "fast", "beat"].indexOf(t.pacing) >= 0);
    assert.ok(Array.isArray(t.transitions) && t.transitions.length);
    for (const tr of t.transitions) assert.ok(TRANSITIONS.indexOf(tr) >= 0, `${id} に知らない遷移 ${tr}`);
    assert.ok(TEXT_PRESETS[t.textPreset], `${id} の textPreset が無い`);
    assert.ok(COLOR_LOOKS[t.colorLook] !== undefined, `${id} の colorLook が無い`);
    assert.ok(["low", "mid", "high"].indexOf(t.musicEnergy) >= 0);
    assert.ok(t.rules && typeof t.rules === "object");
    assert.ok(STYLE_IDS.indexOf(t.style) >= 0, `${id} の style が契約の 7 種の外（${t.style}）`);
  }
});

test("templates: 引き方と既定値", () => {
  assert.equal(getTemplate("short").id, "short");
  assert.equal(getTemplate("知らない型").id, "vlog");
  assert.equal(pickTemplate({ style: "cinematic" }).style, "cinematic");
  assert.equal(pickTemplate({ ratio: "9:16" }).id, "short");
  assert.equal(pickTemplate(null).id, "vlog");
  const d = templateDefaults("food");
  assert.equal(d.id, "food");
  assert.ok(d.rules.musicGain >= 0 && d.rules.musicGain <= 1);
  // 見た目は複製で返る（1 つ直しても他に影響しない）
  const g1 = gradeForLook("cinematic"), g2 = gradeForLook("cinematic");
  g1.contrast = 99;
  assert.notEqual(g2.contrast, 99);
  assert.equal(gradeForLook("none"), null);
  // ショート長は契約の指定どおり
  assert.equal(shotLengthFor("fast"), 1.2);
  assert.equal(shotLengthFor("medium"), 2.2);
  assert.equal(shotLengthFor("slow"), 3.5);
  assert.equal(shotLengthFor("beat", 120), 2);      // 120bpm の 1 小節
  assert.equal(shotLengthFor("beat", null), PACING_SHOT.beat);
  const r = roleSpec("impact", "title");
  assert.ok(r.sizeRel > 0 && r.maxWidth <= 1 && r.anim.in.duration >= 0);
});

/* ══ ④ planLocal ══════════════════════════════════════════════════ */

test("planLocal: 決定論（同じ入力なら同じ Plan）", () => {
  const assets = mkAssets();
  const it = parseIntentLocal("30秒のテンポいい旅行Vlog、テロップ入れて", { assets });
  const a = planLocal(it, assets, null);
  const b = planLocal(parseIntentLocal("30秒のテンポいい旅行Vlog、テロップ入れて", { assets }), assets, null);
  assert.deepEqual(a, b);
  assert.equal(a.id, b.id);
});

test("planLocal: 目標尺の ±10% に収まる", () => {
  const assets = mkAssets();
  for (const prompt of ["15秒で", "30秒で", "45秒で", "1分で", "2分で", "縦で20秒、サクサク", "3分のしっとり"]) {
    const plan = planLocal(parseIntentLocal(prompt, { assets }), assets, null);
    const total = sum(plan);
    assert.ok(total >= plan.targetDuration * 0.9 - 1e-6 && total <= plan.targetDuration * 1.1 + 1e-6,
      `「${prompt}」→ 合計 ${total.toFixed(2)}s が目標 ${plan.targetDuration}s の ±10% を外れた`);
  }
});

test("planLocal: 全ての素材を少なくとも 1 回使う（mustInclude を先に）", () => {
  const assets = mkAssets();
  const plan = planLocal(parseIntentLocal("20秒で", { assets }), assets, null);
  const used = new Set(plan.segments.map((s) => s.assetId));
  for (const a of assets) {
    if (a.kind === "audio") continue;              // 音は BGM として使う
    assert.ok(used.has(a.id), `${a.id} が 1 回も使われていない`);
  }
  assert.equal(plan.music && plan.music.assetId, "as_m");
  // mustInclude の素材は点が上がるので冒頭のフックになる
  const it = Object.assign(parseIntentLocal("20秒で", { assets }), { mustInclude: ["as_c"] });
  assert.equal(planLocal(it, assets, null).segments[0].assetId, "as_c");
});

test("planLocal: pacing ごとの 1 ショット長", () => {
  const assets = [mkAsset("as_long", "video", 120, { analysis: mkAnalysis(120) })];
  const table = [["fast", 24, 1.2], ["medium", 22, 2.2], ["slow", 35, 3.5]];
  for (const [pacing, target, shot] of table) {
    const plan = planLocal(mkIntent({ pacing, targetDuration: target, captions: "none" }), assets, null);
    for (const s of plan.segments) assert.equal(s.want, shot, `${pacing} の 1 ショットが ${s.want}（${shot} のはず）`);
    assert.equal(plan.segments.length, Math.round(target / shot));
  }
  // beat は拍から（120bpm → 1 小節 = 2 秒）
  const withMusic = [assets[0], mkAsset("as_m", "audio", 120, { analysis: mkAnalysis(120, { beats: mkBeats(120, 240) }) })];
  const beatPlan = planLocal(mkIntent({ pacing: "beat", targetDuration: 20, captions: "none" }), withMusic, null);
  for (const s of beatPlan.segments) assert.equal(s.want, 2);
});

test("planLocal: 並びは時系列・冒頭にフック・遷移の規則", () => {
  const assets = mkAssets();
  const plan = planLocal(parseIntentLocal("30秒で", { assets }), assets, null);
  assert.equal(plan.segments[0].transition, "cut", "1 本目に遷移は付かない");
  // 素材が変わる所は crossfade（既定は cut）
  let changes = 0, crossfades = 0;
  for (let i = 1; i < plan.segments.length; i++) {
    const changed = plan.segments[i].assetId !== plan.segments[i - 1].assetId;
    if (changed) { changes++; if (plan.segments[i].transition === "crossfade") crossfades++; }
    else assert.notEqual(plan.segments[i].transition, "crossfade", "同じ素材の続きに crossfade は付けない");
  }
  assert.ok(changes > 0 && crossfades > 0);
  // fast は 2 割ほどを派手な遷移にする
  const fast = planLocal(mkIntent({ pacing: "fast", targetDuration: 30, style: "short" }), assets, "short");
  const spicy = fast.segments.filter((s) => s.transition === "whipPan" || s.transition === "zoomIn" || s.transition === "glitch").length;
  assert.ok(spicy > 0, "fast なのに派手な遷移が 1 つも無い");
  assert.ok(spicy <= Math.ceil(fast.segments.length * 0.35), "派手な遷移が多すぎる");
});

test("planLocal: テロップは冒頭タイトル + 場面の頭 + 締め", () => {
  const assets = mkAssets();
  const plan = planLocal(parseIntentLocal("30秒で、テロップ入れて", { assets }), assets, null);
  assert.equal(plan.captions, "auto");
  assert.equal(plan.segments[0].text.role, "title");
  assert.ok(plan.segments.filter((s) => s.text && s.text.role !== "title").length >= 1);
  assert.ok(plan.endCard && plan.endCard.text.length > 0);
  // テロップ無しの注文なら 1 枚も作らない（締めも出さない）
  const none = planLocal(parseIntentLocal("30秒で、テロップは入れないで", { assets }), assets, null);
  assert.equal(none.captions, "none");
  assert.equal(none.segments.filter((s) => s.text).length, 0);
  assert.equal(none.endCard, null);
});

test("planLocal: 素材が無くても落ちない / 静止画は 1 回だけ使う", () => {
  const empty = planLocal(parseIntentLocal("30秒で", null), [], null);
  assert.deepEqual(empty.segments, []);
  assert.equal(empty.music, null);
  assert.ok(empty.endCard, "素材が無くても締めの文字だけは残る");
  const stills = [mkAsset("as_p1", "image", 0), mkAsset("as_p2", "image", 0)];
  const plan = planLocal(parseIntentLocal("20秒で", { assets: stills }), stills, null);
  for (const id of ["as_p1", "as_p2"]) assert.equal(plan.segments.filter((s) => s.assetId === id).length, 1);
});

test("planLocal: 注文の色と速度が Plan に乗る", () => {
  const assets = mkAssets();
  const plan = planLocal(parseIntentLocal("30秒、映画風の色で、2倍速", { assets }), assets, null);
  assert.ok(plan.grade && plan.grade.contrast > 0, "colorLook が grade に落ちていない");
  for (const s of plan.segments) assert.equal(s.speed, 2);
  /* want は speed を掛ける前の秒ではないので、速度を上げても目標尺は変わらない。
     validatePlan が want を speed で割ると「離れすぎ」の嘘の警告が出る。 */
  assert.ok(sum(plan) >= plan.targetDuration * 0.9 - 1e-6 && sum(plan) <= plan.targetDuration * 1.1 + 1e-6);
  for (const mul of ["2倍速", "4倍速", "0.5倍速"]) {
    const p = planLocal(parseIntentLocal(`30秒、${mul}`, { assets }), assets, null);
    const v = validatePlan(p, { assets });
    assert.equal(v.ok, true, JSON.stringify(v.errors));
    assert.deepEqual(v.warnings.filter((w) => /離れすぎ/.test(w.msg)), [], `${mul} で嘘の警告が出た`);
  }
});

test("planFromTemplate: 型を選ぶだけでも Plan になる", () => {
  const assets = mkAssets();
  const plan = planFromTemplate("cinematic", assets, null);
  assert.equal(plan.style, "cinematic");
  assert.ok(plan.segments.length >= 3);
  assert.equal(validatePlan(plan, { assets }).ok, true);
});

/* ══ ⑤ validatePlan / repairPlan ══════════════════════════════════ */

test("validatePlan: 正しい Plan は ok", () => {
  const assets = mkAssets();
  const plan = planLocal(parseIntentLocal("30秒で", { assets }), assets, null);
  const v = validatePlan(plan, { assets });
  assert.equal(v.ok, true, JSON.stringify(v.errors));
  assert.deepEqual(v.errors, []);
  for (const k of Object.keys(plan)) assert.ok(PLAN_KEYS.indexOf(k) >= 0, `Plan に知らない鍵 ${k}`);
  for (const k of Object.keys(plan.segments[0])) assert.ok(SEGMENT_KEYS.indexOf(k) >= 0, `segment に知らない鍵 ${k}`);
});

test("validatePlan: 壊れている所を error / warning で並べる", () => {
  const assets = mkAssets();
  assert.equal(validatePlan(null, { assets }).ok, false);
  const bad = {
    ratio: "9:99", targetDuration: "30", pacing: "とても速い", captions: "たぶん",
    music: { assetId: "as_none" }, segments: [], mystery: 1
  };
  const v = validatePlan(bad, { assets });
  assert.equal(v.ok, false);
  const paths = v.errors.map((e) => e.path);
  for (const p of ["ratio", "targetDuration", "pacing", "captions", "segments", "music.assetId"]) {
    assert.ok(paths.indexOf(p) >= 0, `${p} の error が出ていない（${paths.join(",")}）`);
  }
  assert.ok(v.warnings.some((w) => w.path === "mystery"), "知らない鍵の warning が無い");
  // 無い素材・長すぎる want は segment ごとに指摘する
  const v2 = validatePlan({
    ratio: "16:9", targetDuration: 30, pacing: "fast", captions: "auto", style: "vlog",
    segments: [{ assetId: "as_none", want: 2 }, { assetId: "as_a", want: 99 }]
  }, { assets });
  assert.ok(v2.errors.some((e) => e.path === "segments[0].assetId"));
  assert.ok(v2.warnings.some((e) => e.path === "segments[1].want"));
});

test("repairPlan: 捨てる・収める・作り直す・余計な鍵を落とす", () => {
  const assets = mkAssets();
  const intent = parseIntentLocal("20秒で", { assets });
  const fixed = repairPlan({
    ratio: "9:99", pacing: "はやい", captions: "たぶん", mystery: { deep: 1 },
    segments: [
      { assetId: "as_none", want: 3 },                        // 捨てる
      { assetId: "as_a", want: 99, speed: 0, junk: true },     // 素材の尺に収める
      { assetId: "as_b", pick: { in: -5, out: 999 }, want: 2 } // pick も収める
    ]
  }, { assets, intent });
  assert.ok(!Object.prototype.hasOwnProperty.call(fixed, "mystery"));
  assert.equal(fixed.segments.length, 2);
  assert.equal(fixed.segments[0].assetId, "as_a");
  assert.ok(fixed.segments[0].want <= 12 + 1e-6, "want が素材の尺を越えている");
  assert.ok(fixed.segments[0].speed >= 0.1);
  assert.ok(fixed.segments[1].pick.in >= 0 && fixed.segments[1].pick.out <= 30 + 1e-6);
  for (const k of Object.keys(fixed.segments[1])) assert.ok(SEGMENT_KEYS.indexOf(k) >= 0);
  assert.equal(validatePlan(fixed, { assets }).ok, true);

  // segments が 0 個なら全素材から作り直す
  const rebuilt = repairPlan({ segments: [] }, { assets, intent });
  assert.ok(rebuilt.segments.length >= 3);
  assert.equal(new Set(rebuilt.segments.map((s) => s.assetId)).size >= 3, true);
  assert.equal(validatePlan(rebuilt, { assets }).ok, true);

  // 型の id が style に入っていたら契約の style へ直す
  const styled = repairPlan({ style: "travel", segments: [{ assetId: "as_a", want: 2 }] }, { assets, intent });
  assert.equal(styled.style, "vlog");
  // BGM が音の素材でなければ外す
  const nomusic = repairPlan({ music: { assetId: "as_a" }, segments: [{ assetId: "as_a", want: 2 }] }, { assets, intent });
  assert.equal(nomusic.music, null);
});

test("assetScore / assetDuration / pickMusicAsset", () => {
  const sharp = mkAsset("as_sharp", "video", 10, { analysis: mkAnalysis(10, { sharp: 0.95 }) });
  const soft = mkAsset("as_soft", "video", 10, { analysis: mkAnalysis(10, { sharp: 0.1 }) });
  assert.ok(assetScore(sharp, null) > assetScore(soft, null));
  assert.equal(assetScore(mkAsset("as_x", "video", 10), null), 0.5, "解析が無ければ 0.5（普通）");
  // avoid の性質は減点、mustInclude は加点
  assert.ok(assetScore(soft, { avoid: ["blurry"] }) < assetScore(soft, null));
  assert.ok(assetScore(soft, { mustInclude: ["as_soft"] }) > assetScore(soft, null));
  assert.equal(assetDuration(mkAsset("as_i", "image", 0)), 0);
  assert.equal(assetDuration(mkAsset("as_v", "video", 7.5)), 7.5);
  const assets = [mkAsset("as_m1", "audio", 10), mkAsset("as_m2", "audio", 60)];
  assert.equal(pickMusicAsset(assets, null).id, "as_m2", "一番長い音を BGM に選ぶ");
  assert.equal(pickMusicAsset([], null), null);
});

/* ══ ⑥ createLLM（偽の fetch で試す）══════════════════════════════ */

/** 応答を並べて返す偽の fetch（呼ばれた本文も覚える） */
function fakeFetch(replies) {
  const calls = [];
  let i = 0;
  const fn = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    const r = replies[Math.min(i++, replies.length - 1)];
    if (typeof r === "function") return r(url, init);
    return {
      ok: r.status === undefined || (r.status >= 200 && r.status < 300),
      status: r.status || 200,
      text: async () => (typeof r.body === "string" ? r.body : JSON.stringify(r.body))
    };
  };
  fn.calls = calls;
  return fn;
}

test("createLLM: chat は endpoint へ POST して本文を返す", async () => {
  const f = fakeFetch([{ body: { text: "こんにちは" } }]);
  const llm = createLLM({ endpoint: "https://example.test/api/ai/chat", token: "tok", fetchImpl: f });
  assert.equal(llm.available, true);
  assert.equal(await llm.chat("やあ", { maxTokens: 50 }), "こんにちは");
  assert.equal(f.calls[0].url, "https://example.test/api/ai/chat");
  assert.deepEqual(f.calls[0].body.messages, [{ role: "user", content: "やあ" }]);
  assert.equal(f.calls[0].body.max_tokens, 50);
});

test("createLLM: json は読めなければ「直前の出力とエラーを見せて」2 回まで言い直させる", async () => {
  const f = fakeFetch([{ body: { text: "すみません、分かりません" } }, { body: { text: "```json\n{\"a\": 1,}\n```" } }]);
  const llm = createLLM({ endpoint: "https://e.test/x", fetchImpl: f });
  assert.deepEqual(await llm.json([{ role: "user", content: "JSON で" }]), { a: 1 });
  assert.equal(f.calls.length, 2);
  const retry = f.calls[1].body.messages;
  assert.equal(retry[retry.length - 2].role, "assistant");
  assert.ok(retry[retry.length - 2].content.indexOf("分かりません") >= 0, "直前の出力を見せていない");
  assert.ok(retry[retry.length - 1].content.indexOf("JSON") >= 0, "直し方を言っていない");
});

test("createLLM: 3 回駄目なら LLMError（BAD_JSON）", async () => {
  const f = fakeFetch([{ body: { text: "だめ" } }]);
  const llm = createLLM({ endpoint: "https://e.test/x", fetchImpl: f });
  await assert.rejects(() => llm.json("お願い"), (e) => e instanceof LLMError && e.code === "BAD_JSON");
  assert.equal(f.calls.length, 3);        // 最初 + 言い直し 2 回
});

test("createLLM: 401 で available が false になる", async () => {
  const f = fakeFetch([{ status: 401, body: { message: "token が要ります" } }]);
  const llm = createLLM({ endpoint: "https://e.test/x", fetchImpl: f });
  await assert.rejects(() => llm.chat("やあ"), (e) => e.code === "HTTP_401");
  assert.equal(llm.available, false);
  assert.equal(await llm.probe(), false);
  llm.setToken("new-token");
  assert.equal(llm.available, true, "token を入れ直したら また試せる");
});

test("createLLM: fetch が無い環境・中止・Authorization", async () => {
  const none = createLLM({ endpoint: "https://e.test/x", fetchImpl: null });
  assert.equal(none.available, typeof globalThis.fetch === "function");
  const f = fakeFetch([{ body: { text: "ok" } }]);
  const withTok = createLLM({ endpoint: "https://e.test/x", token: "abc", fetchImpl: async (u, i) => { f.calls.push({ url: u, init: i }); return { ok: true, status: 200, text: async () => "{\"text\":\"ok\"}" }; } });
  await withTok.chat("やあ");
  assert.equal(f.calls[0].init.headers.Authorization, "Bearer abc");
  // 中止済みの signal を渡したら ABORTED
  const ctrl = new AbortController();
  ctrl.abort();
  const llm = createLLM({ endpoint: "https://e.test/x", fetchImpl: async () => { throw Object.assign(new Error("aborted"), { name: "AbortError" }); } });
  await assert.rejects(() => llm.chat("やあ", { signal: ctrl.signal }), (e) => e.code === "ABORTED");
});

test("createLLM: 本文が来ない相手でも時間切れと中止が効く", async () => {
  /* 実物の fetch と同じ作法の偽物: signal が立つと **本文の読み取りも** 失敗する。
     読み取りを timer の外に出すと、ここが永久に待ちになる（パネルが回り続ける）。 */
  const hang = (u, init) => ({
    ok: true, status: 200,
    text: () => new Promise((_ok, rej) => {
      const s = init && init.signal;
      const fail = () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }));
      if (!s) return;
      if (s.aborted) fail(); else s.addEventListener("abort", fail);   // 実物と同じ: 既に中止済みなら即失敗
    })
  });
  const llm = createLLM({ endpoint: "https://e.test/x", fetchImpl: async (u, i) => hang(u, i), timeout: 80 });
  await assert.rejects(() => llm.chat("やあ"), (e) => e.code === "TIMEOUT");
  const ctrl = new AbortController();
  const llm2 = createLLM({ endpoint: "https://e.test/x", fetchImpl: async (u, i) => hang(u, i), timeout: 60000 });
  const p = llm2.chat("やあ", { signal: ctrl.signal });
  ctrl.abort();
  await assert.rejects(() => p, (e) => e.code === "ABORTED");
});

/* ══ ⑦ planEdit（必ず Plan が返る）════════════════════════════════ */

test("planEdit: LLM 無しでも Plan が返る（source=local）", async () => {
  const assets = mkAssets();
  const steps = [];
  const r = await planEdit({ prompt: "30秒のテンポいい旅行Vlog、テロップ入れて", assets, onProgress: (p, i) => steps.push([p, i.stage]) });
  assert.equal(r.source, "local");
  assert.ok(r.plan.segments.length >= 3);
  assert.equal(validatePlan(r.plan, { assets }).ok, true);
  assert.ok(r.notes.length >= 1);
  assert.equal(steps[steps.length - 1][0], 1, "進捗が 1 で終わっていない");
});

test("planEdit: LLM が使えるなら LLM の案（source=llm）", async () => {
  const assets = mkAssets();
  const reply = {
    title: "AI の案", ratio: "9:16", targetDuration: 20, pacing: "fast", style: "short",
    captions: "auto", endCard: { text: "またね", duration: 1.5 },
    music: { assetId: "as_m", gain: 0.3, duck: true, startAt: "auto" },
    segments: [
      { assetId: "as_a", pick: "best", want: 4, speed: 1, transition: "cut", text: { content: "はじまり", role: "title", emphasis: 1 } },
      { assetId: "as_b", pick: "auto", want: 8, speed: 1, transition: "crossfade" },
      { assetId: "as_c", pick: "auto", want: 8, speed: 1, transition: "zoomIn" }
    ]
  };
  const f = fakeFetch([{ body: { text: "はい。```json\n" + JSON.stringify(reply) + "\n```" } }]);
  const llm = createLLM({ endpoint: "https://e.test/x", fetchImpl: f });
  const r = await planEdit({ prompt: "縦で20秒", assets, llm, intent: parseIntentLocal("縦で20秒", { assets }) });
  assert.equal(r.source, "llm");
  assert.equal(r.plan.title, "AI の案");
  assert.equal(r.plan.segments.length, 3);
  assert.equal(validatePlan(r.plan, { assets }).ok, true);
});

test("planEdit: LLM が壊れた案を返しても必ず Plan が返る", async () => {
  const assets = mkAssets();
  /* ① 直せる壊れ方（無い素材が混ざる）→ repair して使う */
  const half = { ratio: "16:9", targetDuration: 20, pacing: "fast", style: "vlog", captions: "auto",
    segments: [{ assetId: "as_none", want: 3 }, { assetId: "as_a", want: 3 }] };
  const r1 = await planEdit({ prompt: "20秒", assets, llm: createLLM({ endpoint: "https://e.test/x", fetchImpl: fakeFetch([{ body: { text: JSON.stringify(half) } }]) }) });
  assert.ok(["llm", "local"].indexOf(r1.source) >= 0);
  assert.equal(validatePlan(r1.plan, { assets }).ok, true);
  assert.ok(r1.plan.segments.length >= 1);

  /* ② JSON にならない → local へ落ちる */
  const r2 = await planEdit({ prompt: "20秒", assets, llm: createLLM({ endpoint: "https://e.test/x", fetchImpl: fakeFetch([{ body: { text: "考え中です…" } }]) }) });
  assert.equal(r2.source, "local");
  assert.equal(validatePlan(r2.plan, { assets }).ok, true);

  /* ③ 通信が落ちている → local へ落ちる */
  const r3 = await planEdit({ prompt: "20秒", assets, llm: createLLM({ endpoint: "https://e.test/x", fetchImpl: async () => { throw new Error("network down"); } }) });
  assert.equal(r3.source, "local");
  assert.ok(r3.notes.some((n) => n.indexOf("端末内") >= 0));

  /* ④ 401（available=false）→ そもそも呼ばない */
  const llm401 = createLLM({ endpoint: "https://e.test/x", fetchImpl: fakeFetch([{ status: 401, body: {} }]) });
  llm401.available = false;
  const r4 = await planEdit({ prompt: "20秒", assets, llm: llm401 });
  assert.equal(r4.source, "local");
});

test("planEdit: constraints が注文より強い / signal で中止できる", async () => {
  const assets = mkAssets();
  const r = await planEdit({ prompt: "30秒で横長", assets, constraints: { ratio: "9:16", targetDuration: 12, pacing: "slow" } });
  assert.equal(r.plan.ratio, "9:16");
  assert.equal(r.plan.targetDuration, 12);
  assert.equal(r.plan.pacing, "slow");
  const ctrl = new AbortController();
  ctrl.abort();
  await assert.rejects(() => planEdit({ prompt: "30秒", assets, signal: ctrl.signal }), (e) => e.name === "AbortError");
});

test("parseIntent: LLM が落ちても規則の Intent が返る", async () => {
  const assets = mkAssets();
  const llm = createLLM({ endpoint: "https://e.test/x", fetchImpl: async () => { throw new Error("down"); } });
  const it = await parseIntent("30秒のテンポいい旅行Vlog", { assets, llm });
  assert.equal(it.source, "local");
  assert.equal(it.targetDuration, 30);
  assert.ok(it.notes.some((n) => n.indexOf("AI に繋がらない") >= 0));
});
