/* ══════════════════════════════════════════════════════════════════════
   Learning Workspace V2 のビルド
   ・client/v2/ の各ファイルを 1 本にまとめ、client/index.html へ注入する。
   ・注入は冪等。既存の <script id="vq2-app"> を除いてから入れ直す。
   ・既存の build.mjs（vq-* ブロック）には一切触らない。
   ・ロールバック: node client/v2/build-v2.mjs --remove で注入を取り除く。
   ══════════════════════════════════════════════════════════════════════ */
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { createHash } from "node:crypto";

import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const TARGET = join(ROOT, "client", "index.html");
const BLOCK_ID = "vq2-app";
const REMOVE = process.argv.includes("--remove");

/* ── 読み込み順。依存の順序をここが唯一の正とする。 ── */
const FILES = [
  /* V3 の形式レジストリ。依存が無く、schema.js が形式の一覧を
     ここから取り込むので **いちばん先に** 読む。
     後ろに置くと、新しい形式が保存前の検証で弾かれる。 */
  "domain/qtypes.js",
  /* AI へ渡す「形式の説明」。qtypes だけに依存する。 */
  "domain/qdescriptor.js",
  "domain/schema.js",
  "domain/qmodel.js",
  "domain/validate.js",
  "domain/adapter.js",
  "domain/score-allocator.js",
  "domain/grading.js",
  /* 採点の一元化。grading.js（既存の採点）へ委譲するので後ろに読む。 */
  "domain/evaluator.js",
  /* 問題を作る前に「何を作るか」を決める層（要件・教材解析・候補・配分）。
     qplan.js が配分の決まりごとをここから引くので、前に読む。 */
  "domain/blueprint.js",
  /* 解けるか・点をつけられるか。qplan.js が取り込みのときに使う。 */
  "domain/answerability.js",
  /* 出題形式の配分と AI 出力の取り込み。draft.js が使うので前に読む。 */
  "domain/qplan.js",
  "domain/draft.js",
  /* 検証エラーの AI 修復。validate.js と draft.js のあとに読む。 */
  "domain/repair.js",
  "domain/mock-builder.js",
  /* 試験コンパイラ V2。枠（大問・設問数・配点・番号）を **コードが先に決め**、
     AI には 1 問ぶんの中身だけを頼む。mock-builder / score-allocator を使うので後に読む。
     画面へ入れるかは flags.quickMockCompilerV2 が決める（既定 ON）。 */
  "domain/mock-compiler.js",
  "domain/mock-compile-run.js",
  "domain/history.js",
  "domain/flags.js",
  "domain/store.js",
  /* 学習プレイヤーの設定（クイズと VocabuSpeak が同じ入れ物から読む）。
     **store.js のあとに読む**（読み込みの時点で持ち主 ID の口を掴むため）。 */
  "domain/player-prefs.js",
  /* 問題数が足りないときの言い方と操作（理由ごとに違う） */
  "domain/shortfall.js",
  /* プリセット・ライブラリのデータ層。store.js のあとに読む（保存を読む）。 */
  "domain/library.js",
  /* 学習結果の統合と分析。store より後（保存領域を使う）。 */
  "domain/learning.js",
  "domain/analytics.js",
  /* 形式の実態（表示・採点・編集がそろっているか）。UI より前でよい（引くのは呼ばれたとき）。 */
  "domain/capability.js",
  /* AI の仕事の台帳（途中結果を捨てない・失敗した場所からやり直す） */
  "domain/aijob.js",
  /* クラウド側（Workers AI）で問題を作る実行体。aijob のあと・ui/ai.js の前に読む。 */
  "domain/aigen.js",
  /* VocabuSpeak（英語）。qtypes → speak-model → select / content、
     store のあとに speak-history（保存を使う）。 */
  "domain/speak-model.js",
  "domain/speak-select.js",
  "domain/speak-content.js",
  "domain/speak-history.js",
  /* 発音の採点（聞き取り結果と目標文のつき合わせ）。speak-model のあと。 */
  "domain/pronounce.js",
  /* 会話シナリオの進行（固定分岐＋意図の見分け）。speak-model のあと。 */
  "domain/dialogue.js",
  "pdf/templates.js",
  /* 紙面レイアウトプロファイル。layout.js より前に読む（layout.js が参照する）。
     未選択のときは経路に入らないので、いまの Quick Mock の動きは変わらない。 */
  "pdf/layout-profiles.js",
  /* Layout Grammar V2（意味と実寸を分ける層）。
     layout.js より前に読む。未選択なら経路に入らない。 */
  "pdf/layout-grammar.js",
  "pdf/layout.js",
  "pdf/renderer.js",
  "pdf/inspector.js",
  /* Typst Renderer（document-renderer/ が唯一の正）。
     .typ の写しは cli/build-library.mjs が作る。
     Typst が入っていない端末では経路に入らない（準備中のまま）。 */
  "../../document-renderer/renderers/typst-escape.js",
  "../../document-renderer/renderers/typst-resolver.js",
  "../../document-renderer/renderers/typst-renderer.js",
  "../../document-renderer/typst/generated/library.js",
  "../../document-renderer/renderers/tex-escape.js",
  "../../document-renderer/renderers/tex-renderer.js",
  "ui/ai.js",
  /* 資料の分割アップロード。本体を要求 JSON へ載せないための口。
     shell.js より前に読む（添付まわりが参照する）。 */
  "ui/uploader.js",
  "ui/shell.js",
  /* 読み上げ（VOICEVOX / Kokoro）と、声を選ぶ画面。
     shell.js のあと（U.mount を使う）・各画面より前に読む。 */
  "ui/tts.js",
  "ui/voice-picker.js",
  /* 録音と聞き取り（ユーザーの声）。tts のあと・各画面より前。 */
  "ui/stt.js",
  /* 形式ごとの表示と回答。VQ2.ui / qtypes / qmodel / evaluator を使うので
     shell.js の後ろ・各画面より前に読む。 */
  "ui/question-renderer.js",
  /* 学習プレイヤーの共通の枠。quiz-player / speak より前に読む。 */
  "ui/player-shell.js",
  /* AI ワークスペースの土台と、アクティビティのタイムライン。
     shell.js（VQ2.ui）のあと・各画面より前に読む。両方が参照する。 */
  "ui/ai-workspace.js",
  "ui/ai-activity.js",
  /* 形式を選ぶ画面と、形式ごとの編集フォーム。preset-studio が使う。 */
  "ui/qtype-editor.js",
  "ui/preset-studio.js",
  /* VocabuSpeak（英語）。question-renderer と tts のあとに読む。 */
  "ui/speak.js",
  "ui/quiz-player.js",
  "ui/result-view.js",
  "ui/quick-mock.js",
  "ui/exam-workspace.js",
  "ui/feed-share.js",
  "ui/preset-publish.js",
  "ui/preset-detail.js",
  "ui/entry.js",
  /* ── Vocabu Workplace（Docs / Sheets / Slides / Forms）─────────────
     ui/shell.js（VQ2.ui.mount）と ui/ai.js（VQ2.ai.run）を使うので、
     必ずそれらのあとに読む。読み順はこの中でも依存どおりに並べてある。 */
  "workplace/css.js",
  /* 同梱している書体の一覧（build-fonts.mjs が作る）。
     ui-shell.js が読み込みの時点で参照するので、**その前に**読む。 */
  "workplace/fonts-data.js",
  /* 紙面（用紙・向き・余白）と印刷 / PDF。ui-docs が使うので前に読む。 */
  "workplace/paper.js",
  "workplace/model.js",
  "workplace/store.js",
  "workplace/formula.js",
  "workplace/chart.js",
  "workplace/ui-shell.js",
  "workplace/templates.js",
  /* AI の出力を「そのまま使える形」にする層。ai.js が使うので前に読む。 */
  "workplace/ai-format.js",
  "workplace/ai.js",
  "workplace/convert.js",
  "workplace/settings.js",
  "workplace/forms-fields.js",
  "workplace/ui-forms-public.js",
  "workplace/ui-docs.js",
  "workplace/ui-sheets.js",
  "workplace/ui-slides.js",
  "workplace/ui-forms.js",
  "workplace/ui-home.js",
  "workplace/entry.js"
];

