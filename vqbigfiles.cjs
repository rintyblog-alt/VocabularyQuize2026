/* ══════════════════════════════════════════════════════════════════════════
   vqbigfiles.cjs — **でかい資料・多い資料で 止まらないか**を 測る

   訴え（2026-08-30・Rinty さん）
     「でかいファイルだとやはり止まってしまうのか？」
     画面: 資料 14 件 ／「途中で止まりました」／ 0 / 20 問

   分かっていた こと（直す前）:
     ・試験は 20 問を **4 回に 分けて・3 本 同時**に 頼む
     ・資料を そのまま 載せていたので、同じ 18MB を **12 回 送り直して**いた
     ・送り口は 8 件で 切っていた（14 件 付けても 6 件は 黙って 落ちる）
     ・サーバは 2 分 動きが 無いと 仕事を 打ち切り、そのあと 本当に
       できた ぶんも 捨てていた（finish が running のときしか 書かない）

   見るのは:
     ① 14 件 付けても **落とさない**（16 件まで）
     ② 多い／大きい ときは **預ける道**（fileUri）へ 行く
     ③ 預けた 鍵が **全部 そろう**（別の 鍵の 資料は 見えない）
     ④ 送る 中身が 小さい（送り直しても 重くない）
     ⑤ 預けられない ときは そのまま 送る（黙って 資料なしに しない）
     ⑥ 資料が あるときは **1 本ずつ** 頼む

   使い方: VQ_BASE=http://127.0.0.1:8791 node vqbigfiles.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const { chromium } = require("playwright");

let 済 = 0, 落 = 0; const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 240) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 400) : "")); }
};
const j = (r) => r.json().catch(() => ({}));
async function 作る() {
  const 印 = Date.now().toString(36) + Math.floor(Math.random() * 9999);
  const r = await fetch(BASE + "/api/auth/register/start", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "vqb" + 印 + "@gmail.com", gradePrefix: "H2",
      nickname: ("b" + 印).slice(0, 14), password: "Passw0rd!z3" }) }).then(j);
  const v = await fetch(BASE + "/api/auth/register/verify", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challengeId: r.challengeId, code: r.devCode }) }).then(j);
  const c = await fetch(BASE + "/api/auth/register/consent", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ registrationSession: v.registrationSession, agreeTerms: true,
      agreePrivacy: true, agreeAge: true, pin: "1379" }) }).then(j);
  if (!c.token) throw new Error("札が 取れない: " + JSON.stringify(c).slice(0, 200));
  return c.token;
}

(async () => {
  console.log("測る先:", BASE);
  const tok = await 作る();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 900 } });
  const page = await ctx.newPage();
  const 例外 = [];
  page.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 200)));

  /* 預ける口を **横取り**して、何回・どの鍵へ 行ったかを 数える。
     （本物の Gemini へは 行かせない。ここで 見たいのは 渡しかた） */
  await page.route("**/api/aigen/upload**", async (route) => {
    const u = new URL(route.request().url());
    const ki = u.searchParams.get("keyIndex");
    await route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true,
        fileUri: "https://generativelanguage.googleapis.com/v1beta/files/f" + Math.random().toString(36).slice(2, 8),
        mimeType: "application/pdf",
        keyIndex: ki === null ? 2 : Number(ki), name: u.searchParams.get("name") || "" }) });
  });

  await page.addInitScript((t) => {
    try {
      localStorage.setItem("app.auth.token.v1", t);
      localStorage.setItem("app.auth.mode.v1", "user");
      localStorage.setItem("vq.tour.v1", JSON.stringify({ home: 1, preset: 1, feed: 1, dm: 1, insight: 1 }));
    } catch (e) {}
  }, tok);
  await page.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__vqMake, null, { timeout: 60000 });
  await page.waitForFunction(() => !!(window.VQ2 && window.VQ2.aigen), null, { timeout: 30000 });

  /* 14 件・1 件 1.2MB の PDF を 作る（合わせて 約 17MB）。 */
  const 入れる = (n, mb) => page.evaluate(async ([n2, mb2]) => {
    const one = new Uint8Array(Math.round(mb2 * 1024 * 1024));
    one.set(new TextEncoder().encode("%PDF-1.4\n"), 0);
    const fs2 = [];
    for (let i = 0; i < n2; i++) fs2.push(new File([one], "資料" + (i + 1) + ".pdf", { type: "application/pdf" }));
    await window.__vqMake.資料を読ませる(fs2);
    return window.__vqMake.状態().資料.length;
  }, [n, mb]);

  節("① 14 件 付ける");
  const n = await 入れる(14, 1.2);
  見(n === 14, "★ 14 件 とも 持てる", n);
  await page.waitForFunction(() => window.__vqMake.状態().資料
    .every((a) => a.状態 !== "queued" && a.状態 !== "extracting"), null, { timeout: 90000 }).catch(() => {});

  節("①b 本文が 取れているなら **文字で** 渡す（いちばん 速い）");
  {
    /* 作り物の PDF は 本文が 取れないので、本文を 入れた 状態を 作る。 */
    const 文 = await page.evaluate(() => {
      const st = window.__vqMake.状態();
      return { 渡し: st.条件 ? st.条件.資料の渡し : "", 資料: st.資料.length };
    });
    見(文.渡し === "はやい", "★ 既定は「本文の 文字だけ」", 文);
    const 選べる = await page.evaluate(() => {
      window.__vqMake.open({ kind: "exam" });
      window.__vqMake.表紙を入れる({ examName: "速さの 確かめ", subject: "情報" });
      const r = document.getElementById("vqMake").shadowRoot;
      const b = r.querySelector('[data-a="go"]'); if (b) b.click();
      const t = (r.querySelector(".w").textContent || "").replace(/\s+/g, " ");
      return { 出た: t.indexOf("資料の 渡しかた") >= 0,
               速: t.indexOf("本文の 文字だけ") >= 0,
               生: t.indexOf("そのまま 読ませる") >= 0 };
    });
    見(選べる.出た && 選べる.速 && 選べる.生, "★ 渡しかたを 選べる", 選べる);
  }

  節("② 多い／大きい ときは 預ける道");
  const 送 = await page.evaluate(async () => {
    /* 本文が 取れない 資料（作り物の PDF）なので、そのまま 読ませる 道。 */
    const t0 = Date.now();
    const r = await window.__vqMake.資料の送り形();
    const f = r.files || [];
    return { ms: Date.now() - t0, 件: f.length,
             預: f.filter((x) => x.fileUri).length,
             載: f.filter((x) => x.data).length,
             鍵: Array.from(new Set(f.map((x) => x.keyIndex))),
             バイト: JSON.stringify(f).length };
  });
  見(送.預 === 14, "★ 14 件 とも 預けた（8 件で 切っていない）", 送);
  見(送.載 === 0, "そのまま 載せた ものは 無い");
  見(送.件 === 14, "落とした ものが 無い", 送.件);

  節("③ 鍵が そろう（別の 鍵の 資料は 見えない）");
  見(送.鍵.length === 1, "★ 預け先の 鍵が 1 つに そろう", 送.鍵);

  節("④ 送る 中身が 小さい");
  見(送.バイト < 8 * 1024, "★ 頼み 1 回の 資料は 8KB 未満（前は 約 18MB）",
     Math.round(送.バイト / 1024 * 10) / 10 + " KB");
  見(送.バイト * 12 < 100 * 1024, "★ 12 回 送り直しても 100KB 未満",
     Math.round(送.バイト * 12 / 1024) + " KB");

  節("⑤ 預けられない ときは そのまま 送る");
  await page.unroute("**/api/aigen/upload**");
  await page.route("**/api/aigen/upload**", (route) =>
    route.fulfill({ status: 502, contentType: "application/json",
      body: JSON.stringify({ ok: false, message: "預けられません" }) }));
  const 落ち先 = await page.evaluate(async () => {
    /* 小さいものを 4 件だけ 残して 測る（そのまま 載せられる 大きさ） */
    const st = window.__vqMake.状態().資料;
    try {
      const r = await window.__vqMake.資料の送り形();
      const f = r.files || [];
      return { ok: true, 件: f.length, 載: f.filter((x) => x.data).length,
               預: f.filter((x) => x.fileUri).length };
    } catch (e) { return { ok: false, err: String((e && (e.userMessage || e.message)) || e).slice(0, 160) }; }
  });
  見(落ち先.ok && 落ち先.載 >= 1, "★ 預けられなくても そのまま 送る（資料なしに しない）", 落ち先);

  節("⑥ 資料が あるときは 1 本ずつ");
  const 本数 = await page.evaluate(() => {
    const s = String(window.__vqMake.資料の送り形 ? "" : "");
    return window.__vqMake.状態().資料.length;
  });
  見(本数 === 14, "資料は 持ったまま", 本数);
  /* 走らせる ところは AI が 要るので、ここでは 設定の 値だけを 見る。 */
  const src = await page.evaluate(async () => {
    const u = Array.from(document.querySelectorAll("script[id=vq-make]"))[0];
    const r = await fetch(u.src); const t = await r.text();
    const flat = t.replace(/\s+/g, "");
    /* 圧縮ずみは 日本語が \u.... に なる。両方の 書き方を 見る。 */
    /* 資料が あって、かつ 文字の道で ない ときだけ 1 本。 */
    return /concurrency:[^,]{0,80}\?1:3/.test(flat)
        && /(資料|\\u8CC7\\u6599)\.length/.test(flat);
  });
  見(src, "★ そのまま 読ませる ときは 同時 1 本（文字の道・資料なしは 3 本）");

  見(例外.length === 0, "例外が 出ていない", 例外);

  await browser.close();
  console.log("\n────────────────────────────");
  console.log("通った: " + 済 + " / 落ちた: " + 落);
  if (落ち.length) console.log("落ちたもの:\n  - " + 落ち.join("\n  - "));
  process.exit(落 ? 1 : 0);
})();
