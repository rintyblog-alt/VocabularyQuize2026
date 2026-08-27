// dist-single/{index.html, app.js, app.css} を 1つの自己完結HTMLに畳み込む。
// 生成物はダブルクリック（file://）で開けるようにインライン<script>/<style>のみで構成する。
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const dir = resolve("dist-single");
let html = readFileSync(join(dir, "index.html"), "utf8");

const readAsset = (ref) => {
  const p = join(dir, ref.replace(/^\.\//, "").split(/[?#]/)[0]);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
};

// CSS: <link rel="stylesheet" ... href="..."> → <style>…</style>
html = html.replace(/[ \t]*<link\b[^>]*rel="stylesheet"[^>]*>\s*/gi, (tag) => {
  const href = /href="([^"]+)"/.exec(tag)?.[1];
  const css = href && readAsset(href);
  return css == null ? tag : `    <style>\n${css}\n</style>\n`;
});

// JS: <script ... src="..."></script> → <script type="module">…</script>
html = html.replace(/[ \t]*<script\b([^>]*)\bsrc="([^"]+)"([^>]*)>\s*<\/script>\s*/gi, (tag, pre, src, post) => {
  let js = readAsset(src);
  if (js == null) return tag;
  js = js.replace(/<\/(script)/gi, "<\\/$1"); // インライン<script>を閉じさせない
  const isModule = /type="module"/.test(pre + post);
  return `    <script${isModule ? ' type="module"' : ""}>\n${js}\n</script>\n`;
});

const out = resolve("VocabuQuiz-UI-Studio.html");
writeFileSync(out, html);

// 外部参照が残っていないか検証（data: と # は許容）
const leftover = [...html.matchAll(/\b(?:src|href)="([^"]+)"/gi)]
  .map((m) => m[1])
  .filter((u) => !/^(data:|#|https?:\/\/)/i.test(u));
console.log(`wrote ${out}  (${(html.length / 1024 / 1024).toFixed(2)} MB)`);
console.log(leftover.length ? `⚠ 外部参照が残存: ${leftover.join(", ")}` : "✓ 外部ファイル参照ゼロ（自己完結）");