/* 既存のブロックを取り除く。
   ★ 2026-08-18 から、この束は **中身をここへ書かず、外のファイルへ出す**。
     そのため <script id="vq2-app">…</script>（昔の形）だけでなく
     <script id="vq2-app" src="/js/vq2-app.xxxx.js"></script>（今の形）も
     取り除けるようにしてある。片方しか消せないと 2 本入って二重に動く。 */
function stripBlock(html, id, tag = "script") {
  const 外 = new RegExp(`<${tag} id="${id}" src="[^"]*"></${tag}>\\n?`);
  if (外.test(html)) return { html: html.replace(外, ""), removed: true };
  const open = `<${tag} id="${id}">`;
  if (!html.includes(open)) return { html, removed: false };
  const s = html.indexOf(open);
  const close = `</${tag}>`;
  const e = html.indexOf(close, s);
  if (e < 0) throw new Error(`既存の ${id} ブロックに閉じタグがありません`);
  return { html: html.slice(0, s) + html.slice(e + close.length).replace(/^\n/, ""), removed: true };
}

/* 古い vq2-app.<指紋>.js を片づける（溜まると配信物が太る） */
function 古いのを消す(dir, 残す) {
  if (!existsSync(dir)) return 0;
  let n = 0;
  for (const f of readdirSync(dir)) {
    if (/^vq2-app\.[0-9a-f]{10}\.js$/.test(f) && f !== 残す) { unlinkSync(join(dir, f)); n++; }
  }
  return n;
}

