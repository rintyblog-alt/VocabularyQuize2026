/* ══════════════════════════════════════════════════════════════════════════
   studio/tests/text-layout.test.mjs
   engine/text.js と engine/shapes.js の **純ロジック**の試験。

   ここで試すのは canvas を触らない所だけ:
     layoutText        … 折返し（幅の境界・改行文字・長い英単語・簡易禁則）
     toClusters        … 書記素の切り方（濁点・絵文字・サロゲート）
     TEXT_ANIMS        … 全部が p=0/0.5/1 で有限値を返す・p=1 は素の状態
     TEXT_PRESETS      … 全部が TextStyle の必須キーを持つ・アニメ名が実在する
     FONT_STACKS       … 書体の名簿と別名
     measureText       … canvas が無い Node でも当て推量で答える
     renderText        … canvas が作れない環境では **明確な例外**（握り潰さない）
     shapes.js         … アニメの名簿とプリセットの形

   折返しの試験は **幅を測る関数を偽物にして**行う。これが出来るように
   layoutText は measureFn を引数で受ける純関数になっている。
   ══════════════════════════════════════════════════════════════════════════ */
import test from "node:test";
import assert from "node:assert/strict";

import {
  layoutText, measureText, renderText, toClusters, estimateWidth,
  canBreakBetween, resolveFontStack, fontCssFor, textAnimState,
  composeAnimStates, sanitizeAnimState, resolveUnit, presetStyle, applyPreset,
  TEXT_ANIMS, TEXT_ANIM_IDS, TEXT_PRESETS, TEXT_PRESET_IDS, FONT_STACKS,
  ANIM_UNITS, NO_LINE_START, animIdsFor
} from "../src/engine/text.js";
import {
  SHAPE_ANIMS, SHAPE_PRESETS, SHAPE_PRESET_IDS, SHAPE_TYPES_EXT,
  shapeAnimState, renderShape, presetShape
} from "../src/engine/shapes.js";
import { defaultTextStyle } from "../src/core/schema.js";

/* 偽の幅測定: 1 文字 = 10（決定論。等幅でない場合も作れるように係数表を持つ） */
const FIXED = (w = 10) => (t) => toClusters(t).length * w;
/** 呼ばれた引数を記録する偽物 */
function spyMeasure(w = 10) {
  const calls = [];
  const fn = (t) => { calls.push(t); return toClusters(t).length * w; };
  return { fn, calls };
}

const ST = (over) => Object.assign({ size: 100 }, over || null);
const LA = (over) => Object.assign({ align: "center", vAlign: "middle", maxWidth: 1, lineHeight: 1.25, letterSpacing: 0 }, over || null);
const texts = (r) => r.lines.map((l) => l.text);

/* ── layoutText: 幅の境界 ───────────────────────────────────────── */

test("layoutText: maxWidth の境界（ちょうど入る / 1 文字はみ出す）", () => {
  const m = FIXED(10);
  /* 5 文字 = 50。50 ならちょうど 1 行 */
  assert.deepEqual(texts(layoutText("あいうえお", ST(), LA(), 50, m)), ["あいうえお"]);
  /* 49 だと最後の 1 文字が落ちる */
  assert.deepEqual(texts(layoutText("あいうえお", ST(), LA(), 49, m)), ["あいうえ", "お"]);
  /* 幅 0 / 未指定は「折らない」 */
  assert.deepEqual(texts(layoutText("あいうえお", ST(), LA(), 0, m)), ["あいうえお"]);
  assert.deepEqual(texts(layoutText("あいうえお", ST(), LA(), undefined, m)), ["あいうえお"]);
});

test("layoutText: 行の幅と総高（字間込み）", () => {
  const r = layoutText("あいう", ST({ size: 100 }), LA({ letterSpacing: 0.1, lineHeight: 1.5 }), 0, FIXED(10));
  /* 10*3 + 字間 10*2 = 50 */
  assert.equal(r.lines[0].w, 50);
  assert.equal(r.w, 50);
  assert.equal(r.h, 150);                        // 1 行 × size100 × 1.5
  assert.deepEqual(r.lines[0].advances, [20, 20, 10]);
  assert.equal(r.letterSpacing, 10);
});

test("layoutText: 空文字でも 1 行返す（描く側が分岐しないで済む）", () => {
  const r = layoutText("", ST(), LA(), 100, FIXED(10));
  assert.equal(r.lines.length, 1);
  assert.equal(r.lines[0].text, "");
  assert.equal(r.w, 0);
});

