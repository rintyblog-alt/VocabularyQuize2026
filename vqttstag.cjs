/* ══════════════════════════════════════════════════════════════════════════
   vqttstag.cjs — 読み上げ原稿の タグ（2026-08-26）

   訴え:「プリセット編集画面の 読み上げ文章の ところから タグを 追加して、
          読み上げ部分に タグから 持って来れるように してほしい。
          音声を タグで 指定できたり（複数人 男女で 会話文の リスニングを
          作成するときなど）、感情とか 速さとかも タグで 指定できたり」
   訴え:「AI生成時にも、リスニングも含めた、タグ、読み上げの原稿にも
          対応させたほうが いいかも」

   ★ この検査が いちばん 見張りたいこと
     ① タグの 名前が **3 か所で そろっている**こと。
        ・client/core/tts/script.js（読み解く 本体）
        ・server/src/worker.js の AIGEN_SCRIPT_TAGS（AI へ 教える 文）
        ここが ずれると、AI が 書いた タグが 効かず、
        画面は それを **そのまま 読み上げる**（無言の 不具合）。
     ② 話し手が 男女 交互に なること。会話文の リスニングの 本体。
     ③ 知らない タグを **消さない**こと。消すと 書いた人が 気づけない。

   使いかた:
     node vqttstag.cjs            ← コードと 読み解きだけ（速い・サーバ不要）
     node vqttstag.cjs --通し     ← 画面まで（開発サーバが 要る）
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
require(path.join(根, "client", "core", "tts", "voices.js"));
require(path.join(根, "client", "core", "tts", "script.js"));
const SC = globalThis.VQSCRIPT;
const V = globalThis.VQVOICE;
const W = fs.readFileSync(path.join(根, "server", "src", "worker.js"), "utf8");
const A = fs.readFileSync(path.join(根, "js-src",
  fs.readdirSync(path.join(根, "js-src")).find((f) => /^vq2-app\./.test(f))), "utf8");

節("① 話し手（会話文の リスニング）");
{
  const r = SC.読む("[A] Hello.\n[B] Hi there.\n[C] Good morning.\n[D] Bye.");
  ok("4 人ぶん 分かれる", r.段.length === 4, r.段.map((x) => x.text));
  ok("★ 多人数として 見分ける", r.多人数 === true, r.多人数);
  const 性 = r.段.map((x) => V.性別(x.voice));
  ok("★ 男女が 交互に なる（A=女 B=男 C=女 D=男）",
     性.join(",") === "女,男,女,男", { 声: r.段.map((x) => x.voice), 性 });
  ok("同じ 札は 同じ 声に なる",
     SC.読む("[A] one\n[B] two\n[A] three").段.map((x) => x.voice).filter((v, i, a) => i !== 1).every((v, i, a) => v === a[0]),
     SC.読む("[A] one\n[B] two\n[A] three").段.map((x) => x.voice));
  const 旧 = SC.読む("A: Hello.\nB: Hi.");
  ok("★ 昔ながらの「A: …」も 話し手として 読む（前の 書きかたを 壊さない）",
     旧.多人数 === true && 旧.段.length === 2, 旧.段.map((x) => x.voice));
}

節("② 感情・効果・速さ・間");
{
  const r = SC.読む("[A][angry] You are late!\n[B] Sorry.");
  ok("感情が 段に 付く", /怒/.test(r.段[0].style || ""), r.段[0]);
  ok("★ 話し手が 変われば 感情は 戻る（B まで 怒らない）",
     !r.段[1].style, r.段[1]);
  const r2 = SC.読む("[怒り] ふざけるな。 まだ 怒っている。");
  ok("日本語の タグでも 通る", /怒/.test(r2.段[0].style || ""), r2.段[0]);
  const r3 = SC.読む("[sigh] やれやれ。 つぎ の 文。");
  ok("効果は その場かぎり（次の 文には かからない）",
     /ため息/.test(r3.段[0].style || "") , r3.段[0]);
  const r4 = SC.読む("[speed:0.85] ゆっくり 読む。");
  ok("速さが 効く", r4.段[0].speed === 0.85, r4.段[0]);
  const r5 = SC.読む("速さは [ゆっくり] こう も 書ける。");
  ok("「ゆっくり」でも 効く", r5.段.some((x) => x.speed === 0.85), r5.段);
  const r6 = SC.読む("まえ。[pause:800]あと。");
  ok("間（ま）が 入る", r6.段.some((x) => x.pauseMs === 800), r6.段);
  const r7 = SC.読む("まえ。[間:1]あと。");
  ok("★ 秒で 書いても 受ける（[間:1] = 1000ms）",
     r7.段.some((x) => x.pauseMs === 1000), r7.段);
  const r8 = SC.読む("[speed:9] だめな 数。");
  ok("おかしい 速さは 断って 警告を 出す",
     r8.段[0].speed === 1 && r8.警告.length > 0, { 段: r8.段[0], 警告: r8.警告 });
}

節("③ 声を 名指し・男女");
{
  const r = SC.読む("[voice:Charon] 低い 声。");
  ok("声を 名前で 指せる", r.段[0].voice === "Charon", r.段[0]);
  const r2 = SC.読む("[声:カロン] 日本語の 呼び名でも。");
  ok("日本語の 呼び名でも 当たる", r2.段[0].voice === "Charon", r2.段[0]);
  const r3 = SC.読む("[男] 男の 声。");
  ok("[男] で 男性の 声に なる", V.性別(r3.段[0].voice) === "男", r3.段[0]);
  const r4 = SC.読む("[女] 女の 声。");
  ok("[女] で 女性の 声に なる", V.性別(r4.段[0].voice) === "女", r4.段[0]);
  const r5 = SC.読む("[voice:ないよ] だれ？");
  ok("★ 無い 声は 黙って 変えず、警告を 出す", r5.警告.length > 0, r5.警告);
}

節("④ 知らない タグを 消さない");
{
  const r = SC.読む("[しらないタグ] 本文。");
  ok("★ 本文として 残す（消して 分からなくしない）",
     /\[しらないタグ\]/.test(r.段[0].text), r.段[0].text);
  ok("★ 警告に 出す", r.警告.length > 0, r.警告);
  ok("素の文でも 残る", /\[しらないタグ\]/.test(SC.素の文("[しらないタグ] 本文。")),
     SC.素の文("[しらないタグ] 本文。"));
  ok("知っている タグは 素の文から 消える",
     SC.素の文("[A][angry] やあ。") === "やあ。", JSON.stringify(SC.素の文("[A][angry] やあ。")));
}

節("⑤ タグが 無ければ これまでどおり");
{
  ok("ふつうの 文は タグ無しと 見なす", SC.タグがある("Hello, how are you?") === false);
  ok("タグが あれば 見つける", SC.タグがある("[A] Hello.") === true);
  ok("感情だけでも 見つける", SC.タグがある("[angry] Hey!") === true);
}

節("⑥ AI へ 教える タグと、読み解ける タグが そろっている");
{
  const i = W.indexOf("const AIGEN_SCRIPT_TAGS");
  ok("AI へ 教える 文が ある", i > 0);
  const 文 = i > 0 ? W.slice(i, W.indexOf("const AIGEN_VARIANTS", i)) : "";
  const 教えた = [...new Set((文.match(/\[([a-z_]+)(?::[0-9.]+)?\]/g) || [])
    .map((x) => x.replace(/[\[\]]/g, "").split(":")[0]))];
  ok("いくつか 教えている", 教えた.length >= 15, 教えた.length);
  const 読める = 教えた.filter((t) => {
    if (/^[A-D]$/i.test(t)) return true;
    if (/^(pause|speed)$/.test(t)) return true;
    const r = SC.読む("[" + t + "] x");
    return r.警告.length === 0;
  });
  ok("★ 教えた タグは **全部 読み解ける**（片方だけ 増やしていない）",
     読める.length === 教えた.length,
     { 読めない: 教えた.filter((t) => 読める.indexOf(t) < 0) });
}

節("⑦ サーバ: 段（せつ）を つないで 1 本に する");
{
  ok("段の 受け口が ある", /handleTtsSegments/.test(W));
  ok("segments を 見て 振り分ける", /Array\.isArray\(body\?\.segments\)/.test(W));
  ok("★ 段ごとに 声を 変えて 作る", /ttsGemini\(env, x\.text, x\.voice, note, x\.style\)/.test(W));
  ok("★ 言いかた（感情）を Gemini へ 渡す", /async function ttsGemini\(env, text, voice, note, style\)/.test(W));
  ok("WAV の 頭を 外して つなぐ", /function ttsWavBody/.test(W));
  ok("速さは 波形を 作り直して 変える", /function ttsResample/.test(W));
  ok("間は 無音で 作る", /function ttsSilence/.test(W));
  ok("★ 作れなかった 段の 数を 正直に 返す", /X-VQ-TTS-Missed/.test(W));
  ok("全部 作れなければ 断る（無音を つないで 成功と 言わない）",
     /だめ\.length >= 並\.filter\(\(x\) => x\.text\)\.length/.test(W));
}

節("⑧ AI 生成: リスニングを 作れる");
{
  ok("★ リスニング（音声選択）の 形式が ある", /listening_choice:/.test(W));
  ok("★ 書き取り（ディクテーション）の 形式が ある", /\n  dictation: \{/.test(W));
  ok("日本語の 言いかたでも 頼める",
     /alias: \["リスニング", "聞き取り", "音声選択"/.test(W));
  ok("★ 見本（shape）に script が 入っている（入れないと AI は 書かない）",
     /"script":"\[A\] Shall we meet/.test(W));
  ok("script が 無ければ 落とす", /script（読み上げる原稿）が無い/.test(W));
  ok("★ 選択肢の 数の 検査を 消していない", /choices が 4 個でない/.test(W));
  ok("答えを 読み上げさせない と 書いてある", /script に 答えを そのまま 言わせない/.test(W));
}

節("⑨ 画面: 原稿が 落ちずに 届く");
{
  ok("★ toClientShape が script を 通す", /out\.script = String\(q\.script\)/.test(A));
  ok("★ 原稿が あれば 音の 形式に 直す（再生ボタンが 出る）",
     /out\.type = "audio_choice"/.test(A) && /out\.type = "dictation"/.test(A));
  ok("声・速さも 通す", /out\.voice = String\(q\.voice\)/.test(A) && /out\.speed = Number\(q\.speed\)/.test(A));
}

節("⑩ 画面: 編集の タグ入れ");
{
  ok("★「タグを入れる」ボタンが ある", /data-act="script-tag"/.test(A));
  ok("試し聞きが ある", /data-act="script-try"/.test(A));
  ok("★ カーソルの 位置へ 差し込む（末尾に 足すだけでは 会話が 書けない）",
     /function 差し込む\(ta, 文\)/.test(A) && /setSelectionRange/.test(A));
  ok("タグの シートが ある", /function タグを選ぶ/.test(A));
  ok("★ タグの 一覧は 共有の 決めどころから 読む（画面に 手書きしない）",
     /var SC = root\.VQSCRIPT;\s*\n\s*if \(!SC \|\| !SC\.束\)/.test(A));
  ok("どう 読まれるかを 下に 出す", /function タグ棚/.test(A));
  ok("★ 段が あれば segments で 送る", /body: JSON\.stringify\(段\s*\n?\s*\? \{ segments: 段 \}/.test(A)
     || /\{ segments: 段 \}/.test(A));
}

節("⑪ 束に 入っている");
{
  const B = fs.readFileSync(path.join(根, "vqbundle.cjs"), "utf8");
  ok("★ core/tts/script.js が 並びに ある", /"\/core\/tts\/script\.js"/.test(B));
  const 束名 = fs.readdirSync(path.join(根, "client", "js")).find((f) => /^bundle-core\./.test(f));
  ok("★ 配っている 束に VQSCRIPT が 入っている",
     /VQSCRIPT/.test(fs.readFileSync(path.join(根, "client", "js", 束名), "utf8")));
}

(async () => {
  if (通し) {
    節("⑫ 本当に 音に なるか（サーバ）");
    try {
      const r = SC.読む("[A] Hello there.\n[B][gentle] Nice to meet you.\n[間:0.5][A][excited] Let us go!");
      const res = await fetch(BASE + "/api/tts/speak", {
        method: "POST",
        headers: { "content-type": "application/json",
                   authorization: "Bearer " + (process.env.VQ_TOKEN || "") },
        body: JSON.stringify({ segments: r.段 })
      });
      const ct = res.headers.get("content-type") || "";
      ok("200 で 音が 返る", res.status === 200 && /audio/.test(ct), { status: res.status, ct });
      ok("★ 2 つの 声で 鳴っている",
         String(res.headers.get("x-vq-tts-voice") || "").split(",").length >= 2,
         res.headers.get("x-vq-tts-voice"));
      ok("★ 作れなかった 段が 0", String(res.headers.get("x-vq-tts-missed") || "9") === "0",
         res.headers.get("x-vq-tts-missed"));
      const buf = new Uint8Array(await res.arrayBuffer());
      ok("WAV に なっている", buf[0] === 0x52 && buf[1] === 0x49, buf.slice(0, 4).join(","));
      ok("無音では ない（長さが ある）", buf.length > 40000, buf.length);
    } catch (e) {
      落++; 落ち.push("音を 引けない"); 印.push("  ❌ 音を 引けない: " + String(e && e.message).slice(0, 140));
    }
  } else {
    印.push("\n（--通し ＋ VQ_TOKEN=… で 本当に 音に なるかも 確かめます）");
  }
  console.log(印.join("\n"));
  console.log("\n══ 通った " + 済 + " / 落ちた " + 落 + " ══");
  if (落) console.log("落ちたもの:\n  - " + 落ち.join("\n  - "));
  process.exit(落 ? 1 : 0);
})();
