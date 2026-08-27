/* ══════════════════════════════════════════════════════════════════════════
   vqchatstuck.cjs — Quick Chat（2026-08-13）

     ① ダークのとき、まん中の「Quick Chat」の文字が地色に埋もれない
     ② 生成が終わったのに「考えています」と「停止」ボタンが戻らない、を直す

   ② の原因は、処理の記録に running が残ること。1 件でも残ると
   currentRunning() が真を返し続け、画面が待っている表示のまま止まる。
   ここでは **わざと走りっぱなしの状態を作って**、戻ることを確かめる。
   ══════════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const HTML = path.join(__dirname, "client", "index.html");

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (detail ? "  → " + detail : "")); }
};

(async () => {
  console.log("═══ vqchatstuck — Quick Chat の色と、待ちっぱなし ═══");

  console.log("\n⓪ ソースの決まり");
  const src = require("./vqsrc.cjs").丸ごと();
  ok("まん中の見出しに色を直書きしていない",
    src.indexOf('.hero__t{font-size:30px;font-weight:800;letter-spacing:-.02em;color:#000;}') < 0);
  ok("まん中の見出しはテーマの色を使う",
    src.indexOf('".hero__t{font-size:30px;font-weight:800;letter-spacing:-.02em;color:var(--vq-text,#2B2836);}"') >= 0);
  ok("処理の記録が「最後に動いた時刻」を持つ", src.indexOf("touchedAt: Date.now()") >= 0);
  ok("取りこぼしを閉じる処理がある", src.indexOf("function closeStrayRuns(") >= 0);
  ok("見張りから呼んでいる", src.indexOf("closeStrayRuns(45000)") >= 0);
  ok("会話が切り替わっても閉じる（早期 return より手前）",
    src.indexOf("closeStrayRuns();\n    if (gen !== st.local.gen)") >= 0);

  const br = await chromium.launch();
  const pg = await br.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e.message).slice(0, 130)));
  await pg.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.waitForFunction(() => !!document.getElementById("vqChat"), null, { timeout: 60000 }).catch(() => {});
  await pg.waitForTimeout(2000);

  console.log("\n① ダークで文字が読めるか（実際に色を測る）");
  const colors = {};
  for (const mode of ["light", "dark"]) {
    const c = await pg.evaluate((m) => {
      document.documentElement.setAttribute("data-theme-mode", m);
      const host = document.getElementById("vqChat");
      if (!host || !host.shadowRoot) return { 無し: true };
      /* まん中の見出しは、チャットがまだ空のときだけ出る。
         出ていなければ、同じ規則を当てた仮の要素で色を測る。 */
      let el = host.shadowRoot.querySelector(".hero__t");
      let temp = false;
      if (!el) {
        const h = document.createElement("div"); h.className = "hero";
        const t = document.createElement("div"); t.className = "hero__t"; t.textContent = "Quick Chat";
        h.appendChild(t); host.shadowRoot.appendChild(h); el = t; temp = true;
      }
      const col = getComputedStyle(el).color;
      /* 背後の地色 */
      const bg = getComputedStyle(host.shadowRoot.querySelector(".root, .wrap, .thread") || host).backgroundColor;
      if (temp) el.parentElement.remove();
      return { 文字: col, 背景: bg };
    }, mode);
    colors[mode] = c;
    console.log("  " + mode + ": 文字=" + c.文字 + " 背景=" + c.背景);
  }
  const rgb = (s) => (String(s).match(/\d+/g) || []).slice(0, 3).map(Number);
  const lum = (s) => { const [r, g, b] = rgb(s); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
  ok("明るいときは文字が濃い", lum(colors.light.文字) < 0.5, colors.light.文字);
  ok("★暗いときは文字が明るい（黒のままにしない）", lum(colors.dark.文字) > 0.5, colors.dark.文字);
  ok("明と暗で文字の色が変わる", colors.light.文字 !== colors.dark.文字,
    colors.light.文字 + " / " + colors.dark.文字);

  console.log("\n② 走りっぱなしの処理が、自力で閉じる");
  /* 見張りは Chat を開いている間だけ動く（他の画面で回し続けない作り）。
     利用者が詰まりを見るのは Chat の画面なので、そこに合わせる。 */
  await pg.evaluate(() => document.body.setAttribute("data-app-tab", "chat"));
  const stuck = await pg.evaluate(() => {
    const F = window.__vqChatFiles;
    if (!F) return { 無し: true };
    F.beginRun();
    /* わざと閉じ忘れを作る */
    const e1 = F.emit("document.extract", { label: "資料を読んでいます" });
    const e2 = F.emit("response.generate", { label: "考えています" });
    /* 45 秒なにも動きが無かったことにする */
    e1.touchedAt = e1.startedAt = Date.now() - 60000;
    e2.touchedAt = e2.startedAt = Date.now() - 60000;
    return { 詰まった: !!F.currentRunning(), 件数: F.events().filter((x) => x.status === "running").length };
  });
  ok("わざと走りっぱなしにできた", !!stuck.詰まった, JSON.stringify(stuck));
  /* 見張りは 900ms ごと。数回ぶん待つ。 */
  await pg.waitForTimeout(3000);
  const after = await pg.evaluate(() => {
    const F = window.__vqChatFiles;
    return { まだ走っている: !!F.currentRunning(),
             残り: F.events().filter((x) => x.status === "running").length,
             完了の印: F.events().some((x) => x.type === "request.completed") };
  });
  ok("★見張りが閉じた（待ちっぱなしにならない）", !after.まだ走っている, JSON.stringify(after));
  ok("「処理が完了しました」の印が付く", after.完了の印);

  console.log("\n③ 動いている最中のものは巻き込まない");
  const alive = await pg.evaluate(async () => {
    const F = window.__vqChatFiles;
    F.beginRun();
    const e = F.emit("document.extract", { label: "資料を読んでいます", current: 1, total: 3 });
    return { 走っている: !!F.currentRunning(), id: e.id };
  });
  ok("いま始めたものは走っている", alive.走っている);
  await pg.waitForTimeout(3000);
  const alive2 = await pg.evaluate(() => ({
    まだ走っている: !!window.__vqChatFiles.currentRunning()
  }));
  ok("★3 秒たっても閉じられない（45 秒の猶予がある）", alive2.まだ走っている,
    "動いている処理を切ってしまっている");

  ok("画面エラーが出ていない", errs.length === 0, errs.join(" / "));
  await br.close();
  console.log("\n─────────────────────────────");
  console.log("通過 " + pass + " / 失敗 " + fail);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("落ちた:", e); process.exit(1); });
