#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqwrite.cjs — 文章添削（校正モード）／資料から 書く（2026-08-31・訴え）。

   訴え:
     「どんな風に 仕上げるか、なども プロンプトで 指示したり、その プロンプト
       入力ボックスに 資料を 添付すると、そこの ファイルから 文章を 読み取って、
       そこから 必要事項の 記入欄の 事項なども 含めて、文章を 校正、または
       構成する だけでなく、生成する 文章を 作って ほしい」
     「AI らしい 文章を 作るのは やめて ほしい。抽象すぎず、具体的に」

   ★ ここで いちばん 見たい こと:
     **AI が 事実を でっち上げて いないか。**
     志望理由書で これを やると、面接で 答えられない。
     実測（直す 前）: 「異文化に 触れた」しか 書いて いない 文章から
       「アメリカへの 海外研修」「地域の ゴミ拾い活動」
       「二年生全員が 参加できる 長期留学制度」を **作って いた**。
     いまは 作らずに 【ここに 具体を 書く】の 札を 置く。

   使い方:
     node vqwrite.cjs        … 決まりだけ（AI なし）
     node vqwrite.cjs --実   … 実際に 添削・生成させて 数える
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs");
const path = require("path");
const BASE = process.env.VQ_API || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
const 実 = process.argv.indexOf("--実") >= 0;
if (実 && !/-dev\.|127\.0\.0\.1|localhost/.test(BASE)) { console.error("本番では 実行しません。"); process.exit(2); }
let 済 = 0, 落 = 0; const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 240) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 360) : "")); }
};
const SRC = fs.readFileSync(path.join(__dirname, "server/src/worker.js"), "utf8");
function 塊(名前) {
  const 頭 = SRC.indexOf("function " + 名前 + "(");
  let i = SRC.indexOf("{", 頭), d = 0, end = -1;
  for (; i < SRC.length; i++) { const c = SRC[i]; if (c === "{") d++; else if (c === "}") { d--; if (!d) { end = i + 1; break; } } }
  return SRC.slice(頭, end);
}
const 前 = SRC.slice(SRC.indexOf("const AI_WRITE_BAD ="), SRC.indexOf("function aiWriteBadWords(")) + "\n"
  + SRC.slice(SRC.indexOf("const AI_WRITE_NUM_RE ="), SRC.indexOf("function aiWriteInvented(")) + "\n";
// eslint-disable-next-line no-new-func
const 悪語 = new Function(前 + 塊("aiWriteBadWords") + "\nreturn aiWriteBadWords;")();
// eslint-disable-next-line no-new-func
const 作り = new Function(前 + 塊("aiWriteInvented") + "\nreturn aiWriteInvented;")();

節("① AI らしい 言い回しを 見つける");
見(悪語("さまざまな経験を通じて成長できました").length >= 1, "「さまざまな」を 見つける", 悪語("さまざまな経験を通じて成長できました"));
見(悪語("様々な価値観に触れた").length >= 1, "「様々な」（漢字）も 見つける");
見(悪語("多様な文化").indexOf("多様な") >= 0, "「多様な」も");
見(悪語("持続可能な社会の実現に貢献できる人材").length >= 2, "並んで いても 全部 見つける",
  悪語("持続可能な社会の実現に貢献できる人材"));
見(悪語("高校二年の夏に図書室で後輩に数学を教えた").length === 0,
  "★ 具体的な 文は **落とさない**（見つけすぎない）");
見(悪語("").length === 0, "空でも 落ちない");

節("② 作り話（元に 無い 数）を 見つける");
見(作り("海外研修に参加した", "三週間の海外研修に参加した").indexOf("三") >= 0,
  "★ 「三週間」を 作り話として 見つける", 作り("海外研修に参加した", "三週間の海外研修に参加した"));
見(作り("部長をしていた", "部員80名をまとめた").indexOf("80") >= 0,
  "★ 「80」を 見つける", 作り("部長をしていた", "部員80名をまとめた"));
見(作り("2年生のとき", "2年生のときに始めた").length === 0,
  "★ **元に ある 数は 作り話に しない**", 作り("2年生のとき", "2年生のときに始めた"));
見(作り("走った", "走った。とても楽しかった。").length === 0, "数が 無ければ 何も 出ない");
見(作り("1ゼミ8名までの少人数ゼミ", "1ゼミ8名までのゼミで学ぶ").length === 0,
  "★ 資料に ある 数は そのまま 使える");

節("③ サーバの 作り");
見(/path === "\/api\/ai\/write"/.test(SRC), "★ 口が ある（/api/ai/write）");
見(/\|\| path === "\/api\/ai\/write"/.test(SRC), "★ 大きい 本文を 受ける ように なって いる（資料つき）");
見(/mode === "compose"/.test(SRC), "★ **添削だけで なく 生成も できる**");
見(/資料は \*\*先に 読み取って 文字に する\*\*/.test(SRC),
  "★ 資料を 先に 文字に して、**書く ところは Live**（無制限の 枠）");
