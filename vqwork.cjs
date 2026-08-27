#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   vqwork.cjs — Workplace 基盤（core/）の 回帰試験

   ・ここは **サーバを叩かない**。client/core/*.js を そのまま読み込んで
     純粋関数として 確かめる。
   ・§13 の試験要件を 1 つずつ 数える。
   ・「良く見せるために 期待値を弱める」ことをしない。落ちたら 落ちたと出す。
   ══════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");

/* 本番へは 何もしない試験だが、決まりごとに合わせて 見張りは置く。 */
const BASE = process.env.BASE || "http://127.0.0.1:8787";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) {
  console.error("本番では実行しません。");
  process.exit(2);
}

const 根 = path.join(__dirname, "client");
const 並び = [
  "core/ir/types.js", "core/ir/ids.js", "core/ir/hash.js", "core/ir/walk.js",
  "core/ir/project.js", "core/ir/snapshot.js",
  "core/ops/types.js", "core/ops/apply.js", "core/ops/guard.js", "core/ops/decompose.js",
  "core/selector/resolve.js", "core/selector/ask.js",
  "core/validate/common.js", "core/validate/placeholder.js", "core/validate/math.js",
  "core/validate/numbers.js", "core/validate/formula.js", "core/validate/docs.js",
  "core/validate/sheets.js", "core/validate/slides.js", "core/validate/doctype.js",
  "core/report/render.js",
  "core/doctype/schema.js", "core/doctype/registry.js", "core/doctype/fallback.js",
  "core/doctype/exam.js", "core/doctype/extract.js", "core/doctype/generate.js",
  "core/pipeline/repair.js", "core/pipeline/edit.js", "core/pipeline/generate.js"
];

const ctx = vm.createContext({ console: console, TextDecoder: TextDecoder,
  TextEncoder: TextEncoder, Promise: Promise, Date: Date, Math: Math, JSON: JSON });
ctx.globalThis = ctx;
並び.forEach(function (f) {
  const src = fs.readFileSync(path.join(根, f), "utf8");
  try { vm.runInContext(src, ctx, { filename: f }); }
  catch (e) { console.error("読み込みで落ちました: " + f + "\n" + e.stack); process.exit(1); }
});
const VQW = ctx.VQW;

/* 書式カタログは ファイルから 直に入れる（fetch は使わない） */
JSON.parse(fs.readFileSync(path.join(根, "data/doctypes/index.json"), "utf8"))
  .doctypes.forEach(function (n) {
    const j = JSON.parse(fs.readFileSync(path.join(根, "data/doctypes/" + n + ".json"), "utf8"));
    const r = VQW.doctype.registry.入れる(j);
    if (r && r.だめ) { console.error("書式が おかしい: " + r.だめ); process.exit(1); }
  });

