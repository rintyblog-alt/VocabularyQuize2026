/* ══════════════════════════════════════════════════════════════════════════
   vqsafearea.cjs — ホーム画面から開いたとき（standalone / PWA）の上下端

   直したこと（2026-08-13）を、そのまま項目ごとに測る。
     ① viewport に viewport-fit=cover が付いている
     ② 100vh に必ず 100dvh の相方がある
     ③ 下部バーが画面の最下端に接し、安全領域まで自分の色で塗り切っている
     ④ 下部バーの祖先に position:fixed を壊すもの
        （transform / filter / backdrop-filter / perspective / contain /
          will-change）が無い
     ⑤ 本文の下余白 ≧ バーの高さ（＝バーに隠れない）
     ⑥ html と body の地色が同じ（明・暗どちらでも）
     ⑦ manifest の background_color が body の地色（明）と同じ

   ★ 2026-08-13: 上下の確保は iOS に任せる構成へ戻した。
      apple-mobile-web-app-capable / status-bar-style は **置かない**。
      置くと webview が時計の下まで広がり、確保が全部こちら持ちになる。
      ⑧⑨ はその歯止め。
   ══════════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

const ROOT = __dirname;
const HTML = path.join(ROOT, "client", "index.html");
const MANIFEST = path.join(ROOT, "client", "manifest.webmanifest");

/* iPhone の実値 */
const SAFE_EXTRA = 12;   /* #vqMobBar の SAFE_EXTRA と同じ */
/* 明るいほうの地色 = --vq-bg-canvas(light) = --vq-lav-50 */
const CANVAS_LIGHT = "#F7F6FB";

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (detail ? "  → " + detail : "")); }
};

/* ── ①②⑦⑧ ファイルだけで分かるもの ─────────────────────────── */
function staticChecks() {
  /* ★ index.html だけでは 中身が見えない（2026-08-18）。
     大きな <script>/<style> は client/js・client/css へ出してあるので、
     「配っているもの 全部」をつないだものを見る。 */
  const src = require("./vqsrc.cjs").丸ごと();

  console.log("\n① viewport-fit=cover");
  const vp = src.match(/<meta\s+name="viewport"\s+content="([^"]*)"/);
  ok("viewport meta がある", !!vp);
  ok("viewport-fit=cover が入っている", !!vp && /viewport-fit\s*=\s*cover/.test(vp[1]),
    vp ? vp[1] : "(meta なし)");

  console.log("\n⑧ ★上下の確保は iOS に任せる（2026-08-13 に戻した／2026-08-18 に再確認）");
  /* この 2 つを置くと webview が時計・ホームバーの下まで広がり、
     上下の確保が全部こちら持ちになる。7/27 の「端までぴったり」だった
     状態には無かった。二度と足さないための歯止め。

     ★ 2026-08-18、Rinty の指示で **一度だけ足して、本番に出して、戻した**。
       上の帯は消えたが、**下部がまた崩れた**（実機で確認）。
       つまり 2026-08-13 の結論は正しかった。**上だけ直す方法は無い。**
       足せば下が崩れ、下を直そうとすると画面ごとに埋めて回る羽目になる。
       次に「上に帯が残るのが嫌」と言われたときは、この行を読ませること。
       ——足すのではなく、theme-color を地色に合わせる（帯の色を消す）が
       いまのところ唯一の安全な手。 */
  ok("apple-mobile-web-app-status-bar-style の meta が無い",
    !/<meta[^>]*apple-mobile-web-app-status-bar-style/.test(src));
  ok("apple-mobile-web-app-capable の meta が無い",
    !/<meta[^>]*apple-mobile-web-app-capable/.test(src));
  ok("data-standalone を見る CSS/JS が無い", src.indexOf("data-standalone") < 0);

  console.log("\n② 100vh には必ず 100dvh の相方");
  const L = src.split("\n");
  const bare = [];
  for (let i = 0; i < L.length; i++) {
    if (L[i].indexOf("100vh") < 0 || L[i].indexOf("100dvh") >= 0) continue;
    const nxt = L[i + 1] || "";
    if (nxt.indexOf("100dvh") < 0) bare.push((i + 1) + ": " + L[i].trim().slice(0, 80));
  }
  ok("控えの無い 100vh が 0 件", bare.length === 0, bare.join(" / "));
  ok("100dvh が実際に使われている", (src.match(/100dvh/g) || []).length > 20);

  console.log("\n⑨ 下部バーの余白が 7/27 の値に戻っている");
  ok("旧バー: calc(16px + env(safe-area-inset-bottom, 0))",
    src.indexOf("padding: 8px 0 calc(16px + env(safe-area-inset-bottom, 0)) 0;") >= 0);
  ok("新バー: calc(env(safe-area-inset-bottom,0px) + SAFE_EXTRA)",
    src.indexOf('"padding:0 4px calc(env(safe-area-inset-bottom,0px) + " + SAFE_EXTRA + "px);"') >= 0);
  ok("上のバーの高さに安全領域を足していない",
    src.indexOf("var(--vq-topbar-h) + env(safe-area-inset-top") < 0);

  console.log("\n⑦ manifest の background_color");
  const mf = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  ok("background_color が body の地色（明）と同じ",
    String(mf.background_color || "").toUpperCase() === CANVAS_LIGHT.toUpperCase(),
    "manifest=" + mf.background_color + " / 期待=" + CANVAS_LIGHT);
}

