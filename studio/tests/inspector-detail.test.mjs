/* ══════════════════════════════════════════════════════════════════════════
   studio/tests/inspector-detail.test.mjs
   「文字 / 効果 / キーフレーム」の詳細設定（ui/inspector/text.js・fx.js・
   keyframes.js）のうち **DOM に触らない純関数**の試験。

   なぜここだけか: パネル本体は document を触るので Node では動かせない。
   代わりに「隣の担当（engine/text.js・engine/fx/registry.js）から
   どんな形で名簿が来ても壊れない」ことと、道具（フェード・ズーム・揺れ）が
   出すキーの形（契約書 §2: t 昇順・値は数か #hex）を、ここで固める。
   ══════════════════════════════════════════════════════════════════════════ */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  normalizeFonts, normalizePresets, normalizeAnims, sampleCss, cssColor,
  FALLBACK_FONTS, TEXT_CELLS
} from "../src/ui/inspector/text.js";
import {
  normalizeRegistry, normalizeFxPresets, paramSpecs, defaultParams,
  FALLBACK_FX, MASK_ITEMS, POLY_DEFAULT
} from "../src/ui/inspector/fx.js";
import {
  pathLabel, isColorPath, fadeKeys, zoomKeys, shakeKeys,
  bezToPoints, pointsToBez, EASE_ITEMS
} from "../src/ui/inspector/keyframes.js";

/* ── 文字: 名簿の受け皿 ─────────────────────────────────────────── */

test("normalizeFonts: 何も来なくても控えが出る", () => {
  const list = normalizeFonts(null);
  assert.ok(list.length >= FALLBACK_FONTS.length);
  for (const f of list) {
    assert.equal(typeof f.id, "string");
    assert.ok(f.id.length > 0);
    assert.ok(f.label.length > 0);
    assert.equal(typeof f.stack, "string");
  }
});

test("normalizeFonts: 表でも配列でも読む", () => {
  const fromMap = normalizeFonts({ system: "a, b", mincho: "c" });
  assert.deepEqual(fromMap.map((f) => f.id), ["system", "mincho"]);
  assert.equal(fromMap[0].stack, "a, b");

  const fromArr = normalizeFonts([{ id: "x", label: "エックス", family: "F1" }, { value: "y" }]);
  assert.equal(fromArr[0].stack, "F1");
  assert.equal(fromArr[0].label, "エックス");
  assert.equal(fromArr[1].id, "y");
});

test("normalizePresets: style の無い項目は捨てる・空なら控え", () => {
  const ok = normalizePresets([{ id: "p1", label: "一番", style: { size: 10 } }, { id: "p2" }]);
  assert.equal(ok.length, 1);
  assert.equal(ok[0].id, "p1");
  assert.equal(ok[0].style.size, 10);
  assert.ok(normalizePresets([{ id: "z" }]).length > 1);   // 全部落ちたら控えへ
});

test("normalizeAnims: 3 つの口が必ず埋まり、なしが先頭に居る", () => {
  const a = normalizeAnims({ in: [{ id: "fade", label: "ふわ" }] });
  assert.equal(a.in[0].id, "none");
  assert.ok(a.in.some((x) => x.id === "fade"));
  assert.ok(a.out.length > 0);
  assert.ok(a.loop.length > 0);

  const b = normalizeAnims([{ id: "wave", kind: "loop" }, { id: "up", kind: "in" }]);
  assert.ok(b.loop.some((x) => x.id === "wave"));
  assert.ok(b.in.some((x) => x.id === "up"));
  assert.equal(b.loop[0].id, "none");
});

test("sampleCss: グラデーションと帯と縁取りが CSS になる", () => {
  const plain = sampleCss({ size: 64, weight: 700, color: "#ffffff", stroke: { width: 8, color: "#000000" } }, 32);
  assert.equal(plain.color, "#ffffff");
  /* 見本は縮尺つき: 8px の縁取りは 32/64 で 4px になる */
  assert.equal(plain.webkitTextStrokeWidth, "4.00px");

  const grad = sampleCss({ size: 64, gradient: { from: "#fff", to: "#000", angle: 45 } }, 20);
  assert.equal(grad.color, "transparent");
  assert.ok(grad.backgroundImage.includes("45deg"));

  const band = sampleCss({ size: 64, bg: { color: "#000000cc", pad: 16, radius: 12 } }, 32);
  assert.equal(band.background, "#000000cc");
  assert.ok(band.padding.length > 0);
});