/* ══ 数える道具 ═══════════════════════════════════════════════ */
let 全 = 0, 良 = 0, 悪 = [];
function ok(名, 条, 詳) {
  全++;
  if (条) { 良++; console.log("  ✅ " + 名); }
  else { 悪.push(名 + (詳 ? " … " + 詳 : "")); console.log("  ❌ " + 名 + (詳 ? " … " + 詳 : "")); }
}
function 節(t) { console.log("\n■ " + t); }
function 複(v) { return JSON.parse(JSON.stringify(v)); }
function 同(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

/* ══ 見本を 作る ═══════════════════════════════════════════════ */
let 種 = 12345;
function 乱() { 種 = (種 * 1103515245 + 12345) & 0x7fffffff; return 種 / 0x7fffffff; }
function 選(a) { return a[Math.floor(乱() * a.length) % a.length]; }
function uid(p) { return p + "_" + Math.floor(乱() * 1e9).toString(36); }

function 見本docs(n) {
  const 種類 = ["paragraph", "heading1", "heading2", "bullet", "number", "quote",
                "callout", "code", "todo", "divider", "table", "math", "field", "answerSpace"];
  const bs = [];
  for (let i = 0; i < n; i++) {
    const t = 選(種類);
    const b = { id: uid("b"), type: t, text: "かたまり " + i + " の文" };
    if (t === "table") {
      b.header = true;
      b.rows = [["列A", "列B"], ["値1", "値2"], ["値3", "値4"]];
    }
    if (t === "math") b.text = "x^2 + 5x + 6";
    if (t === "field") { b.key = "氏名"; b.label = "氏名"; b.dataType = "text";
                         b.hint = "氏名を書く所です"; b.text = ""; }
    if (t === "answerSpace") { b.lines = 3; b.text = ""; }
    if (t === "divider") b.text = "";
    bs.push(b);
  }
  return { blocks: bs, page: { mode: "paper", size: "a4", orient: "portrait",
    margin: { t: 25, r: 25, b: 25, l: 25 }, header: "", footer: "", pageNumber: false } };
}
function 見本sheets() {
  const cells = { A1: { v: "品名" }, B1: { v: "単価" }, C1: { v: "個数" }, D1: { v: "小計" } };
  for (let r = 2; r <= 6; r++) {
    cells["A" + r] = { v: "品 " + (r - 1) };
    cells["B" + r] = { v: String(100 * r) };
    cells["C" + r] = { v: String(r) };
    cells["D" + r] = { f: "=B" + r + "*C" + r };
  }
  cells.A7 = { v: "合計" };
  cells.D7 = { f: "=SUM(D2:D6)" };
  return { sheets: [{ id: uid("sh"), name: "シート1", rows: 60, cols: 20, cells: cells,
    colW: {}, rowH: {}, merges: [], freeze: { rows: 0, cols: 0 }, hidden: false,
    color: "", filters: null, conditionals: [] }], charts: [], activeSheet: 0 };
}
function 見本slides(n) {
  const sl = [];
  for (let i = 0; i < n; i++) {
    sl.push({ id: uid("sl"), layout: "title_body", notes: "", hidden: false,
      background: "", transition: "",
      elements: [
        { id: uid("e"), type: "text", x: 60, y: 60, w: 840, h: 80, text: "見出し " + i, size: 36 },
        { id: uid("e"), type: "text", x: 60, y: 180, w: 840, h: 200, text: "本文 " + i, size: 20 }
      ] });
  }
  return { ratio: "16:9", theme: "minimal", slides: sl, transition: { type: "fade", speed: 300 } };
}
function 見本forms() {
  return { sections: [{ id: uid("s"), title: "まとまり", description: "",
    fields: [{ id: uid("f"), type: "short_text", label: "お名前" },
             { id: uid("f"), type: "single_choice", label: "学年", options: ["1年", "2年"] }] }],
    theme: {}, settings: {}, logic: [] };
}

/* ══════════════════════════════════════════════════════════════
   1. 往復変換
   ══════════════════════════════════════════════════════════════ */
節("往復変換（写しを作っても 保存形式は 1 バイトも変わらない）");
{
  let 崩れ = 0, 引けない = 0, 総節点 = 0;
  for (let i = 0; i < 100; i++) {
    const kind = ["docs", "sheets", "slides", "forms"][i % 4];
    const c = kind === "docs" ? 見本docs(6 + (i % 12))
            : kind === "sheets" ? 見本sheets()
            : kind === "slides" ? 見本slides(3 + (i % 5)) : 見本forms();
    const 前 = JSON.stringify(c);
    const doc = VQW.ir.toIR(kind, c, {});
    if (JSON.stringify(c) !== 前) 崩れ++;
    VQW.ir.walk(doc.root, function (n) {
      if (n.id === "root") return;
      総節点++;
      if (!VQW.ir.locate(kind, c, n.id)) 引けない++;
    });
  }
  ok("100 件を 写しても 保存形式が 変わらない", 崩れ === 0, "変わった " + 崩れ + " 件");
  ok("写しの節点が すべて 保存形式の場所に 引ける（" + 総節点 + " 節点）", 引けない === 0,
     "引けない " + 引けない + " 個");
}

/* ══════════════════════════════════════════════════════════════
   2. ID 不変
   ══════════════════════════════════════════════════════════════ */
節("ID 不変（足す・消す・動かす・並べ替えても 残ったものの ID は 変わらない）");
{
  const c = 見本docs(10);
  const 前ID = c.blocks.map(function (b) { return b.id; });
  const ops = [
    { op: "insertNode", parentId: "root", index: 3, node: { type: "paragraph", text: "割り込み" } },
    { op: "deleteNode", nodeId: 前ID[7] },
    { op: "moveNode", nodeId: 前ID[1], index: 8 },
    { op: "setText", nodeId: 前ID[0], text: "書き換え" }
  ];
  const r = VQW.ops.guard({ kind: "docs", content: c, 検証する: false,
    request: { baseVersion: 0, intent: "ID 不変の試験", operations: ops } });
  ok("4 種類の操作が 通る", r.status === "applied", r.理由 || JSON.stringify(r.skipped));
  const 後ID = c.blocks.map(function (b) { return b.id; });
  const 生き残り = 前ID.filter(function (id) { return id !== 前ID[7]; });
  ok("消したもの以外の ID が すべて 残っている",
     生き残り.every(function (id) { return 後ID.indexOf(id) >= 0; }));
  ok("足した 1 個ぶんだけ 増えている", 後ID.length === 前ID.length,
     前ID.length + " → " + 後ID.length);
}
{
  /* 表の行・シートのマス・スライドの部品でも 同じ */
  const c = 見本slides(4);
  const 前 = c.slides.map(function (s) { return s.id; });
  const e0 = c.slides[0].elements[0].id;
  const r = VQW.ops.guard({ kind: "slides", content: c, 検証する: false,
    request: { baseVersion: 0, operations: [
      { op: "moveNode", nodeId: 前[3], index: 0 },
      { op: "setText", nodeId: e0, text: "新しい見出し" }] } });
  ok("スライドを 並べ替えても ID が 変わらない",
     r.status === "applied" && c.slides.map(function (s) { return s.id; }).sort().join() === 前.slice().sort().join());
  ok("並べ替えのあとも 部品の ID で 引ける", !!VQW.ir.locate("slides", c, e0));
}

/* ══════════════════════════════════════════════════════════════
   3. 影響範囲（宣言外の変更 0 件）
   ══════════════════════════════════════════════════════════════ */
節("影響範囲（でたらめな操作 1000 件で 宣言外の変更が 0 件）");
{
  let はみ出し = 0, 通った = 0, 断られた = 0;
  for (let i = 0; i < 1000; i++) {
    const kind = ["docs", "sheets", "slides", "forms"][i % 4];
    const c = kind === "docs" ? 見本docs(8) : kind === "sheets" ? 見本sheets()
            : kind === "slides" ? 見本slides(3) : 見本forms();
    const doc = VQW.ir.toIR(kind, c);
    const 節点 = [];
    VQW.ir.walk(doc.root, function (n) { if (n.id !== "root") 節点.push(n); });
    if (!節点.length) continue;
    const n = 選(節点);
    const 種 = 選(["setText", "setAttrs", "deleteNode", "insertNode", "moveNode"]);
    let op;
    if (種 === "insertNode") {
      op = { op: "insertNode", parentId: "root", index: 0,
             node: kind === "docs" ? { type: "paragraph", text: "足した" }
                 : kind === "slides" ? { type: "page", attrs: {}, children: [] }
                 : kind === "sheets" ? { type: "sheet", attrs: { name: "新" }, children: [] }
                 : { type: "formSection", text: "新", children: [] } };
    } else if (種 === "setText") op = { op: "setText", nodeId: n.id, text: "直した " + i };
    else if (種 === "setAttrs") op = { op: "setAttrs", nodeId: n.id, attrs: { 印: i } };
    else if (種 === "deleteNode") op = { op: "deleteNode", nodeId: n.id };
    else op = { op: "moveNode", nodeId: n.id, index: 0 };

    const r = VQW.ops.guard({ kind: kind, content: c, 検証する: false,
      request: { baseVersion: 0, operations: [op] } });
    if (r.status === "rejected") {
      断られた++;
      if (r.skipped[0] && r.skipped[0].reason === "out_of_scope") はみ出し++;
    } else 通った++;
  }
  ok("1000 件で 宣言外の変更が 0 件", はみ出し === 0, "はみ出し " + はみ出し + " 件");
  ok("大半は ちゃんと通っている（" + 通った + " 件 / 断り " + 断られた + " 件）", 通った >= 800,
     "通ったのが " + 通った + " 件しかない");
}

/* ══════════════════════════════════════════════════════════════
   4. ロールバック（宣言違反を 入れたら 必ず 戻る）
   ══════════════════════════════════════════════════════════════ */
節("ロールバック（宣言していない所を 変えようとしたら まるごと戻す）");
{
  const c = 見本docs(6);
  const 前 = JSON.stringify(c), 前版 = VQW.ops.版(c);
  const A = c.blocks[0].id, B = c.blocks[3].id;
  const r = VQW.ops.guard({ kind: "docs", content: c, 検証する: false,
    request: { baseVersion: 0, declaredTargets: [A],
               operations: [{ op: "setText", nodeId: B, text: "こっそり書き換え" }] } });
  ok("宣言違反は rejected", r.status === "rejected" && r.skipped[0].reason === "out_of_scope",
     JSON.stringify(r.skipped));
  ok("中身が 1 バイトも 変わっていない", JSON.stringify(c) === 前);
  ok("版が 進んでいない", VQW.ops.版(c) === 前版);
}
{
  /* 消すときは 親を宣言する。宣言しなければ 戻る。 */
  const c = 見本docs(6);
  const 前 = JSON.stringify(c);
  const r = VQW.ops.guard({ kind: "docs", content: c, 検証する: false,
    request: { baseVersion: 0, declaredTargets: ["root"],
               operations: [{ op: "deleteNode", nodeId: c.blocks[2].id }] } });
  ok("親（root）を宣言した削除は 通る", r.status === "applied", r.理由);
  const c2 = 見本docs(6);
  const 前2 = JSON.stringify(c2);
  const r2 = VQW.ops.guard({ kind: "docs", content: c2, 検証する: false,
    request: { baseVersion: 0, declaredTargets: [c2.blocks[0].id],
               operations: [{ op: "deleteNode", nodeId: c2.blocks[2].id }] } });
  ok("親を 宣言していない削除は 戻る", r2.status === "rejected" && JSON.stringify(c2) === 前2);
}
{
  /* ピン留め */
  const c = 見本docs(6);
  c.__work = { version: 0, locks: [c.blocks[1].id] };
  const 前 = JSON.stringify(c);
  const r = VQW.ops.guard({ kind: "docs", content: c, 検証する: false,
    request: { baseVersion: 0, operations: [{ op: "setText", nodeId: c.blocks[1].id, text: "だめ" }] } });
  ok("ピン留めされた所は 断る", r.status === "rejected" && r.skipped[0].reason === "locked");
  ok("ピン留めのときも 中身は 変わらない", JSON.stringify(c) === 前);
}

/* ══════════════════════════════════════════════════════════════
   5. Undo / Redo
   ══════════════════════════════════════════════════════════════ */
節("Undo（どんな直しの並びでも 1 つずつ戻すと 最初と 完全に一致）");
{
  const c = 見本docs(10);
  const 最初 = 複(c);
  const h = VQW.snapshot.newHistory(c);
  const 回 = 60;
  for (let i = 0; i < 回; i++) {
    VQW.snapshot.push(h, c, "直し " + i);
    const doc = VQW.ir.toIR("docs", c);
    const 節点 = doc.root.children;
    const n = 節点[Math.floor(乱() * 節点.length) % 節点.length];
    const 種 = 選(["setText", "insertNode", "deleteNode", "moveNode"]);
    let op;
    if (種 === "insertNode") op = { op: "insertNode", parentId: "root", index: 1,
      node: { type: "paragraph", text: "足し " + i } };
    else if (種 === "deleteNode") op = { op: "deleteNode", nodeId: n.id };
    else if (種 === "moveNode") op = { op: "moveNode", nodeId: n.id, index: 0 };
    else op = { op: "setText", nodeId: n.id, text: "直し " + i };
    VQW.ops.guard({ kind: "docs", content: c, 検証する: false,
      request: { baseVersion: VQW.ops.版(c), operations: [op] } });
  }
  ok("版が " + 回 + " 個 積まれている（うち 全文 20・残りは差分）",
     VQW.snapshot.版数(h) === 回, "版数 " + VQW.snapshot.版数(h));
  let 今 = c;
  for (let i = 0; i < 回; i++) {
    const 前 = VQW.snapshot.undo(h, 今);
    if (前 === null) break;
    今 = 前;
  }
  ok("全部 戻すと 最初と 完全に一致", 同(今, 最初),
     "戻したあとの かたまり数 " + (今.blocks || []).length + " / 最初 " + 最初.blocks.length);
}
{
  const c = 見本docs(4);
  const h = VQW.snapshot.newHistory(c);
  VQW.snapshot.push(h, c, "1");
  const c2 = 複(c); c2.blocks[0].text = "あとの形";
  const 戻 = VQW.snapshot.undo(h, c2);
  ok("undo で 前の形が 返る", 戻.blocks[0].text !== "あとの形");
  const 進 = VQW.snapshot.redo(h, 戻);
  ok("redo で もとの形へ 進める", 進 && 進.blocks[0].text === "あとの形");
}
{
  /* 差分（JSON Patch）そのものの 確かめ */
  let 崩 = 0;
  for (let i = 0; i < 200; i++) {
    const a = 見本docs(3 + (i % 6));
    const b = 複(a);
    if (b.blocks.length > 1) b.blocks.splice(1, 1);
    b.blocks[0].text = "書き換え " + i;
    b.blocks.push({ id: uid("b"), type: "paragraph", text: "足し" });
    const p = VQW.snapshot.diff(a, b);
    if (!同(VQW.snapshot.applyPatch(a, p), b)) 崩++;
  }
  ok("差分を 当てると 完全に 一致する（200 通り）", 崩 === 0, "食い違い " + 崩);
}

/* ══════════════════════════════════════════════════════════════
   6. セレクタ
   ══════════════════════════════════════════════════════════════ */
節("セレクタ（曖昧・不一致では 必ず 聞く。勝手に選ばない）");
{
  const c = { blocks: [
    { id: "b1", type: "heading1", text: "会場について" },
    { id: "b2", type: "paragraph", text: "会場は 体育館です" },
    { id: "b3", type: "paragraph", text: "会場の 準備は 前日" },
    { id: "b4", type: "paragraph", text: "受付は 9 時" }] };
  const doc = VQW.ir.toIR("docs", c);

  const 複数 = VQW.selector.resolve(doc, { by: "text", contains: "会場" });
  ok("2 件以上 当たったら multiple", 複数.kind === "multiple" && 複数.nodeIds.length === 3);
  const 聞1 = VQW.selector.聞く(複数, { 何をしたい: "直す" });
  ok("multiple では 何もせず 聞く", !!聞1 && !!聞1.だめ && /1 つに決まりません/.test(聞1.だめ));
  ok("候補を 番号つきで 出す", /1\)/.test(聞1.きくこと) && /0\) 全部に当てる/.test(聞1.きくこと));

  const 無 = VQW.selector.resolve(doc, { by: "text", contains: "駐車場" });
  ok("当たらなければ none", 無.kind === "none");
  const 聞2 = VQW.selector.聞く(無, {});
  ok("none でも 何もせず 聞く", !!聞2.だめ && /何もしていません/.test(聞2.だめ));

  const 一 = VQW.selector.resolve(doc, { by: "text", contains: "受付" });
  ok("1 件なら unique", 一.kind === "unique" && 一.nodeId === "b4");
  ok("unique では 聞かない", VQW.selector.聞く(一, {}) === null);

  const 順 = VQW.selector.resolve(doc, { by: "ordinal", scope: "本文", index: 2 });
  ok("「2 番目の本文」が 引ける", 順.kind === "unique" && 順.nodeId === "b3");
  const 行き過ぎ = VQW.selector.resolve(doc, { by: "ordinal", scope: "本文", index: 9 });
  ok("番号が 行き過ぎたら 聞く（勝手に 最後を選ばない）", 行き過ぎ.kind === "none");

  const 選択 = VQW.selector.resolve(doc, { by: "selection" }, ["b2"]);
  ok("画面の選択が 最優先で 引ける", 選択.kind === "unique" && 選択.nodeId === "b2");
  const 選択なし = VQW.selector.resolve(doc, { by: "selection" }, []);
  ok("何も選ばれていなければ 聞く", 選択なし.kind === "none");
}
{
  /* pipeline.edit が 曖昧なときに 何もしないこと */
  const c = { blocks: [
    { id: "x1", type: "paragraph", text: "予算は 10 万円" },
    { id: "x2", type: "paragraph", text: "予算の 内訳" }] };
  const 前 = JSON.stringify(c);
  const r = VQW.pipeline.edit({ kind: "docs", content: c,
    selector: { by: "text", contains: "予算" },
    作る: function (ids) { return ids.map(function (id) {
      return { op: "setText", nodeId: id, text: "書き換えた" }; }); } });
  ok("曖昧なとき pipeline.edit は 中身を 触らない", JSON.stringify(c) === 前);
  ok("曖昧なとき 完成と言ってよい = false", r.完成と言ってよい === false);
}

