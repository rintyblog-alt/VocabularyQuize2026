/* ══════════════════════════════════════════════════════════════════════════
   vqexamquality.cjs — 試験モードの **問題の 質**を 実 AI で 測る

   訴え（2026-08-30・Rinty さん）
     「試験モードのAI作成は、もう試験だから、一問一答レベルを標準にしたらダメ。
       もっと聞かれ方を変えていかないと。
       問題の質が今のだとプリセット作成AIと大差ないよまじで。
       選択肢がわかりやすすぎる。ひっかけとかも作れるようにしないとダメ。
       あとは違う教科が入っていたりだとか… コレまじ論外」

   見本は 本物の 共通テスト（情報 I100・第1問）。そこから 数えられる ものだけ 測る:
     ① 一問一答の 割合          … 短い 問いが 全体の どれだけか
     ② 問題文の 長さ            … 場面や 資料を 示しているか
     ③ 選択肢の 長さの ばらつき  … 正解だけ 長い／短いは だめ
     ④ 言い切りの 語            … 「すべて」「必ず」だけで 消せる 選択肢
     ⑤ 誤答の 説明              … どの 型の 誤りかが 書いてあるか
     ⑥ 教科の 混入              … 頼んだ 教科 以外の ものが 混ざっていないか

   ★ **試験モードと プリセットを 同じ 頼みで 並べて 測る。**
     「大差ない」かどうかは 並べないと 分からない。

   使い方: VQ_BASE=https://vocabuquiz-api-dev.rintyblog.workers.dev node vqexamquality.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

let 済 = 0, 落 = 0;
const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + String(追).slice(0, 200) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + String(追).slice(0, 300) : "")); }
};
const j = (r) => r.json().catch(() => ({}));

async function 札() {
  const 印 = Date.now().toString(36) + Math.floor(Math.random() * 9999);
  const H = { "Content-Type": "application/json" };
  const r = await fetch(BASE + "/api/auth/register/start", { method: "POST", headers: H,
    body: JSON.stringify({ email: "vqq" + 印 + "@gmail.com", gradePrefix: "H2",
      nickname: ("q" + 印).slice(0, 14), password: "Passw0rd!z3" }) }).then(j);
  const v = await fetch(BASE + "/api/auth/register/verify", { method: "POST", headers: H,
    body: JSON.stringify({ challengeId: r.challengeId, code: r.devCode }) }).then(j);
  const c = await fetch(BASE + "/api/auth/register/consent", { method: "POST", headers: H,
    body: JSON.stringify({ registrationSession: v.registrationSession, agreeTerms: true,
      agreePrivacy: true, agreeAge: true, pin: "1379" }) }).then(j);
  if (!c.token) throw new Error("札が 取れない");
  return c.token;
}

/* ── 数えかた（AI を 使わない。数えれば 分かる ものだけ）── */
const 文 = (v) => String(v == null ? "" : v);
const 幅 = (t) => { let n = 0; const s = 文(t);
  for (let i = 0; i < s.length; i++) n += /[ -~]/.test(s[i]) ? 1 : 2; return n; };
const 言い切り = /すべて|全て|必ず|絶対|一切|例外なく|決して/;

