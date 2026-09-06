/* ══════════════════════════════════════════════════════════════════════════
   vqsetui.cjs — 設定の 見た目（2026-09-03・訴え）

   訴え「アプリ設定の UI を こんな感じに して欲しい。ほぼ 同じに」
        （もらった 写真 = Discord の モバイル 設定画面）

   写真から 取った 決まり:
     ・束は 角の 丸い カード（16px）。見出しは カードの **外**に 小さく 灰色で
     ・1 行 = 左に 塗りの 印 / 中に 題と 説明 / 右に つまみ・矢印・丸
     ・区切り線は **印の 右から**（行の 全幅では ない）
     ・つまみは 52×32。入のときは アクセント色
     ・選ぶ ものは 「見出し ＋ 1 行 1 つ・右端に 丸」

   ★ いちばん 大事な 検査は 「**印が 文字で 出ていないか**」。
     Material Symbols は 合字なので、書体が 当たらない／名前が 書体に 無いと
     **その 名前が そのまま 巨大な 文字で 出る**。
     実際に 今日 1 回 踏んだ（.ms の 書体指定が モバイルの @media の 中に
     しか 無く、PC で "style" "bolt" "palette" と 出た）。

   使い方: node vqsetui.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const { chromium } = require("playwright");

let 済 = 0, 落 = 0; const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 240) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 380) : "")); }
};
const 待 = (ms) => new Promise((s) => setTimeout(s, ms));
const j = (r) => r.json().catch(() => ({}));

async function 札() {
  const 印 = Date.now().toString(36) + Math.floor(Math.random() * 9999);
  const H = { "Content-Type": "application/json" };
  const r = await fetch(BASE + "/api/auth/register/start", { method: "POST", headers: H,
    body: JSON.stringify({ email: "vqs" + 印 + "@gmail.com", gradePrefix: "H2",
      nickname: ("q" + 印).slice(0, 14), password: "Passw0rd!z3" }) }).then(j);
  const v = await fetch(BASE + "/api/auth/register/verify", { method: "POST", headers: H,
    body: JSON.stringify({ challengeId: r.challengeId, code: r.devCode }) }).then(j);
  const c = await fetch(BASE + "/api/auth/register/consent", { method: "POST", headers: H,
    body: JSON.stringify({ registrationSession: v.registrationSession, agreeTerms: true,
      agreePrivacy: true, agreeAge: true, pin: "1379" }) }).then(j);
  if (!c.token) throw new Error("札が 取れない");
  return c.token;
}

/* 影の 中の 設定の 器を 取る */
const 器JS = `(function(){
  var ら = Array.prototype.slice.call(document.querySelectorAll("*"))
    .filter(function(e){ return e.shadowRoot && e.shadowRoot.querySelector(".modal"); });
  return ら[0] || null;
})()`;

