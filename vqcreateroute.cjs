/* ══════════════════════════════════════════════════════════════════════════
   vqcreateroute.cjs — 「クイズを作成」の入口が **全部** 新しい作成画面へ行く

   入口は 2 系統ある。
     data-action / data-bridge-action … 新しい画面（#vqShell のサイドバー等）
     data-v2-action                  … 旧サイドバー（#appTabBar）
   旧サイドバーは新UIでは隠れているが DOM には残っている。
   コマンドパレットの「クイズを作成」は
     q1('#appTabBar [data-v2-action="create-quiz"]').click()
   でそちらを叩くので、旧エンジン（#presetEngineOverlay）が開いていた。

   ここでは **実際にコマンドパレットを開いて項目を押し**、
   どちらの画面が出たかを見る。
   ══════════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (detail ? "  → " + detail : "")); }
};

/* いま開いている作成画面はどちらか */
const WHICH = () => {
  const neu = document.getElementById("vq2-preset-studio");
  if (neu && neu.shadowRoot) return "新しい作成画面";
  const old = document.getElementById("presetEngineOverlay");
  if (old && !old.classList.contains("hidden") && getComputedStyle(old).display !== "none") return "★旧エンジン★";
  return "どちらも出ていない";
};

(async () => {
  console.log("═══ vqcreateroute — 「クイズを作成」の行き先 ═══");
  const br = await chromium.launch();
  const pg = await br.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e.message).slice(0, 130)));
  await pg.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.waitForFunction(() => window.VQ2 && VQ2.open && VQ2.presetStudio, null, { timeout: 60000 });
  await pg.waitForTimeout(1500);

  console.log("\n① 前提");
  const pre = await pg.evaluate(() => ({
    フラグ: !!(window.VQ2FLAGS && VQ2FLAGS.isOn("presetStudioV2")),
    公開の入口: typeof (window.VQ2 && VQ2.open && VQ2.open.presetStudio),
    旧ボタンがDOMにある: !!document.querySelector('#appTabBar [data-v2-action="create-quiz"]'),
    コマンドパレット: !!window.__vqCmdk
  }));
  ok("presetStudioV2 が有効", pre.フラグ);
  ok("VQ2.open.presetStudio が呼べる", pre.公開の入口 === "function", pre.公開の入口);
  ok("旧サイドバーのボタンはまだ DOM に残っている（＝踏まれうる）", pre.旧ボタンがDOMにある);
  ok("コマンドパレットがある", pre.コマンドパレット);

  const reset = () => pg.evaluate(() => {
    document.querySelectorAll("#vq2-preset-studio").forEach((n) => n.remove());
    const old = document.getElementById("presetEngineOverlay");
    if (old) old.classList.add("hidden");
    document.body.style.overflow = "";
    const c = document.getElementById("vqCmdk");
    if (c && window.__vqCmdk && window.__vqCmdk.close) window.__vqCmdk.close();
  });

  /* ── ② 旧サイドバーのボタンを直に押す（コマンドパレットが辿る道） ── */
  console.log("\n② 旧サイドバーのボタンを押したとき");
  await reset();
  await pg.evaluate(() => {
    document.querySelector('#appTabBar [data-v2-action="create-quiz"]').click();
  });
  await pg.waitForTimeout(1200);
  const r2 = await pg.evaluate(WHICH);
  ok("新しい作成画面が出る", r2 === "新しい作成画面", r2);

  /* ── ③ コマンドパレットの「クイズを作成」を実際に押す ── */
  console.log("\n③ コマンドパレットから「クイズを作成」を押したとき");
  await reset();
  await pg.evaluate(() => window.__vqCmdk.open());
  await pg.waitForTimeout(600);
  const r3open = await pg.evaluate(() => {
    const host = document.getElementById("vqCmdk");
    if (!host || !host.shadowRoot) return { 開かない: true };
    /* 影DOM の中の実際の作り: 項目は button.it、文字は span.l */
    const items = [...host.shadowRoot.querySelectorAll("button.it")];
    const hit = items.filter((n) => n.textContent.indexOf("クイズを作成") >= 0)[0];
    if (!hit) return { 見つからない: true, 一覧: items.slice(0, 8).map((n) => n.textContent.trim().slice(0, 20)) };
    hit.click();
    return { 押した: true };
  });
  ok("パレットに「クイズを作成」がある", !!r3open.押した,
    r3open.見つからない ? "出ていた項目: " + (r3open.一覧 || []).join(" / ") : (r3open.開かない ? "パレットが開かない" : ""));
  await pg.waitForTimeout(1500);
  const r3 = await pg.evaluate(WHICH);
  ok("★新しい作成画面が出る（ここが直したかった所）", r3 === "新しい作成画面", r3);

  /* ── ④ 新しい画面側の導線は元から正しい。壊していないか ── */
  console.log("\n④ 新しい画面側の導線を壊していない");
  await reset();
  const r4 = await pg.evaluate(() => {
    /* 新しいサイドバーの作成ボタンは #vqShell の影DOM の中にある */
    const sh = document.getElementById("vqShell");
    const b = (sh && sh.shadowRoot && sh.shadowRoot.querySelector('[data-action="create-quiz"]'))
      || document.querySelector('[data-action="create-quiz"], [data-bridge-action="create-quiz"]');
    if (!b) return "ボタンが無い";
    b.click();
    return "押した";
  });
  if (r4 === "押した") {
    await pg.waitForTimeout(1200);
    const w4 = await pg.evaluate(WHICH);
    ok("新しい作成画面が出る", w4 === "新しい作成画面", w4);
  } else {
    ok("新しい導線のボタンがある", false, r4);
  }

  /* ── ⑤ スイッチを切ったら、これまでどおり旧エンジンへ落ちる ── */
  console.log("\n⑤ presetStudioV2 を切ったときは旧エンジンへ落ちる（機能を落とさない）");
  /* ※ ログインしていない状態では旧エンジン自身が
     body.auth-gate-open で開かない作りなので、そこまで渡ったかで見る。 */
  await reset();
  await pg.evaluate(() => VQ2FLAGS.set("presetStudioV2", false));
  await pg.evaluate(() => {
    document.querySelector('#appTabBar [data-v2-action="create-quiz"]').click();
  });
  await pg.waitForTimeout(1200);
  const r5 = await pg.evaluate(() => ({
    どちら: (function () {
      const neu = document.getElementById("vq2-preset-studio");
      if (neu && neu.shadowRoot) return "新しい作成画面";
      const old = document.getElementById("presetEngineOverlay");
      if (old && !old.classList.contains("hidden") && getComputedStyle(old).display !== "none") return "★旧エンジン★";
      return "どちらも出ていない";
    })(),
    ログイン前: document.body.classList.contains("auth-gate-open")
  }));
  ok("新しい作成画面へは行かない（＝旧側へ渡っている）",
    r5.どちら !== "新しい作成画面",
    r5.どちら + (r5.ログイン前 ? "（ログイン前なので旧エンジンも開かない作り）" : ""));
  await pg.evaluate(() => VQ2FLAGS.set("presetStudioV2", true));

  ok("画面エラーが出ていない", errs.length === 0, errs.join(" / "));
  await br.close();
  console.log("\n─────────────────────────────");
  console.log("通過 " + pass + " / 失敗 " + fail);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("落ちた:", e); process.exit(1); });