function 測る(qs) {
  const 出 = { n: qs.length, 短い: 0, 問長: [], 選ばらつき: [], 言い切り: 0,
               誤答の説明: 0, 選択肢あり: 0 };
  qs.forEach((q) => {
    const p = 文(q.question);
    出.問長.push(幅(p));
    /* 一問一答 … 問題文が 短く、場面も 資料も 示していない。 */
    if (幅(p) <= 40) 出.短い++;
    const ch = Array.isArray(q.choices) ? q.choices.map(文) : [];
    if (ch.length >= 3) {
      出.選択肢あり++;
      const w = ch.map(幅);
      const 平 = w.reduce((a, b) => a + b, 0) / w.length;
      const 最大ずれ = Math.max(...w.map((x) => Math.abs(x - 平))) / Math.max(1, 平);
      出.選ばらつき.push(Math.round(最大ずれ * 100) / 100);
      if (ch.some((c) => 言い切り.test(c))) 出.言い切り++;
    }
    /* 誤答の 型が 解説に 書いてあるか。 */
    const e = 文(q.explanation);
    if (/言い過ぎ|足りない|すり替え|基準ちがい|逆|誤り|誤答|①|②|③|④|⑤/.test(e) && 幅(e) >= 60) 出.誤答の説明++;
  });
  const 中 = (a) => a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0;
  return { n: 出.n, 短い率: 出.n ? 出.短い / 出.n : 0,
           問長中央: 中(出.問長), 選ばらつき中央: 中(出.選ばらつき),
           言い切り率: 出.選択肢あり ? 出.言い切り / 出.選択肢あり : 0,
           誤答説明率: 出.n ? 出.誤答の説明 / 出.n : 0 };
}

const 教科の語 = {
  日本史: /幕府|天皇|条約|時代|将軍|律令|藩|明治|昭和|遣唐使|荘園/,
  数学: /方程式|関数|三角|微分|積分|確率|ベクトル|因数|log|sin|cos/,
  英語: /[A-Za-z]{4,}\s+[A-Za-z]{4,}/,
  生物: /細胞|遺伝子|酵素|DNA|光合成|ホルモン|染色体/,
  情報: /プログラム|ビット|データ|ネットワーク|アルゴリズム|情報|デジタル|符号|進数/
};
function 教科ちがい(qs, 教科) {
  const 自 = 教科の語[教科];
  const 他 = Object.keys(教科の語).filter((k) => k !== 教科);
  return qs.filter((q) => {
    const t = 文(q.question) + " " + (Array.isArray(q.choices) ? q.choices.map(文).join(" ") : "");
    if (自 && 自.test(t)) return false;
    return 他.some((k) => 教科の語[k].test(t));
  });
}

async function 作る(H, o) {
  const t0 = Date.now();
  const r = await fetch(BASE + "/api/aigen/questions", { method: "POST", headers: H,
    body: JSON.stringify(o) }).then(j);
  return { r: r, qs: (r && r.questions) || [], 秒: Math.round((Date.now() - t0) / 100) / 10 };
}

