/* ══════════════════════════════════════════════════════════════════════════
   vqlumifb.cjs — LUMI の満足度をたまに聞く（2026-08-13）

     ・5 回に 1 回だけ。毎回は聞かない
     ・入力欄の **すぐ上** に出る（PC もモバイルも同じ場所）
     ・「あんまり／まぁまぁ／はい」を選ぶとお礼に変わり、静かに消える
     ・× でいつでも閉じられる。閉じたら 7 日、答えたら 30 日は聞かない

   併せて、アイコンが英語の文字に見える件（合字が壊れる）も見る。
   ══════════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (detail ? "  → " + detail : "")); }
};

(async () => {
  console.log("═══ vqlumifb — 満足度とアイコンの合字 ═══");
  const br = await chromium.launch();

  for (const [w, h, name] of [[1280, 900, "PC"], [390, 844, "モバイル"]]) {
    const pg = await br.newPage({ viewport: { width: w, height: h }, isMobile: w < 800, hasTouch: w < 800 });
    const errs = [];
    pg.on("pageerror", (e) => errs.push(String(e.message).slice(0, 130)));
    await pg.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
    await pg.waitForFunction(() => window.VQ2 && VQ2.activity && VQ2.activity.feedback, null, { timeout: 60000 });
    await pg.waitForTimeout(1200);

    console.log("\n【" + name + "】① 5 回に 1 回だけ聞く");
    const rhythm = await pg.evaluate(() => {
      const F = VQ2.activity.feedback;
      F.reset();
      const hits = [];
      for (let i = 1; i <= 12; i++) if (F.shouldAsk()) hits.push(i);
      return { 聞いた回: hits, 何回に1回: F.EVERY };
    });
    ok("5 回目・10 回目に聞く（それ以外は聞かない）",
      JSON.stringify(rhythm.聞いた回) === "[5,10]", JSON.stringify(rhythm.聞いた回));

    console.log("【" + name + "】② 答えたら 30 日、閉じたら 7 日は聞かない");
    const quiet = await pg.evaluate(() => {
      const F = VQ2.activity.feedback;
      F.reset();
      for (let i = 1; i <= 5; i++) F.shouldAsk();      /* 5 回目で聞いた状態 */
      F.answer("high");
      const 答えた直後 = [];
      for (let i = 1; i <= 12; i++) if (F.shouldAsk()) 答えた直後.push(i);
      const s = F.read();
      const 日数 = Math.round((s.quietUntil - Date.now()) / 86400000);
      F.reset();
      for (let i = 1; i <= 5; i++) F.shouldAsk();
      F.close();
      const s2 = F.read();
      return { 答えた直後: 答えた直後, 答えたあとの日数: 日数,
               閉じたあとの日数: Math.round((s2.quietUntil - Date.now()) / 86400000),
               記録: s.answers.length ? s.answers[s.answers.length - 1].v : "" };
    });
    ok("答えたあとは一度も聞かない", quiet.答えた直後.length === 0, JSON.stringify(quiet.答えた直後));
    ok("答えたら 30 日", quiet.答えたあとの日数 === 30, String(quiet.答えたあとの日数));
    ok("閉じたら 7 日", quiet.閉じたあとの日数 === 7, String(quiet.閉じたあとの日数));
    ok("選んだ答えが残る", quiet.記録 === "high", quiet.記録);

    console.log("【" + name + "】③ 入力欄のすぐ上に出て、押せる");
    const ui = await pg.evaluate(async () => {
      const ACT = VQ2.activity;
      ACT.feedback.reset();
      /* 入力欄つきのパネルを実際に組み立てる */
      const host = document.createElement("div");
      host.style.cssText = "position:fixed;left:0;bottom:0;width:100%;";
      document.body.appendChild(host);
      const st = document.createElement("style");
      st.textContent = ACT.USAGE_CSS; document.head.appendChild(st);
      const p = ACT.createPanel({ title: "LUMI", usage: true });
      p.mount(host);

      const out = {};
      out.出る前 = !!host.querySelector(".vq2-fb");
      out.出た = p.askFeedback(true);
      const card = host.querySelector(".vq2-fb");
      out.問い = card ? (card.querySelector(".vq2-fb-q").textContent || "").trim() : "";
      out.選択肢 = card ? [...card.querySelectorAll(".vq2-fb-b")].map((b) => b.textContent.trim()) : [];
      out.バツがある = !!(card && card.querySelector("[data-fbclose]"));

      /* 入力欄より上にあるか（画面の縦位置で比べる） */
      const box = host.querySelector(".vq2-tlc-box");
      if (card && box) {
        out.枠の下端 = Math.round(card.getBoundingClientRect().bottom);
        out.入力欄の上端 = Math.round(box.getBoundingClientRect().top);
      }
      /* × の押せる大きさ（指で押せるか） */
      const x = card ? card.querySelector("[data-fbclose]") : null;
      if (x) { const r = x.getBoundingClientRect(); out.バツの大きさ = Math.round(r.width) + "x" + Math.round(r.height); }

      /* 「まぁまぁ」を押す */
      const mid = card ? [...card.querySelectorAll(".vq2-fb-b")].filter((b) => b.textContent.trim() === "まぁまぁ")[0] : null;
      if (mid) mid.click();
      await new Promise((r) => setTimeout(r, 120));
      const done = host.querySelector(".vq2-fb.is-done");
      out.お礼 = done ? (done.querySelector(".vq2-fb-q").textContent || "").trim() : "";
      out.記録した答え = (ACT.feedback.read().answers.slice(-1)[0] || {}).v || "";
      out.お礼にもバツ = !!(done && done.querySelector("[data-fbclose]"));

      /* × で閉じられるか（もう一度出してから押す） */
      p.closeFeedback();
      p.askFeedback(true);
      const x2 = host.querySelector(".vq2-fb [data-fbclose]");
      if (x2) x2.click();
      await new Promise((r) => setTimeout(r, 80));
      out.バツで消えた = !host.querySelector(".vq2-fb");

      host.remove(); st.remove();
      return out;
    });
    ok("最初は出ていない", ui.出る前 === false);
    ok("出せる", ui.出た === true);
    ok("問いが出る", ui.問い === "LUMI に満足していますか？", ui.問い);
    ok("選択肢が 3 つ（あんまり／まぁまぁ／はい）",
      JSON.stringify(ui.選択肢) === '["あんまり","まぁまぁ","はい"]', JSON.stringify(ui.選択肢));
    ok("× がある", ui.バツがある);
    ok("× が指で押せる大きさ（28px 以上）",
      parseInt(ui.バツの大きさ || "0", 10) >= 28, ui.バツの大きさ);
    ok("入力欄より上にある", ui.枠の下端 <= ui.入力欄の上端 + 1,
      "枠の下端=" + ui.枠の下端 + " / 入力欄の上端=" + ui.入力欄の上端);
    ok("選ぶとお礼に変わる", ui.お礼 === "フィードバックありがとうございます。", ui.お礼);
    ok("選んだ答えが記録される", ui.記録した答え === "mid", ui.記録した答え);
    ok("お礼にも × がある", ui.お礼にもバツ);
    ok("× で消える", ui.バツで消えた);

    console.log("【" + name + "】④ アイコンが英語の文字にならない");
    const ico = await pg.evaluate(async () => {
      const out = {};
      /* 翻訳よけが付いているか */
      const el = document.createElement("span");
      el.className = "ms"; el.textContent = "local_fire_department";
      document.body.appendChild(el);
      window.__vqMsGuard.sweep(document);
      out.翻訳よけ = el.getAttribute("translate");
      out.notranslate = el.classList.contains("notranslate");
      /* 合字が効いているか（幅で見る。効いていれば 1 文字ぶん） */
      await document.fonts.ready;
      const w1 = Math.round(el.getBoundingClientRect().width);
      const plain = document.createElement("span");
      plain.style.cssText = "font-family:serif"; plain.textContent = "local_fire_department";
      document.body.appendChild(plain);
      const w2 = Math.round(plain.getBoundingClientRect().width);
      out.合字の幅 = w1; out.素の幅 = w2;
      el.remove(); plain.remove();
      out.フォント待ちの印 = document.documentElement.classList.contains("vq-ms-ready");
      return out;
    });
    ok('新しいアイコンに translate="no" が付く', ico.翻訳よけ === "no", String(ico.翻訳よけ));
    ok("notranslate も付く", ico.notranslate);
    ok("合字が効いている（英語の文字幅にならない）", ico.合字の幅 < ico.素の幅 / 3,
      "合字=" + ico.合字の幅 + "px / 素=" + ico.素の幅 + "px");
    ok("フォントが届いたらアイコンを出す印が付く", ico.フォント待ちの印);

    ok("画面エラーが出ていない", errs.length === 0, errs.join(" / "));
    await pg.close();
  }

  await br.close();
  console.log("\n─────────────────────────────");
  console.log("通過 " + pass + " / 失敗 " + fail);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("落ちた:", e); process.exit(1); });