test("cssColor: 読めない色は既定へ落ちる（例外を投げない）", () => {
  assert.equal(cssColor("#abc", "#000000"), "#abc");
  assert.equal(cssColor("red", "#123456"), "#123456");
  assert.equal(cssColor(null, "#123456"), "#123456");
});

test("TEXT_CELLS: 9 マスで中央が 0,0", () => {
  assert.equal(TEXT_CELLS.length, 9);
  const mid = TEXT_CELLS[4];
  assert.equal(mid.x, 0);
  assert.equal(mid.y, 0);
  assert.equal(mid.align, "center");
});

/* ── 効果: 名簿の受け皿 ─────────────────────────────────────────── */

test("normalizeRegistry: 何も来なくても控えが出る（type を鍵にした表）", () => {
  const reg = normalizeRegistry(null);
  assert.ok(Object.keys(reg).length >= Object.keys(FALLBACK_FX).length);
  assert.equal(reg.blur.type, "blur");
  assert.ok(Array.isArray(reg.blur.params));
});

test("normalizeRegistry: 表でも配列でも読み、分類が無ければ other", () => {
  const fromMap = normalizeRegistry({ myFx: { label: "俺の効果", params: { amount: 0.5 } } });
  assert.equal(fromMap.myFx.category, "other");
  assert.equal(fromMap.myFx.label, "俺の効果");
  assert.equal(fromMap.myFx.params[0].key, "amount");
  assert.equal(fromMap.myFx.params[0].def, 0.5);
  assert.equal(fromMap.myFx.params[0].type, "slider");

  const fromArr = normalizeRegistry([{ type: "a", category: "blur", params: [{ key: "k", type: "select", options: ["x", "y"] }] }]);
  assert.equal(fromArr.a.category, "blur");
  assert.equal(fromArr.a.params[0].type, "select");
  assert.deepEqual(fromArr.a.params[0].options.map((o) => o.value), ["x", "y"]);
});

test("paramSpecs: 数・真偽・色・選択を型で見分ける", () => {
  const specs = paramSpecs({ params: { n: 0.25, b: true, c: "#ff0000", s: { options: [{ value: "a", label: "あ" }] } } });
  const by = {};
  for (const s of specs) by[s.key] = s;
  assert.equal(by.n.type, "slider");
  assert.equal(by.b.type, "toggle");
  assert.equal(by.c.type, "color");
  assert.equal(by.s.type, "select");
});

test("defaultParams: spec の既定値を集める", () => {
  const reg = normalizeRegistry(null);
  const p = defaultParams(reg.glow);
  assert.equal(typeof p.amount, "number");
  assert.equal(typeof p.threshold, "number");
});

test("normalizeFxPresets: 文字列だけの鎖も読む", () => {
  const list = normalizeFxPresets([{ id: "p", label: "組", fx: ["blur", { type: "glow", params: { amount: 1 } }] }]);
  assert.equal(list.length, 1);
  assert.deepEqual(list[0].fx[0], { type: "blur", params: {} });
  assert.equal(list[0].fx[1].params.amount, 1);
  assert.ok(normalizeFxPresets(null).length > 0);
});

test("MASK_ITEMS: 先頭が「なし」で、契約の 5 形が揃う", () => {
  assert.equal(MASK_ITEMS[0].value, "");
  const vals = MASK_ITEMS.map((m) => m.value);
  for (const t of ["rect", "ellipse", "polygon", "linear", "radial"]) assert.ok(vals.includes(t));
  assert.ok(POLY_DEFAULT.length >= 3);
});

/* ── キーフレーム: 名前と道具 ──────────────────────────────────── */