見(/liveOnce\(env, \{ sys: WRITE_SYS/.test(SRC), "★ まず Live を 通る");
見(/資料に あった 記入欄/.test(SRC), "★ **記入欄**を 読み取る");
見(/資料に 書いて ある 数・固有名詞/.test(SRC), "★ 資料の 数・固有名詞を 材料に する");
見(/その 人の 言い回しを 残します/.test(SRC), "添削は 本人の 言い回しを 残す");
見(/空欄の 札を 置きます/.test(SRC) || /空欄の 札に します/.test(SRC), "★ 作らずに **札**を 置く");
見(/invented: 作り, aiWords: 悪語/.test(SRC), "★ 残った ものを 隠さずに 返す（添削）");
見(/invented: 作2, aiWords: 悪2/.test(SRC), "★ 残った ものを 隠さずに 返す（生成）");
見(/function aiWriteAskFromSlots\(/.test(SRC), "★ 札から **聞く ことを こちらで 作る**");
見(/aigenFitLen\(draft, 上限\)/.test(SRC), "★ 字数を こちらで 押さえる");

節("④ 画面");
{
  const W = fs.readFileSync(path.join(__dirname, "js-src/vq-write.js"), "utf8");
  見(/window\.__vqWrite/.test(W), "画面が 口を 出す");
  見(/data-f="instruction"/.test(W), "★ **仕上がりの 指示**を 書く 欄が ある");
  見(/資料から 書く/.test(W), "★ 資料から 書く に 切り替えられる");
  見(/maxChars/.test(W), "字数を 決められる");
  見(/元の 文章に 無い 数が 残って います/.test(W), "★ **作り話を 画面で 赤く 出す**");
  見(/あなたに しか 書けない ところ/.test(W), "★ 空欄の 札の 数を 出す");
  見(/function 差分\(/.test(W), "差分を 自前で 出す（外の 部品を 借りない）");
  見(!/\*\*作りません\*\*/.test(W), "★ ** が そのまま 画面に 出ない");
  /* ★ **中で 使って いる 技術の 名前を 画面に 出さない**（2026-08-31・訴え）。
     Lumi の 人がらにも「Gemini や Google の 名前は 出しません」と 書いて ある のに、
     この 画面だけ 「Gemini Live（無制限）」と 出て いた。 */
  {
    const 見え = [];
    const re = /(["'])((?:(?!\1).){0,80}Gemini(?:(?!\1).){0,80})\1/g;
    let m;
    while ((m = re.exec(W))) {
      const 前 = W.slice(Math.max(0, m.index - 300), m.index);
      if (前.lastIndexOf("/*") > 前.lastIndexOf("*/")) continue;   /* コメントの 中は 除く */
      見え.push(m[2].slice(0, 60));
    }
    見(見え.length === 0, "★★ **画面に 「Gemini」の 字が 出ない**（Lumi AI と 出す）", 見え);
    見(/Lumi AI（無制限）/.test(W), "★ 「Lumi AI（無制限）」と 出る");
  }
  const H = fs.readFileSync(path.join(__dirname, "client/index.html"), "utf8");
  見(/data-vq-write="1"/.test(H), "★ サイドバーに 入口が ある");
  見(/id="vq-write" src="\/js\/vq-write\.[a-f0-9]+\.js"/.test(H), "★ 指紋つきで 読み込まれる");
}

async function 実測() {
  節("⑤ 実際に 添削させる（" + BASE + "）");
  const api = async (m, p, b, t) => {
    const h = { "Content-Type": "application/json" };
    if (t) h.Authorization = "Bearer " + t;
    const r = await fetch(BASE + p, { method: m, headers: h, body: b ? JSON.stringify(b) : undefined });
    let j = null; try { j = await r.json(); } catch (e) {}
    return { status: r.status, data: j };
  };
  const nick = "wt" + Date.now().toString(36).slice(-6);
  let reg = await api("POST", "/api/auth/register",
    { gradePrefix: "H1", nickname: nick, password: "DevGen#2026a", tosAccepted: true, tosVersion: "1" });
  let token = (reg.data && reg.data.token) || "";
  if (!token) {
    const a = await api("POST", "/api/auth/register/start",
      { email: nick + "@gmail.com", gradePrefix: "H1", nickname: nick, password: "DevGen#2026a" });
    const b = await api("POST", "/api/auth/register/verify",
      { challengeId: a.data && a.data.challengeId, code: a.data && a.data.devCode });
    const c = await api("POST", "/api/auth/register/consent",
      { registrationSession: b.data && b.data.registrationSession,
        agreeTerms: true, agreePrivacy: true, agreeAge: true, pin: "8306" });
    token = (c.data && c.data.token) || "";
  }
  if (!token) { 見(false, "検証アカウントを 作れない", reg.data); return; }

  const 文 = "私がこの大学を志望する理由は、将来国際的に活躍できる人材になりたいからだ。"
    + "高校のときに海外研修に参加して、異文化に触れたことがきっかけで、"
    + "世界には様々な価値観や考え方があることを知った。"
    + "また、この大学は留学制度も充実しており、語学力を高める環境が整っていると感じた。";
  const r1 = await api("POST", "/api/ai/write", {
    mode: "proofread", text: 文, kind: "志望理由書",
    instruction: "体験が 具体的に 伝わるように。", maxChars: 400
  }, token);
  const j1 = r1.data || {};
  console.log("     添削 " + (j1.ms / 1000 || 0).toFixed(1) + " 秒 / model=" + j1.model
    + " / 評価 " + j1.grade + " / " + j1.chars + "字 → " + j1.revisedChars + "字");
  見(r1.status === 200 && j1.revised, "添削が 返る", { status: r1.status, msg: j1.message });
  見(j1.model === "live", "★ **Live（無制限の 枠）を 通る**", j1.model);
  見(/^[ABCD]$/.test(String(j1.grade || "")), "評価が A〜D", j1.grade);
  見((j1.good || []).length >= 1 && (j1.improve || []).length >= 1, "良かった点・改善点が 返る",
    { good: (j1.good || []).length, improve: (j1.improve || []).length });
  見((j1.invented || []).length === 0, "★★ **作り話（元に 無い 数）が 残って いない**", j1.invented);
  見((j1.aiWords || []).length === 0, "★★ **AI らしい 言い回しが 残って いない**", j1.aiWords);
  const 札 = String(j1.revised || "").match(/【[^】]{1,40}】/g) || [];
  見(札.length >= 1, "★ 作らずに **空欄の 札**を 置いて いる", 札.slice(0, 5));
  見((j1.questions || []).length >= 1, "★ 本人に 聞きたい ことを 返す", j1.questions);

  節("⑥ 資料から 書かせる");
  const 資料 = "【○○大学 提出書類】\n1. 志望理由（400字以内）\n   本学のどの点に魅力を感じたかを書くこと。\n"
    + "【本学の特色】\n・2年次に全員が半年間の海外研修に参加する（提携校: 12か国 28校）\n"
    + "・少人数ゼミ（1ゼミ 8名まで）を1年次から履修できる\n・地域連携プロジェクトが必修（年間 40時間）";
  const r2 = await api("POST", "/api/ai/write", {
    mode: "compose", kind: "志望理由書", maxChars: 400,
    instruction: "高校で 吹奏楽部の 部長を していた 生徒として 書いて。ですます調。",
    files: [{ mimeType: "text/plain", data: Buffer.from(資料, "utf8").toString("base64") }]
  }, token);
  const j2 = r2.data || {};
  console.log("     生成 " + (j2.ms / 1000 || 0).toFixed(1) + " 秒 / model=" + j2.model
    + " / 読み取り " + j2.readCalls + " 回 / " + j2.chars + "字");
  見(r2.status === 200 && j2.draft, "資料から 書ける", { status: r2.status, msg: j2.message });
  見(j2.model === "live", "★★ **資料つきでも Live を 通る**（先に 読み取る ため）", j2.model);
  見((j2.fields || []).length >= 1, "★ **資料の 記入欄**を 読み取る", (j2.fields || []).map((f) => f.name));
  見(j2.chars <= 400, "★ 字数を 超えない", { 字: j2.chars, 上限: j2.maxChars });
  const 使 = ["12", "28", "8", "40"].filter((n) => String(j2.draft).indexOf(n) >= 0);
  見(使.length >= 2, "★★ **資料に 書いて ある 数を 使って いる**", 使);
  見((j2.invented || []).length === 0, "★★ **資料にも 指示にも 無い 数を 作って いない**", j2.invented);
  見((j2.aiWords || []).length === 0, "AI らしい 言い回しが 無い", j2.aiWords);
  const 札2 = String(j2.draft || "").match(/【[^】]{1,40}】/g) || [];
  見(!札2.length || (j2.questions || []).length >= 1,
    "★ 札が ある なら **聞く ことも 必ず 返る**（札から こちらで 作る）",
    { 札: 札2.length, 聞: (j2.questions || []).length });
}

(async () => {
  if (実) { try { await 実測(); } catch (e) { 見(false, "実測で 落ちた", String(e && e.message || e)); } }
  else console.log("\n（⑤⑥ 実測は --実 を 付けた ときだけ）");
  console.log("\n────────────────────────────────");
  console.log("  ok " + 済 + " / NG " + 落);
  if (落) console.log("  落ちた: " + 落ち.join(" / "));
  process.exit(落 ? 1 : 0);
})();
