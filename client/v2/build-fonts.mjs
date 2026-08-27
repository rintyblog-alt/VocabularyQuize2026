/* ══════════════════════════════════════════════════════════════════════
   同梱する書体をそろえる

   何をするか:
     1. catalog.fonts.json に並べた書体ぶん、Google Fonts の CSS を取る
     2. その中の woff2 を **全部この手元へ落とす**（client/fonts/files/）
     3. CSS の宛先を自分のところへ書き換え、書体ごとに 1 枚ずつ置く
        （client/fonts/css/<id>.css）
     4. 目録（client/fonts/manifest.json）を書く

   なぜこの形か:
     ・**端末に入っているかに左右されない**。実体を配るので必ずその形で出る。
     ・日本語は 1 書体 2.3MB あるが、Google の CSS は文字の範囲ごとに
       120 枚以上へ切り分けてある。その切り分けをそのまま持ってくるので、
       画面に出ている文字ぶんしか落ちてこない（実測で 1 画面 ~130KB）。
     ・書体ごとに CSS を分けてあるので、**選んだものだけ**読み込める。
       全部を 1 枚にすると、開くたびに数百 KB の CSS を読むことになる。

   使い方:
     node client/v2/build-fonts.mjs            … 足りないものだけ取ってくる
     node client/v2/build-fonts.mjs --force    … 取り直す
     node client/v2/build-fonts.mjs --dry      … 取らずに、何をするかだけ出す
   ══════════════════════════════════════════════════════════════════════ */
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const OUT = join(ROOT, "client", "fonts");
const FILES_DIR = join(OUT, "files");
const CSS_DIR = join(OUT, "css");
const CATALOG = join(HERE, "catalog.fonts.json");

const FORCE = process.argv.includes("--force");
const DRY = process.argv.includes("--dry");

/* Google Fonts は相手の見た目で返す形を変える。woff2 を返させるために
   最近のブラウザだと名乗る。ここを外すと古い形式（ttf）が返り、量が跳ね上がる。 */
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
  + "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function ensure(d) { if (!existsSync(d)) mkdirSync(d, { recursive: true }); }

/* 同じ実体を 2 度置かないための名前。gstatic の道筋の最後をそのまま使う。 */
function fileNameOf(url) {
  const m = /\/s\/([^/]+)\/([^/]+)\/([^/?]+)/.exec(url);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return url.split("/").pop().split("?")[0];
}

async function fetchText(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA } });
      if (r.ok) return await r.text();
      if (r.status === 400 || r.status === 404) return null;
    } catch (e) { /* 次で試す */ }
    await new Promise((s) => setTimeout(s, 400 * (i + 1)));
  }
  return null;
}
async function fetchBin(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA } });
      if (r.ok) return Buffer.from(await r.arrayBuffer());
    } catch (e) { /* 次で試す */ }
    await new Promise((s) => setTimeout(s, 400 * (i + 1)));
  }
  return null;
}

