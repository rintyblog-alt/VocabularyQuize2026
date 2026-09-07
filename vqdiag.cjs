/* ══════════════════════════════════════════════════════════════════════════
   vqdiag — セーフエリア診断が **勝手に 出て こない**（2026-09-07・訴え）

   訴え「アプリや Safari で リンクを 開くと この 診断が 出て くるから、
         普段は 非表示で、下部バーから 設定を 長押しした ときだけに して」

   何が 起きて いたか:
     ?diag=safe を 一度 開くと localStorage に 印が 残り、
     そのあと 開く たびに ずっと 3.5 秒後に 出て いた。

   ここで 見る こと:
     ① ふつうに 開いても 出ない（印が 残って いても 出ない）
     ② 下部バーの「設定」を 長押しすると 出る
     ③ 長押しでは なく ふつうに 押したら 設定が 開く（診断は 出ない）
     ④ ?diag=safe は その 回だけ 出る（次に ふつうに 開いたら 出ない）
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const { chromium } = require("playwright");
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
let 合 = 0, 否 = 0; const 落ち = [];
const 見る = (n, c, x) => {
  if (c) { 合++; console.log("  ok   " + n + (x !== undefined ? "  → " + String(x).slice(0, 160) : "")); }
  else { 否++; 落ち.push(n); console.log("  NG   " + n + (x !== undefined ? "  → " + String(x).slice(0, 240) : "")); }
};

/* 診断が 出て いるか。**#vqSafeDiag が 本文に 在るか**だけで 決まる。
   文字で 探すと、設定画面や 影の DOM の 別の 文まで 拾って しまう（実測）。 */
async function 診断が出ているか(pg) {
  return pg.evaluate(() => !!document.getElementById("vqSafeDiag"));
}

