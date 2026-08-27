/* 本番と同じ並びで全部読み込んだときに、何が「使える」と判定されるか

   ── なぜこのテストが要るか（2026-08-05 の指摘）──────────────
   capability.js は「名前があるだけのものを対応済みと呼ばない」ために、
   1 形式ずつ実際に試して判定している。ところが既存のテストは
   **表示層も印刷層も読み込んでいない状態**で測っていたため、
   本番で実際に何が通るのかを確かめているテストが 1 本も無かった。

   ここでは build-v2.mjs の連結順そのままに 66 ファイルを読み込み、
   本番と同じ条件で判定させる。 */
import { group, test, assert, assertEq, report, V2 } from "./harness.mjs";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

/* build-v2.mjs の FILES をそのまま使う（写しを持たない。ずれたら気づけないため） */
function buildOrder() {
  const src = readFileSync(join(V2, "build-v2.mjs"), "utf8");
  const i = src.indexOf("const FILES = [");
  const j = src.indexOf("\n];", i);
  assert(i >= 0 && j > i, "build-v2.mjs の FILES を読めません（名前が変わった？）");
  return [...src.slice(i, j).matchAll(/"([^"]+\.js)"/g)].map((m) => m[1]);
}

/* ブラウザの代わり。UI が動くだけの最小限を置く。 */
function makeSandbox() {
  const el = () => ({
    style: { setProperty() {}, removeProperty() {} },
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {}, getAttribute: () => null, removeAttribute() {},
    appendChild() {}, removeChild() {}, insertBefore() {},
    addEventListener() {}, removeEventListener() {},
    querySelector: () => null, querySelectorAll: () => [],
    innerHTML: "", textContent: "", value: "", children: [], dataset: {},
    attachShadow() { return el(); }, cloneNode() { return el(); },
    focus() {}, click() {}, closest: () => null, contains: () => false
  });
  const sb = {
    console, Date, Math, JSON, String, Number, Object, Array, Promise, Error,
    isFinite, parseInt, parseFloat, setTimeout, clearTimeout, setInterval, clearInterval,
    RegExp, Boolean, encodeURIComponent, decodeURIComponent, TextEncoder, TextDecoder,
    Map, Set, WeakMap, Symbol, Intl,
    btoa: (s) => Buffer.from(s, "binary").toString("base64"),
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    matchMedia: () => ({ matches: false, addListener() {}, removeListener() {},
                         addEventListener() {}, removeEventListener() {} }),
    requestAnimationFrame: (f) => setTimeout(f, 0),
    fetch: () => Promise.reject(new Error("no network")),
    CustomEvent: function () {}, Event: function () {}
  };
  sb.globalThis = sb; sb.window = sb; sb.self = sb;
  const store = new Map();
  sb.localStorage = {
    getItem: (k) => (store.has(String(k)) ? store.get(String(k)) : null),
    setItem: (k, v) => store.set(String(k), String(v)),
    removeItem: (k) => store.delete(String(k)), clear: () => store.clear(),
    key: () => null, get length() { return store.size; }
  };
  sb.location = { search: "", href: "http://127.0.0.1/", hostname: "127.0.0.1", protocol: "http:" };
  sb.navigator = { userAgent: "node", language: "ja" };
  sb.document = Object.assign(el(), {
    createElement: () => el(), createTextNode: () => el(), createDocumentFragment: () => el(),
    getElementById: () => null, body: el(), head: el(), documentElement: el(),
    readyState: "complete"
  });
  return sb;
}

const files = buildOrder();
const sb = makeSandbox();
vm.createContext(sb);
let loaded = 0;
const failed = [];
for (const f of files) {
  const p = join(V2, f);
  if (!existsSync(p)) continue;
  try { vm.runInContext(readFileSync(p, "utf8"), sb, { filename: f }); loaded++; }
  catch (e) { failed.push(f + ": " + String(e && e.message).slice(0, 80)); }
}

const C = sb.VQ2 && sb.VQ2.capability;

group("本番と同じ並びで全部読み込める");
{
  test("連結順のファイルが 60 本以上ある", () => assert(files.length >= 60, files.length + " 本"));
  test("読み込みで落ちるファイルが無い", () =>
    assertEq(failed.length, 0, "読み込めなかった: " + failed.join(" / ")));
  test("表示層も印刷層も読めている（ここが false だと判定が当てにならない）", () => {
    assert(sb.VQ2 && sb.VQ2.qrender, "表示層（qrender）が読めていません");
    assert(sb.VQ2 && sb.VQ2.layout && sb.VQ2.pdfRenderer, "印刷層が読めていません");
  });
}

group("本番構成での「使える形式」");
{
  const preset = C ? C.forAi({}) : [];
  const mock = C ? C.forAi({ mock: true }) : [];

  test("プリセットで使える形式がある", () => assert(preset.length >= 50, preset.length + " 件"));
  test("試験（紙）で使える形式がある", () => assert(mock.length >= 50, mock.length + " 件"));
  test("紙のほうがプリセットより少ない（紙で成立しない操作があるため）", () =>
    assert(mock.length < preset.length, "紙 " + mock.length + " / 画面 " + preset.length));

  /* 契約 §2 の核心。ここが × に戻ったら「英文並び替えで作って」が試験で出せない。 */
  ["ordering", "reorder_english", "matching", "classification", "table_fill"].forEach((t) => {
    test(t + " は試験（紙）でも使える（契約 §2）", () =>
      assert(mock.indexOf(t) >= 0, t + " が紙から外れています"));
  });

  /* 紙で操作そのものが成立しないもの。ここが ○ になったら「動くふり」。 */
  ["dictation", "flashcard", "audio_choice", "image_point"].forEach((t) => {
    test(t + " は紙では使えない（動くふりをしない）", () =>
      assert(mock.indexOf(t) < 0, t + " が紙で使えることになっています"));
  });

  test("chart_read は紙では使えない（グラフを刷る手段が無い）", () =>
    assert(mock.indexOf("chart_read") < 0,
      "グラフを紙へ描けないのに使えることになっています"));

  test("ふつうの形式はどちらでも使える", () => {
    ["multiple_choice_single", "true_false", "short_answer", "fill_blank", "long_answer"]
      .forEach((t) => {
        assert(preset.indexOf(t) >= 0, t + " が画面で使えません");
        assert(mock.indexOf(t) >= 0, t + " が紙で使えません");
      });
  });
}

group("紙に中身が出るかを実測している（宣言を信じていない）");
{
  test("並び替えの中身は紙に出ると判定される", () =>
    assertEq(C.paperCarriesContent ? C.paperCarriesContent("reorder", "ordering") : null, true));
  test("組み合わせの中身も出る", () =>
    assertEq(C.paperCarriesContent ? C.paperCarriesContent("matching", "matching") : null, true));
  test("分類の中身も出る", () =>
    assertEq(C.paperCarriesContent ? C.paperCarriesContent("classification", "classification") : null, true));
  test("表うめの中身も出る", () =>
    assertEq(C.paperCarriesContent ? C.paperCarriesContent("table_fill", "table_fill") : null, true));
}

process.exit(report("本番構成での形式の実態") > 0 ? 1 : 0);