/* ── layoutText: 改行文字 ───────────────────────────────────────── */

test("layoutText: 改行文字（\\n / \\r\\n / \\r）で必ず切れる・空行も残る", () => {
  const r = layoutText("あ\nい\r\nう\n\nえ", ST(), LA(), 1000, FIXED(10));
  assert.deepEqual(texts(r), ["あ", "い", "う", "", "え"]);
  assert.equal(r.lines[0].hard, false);          // 1 行目は改行で始まっていない
  assert.equal(r.lines[1].hard, true);
  assert.equal(r.lines[3].hard, true);           // 空行も改行由来
});

test("layoutText: 改行の後ろでも折返しは働く", () => {
  const r = layoutText("あい\nうえおか", ST(), LA(), 30, FIXED(10));
  assert.deepEqual(texts(r), ["あい", "うえお", "か"]);
});

/* ── layoutText: 長い英単語 ─────────────────────────────────────── */

test("layoutText: 幅より長い英単語は途中で割る（それ以外は割らない）", () => {
  const m = FIXED(10);
  /* 割る所が無いので 3 文字ずつ強制的に割る */
  assert.deepEqual(texts(layoutText("abcdefghij", ST(), LA(), 35, m)), ["abc", "def", "ghi", "j"]);
  /* 空白が在れば単語は割らない */
  assert.deepEqual(texts(layoutText("abc def", ST(), LA(), 40, m)), ["abc", "def"]);
  /* 行末の空白は幅に数えない（"abc " の 4 文字目で折らない） */
  const r = layoutText("abc def", ST(), LA(), 30, m);
  assert.deepEqual(texts(r), ["abc", "def"]);
  assert.equal(r.lines[0].w, 30);
});

test("layoutText: 英単語の中では折らない（日本語との境目では折る）", () => {
  assert.equal(canBreakBetween("a", "b"), false);
  assert.equal(canBreakBetween("あ", "a"), true);
  assert.equal(canBreakBetween("a", "あ"), true);
  assert.equal(canBreakBetween(" ", "a"), true);
  assert.equal(canBreakBetween("a", " "), false);
  assert.equal(canBreakBetween("", "a"), false);
  const r = layoutText("あいうabcdeかき", ST(), LA(), 50, FIXED(10));
  for (const l of r.lines) {
    /* "abcde" が 2 行に割れていない（幅 50 なら入る） */
    if (l.text.indexOf("a") >= 0) assert.ok(l.text.indexOf("abcde") >= 0, l.text);
  }
});

/* ── layoutText: 簡易禁則（行頭に句読点を置かない）───────────────── */

test("layoutText: 行頭に句読点・閉じ括弧を置かない（追い出し）", () => {
  const r = layoutText("こんにちは、世界だ", ST(), LA(), 50, FIXED(10));
  assert.deepEqual(texts(r), ["こんにち", "は、世界だ"]);
  for (const l of r.lines) {
    if (!l.text) continue;
    assert.ok(!NO_LINE_START.has(l.text[0]), "行頭が禁則文字: " + l.text);
  }
});

test("layoutText: 逃げ場が無いときは ぶら下げて でも行頭に句読点を置かない", () => {
  /* 幅 10 = 1 文字分。"あ、" は 20 になるが、"、" を行頭に出さない方を採る */
  const r = layoutText("あ、い。う", ST(), LA(), 10, FIXED(10));
  assert.deepEqual(texts(r), ["あ、", "い。", "う"]);
  for (const l of r.lines) assert.ok(!NO_LINE_START.has(l.text[0]), l.text);
});

test("layoutText: どんな入力でも行頭の禁則だけは破らない（総当たり）", () => {
  const src = "今日は、晴れ（たぶん）。明日は雨かな？ ABC def…「引用」もある！";
  for (let w = 10; w <= 200; w += 10) {
    const r = layoutText(src, ST(), LA(), w, FIXED(10));
    for (const l of r.lines) {
      if (!l.text) continue;
      assert.ok(!NO_LINE_START.has(l.text[0]), `幅 ${w} で行頭が禁則: ${l.text}`);
    }
    /* 文字が増えたり減ったりしていない（空白の削除ぶんを除く） */
    const joined = r.lines.map((l) => l.text).join("");
    assert.equal(joined.replace(/\s/g, ""), src.replace(/\s/g, ""), "幅 " + w);
  }
});