(async () => {
  /* ★ **ログインして おく**。していないと 認証画面（#vqNewAuth）が
     画面ぜんたいを 覆い、下部バーを 押しても イベントが 1 つも 届かない。
     手で イベントを 出せば 通るが、それでは 「本当に 押せるか」を
     測って いない ことに なる（実測で 半日 迷った）。 */
  const nick = "diag" + Date.now().toString(36).slice(-6) + Math.floor(Math.random() * 90 + 10);
  const reg = await fetch(BASE + "/api/auth/register", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gradePrefix: "H1", nickname: nick, password: "DevAcc#2026a", tosAccepted: true, tosVersion: "1" })
  }).then(r => r.json()).catch(() => ({}));
  if (!reg || !reg.token) { console.error("アカウントを 作れません（手元サーバを 立てて ください）"); process.exit(2); }

  const br = await chromium.launch();
  const 例外 = [];

  async function 開く(query, 前もって) {
    const ctx = await br.newContext({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript((t) => {
      try {
        localStorage.setItem("app.auth.token.v1", t);
        localStorage.setItem("vq.install.hide.v1", "1");   /* 別の 案内に 邪魔されない */
      } catch (e) { }
    }, reg.token);
    const pg = await ctx.newPage();
    /* ★ addInitScript は 画面が 移る たびに 走る。それだと
       「本体が 消した 直後に また 置く」に なって 何を 見て いるか
       分からなく なる（実測で 踏んだ）。**最初に 1 回だけ** 置く。 */
    if (前もって) {
      await pg.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded", timeout: 60000 });
      await pg.evaluate(前もって);
    }
    pg.on("pageerror", e => 例外.push(e.message));
    await pg.goto(BASE + "/?vqdev=1" + (query || ""), { waitUntil: "domcontentloaded", timeout: 60000 });
    await pg.waitForTimeout(7000);            /* 自動表示は 3.5 秒後。それより 長く 待つ */
    return { ctx, pg };
  }

  /* ★ はじめて 開いた 人にだけ 出る 画面（認証・暗証番号・ようこそ）を どける。
     ここで 見たいのは 「下部バーを 長押しできるか」だけ。
     本体が「じゃま もの」として 数えて いるのと 同じ 顔ぶれ。
     ★ どけた あとも elementFromPoint は 見る。**別の ものが 乗って いたら
       それは 本物の 不具合**なので 見逃さない。 */
  async function 邪魔をどける(pg) {
    await pg.evaluate(() => {
      ["vqPin", "vqNewAuth", "authGate", "firstLaunchOverlay", "vqbFlow", "authBootSplash", "vqLumiTour", "vqQreditCard"]
        .forEach((id) => { const e = document.getElementById(id); if (e) e.remove(); });
    });
    await pg.waitForTimeout(400);
  }

  console.log("\n■ ① ふつうに 開いた とき");
  let { ctx, pg } = await 開く("");
  見る("★ 診断が 出て こない", !(await 診断が出ているか(pg)));
  await ctx.close();

  console.log("\n■ ② 昔の 印が 残って いる 人（いちばんの 訴え）");
  ({ ctx, pg } = await 開く("", () => { try { localStorage.setItem("vq.diag.safe", "1"); } catch (e) { } }));
  見る("★ 印が 残って いても 出て こない", !(await 診断が出ているか(pg)));
  const 印 = await pg.evaluate(() => { try { return localStorage.getItem("vq.diag.safe"); } catch (e) { return "?"; } });
  見る("★ 古い 印が 消えて いる（後始末）", 印 === null, 印);
  await ctx.close();

  console.log("\n■ ③ 下部バーの「設定」を 長押し");
  ({ ctx, pg } = await 開く(""));
  await 邪魔をどける(pg);
  const 場所 = await pg.evaluate(() => {
    const h = document.getElementById("vqMobBar");
    if (!h || !h.shadowRoot) return null;
    const b = h.shadowRoot.querySelectorAll("[data-i]");
    const el = b[b.length - 1];                /* いちばん 右＝設定 */
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, 数: b.length };
  });
  見る("下部バーが 出て いる", !!場所, 場所 ? 場所.数 + " こ" : "見つからない");
  /* ★ 「在る」と「押せる」は 別。上に 何か 乗って いないかを 必ず 見る。 */
  const 上 = await pg.evaluate(([x, y]) => {
    const e = document.elementFromPoint(x, y);
    return e ? (e.id || e.tagName) : null;
  }, [場所 ? 場所.x : 0, 場所 ? 場所.y : 0]);
  見る("★ 設定ボタンが 本当に 押せる（上に 何も 乗って いない）", 上 === "vqMobBar", 上);
  if (場所) {
    await pg.mouse.move(場所.x, 場所.y);
    await pg.mouse.down();
    await pg.waitForTimeout(1600);             /* 1.1 秒 より 長く 押す */
    await pg.mouse.up();
    await pg.waitForTimeout(900);
    見る("★ 長押しで 診断が 出る", await 診断が出ているか(pg));
  }
  await ctx.close();

  console.log("\n■ ④ ふつうに 押した とき（長押しでは ない）");
  ({ ctx, pg } = await 開く(""));
  await 邪魔をどける(pg);
  const 場所2 = await pg.evaluate(() => {
    const h = document.getElementById("vqMobBar");
    if (!h || !h.shadowRoot) return null;
    const b = h.shadowRoot.querySelectorAll("[data-i]");
    const el = b[b.length - 1];
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (場所2) {
    await pg.mouse.click(場所2.x, 場所2.y);
    await pg.waitForTimeout(1200);
    見る("★ ふつうに 押したら 診断は 出ない", !(await 診断が出ているか(pg)));
    const 設定 = await pg.evaluate(() => {
      try { return !!(window.__vqSettingsIsOpen && window.__vqSettingsIsOpen()); } catch (e) { return false; }
    });
    見る("ふつうに 押すと 設定が 開く", 設定);
  }
  await ctx.close();

  console.log("\n■ ⑤ ?diag=safe は その 回だけ");
  ({ ctx, pg } = await 開く("&diag=safe"));
  見る("?diag=safe を 付けた 回は 出る", await 診断が出ているか(pg));
  const 印2 = await pg.evaluate(() => { try { return localStorage.getItem("vq.diag.safe"); } catch (e) { return "?"; } });
  見る("★ 印を 残さない（次から 出なく なる）", 印2 === null, 印2);
  await ctx.close();

  await br.close();
  const 我 = 例外.filter(t => !/ERR_CONNECTION_REFUSED|Failed to load resource/.test(t));
  見る("例外が 出て いない", 我.length === 0, 我.slice(0, 3).join(" / "));

  console.log("\n══ まとめ ══\n  合格 " + 合 + " / 不合格 " + 否);
  if (落ち.length) console.log("  落ちた: " + 落ち.join(" / "));
  console.log("");
  process.exit(否 ? 1 : 0);
})().catch(e => { console.error("落ちました: " + (e && e.stack || e)); process.exit(2); });
