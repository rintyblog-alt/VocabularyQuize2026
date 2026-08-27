/* ══════════════════════════════════════════════════════════════════════════
   vqsetjump.cjs — アプリ内検索から「その設定そのもの」へ飛べるか

   訴え（2026-08-18）: 検索で設定を選んでも iPhone だけ飛べない。
   正体: 狭い画面では設定の右ペイン(.main)が display:none で、
         一覧のまま止まっていた。行は作られていたが誰にも見えていなかった。

   見るところ:
     ① 検索の候補に設定が出る
     ② 選ぶと **その行が画面に出ている**（作られているだけでは不可）
     ③ その行に印が付いている（どれのことか分かる）
     ④ 分類の見出しが、その設定の分類になっている
     ⑤ モバイルは「戻る」で一覧へ帰れる（iOS 設定と同じ行き来）
     ⑥ 実機に近い WebKit でも同じ

   使い方: node vqsetjump.cjs
   ══════════════════════════════════════════════════════════════════════════ */
const { chromium, webkit, devices } = require("playwright");

const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  NG   " + n + (x ? "  → " + x : ""))); };

/* 分類の違う設定を選ぶ。1 つの束だけ通っても意味がない。 */
const 狙い = [
  { 語: "文字の大きさ", id: "display.fontSize", 分類: "画面と表示" },
  { 語: "通知音",       id: "sound.notify",     分類: "音" },
  { 語: "角の丸み",     id: "display.radius",   分類: "画面と表示" }
];

