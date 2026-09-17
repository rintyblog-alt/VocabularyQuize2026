/* studio/tests/library.test.mjs — 左パネルと取り込みの「純粋な部分」だけを試す。
   DOM / IndexedDB が要る所（createLibrary / createImporter の中身）は Node で
   動かせないので、見分け・絞り込み・並べ替え・文言の組み立てを固める。 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  extOf, classifyFile, proxyPlan, progressText, ACCEPT, BIG_BYTES
} from "../src/ui/import.js";
import {
  countUses, unusedAssetIds, matchAsset, filterAssets, durLabel, scanLabel,
  normalizeRegistry, byGroup, LIB_TABS, KIND_LABEL
} from "../src/ui/library.js";

/* ── 取り込み: 見分け ─────────────────────────────────────────── */

test("extOf は拡張子だけを小文字で返す", () => {
  assert.equal(extOf("IMG_0001.MOV"), "mov");
  assert.equal(extOf("a.b.c.WebM"), "webm");
  assert.equal(extOf("名前なし"), "");
  assert.equal(extOf(".gitignore"), "");
  assert.equal(extOf(null), "");
});

test("accept は映像・画像・音の 3 つ", () => {
  assert.equal(ACCEPT, "video/*,image/*,audio/*");
});

test("classifyFile は mime から種類を決める", () => {
  const v = classifyFile({ name: "a.mp4", type: "video/mp4", size: 10 });
  assert.equal(v.kind, "video");
  assert.equal(v.reason, null);
  assert.equal(classifyFile({ name: "a.png", type: "image/png", size: 10 }).kind, "image");
  assert.equal(classifyFile({ name: "a.mp3", type: "audio/mpeg", size: 10 }).kind, "audio");
});

test("classifyFile は mime が空でも拡張子で当てる（iOS 対策）", () => {
  const a = classifyFile({ name: "movie.mov", type: "", size: 10 });
  assert.equal(a.kind, "video");
  assert.equal(a.reason, null);
  assert.match(a.note, /HEVC/);          // 端末次第である事を添える
});

test("classifyFile は開けない入れ物を日本語の理由で断る", () => {
  const mkv = classifyFile({ name: "a.mkv", type: "", size: 10 });
  assert.equal(mkv.kind, null);
  assert.match(mkv.reason, /mkv|Matroska/);
  const heic = classifyFile({ name: "IMG.HEIC", type: "image/heic", size: 10 });
  assert.equal(heic.kind, null);
  assert.match(heic.reason, /HEIC/);
  assert.match(heic.reason, /変換/);
});

test("classifyFile は中身が空のファイルを断る（iCloud 上の写真）", () => {
  const z = classifyFile({ name: "a.mp4", type: "video/mp4", size: 0 });
  assert.match(z.reason, /空/);
});

test("classifyFile は知らない物を種類つきで断る", () => {
  const x = classifyFile({ name: "notes.txt", type: "text/plain", size: 10 });
  assert.equal(x.kind, null);
  assert.match(x.reason, /notes\.txt/);
});

/* ── 取り込み: 重い素材の見立て ────────────────────────────────── */

test("proxyPlan は 300MB 超と 4K 超を拾う", () => {
  assert.equal(proxyPlan({ size: 1024, width: 1920, height: 1080, kind: "video" }), null);
  const big = proxyPlan({ size: BIG_BYTES + 1, width: 1920, height: 1080, kind: "video" });
  assert.equal(big.level, "warn");
  assert.equal(big.proxy, false);                 // 動画の代理は v1 では作らない
  assert.equal(big.why.length, 1);
  const wide = proxyPlan({ size: 10, width: 7680, height: 4320, kind: "image" });
  assert.equal(wide.proxy, true);                 // 画像は代理を作る
  assert.match(wide.message, /プロキシ/);
  assert.equal(proxyPlan({ size: BIG_BYTES + 1, width: 7680, height: 4320, kind: "video" }).why.length, 2);
});

test("progressText は件数と段を日本語で出す", () => {
  assert.match(progressText({ phase: "read", done: 0, total: 3, name: "a.mp4" }), /1 \/ 3 件/);
  assert.match(progressText({ phase: "store", done: 1, total: 3, name: "a.mp4" }), /保存/);
  assert.match(progressText({ phase: "analyze", done: 0, total: 1, name: "a.mp4" }), /解析/);
  assert.match(progressText({ phase: "done", done: 2, total: 2 }), /2 件/);
});

/* ── 左パネル: 使用回数と絞り込み ─────────────────────────────── */

const PRJ = {
  assets: [
    { id: "as_a", kind: "video", name: "海.mp4", duration: 12, createdAt: 3 },
    { id: "as_b", kind: "image", name: "空.png", duration: 0, createdAt: 1 },
    { id: "as_c", kind: "audio", name: "BGM.mp3", duration: 60, createdAt: 2 }
  ],
  tracks: [
    { id: "tr_1", clips: [
      { id: "cl_1", assetId: "as_a" },
      { id: "cl_2", assetId: "as_a" },
      { id: "cl_3", assetId: null, compound: { tracks: [{ id: "tr_in", clips: [{ id: "cl_4", assetId: "as_c" }] }] } }
    ] }
  ]
};