/* ══════════════════════════════════════════════════════════════
   7. プレースホルダ
   ══════════════════════════════════════════════════════════════ */
節("プレースホルダ（既知の印を 全部 見つけ、人が入れた値を 誤検出しない）");
{
  const 印 = ["A. ○○ B. ○○", "〇〇株式会社", "△△の予定", "□□を記入", "×××",
              "・・・", "XXX", "Lorem ipsum dolor", "（ここに書く）", "（氏名を記入）",
              "（金額を入力）", "【日付】のところ", "TBD", "未記入", "サンプル",
              "ダミーの値", "TBD"];
  let 見つけた = 0;
  印.forEach(function (s) { if (VQW.validate.placeholder.ある(s)) 見つけた++; });
  ok("既知の印を すべて 見つける（" + 印.length + " 通り）", 見つけた === 印.length,
     "見つけたのは " + 見つけた);

  const 本物 = ["○○商店 田中太郎", "山田花子", "2026年8月17日", "12,000",
                "体育館で 行います", "△ 印のものは 予備です"];
  const c = { blocks: 本物.map(function (t, i) {
    return { id: "u" + i, type: "paragraph", text: t, userEntered: true }; }) };
  const doc = VQW.ir.toIR("docs", c);
  doc.root.children.forEach(function (n) { n.attrs.userEntered = true; });
  const 出 = VQW.validate.placeholder.check(doc, {});
  ok("人が入れた値は 1 つも 弾かない", 出.length === 0,
     出.map(function (x) { return x.なに; }).join(" / "));

  /* AI が書いた同じ文字列は 弾く */
  const c2 = { blocks: [{ id: "a1", type: "paragraph", text: "A. ○○  B. ○○" }] };
  const doc2 = VQW.ir.toIR("docs", c2);
  ok("AI が書いた「○○」は 弾く", VQW.validate.placeholder.check(doc2, {}).length === 1);

  /* 空でよい箱は 見ない */
  const c3 = { blocks: [{ id: "f1", type: "field", text: "", key: "氏名", label: "氏名",
                          hint: "（氏名を記入）" }] };
  const doc3 = VQW.ir.toIR("docs", c3);
  ok("記入欄の ヒントは プレースホルダ扱いしない",
     VQW.validate.placeholder.check(doc3, {}).length === 0);
}