let html = readFileSync(TARGET, "utf8");

/* いま配っている束の大きさを **取り除く前に** 測っておく。
   （下の「縮んだら止める」で使う。stripBlock のあとでは もう測れない） */
const 前バイト = (() => {
  /* ① いまの形: <script id="vq2-app"> の中の読み込み口が
        var 道 = "/js/vq2-app.<指紋>.js" で 本体を指している。
        **読み込み口そのものは 2.7KB しかない**ので、ここを測ると
        「縮んでいない」と誤判定して 歯止めが利かなくなる。
        必ず 指している先のファイルを測ること。 */
  const 指す = /var 道 = "\/js\/(vq2-app\.[0-9a-f]{10}\.js)"/.exec(html);
  if (指す) {
    const f = join(HERE, "..", "js", 指す[1]);
    return existsSync(f) ? Buffer.byteLength(readFileSync(f, "utf8"), "utf8") : 0;
  }
  /* ② ひとつ前の形: src で直に読んでいた */
  const m = /<script id="vq2-app" src="\/js\/(vq2-app\.[0-9a-f]{10}\.js)"><\/script>/.exec(html);
  if (m) {
    const f = join(HERE, "..", "js", m[1]);
    return existsSync(f) ? Buffer.byteLength(readFileSync(f, "utf8"), "utf8") : 0;
  }
  /* ③ さらに前の形: 中身が index.html に 直に入っていた */
  const o = html.indexOf('<script id="vq2-app">');
  if (o < 0) return 0;
  const e = html.indexOf("</script>", o);
  return e > 0 ? Buffer.byteLength(html.slice(o + '<script id="vq2-app">'.length, e), "utf8") : 0;
})();

if (REMOVE) {
  const r = stripBlock(html, BLOCK_ID);
  if (!r.removed) { console.log("注入されていません。変更はありません。"); process.exit(0); }
  古いのを消す(join(ROOT, "client", "js"), "");
  writeFileSync(TARGET, r.html);
  console.log("V2 の注入を取り除きました（V1 のみの状態に戻りました）。");
  process.exit(0);
}