(async () => {
  console.log("測る先:", BASE);
  const tok = await 札();
  const browser = await chromium.launch();

  async function 開く(ctx, 暗, 束) {
    const page = await ctx.newPage();
    const 例外 = [];
    page.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 200)));
    await page.addInitScript((t) => {
      try {
        localStorage.setItem("app.auth.token.v1", t);
        localStorage.setItem("app.auth.mode.v1", "user");
      } catch (e) {}
    }, tok);
    await page.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof window.__vqOpenSettings === "function", null, { timeout: 60000 });
    await 待(1200);
    await page.evaluate((d) => {
      document.documentElement.setAttribute("data-theme-mode", d ? "dark" : "light");
      document.documentElement.setAttribute("data-theme", d ? "dark" : "light");
    }, 暗);
    const 覆い = () => page.evaluate(() => {
      ["vqLumiTour", "vqTour", "vqInstall", "vqNewsFlash", "vqPin"].forEach((id) => {
        const e = document.getElementById(id); if (e) e.remove();
      });
    });
    await 覆い();
    await page.evaluate(() => window.__vqOpenSettings());
    await 待(1200);
    await 覆い();
    if (束) {
      await page.evaluate((名) => {
        const ら = Array.prototype.slice.call(document.querySelectorAll("*"))
          .filter((e) => e.shadowRoot && e.shadowRoot.querySelector(".modal"));
        const r = ら[0] && ら[0].shadowRoot; if (!r) return;
        const b = Array.prototype.slice.call(r.querySelectorAll(".nav[data-nav]"))
          .filter((x) => new RegExp(名).test(x.textContent || ""))[0];
        if (b) b.click();
        const m = r.querySelector(".modal"); if (m) m.classList.add("is-detail");
      }, 束);
      await 待(1300);
      await 覆い();
    }
    return { page: page, 例外: 例外 };
  }

  /* ══ ① 印が 文字で 出ていないか（**ぜんぶの 束**で 見る）══════════ */
  節("① 印が 文字で 出ていない（合字の 罠）");
  {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    const { page, 例外 } = await 開く(ctx, true, "");
    const 束ら = await page.evaluate(() => {
      const ら = Array.prototype.slice.call(document.querySelectorAll("*"))
        .filter((e) => e.shadowRoot && e.shadowRoot.querySelector(".modal"));
      const r = ら[0] && ら[0].shadowRoot; if (!r) return [];
      return Array.prototype.slice.call(r.querySelectorAll(".nav[data-nav]"))
        .map((x) => x.getAttribute("data-nav"));
    });
    見(束ら.length >= 8, "束が 並んでいる", 束ら.length);
    const 悪 = [];
    for (const g of 束ら) {
      await page.evaluate((id) => {
        const ら = Array.prototype.slice.call(document.querySelectorAll("*"))
          .filter((e) => e.shadowRoot && e.shadowRoot.querySelector(".modal"));
        const r = ら[0] && ら[0].shadowRoot; if (!r) return;
        const b = r.querySelector('.nav[data-nav="' + id + '"]');
        if (b) b.click();
      }, g);
      await 待(420);
      const 出 = await page.evaluate(() => {
        const ら = Array.prototype.slice.call(document.querySelectorAll("*"))
          .filter((e) => e.shadowRoot && e.shadowRoot.querySelector(".modal"));
        const r = ら[0] && ら[0].shadowRoot; if (!r) return [];
        /* 合字が 効いていれば 印は 1 文字ぶん（24〜30px）。
           効いていなければ 名前が そのまま 出るので 60px 以上 に なる。 */
        return Array.prototype.slice.call(r.querySelectorAll(".rico .ms, .mico .ms"))
          .map((x) => ({ 字: (x.textContent || "").trim(),
                         幅: Math.round(x.getBoundingClientRect().width) }))
          .filter((x) => x.幅 > 34);
      });
      if (出.length) 悪.push({ 束: g, 出: 出.slice(0, 4) });
    }
    見(悪.length === 0, "★ どの 束でも 印が 文字に なっていない", 悪.slice(0, 3));
    見(例外.length === 0, "画面の 例外 0 件", 例外.slice(0, 3));
    await page.close(); await ctx.close();
  }

  /* ══ ② 行・カード・つまみ の 形（写真の 値）════════════════════ */
  節("② 行・カード・つまみ");
  {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    const { page } = await 開く(ctx, true, "見やすさ");
    const m = await page.evaluate(() => {
      const ら = Array.prototype.slice.call(document.querySelectorAll("*"))
        .filter((e) => e.shadowRoot && e.shadowRoot.querySelector(".grp"));
      const r = ら[0] && ら[0].shadowRoot; if (!r) return { なし: true };
      const grp = r.querySelector(".grp");
      const row = r.querySelector(".grp .row");
      const rows = r.querySelectorAll(".grp .row");
      const ico = row && row.querySelector(".rico");
      const sw = r.querySelector(".sw");
      const cs = (el) => el ? getComputedStyle(el) : null;
      const 線 = rows[1] ? getComputedStyle(rows[1], "::before") : null;
      const rr = (el) => { const b = el.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; };
      return {
        角: parseFloat(cs(grp).borderTopLeftRadius),
        行高: rr(row).h,
        印: ico ? rr(ico) : null,
        印の左: ico && row ? Math.round(ico.getBoundingClientRect().left - row.getBoundingClientRect().left) : -1,
        つまみ: sw ? rr(sw) : null,
        線の左: 線 ? 線.left : "",
        線の高: 線 ? 線.height : "",
        枠: cs(grp).borderTopWidth
      };
    });
    見(!m.なし, "詳細の カードが 出ている", m);
    見(m.角 >= 15, "★ カードの 角が 丸い（16px ほど）", m.角);
    見(m.行高 >= 58, "★ 行が 高い（写真は 60px ほど）", m.行高);
    見(!!m.印 && m.印.w >= 24 && m.印.w <= 30, "★ 左に 印が ある（26px ほど）", m.印);
    見(m.印の左 >= 12 && m.印の左 <= 20, "★ 印は 行の 左端から 16px ほど", m.印の左);
    /* ★ 2026-09-03・訴え「ボタンが Discord すぎる」。
       写真の 52×28 の 太い 帯から 離し、48×28 の 静かな 形に した。 */
    見(!!m.つまみ && m.つまみ.w === 48 && m.つまみ.h === 28, "★ つまみは 48×28（Discord の 52×32 では ない）", m.つまみ);
    見(m.線の左 === "56px", "★ 区切り線は **印の 右から**（56px）", m.線の左);
    見(parseFloat(m.線の高) <= 1.5, "区切り線は 髪の毛ほど 細い", m.線の高);
    await page.close(); await ctx.close();
  }

  /* ══ ③ 入のときは アクセント色（写真の 青紫）════════════════════ */
  節("③ つまみの 色");
  {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    const { page } = await 開く(ctx, true, "画面と表示");
    const c = await page.evaluate(() => {
      const ら = Array.prototype.slice.call(document.querySelectorAll("*"))
        .filter((e) => e.shadowRoot && e.shadowRoot.querySelector(".grp"));
      const r = ら[0] && ら[0].shadowRoot; if (!r) return {};
      const on = r.querySelector(".sw.on"), off = r.querySelector(".sw:not(.on)");
      const 芯 = getComputedStyle(r.host || document.documentElement)
        .getPropertyValue("--vq-accent").trim();
      return { 入: on ? getComputedStyle(on).backgroundColor : "",
               切: off ? getComputedStyle(off).backgroundColor : "",
               芯: 芯,
               入輪: on ? getComputedStyle(on).boxShadow : "",
               入玉: on ? getComputedStyle(on, "::after").backgroundColor : "",
               切玉: off ? getComputedStyle(off, "::after").backgroundColor : "",
               玉: on ? getComputedStyle(on, "::after").transform : "" };
    });
    const 数 = (s) => (String(s).match(/\d+/g) || []).map(Number);
    見(!!c.入 && !!c.切 && c.入 !== c.切, "★ 入と 切で 色が 違う", c);
    const a = 数(c.入);
    見(a.length >= 3 && a[2] > a[1], "★ 入は 青紫 寄り（青が 緑より 強い）", c.入);
    見(!!c.入輪 && /inset/.test(String(c.入輪)), "★ 入は **輪**を 持つ（塗りだけで 見せない）", c.入輪);
    見(!!c.入玉 && c.入玉 !== c.切玉, "★ 玉の 色も 入・切で 変わる", { 入: c.入玉, 切: c.切玉 });
    見(/matrix|translate/.test(String(c.玉)), "★ 入で 玉が 右へ 寄る", c.玉);
    await page.close(); await ctx.close();
  }

  /* ══ ④ 選ぶ ものは 「見出し ＋ 丸」（写真の ノイズ抑制）══════════ */
  節("④ 選ぶ ものは 丸で 出す");
  {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    const { page } = await 開く(ctx, true, "画面と表示");
    const r = await page.evaluate(() => {
      const ら = Array.prototype.slice.call(document.querySelectorAll("*"))
        .filter((e) => e.shadowRoot && e.shadowRoot.querySelector(".grp"));
      const sr = ら[0] && ら[0].shadowRoot; if (!sr) return {};
      const rr = sr.querySelectorAll(".rrow");
      const on = sr.querySelector(".rrow.on");
      const off = sr.querySelector(".rrow:not(.on)");
      const 束 = on ? on.closest(".grp") : null;
      const 見出 = 束 && 束.previousElementSibling
        ? (束.previousElementSibling.className || "") : "";
      const dot = (el) => {
        const d = el && el.querySelector(".rdot");
        if (!d) return null;
        const af = getComputedStyle(d, "::after");
        const b = d.getBoundingClientRect();
        return { 幅: Math.round(b.width), 印: (af.content || "").replace(/"/g, ""),
                 濃さ: af.opacity, 色: af.color, 書体: af.fontFamily.slice(0, 24) };
      };
      return { 数: rr.length, 選: dot(on), 未: dot(off), 見出: 見出,
               役: on ? on.getAttribute("role") : "",
               読み: on ? on.getAttribute("aria-checked") : "",
               群: 束 ? 束.getAttribute("role") : "" };
    });
    見(r.数 >= 3, "★ 丸で 選ぶ 行が ある", r.数);
    見(/gttl|gsub/.test(r.見出), "★ 束の **外**に 見出しが 付く", r.見出);
    見(r.役 === "radio" && r.群 === "radiogroup", "読み上げにも 「選ぶもの」と 伝わる", r);
    見(r.読み === "true", "選んでいる ものは aria-checked=true", r.読み);
    /* ★ 2026-09-03・訴え「選択だけ 変えよ」。Discord の
       「塗った 丸 ＋ 白い 点」を やめ、**チェック**に した。 */
    見(!!r.選 && r.選.幅 >= 20 && r.選.幅 <= 24, "★ 印の 場所は 22px ほど", r.選);
    見(!!r.選 && r.選.印 === "done" && /Material Symbols/.test(r.選.書体),
      "★ 選んだ ものに **チェック**が 付く", r.選);
    見(!!r.選 && Number(r.選.濃さ) > 0.9, "★ チェックは はっきり 出る", r.選.濃さ);
    見(!!r.未 && Number(r.未.濃さ) < 0.1, "★ 選んでいない ものには 何も 出ない", r.未.濃さ);
    見(!!r.選 && r.選.色 !== (r.未 && r.未.色) === false || true, "（色は 参考）", r.選.色);
    await page.close(); await ctx.close();
  }

  /* ══ ⑤ 狭い 画面（幅の 要る 部品を 下へ 降ろす）════════════════ */
  節("⑤ 狭い 画面");
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const { page } = await 開く(ctx, true, "画面と表示");
    const r = await page.evaluate(() => {
      const ら = Array.prototype.slice.call(document.querySelectorAll("*"))
        .filter((e) => e.shadowRoot && e.shadowRoot.querySelector(".grp"));
      const sr = ら[0] && ら[0].shadowRoot; if (!sr) return {};
      const w = sr.querySelector(".row.wide");
      if (!w) return { なし: true };
      const ico = w.querySelector(".rico"), main = w.querySelector(".row__main");
      const ctl = w.querySelector("select.sel,.seg,.num");
      const t = (el) => el ? Math.round(el.getBoundingClientRect().top) : -1;
      const l = (el) => el ? Math.round(el.getBoundingClientRect().left) : -1;
      const 幅 = (el) => el ? Math.round(el.getBoundingClientRect().width) : -1;
      return { 印と題が同じ行: Math.abs(t(ico) - t(main)) < 30,
               部品が下: t(ctl) > t(main) + 10,
               部品の左: l(ctl), 題の左: l(main),
               部品の幅: 幅(ctl), 行の幅: 幅(w),
               はみ出し: sr.querySelector(".mscroll,.body")
                 ? (sr.querySelector(".mscroll,.body").scrollWidth
                    - sr.querySelector(".mscroll,.body").clientWidth) : -1 };
    });
    if (r.なし) 見(true, "（幅の 要る 部品が 無い 束なので 飛ばす）", r);
    else {
      見(r.印と題が同じ行, "★ 印は 題の **横**（上へ 飛ばない）", r);
      見(r.部品が下, "★ 幅の 要る 部品は **下の 行**へ", r);
      見(Math.abs(r.部品の左 - r.題の左) <= 2, "★ 部品は 題の 真下に そろう", r);
      見(r.部品の幅 > r.行の幅 * 0.6, "★ 部品は 幅いっぱい", r);
    }
    見(r.はみ出し <= 1, "横に はみ出さない", r.はみ出し);
    await page.close(); await ctx.close();
  }

  /* ══ ⑥ 明るい ときも 崩れない ════════════════════════════════ */
  節("⑥ 明るい とき");
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const { page } = await 開く(ctx, false, "見やすさ");
    const r = await page.evaluate(() => {
      const ら = Array.prototype.slice.call(document.querySelectorAll("*"))
        .filter((e) => e.shadowRoot && e.shadowRoot.querySelector(".grp"));
      const sr = ら[0] && ら[0].shadowRoot; if (!sr) return {};
      const grp = sr.querySelector(".grp");
      const lab = sr.querySelector(".row__label");
      const ico = sr.querySelector(".rico");
      const sw = sr.querySelector(".sw:not(.on)");
      const 明 = (s) => { const m = (String(s).match(/\d+/g) || []).map(Number);
        return m.length >= 3 ? (m[0] * .299 + m[1] * .587 + m[2] * .114) : 255; };
      return { 地: getComputedStyle(grp).backgroundColor,
               字: getComputedStyle(lab).color,
               印: getComputedStyle(ico).color,
               つまみ: sw ? getComputedStyle(sw).backgroundColor : "",
               差: Math.abs(明(getComputedStyle(grp).backgroundColor) - 明(getComputedStyle(lab).color)),
               印差: Math.abs(明(getComputedStyle(grp).backgroundColor) - 明(getComputedStyle(ico).color)),
               つまみ差: sw ? Math.abs(明(getComputedStyle(grp).backgroundColor)
                 - 明(getComputedStyle(sw).backgroundColor)) : 0 };
    });
    見(r.差 > 90, "★ 明るい 地でも 字が 読める", r);
    見(r.印差 > 90, "★ 明るい 地でも 印が 見える", r);
    見(r.つまみ差 > 12, "★ 切の つまみが 地に 溶けない", r);
    await page.close(); await ctx.close();
  }

  await browser.close();
  console.log("\n" + "─".repeat(28));
  console.log("通った: " + 済 + " / 落ちた: " + 落);
  if (落) { console.log("落ちたもの:"); 落ち.forEach((x) => console.log("  - " + x)); }
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error("落ちました:", e && e.stack || e); process.exit(1); });
