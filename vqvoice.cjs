/* ══════════════════════════════════════════════════════════════════════════
   vqvoice.cjs — 読み上げの 声（2026-08-26）

   訴え:「リスニングの声の種類を 男女で 新たに追加させる。無料API ＋ 高品質」

   ★ この検査が いちばん 見張りたいこと
     声の 一覧は もともと **2 か所に 手で 書いてあった**。
       ・server/src/worker.js の LIVE_VOICES（サーバが 通す 名前）
       ・js-src/vq-settings-store.*.js の opts（画面で 選べる 名前）
     片方だけ 足すと liveVoiceOf が **黙って 既定へ 落とす**ので、
     「選べるのに 鳴らない／鳴るのに 選べない」という 無言の 不具合になる。
     → いまは サーバの TTS_VOICES が 唯一の 決めどころ。
       画面は /api/tts/voices を 読み、控えも 同じ 中身を 持つ。
       **その 3 つが ずれていないこと**を ここで 実測する。

   ★ もう 1 つ: 置き場所の 鍵に 声が 入っているか
     入っていないと、同じ文は 声を 変えても **前の声の音**が 返る。
     声を 増やす 工事の 前提なので、コードの 形で 見張る。

   使いかた:
     node vqvoice.cjs            ← コードの 形だけ（速い・サーバ不要）
     node vqvoice.cjs --通し     ← 画面まで（ローカルの開発サーバが要る）
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs");
const path = require("path");
const 通し = process.argv.includes("--通し");
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (通し && !/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

let 済 = 0, 落 = 0; const 印 = []; const 落ち = [];
function ok(名, 真, 補) {
  if (真) { 済++; 印.push("  ✅ " + 名 + (補 === undefined ? "" : "  " + 短(補))); }
  else { 落++; 落ち.push(名); 印.push("  ❌ " + 名 + (補 === undefined ? "" : "  " + 短(補))); }
}
function 短(v) { const s = typeof v === "string" ? v : JSON.stringify(v); return String(s).slice(0, 220); }
function 節(t) { 印.push("\n── " + t + " " + "─".repeat(Math.max(0, 56 - t.length))); }

const 根 = __dirname;
const W = fs.readFileSync(path.join(根, "server", "src", "worker.js"), "utf8");
const V = fs.readFileSync(path.join(根, "client", "core", "tts", "voices.js"), "utf8");
const S = fs.readFileSync(path.join(根, "js-src",
  fs.readdirSync(path.join(根, "js-src")).find((f) => /^vq-settings-store\./.test(f))), "utf8");

/* ── サーバの 一覧を 読み出す ─────────────────────────────── */
function 声を抜く(src, 印し) {
  const i = src.indexOf(印し);
  if (i < 0) return null;
  const j = src.indexOf("];", i);
  if (j < 0) return null;
  const 塊 = src.slice(i, j);
  const 出 = [];
  const re = /\{\s*id:\s*"([A-Za-z]+)"[^}]*?性:\s*"([男女])"[^}]*?hz:\s*(null|[0-9.]+)/g;
  let m;
  while ((m = re.exec(塊))) 出.push({ id: m[1], 性: m[2], hz: m[3] === "null" ? null : Number(m[3]) });
  return 出;
}

節("① 一覧が 3 か所で そろっている（無言の 不具合を 止める）");
const サ = 声を抜く(W, "const TTS_VOICES = [");
const 控 = 声を抜く(V, "var 控え = [");
ok("サーバに 声の 一覧（TTS_VOICES）が ある", !!サ && サ.length > 0, サ && サ.length);
ok("画面の 控え（core/tts/voices.js）が ある", !!控 && 控.length > 0, 控 && 控.length);
if (サ && 控) {
  ok("★ 数が 同じ", サ.length === 控.length, { サーバ: サ.length, 控え: 控.length });
  const サID = サ.map((x) => x.id).sort().join(",");
  const 控ID = 控.map((x) => x.id).sort().join(",");
  ok("★ 名前が そっくり 同じ（片方だけ 足していない）", サID === 控ID,
     { サだけ: サ.filter((x) => !控.some((y) => y.id === x.id)).map((x) => x.id),
       控だけ: 控.filter((x) => !サ.some((y) => y.id === x.id)).map((x) => x.id) });
  const 性ずれ = サ.filter((x) => { const y = 控.find((z) => z.id === x.id); return y && y.性 !== x.性; });
  ok("★ 男女も 同じ", 性ずれ.length === 0, 性ずれ);
  const hzずれ = サ.filter((x) => { const y = 控.find((z) => z.id === x.id); return y && y.hz !== x.hz; });
  ok("測った 高さも 同じ", hzずれ.length === 0, hzずれ.map((x) => x.id));
}