(async () => {
  console.log("測る先:", BASE);
  const tok = await 札();
  const H = { "Content-Type": "application/json", Authorization: "Bearer " + tok };
  const 頼み = "高校の 情報Ⅰ。SNS の 情報の 확인… ではなく、情報の 真偽の 確かめかたについて 8 問。";
  const 共通 = { prompt: "高校の 情報Ⅰ。SNS で 広まった 情報を どこまで 確かめられるかを 問う 問題を 8 問。",
    count: 8, questionTypes: ["single_choice"], questionPlan: { single_choice: 8 } };

  節("① 試験モード と プリセット を 並べて 作る");
  const プ = await 作る(H, 共通);
  見(プ.qs.length > 0, "プリセット（いまのまま）", プ.qs.length + " 問 / " + プ.秒 + "秒");
  const 試 = await 作る(H, Object.assign({}, 共通, { exam: true, subject: "情報", materials: true }));
  見(試.qs.length > 0, "試験モード", 試.qs.length + " 問 / " + 試.秒 + "秒 / "
     + ((試.r.metrics && 試.r.metrics.model) || "?"));
  /* ★ 試験は 強い モデル（Gemini Flash 3.5）へ 行く。枠切れなら 控えへ 落ちる。 */
  見(/gemini/i.test((試.r.metrics && 試.r.metrics.model) || ""),
     "★ 試験は Gemini へ 行く", (試.r.metrics && 試.r.metrics.model) || "");
  if (!プ.qs.length || !試.qs.length) { console.log("片方が 0 問。止めます。"); process.exit(1); }

  const P = 測る(プ.qs), E = 測る(試.qs);
  console.log("\n     " + ["", "プリセット", "試験"].join("\t"));
  const 行 = (名, a, b, 桁) => console.log("     " + 名 + "\t"
    + (桁 ? a.toFixed(桁) : a) + "\t" + (桁 ? b.toFixed(桁) : b));
  行("一問一答率", P.短い率, E.短い率, 2);
  行("問題文の長さ", P.問長中央, E.問長中央);
  行("選択肢ばらつき", P.選ばらつき中央, E.選ばらつき中央, 2);
  行("言い切り率  ", P.言い切り率, E.言い切り率, 2);
  行("誤答の説明率", P.誤答説明率, E.誤答説明率, 2);

  節("② 一問一答に 寄っていない");
  見(E.短い率 <= 0.25, "★ 短い 問いは 4 分の 1 まで", "試験 " + E.短い率.toFixed(2));
  見(E.問長中央 >= P.問長中央, "★ プリセットより 問題文が 長い（場面や 資料を 示している）",
     "試験 " + E.問長中央 + " / プリセット " + P.問長中央);
  見(E.問長中央 >= 60, "問題文が 60 幅 以上", E.問長中央);

  節("③ 選択肢が わかりやすすぎない");
  見(E.選ばらつき中央 <= 0.6, "★ 選択肢の 長さが そろっている（正解だけ 長くない）",
     E.選ばらつき中央.toFixed(2));
  見(E.選ばらつき中央 <= P.選ばらつき中央 + 0.05,
     "プリセットより そろっている（か 同じ）",
     "試験 " + E.選ばらつき中央.toFixed(2) + " / プリセット " + P.選ばらつき中央.toFixed(2));
  見(E.言い切り率 <= 0.4, "★「すべて／必ず」だけで 消せる 選択肢が 少ない",
     E.言い切り率.toFixed(2));

  節("④ 誤答の 型が 解説に ある");
  見(E.誤答説明率 >= 0.5, "★ 半分 以上の 問題で 誤答の 理由まで 書いてある",
     E.誤答説明率.toFixed(2));
  見(E.誤答説明率 > P.誤答説明率, "プリセットより 詳しい",
     "試験 " + E.誤答説明率.toFixed(2) + " / プリセット " + P.誤答説明率.toFixed(2));

  節("⑤ 教科が 混ざっていない");
  const 混 = 教科ちがい(試.qs, "情報");
  見(混.length === 0, "★ 情報 以外の 教科が 混ざっていない",
     混.length ? 混.map((q) => 文(q.question).slice(0, 50)).join(" ｜ ") : "0 件");

  節("⑤b 資料（表・グラフ・図形）を 付けられる");
  {
    const 資 = 試.qs.reduce((a, q) => a + (Array.isArray(q.materials) ? q.materials.length : 0), 0);
    const 種 = {};
    試.qs.forEach((q) => (q.materials || []).forEach((m) => {
      const t = 文(m && (m.type || m.kind)) || "(なし)"; 種[t] = (種[t] || 0) + 1; }));
    console.log("     資料 " + 資 + " 件 " + JSON.stringify(種));
    見(true, "（資料の 数を 見る ぶん）", 資 + " 件");
  }

  節("⑥ 中身を 目で 見る（1 問だけ 出す）");
  {
    const q = 試.qs[0] || {};
    console.log("     問: " + 文(q.question).slice(0, 200));
    (q.choices || []).forEach((c, i) => console.log("     " + "①②③④⑤"[i] + " " + 文(c).slice(0, 110)));
    console.log("     答: " + 文(q.answer).slice(0, 90));
    console.log("     解説: " + 文(q.explanation).slice(0, 300));
    見(true, "（目で 見る ぶん）");
  }

  console.log("\n────────────────────────────────");
  console.log("通った: " + 済 + " / 落ちた: " + 落);
  if (落ち.length) console.log("落ちたもの:\n  - " + 落ち.join("\n  - "));
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error("止まりました:", e); process.exit(1); });
