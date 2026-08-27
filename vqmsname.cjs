/* ══════════════════════════════════════════════════════════════════════════
   vqmsname.cjs — アイコンの 名前が **手元の 書体に 入っているか**を 全部 測る

   訴え（2026-08-20）:
     「モバイルの ストレージ、見やすさ・使いやすさの アイコンが おかしい。
       英語が 剥き出しの ままだよ」

   ★ なぜ こうなるか
     Material Symbols は **合字**で 絵を 出す。
     書体に その名前の 合字が 無ければ、名前が **そのまま 文字で 出る**。
     手元に 置いてある 書体は 415 種類に 絞ってあるので、
     そこに 無い 名前を 書くと 必ず この 見た目に なる。
     実測（2026-08-20・本当に 抜けていた 6 つ）:
       accessibility_new 408px / database 192px / expand_less 264px /
       format_bold 264px / format_italic 312px / format_underlined 408px
     （絵に なっていれば 24px 前後）

   ★ どう 測るか
     ・Google へは **行かせない**（手元の 書体だけで 測る）
     ・コードに 書いてある 名前を 全部 拾って、1 つずつ 幅を 測る
     ・実際の 画面（モバイルの 設定一覧・ホーム）も 開いて、
       出ている .ms / .vq2-ms が 1 つも 文字に なっていないことを 見る

   使い方: node vqmsname.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

let 済 = 0, 落 = 0; const 印 = []; const 落ち = [];
function ok(名, 真, 補) {
  if (真) { 済++; 印.push("  ✅ " + 名 + (補 === undefined ? "" : "  " + 短(補))); }
  else { 落++; 落ち.push(名); 印.push("  ❌ " + 名 + (補 === undefined ? "" : "  → " + 短(補))); }
}
function 短(v) { const s = typeof v === "string" ? v : JSON.stringify(v); return String(s).slice(0, 400); }
function 節(t) { 印.push("\n── " + t + " " + "─".repeat(Math.max(0, 54 - t.length))); }

/* ── コードに 書いてある 名前を 集める ─────────────────────────── */
function 名前を集める() {
  const 集 = new Map();          /* 名前 → どこに あったか */
  const 足す = (n, どこ) => {
    if (!/^[a-z][a-z0-9_]{2,39}$/.test(n)) return;
    if (!集.has(n)) 集.set(n, どこ);
  };
  const 見る = (p) => {
    const s = fs.readFileSync(p, "utf8");
    const 名 = path.basename(p);
    /* <span class="… ms …">name</span> の 形 */
    const re1 = /class=\\?["'][^"']*(?:\bms\b|vq2-ms|material-symbols[a-z-]*)[^"']*\\?["'][^>]*>([a-z0-9_]{3,40})</g;
    let m; while ((m = re1.exec(s))) 足す(m[1], 名);
    /* 設定の 束（GROUPS）の ms: "name" */
    const re2 = /\bms:\s*["']([a-z0-9_]{3,40})["']/g;
    while ((m = re2.exec(s))) 足す(m[1], 名);
  };
  for (const f of fs.readdirSync("js-src")) if (f.endsWith(".js")) 見る(path.join("js-src", f));
  見る(path.join("client", "index.html"));
  return 集;
}

(async () => {
  const 集 = 名前を集める();
  const 名 = [...集.keys()].sort();

  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  /* ★ Google へは 行かせない。手元の 書体だけで 測る
     （行けてしまうと、届いた 端末では 通り、届かない 端末で 化ける）。 */
  await ctx.route("**://fonts.googleapis.com/**", (r) => r.abort());
  await ctx.route("**://fonts.gstatic.com/**", (r) => r.abort());
  const p = await ctx.newPage();
  const 赤 = [];
  p.on("pageerror", (e) => 赤.push(String(e.message).slice(0, 160)));
  await p.goto(BASE + "/?vqdev=1&cb=" + Date.now(), { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(4500);

  節("① 手元の 書体が 当たっている");
  const 書 = await p.evaluate(async () => {
    await (document.fonts ? document.fonts.ready : Promise.resolve());
    const l = document.querySelector('link[href*="/css/material-symbols."]');
    let 面 = [];
    try { document.fonts.forEach((f) => { if (/Material/.test(f.family)) 面.push(f.family + "/" + f.status); }); } catch (e) {}
    return { css: l ? l.getAttribute("href") : "", 面: 面 };
  });
  ok("アイコンの CSS を 読んでいる", /\/css\/material-symbols\./.test(書.css || ""), 書.css);
  ok("書体が 実際に 読み込まれた", 書.面.some((x) => /loaded/.test(x)), 書.面);

  節("② コードに 書いてある 名前が 全部 絵に なるか");
  ok("名前を 集められた", 名.length >= 100, 名.length + " 個");
  const 幅 = await p.evaluate(async (names) => {
    await (document.fonts ? document.fonts.ready : Promise.resolve());
    const box = document.createElement("div");
    box.style.cssText = "position:fixed;left:-9999px;top:0";
    document.body.appendChild(box);
    const r = {};
    for (const n of names) {
      const s = document.createElement("span");
      s.className = "material-symbols-rounded";
      s.style.cssText = "font-size:24px;white-space:nowrap";
      s.textContent = n;
      box.appendChild(s);
      r[n] = Math.round(s.getBoundingClientRect().width);
    }
    box.remove();
    return r;
  }, 名);
  /* 絵なら 24px 前後。名前が 文字で 出ると 100px を 超える。 */
  const 文字 = 名.filter((n) => 幅[n] > 40).map((n) => n + "（" + 幅[n] + "px・" + 集.get(n) + "）");
  ok("★ 書体に 無い 名前が 1 つも 無い", 文字.length === 0, 文字.join(" / "));
  const 疑 = 名.filter((n) => 幅[n] > 28 && 幅[n] <= 40);
  ok("幅が おかしいものも 無い（28px 超）", 疑.length === 0, 疑.map((n) => n + ":" + 幅[n]).join(" "));

  節("③ 設定の 束（モバイル一覧が これを 出す）");
  const 束 = await p.evaluate(() => {
    if (!window.__vqSet || !window.__vqSet.groups) return null;
    return window.__vqSet.groups().map((g) => ({ id: g.id, label: g.label, ms: g.ms }));
  });
  ok("設定の 束を 読めた", Array.isArray(束) && 束.length >= 10, 束 ? 束.length : 束);
  if (束) {
    const 悪 = 束.filter((g) => !g.ms || (幅[g.ms] === undefined ? false : 幅[g.ms] > 40));
    /* 集めそこねていた 名前は ここで 測り直す */
    const 未 = 束.map((g) => g.ms).filter((m) => m && 幅[m] === undefined);
    const 追 = 未.length ? await p.evaluate(async (names) => {
      const box = document.createElement("div");
      box.style.cssText = "position:fixed;left:-9999px;top:0";
      document.body.appendChild(box);
      const r = {};
      for (const n of names) {
        const s = document.createElement("span");
        s.className = "material-symbols-rounded";
        s.style.cssText = "font-size:24px;white-space:nowrap";
        s.textContent = n; box.appendChild(s);
        r[n] = Math.round(s.getBoundingClientRect().width);
      }
      box.remove(); return r;
    }, 未) : {};
    const 全悪 = 束.filter((g) => {
      const w = 幅[g.ms] !== undefined ? 幅[g.ms] : 追[g.ms];
      return !g.ms || (w !== undefined && w > 40);
    });
    ok("★ どの 束の 印も 絵に なる", 全悪.length === 0,
      全悪.map((g) => g.label + "→" + g.ms + "（" + (幅[g.ms] || 追[g.ms]) + "px）").join(" / "));
    void 悪;
    const ス = 束.filter((g) => g.id === "storage")[0];
    const ア = 束.filter((g) => g.id === "a11y")[0];
    ok("ストレージの 印が 決まっている", !!(ス && ス.ms), ス);
    ok("見やすさ・使いやすさの 印が 決まっている", !!(ア && ア.ms), ア);
  }

  節("④ 実際の 画面に 文字の アイコンが 出ていないか");
  /* モバイルの 設定一覧を 開く */
  await p.evaluate(() => { try { if (window.__vqOpenSettings) window.__vqOpenSettings(); } catch (e) {} });
  await p.waitForTimeout(1800);
  const 画 = await p.evaluate(() => {
    const 出 = [];
    const 見る = (r) => {
      let els = [];
      try { els = r.querySelectorAll("*"); } catch (e) { return; }
      for (const el of els) {
        const c = String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || "");
        if (/(^|\s)(ms|vq2-ms)(\s|$)/.test(c) || /material-symbols/.test(c)) {
          const t = (el.textContent || "").trim();
          /* ★ **枠では なく 字そのものの 幅**を 測る（2026-08-20）。
             枠には 余白や padding が 乗るので、絵でも 40px を 超えることが ある
             （実測: dashboard 52px・person 73px。どちらも 絵は 出ていた）。
             Range で 文字の 並びだけを 囲えば、余白は 入らない。
             絵は およそ 1 文字ぶん。名前が 文字で 出れば 何文字ぶんにも なる。 */
          if (t) {
            let w = 0;
            try {
              const rng = document.createRange();
              rng.selectNodeContents(el);
              w = rng.getBoundingClientRect().width;
            } catch (e) { w = 0; }
            const fsz = parseFloat(getComputedStyle(el).fontSize) || 24;
            if (w > fsz * 2.2) 出.push({ 名: t.slice(0, 40), 字幅: Math.round(w), 字: Math.round(fsz) });
          }
        }
        if (el.shadowRoot) 見る(el.shadowRoot);
      }
    };
    見る(document);
    return 出;
  });
  ok("★ 画面に 出ている 印が 1 つも 文字に なっていない", 画.length === 0,
    画.slice(0, 8).map((x) => x.名 + "（字 " + x.字 + "px なのに 幅 " + x.字幅 + "px）").join(" / "));
  const 数 = await p.evaluate(() => {
    let n = 0;
    const 見る = (r) => {
      let els = [];
      try { els = r.querySelectorAll("*"); } catch (e) { return; }
      for (const el of els) {
        const c = String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || "");
        if (/(^|\s)(ms|vq2-ms)(\s|$)/.test(c) || /material-symbols/.test(c)) n++;
        if (el.shadowRoot) 見る(el.shadowRoot);
      }
    };
    見る(document);
    return n;
  });
  ok("そもそも 印が 出ている（数えられている）", 数 >= 5, 数 + " 個");

  節("⑤ 例外が 出ていない");
  ok("画面の例外が 0", 赤.length === 0, 赤.slice(0, 3).join(" / "));

  await b.close();
  console.log(印.join("\n"));
  console.log("\n════════════════════════════════════════════");
  console.log("  合計 " + (済 + 落) + " 件 / 通った " + 済 + " / 落ちた " + 落);
  if (落ち.length) console.log("  落ちたもの:\n   - " + 落ち.join("\n   - "));
  console.log("════════════════════════════════════════════");
  process.exit(落 ? 1 : 0);
})().catch((e) => {
  console.log(印.join("\n"));
  console.error("途中で 止まりました: " + (e && e.message ? e.message : e));
  process.exit(2);
});