/* ── 1) CSS を組み立てる（Bloom トークン[ライト] → :host ＋ 共通 CSS） ── */
const tokensSrc = readFileSync(join(ROOT, "ui-studio", "src", "ui", "styles", "tokens.css"), "utf8");
const rootBlocks = tokensSrc.match(/:root\s*\{[\s\S]*?\n\}/g) || [];
if (rootBlocks.length < 1) throw new Error("tokens.css から :root ブロックを取得できませんでした");
const hostTokens = rootBlocks.map((b) => b.replace(/:root\s*\{/, ":host {")).join("\n");

/* ダークの値も持ってくる。:root[data-theme="dark"] は上の正規表現に当たらないので
   別に取り出す。ここを入れないと V2 の画面（プリセット作成 / Quick Mock /
   出題 / 結果）だけが、本体がダークでも白いままになる。
   影の DOM の中へは外の :root が届かないので、host 自身に属性を付けて効かせる。 */
const darkBlocks = tokensSrc.match(/:root\[data-theme="dark"\]\s*\{[\s\S]*?\n\}/g) || [];
if (darkBlocks.length < 1) throw new Error("tokens.css からダークのトークンを取得できませんでした");
const hostDark = darkBlocks
  .map((b) => b.replace(/:root\[data-theme="dark"\]\s*\{/, ':host([data-theme="dark"]) {'))
  .join("\n");
const densityBlocks = tokensSrc.match(/:root\[data-density="compact"\]\s*\{[\s\S]*?\n\}/g) || [];
const hostDensity = densityBlocks
  .map((b) => b.replace(/:root\[data-density="compact"\]\s*\{/, ':host([data-density="compact"]) {'))
  .join("\n");

const shellCss = readFileSync(join(HERE, "ui", "shell.css"), "utf8");
const CSS = [
  "/* VocabuQuiz Learning Workspace V2 — self-contained styles */",
  ":host { color-scheme: light; }",
  ':host([data-theme="dark"]) { color-scheme: dark; }',
  hostTokens,
  hostDensity,
  /* ダークはライトのあと。同じ強さなら後ろが勝つ。 */
  hostDark,
  shellCss
].join("\n\n");
console.log(`ダークのトークン: ${darkBlocks.length} ブロック / ${hostDark.length} バイト`);

{
  const ob = (CSS.match(/\{/g) || []).length, cb = (CSS.match(/\}/g) || []).length;
  if (ob !== cb) throw new Error(`CSS の波括弧が不均衡です: { ${ob} } ${cb}`);
  console.log(`CSS: 波括弧 OK（${CSS.length} バイト）`);
}

/* ── 2) JS を結合する ── */
const parts = [];
let missing = [];
for (const f of FILES) {
  const p = join(HERE, f);
  if (!existsSync(p)) { missing.push(f); continue; }
  let src = readFileSync(p, "utf8");
  if (f === "ui/shell.js") {
    if (!src.includes('"__VQ2_CSS__"')) throw new Error("shell.js に __VQ2_CSS__ のプレースホルダがありません");
    src = src.replace('"__VQ2_CSS__"', JSON.stringify(CSS));
  }
  /* Workplace の CSS。mount({css}) へ渡すので、共通 CSS とは別に持つ。 */
  if (f === "workplace/css.js") {
    if (!src.includes('"__VQ2_WP_CSS__"')) throw new Error("workplace/css.js に __VQ2_WP_CSS__ のプレースホルダがありません");
    const wpCss = readFileSync(join(HERE, "workplace", "workplace.css"), "utf8");
    const ob = (wpCss.match(/\{/g) || []).length, cb = (wpCss.match(/\}/g) || []).length;
    if (ob !== cb) throw new Error(`workplace.css の波括弧が不均衡です: { ${ob} } ${cb}`);
    console.log(`Workplace CSS: 波括弧 OK（${wpCss.length} バイト）`);
    src = src.replace('"__VQ2_WP_CSS__"', JSON.stringify(wpCss));
  }
  parts.push(`/* ───────── ${f} ───────── */\n${src}`);
}
if (missing.length) console.log("（未作成のためスキップ）" + missing.join(", "));

const bundle = [
  "/* ══════════════════════════════════════════════════════════════",
  "   VocabuQuiz Learning Workspace V2",
  "   client/v2/ から自動生成。直接編集しないこと。",
  "   再生成: node client/v2/build-v2.mjs",
  "   取り外し: node client/v2/build-v2.mjs --remove",
  "   ══════════════════════════════════════════════════════════════ */",
  "(function(){",
  '"use strict";',
  parts.join("\n\n"),
  "})();"
].join("\n");

/* ── 3) 構文検証（注入前に必ず） ── */
const outDir = join(HERE, "dist");
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
const asm = join(outDir, "vq2.assembled.js");
writeFileSync(asm, bundle);
execSync(`node --check ${JSON.stringify(asm)}`, { stdio: "pipe" });
console.log(`node --check: OK（${bundle.length} バイト / ${parts.length} ファイル）`);

/* ── 4) バックアップ（初回のみ） ── */
const bak = join(HERE, "dist", "index.beforeV2.bak.html");
if (!existsSync(bak) && !html.includes(`<script id="${BLOCK_ID}">`)) {
  copyFileSync(TARGET, bak);
  console.log("初回バックアップを作成: client/v2/dist/index.beforeV2.bak.html");
}

/* ── 5) 注入（</body> 直前・既存ブロックの後ろ） ── */
const r = stripBlock(html, BLOCK_ID);
html = r.html;
if (r.removed) console.log("既存の vq2-app ブロックを除去して入れ直します");

/* ══ 縮んだら止める（2026-08-18）══════════════════════════════════════
   いま配っている束は **client/v2/ から作り直せない**。
   index.html の中で 直に手が入ってきたためで、
     workplace/cmd.js（156KB）・ui/timer.js・domain/timer.js・domain/genrun.js
   は **ディスクに 1 つも無い**。ここで素直に入れ直すと、その分が
   まるごと 消えたものが 本番へ出る（実際に 591KB 減った）。

   なので「前より小さくなったら 止まる」。
   本当に減らしたいときだけ --force を付ける。 */
{
  const 今バイト = Buffer.byteLength(bundle, "utf8");
  if (前バイト && 今バイト < 前バイト * 0.98 && !process.argv.includes("--force")) {
    console.error("");
    console.error("  ✗ 止めました。作り直した束が **今より小さい**。");
    console.error(`     いま: ${前バイト} バイト → 作った: ${今バイト} バイト（${前バイト - 今バイト} バイト減）`);
    console.error("");
    console.error("     client/v2/ の元ファイルが 実物より 古い可能性が高い。");
    console.error("     このまま入れると、その差ぶんの機能が 本番から 消える。");
    console.error("     どうしても入れるなら --force を付ける。");
    console.error("");
    process.exit(1);
  }
  if (前バイト) console.log(`大きさ: ${前バイト} → ${今バイト} バイト`);
}

const idx = html.lastIndexOf("</body>");
if (idx < 0) throw new Error("</body> が見つかりません");

/* ══ 中身は **index.html へ入れず、外のファイルへ出す**（2026-08-18）═══════
   この束だけで 4.6MB ある。index.html へ入れると、画面を 1 文字直しただけで
   毎回 4.6MB を 取り直すことになる。外へ出して 名前に 中身の指紋を付けると、
   この束が 変わらない限り ブラウザは 1 バイトも 取りに行かない。
   読み込みの順番は 変わらない（src 付きの ふつうの <script> は
   インラインと同じで「その場で止まって その場で動く」）。 */
const 指紋 = createHash("sha256").update(bundle, "utf8").digest("hex").slice(0, 10);
const 出名 = `${BLOCK_ID}.${指紋}.js`;
const 置場 = join(ROOT, "client", "js");
if (!existsSync(置場)) mkdirSync(置場, { recursive: true });
writeFileSync(join(置場, 出名), bundle);
const 消した = 古いのを消す(置場, 出名);
if (消した) console.log(`古い ${BLOCK_ID}.*.js を ${消した} 本 片づけました`);

/* ★ 2026-08-18: 「起動が終わってから読む」形も作って 実測したが、
   起動の終わりは **認証の通信待ち**で決まっており、その裏で この束は
   すでに動き終えていた。あとから読む形にしても 起動おわりは
   5692ms 対 5483ms・2 回目 2118ms 対 2185ms（＝誤差）で、
   代わりに「VQ2 がまだ来ていない一瞬」が生まれるだけだった。
   なので **その場で読む**（インラインだった頃と同じ順番）。 */
html = html.slice(0, idx) + `<script id="${BLOCK_ID}" src="/js/${出名}"></script>\n` + html.slice(idx);
writeFileSync(TARGET, html);

console.log(`client/js/${出名} へ出し、index.html から読むようにしました。`);
console.log("有効化: ブラウザで ?vq2=all を付けて開く、または VQ2FLAGS.setAll(true)");
console.log("無効化: ?vq2=off、または VQ2FLAGS.setAll(false)");
