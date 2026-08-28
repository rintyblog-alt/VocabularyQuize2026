/* ══════════════════════════════════════════════════════════════════════════
   vqavatar.cjs — **プロフィールの 絵**が、左パネルの 下と
   スマホの 上の アイコンに 出るかを 実物で 見る。

   訴え（2026-08-29）:
     「モバイルのホーム、プリセット画面時に上部にあるアイコン。
       そして アプリ左パネルの下にあるアイコン。これは、ユーザーの
       設定している プロフィール画像にしてください。必ず」

   使い方: VQ_TOKEN=<札> node vqavatar.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const { chromium } = require("playwright");
const BASE = process.env.VQ_BASE || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) {
  console.error("本番では実行しません。"); process.exit(2);
}
const token = process.env.VQ_TOKEN;
if (!token) { console.error("VQ_TOKEN を 渡してください。"); process.exit(2); }
const H = { "Content-Type": "application/json", Authorization: "Bearer " + token };
/* 1x1 の 赤い PNG（目印になれば よい） */
const AVA = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

(async () => {
  const put = await fetch(BASE + "/api/profile/me", {
    method: "PUT", headers: H, body: JSON.stringify({ avatarUrl: AVA })
  }).then((r) => r.json());
  console.log("プロフィール保存:", JSON.stringify({ ok: put.ok, avatar: String(put?.profile?.avatarUrl || "").slice(0, 40) }));

  let 落 = 0;
  const 見 = (ok, 名) => { console.log((ok ? "✓ " : "✗ ") + 名); if (!ok) 落++; };

  for (const [名, 幅, 高] of [["パソコン", 1280, 900], ["スマホ", 390, 844]]) {
    const b = await chromium.launch();
    const page = await b.newPage({ viewport: { width: 幅, height: 高 } });
    await page.addInitScript((tk) => {
      try {
        localStorage.setItem("app.auth.token.v1", tk);
        localStorage.setItem("app.auth.mode.v1", "user");
      } catch (e) {}
    }, token);
    await page.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(9000);

    const 出 = await page.evaluate(() => {
      const 絵 = (el) => {
        if (!el) return "（要素なし）";
        const im = el.tagName === "IMG" ? el : el.querySelector("img");
        if (im && im.getAttribute("src")) return "img:" + im.getAttribute("src").slice(0, 30);
        const bg = el.style && el.style.backgroundImage;
        if (bg && bg !== "none") return "bg:" + bg.slice(0, 30);
        return "字:" + (el.textContent || "").trim().slice(0, 8);
      };
      const 影 = (id, sel) => {
        const h = document.getElementById(id);
        const r = h && h.shadowRoot;
        return r ? 絵(r.querySelector(sel)) : "（影なし:" + id + "）";
      };
      /* 影の 器は id が 分からないので、body 直下の 影を 総当たりで 探す */
      const hosts = Array.from(document.querySelectorAll("*")).filter((e) => e.shadowRoot);
      const 見つけ = (sel) => {
        for (const h of hosts) { const e = h.shadowRoot.querySelector(sel); if (e) return 絵(e); }
        return "（見つからない:" + sel + "）";
      };
      return {
        元: 絵(document.getElementById("appV2SidebarAvatar")),
        左パネル下: 見つけ("[data-avatar]"),
        スマホ上: 見つけ("[data-tb-ava]"),
        影の数: hosts.length,
        覚え: String(localStorage.getItem("app.profile.avatar.v1") || "").slice(0, 30)
      };
    });
    console.log("── " + 名 + " ──", JSON.stringify(出, null, 1));
    見(/^img:data:image/.test(出.元), 名 + ": もとの アイコンが 絵に なっている");
    if (名 === "パソコン") 見(/^img:data:image/.test(出.左パネル下), "左パネルの 下が 絵に なっている");
    if (名 === "スマホ") 見(/^img:data:image/.test(出.スマホ上), "スマホの 上が 絵に なっている");
    await b.close();
  }
  /* ── ③ プロフィールが 取れない ときでも 絵が 出るか ── */
  {
    const b = await chromium.launch();
    const page = await b.newPage({ viewport: { width: 390, height: 844 } });
    await page.addInitScript((引) => {
      try {
        localStorage.setItem("app.auth.token.v1", 引.tk);
        localStorage.setItem("app.auth.mode.v1", "user");
        localStorage.setItem("app.profile.avatar.v1", 引.ava);
      } catch (e) {}
    }, { tk: token, ava: AVA });
    /* プロフィールの 口だけ 落とす（読み込めない ふり） */
    await page.route("**/api/profile/me*", (route) => route.abort());
    await page.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(9000);
    const 出 = await page.evaluate(() => {
      const 絵 = (el) => {
        if (!el) return "（要素なし）";
        const im = el.tagName === "IMG" ? el : el.querySelector("img");
        if (im && im.getAttribute("src")) return "img:" + im.getAttribute("src").slice(0, 30);
        return "字:" + (el.textContent || "").trim().slice(0, 8);
      };
      const hosts = Array.from(document.querySelectorAll("*")).filter((e) => e.shadowRoot);
      const 見つけ = (sel) => { for (const h of hosts) { const e = h.shadowRoot.querySelector(sel); if (e) return 絵(e); } return "（無し）"; };
      return { 左パネル下: 見つけ("[data-avatar]"), スマホ上: 見つけ("[data-tb-ava]") };
    });
    console.log("── プロフィールが 取れない とき ──", JSON.stringify(出));
    見(/^img:data:image/.test(出.スマホ上), "取れなくても スマホ上は 絵の まま");
    見(/^img:data:image/.test(出.左パネル下), "取れなくても 左パネル下は 絵の まま");
    await b.close();
  }
  console.log(`\n落ち ${落} 件`);
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error("✗ 途中で 落ちた:", e && e.stack); process.exit(1); });