test("layoutText: 行末に開き括弧を残さない", () => {
  const r = layoutText("あいう（かきくけこ）", ST(), LA(), 40, FIXED(10));
  for (const l of r.lines) {
    if (!l.text) continue;
    assert.notEqual(l.text[l.text.length - 1], "（", "行末が開き括弧: " + l.text);
  }
});

/* ── layoutText: 決定論と純粋さ ─────────────────────────────────── */

test("layoutText: 偽の測定関数で決定論（同じ入力 → 同じ結果）", () => {
  const a = layoutText("日本語と English が混ざった文章です", ST(), LA(), 120, FIXED(10));
  const b = layoutText("日本語と English が混ざった文章です", ST(), LA(), 120, FIXED(10));
  assert.deepEqual(texts(a), texts(b));
  assert.deepEqual(a.lines.map((l) => l.w), b.lines.map((l) => l.w));
});

test("layoutText: 測定関数へ渡すのは 1 書記素ずつ（等幅を前提にしない）", () => {
  const sp = spyMeasure(10);
  layoutText("あiう", ST(), LA(), 25, sp.fn);
  assert.ok(sp.calls.length >= 3);
  for (const c of sp.calls) assert.equal(toClusters(c).length, 1, "まとめて測っている: " + JSON.stringify(c));
});

test("layoutText: 測定関数が壊れた値を返しても落ちない（当て推量へ）", () => {
  const r = layoutText("あいう", ST(), LA(), 100, () => NaN);
  for (const l of r.lines) assert.ok(Number.isFinite(l.w));
  const r2 = layoutText("あいう", ST(), LA(), 100, null);      // 測定関数なし
  assert.ok(r2.lines[0].w > 0);
  const r3 = layoutText("あいう", ST(), LA(), 100, { measure: FIXED(5) });
  assert.equal(r3.lines[0].w, 15);
});

test("layoutText: 引数を書き換えない（純関数）", () => {
  const style = ST({ size: 64 }), lay = LA({ letterSpacing: 0.05 });
  const s0 = JSON.stringify(style), l0 = JSON.stringify(lay);
  layoutText("あいうえお\nかきくけこ", style, lay, 120, FIXED(10));
  assert.equal(JSON.stringify(style), s0);
  assert.equal(JSON.stringify(lay), l0);
});

test("layoutText: 縦書き（v1 は縦積み）は 1 文字ずつ改行する", () => {
  const r = layoutText("あいう", ST({ vertical: true }), LA(), 1000, FIXED(10));
  assert.deepEqual(texts(r), ["あ", "い", "う"]);
  assert.equal(r.vertical, true);
});

/* ── toClusters / estimateWidth ─────────────────────────────────── */

test("toClusters: 濁点・異体字・サロゲート・絵文字の連結を 1 文字と数える", () => {
  assert.equal(toClusters("あいう").length, 3);
  assert.equal(toClusters("が").length, 1);              // か + 濁点
  assert.equal(toClusters("𠮷").length, 1);          // サロゲートペア（𠮷）
  assert.equal(toClusters("👨‍👩‍👧").length, 1);     // ZWJ で繋がる家族
  assert.equal(toClusters("1️⃣").length, 1);         // キーキャップ
  assert.deepEqual(toClusters(null), []);
  assert.deepEqual(toClusters(12), ["1", "2"]);
});

test("estimateWidth: 全角は size ぶん・英小文字はそれより狭い", () => {
  assert.equal(estimateWidth("あ", 100), 100);
  assert.ok(estimateWidth("a", 100) < 100);
  assert.ok(estimateWidth("i", 100) < estimateWidth("m", 100));
  assert.equal(estimateWidth("", 100), 0);
  assert.ok(Number.isFinite(estimateWidth("あa1!", NaN)));
});

/* ── TEXT_ANIMS ─────────────────────────────────────────────────── */

const MOTION = ["opacity", "dx", "dy", "scale", "scaleX", "scaleY", "rotate", "blur", "clip"];
const STATE_NUM = MOTION.concat(["glowMul", "rgbSplit", "hl", "hue"]);

