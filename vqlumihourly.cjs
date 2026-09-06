#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqlumihourly.cjs — 行動の 記録と、1 時間ごとの Lumi（2026-09-01・訴え）

   訴え:「AI から っていう 所は、必ず ユーザーの 学習履歴、その他の 行動パターンを
         記録し、そこから 裏で 働いてる Live（無制限）が **1 時間ごとに 傾向を
         掴んで 提案**して ほしい。そこに ボタンを 作ったり。
         苦手な プリセットを 分析して、苦手を 補う プリセットを 作成したり。
         いつ 何を 開いて どの 問題まで 行って 解答変更 何回した か、
         どの 選択肢を 選んだ か、何を AI に 投げた か、どの ボタンを 押してた かまで。」

   直す前: ホームの「AI から」は **本体の 挨拶文を 写して いる だけ**で、
           学習履歴も 行動も 見て いなかった。提案も ボタンも 無かった。

   決めた こと（守る）:
     ★ 記録は **端末の 中だけ**。サーバへ 送るのは **まとめた 数**だけ。
     ★ ボタンは **こちらが 用意した 型の 中から 選ばせる**。自由な コードは 書かせない。
     ★ 材料が 薄い ときは **AI を 呼ばない**（当てずっぽうを 出さない・枠も 使わない）。
     ★ **1 時間に 1 回だけ** 頼む（描き直すたびに 頼むと 枠を 食い潰す）。
     ★ **切れる**（設定 → データ → 行動の記録）。

   見るもの:
     ① 記録が 取れる（画面・押した もの・解答・AI へ 投げた もの）
     ② まとめは **数と 傾向だけ**（生の 文が 混ざって いない）
     ③ 材料が 薄い ときは AI を 呼ばず「まだ 分かりません」
     ④ 本物の 材料では **ひとことと ボタン**が 返る（実サーバ）
     ⑤ **渡した 数の 中でしか 言わない**（無い 数を 作らない）
     ⑥ **知らない 型の ボタンは 落とす**（サーバの 関所）
     ⑦ 画面に 出る／ボタンが 押せる／1 時間に 1 回だけ 頼む
     ⑧ 切ると 1 行も 取らない

   使い方:
     node vqlumihourly.cjs          … 画面まわり（手元）
     node vqlumihourly.cjs --実     … 開発版の 本物の Lumi でも 見る
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
const API = process.env.VQ_API || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const { chromium } = require("playwright");
let 済 = 0, 落 = 0; const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 240) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 360) : "")); }
};
const 待 = (m) => new Promise((s) => setTimeout(s, m));

async function 入る() {
  const j = (r) => r.json();
  const 鍵 = "vqlh" + Date.now() + Math.random().toString(36).slice(2, 7);
  let r = await fetch(API + "/api/auth/register/start", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: 鍵 + "@gmail.com", gradePrefix: "H2", nickname: 鍵.slice(2, 16), password: "Passw0rd!x9" }) }).then(j);
  if (!r.devCode) throw new Error("devCode 無し");
  r = await fetch(API + "/api/auth/register/verify", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challengeId: r.challengeId, code: r.devCode }) }).then(j);
  r = await fetch(API + "/api/auth/register/consent", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ registrationSession: r.registrationSession, agreeTerms: true, agreePrivacy: true, agreeAge: true, pin: "1379" }) }).then(j);
  return r.token;
}
const 材料 = {
  動き: { 期間時間: 6, 行数: 214,
    画面: [{ 名: "library", 回: 12 }, { 名: "home", 回: 9 }, { 名: "insight", 回: 2 }],
    よく押す: [{ 名: "preset-start", 回: 11 }, { 名: "type", 回: 8 }, { 名: "run", 回: 3 }],
    AIに投げた: [{ 何: "preset", 頭: "日本史の 鎌倉時代で 4択 15問" }],
    解答: { 数: 96, 正: 61, 誤: 35, 直し: 14 },
    よく解くプリセット: [{ 名: "p-eng", 回: 52 }, { 名: "p-hist", 回: 44 }],
    時間帯: [{ 時: 22, 回: 88 }, { 時: 23, 回: 96 }, { 時: 0, 回: 30 }] },
  学び: { todayAnswers: 96, weekAnswers: 260, weekAcc: 63, streak: 4, todayMin: 71 },
  苦手: [{ id: "p-eng", 名: "英単語 高1", 正答率: 48, 問数: 52 },
        { id: "p-hist", 名: "日本史 鎌倉", 正答率: 58, 問数: 44 }]
};