async function boot(pg) {
  await pg.goto(BASE + "/?vqdev=1&cb=" + Date.now(), { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(4500);
  await pg.evaluate(() => {
    ["firstLaunchOverlay","vqbFlow","vqNewAuth","authGate","authBootSplash","vqOnboardingOverlay"].forEach((id) => {
      const e = document.getElementById(id);
      if (e) { e.hidden = true; e.style.setProperty("display","none","important"); }
    });
    document.querySelectorAll('[data-act="dlg-x"],[data-act="dlg-o"]').forEach((x) => x.click());
    document.body.classList.remove("auth-booting","auth-gate-open");
    const a = document.getElementById("app"); if (a) a.style.setProperty("display","block","important");
    document.body.setAttribute("data-ui-v2","1");
    try { localStorage.setItem("vq.tour.v1", JSON.stringify({ settings: 1 })); } catch (e) {}
    const sk = document.getElementById("vqObSkipBtn"); if (sk) sk.click();
  });
  await pg.waitForTimeout(1800);
}

/* 検索を「実際の導線から」開く。モバイルは上の検索欄、PC は ⌘K。 */
async function 検索を開く(pg, モバイル) {
  if (モバイル) {
    const 押せた = await pg.evaluate(() => {
      const h = document.getElementById("vqTopbar");
      const q = h && h.shadowRoot && h.shadowRoot.querySelector("[data-tb-q]");
      if (!q) return false;
      q.click();
      return true;
    });
    if (押せた) { await pg.waitForTimeout(500); return "上の検索欄"; }
  } else {
    await pg.keyboard.press("Meta+k");
    await pg.waitForTimeout(500);
    if (await pg.evaluate(() => !!(window.__vqCmdk && window.__vqCmdk.isOpen()))) return "⌘K";
  }
  await pg.evaluate(() => window.__vqCmdk && window.__vqCmdk.open());
  await pg.waitForTimeout(500);
  return "API";
}

async function 一件試す(pg, 名, モバイル, x) {
  const 経路 = await 検索を開く(pg, モバイル);
  const 開いた = await pg.evaluate(() => !!(window.__vqCmdk && window.__vqCmdk.isOpen()));
  ok(`${名} / ${x.語}: 検索が開く（${経路}）`, 開いた);
  if (!開いた) return;

  const 候補 = await pg.evaluate((語) => {
    const r = document.getElementById("vqCmdk").shadowRoot;
    const inp = r.querySelector("[data-q]");
    inp.value = 語;
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    return Array.from(r.querySelectorAll(".it")).map((b) => b.textContent.trim());
  }, x.語);
  await pg.waitForTimeout(250);
  const 候補2 = await pg.evaluate(() => Array.from(document.getElementById("vqCmdk").shadowRoot.querySelectorAll(".it")).map((b) => b.textContent.trim()));
  ok(`${名} / ${x.語}: 候補に出る`, 候補2.some((t) => t.indexOf(x.語) >= 0), JSON.stringify(候補2.slice(0, 4)) || JSON.stringify(候補.slice(0, 4)));

  await pg.evaluate((語) => {
    const r = document.getElementById("vqCmdk").shadowRoot;
    const b = Array.from(r.querySelectorAll(".it")).filter((t) => t.textContent.indexOf(語) >= 0)[0];
    if (b) b.click();
  }, x.語);
  await pg.waitForTimeout(1500);

  const s = await pg.evaluate((id) => {
    const h = document.getElementById("vqSettings");
    if (!h) return null;
    const r = h.shadowRoot;
    const m = r.querySelector(".modal");
    const sel = '[data-set="' + id + '"],[data-num="' + id + '"]';
    const hit = r.querySelector(sel);
    const row = hit && hit.closest ? hit.closest(".row") : null;
    const rect = row ? row.getBoundingClientRect() : null;
    /* 「作られている」ではなく「本当に見えている」で見る。 */
    const 見えている = !!(row && row.getClientRects().length > 0
      && rect.width > 0 && rect.height > 0
      && rect.bottom > 0 && rect.top < (window.innerHeight || 0));
    return {
      設定開いた: document.body.classList.contains("vqset-open"),
      詳細: !!(m && m.classList.contains("is-detail")),
      見出し: (r.querySelector(".head__t") || {}).textContent || "",
      行がある: !!row,
      見えている: 見えている,
      印: !!(row && row.classList.contains("is-found")),
      戻るが押せる: !!(r.querySelector("[data-back]") && r.querySelector("[data-back]").getClientRects().length)
    };
  }, x.id);

  ok(`${名} / ${x.語}: 設定が開く`, !!(s && s.設定開いた));
  ok(`${名} / ${x.語}: **その行が画面に出ている**`, !!(s && s.見えている), JSON.stringify(s));
  ok(`${名} / ${x.語}: その行に印が付く`, !!(s && s.印));
  ok(`${名} / ${x.語}: 分類が「${x.分類}」`, !!(s && s.見出し === x.分類), s && s.見出し);

  if (モバイル) {
    ok(`${名} / ${x.語}: 戻るが押せる`, !!(s && s.戻るが押せる));
    const 帰れた = await pg.evaluate(() => {
      const r = document.getElementById("vqSettings").shadowRoot;
      const b = r.querySelector("[data-back]");
      if (b) b.click();
      return !r.querySelector(".modal").classList.contains("is-detail")
        && r.querySelector(".mlist").getClientRects().length > 0;
    });
    ok(`${名} / ${x.語}: 戻ると一覧へ帰る`, 帰れた);
  }

  await pg.evaluate(() => window.__vqCloseSettings && window.__vqCloseSettings());
  await pg.waitForTimeout(350);
}

async function 一台(browserType, 名, ctxOpts, モバイル) {
  const b = await browserType.launch({ headless: true });
  const ctx = await b.newContext(ctxOpts);
  const pg = await ctx.newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e.message).slice(0, 120)));
  console.log(`\n── ${名} ──`);
  await boot(pg);
  for (const x of 狙い) await 一件試す(pg, 名, モバイル, x);
  ok(`${名}: JS エラー 0 件`, errs.length === 0, errs.slice(0, 3).join(" / "));
  await b.close();
}

(async () => {
  console.log("検索 → 設定の行へ飛ぶ  (" + BASE + ")");
  await 一台(chromium, "PC 1440",        { viewport: { width: 1440, height: 900 } }, false);
  await 一台(chromium, "iPhone 14",      { ...devices["iPhone 14"] },                true);
  await 一台(webkit,   "iPhone 14 (Safari)", { ...devices["iPhone 14"] },            true);
  console.log(`\n合計: ${pass} / ${pass + fail}`);
  process.exit(fail ? 1 : 0);
})();