test("TEXT_ANIMS: 名前・単位・種類が揃っている", () => {
  assert.ok(TEXT_ANIM_IDS.length >= 18, "アニメが少ない: " + TEXT_ANIM_IDS.length);
  for (const id of TEXT_ANIM_IDS) {
    const a = TEXT_ANIMS[id];
    assert.equal(typeof a.name, "string", id);
    assert.ok(a.name.length > 0, id + " に日本語の名前が無い");
    assert.equal(a.label, a.name, id);
    assert.ok(Array.isArray(a.unitSupport) && a.unitSupport.length > 0, id);
    for (const u of a.unitSupport) assert.ok(ANIM_UNITS.indexOf(u) >= 0, id + " の単位: " + u);
    assert.ok(Array.isArray(a.kinds) && a.kinds.length > 0, id);
    for (const k of a.kinds) assert.ok(["in", "out", "loop"].indexOf(k) >= 0, id + " の種類: " + k);
    assert.equal(typeof a.fn, "function", id);
    assert.ok(Number.isFinite(a.stagger) && a.stagger >= 0 && a.stagger <= 1, id);
  }
});

test("TEXT_ANIMS: 全部が p=0/0.5/1 で有限値を返す（i,n を総当たり）", () => {
  const combos = [[0, 1], [0, 5], [2, 5], [4, 5], [1, 2], [9, 10]];
  for (const id of TEXT_ANIM_IDS) {
    const a = TEXT_ANIMS[id];
    for (const p of [0, 0.25, 0.5, 0.75, 1]) {
      for (const [i, n] of combos) {
        const s = a.fn(p, i, n);
        for (const k of STATE_NUM) {
          assert.ok(Number.isFinite(s[k]), `${id} p=${p} i=${i} n=${n} の ${k} が有限でない: ${s[k]}`);
        }
        assert.ok(s.opacity >= 0 && s.opacity <= 1, id + " の opacity が範囲外");
        assert.ok(s.clip >= 0 && s.clip <= 1, id + " の clip が範囲外");
        assert.ok(s.hl >= 0 && s.hl <= 1, id + " の hl が範囲外");
        assert.ok(["l", "r", "t", "b"].indexOf(s.clipDir) >= 0, id + " の clipDir");
        assert.ok(s.scale >= 0, id + " の scale が負");
      }
    }
  }
});

test("TEXT_ANIMS: 壊れた引数（NaN / undefined / 範囲外）でも有限値", () => {
  for (const id of TEXT_ANIM_IDS) {
    const a = TEXT_ANIMS[id];
    for (const args of [[NaN, NaN, NaN], [undefined, undefined, undefined],
      [-5, -3, 0], [99, 100, 1], ["x", "y", "z"], [Infinity, 1, 2]]) {
      const s = a.fn(args[0], args[1], args[2]);
      for (const k of STATE_NUM) assert.ok(Number.isFinite(s[k]), id + " の " + k);
    }
  }
});

test("TEXT_ANIMS: 入り/出しは p=1 で素の状態に戻る（重ねても崩れない）", () => {
  for (const id of TEXT_ANIM_IDS) {
    const a = TEXT_ANIMS[id];
    if (a.kinds.indexOf("in") < 0 && a.kinds.indexOf("out") < 0) continue;
    for (const [i, n] of [[0, 1], [3, 7]]) {
      const s = a.fn(1, i, n);
      assert.equal(s.opacity, 1, id + " の p=1 opacity");
      assert.equal(s.dx, 0, id + " の p=1 dx");
      assert.equal(s.dy, 0, id + " の p=1 dy");
      assert.equal(s.scale, 1, id + " の p=1 scale");
      assert.equal(s.scaleX, 1, id + " の p=1 scaleX");
      assert.equal(s.scaleY, 1, id + " の p=1 scaleY");
      assert.equal(s.rotate, 0, id + " の p=1 rotate");
      assert.equal(s.blur, 0, id + " の p=1 blur");
      assert.equal(s.clip, 1, id + " の p=1 clip");
    }
  }
});

/* karaoke は「塗り分け」なので p=0 が素の状態そのもの（まだ塗っていない）。
   動きで見せるアニメではないため この試験からは外す。 */
const NO_MOVE_AT_ZERO = new Set(["none", "karaoke"]);

test("TEXT_ANIMS: 入りは p=0 で「まだ見えない/動いている」（none 以外）", () => {
  let moved = 0;
  for (const id of TEXT_ANIM_IDS) {
    const a = TEXT_ANIMS[id];
    if (NO_MOVE_AT_ZERO.has(id) || a.kinds.indexOf("in") < 0) continue;
    const s = a.fn(0, 0, 1);
    const diff = MOTION.some((k) => s[k] !== TEXT_ANIMS.none.fn(0, 0, 1)[k]) || s.hl > 0 || s.rgbSplit > 0;
    assert.ok(diff, id + " は p=0 でも素の状態のまま（アニメになっていない）");
    moved++;
  }
  assert.ok(moved >= 15, "入りのアニメが少ない: " + moved);
});