test("pathLabel: 契約の path を日本語にする", () => {
  assert.equal(pathLabel("opacity"), "不透明度");
  assert.ok(pathLabel("color.exposure").includes("露出"));
  assert.ok(pathLabel("color.wheels.lift.0").includes("lift"));
  assert.ok(pathLabel("color.wheels.lift.0").includes("R"));
  assert.ok(pathLabel("fx.fx_1.amount", { fx: [{ id: "fx_1", type: "blur" }] }).includes("blur"));
  assert.equal(pathLabel("なにか"), "なにか");
});

test("isColorPath: 色は末尾が .color の物だけ", () => {
  assert.equal(isColorPath("text.style.color"), true);
  assert.equal(isColorPath("color.exposure"), false);
  assert.equal(isColorPath("opacity"), false);
});

test("fadeKeys: t 昇順・0 → 1 → 1 → 0", () => {
  const keys = fadeKeys(4, { inDur: 0.5, outDur: 0.5 });
  assert.equal(keys.length, 4);
  for (let i = 1; i < keys.length; i++) assert.ok(keys[i].t > keys[i - 1].t, "t は昇順");
  assert.equal(keys[0].v, 0);
  assert.equal(keys[1].v, 1);
  assert.equal(keys[keys.length - 1].v, 0);
  assert.equal(keys[keys.length - 1].t, 4);
});

test("fadeKeys: 短いクリップでも尺の中に収まる", () => {
  const len = 0.3;
  const keys = fadeKeys(len, { inDur: 5, outDur: 5 });
  for (const k of keys) {
    assert.ok(k.t >= 0 && k.t <= len + 1e-9, "尺の外へ出ない: " + k.t);
    assert.ok(k.v >= 0 && k.v <= 1);
  }
  for (let i = 1; i < keys.length; i++) assert.ok(keys[i].t > keys[i - 1].t);
});

test("zoomKeys: 両端に 1 個ずつ", () => {
  const keys = zoomKeys(3, { from: 1, to: 1.2 });
  assert.equal(keys.length, 2);
  assert.equal(keys[0].t, 0);
  assert.equal(keys[1].t, 3);
  assert.equal(keys[1].v, 1.2);
});

test("shakeKeys: 端は 0 に戻り、t は昇順", () => {
  const s = shakeKeys(2, { amount: 0.02, count: 4 });
  assert.equal(s.x.length, 5);
  assert.equal(s.y.length, 5);
  assert.equal(s.x[0].v, 0);
  assert.equal(s.x[s.x.length - 1].v, 0);
  for (let i = 1; i < s.x.length; i++) assert.ok(s.x[i].t > s.x[i - 1].t);
  for (const k of s.x) assert.ok(Math.abs(k.v) <= 0.02 + 1e-9);
});

test("bez ↔ points: 往復して値が変わらない", () => {
  const bez = [0.3, 0.05, 0.7, 0.95];
  const pts = bezToPoints(bez);
  assert.equal(pts.length, 2);
  assert.deepEqual(pointsToBez(pts), bez);
  /* 壊れた入力でも既定へ落ちる */
  assert.deepEqual(pointsToBez(null), [0.25, 0.1, 0.25, 1]);
  assert.equal(bezToPoints(null).length, 2);
});

test("EASE_ITEMS: 契約書 §2 の 6 種が揃う", () => {
  const vals = EASE_ITEMS.map((e) => e.value);
  for (const e of ["linear", "in", "out", "inout", "hold", "bezier"]) assert.ok(vals.includes(e), e);
});

/* ── fmtNum: 整数の末尾の 0 を消してはいけない（実機で 1920 が "192" になった） ── */
test("fmtNum: 整数の末尾の 0 を保つ", async () => {
  const { fmtNum } = await import("../src/ui/inspector/index.js");
  assert.equal(fmtNum(1920, 0), "1920");
  assert.equal(fmtNum(1080, 0), "1080");
  assert.equal(fmtNum(30, 0), "30");
  assert.equal(fmtNum(100, 0), "100");
  assert.equal(fmtNum(0, 0), "0");
  /* 小数の尻尾は落とす */
  assert.equal(fmtNum(1.50, 2), "1.5");
  assert.equal(fmtNum(2.00, 2), "2");
  assert.equal(fmtNum(0.25, 2), "0.25");
  assert.equal(fmtNum(-40, 0), "-40");
  assert.equal(fmtNum(120.0, 1), "120");
});