/* 一度にたくさん頼むと断られる。数を抑えて流す。 */
async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let at = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (at < items.length) {
      const i = at++;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

function gfUrl(family, weights, italic) {
  const fam = family.replace(/ /g, "+");
  const ws = (weights && weights.length ? weights : [400]).slice().sort((a, b) => a - b);
  if (italic) {
    const spec = ws.map((w) => `0,${w}`).concat(ws.map((w) => `1,${w}`)).join(";");
    return `https://fonts.googleapis.com/css2?family=${fam}:ital,wght@${spec}&display=swap`;
  }
  return `https://fonts.googleapis.com/css2?family=${fam}:wght@${ws.join(";")}&display=swap`;
}

/* ── ここから本体 ───────────────────────────────────────────── */
if (!existsSync(CATALOG)) {
  console.error("目録がありません: " + CATALOG);
  process.exit(1);
}
const catalog = JSON.parse(readFileSync(CATALOG, "utf8"));
const fonts = catalog.fonts || [];
console.log(`目録: ${fonts.length} 書体`);

ensure(OUT); ensure(FILES_DIR); ensure(CSS_DIR);

const manifest = { built: "", fonts: [] };
let totalBytes = 0, totalFiles = 0, reused = 0, failed = [];

for (const f of fonts) {
  const cssPath = join(CSS_DIR, f.id + ".css");
  if (!FORCE && existsSync(cssPath)) {
    /* 既にあるものは触らない。目録だけ作り直す。 */
    const txt = readFileSync(cssPath, "utf8");
    const n = (txt.match(/@font-face/g) || []).length;
    manifest.fonts.push({ id: f.id, family: f.family, group: f.group, label: f.label,
      note: f.note || "", generic: f.cssGeneric || "sans-serif", faces: n, css: `/fonts/css/${f.id}.css` });
    reused++;
    continue;
  }

  let css = null;
  let weights = (f.weights && f.weights.length) ? f.weights.slice() : [400];
  /* 太さが用意されていない書体は 400 番が返る。そのときは 400 だけで取り直す。 */
  for (const attempt of [weights, [400]]) {
    css = await fetchText(gfUrl(f.family, attempt, false));
    if (css && /@font-face/.test(css)) { weights = attempt; break; }
    css = null;
  }
  if (!css) { failed.push(f.family); console.log(`  × ${f.family} — 取れませんでした`); continue; }

  const urls = Array.from(new Set(css.match(/https:\/\/fonts\.gstatic\.com[^)'"]+/g) || []));
  if (!urls.length) { failed.push(f.family); console.log(`  × ${f.family} — 実体の宛先が無い`); continue; }

  if (DRY) {
    console.log(`  ${f.family}  @font-face ${(css.match(/@font-face/g) || []).length} 個 / 実体 ${urls.length} 個`);
    continue;
  }

  let got = 0, bytes = 0;
  await pool(urls, 12, async (u) => {
    const name = fileNameOf(u);
    const dest = join(FILES_DIR, name);
    if (existsSync(dest)) { bytes += statSync(dest).size; got++; return; }
    const buf = await fetchBin(u);
    if (!buf) return;
    writeFileSync(dest, buf);
    bytes += buf.length; got++; totalFiles++;
  });
  totalBytes += bytes;

  /* 宛先を自分のところへ書き換える。取れなかった実体が 1 つでもあれば、
     その面だけ落とす（宛先だけ書き換えて中身が無い、を作らない）。 */
  const kept = [];
  const faces = css.split(/(?=@font-face)/).filter((b) => /@font-face/.test(b));
  for (const b of faces) {
    const u = (b.match(/https:\/\/fonts\.gstatic\.com[^)'"]+/) || [])[0];
    if (!u) continue;
    const name = fileNameOf(u);
    if (!existsSync(join(FILES_DIR, name))) continue;
    kept.push(b.replace(u, `/fonts/files/${name}`));
  }
  if (!kept.length) { failed.push(f.family); console.log(`  × ${f.family} — 実体を落とせませんでした`); continue; }

  writeFileSync(cssPath,
    `/* ${f.label}（${f.family}）— VocabuQuiz 同梱。端末に入っていなくても使えます。 */\n`
    + kept.join("").trim() + "\n");
  manifest.fonts.push({ id: f.id, family: f.family, group: f.group, label: f.label,
    note: f.note || "", generic: f.cssGeneric || "sans-serif", faces: kept.length, css: `/fonts/css/${f.id}.css` });
  console.log(`  ✓ ${f.label.padEnd(22)} ${f.family.padEnd(26)} 面 ${String(kept.length).padStart(3)} / ${(bytes / 1024).toFixed(0)} KB`);
}

if (DRY) { console.log("\n（--dry のため何も書いていません）"); process.exit(0); }

manifest.built = new Date().toISOString();
writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 1));

/* 画面側が使う一覧。ここから作るので、目録と食い違わない。
   実体を落とせなかった書体は manifest に入っていない＝ここにも出ない。
   （一覧に並んでいるのに選ぶと変わらない、を作らないため） */
const dataJs = `/* ══════════════════════════════════════════════════════════════════════
   同梱している書体の一覧（build-fonts.mjs が作る。手で直さないこと）

   ここに並んでいるものは **すべて実体を配ってある**。
   端末に入っているかは関係なく、選べば必ずその形で出る。
   実体は /fonts/css/<id>.css を読み込んだ時点で効き始める。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var WP = VQ2.workplace || (VQ2.workplace = {});
  WP.fontData = ${JSON.stringify(manifest.fonts.map((f) => ({
    id: f.id, family: f.family, group: f.group, label: f.label,
    note: f.note, generic: f.generic, css: f.css
  })), null, 1)};
})(typeof window !== "undefined" ? window : globalThis);
`;
writeFileSync(join(ROOT, "client", "v2", "workplace", "fonts-data.js"), dataJs);

/* 置き場所ぜんぶの大きさ */
let diskBytes = 0, diskFiles = 0;
for (const n of readdirSync(FILES_DIR)) { diskBytes += statSync(join(FILES_DIR, n)).size; diskFiles++; }

console.log("\n── まとめ ──");
console.log(`  書体          ${manifest.fonts.length} 個（作り直し ${manifest.fonts.length - reused} / そのまま ${reused}）`);
console.log(`  実体          ${diskFiles} 個 / ${(diskBytes / 1024 / 1024).toFixed(1)} MB`);
console.log(`  今回落とした   ${totalFiles} 個 / ${(totalBytes / 1024 / 1024).toFixed(1)} MB`);
if (failed.length) console.log(`  取れなかった   ${failed.length} 個: ${failed.join(", ")}`);
console.log(`  目録          client/fonts/manifest.json`);
