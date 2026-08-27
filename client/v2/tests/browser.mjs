/* ══════════════════════════════════════════════════════════════════════
   本物のブラウザで V2 の画面を開くための土台

   なぜ要るか:
     Quick Mock の「紙面デザインを選び直しても問題を作り直さない」や
     「狭い画面で横スクロールが出ない」は、**画面を実際に動かさないと**
     確かめられない。ソースを grep しても、押したときに何が起きるかは分からない。

   何をしているか:
     ・build-v2.mjs が持っている読み込み順（FILES）をそのまま読み取り、
       同じ順序で 1 本にまとめる。
       → dist/vq2.assembled.js を読まない。**古いビルドで通ってしまうのを防ぐ。**
     ・shell.js の "__VQ2_CSS__" を、build-v2.mjs と同じ手順で作った CSS に置き換える。
       → 見た目の検査（横スクロール）が本物の CSS で行える。

   Playwright が無い環境では null を返す。呼び側は「確かめられなかった」と
   はっきり落とすこと（黙って通さない）。
   ══════════════════════════════════════════════════════════════════════ */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { V2, ROOT } from "./harness.mjs";

/* build-v2.mjs の FILES 配列をそのまま取り出す（順序の出所を二重に持たない）。 */
export function bundleFiles() {
  const src = readFileSync(join(V2, "build-v2.mjs"), "utf8");
  const m = src.match(/const FILES = \[([\s\S]*?)\n\];/);
  if (!m) throw new Error("build-v2.mjs から FILES を取り出せませんでした");
  // eslint-disable-next-line no-new-func
  return new Function("return [" + m[1] + "]")();
}

/* build-v2.mjs と同じ手順で CSS を作る。 */
function buildCss() {
  const tokensSrc = readFileSync(join(ROOT, "ui-studio", "src", "ui", "styles", "tokens.css"), "utf8");
  const rootBlocks = tokensSrc.match(/:root\s*\{[\s\S]*?\n\}/g) || [];
  const hostTokens = rootBlocks.map((b) => b.replace(/:root\s*\{/, ":host {")).join("\n");
  const darkBlocks = tokensSrc.match(/:root\[data-theme="dark"\]\s*\{[\s\S]*?\n\}/g) || [];
  const hostDark = darkBlocks
    .map((b) => b.replace(/:root\[data-theme="dark"\]\s*\{/, ':host([data-theme="dark"]) {')).join("\n");
  const densityBlocks = tokensSrc.match(/:root\[data-density="compact"\]\s*\{[\s\S]*?\n\}/g) || [];
  const hostDensity = densityBlocks
    .map((b) => b.replace(/:root\[data-density="compact"\]\s*\{/, ':host([data-density="compact"]) {')).join("\n");
  return [
    ":host { color-scheme: light; }",
    ':host([data-theme="dark"]) { color-scheme: dark; }',
    hostTokens, hostDensity, hostDark,
    readFileSync(join(V2, "ui", "shell.css"), "utf8")
  ].join("\n\n");
}

/* いまの client/v2/ のソースから 1 本にまとめる（dist は読まない）。 */
export function buildBundle() {
  const css = buildCss();
  const parts = [];
  for (const f of bundleFiles()) {
    const p = join(V2, f);
    if (!existsSync(p)) continue;
    let src = readFileSync(p, "utf8");
    if (f === "ui/shell.js") src = src.replace('"__VQ2_CSS__"', JSON.stringify(css));
    parts.push(`/* ── ${f} ── */\n${src}`);
  }
  return '(function(){"use strict";\n' + parts.join("\n\n") + "\n})();";
}

export async function launch() {
  let chromium = null;
  try { ({ chromium } = await import("playwright")); } catch (e) { return null; }
  const browser = await chromium.launch();
  const bundle = buildBundle();
  return {
    browser,
    /* 1 枚の白紙に V2 を載せたページを返す。
       外部へは 1 バイトも出さない（すべて route で作り、それ以外は中止する）。
       about:blank ではなく **http の出所を与える**。
       出所が無いと localStorage が使えず、保存を通る道を確かめられない
       （実測: STORAGE_FULL になって MockSpec を 1 件も置けなかった）。 */
    async page(viewport) {
      const p = await browser.newPage({ viewport: viewport || { width: 1280, height: 900 } });
      const errors = [];
      p.on("pageerror", (e) => errors.push(String(e && e.message ? e.message : e)));
      await p.route("**/*", (route) => {
        const u = route.request().url();
        if (u === "http://vq2.test/") {
          return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8",
            body: "<!doctype html><html><head><meta charset=\"utf-8\">"
              + "<style>html,body{margin:0;padding:0}</style></head><body></body></html>" });
        }
        return route.abort();
      });
      await p.goto("http://vq2.test/");
      await p.addScriptTag({ content: bundle });
      p.__vqErrors = errors;
      return p;
    },
    close() { return browser.close(); }
  };
}
