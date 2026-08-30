/* ══════════════════════════════════════════════════════════════════════════
   vqmakespeed.cjs — 資料つきの 試験づくりが **なぜ 遅かったか**を 数で 測る

   訴え（2026-08-30・Rinty さん）
     「115MB の ファイルを 添付して 作らせたら、ありえんくらい 作成が 遅い。
       プリセット AI とか Lumi の スキャンは もっと 早かった 気がする」

   直す前の 作り:
     文字の 入っていない PDF は ページを 絵に して 送る。
     20 問の 試験は **4 回に 分けて** 頼むので、同じ 絵を 4 回 送り、
     向こうも 4 回 読み直していた。

   直したあと:
     作り始める 前に **1 回だけ** 読み取り（/api/scan/read）を 通して
     文字に する。あとは 文字だけを 送る。

   見るのは:
     ① 読み取り前は「そのまま 送る」ぶんに 入っている
     ② 読み取りは **1 回だけ**（頼む 回数ぶん 走らない）
     ③ 読み取り後は 送る 絵が **0 枚**・文字で 渡す ぶんに 移る
     ④ 送る 絵は **縮めて** ある（2048px の まま 送らない）
     ⑤ 実際に 作りに 行くと /api/aigen/questions へ 絵が 1 枚も 行かない
     ⑥ 注意事項は **打たなくても** 出る／数字が 条件と 合う

   使い方: VQ_BASE=http://127.0.0.1:8791 node vqmakespeed.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const { chromium } = require("playwright");

let 済 = 0, 落 = 0; const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 220) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 400) : "")); }
};
const 待 = (ms) => new Promise((s) => setTimeout(s, ms));

(async () => {
  console.log("測る先:", BASE);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 900 } });
  const page = await ctx.newPage();
  const 例外 = [];
  page.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 200)));

  /* 読み取りの 口を 差し替える。**何回 呼ばれ、何バイト 届いたか**を 数える。 */
  const 読み = { 回: 0, 枚: 0, バイト: 0, 長辺: [] };
  await page.route("**/api/scan/read", async (route) => {
    const b = JSON.parse(route.request().postData() || "{}");
    読み.回++;
    読み.枚 += (b.images || []).length;
    読み.バイト += (route.request().postData() || "").length;
    (b.images || []).forEach((u) => 読み.長辺.push(String(u).length));
    const 文 = (b.images || []).map((_, i) => "【p." + (i + 1) + "】 光合成は 葉の 細胞で 起こる。〔図: 葉の 断面〕").join("\n");
    await route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, task: "ocr", text: 文, model: "stub", 枚: (b.images || []).length }) });
  });
  /* 作りに 行く 口。**何が 届いたか**を 控えて、作り物の 問題を 返す。 */
  const 頼 = [];
  await page.route("**/api/aigen/questions", async (route) => {
    const b = JSON.parse(route.request().postData() || "{}");
    頼.push({ files: (b.files || []).length,
              バイト: (route.request().postData() || "").length,
              資料の文字: /光合成は 葉の 細胞/.test(String(b.prompt || "")),
              count: b.count });
    const n = Number(b.count) || 1;
    const qs = [];
    for (let i = 0; i < n; i++) {
      qs.push({ id: "q" + 頼.length + "_" + i, type: "multiple_choice_single",
                question: "光合成が 起こる 場所は どこか。", choices: ["葉", "根", "茎", "花"],
                answer: "葉", explanation: "資料に 葉の 細胞と ある。", difficulty: "medium",
                sourceReferences: [{ fileName: "スキャン.pdf", excerpt: "光合成は 葉の 細胞で 起こる。" }] });
    }
    await route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, questions: qs, warnings: [], metrics: {} }) });
  });
  /* 教科ならではの 一言（返さない ときも 測れるように 差し替える）。 */
  let 注意の回 = 0;
  await page.route("**/api/aigen/cover", async (route) => {
    const b = JSON.parse(route.request().postData() || "{}");
    if (b.task === "examNotes") {
      注意の回++;
      await route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ ok: true, notes: ["定規と コンパスを 持ってきなさい。"] }) });
      return;
    }
    await route.continue();
  });

  await page.addInitScript(() => {
    try {
      localStorage.setItem("app.auth.token.v1", "dummy-token-for-shape-test");
      localStorage.setItem("app.auth.mode.v1", "user");
    } catch (e) {}
  });
  await page.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__vqMake, null, { timeout: 60000 });
  /* 問題を 作る 部品（決定論層）は 遅れて 来る。**待たずに 押すと 進めない**。 */
  await page.waitForFunction(
    () => !!(window.VQ2 && window.VQ2.mockCompiler && window.VQ2.mockCompilerRun
             && window.VQ2.aigen && window.VQ2.aigen.generateQuestions),
    null, { timeout: 60000 });
  await 待(1500);

  /* 作り物の「絵の ページ」。本物と 同じ 形（dataUrl）で 12 枚。 */
  const 入れた = await page.evaluate(async () => {
    function 絵(w, h) {
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      const cx = cv.getContext("2d");
      cx.fillStyle = "#fff"; cx.fillRect(0, 0, w, h);
      cx.fillStyle = "#000"; cx.font = "80px sans-serif";
      for (let i = 0; i < 12; i++) cx.fillText("光合成 は 葉 の 細胞", 40, 120 + i * 160);
      return cv.toDataURL("image/jpeg", 0.92);
    }
    const 頁 = [];
    for (let p = 1; p <= 12; p++) 頁.push({ pageNumber: p, dataUrl: 絵(2048, 2896) });
    window.__vqMake.資料を入れる([{
      name: "スキャン.pdf", mimeType: "application/pdf", size: 115 * 1024 * 1024,
      status: "ready", extractedText: "", pageImages: 頁, pageCount: 480
    }]);
    return { 枚: 頁.length, 一枚のバイト: Math.round(頁[0].dataUrl.length * 0.75) };
  });

  節("① 読み取る 前");
  const 前 = await page.evaluate(() => ({
    読む: window.__vqMake.読み取る資料(),
    文字: window.__vqMake.文字で渡すぶん(),
    ファイル: window.__vqMake.ファイルで渡すぶん()
  }));
  見(前.読む.length === 1, "文字の 無い 資料を 見つける", 前.読む);
  見(前.文字.length === 0, "まだ 文字では 渡せない", 前.文字);
  見(前.ファイル.length === 1, "いまは そのまま 送る ぶんに いる", 前.ファイル);
  console.log("  参考: 絵 " + 入れた.枚 + " 枚 / 1 枚 " + Math.round(入れた.一枚のバイト / 1024) + " KB");

  節("② 読み取りは 1 回だけ");
  const t0 = Date.now();
  await page.evaluate(() => window.__vqMake.絵を文字にする());
  const 掛 = Date.now() - t0;
  見(読み.回 === 3, "12 ページを 4 枚ずつ 3 回で 読む", { 回: 読み.回, 枚: 読み.枚 });
  見(読み.枚 === 12, "12 ページ 全部 送った", 読み.枚);

  節("③ 読み取った あと");
  const 後 = await page.evaluate(() => ({
    読む: window.__vqMake.読み取る資料(),
    文字: window.__vqMake.文字で渡すぶん(),
    ファイル: window.__vqMake.ファイルで渡すぶん(),
    本文: window.__vqMake.渡す本文(),
    状態: window.__vqMake.状態().資料
  }));
  見(後.ファイル.length === 0, "そのまま 送る ぶんが 0 件に なった", 後.ファイル);
  見(後.文字.length === 1, "文字で 渡す ぶんに 移った", 後.文字);
  見(後.本文.length >= 1 && /光合成は 葉の 細胞/.test(後.本文[0]), "読み取った 本文が 依頼文に 乗る",
     String(後.本文[0] || "").slice(0, 60));
  見(/〔図:/.test(後.本文.join("")), "図の 説明を 消していない");
  見(後.状態[0].読み取り頁 === 12, "読み取った ページ数を 数えている", 後.状態[0].読み取り頁);

  節("④ 送る 絵は 縮めて ある");
  const 平均 = Math.round(読み.長辺.reduce((a, b) => a + b, 0) / 読み.長辺.length * 0.75);
  const 元 = 入れた.一枚のバイト;
  見(平均 < 元 * 0.5, "1 枚あたり 半分 以下に なった",
     { 元: Math.round(元 / 1024) + "KB", 送った: Math.round(平均 / 1024) + "KB" });
  const 全送 = Math.round(読み.バイト * 0.75 / 1024 / 1024 * 10) / 10;
  console.log("  読み取りに 送った 合計: " + 全送 + " MB（" + Math.round(掛 / 100) / 10 + " 秒）");

  節("⑤ 作りに 行くと 絵は 1 枚も 行かない");
  const 走 = await page.evaluate(async () => {
    const M = window.__vqMake;
    M.open({ kind: "exam" });
    M.表紙を入れる({ examName: "1学期 期末考査", subject: "生物基礎", examDate: "2026年8月30日" });
    /* 小さく する（4 回 頼む 形は 保ったまま 早く 終わらせる）。 */
    M.条件を入れる({ sectionCount: 2, questionCount: 8, totalPoints: 40, durationMinutes: 50 });
    return { 条件: M.状態().条件.questionCount, 資料: M.状態().資料.length };
  });
  見(走.資料 === 1, "資料を 持ったまま 条件の 段へ 来た", 走);
  const 出来 = await page.evaluate(() => new Promise((done) => {
    const M = window.__vqMake;
    M.作りに行く();
    let n = 0;
    const t = setInterval(() => {
      const s = M.状態();
      if (s.画面 === "構成案") { clearInterval(t); M.生成する(); setTimeout(() => done({ ok: 1 }), 100); return; }
      if (++n > 60) { clearInterval(t); done({ ok: 0, 画面: s.画面, err: s.err, 枠: s.枠 }); }
    }, 100);
  }));
  見(出来.ok === 1, "構成案 → 生成 へ 進めた", 出来);
  for (let i = 0; i < 120 && !頼.length; i++) await 待(250);
  await 待(3000);
  const 絵ゼロ = 頼.every((x) => x.files === 0);
  見(頼.length > 0, "作りに 行った 回数", 頼.length);
  見(絵ゼロ, "どの 回も 絵を 送っていない", 頼.map((x) => x.files));
  見(頼.every((x) => x.資料の文字), "どの 回も 読み取った 本文を 持っている");
  const 最大 = Math.max.apply(null, 頼.map((x) => x.バイト));
  console.log("  1 回の 頼み: 最大 " + Math.round(最大 / 1024) + " KB"
    + "（直す前は 絵 " + Math.round(元 * 12 / 1024 / 1024) + " MB × " + 頼.length + " 回）");
  見(最大 < 2 * 1024 * 1024, "1 回の 頼みが 2MB 未満", Math.round(最大 / 1024) + "KB");

  節("⑥ 注意事項は 打たなくても 出る");
  const 注 = await page.evaluate(() => {
    const M = window.__vqMake;
    M.条件を入れる({ durationMinutes: 50, totalPoints: 100, sectionCount: 5,
                    answerSheetMode: "current", layoutMode: "current" });
    M.表紙を入れる({ examName: "1学期 期末考査", subject: "数学Ⅰ", examDate: "2026年8月30日" });
    const 既定 = M.状態().表紙;
    return { 打った: (既定.instructions || []).length, 自動: 既定.注意は自動, 出た: M.注意を書く() };
  });
  見(注.打った === 0, "はじめから 何も 打っていない", 注.打った);
  見(注.自動 === true, "おまかせに なっている");
  見(注.出た.length >= 8, "それでも 注意事項が 並ぶ", 注.出た.length);
  見(注.出た.some((t) => /開始の 合図/.test(t)), "開始の 合図");
  見(注.出た.some((t) => /試験時間は 50 分/.test(t)), "試験時間が 条件と 合う",
     注.出た.filter((t) => /試験時間/.test(t)));
  見(注.出た.some((t) => /満点は 100 点/.test(t)), "満点が 条件と 合う");
  見(注.出た.some((t) => /第 1 問から 第 5 問/.test(t)), "大問の 数が 条件と 合う");
  見(注.出た.some((t) => /約分/.test(t)), "教科ならではの 一言（数学）",
     注.出た.filter((t) => /約分|辞書|コンパス/.test(t)));
  見(!注.出た.some((t) => /コンパス/.test(t)),
     "前の 教科（生物）で 頼んだ 一言を 持ち越さない",
     注.出た.filter((t) => /コンパス/.test(t)));
  見(注意の回 >= 1, "教科ならではの 一言を AI に 頼んだ", 注意の回);
  見(!注.出た.some((t) => /マーク/.test(t)), "マーク式で ないので マークの 話は 出ない");

  const マ = await page.evaluate(() => {
    const M = window.__vqMake;
    M.条件を入れる ? M.条件を入れる({ answerSheetMode: "common-test-mark", durationMinutes: 80, totalPoints: 200, sectionCount: 6 })
                  : (M.状態(), null);
    return M.注意を書く();
  });
  if (マ) {
    見(マ.some((t) => /マークしなさい/.test(t)), "マークシートなら マークの 書きかたが 出る",
       マ.filter((t) => /マーク/.test(t)));
    見(マ.some((t) => /試験時間は 80 分/.test(t)), "時間を 変えたら 文も 変わる");
    見(マ.some((t) => /消しくず/.test(t)), "訂正の しかたも 出る");
  }

  節("例外");
  見(例外.length === 0, "画面の 例外 0 件", 例外.slice(0, 3));

  console.log("\n══ まとめ ══");
  console.log("  ok " + 済 + " / NG " + 落);
  if (落) console.log("  落ちた: " + 落ち.join(" / "));
  await browser.close();
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