節("② 男女が そろっている（訴えの 中身）");
if (サ) {
  const 女 = サ.filter((x) => x.性 === "女"), 男 = サ.filter((x) => x.性 === "男");
  ok("★ 男女 どちらも 5 つ以上 ある", 女.length >= 5 && 男.length >= 5,
     { 女: 女.length, 男: 男.length });
  ok("★ 前より 増えている（もとは 5 つ）", サ.length > 5, サ.length);
  /* 男女は **測った 高さ**で 分けてある。決めつけていないことを ここで 固定する。 */
  const 女の変 = 女.filter((x) => x.hz !== null && x.hz < 165);
  const 男の変 = 男.filter((x) => x.hz !== null && x.hz >= 165);
  ok("★ 女性と 書いた 声は 実測 165Hz 以上", 女の変.length === 0, 女の変);
  ok("★ 男性と 書いた 声は 実測 165Hz 未満", 男の変.length === 0, 男の変);
  const 測った = サ.filter((x) => x.hz !== null).length;
  ok("ほとんどの 声は 高さを 実際に 測ってある", 測った >= サ.length - 1,
     { 測った: 測った, 全部: サ.length });
}

節("③ LIVE_VOICES は 一覧から 作る（手で 二重に 書かない）");
ok("★ LIVE_VOICES は TTS_VOICES から 作られている",
   /const LIVE_VOICES = TTS_VOICES\.map\(/.test(W));
ok("既定の 声が 一覧に ある",
   !!サ && サ.some((x) => x.id === (W.match(/const LIVE_VOICE_DEFAULT = "([A-Za-z]+)"/) || [])[1]));

節("④ 置き場所の 鍵に 声が 入っている（前の声が 返る 不具合）");
ok("★ ttsCacheKey が 声を 受け取る",
   /async function ttsCacheKey\(text, model, voice, lang\)/.test(W));
ok("★ 鍵の 中身に 声が 混ざっている",
   /String\(voice \|\| ""\)/.test(W.slice(W.indexOf("async function ttsCacheKey"),
     W.indexOf("async function ttsCacheKey") + 700)));
ok("★ 呼ぶ側も 声を 渡している", /ttsCacheKey\(text, pick\.model, voice, lang\)/.test(W));
ok("鳴らした 声を 返しの ヘッダに 出す", /X-VQ-TTS-Voice/.test(W));

節("⑤ 声の 一覧の 口（/api/tts/voices）");
ok("口が ある", /path === "\/api\/tts\/voices"/.test(W));
ok("知っている 道として 登録されている",
   (W.match(/\|\| path === "\/api\/tts\/voices"/g) || []).length >= 1);
ok("ログイン 無しでも 引ける（選択肢を 出すだけ）",
   !/handleTtsVoices[\s\S]{0,400}resolveAuthUser/.test(W));

節("⑥ Bridge の 声ID でも 男女を 落とさない");
ok("★ kokoro の ID から 性別を 読む口が ある", /function ttsVoiceFromBridgeId/.test(W));
ok("liveVoiceOf が それを 使う",
   /const b = ttsVoiceFromBridgeId\(t\);/.test(W));

節("⑦ 設定の 選択肢が サーバ由来（手書きの 5 つでは ない）");
ok("★ 設定は VQVOICE から 選択肢を 取る", /get opts\(\)[\s\S]{0,300}VQVOICE/.test(S));
ok("手書きの 5 つが 残っていない",
   !/opts: \[\["Kore", "コレ（女性・しっかり／既定）"\], \["Aoede"/.test(S));
ok("届いたら 描き直す", /vq-voices-updated/.test(S));

節("⑧ 束に 入っている");
const B = fs.readFileSync(path.join(根, "vqbundle.cjs"), "utf8");
ok("★ core/tts/voices.js が 束の 並びに ある", /"\/core\/tts\/voices\.js"/.test(B));
const 束名 = fs.readdirSync(path.join(根, "client", "js")).find((f) => /^bundle-core\./.test(f));
const 束 = fs.readFileSync(path.join(根, "client", "js", 束名), "utf8");
ok("★ 配っている 束に VQVOICE が 入っている", /VQVOICE/.test(束));

/* ══ 通しで 確かめる（サーバが 要る）══════════════════════════ */
(async () => {
  if (通し) {
    節("⑨ 本当に 口が 開いているか");
    try {
      const r = await fetch(BASE + "/api/tts/voices");
      const j = await r.json();
      ok("200 で 返る", r.status === 200, r.status);
      ok("★ サーバの 一覧と 数が 合う", サ && j.voices && j.voices.length === サ.length,
         { 口: j.voices && j.voices.length, コード: サ && サ.length });
      ok("男女の 数も 合う",
         j["女"] === (サ || []).filter((x) => x.性 === "女").length
         && j["男"] === (サ || []).filter((x) => x.性 === "男").length, { 女: j["女"], 男: j["男"] });
      ok("見せる 文（label）が 全部 付いている",
         (j.voices || []).every((v) => v.label && /（(女性|男性)/.test(v.label)),
         (j.voices || []).slice(0, 3));
    } catch (e) {
      落++; 落ち.push("口を 引けない"); 印.push("  ❌ 口を 引けない: " + String(e && e.message).slice(0, 120));
    }
  } else {
    印.push("\n（--通し を 付けると サーバの 口も 確かめます）");
  }
  console.log(印.join("\n"));
  console.log("\n══ 通った " + 済 + " / 落ちた " + 落 + " ══");
  if (落) console.log("落ちたもの:\n  - " + 落ち.join("\n  - "));
  process.exit(落 ? 1 : 0);
})();