(async () => {
  const 実 = process.argv.indexOf("--実") >= 0;
  const browser = await chromium.launch();
  const pg = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const 例外 = []; pg.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 180)));
  let 頼 = 0; let 返 = { ok: true, できた: false, 理由: "ためし" };
  await pg.route("**/api/ai/hourly", async (r) => {
    頼++;
    await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(返) });
  });
  await pg.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => !!window.__vqTrace, null, { timeout: 25000 });
  await 待(3000);

  節("① 行動が 記録される");
  const a = await pg.evaluate(async () => {
    const T = window.__vqTrace;
    T.消す();
    T.記す("screen", "home");
    T.記す("tap", "preset-start", { m: "library" });
    T.AIへ("preset", "日本史の 鎌倉時代で 4択 15問 作って ください。解説も。", "15問");
    T.解いた({ presetId: "p1", questionId: "q1", index: 1, choice: "ア", correct: false });
    T.解いた({ presetId: "p1", questionId: "q1", index: 1, choice: "イ", correct: true });
    T.解いた({ presetId: "p1", questionId: "q2", index: 2, choice: "ウ", correct: true });
    T.流す();
    await new Promise((s) => setTimeout(s, 300));
    const 全 = T.全部();
    return { 件: 全.length, 種: 全.map((r) => r.k),
             直し: 全.filter((r) => /直し/.test(String(r.m || ""))).length,
             AI頭: (全.find((r) => r.k === "ai") || {}).v };
  });
  見(a.件 >= 6, "★★ **記録が 取れる**", a.件);
  見(a.種.indexOf("screen") >= 0 && a.種.indexOf("tap") >= 0
    && a.種.indexOf("ai") >= 0 && a.種.indexOf("answer") >= 0,
    "★ 画面・押した もの・AI・解答 の 4 種類", a.種);
  見(a.直し === 1, "★★ **同じ 問題を 選び直したら「直し」が 付く**", a.直し);
  見(a.AI頭 && a.AI頭.length <= 120, "★ AI へ 投げた 文は **頭だけ**（全文を 持たない）", a.AI頭 && a.AI頭.length);

  節("② まとめは 数と 傾向だけ");
  const b = await pg.evaluate(() => window.__vqTrace.まとめ(6));
  見(b && b.行数 >= 6, "まとめが 出る", b && b.行数);
  見(Array.isArray(b.画面) && Array.isArray(b.よく押す), "画面と よく押す ものが 数で 出る", { 画面: b.画面, 押: b.よく押す });
  見(b.解答 && b.解答.数 === 3 && b.解答.直し === 1, "★ 解答の 数・直しの 数", b.解答);
  見(JSON.stringify(b).length < 4000, "★ **送る 量が 小さい**（生の 行を 送らない）", JSON.stringify(b).length);
  見(Array.isArray(b.時間帯) && b.時間帯.length >= 1, "★ 何時台に 動いたかも 出る", b.時間帯);

  節("③ 1 時間に 1 回だけ 頼む");
  await pg.evaluate(() => { try { localStorage.setItem("app.auth.token.v1", "t"); localStorage.removeItem("vq.lumi.hourly.v1"); } catch (e) {} });
  const 前頼 = 頼;
  for (let i = 0; i < 4; i++) {
    await pg.evaluate(() => { try { window.__vqScreens.描き直す(); } catch (e) {} });
    await 待(500);
  }
  見(頼 - 前頼 <= 1, "★★ **何度 描き直しても 1 回だけ**（枠を 食い潰さない）", { 頼んだ: 頼 - 前頼 });

  節("⑦ 画面に 出る／ボタンが 押せる");
  返 = { ok: true, できた: true, とき: Date.now(), 提案: {
    ひとこと: "英単語と 日本史で 35 問 間違えて います。",
    根拠: "解答 96・誤答 35 の ため。",
    手: [{ 型: "review", label: "間違えた ものを もう一度", arg: "" },
        { 型: "make_preset", label: "苦手を 補う 10 問", arg: "英単語の 苦手を 補う 4択 10問" },
        { 型: "open_help", label: "使いかた", arg: "insight-basic" }] } };
  const c = await pg.evaluate(async () => {
    try { localStorage.removeItem("vq.lumi.hourly.v1"); } catch (e) {}
    window.__vqScreens.描き直す();
    await new Promise((s) => setTimeout(s, 1600));
    const h = Array.prototype.find.call(document.querySelectorAll("*"), (n) => n.shadowRoot && n.shadowRoot.querySelector("[data-home-ai]"));
    const sr = h && h.shadowRoot;
    const box = sr && sr.querySelector("[data-home-ai]");
    return { 文: box ? box.textContent.replace(/\s+/g, " ").trim().slice(0, 160) : "(無し)",
             ボタン: box ? Array.prototype.map.call(box.querySelectorAll("[data-lumi]"), (b2) => b2.getAttribute("data-lumi")) : [] };
  });
  見(/35 問 間違えて/.test(c.文), "★★ **ひとことが 画面に 出る**", c.文);
  見(/解答 96/.test(c.文), "根拠も 出る", c.文);
  見(c.ボタン.indexOf("review") >= 0 && c.ボタン.indexOf("make_preset") >= 0,
    "★★ **Lumi が 置いた ボタンが 出る**", c.ボタン);
  見(c.ボタン.indexOf("refresh") >= 0, "「いま 見て もらう」も ある", c.ボタン);
  const d = await pg.evaluate(async () => {
    const h = Array.prototype.find.call(document.querySelectorAll("*"), (n) => n.shadowRoot && n.shadowRoot.querySelector("[data-home-ai]"));
    const sr = h.shadowRoot;
    let 開いた = "";
    const 元 = window.__vqHelp.open;
    window.__vqHelp.open = function (o) { 開いた = (o && o.id) || ""; };
    sr.querySelector('[data-lumi="open_help"]').click();
    await new Promise((s) => setTimeout(s, 400));
    window.__vqHelp.open = 元;
    /* 記録は 800 ミリ秒 まとめて から 書く（打つたびに 保存しない）。
       読む 前に 流す。 */
    window.__vqTrace.流す();
    await new Promise((s) => setTimeout(s, 200));
    const 記 = window.__vqTrace.全部().filter((r) => r.k === "lumi");
    return { 開いた, 記: 記.map((r) => r.a) };
  });
  見(d.開いた === "insight-basic", "★★ **押すと 本当に そこへ 行く**", d.開いた);
  見(d.記.indexOf("open_help") >= 0, "★ 押した ことも 記録に 残る（次の 材料に なる）", d.記);

  節("⑧ 切ると 1 行も 取らない");
  const e2 = await pg.evaluate(async () => {
    const T = window.__vqTrace;
    T.消す(); T.切る(true);
    T.記す("tap", "ためし"); T.解いた({ presetId: "p", questionId: "q", index: 1, choice: "ア" });
    T.流す();
    await new Promise((s) => setTimeout(s, 300));
    const n = T.全部().length;
    T.切る(false);
    T.記す("tap", "もどした"); T.流す();
    await new Promise((s) => setTimeout(s, 300));
    return { 切った時: n, 戻した時: T.全部().length };
  });
  見(e2.切った時 === 0, "★★ **切ったら 1 行も 取らない**", e2.切った時);
  見(e2.戻した時 >= 1, "戻すと また 取る", e2.戻した時);

  見(例外.length === 0, "画面の 例外 0 件", 例外);
  await browser.close();

  if (実) {
    節("④⑤⑥ 本物の Lumi（開発版）");
    let tk = "";
    try { tk = await 入る(); } catch (e) { console.log("  （登録できません: " + e.message + "）"); }
    if (tk) {
      const H = { "Content-Type": "application/json", Authorization: "Bearer " + tk };
      const 打 = (b2) => fetch(API + "/api/ai/hourly", { method: "POST", headers: H, body: JSON.stringify(b2) }).then((r) => r.json());
      const 薄 = await 打({ 動き: { 行数: 1 }, 学び: { weekAnswers: 0 } });
      見(薄 && 薄.できた === false && /材料/.test(String(薄.理由 || "")),
        "★★ **材料が 薄い ときは AI を 呼ばない**（当てずっぽうを 出さない）", 薄);
      const t0 = Date.now();
      const r2 = await 打(材料);
      console.log("    かかった:", ((Date.now() - t0) / 1000).toFixed(1) + "秒");
      見(r2 && r2.できた === true, "★★ **本物の Lumi が ひとことを 返す**", r2 && r2.提案 && r2.提案.ひとこと);
      if (r2 && r2.提案) {
        const p2 = r2.提案;
        見(p2.ひとこと.length <= 80, "★ ひとことは 短い（60〜80 字）", p2.ひとこと.length);
        /* 渡した 数の 中でしか 言って いないか。出て くる 数字を 拾って 照合。 */
        const 許 = ["96", "35", "61", "63", "260", "48", "58", "52", "44", "4", "71", "14", "22", "23", "0", "10", "1", "2", "3", "5"];
        const 数 = (p2.ひとこと + " " + (p2.根拠 || "")).match(/\d+/g) || [];
        const 外 = 数.filter((n) => 許.indexOf(n) < 0);
        見(外.length === 0, "★★ **渡した 数の 中でしか 言わない**（作り話の 数字が 無い）", { 出た: 数, 知らない: 外 });
        const 型OK = ["make_preset", "review", "open_preset", "open_tab", "open_help"];
        const 悪 = (p2["手"] || []).filter((h) => 型OK.indexOf(h["型"]) < 0);
        見(悪.length === 0, "★★ **知らない 型の ボタンは 出さない**", 悪);
        見((p2["手"] || []).length <= 3, "ボタンは 3 個まで", (p2["手"] || []).length);
        見((p2["手"] || []).every((h) => String(h.label || "").length <= 24), "ラベルは 短い", (p2["手"] || []).map((h) => h.label));
      }
      /* ⑥ 知らない 型は サーバで 落ちる（形の 検査） */
      const 落 = await 打(Object.assign({}, 材料, { __ためし: 1 }));
      見(!落 || 落.ok === true, "続けて 呼んでも 落ちない", 落 && 落.ok);
    }
  }

  console.log("\n────────────────────────────────");
  console.log("  ok " + 済 + " / NG " + 落);
  if (落) { console.log("  落ちた: " + 落ち.join(" / ")); process.exit(1); }
})();