test("countUses は入れ子の中も数える", () => {
  assert.equal(countUses(PRJ, "as_a"), 2);
  assert.equal(countUses(PRJ, "as_c"), 1);
  assert.equal(countUses(PRJ, "as_b"), 0);
  assert.equal(countUses(PRJ, ""), 0);
  assert.equal(countUses(null, "as_a"), 0);
});

test("unusedAssetIds は使っていない物だけ", () => {
  assert.deepEqual(unusedAssetIds(PRJ), ["as_b"]);
});

test("matchAsset は名前・種類の部分一致（空の問いは全部当たる）", () => {
  assert.equal(matchAsset(PRJ.assets[0], ""), true);
  assert.equal(matchAsset(PRJ.assets[0], "海"), true);
  assert.equal(matchAsset(PRJ.assets[0], "mp4"), true);
  assert.equal(matchAsset(PRJ.assets[1], "画像"), true);     // 種類の表示名でも探せる
  assert.equal(matchAsset(PRJ.assets[0], "山"), false);
  assert.equal(matchAsset(PRJ.assets[0], "海 mp4"), true);   // 空白は AND
  assert.equal(matchAsset(null, "海"), false);
});

test("filterAssets は元の配列を壊さず、並べ替えできる", () => {
  const before = PRJ.assets.slice();
  const added = filterAssets(PRJ.assets, { sort: "added" });
  assert.deepEqual(added.map((a) => a.id), ["as_b", "as_c", "as_a"]);
  assert.deepEqual(PRJ.assets, before);                       // 破壊していない

  assert.deepEqual(filterAssets(PRJ.assets, { sort: "duration" }).map((a) => a.id), ["as_c", "as_a", "as_b"]);
  assert.deepEqual(filterAssets(PRJ.assets, { kind: "audio" }).map((a) => a.id), ["as_c"]);
  assert.deepEqual(filterAssets(PRJ.assets, { query: "空" }).map((a) => a.id), ["as_b"]);
  const uses = { as_a: 2, as_b: 0, as_c: 1 };
  assert.deepEqual(filterAssets(PRJ.assets, { sort: "uses", uses }).map((a) => a.id), ["as_a", "as_c", "as_b"]);
  assert.deepEqual(filterAssets(null, {}), []);
});

test("durLabel は画像を「静止画」と書く", () => {
  assert.equal(durLabel({ kind: "image", duration: 0 }), "静止画");
  assert.equal(durLabel({ kind: "video", duration: 0 }), "—");
  assert.equal(typeof durLabel({ kind: "video", duration: 12.3 }), "string");
  assert.equal(durLabel(null), "");
});

test("scanLabel は解析の状況を一言で（% つき）", () => {
  assert.equal(scanLabel({ status: "queued" }), "解析待ち");
  assert.equal(scanLabel({ status: "running", p: 0.4 }), "解析中 40%");
  assert.equal(scanLabel({ status: "done" }), "解析済");
  assert.equal(scanLabel({ status: "error" }), "解析できず");
  assert.equal(scanLabel(null), "");
});

/* ── 左パネル: 登録表の受け皿 ─────────────────────────────────── */

test("normalizeRegistry は配列でも地図でも受ける", () => {
  const fromMap = normalizeRegistry({ glitch: { label: "グリッチ", group: "壊す" }, shake: {} }, "効果");
  assert.deepEqual(fromMap.map((e) => e.id), ["glitch", "shake"]);
  assert.equal(fromMap[0].label, "グリッチ");
  assert.equal(fromMap[1].label, "shake");        // 名前が無ければ id を出す
  assert.equal(fromMap[1].group, "効果");          // 既定の分類に落ちる

  const fromArr = normalizeRegistry([{ type: "blur", name: "ぼかし" }, { type: "blur" }], "効果");
  assert.equal(fromArr.length, 1);                 // 同じ id は 1 つだけ
  assert.deepEqual(normalizeRegistry(null, "効果"), []);
  assert.deepEqual(normalizeRegistry(["a", "b"], "効果").map((e) => e.id), ["a", "b"]);
});

test("byGroup は現れた順にまとめる", () => {
  const g = byGroup([
    { id: "a", group: "壊す" }, { id: "b", group: "色" }, { id: "c", group: "壊す" }
  ]);
  assert.deepEqual(g.map((x) => x.group), ["壊す", "色"]);
  assert.deepEqual(g[0].items.map((x) => x.id), ["a", "c"]);
  assert.deepEqual(byGroup(null), []);
});

test("タブは依頼の 8 枚で、id が重複しない", () => {
  assert.equal(LIB_TABS.length, 8);
  assert.deepEqual(LIB_TABS.map((t) => t.id),
    ["media", "text", "audio", "sticker", "fx", "transition", "filter", "template"]);
  assert.equal(new Set(LIB_TABS.map((t) => t.id)).size, 8);
  assert.equal(KIND_LABEL.video, "映像");
});