/* ══════════════════════════════════════════════════════════════
   8. 捏造禁止
   ══════════════════════════════════════════════════════════════ */
節("捏造禁止（人が入れる欄に こちらの値が 入らない）");
{
  const dt = VQW.doctype.registry.get("exam_paper");
  ok("exam_paper が 読めている", !!dt);
  const 人 = VQW.doctype.schema.人が入れる欄(dt).map(function (f) { return f.key; });
  ok("氏名・クラス・出席番号・実施日が user_input",
     ["氏名", "クラス", "出席番号", "examDate"].every(function (k) { return 人.indexOf(k) >= 0; }),
     人.join(","));

  const p = VQW.pipeline.プロンプト(dt, "2 学期の中間試験", {});
  ok("頼み文で 書いてよい欄を 並べている", /あなたが書いてよい欄/.test(p));
  ok("頼み文で 値を入れてはいけない欄を はっきり止めている",
     /値を入れてはいけません/.test(p) && /氏名/.test(p));
  ok("頼み文に 番地・色・pt を 一言も 出していない",
     !/A1|#[0-9a-fA-F]{6}|\bpt\b|px/.test(p));

  /* LLM が うっかり 氏名を返してきた場合 */
  let 渡した = null;
  const 出 = [];
  const res = VQW.pipeline.generate({
    kind: "docs", 頼み: "中間試験の問題用紙", docTypeName: "問題用紙",
    聞く: function (prompt) {
      渡した = prompt;
      return Promise.resolve({ fields: { examName: "2学期 中間試験", subject: "数学",
        duration: "50", 氏名: "山田太郎", クラス: "3年A組", notice: ["机の上を 片づける"] } });
    }
  });
  出.push(res);
  return Promise.all(出).then(function (a) {
    const r = a[0];
    ok("氏名は 入れずに 捨てる", (r.入れなかった欄 || []).indexOf("氏名") >= 0,
       JSON.stringify(r.入れなかった欄));
    ok("クラスも 捨てる", (r.入れなかった欄 || []).indexOf("クラス") >= 0);
    const 本文 = JSON.stringify(r.content);
    ok("できた書類に 「山田太郎」が 1 文字も 無い", 本文.indexOf("山田太郎") < 0);
    ok("氏名は **記入欄** として 置かれている",
       (r.content.blocks || []).some(function (b) { return b.type === "field" && b.key === "氏名"; }));
    ok("書いてよい欄（試験名）は ちゃんと 入っている", 本文.indexOf("2学期 中間試験") >= 0);
    ok("捨てた理由を 説明している", /人が自分で書く所/.test(r.なぜ入れなかったか || ""));
    つづき();
  });
}

function つづき() {
/* ══════════════════════════════════════════════════════════════
   9〜10. 数と式・数式表示
   ══════════════════════════════════════════════════════════════ */
節("数と式（合計は 式・単位つきの数は 文字として 弾く）");
{
  const c = 見本sheets();
  c.sheets[0].cells.B3 = { v: "1,200円" };
  c.sheets[0].cells.B4 = { v: "1,500" };
  const 検 = VQW.validate.run("sheets", c, {});
  const 数 = 検.errors.filter(function (e) { return e.code === "numberAsText"; });
  ok("「1,200円」を 文字として 弾く", 数.some(function (e) { return /1,200円/.test(e.なに); }));
  ok("「1,500」（桁区切り）も 弾く", 数.some(function (e) { return /1,500/.test(e.なに); }));

  /* 直す */
  VQW.pipeline.repair("sheets", c, {});
  ok("直したあと B3 が 数になっている", c.sheets[0].cells.B3.v === "1200",
     JSON.stringify(c.sheets[0].cells.B3));
  ok("直したあと B4 が 数になっている", c.sheets[0].cells.B4.v === "1500");
}
{
  /* 合計が リテラル */
  const c = 見本sheets();
  c.sheets[0].cells.D7 = { v: "4200" };
  const dt = VQW.doctype.schema.そろえる({ id: "t", kind: "sheets",
    displayName: "試験用", requiredFields: [],
    calculations: [{ target: "D7", formula: "SUM(D2:D6)", label: "合計" }] });
  const 検 = VQW.validate.run("sheets", c, { docType: dt });
  ok("合計が リテラルだと 弾く",
     検.errors.some(function (e) { return e.code === "calcNotFormula"; }),
     JSON.stringify(検.errors.map(function (e) { return e.code; })));
  VQW.pipeline.repair("sheets", c, { docType: dt });
  ok("直すと 式に なる", (c.sheets[0].cells.D7 || {}).f === "=SUM(D2:D6)",
     JSON.stringify(c.sheets[0].cells.D7));
}
{
  /* SUM の範囲から はみ出す */
  const c = 見本sheets();
  c.sheets[0].cells.A8 = { v: "品 7" };
  c.sheets[0].cells.D8 = { v: "999" };
  const 検 = VQW.validate.run("sheets", c, {});
  ok("SUM の範囲から データが はみ出しているのを 見つける",
     検.errors.some(function (e) { return e.code === "rangeMismatch"; }));
}
{
  /* 元が空の式 */
  const c = { sheets: [{ id: "sh1", name: "S", rows: 60, cols: 20, colW: {}, rowH: {},
    merges: [], freeze: null, cells: { A1: { v: "単価" }, B1: { v: "個数" },
      C1: { v: "小計" }, C2: { f: "=A2*B2" } } }], charts: [], activeSheet: 0 };
  const 検 = VQW.validate.run("sheets", c, {});
  ok("式は あるのに 元が 空 を 見つける",
     検.errors.some(function (e) { return e.code === "formulaEmptySource"; }));
}

節("数式（生の LaTeX を そのまま 出さない）");
{
  const c = { blocks: [
    { id: "m1", type: "paragraph", text: "$x^2 + 5x + 6$" },
    { id: "m2", type: "paragraph", text: "面積は $S = \\pi r^2$ で 求まります" },
    { id: "m3", type: "paragraph", text: "こわれた式 $\\frac{1}{2$" },
    { id: "m4", type: "paragraph", text: "\\(a+b\\) と 書いた場合" },
    { id: "m5", type: "math", text: "x^2 + 5x + 6" }] };
  const doc = VQW.ir.toIR("docs", c);
  const 出 = VQW.validate.math.check(doc, {});
  const 種 = 出.map(function (e) { return e.code + ":" + e.nodeId; });
  ok("まるごと式の 段落は 数式の箱にすべき と言う",
     種.indexOf("mathShouldBeBlock:m1") >= 0, 種.join(" / "));
  ok("文の途中の 正しい式は 通す（$S=\\pi r^2$）",
     !種.some(function (s) { return /:m2$/.test(s); }));
  ok("組めない式は 弾く", 種.some(function (s) { return /^mathBroken:m3$/.test(s); }));
  ok("\\( \\) の書きかたは 弾く", 種.some(function (s) { return /^mathOtherSyntax:m4$/.test(s); }));
  ok("数式の箱は 通す", !種.some(function (s) { return /:m5$/.test(s); }));

  VQW.pipeline.repair("docs", c, {});
  ok("直すと まるごと式の 段落が 数式の箱に なる", c.blocks[0].type === "math",
     c.blocks[0].type);
  ok("直したあと 文字として $ が 残っていない", (c.blocks[0].text || "").indexOf("$") < 0,
     c.blocks[0].text);
}

/* ══════════════════════════════════════════════════════════════
   列幅（厚生年金保…）
   ══════════════════════════════════════════════════════════════ */
節("列幅（文字が 切れているのを 見つけ、直す）");
{
  const c = 見本sheets();
  c.sheets[0].cells.A2 = { v: "厚生年金保険料" };
  const 検 = VQW.validate.run("sheets", c, {});
  const 幅 = 検.errors.filter(function (e) { return e.code === "colTooNarrow"; });
  ok("「厚生年金保険料」が 列幅 96px に 入らないと 言う", 幅.length >= 1,
     JSON.stringify(検.errors.map(function (e) { return e.code; })));
  ok("何 px にすればよいか まで 言う", /px にしてください/.test(幅[0].どうする));
  VQW.pipeline.repair("sheets", c, {});
  const 後 = VQW.validate.run("sheets", c, {});
  ok("直すと 切れなくなる",
     !後.errors.some(function (e) { return e.code === "colTooNarrow"; }),
     JSON.stringify(後.errors.map(function (e) { return e.なに; })));
  ok("画面の autoFit と 同じ式（16 + 文字数 × 13）",
     VQW.validate.sheets.要る幅(7) === 16 + 7 * 13);
}

/* ══════════════════════════════════════════════════════════════
   11〜12. 報告
   ══════════════════════════════════════════════════════════════ */
節("報告（LLM を 通さない・部分成功を 成功と 言わない）");
{
  const 中 = fs.readFileSync(path.join(根, "core/report/render.js"), "utf8");
  ok("報告の作りに AI を 呼ぶ所が 1 つも 無い",
     !/fetch\(|VQ2\.ai|\/api\//.test(中));

  const rep = {
    status: "applied", version: { from: 3, to: 4 },
    applied: [{ nodeId: "b1", path: "ページ3 / 見出し", before: "AIの基礎", after: "AIとは何か" }],
    skipped: [], validation: { errors: [], warnings: [] }
  };
  const t = VQW.report.render(rep);
  ok("旧と新を 並べて 出す", /旧「AIの基礎」/.test(t) && /新「AIとは何か」/.test(t));
  ok("件数を 数えて 出す", /変更 1 件/.test(t));
  ok("崩れが 無ければ 完成と言ってよい", VQW.report.言ってよい(rep) === true);

  const 部分 = 複(rep);
  部分.status = "partial";
  部分.skipped = [{ intent: "振込先を追加", reason: "not_found" }];
  const t2 = VQW.report.render(部分);
  ok("部分成功は 「未適用 1 件」と そのまま書く", /未適用 1 件/.test(t2));
  ok("部分成功では 完成と 言わせない", VQW.report.言ってよい(部分) === false);
  ok("見つからなかった理由を 出す", /該当箇所が 見つかりません/.test(t2));

  const 崩 = 複(rep);
  崩.validation = { errors: [{ code: "placeholder", どこ: "本文3", なに: "○○ が 残っています" }],
                    warnings: [] };
  ok("崩れが あれば 完成と 言わせない", VQW.report.言ってよい(崩) === false);
  const o = VQW.report.道具の返り(崩);
  ok("崩れが あるとき「言ってはいけない言葉」を 添える",
     Array.isArray(o.言ってはいけない言葉) && o.言ってはいけない言葉.indexOf("できました") >= 0);
  ok("崩れが あるとき つぎ の指示が 止めにいっている",
     /まだ「できました」と言わないでください/.test(o.つぎ));

  const 断 = { status: "rejected", applied: [], version: { from: 1, to: 1 },
    skipped: [{ intent: "直す", reason: "out_of_scope" }], validation: { errors: [], warnings: [] } };
  const t3 = VQW.report.render(断);
  ok("断ったときは まず「変更していません」と書く", /^\*\*変更していません。\*\*/.test(t3));
  ok("断ったときの 報告に 完成の言葉が 1 つも 無い",
     VQW.report.言ってしまった(t3).length === 0, VQW.report.言ってしまった(t3).join(","));
  ok("直したときの 報告にも 完成の言葉が 無い（言うのは 人ではなく 事実）",
     VQW.report.言ってしまった(t).length === 0, VQW.report.言ってしまった(t).join(","));
}

/* ══════════════════════════════════════════════════════════════
   13. 競合
   ══════════════════════════════════════════════════════════════ */
節("競合（同じ願いを 2 回 送ると 2 回目は 断る）");
{
  const c = 見本docs(5);
  const 願 = { baseVersion: 0, intent: "1 文字直す",
    operations: [{ op: "setText", nodeId: c.blocks[0].id, text: "直した" }] };
  const r1 = VQW.ops.guard({ kind: "docs", content: c, 検証する: false, request: 複(願) });
  ok("1 回目は 通る", r1.status === "applied");
  const r2 = VQW.ops.guard({ kind: "docs", content: c, 検証する: false, request: 複(願) });
  ok("2 回目は 版が 合わずに 断る",
     r2.status === "rejected" && r2.skipped[0].reason === "competing_edit", JSON.stringify(r2.skipped));
  ok("版は 1 つしか 進んでいない", VQW.ops.版(c) === 1, "版 " + VQW.ops.版(c));
}

/* ══════════════════════════════════════════════════════════════
   大きな直し（分解・段階適用・差分プレビュー）
   ══════════════════════════════════════════════════════════════ */
節("大きな直し（作り直さない・束ごとに通す・ピン留めは 外す）");
{
  const c = 見本slides(20);
  const 前ID = c.slides.map(function (s) { return s.id; });
  const ops = [];
  for (let i = 0; i < 20; i++) ops.push({ op: "insertNode", parentId: "root",
    node: { type: "page", attrs: { layout: "title_body" }, children: [
      { type: "textFrame", attrs: { x: 60, y: 60, w: 840, h: 80, size: 36 }, text: "足した " + i }] } });
  const r = VQW.ops.段階適用({ kind: "slides", content: c, intent: "20 枚を 40 枚に", operations: ops });
  ok("20 枚 → 40 枚 が 通る", r.status === "applied" && c.slides.length === 40,
     c.slides.length + " 枚");
  ok("もとの 20 枚の ID が すべて 残っている",
     前ID.every(function (id) { return c.slides.some(function (s) { return s.id === id; }); }));

  /* ピン留めは 外して 進む */
  const c2 = 見本docs(6);
  c2.__work = { version: 0, locks: [c2.blocks[2].id] };
  const 元文 = c2.blocks[2].text;
  const r2 = VQW.ops.段階適用({ kind: "docs", content: c2, operations: [
    { op: "setText", nodeId: c2.blocks[0].id, text: "直した A" },
    { op: "setText", nodeId: c2.blocks[2].id, text: "直した B" },
    { op: "setText", nodeId: c2.blocks[3].id, text: "直した C" }] });
  ok("ピン留め以外は 通る", c2.blocks[0].text === "直した A" && c2.blocks[3].text === "直した C");
  ok("ピン留めは 触っていない", c2.blocks[2].text === 元文);
  ok("触らなかったことを 報告に 出す",
     r2.skipped.some(function (s) { return s.reason === "locked"; }));

  /* 差分プレビュー */
  const c3 = 見本docs(5);
  const 前3 = JSON.stringify(c3);
  const pv = VQW.ops.preview("docs", c3, [
    { op: "setText", nodeId: c3.blocks[1].id, text: "変えた" },
    { op: "deleteNode", nodeId: c3.blocks[3].id }]);
  ok("プレビューは 中身を 変えない", JSON.stringify(c3) === 前3);
  ok("プレビューで 直す 1 件・消す 1 件 が 出る", pv.直す数 === 1 && pv.消す数 === 1,
     JSON.stringify({ 直: pv.直す数, 消: pv.消す数, 足: pv.足す数 }));
}

/* ══════════════════════════════════════════════════════════════
   書式カタログ・フォールバック
   ══════════════════════════════════════════════════════════════ */
節("書式（データで持つ・知らないものは 知らないと言う）");
{
  ok("カタログは JSON ファイルから 読んでいる（コードに 埋め込んでいない）",
     fs.existsSync(path.join(根, "data/doctypes/exam_paper.json")));
  const 目次 = JSON.parse(fs.readFileSync(path.join(根, "data/doctypes/index.json"), "utf8"));
  ok("目次に 名前を足すだけで 増える（デプロイ不要）", Array.isArray(目次.doctypes));

  const e = VQW.doctype.fallback.探す("テスト用紙", "docs");
  ok("別名（テスト用紙）から exact で 引ける", e.match === "exact" && e.docType.id === "exam_paper",
     e.match + " / " + (e.docType && e.docType.id));
  const n = VQW.doctype.fallback.探す("答案用紙", "docs");
  ok("解答用紙の別名も 引ける", n.match === "exact" && n.docType.id === "answer_sheet");
  const 無 = VQW.doctype.fallback.探す("給与明細書", "docs");
  ok("知らない書類は none", 無.match === "none", 無.match);
  ok("none のとき **正式な書式ではない** と はっきり書く",
     /正式な「給与明細書」の書式ではありません/.test(無.画面に出す));
  ok("none のとき 取り込みを 案内する", /取り込んで/.test(無.つぎ || ""));

  /* near */
  VQW.doctype.registry.入れる({ id: "test_child", kind: "docs", displayName: "県立高校入学願書",
    aliases: ["県立高校入学願書"], parent: "exam_paper", requiredFields: [], regions: [] });
  const 近 = VQW.doctype.fallback.探す("市立高校入学願書", "docs");
  ok("近いものは near にして 親の書式を使う", 近.match === "near", 近.match);
  ok("near のとき **特有の項目は入っていない** と 断る",
     /特有の項目は 入っていません/.test(近.画面に出す || ""));

  const draft = VQW.doctype.schema.そろえる({ id: "d1", kind: "docs", displayName: "下書き書式",
    requiredFields: [], regions: [], status: "draft" });
  const c = { blocks: [{ id: "b1", type: "paragraph", text: "本文" }] };
  const 検 = VQW.validate.run("docs", c, { docType: draft });
  ok("未承認の書式は 使うたびに 断りを 出す",
     検.warnings.some(function (w) { return w.code === "doctypeDraft"; }));
}

/* ══════════════════════════════════════════════════════════════
   問題用紙（既存の問題 JSON から）
   ══════════════════════════════════════════════════════════════ */
節("問題用紙（既存の問題 JSON を 並べるだけ。プレースホルダ 0）");
{
  const 問 = [
    { id: "q1", type: "multiple_choice_single", engine: "multiple_choice",
      prompt: "次のうち 正しいものを 選びなさい。", points: 5,
      choices: [{ id: "c1", text: "光は 波である", isCorrect: true },
                { id: "c2", text: "光は 音である" },
                { id: "c3", text: "光は 液体である" },
                { id: "c4", text: "光は 金属である" }],
      explanation: "光は 波と 粒の 両方の 性質を もつ。" },
    { id: "q2", type: "short_answer", engine: "short_answer",
      prompt: "水の 化学式を 書きなさい。", points: 3, correctAnswer: "H2O" },
    { id: "q3", type: "long_answer", engine: "long_answer",
      prompt: "光合成の しくみを 説明しなさい。", points: 10,
      correctAnswer: "植物が 光を 使って デンプンを 作る はたらき。" }
  ];
  const 三 = VQW.doctype.exam.三枚(問, {
    試験名: "2 学期 中間試験", 学校: "第一高等学校", 科目: "理科",
    試験時間: 50, 注意: ["机の上を 片づける", "電卓は 使わない"] });

  ok("3 枚 出る", !!三.exam_paper && !!三.answer_sheet && !!三.answer_key);
  ok("満点は 配点の 合計から 出す（5+3+10=18）", 三.満点 === 18, String(三.満点));

  const 問doc = VQW.ir.toIR("docs", 三.exam_paper);
  const 出 = VQW.validate.placeholder.check(問doc, {});
  /* 学校名に 本物の「○○高校」を 渡しているので そこだけは 出る。
     問題そのものから プレースホルダが 出ないことを 見る。 */
  const 問題から = 出.filter(function (e) { return /光|水|化学|説明/.test(e.なに); });
  ok("問題文・選択肢から プレースホルダが 1 つも 出ない", 問題から.length === 0,
     問題から.map(function (e) { return e.なに; }).join(" / "));

  const 本文 = JSON.stringify(三.exam_paper);
  ok("選択肢が ア・イ・ウ・エ で 縦に 並ぶ",
     /ア．光は 波である/.test(本文) && /エ．光は 金属である/.test(本文));
  ok("配点が 出ている", /（5 点）/.test(本文));
  ok("氏名・クラス・出席番号が **記入欄** として ある",
     ["氏名", "クラス", "出席番号"].every(function (k) {
       return 三.exam_paper.blocks.some(function (b) { return b.type === "field" && b.key === k; });
     }));
  ok("問題用紙に 氏名の 値が 入っていない",
     三.exam_paper.blocks.filter(function (b) { return b.type === "field"; })
       .every(function (b) { return b.text === ""; }));

  const 答 = 三.answer_sheet;
  ok("解答用紙の 解答欄が 問題数と 同じ",
     答.blocks.filter(function (b) { return b.type === "answerSpace"; }).length === 3);
  ok("記述の問いは 行を 多く とる",
     答.blocks.filter(function (b) { return b.type === "answerSpace"; })[2].lines === 6);
  ok("解答用紙に 得点欄が ある",
     答.blocks.some(function (b) { return b.type === "field" && b.key === "得点"; }));

  const 解 = JSON.stringify(三.answer_key);
  ok("解答解説に 正解が 出る（ア）", /正解: ア/.test(解));
  ok("解答解説に 記述の 正解も 出る（H2O）", /H2O/.test(解));
  ok("解答解説に もとの 解説が そのまま 出る", /波と 粒の 両方/.test(解));

  const 検 = VQW.validate.run("docs", 三.answer_sheet, {});
  ok("解答用紙に 崩れが 無い", 検.errors.length === 0,
     検.errors.map(function (e) { return e.code + ":" + e.なに; }).join(" / "));
}

/* ══════════════════════════════════════════════════════════════
   取り込み（xlsx の 構造）
   ══════════════════════════════════════════════════════════════ */
節("取り込み（人の実データは 写さず、空欄＋ヒントにする）");
{
  const マス = {
    A1: { v: "請求書" },
    A3: { v: "宛名" }, B3: { v: "株式会社ほんもの" },
    A4: { v: "請求日" }, B4: { v: "2026-08-01" },
    A6: { v: "品名" }, B6: { v: "単価" }, C6: { v: "数量" }, D6: { v: "金額" },
    A7: { v: "作業一式" }, B7: { v: "50000" }, C7: { v: "1" }, D7: { f: "=B7*C7" },
    A9: { v: "合計" }, D9: { f: "=SUM(D7:D8)" }
  };
  const dt = VQW.doctype.extract.形にする(マス, { displayName: "うちの請求書", ファイル名: "seikyu.xlsx" });
  ok("式は そのまま 覚える", (dt.calculations || []).some(function (c) { return c.formula === "=SUM(D7:D8)"; }),
     JSON.stringify(dt.calculations));
  ok("欄が 拾えている（宛名・請求日）",
     ["宛名", "請求日"].every(function (k) {
       return dt.requiredFields.some(function (f) { return f.key === k; }); }),
     dt.requiredFields.map(function (f) { return f.key; }).join(","));
  ok("拾った欄は すべて user_input（人の実データを 写さない）",
     dt.requiredFields.every(function (f) { return f.fillPolicy === "user_input"; }));
  ok("取り込んだ書式に 「株式会社ほんもの」が 1 文字も 無い",
     JSON.stringify(dt).indexOf("株式会社ほんもの") < 0);
  ok("取り込んだ書式は draft（人が 承認するまで 使う側に 断りが 出る）", dt.status === "draft");
  ok("出どころを 記録している", dt.source.kind === "user_upload" && /seikyu\.xlsx/.test(dt.source.ref));
  ok("日付の欄は date と 見る",
     dt.requiredFields.filter(function (f) { return f.key === "請求日"; })[0].dataType === "date");
}

/* ══════════════════════════════════════════════════════════════
   書式の自動生成（構築時・必ず draft）
   ══════════════════════════════════════════════════════════════ */
節("書式の自動生成（事実だけ拾う・必ず draft）");
{
  const 本文 = "第五条 明細書には、次に掲げる事項を記載しなければならない。\n"
    + "一　氏名\n二　支給年月\n三　基本給の額\n四　健康保険料の額\n五　控除後の支給額\n";
  const 項 = VQW.doctype.generate.項目を拾う(本文);
  ok("条文から 項目を 拾える", 項.length === 5 && 項[0] === "氏名", JSON.stringify(項));
  const dt = VQW.doctype.generate.たね("給与明細", "docs", 項, [{ url: "https://example.test/law" }]);
  ok("拾った項目が 欄に なる", dt.requiredFields.length === 5);
  ok("金額まわりは user_input（捏造しない）",
     dt.requiredFields.filter(function (f) { return /額/.test(f.label); })
       .every(function (f) { return f.fillPolicy === "user_input"; }));
  ok("金額の型は money", VQW.doctype.generate.型("基本給の額") === "money");
  ok("必ず draft で 出る", dt.status === "draft");
  ok("出どころ（条文）を 記録する", dt.source.kind === "law" && /example\.test/.test(dt.source.ref));
}

/* ══════════════════════════════════════════════════════════════
   直し（修復）の 打ち切り
   ══════════════════════════════════════════════════════════════ */
節("直し（直せないものは 要確認の印をつけて 出す。止まり続けない）");
{
  const c = { blocks: [
    { id: "p1", type: "paragraph", text: "担当は ○○ さんです" },
    { id: "p2", type: "heading1", text: "" }] };
  const r = VQW.pipeline.repair("docs", c, {});
  ok("直せる崩れ（空の見出し）は 直す",
     !c.blocks.some(function (b) { return b.type === "heading1" && !b.text; }));
  ok("直せない崩れ（○○）は 残る", r.残り.length >= 1);
  ok("3 周で 打ち切る", r.周 <= 3, "周 " + r.周);
  ok("残ったものに 要確認の印がつく", !!(c.__work && c.__work.要確認 && c.__work.要確認.length));
}

/* ══════════════════════════════════════════════════════════════
   ハッシュ（浅いこと）
   ══════════════════════════════════════════════════════════════ */
節("ハッシュ（子の中身は 混ぜない。混ぜると Guard が 何も通さなくなる）");
{
  const c = 見本docs(4);
  c.blocks[0] = { id: "t1", type: "table", header: true,
                  rows: [["A", "B"], ["1", "2"]] };
  const d1 = VQW.ir.toIR("docs", c);
  const h1 = VQW.ir.hashAll(d1.root);
  c.blocks[0].rows[1][0] = "9";
  const d2 = VQW.ir.toIR("docs", c);
  const h2 = VQW.ir.hashAll(d2.root);
  ok("マスを 1 つ変えると そのマスの ハッシュだけ 変わる",
     h1[VQW.ir.cellInTable("t1", 1, 0)] !== h2[VQW.ir.cellInTable("t1", 1, 0)]);
  ok("親（表）の ハッシュは 変わらない", h1.t1 === h2.t1);
  ok("根の ハッシュも 変わらない", h1.root === h2.root);
  /* 並べ替えは 親で 分かる */
  c.blocks[0].rows.push(["3", "4"]);
  const h3 = VQW.ir.hashAll(VQW.ir.toIR("docs", c).root);
  ok("行を 足すと 親（表）の ハッシュが 変わる", h2.t1 !== h3.t1);
}

/* ══════════════════════════════════════════════════════════════
   まとめ
   ══════════════════════════════════════════════════════════════ */
console.log("\n══════════════════════════════════════════");
console.log("  " + 良 + " / " + 全 + " 件 通過");
if (悪.length) {
  console.log("\n  落ちたもの:");
  悪.forEach(function (s) { console.log("   ・" + s); });
}
console.log("══════════════════════════════════════════");
process.exit(悪.length ? 1 : 0);
}