/* ── ③④⑤⑥ 実際に開いて測る ────────────────────────────────── */
async function liveChecks() {
  const br = await chromium.launch();
  const pg = await br.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e.message).slice(0, 120)));
  await pg.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.waitForFunction(() => !!document.getElementById("vqMobBar"), null, { timeout: 60000 })
    .catch(() => {});
  await pg.waitForTimeout(2000);

  /* ※ 安全領域の差し込みはしない。
     いまは status-bar-style を置かない構成で、上下の確保は iOS 側の仕事。
     ページ側が env() を足し引きしていないこと自体は staticChecks で見る。 */
  const r = await pg.evaluate(() => {
    const cs = (el) => getComputedStyle(el);
    const host = document.getElementById("vqMobBar");
    const out = { バー無し: !host };
    if (!host) return out;

    const bar = host.shadowRoot ? host.shadowRoot.querySelector(".bar") : null;
    const hr = host.getBoundingClientRect();
    const hs = cs(host);
    out.位置 = hs.position;
    out.left = hs.left; out.right = hs.right; out.bottom = hs.bottom;
    out.表示 = hs.display;
    out.下端 = Math.round(hr.bottom);
    out.画面高 = window.innerHeight;
    out.高さ = Math.round(hr.height);
    out.器の背景 = hs.backgroundColor;
    if (bar) {
      const bs = cs(bar);
      out.帯の下余白 = bs.paddingBottom;
      out.帯の背景 = bs.backgroundColor;
      out.帯の高さ = Math.round(bar.getBoundingClientRect().height);
    }

    /* 祖先に fixed を壊すものが無いか */
    const 壊す = [];
    let p = host.parentElement;
    while (p && p !== document.documentElement) {
      const s = cs(p), hit = [];
      if (s.transform !== "none") hit.push("transform");
      if (s.filter !== "none") hit.push("filter");
      if (s.backdropFilter && s.backdropFilter !== "none") hit.push("backdrop-filter");
      if (s.perspective !== "none") hit.push("perspective");
      if (s.contain && !/^(none|style)$/.test(s.contain)) hit.push("contain:" + s.contain);
      if (s.willChange && !/^(auto|opacity)$/.test(s.willChange)) hit.push("will-change:" + s.willChange);
      if (hit.length) 壊す.push((p.id || p.tagName.toLowerCase()) + " → " + hit.join(","));
      p = p.parentElement;
    }
    out.壊す祖先 = 壊す;

    /* 本文の下余白 */
    const m = document.querySelector("main");
    out.mainの下余白 = m ? cs(m).paddingBottom : "(main なし)";
    out.bodyの下余白 = cs(document.body).paddingBottom;
    out.配られた帯の高さ =
      cs(document.documentElement).getPropertyValue("--vq-mobbar-h").trim();
    return out;
  });

  console.log("\n③ 下部バーが最下端に接し、安全領域まで塗り切る");
  ok("#vqMobBar がある", !r.バー無し);
  if (!r.バー無し) {
    ok("position:fixed", r.位置 === "fixed", r.位置);
    ok("left:0 / right:0 / bottom:0",
      r.left === "0px" && r.right === "0px" && r.bottom === "0px",
      "left=" + r.left + " right=" + r.right + " bottom=" + r.bottom);
    ok("下端が画面の下端に接している（差 1px 以内）",
      Math.abs(r.下端 - r.画面高) <= 1, r.下端 + " / " + r.画面高);
    /* ブラウザでは安全領域が 0 なので、素の 12px になる */
    ok("下余白が素の " + SAFE_EXTRA + "px（ブラウザ＝安全領域 0）",
      Math.abs(parseFloat(r.帯の下余白) - SAFE_EXTRA) <= 1, r.帯の下余白);
    const 透明 = /rgba\([^)]*,\s*0\s*\)/.test(String(r.帯の背景)) || r.帯の背景 === "transparent";
    ok("帯に自分の背景色がある（安全領域まで塗る）", !透明, r.帯の背景);
    ok("器にも同じ背景がある（1px の隙も作らない）",
      !/rgba\([^)]*,\s*0\s*\)/.test(String(r.器の背景)), r.器の背景);
  }

  console.log("\n④ position:fixed を壊す祖先が無い");
  ok("transform / filter / contain 等が祖先に無い",
    (r.壊す祖先 || []).length === 0, (r.壊す祖先 || []).join(" / "));

  console.log("\n⑤ 本文がバーに隠れない");
  /* 7/27 の方式では、下の場所取りは **body** が持つ（main ではない）。
     @media (max-width:768px) の body{padding-bottom:calc(60px + 安全領域)}。 */
  const 合計 = parseFloat(r.bodyの下余白) + parseFloat(r.mainの下余白);
  const barH = r.高さ;
  ok("body + main の下余白 ≧ バーの高さ", 合計 >= barH,
    "body=" + r.bodyの下余白 + " + main=" + r.mainの下余白 + " / バー=" + barH + "px");
  ok("下の場所取りが 7/27 の値（60px + 安全領域）に戻っている",
    /calc\(60px \+ env\(safe-area-inset-bottom, 0\)\)/.test(
      require("./vqsrc.cjs").丸ごと()));

  console.log("\n⑥ html と body の地色が同じ");
  for (const mode of ["light", "dark"]) {
    const c = await pg.evaluate((m) => {
      const de = document.documentElement;
      if (m === "dark") de.setAttribute("data-theme-mode", "dark");
      else de.setAttribute("data-theme-mode", "light");
      return {
        html: getComputedStyle(de).backgroundColor,
        body: getComputedStyle(document.body).backgroundColor,
        canvas: getComputedStyle(de).getPropertyValue("--vq-bg-canvas").trim()
      };
    }, mode);
    ok(mode + ": html と body が同じ色", c.html === c.body,
      "html=" + c.html + " body=" + c.body);
    ok(mode + ": その色が --vq-bg-canvas", !!c.canvas, "canvas=" + c.canvas);
  }

  /* 明るいほうの実際の値が manifest と合っているか */
  const lightRgb = await pg.evaluate(() => {
    document.documentElement.setAttribute("data-theme-mode", "light");
    return getComputedStyle(document.body).backgroundColor;
  });
  const hexOf = (rgb) => {
    const m = String(rgb).match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (!m) return "";
    return "#" + [1, 2, 3].map((i) => (+m[i]).toString(16).padStart(2, "0")).join("").toUpperCase();
  };
  ok("⑦ manifest の色 = 実際の body の地色（明）",
    hexOf(lightRgb) === CANVAS_LIGHT.toUpperCase(),
    "実際=" + hexOf(lightRgb) + " manifest=" + CANVAS_LIGHT);

  ok("画面エラーが出ていない", errs.length === 0, errs.join(" / "));
  await br.close();
}

(async () => {
  console.log("═══ vqsafearea — 全画面（standalone）の上下端 ═══");
  staticChecks();
  await liveChecks();
  console.log("\n─────────────────────────────");
  console.log("通過 " + pass + " / 失敗 " + fail);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("落ちた:", e); process.exit(1); });