test("animIdsFor: 種類ごとに引ける（in / out / loop すべて在る）", () => {
  for (const k of ["in", "out", "loop"]) {
    const ids = animIdsFor(k);
    assert.ok(ids.length >= 5, k + " のアニメが少ない: " + ids.length);
    assert.ok(ids.indexOf("none") >= 0, k + " に none が無い");
  }
  assert.ok(animIdsFor("in").indexOf("typewriter") >= 0);
  assert.ok(animIdsFor("loop").indexOf("pulse") >= 0);
  assert.equal(animIdsFor("loop").indexOf("fadeUp"), -1);
});

test("resolveUnit: 使えない単位は そのアニメが出来る単位へ寄せる", () => {
  assert.equal(resolveUnit(TEXT_ANIMS.typewriter, "all"), "char");
  assert.equal(resolveUnit(TEXT_ANIMS.typewriter, "word"), "word");
  assert.equal(resolveUnit(TEXT_ANIMS.fade, "all"), "all");
  assert.equal(resolveUnit(null, "line"), "line");
});

test("composeAnimStates / sanitizeAnimState: 重ね算と壊れた値の始末", () => {
  const s = composeAnimStates([
    { opacity: 0.5, dx: 1, scale: 2, rotate: 10, clip: 0.3, clipDir: "r" },
    { opacity: 0.5, dx: -0.25, scale: 0.5, rotate: -4, hl: 0.2 },
    null, "壊れた値"
  ]);
  assert.equal(s.opacity, 0.25);
  assert.equal(s.dx, 0.75);
  assert.equal(s.scale, 1);
  assert.equal(s.rotate, 6);
  assert.equal(s.clip, 0.3);
  assert.equal(s.clipDir, "r");
  assert.equal(s.hl, 0.2);
  const bad = sanitizeAnimState({ opacity: NaN, dx: Infinity, scale: "x", clipDir: "z" });
  assert.equal(bad.opacity, 1);
  assert.equal(bad.dx, 0);
  assert.equal(bad.scale, 1);
  assert.equal(bad.clipDir, "l");
});

test("textAnimState: 入りの前後で 素の状態へ収束する", () => {
  const anim = { in: { type: "fadeUp", duration: 0.4 }, out: { type: "fade", duration: 0.3 }, loop: { type: "none", speed: 1 }, unit: "all" };
  const s0 = textAnimState(anim, { time: 0, duration: 2 });
  assert.ok(s0.opacity < 0.05, "入り始めは ほぼ透明");
  assert.ok(s0.dy > 0.2, "入り始めは 下に居る");
  const s1 = textAnimState(anim, { time: 1, duration: 2 });
  assert.equal(s1.opacity, 1);
  assert.equal(s1.dy, 0);
  const s2 = textAnimState(anim, { time: 2, duration: 2 });
  assert.ok(s2.opacity < 0.05, "出し終わりは ほぼ透明");
  /* 尺が入り+出しより短いときは 両方を縮める（どちらも出る） */
  const tight = textAnimState(anim, { time: 0.2, duration: 0.4 });
  assert.ok(Number.isFinite(tight.opacity) && tight.opacity > 0);
});

test("textAnimState: 文字単位はずらして始まる（後ろの文字ほど遅い）", () => {
  const anim = { in: { type: "typewriter", duration: 1 }, out: { type: "none", duration: 0 }, loop: { type: "none", speed: 1 }, unit: "char" };
  const first = textAnimState(anim, { time: 0.05, duration: 3, index: 0, count: 10 });
  const last = textAnimState(anim, { time: 0.05, duration: 3, index: 9, count: 10 });
  assert.equal(first.opacity, 1);
  assert.equal(last.opacity, 0);
  const lastLater = textAnimState(anim, { time: 0.99, duration: 3, index: 9, count: 10 });
  assert.equal(lastLater.opacity, 1);
});

/* ── TEXT_PRESETS ───────────────────────────────────────────────── */

const STYLE_KEYS = Object.keys(defaultTextStyle());

