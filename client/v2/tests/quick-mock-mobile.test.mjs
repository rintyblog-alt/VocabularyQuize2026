/* 出題形式のチェック（94 形式・分類ごと）が、狭い画面で横スクロールを出さないか。

   見た目の話なので、**本物の CSS と本物のブラウザで測る**。
   ・markup は quick-mock.js が実際に出すもの（_typesPickerHtml）
   ・CSS は client/v2/ui/shell.css そのもの
   ・幅は 320 / 375 / 390 / 430（iPhone SE 〜 15 Pro Max）

   測るのは 2 つ。
     ① 中身の横幅（scrollWidth）が画面幅を超えていないか
     ② 1 つ 1 つのチェックが画面からはみ出していないか
   合計だけを見ると、1 個だけ長いものがあっても気づけないので両方見る。

   Playwright が無い環境では、確かめられないことを言って落とす（黙って通さない）。 */
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  installLocalStorage, installLocation, loadV2, V2,
  group, test, assert, assertEq, report
} from "./harness.mjs";

installLocalStorage();
installLocation("");
const VQ2 = loadV2([
  "qtypes", "qdescriptor", "schema", "qmodel", "validate", "adapter", "score-allocator",
  "grading", "evaluator", "blueprint", "answerability", "qplan", "capability", "flags"
].map((f) => "domain/" + f + ".js"));

const noop = () => "";
globalThis.document = { createElement: () => ({ style: {}, setAttribute() {}, addEventListener() {} }) };
VQ2.ui = {
  esc: (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])),
  /* 本物と同じ大きさの矢印を置く（幅の計算に効く） */
  icon: () => '<svg width="20" height="20" viewBox="0 0 20 20"></svg>',
  button: noop, field: noop, mount: noop, on: noop, badge: noop, statusChip: noop,
  AiChat: function () {}
};
new Function(readFileSync(join(V2, "ui/quick-mock.js"), "utf8")).call(globalThis);

const QM = VQ2.quickMock;
const CSS = readFileSync(join(V2, "ui/shell.css"), "utf8");
/* 全分類を開いた状態＝いちばん横に並ぶ数が多い状態で測る。 */
const HTML = QM._typesPickerHtml(QM._typeGroups({ multiple_choice_single: true, true_false: true }),
                                 () => true);

/* トークン（--vq-*）はアプリ側の :root にある。ここでは実寸に近い値を置く。
   本文の文字を実際より大きめ（15px）にしてあるので、判定は本番より厳しい。 */
const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<style>
:root{--vq-border-subtle:#e2e5ea;--vq-bg-elevated:#fff;--vq-accent:#2b70ef;--vq-accent-subtle:#eaf1ff;
--vq-accent-text:#1a40b5;--vq-r-full:999px;--vq-r-lg:12px;--vq-tap-min:44px;--vq-text:#1f2733;
--vq-text-tertiary:#6b7684;--vq-surface-hover:#f5f6f8;--vq-focus-ring:2px solid #2b70ef;
--vq-type-body-sm:15px/1.6 sans-serif;--vq-type-caption:13px/1.5 sans-serif;
--vq-dur-fast:.15s;--vq-ease-standard:ease}
html,body{margin:0;padding:0}
${CSS}
#wrap{padding:16px}
</style></head><body><div id="wrap">${HTML}</div></body></html>`;

const dir = mkdtempSync(join(tmpdir(), "vq2-qm-mobile-"));
const file = join(dir, "picker.html");
writeFileSync(file, PAGE, "utf8");

let chromium = null;
try { ({ chromium } = await import("playwright")); } catch (e) { chromium = null; }

group("狭い画面で横スクロールを出さない（出題形式のチェック）");

if (!chromium) {
  test("Playwright が無いので確かめられない", () => {
    assert(false, "playwright が入っていないため、横スクロールを確かめられませんでした");
  });
} else {
  const browser = await chromium.launch();
  const results = [];
  for (const w of [320, 375, 390, 430]) {
    const page = await browser.newPage({ viewport: { width: w, height: 800 } });
    await page.goto("file://" + file);
    results.push(await page.evaluate(() => ({
      docW: document.documentElement.scrollWidth,
      viewW: document.documentElement.clientWidth,
      boxes: [...document.querySelectorAll(".vq2-tog")].length,
      worst: [...document.querySelectorAll(".vq2-tog, .vq2-acc-h")]
        .reduce((a, el) => Math.max(a, Math.ceil(el.getBoundingClientRect().right)), 0)
    })));
    await page.close();
  }
  await browser.close();

  [320, 375, 390, 430].forEach((w, i) => {
    const r = results[i];
    test(w + "px：ページ全体が横にはみ出さない", () => {
      assertEq(r.docW, r.viewW, "内容の幅 " + r.docW + "px / 画面 " + r.viewW + "px");
    });
    test(w + "px：どのチェックも画面の外へ出ない", () => {
      assert(r.worst <= r.viewW, "いちばん右のチェックが " + r.worst + "px（画面 " + r.viewW + "px）");
    });
  });
  /* 一覧が 5 件しか無ければ、そもそも横に溢れようがない。
     「少ないから通った」を防ぐため、実際に 90 件以上を並べて測ったことを確かめる。 */
  test("測ったのは本物の一覧（90 形式以上を並べて測っている）", () => {
    assertEq(results[0].boxes, QM._mockTypeIds().length,
      "測った一覧が画面へ出す一覧と違う");
    assert(results[0].boxes >= 90, "並べたチェックが " + results[0].boxes + " 件しかない");
  });
}

process.exit(report("Quick Mock 出題形式チェックの狭い画面") ? 1 : 0);
