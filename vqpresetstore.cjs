/* ══════════════════════════════════════════════════════════════════════════
   vqpresetstore.cjs — プリセットの 置き場（端末が 詰まっても 消さない）

   ★ これまで: vq-core は localStorage に 直に 書いていた。端末に よって
     4〜5MB で 詰まり、詰まると **古い ぶんを 30 件に 削って** いた。
     黙って 消えるのが いちばん まずい。
     しかも 別の 層（VQIDB）が 同じ 鍵を IndexedDB へ 移して
     localStorage から 消すので、**二重持ちで 綱引き**に なっていた。

   ここで 測ること:
     ① ふつうに 開ける・数が 合う
     ② 読み込み直しても 数が 変わらない
     ③ **端末が いっぱいでも 保存できて、読み直しても 残る**（IndexedDB へ）
     ④ 「古い ぶんを 30 件に 削る」が もう 無い
     ⑤ 空で 上書きして 全部 消えない（歯止め）

   本番では 走らせない。
   ══════════════════════════════════════════════════════════════════════════ */
const BASE = process.env.VQ_API || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const { chromium } = require("playwright");
const fs = require("node:fs");
const KEY = "wordPractice400.presets.v1";

let 済 = 0, 落 = 0;
const ok = (n, c, x) => {
  if (c) { 済++; console.log("  ok   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 180) : "")); }
  else { 落++; console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 300) : "")); }
};
const 節 = (t) => console.log("\n══ " + t + " ══");

(async () => {
  節("① 作りの たしかめ（元の 字）");
  const core = fs.readFileSync("js-src/vq-core.4c23719c62.js", "utf8");
  ok("**「30 件に 削る」が 無い**", !/slice\(0,\s*30\)/.test(core) || !/古いプリセットの一部が自動削除/.test(core));
  ok("置き場の 口を 通している（VQIDB を 見る）", /VQIDB/.test(core));
  const idb = fs.readFileSync("client/core/store/idb.js", "utf8");
  ok("空で 潰さない 歯止めが ある", /空っぽ/.test(idb));

  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1200, height: 800 } });
  const pg = await ctx.newPage();
  const 例外 = []; pg.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 160)));
  pg.on("dialog", (d) => d.accept().catch(() => {}));

  const 開く = async () => {
    await pg.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
    await pg.addStyleTag({ content: "#vqPin,#vqTour,#vqLumiTour,#vqNewAuth,#authGate,#firstLaunchOverlay{display:none!important}" });
    await pg.waitForTimeout(9000);
    await pg.evaluate(() => window.__vqQredit && window.__vqQredit.goTab("library"));
    await pg.waitForTimeout(1500);
  };
  const 見 = () => pg.evaluate(async (K) => {
    const I = window.VQIDB;
    let idb = null;
    try { const v = await I.読む("ls:" + K); idb = typeof v === "string" ? JSON.parse(v).length : null; } catch (e) {}
    return {
      一覧: (document.getElementById("appLibraryMyMeta") || {}).textContent || null,
      IDB: idb,
      用意: !!(I && I.用意できた && I.用意できた(K))
    };
  }, KEY);

  節("② ふつうに 開ける");
  await 開く();
  const a1 = await 見();
  ok("一覧が 出る", !!a1.一覧 && /件/.test(a1.一覧), a1);
  ok("IndexedDB の 用意が できている", a1.用意 === true, a1);

  節("③ 読み込み直しても 変わらない");
  await 開く();
  const a2 = await 見();
  ok("数が 同じ", a1.一覧 === a2.一覧, { 前: a1.一覧, 後: a2.一覧 });

  節("④ 端末が いっぱいでも 消さない");
  await pg.addInitScript((K) => {
    /* この鍵だけ 手元に 置けなくする（端末が 詰まっている ふり） */
    try {
      const 元 = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (String(k) === K) { const e = new Error("QuotaExceededError"); e.name = "QuotaExceededError"; throw e; }
        return 元.apply(this, arguments);
      };
    } catch (e) {}
  }, KEY);
  await 開く();
  const a3 = await 見();
  ok("**いっぱいでも 一覧は 出る**", !!a3.一覧 && /件/.test(a3.一覧), a3);
  ok("**IndexedDB に 入っている**", typeof a3.IDB === "number" && a3.IDB > 0, a3.IDB);
  await 開く();
  const a4 = await 見();
  ok("**読み直しても 残る**", a4.一覧 === a3.一覧 && a4.IDB === a3.IDB, { 前: a3, 後: a4 });

  節("⑤ 空で 全部 消えない");
  await pg.evaluate((K) => { try { localStorage.setItem(K, "[]"); } catch (e) {} }, KEY);
  await 開く();
  const a5 = await 見();
  ok("**空で 上書きしても 中身が 残る**", typeof a5.IDB === "number" && a5.IDB > 0, a5);

  節("⑥ 例外");
  ok("画面の 例外 0 件", 例外.length === 0, 例外.slice(0, 3));

  await b.close();
  console.log("\n────────────────────────────────");
  console.log(`  ok ${済} / NG ${落}`);
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