test("TEXT_PRESETS: 20 種以上・全部が TextStyle の必須キーを持つ", () => {
  assert.ok(TEXT_PRESET_IDS.length >= 20, "プリセットが少ない: " + TEXT_PRESET_IDS.length);
  for (const id of TEXT_PRESET_IDS) {
    const p = TEXT_PRESETS[id];
    assert.equal(p.id, id);
    assert.ok(typeof p.label === "string" && p.label.length > 0, id + " に日本語の名前が無い");
    for (const k of STYLE_KEYS) {
      assert.ok(Object.prototype.hasOwnProperty.call(p.style, k), `${id}.style に ${k} が無い`);
    }
    const s = p.style;
    assert.equal(typeof s.font, "string", id);
    assert.ok(resolveFontStack(s.font).length > 0, id);
    assert.ok(Number.isFinite(s.size) && s.size >= 1 && s.size <= 4000, id + " の size");
    assert.ok(Number.isFinite(s.weight) && s.weight >= 100 && s.weight <= 1000, id + " の weight");
    assert.equal(typeof s.italic, "boolean", id);
    assert.match(s.color, /^#[0-9a-fA-F]{3,8}$/, id + " の color");
    assert.ok(Number.isFinite(s.stroke.width) && s.stroke.width >= 0, id + " の stroke.width");
    assert.match(s.stroke.color, /^#[0-9a-fA-F]{3,8}$/, id + " の stroke.color");
    for (const k of ["x", "y", "blur"]) assert.ok(Number.isFinite(s.shadow[k]), `${id} の shadow.${k}`);
    assert.match(s.shadow.color, /^#[0-9a-fA-F]{3,8}$/, id + " の shadow.color");
    assert.ok(Number.isFinite(s.glow.blur) && s.glow.blur >= 0, id + " の glow.blur");
    assert.match(s.glow.color, /^#[0-9a-fA-F]{3,8}$/, id + " の glow.color");
    if (s.gradient) {
      assert.match(s.gradient.from, /^#[0-9a-fA-F]{3,8}$/, id);
      assert.match(s.gradient.to, /^#[0-9a-fA-F]{3,8}$/, id);
      assert.ok(Number.isFinite(s.gradient.angle), id);
    }
    if (s.bg) {
      assert.match(s.bg.color, /^#[0-9a-fA-F]{3,8}$/, id);
      assert.ok(Number.isFinite(s.bg.pad) && s.bg.pad >= 0, id);
      assert.ok(Number.isFinite(s.bg.radius) && s.bg.radius >= 0, id);
    }
  }
});

test("TEXT_PRESETS: layout と 推奨アニメが契約どおり", () => {
  for (const id of TEXT_PRESET_IDS) {
    const p = TEXT_PRESETS[id];
    assert.ok(["left", "center", "right"].indexOf(p.layout.align) >= 0, id + " の align");
    assert.ok(["top", "middle", "bottom"].indexOf(p.layout.vAlign) >= 0, id + " の vAlign");
    assert.ok(p.layout.maxWidth > 0 && p.layout.maxWidth <= 1, id + " の maxWidth");
    assert.ok(p.layout.lineHeight >= 0.5 && p.layout.lineHeight <= 4, id + " の lineHeight");
    assert.ok(Number.isFinite(p.layout.letterSpacing), id + " の letterSpacing");
    for (const slot of ["in", "out", "loop"]) {
      const t = p.anim[slot].type;
      assert.ok(TEXT_ANIMS[t], `${id} の anim.${slot}.type が名簿に無い: ${t}`);
      assert.ok(TEXT_ANIMS[t].kinds.indexOf(slot) >= 0, `${id} の ${t} は ${slot} に使えない`);
    }
    assert.ok(Number.isFinite(p.anim.in.duration) && p.anim.in.duration >= 0, id);
    assert.ok(Number.isFinite(p.anim.out.duration) && p.anim.out.duration >= 0, id);
    assert.ok(p.anim.loop.speed > 0, id);
    assert.ok(ANIM_UNITS.indexOf(p.anim.unit) >= 0, id + " の unit");
  }
});

test("TEXT_PRESETS: 凍っていて・写しは書き換えられる", () => {
  assert.ok(Object.isFrozen(TEXT_PRESETS));
  assert.ok(Object.isFrozen(TEXT_PRESETS.headline.style));
  assert.ok(Object.isFrozen(TEXT_PRESETS.headline.style.stroke));
  const copy = presetStyle("headline");
  copy.size = 12; copy.stroke.width = 99;
  assert.equal(TEXT_PRESETS.headline.style.size, 96);
  assert.equal(TEXT_PRESETS.headline.style.stroke.width, 0);
  const missing = presetStyle("そんなプリセットは無い");
  for (const k of STYLE_KEYS) assert.ok(Object.prototype.hasOwnProperty.call(missing, k), k);
});

test("applyPreset: 本文は残して様式だけ差し替える", () => {
  const spec = { content: "こんにちは", style: { size: 12 }, layout: { align: "left" }, anim: { unit: "char" } };
  const out = applyPreset(spec, "subtitle");
  assert.equal(out.content, "こんにちは");
  assert.equal(out.style.size, TEXT_PRESETS.subtitle.style.size);
  assert.equal(out.layout.vAlign, "bottom");
  assert.equal(spec.style.size, 12, "元の spec を書き換えていない");
  const same = applyPreset(spec, "無い");
  assert.equal(same.content, "こんにちは");
  assert.equal(same.style.size, 12);
});

/* ── FONT_STACKS ────────────────────────────────────────────────── */

test("FONT_STACKS: 8 種類・日本語の保険が入っている・別名も引ける", () => {
  const ids = Object.keys(FONT_STACKS);
  assert.ok(ids.length >= 8, "書体が少ない: " + ids.length);
  for (const id of ids) {
    const f = FONT_STACKS[id];
    assert.ok(typeof f.label === "string" && f.label.length > 0, id);
    assert.ok(typeof f.stack === "string" && f.stack.indexOf(",") > 0, id + " は stack が 1 つしか無い");
    assert.equal(resolveFontStack(id), f.stack, id);
    assert.match(f.stack, /(sans-serif|serif|monospace|cursive)\s*$/, id + " に総称ファミリーが無い");
  }
  /* 他の担当の控え名簿で使われている id も引ける（差し替えで壊れないように） */
  assert.equal(resolveFontStack("sans"), FONT_STACKS.gothic.stack);
  assert.equal(resolveFontStack("serif"), FONT_STACKS.mincho.stack);
  assert.equal(resolveFontStack(""), FONT_STACKS.system.stack);
  assert.equal(resolveFontStack(undefined), FONT_STACKS.system.stack);
  /* 知らない名前は そのまま活かしつつ日本語の保険を足す */
  const custom = resolveFontStack("Futura");
  assert.ok(custom.indexOf("Futura") === 0, custom);
  assert.ok(custom.indexOf("Hiragino Sans") > 0, custom);
});

test("fontCssFor: canvas の font 文字列になる（太さ・斜体・px）", () => {
  const css = fontCssFor({ font: "gothic", size: 64, weight: 900, italic: true }, 48);
  assert.match(css, /^italic 900 48\.00px /);
  assert.ok(css.indexOf(FONT_STACKS.gothic.stack) > 0);
  const d = fontCssFor(null, NaN);
  assert.match(d, /^700 64\.00px /);
  assert.match(fontCssFor({ weight: 9999 }, 10), /^1000 /);
});

/* ── measureText / renderText（canvas が無い Node での振る舞い）──── */

test("measureText: canvas が無くても当て推量で答える（例外にしない）", () => {
  const m = measureText({ content: "こんにちは Studio", style: { size: 64 }, layout: { maxWidth: 0.8 } },
    { width: 1920, height: 1080 });
  assert.ok(m.lines.length >= 1);
  assert.ok(m.w > 0 && Number.isFinite(m.w));
  assert.ok(m.h > 0 && Number.isFinite(m.h));
  assert.match(m.fontCss, /px /);
  assert.ok(Math.abs(m.fontPx - 64) < 1e-6, "短辺 1080 なら size のまま: " + m.fontPx);
  /* 4K（短辺 2160）では 2 倍 */
  const m4 = measureText({ content: "あ", style: { size: 64 } }, { width: 3840, height: 2160 });
  assert.ok(Math.abs(m4.fontPx - 128) < 1e-6, m4.fontPx);
  /* 折返しは maxWidth に従う */
  const wrapped = measureText({ content: "あいうえおかきくけこさしすせそ".repeat(4), style: { size: 64 }, layout: { maxWidth: 0.5 } },
    { width: 1920, height: 1080 });
  assert.ok(wrapped.lines.length >= 3, wrapped.lines.length);
  for (const l of wrapped.lines) assert.ok(l.w <= 1920 * 0.5 + 1e-6, l.w);
});

test("renderText: canvas を作れない環境では 分かる例外を投げる（黙らない）", () => {
  assert.throws(() => renderText({ content: "あ" }, { width: 640, height: 360 }), /canvas/);
});

/* ── shapes.js ──────────────────────────────────────────────────── */

test("SHAPE_ANIMS: 全部が p=0/0.5/1 で有限値を返す", () => {
  for (const id of Object.keys(SHAPE_ANIMS)) {
    const a = SHAPE_ANIMS[id];
    assert.ok(typeof a.name === "string" && a.name.length > 0, id);
    for (const p of [0, 0.5, 1, NaN, undefined, -2, 9]) {
      const s = a.fn(p, 0, 1);
      for (const k of ["opacity", "dx", "dy", "scale", "scaleX", "scaleY", "rotate", "clip", "dash"]) {
        assert.ok(Number.isFinite(s[k]), `${id} p=${p} の ${k}`);
      }
      assert.ok(s.opacity >= 0 && s.opacity <= 1, id);
      assert.ok(s.scale >= 0, id);
    }
    if (a.kinds.indexOf("in") >= 0) {
      const s = a.fn(1, 0, 1);
      assert.equal(s.opacity, 1, id + " の p=1 opacity");
      assert.equal(s.scale, 1, id + " の p=1 scale");
      assert.equal(s.scaleX, 1, id + " の p=1 scaleX");
      assert.equal(s.clip, 1, id + " の p=1 clip");
      assert.equal(s.dash, 1, id + " の p=1 dash");
    }
  }
});

test("shapeAnimState: 入り→素→出し と動く・壊れた入力でも有限", () => {
  const anim = { in: { type: "popIn", duration: 0.4 }, out: { type: "fade", duration: 0.3 }, loop: { type: "none", speed: 1 } };
  const a = shapeAnimState(anim, 0, 2);
  assert.ok(a.scale < 0.5);
  const b = shapeAnimState(anim, 1, 2);
  assert.equal(b.scale, 1);
  assert.equal(b.opacity, 1);
  const c = shapeAnimState(anim, 2, 2);
  assert.ok(c.opacity < 0.05);
  const bad = shapeAnimState(null, NaN, NaN);
  for (const k of ["opacity", "scale", "rotate", "clip", "dash"]) assert.ok(Number.isFinite(bad[k]), k);
  assert.equal(bad.opacity, 1);
});

test("SHAPE_PRESETS: 8 種の基本（矩形/円/三角/矢印/線/星/吹き出し/バー）が在る", () => {
  for (const need of ["rect", "circle", "triangle", "arrow", "line", "star", "bubble", "bar"]) {
    assert.ok(SHAPE_PRESETS[need], "プリセットが無い: " + need);
  }
  assert.ok(SHAPE_PRESET_IDS.length >= 8);
  for (const id of SHAPE_PRESET_IDS) {
    const p = SHAPE_PRESETS[id];
    assert.ok(typeof p.label === "string" && p.label.length > 0, id);
    const s = p.shape;
    assert.ok(SHAPE_TYPES_EXT.indexOf(s.type) >= 0, id + " の type: " + s.type);
    assert.ok(Number.isFinite(s.w) && s.w > 0 && s.w <= 4, id + " の w");
    assert.ok(Number.isFinite(s.h) && s.h > 0 && s.h <= 4, id + " の h");
    assert.match(s.fill, /^#[0-9a-fA-F]{3,8}$/, id + " の fill");
    assert.ok(Number.isFinite(s.stroke.width) && s.stroke.width >= 0, id + " の stroke.width");
    assert.match(s.stroke.color, /^#[0-9a-fA-F]{3,8}$/, id + " の stroke.color");
    assert.ok(Number.isFinite(s.radius) && s.radius >= 0, id + " の radius");
    for (const slot of ["in", "out", "loop"]) {
      const t = p.anim[slot].type;
      assert.ok(SHAPE_ANIMS[t], `${id} の anim.${slot}.type が名簿に無い: ${t}`);
      assert.ok(SHAPE_ANIMS[t].kinds.indexOf(slot) >= 0, `${id} の ${t} は ${slot} に使えない`);
    }
    assert.ok(Object.isFrozen(p.shape), id + " が凍っていない");
  }
  const copy = presetShape("bar");
  copy.w = 9; copy.stroke.width = 9;
  assert.equal(SHAPE_PRESETS.bar.shape.w, 0.5);
  assert.equal(SHAPE_PRESETS.bar.shape.stroke.width, 0);
});

test("renderShape: canvas を作れない環境では 分かる例外を投げる", () => {
  assert.throws(() => renderShape({ type: "rect" }, { width: 640, height: 360 }), /canvas/);
});
