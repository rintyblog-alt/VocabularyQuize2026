#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqwritetui.cjs — 文章添削（校正モード）の 画面（2026-08-31・訴え）。

   見るもの:
     ① サイドバーから 開く（タブを 触らない・窓として 出る）
     ② 3 列（入力／差分／評価）が 出る。狭い 画面では 積む
     ③ 差分が **消した ところ と 足した ところ**に 分かれる
     ④ 指示欄・字数・種類・資料が ある
     ⑤ 文字が あるのに 幅 0 の 部品が ない（vqsurvivefit と 同じ 見かた）
     ⑥ 例外 0 件

   使い方: node vqwritetui.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || process.env.VQ_API || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では 実行しません。"); process.exit(2); }
const { chromium } = require("playwright");
const 待 = (m) => new Promise((s) => setTimeout(s, m));
let 済 = 0, 落 = 0; const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 220) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 340) : "")); }
};

(async () => {
  console.log("測る先:", BASE);
  const b = await chromium.launch();
  const 例外 = [];
  for (const [名, vp] of [["机 1440", { width: 1440, height: 900 }], ["スマホ 390", { width: 390, height: 844 }]]) {
    const ctx = await b.newContext({ viewport: vp, hasTouch: vp.width < 800 });
    const pg = await ctx.newPage();
    pg.on("pageerror", (e) => 例外.push(名 + ": " + String(e.message).slice(0, 140)));
    await pg.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await pg.waitForFunction(() => !!window.__vqWrite, null, { timeout: 40000 });
    await pg.evaluate(() => { const f = () => { document.body.classList.remove("auth-booting","auth-gate-open","first-launch-open");
      for (const id of ["authGate","authBootSplash","firstLaunchOverlay","globalLoadingOverlay","vqTour","vqNewAuth","vqNewsFlash"]) {
        const e = document.getElementById(id); if (e) { e.classList.add("hidden"); e.style.display = "none"; } } }; f(); setInterval(f, 150); });

    節("① 開く（" + 名 + "）");
    /* ★ サイドバーは **vq-shell が 影の DOM で 作り直す**（2026-08-31 に つまずいた）。
       旧 #appTabBar の ボタンは 見えなく なる ので、
       **新しい ほうに 出て いるか**を 見ないと 意味が ない。 */
    await pg.waitForFunction(() => {
      const h = document.getElementById("vqShell");
      return !!(h && h.shadowRoot && h.shadowRoot.querySelector("[data-fn]"));
    }, null, { timeout: 30000 }).catch(() => {});
    const 新 = await pg.evaluate(() => {
      const h = document.getElementById("vqShell");
      if (!h || !h.shadowRoot) return { なし: true };
      const b = h.shadowRoot.querySelector('[data-fn="write"]');
      return { ある: !!b, 文: b ? (b.textContent || "").trim() : "",
               並: Array.from(h.shadowRoot.querySelectorAll("[data-fn],[data-tab]"))
                 .map((x) => (x.textContent || "").trim()).filter(Boolean).slice(0, 14) };
    });
    見(新.ある, "★★ **新しい サイドバー（vq-shell）に 出て いる**", 新);
    見(/文章添削/.test(新.文 || ""), "名前が 「文章添削」", 新.文);
    見(await pg.evaluate(() => !!document.querySelector("[data-vq-write]")), "旧サイドバーにも 入口が ある（控え）");
    const 前タブ = await pg.evaluate(() => document.body.getAttribute("data-app-tab"));
    /* 新しい サイドバーから 押す（人が 押すのは こちら）。 */
    await pg.evaluate(() => {
      const h = document.getElementById("vqShell");
      const b = h && h.shadowRoot && h.shadowRoot.querySelector('[data-fn="write"]');
      if (b) b.click(); else document.querySelector("[data-vq-write]").click();
    });
    await 待(400);
    const 状 = await pg.evaluate(() => window.__vqWrite.state());
    見(状.開 === true, "★ 押すと 開く", 状);
    見(await pg.evaluate(() => document.body.getAttribute("data-app-tab")) === 前タブ,
      "★ **タブを 触らない**（いま 見て いた 画面を 壊さない）", 前タブ);

    節("② 中身（" + 名 + "）");
    const 中 = await pg.evaluate(() => {
      const r = document.getElementById("vqWrite").shadowRoot;
      const q = (s) => r.querySelector(s);
      const cols = q(".cols");
      return {
        題: q(".ttl") ? q(".ttl").textContent.replace(/\s+/g, "") : "",
        列: cols ? getComputedStyle(cols).gridTemplateColumns.split(" ").length : 0,
        タブ: Array.from(r.querySelectorAll(".tab")).map((x) => x.textContent),
        入力: !!q('textarea[data-f="text"]'),
        指示: !!q('textarea[data-f="instruction"]'),
        種類: !!q('input[data-f="kind"]'),
        字数: !!q('input[data-f="maxChars"]'),
        実行: !!q('[data-a="run"]'),
        幅: r.host.getBoundingClientRect().width
      };
    });
    見(/文章添削（校正モード）Beta/.test(中.題), "題が 出る", 中.題);
    見(中.入力 && 中.指示, "★ 文章の 欄と **指示の 欄**が ある", 中);
    見(中.種類 && 中.字数, "★ 種類と 字数を 決められる");
    見(中.タブ.length === 2 && /資料/.test(中.タブ[1]), "★ 「資料から 書く」に 切り替えられる", 中.タブ);
    見(中.実行, "実行の ボタンが ある");
    if (名 === "机 1440") 見(中.列 === 3, "★ 机では 3 列", 中.列);
    else 見(中.列 === 1, "★ スマホでは 1 列に 積む", 中.列);

    節("③ 差分（" + 名 + "）");
    const d = await pg.evaluate(() => {
      const D = window.__vqWrite.diff("私は走った。とても楽しい。", "私は毎朝走った。とても楽しかった。");
      return { 全: D.length, 消: D.filter((x) => x.t === "del").length,
               足: D.filter((x) => x.t === "add").length, 同: D.filter((x) => x.t === "same").length,
               中身: D.map((x) => x.t + ":" + x.v).slice(0, 6) };
    });
    見(d.消 > 0 && d.足 > 0, "★ 消した ところ と 足した ところに 分かれる", d);
    見(d.同 > 0, "★ **変えて いない ところは そのまま**（全部 置き換えに しない）", d.同);
    const d2 = await pg.evaluate(() => window.__vqWrite.diff("同じ文。", "同じ文。"));
    見(d2.length === 1 && d2[0].t === "same", "同じ 文なら 差分は 出ない", d2);

    節("④ 幅 0 の 文字が ない（" + 名 + "）");
    const 潰 = await pg.evaluate(() => {
      const r = document.getElementById("vqWrite").shadowRoot;
      const bad = [];
      for (const el of r.querySelectorAll("*")) {
        let t = ""; for (const n of el.childNodes) if (n.nodeType === 3) t += n.nodeValue;
        t = t.replace(/\s+/g, ""); if (!t) continue;
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        const b2 = el.getBoundingClientRect();
        if (b2.height >= 1 && b2.width < 1) bad.push({ c: String(el.className).slice(0, 24), t: t.slice(0, 12) });
      }
      return bad;
    });
    見(潰.length === 0, "文字が あるのに 幅 0 の 部品が ない", 潰);
    const はみ = await pg.evaluate(() => {
      const r = document.getElementById("vqWrite").shadowRoot;
      const W = window.innerWidth; const out = [];
      for (const el of r.querySelectorAll(".card,.btn,.ta,.tabs")) {
        const b2 = el.getBoundingClientRect();
        if (b2.width > 0 && b2.right > W + 1.5) out.push(String(el.className).slice(0, 24));
      }
      return out;
    });
    見(はみ.length === 0, "横に はみ出して いない", はみ);

    節("⑤ 結果の 見せかた（" + 名 + "）");
    /* AI を 呼ばずに、返って くる 形を 差し込んで 見た目だけ 見る。 */
    await pg.evaluate(() => window.__vqWrite.__show({
      ok: true, mode: "proofread", model: "live",
      original: "私は走った。とても楽しい。", chars: 13,
      revised: "私は【何時】に【どこ】を走った。とても楽しかった。", revisedChars: 25,
      grade: "C", gradeNote: "具体が 足りません。",
      good: ["走った ことが 書けて います。"],
      improve: ["いつ・どこを 走ったかを 書きましょう。"],
      rewrites: [{ from: "とても楽しい", to: "とても楽しかった" }],
      advice: [{ title: "説得力・具体性", body: "数と 場所を 入れると あなたの 文章に なります。" }],
      questions: ["いつ、どこを 走りましたか。"],
      invented: ["3"], aiWords: []
    }));
    await 待(300);
    const 見せ = await pg.evaluate(() => {
      const r = document.getElementById("vqWrite").shadowRoot;
      const 色 = (sel) => { const e = r.querySelector(sel); if (!e) return null;
        const cs = getComputedStyle(e); return { c: cs.color, bg: cs.backgroundColor, w: e.getBoundingClientRect().width }; };
      const 箱 = Array.from(r.querySelectorAll(".warn"));
      return {
        評価: (r.querySelector(".gr-b") || {}).textContent,
        削: r.querySelectorAll(".del").length, 足: r.querySelectorAll(".add").length,
        注意: 箱.length,
        札: (r.querySelector(".warn.ph") || {}).textContent || "",
        質問: (r.querySelector(".warn.ok") || {}).textContent || "",
        作り: (箱[0] || {}).textContent || "",
        助言: r.querySelectorAll(".acc").length,
        文字数: Array.from(r.querySelectorAll(".cnt")).map((x) => x.textContent).filter((x) => /文字/.test(x)),
        質問色: 色(".warn.ok .ul li")
      };
    });
    見(見せ.評価 === "C", "総合評価が 出る", 見せ.評価);
    見(見せ.削 > 0 && 見せ.足 > 0, "差分に 消し と 足しが 出る", { 削: 見せ.削, 足: 見せ.足 });
    見(/元の 文章に 無い 数/.test(見せ.作り), "★ **作り話を 隠さない**（元に 無い 数を 出す）");
    見(/あなたに しか 書けない/.test(見せ.札) && /【何時】/.test(見せ.札),
      "★ **空欄の 札**を 数えて 出す");
    見(/いつ、どこを 走りましたか/.test(見せ.質問), "★ 聞きたい ことが 出る");
    見(見せ.質問色 && 見せ.質問色.w > 40, "★ 聞きたい ことの 文字に **幅が ある**（消えて いない）", 見せ.質問色);
    見(!/\*\*/.test(見せ.札 + 見せ.作り), "★ ** が そのまま 出て いない", 見せ.札.slice(0, 40));
    見(見せ.助言 === 1, "助言が 畳んで 出る", 見せ.助言);
    {
      const 数 = 見せ.文字数.filter((x) => /文字/.test(x));
      const 出た = 数.join(" ").match(/(\d+) 文字/g) || [];
      見(new Set(出た.filter((x) => /2[0-9] 文字/.test(x))).size <= 1,
        "★ **同じ 文章の 文字数が 2 通り 出ない**", 出た);
    }

    節("⑥ 閉じる（" + 名 + "）");
    await pg.evaluate(() => document.getElementById("vqWrite").shadowRoot.querySelector('[data-a="close"]').click());
    await 待(200);
    見((await pg.evaluate(() => window.__vqWrite.state())).開 === false, "閉じられる");
    await ctx.close();
  }

  節("⑦ 例外");
  const 実 = 例外.filter((m) => !/ResizeObserver|Non-Error|Load failed|NetworkError|Failed to fetch/i.test(m));
  見(実.length === 0, "実害の ある 例外が 0 件", 実.slice(0, 3));

  console.log("\n────────────────────────────────");
  console.log("  ok " + 済 + " / NG " + 落);
  if (落) console.log("  落ちた: " + 落ち.join(" / "));
  await b.close();
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
