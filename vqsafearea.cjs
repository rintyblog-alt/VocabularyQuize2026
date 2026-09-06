/* ══════════════════════════════════════════════════════════════════════════
   vqsafearea.cjs — ホーム画面から開いたとき（standalone / PWA）の上下端

     ① viewport に viewport-fit=cover が付いている
     ② 100vh に必ず 100dvh の相方がある
     ③ 下部バーが 浮いた 島で、下端との すきまが 決めた値
     ④ 下部バーの祖先に position:fixed を壊すもの
        （transform / filter / backdrop-filter / perspective / contain /
          will-change）が無い
     ⑤ 本文の下余白 ≧ バーの高さ（＝バーに隠れない）
     ⑥ html と body の地色が同じ（明・暗どちらでも）
     ⑦ manifest の background_color が body の地色（明）と同じ
     ⑧ ★ 時計の裏まで画面を広げる（2026-09-04 から）
     ⑨ 上下のバーの余白が 決めた値
     ⑩ ★ env() の直書きが :root の 4 行以外に無い
     ⑪ ★ 安全領域を 実機の値に 差し替えても、上端・下端に 食い込む ものが 無い

   ══ ⑧ の 経緯（**必ず 読むこと**）═══════════════════════════════════
   2026-08-13 と 08-18 の 2 度、
     apple-mobile-web-app-capable / status-bar-style = black-translucent
   を 外している。置くと webview が 時計・ホームバーの 裏まで 広がり、
   上下の 確保が **全部 こちらの 責任**に なるため。
   当時は env() を **画面ごとに 直書き**していたので、
   **手元で 実機の 形を 再現できず**、入れ忘れを 見つけられなかった。
   「テストは 通ったが 画面は 良く ならない」を 丸一日 繰り返した。

   2026-09-04、訴え「上部も 透けるように。この 時計の 方まで 欲しい。
   そうすれば iPhone でも 画面いっぱいに なるやん」で もう一度 置いた。
   ただし **先に 土台を 変えた**:

     ・env() を 全部 :root の --vq-sat / --vq-sab / --vq-sal / --vq-sar へ
       寄せた（294 か所）。新しく env() を 直書きしない（⑩ が 見張る）。
     ・変数なので 手元で 差し替えられる。⑪ が 実機と 同じ 59/34px を 入れて
       主要な 画面を 一巡し、**上端・下端に 食い込む ものを 数える**。

   つまり「入れ忘れが 検証で 出る」ように してから 置いた。
   ⑧⑨⑩⑪ は その 歯止め。**⑪ が 落ちたら 実機でも ずれている。**
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
const SAFE_EXTRA = 6;   /* #vqMobBar の SAFE_EXTRA と同じ */
/* ★ 上の 安全領域は **0**（2026-09-04）。
   black-translucent を 置かない ので、webview は 時計の 下から 始まり、
   env(safe-area-inset-top) は 0 に なる（実機の 診断で 確認）。
   下だけ 34px 入る。 */
const SAT = 0, SAB = 34;
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

  console.log("\n⑧ ★時計の裏まで画面を広げる（2026-09-04）");
  /* ここを 消すと 時計の 帯が べた塗りに 戻り、上部が 透けなくなる。
     置くのが 正しい。ただし ⑩⑪ が 通っている ことが 前提。
     ⑪ が 落ちる 状態で これを 置くと、8/13・8/18 と 同じ ズレが 出る。 */
  /* ★ 置く。外しても iOS が 下 34pt を 自分で 確保する ので 帯は 消えない。
     広げた うえで **下端の ずれを px で 打ち消す**のが 正しい。 */
  /* ★ **置かない**（2026-09-04・実機で 3 回 確かめた）。
     置くと iOS が window.innerHeight から 上の 安全領域ぶん(59pt)を 引いて
     返し（実測: 画面 852 に 対して 793）、position:fixed; bottom:0 が
     その ぶん 浮く ＝ 下に 何も無い 帯が 出る。
     上端の 段差は **theme-color を アプリの 地色に そろえる**ことで 消す（⑭）。
     打ち消し（bottom を 負に する）は 手元では 通るが 実機で 通らなかった。 */
  /* ★ black-translucent は **置かない**（実機で 3 回 確かめた）。
     置くと iOS が innerHeight を 上の 安全領域ぶん 短く 返し、
     webview が 画面の 下端に 届かなく なる ＝ 下に 59px の 帯。
     帯の 色は status-bar-style の black / default で 合わせる（⑭）。 */
  ok("black-translucent を 使っていない",
    src.indexOf('"black-translucent"') < 0 && !/content="black-translucent"/.test(src));
  ok("帯の 型を アプリの テーマから 決めて いる",
    src.indexOf('置く("apple-mobile-web-app-status-bar-style", 暗 ? "black" : "default")') >= 0);
  ok("その 判定が <head> の 早い ところに ある（iOS は 起動時の 値しか 見ない）",
    src.indexOf('<script id="vq-statusbar">') >= 0 &&
    src.indexOf('<script id="vq-statusbar">') < src.indexOf('<body'));
  /* ★ CSS 変数 ＋ calc(100lvh - 100dvh) は 実機で 空振りした。
     **要素の bottom を px で 直接 焼く**こと。 */
  ok("data-standalone を見る CSS/JS が無い（要らない。変数で足りる）",
    src.indexOf("data-standalone") < 0);

  console.log("\n② 100vh には必ず 100dvh の相方");
  const L = src.split("\n");
  const bare = [];
  for (let i = 0; i < L.length; i++) {
    if (L[i].indexOf("100vh") < 0 || L[i].indexOf("100dvh") >= 0) continue;
    /* ★ 説明の 行に「100vh」と 書いただけで 落ちていた。
       CSS の 値として 書いてある 行だけを 見る。
       「2026-09-04: … 100vh だけだと」のような 文にも コロンは 出るので、
       コロン／calc( の **すぐ後ろ**に あるものだけ を 値と みなす。 */
    const 行 = L[i].trim();
    if (/^(\/\*|\*|\/\/)/.test(行) || !/(?::|calc\(|[-+*/]\s*)\s*[\d.]*\s*100vh/.test(行)) continue;
    const nxt = L[i + 1] || "";
    if (nxt.indexOf("100dvh") < 0) bare.push((i + 1) + ": " + 行.slice(0, 80));
  }
  ok("控えの無い 100vh が 0 件", bare.length === 0, bare.join(" / "));
  ok("100dvh が実際に使われている", (src.match(/100dvh/g) || []).length > 20);

  console.log("\n⑨ 上下のバーの余白");
  ok("旧バー: calc(16px + var(--vq-sab,0px))",
    src.indexOf("padding: 8px 0 calc(16px + var(--vq-sab,0px)) 0;") >= 0);
  /* ★ 島には 安全領域を **足さない**（2026-09-04）。足すと 島の 下に
     何も 無い 帯が 出る。訴え「前まで こんなの なかったのに」。 */
  ok("新バーの すきまが " + SAFE_EXTRA + "px",
    new RegExp("var SAFE_EXTRA = " + SAFE_EXTRA + ";").test(src));
  /* ★ 8/13 は「上のバーに 安全領域を 足さない」が 正しかった。
     いまは webview が 時計の 裏まで 広がるので **足すのが 正しい**。 */
  ok("上のバー(#vqTopbar)が 上の安全領域を 確保している",
    src.indexOf('"padding:calc(var(--vq-safe-top, var(--vq-sat,0px)) + 6px) 10px 6px;background:transparent;}"') >= 0);
  /* ★ ぼかしの 帯が 効いているかは **開いて 測る**（liveChecks の ⑨live）。
     圧縮ずみの 文字を 探す 検査は 何も 測っていない（2026-09-03 の 教訓）。 */

  console.log("\n⑩ ★env() の直書きが :root の 4 行以外に無い");
  /* 直書きが あると **手元で 実機の 形を 再現できない** ＝ ⑪ が 意味を 失う。
     8/13〜8/18 に 丸一日 外した 原因が これ。 */
  const 直書き = (src.match(/env\(safe-area-inset-(?:top|bottom|left|right)/g) || []).length;
  ok("直書きが 4 件だけ（:root の 定義）", 直書き === 4, 直書き + " 件");
  for (const v of ["--vq-sat", "--vq-sab", "--vq-sal", "--vq-sar"]) {
    ok(v + " が :root で 定義されている",
      new RegExp("\\" + v + ":\\s*env\\(safe-area-inset-").test(src));
  }

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
    const wrap = host.shadowRoot ? host.shadowRoot.querySelector(".wrap") : null;
    out.器の当たり = hs.pointerEvents;
    if (wrap) out.包みの下余白 = cs(wrap).paddingBottom;
    if (bar) {
      const bs = cs(bar);
      out.帯の下余白 = bs.paddingBottom;
      out.帯の背景 = bs.backgroundColor;
      out.帯のぼかし = bs.backdropFilter || bs.webkitBackdropFilter || "";
      out.帯の当たり = bs.pointerEvents;
      const br2 = bar.getBoundingClientRect();
      out.帯の高さ = Math.round(br2.height);
      out.島の浮き = Math.round(window.innerHeight - br2.bottom);
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
    /* ★ 2026-09-03 から **浮いた島**（幅いっぱいの 帯では ない）。
       下の すきまは 島を 包む .wrap が 持つ。器は 透明で、
       島だけが 押せる（外は 素通り）。 */
    ok("すきまは 器の中の .wrap が 持つ（安全領域は 足さない ので いつも " + SAFE_EXTRA + "px）",
      Math.abs(parseFloat(r.包みの下余白) - SAFE_EXTRA) <= 1, r.包みの下余白);
    ok("島の 下端が 画面の 下から すきま ぶん 浮いている",
      Math.abs(r.島の浮き - SAFE_EXTRA) <= 1, r.島の浮き + "px");
    const 透明 = /rgba\([^)]*,\s*0\s*\)/.test(String(r.帯の背景)) || r.帯の背景 === "transparent";
    ok("島に 自分の 背景色が ある", !透明, r.帯の背景);
    ok("島の 背景が 透けている（後ろが 見える）",
      /(\/\s*0?\.\d+\)|,\s*0?\.\d+\s*\))/.test(String(r.帯の背景)), r.帯の背景);
    ok("島が ぼかしを 持つ", /blur/.test(String(r.帯のぼかし)), r.帯のぼかし);
    ok("器は 透明（島だけが 浮く）",
      /rgba\([^)]*,\s*0\s*\)/.test(String(r.器の背景)) || r.器の背景 === "transparent", r.器の背景);
    ok("器は 素通り・島は 押せる",
      r.器の当たり === "none" && r.帯の当たり === "auto",
      "器=" + r.器の当たり + " 島=" + r.帯の当たり);
  }

  console.log("\n⑨live 上のバーの ぼかしの帯（時計の裏が 透ける）");
  const 帯 = await pg.evaluate(() => {
    const tb = document.getElementById("vqTopbar");
    if (!tb) return { なし: true };
    const cs = getComputedStyle(tb, "::before");
    const bar = tb.shadowRoot ? tb.shadowRoot.querySelector(".bar") : null;
    return {
      高さ: cs.height, ぼかし: cs.backdropFilter || cs.webkitBackdropFilter || "",
      地: cs.backgroundImage.slice(0, 160), 覆い: cs.maskImage || cs.webkitMaskImage || "",
      当たり: cs.pointerEvents,
      ピルのぼかし: bar ? (getComputedStyle(bar).backdropFilter || "") : "",
      ピルの地: bar ? getComputedStyle(bar).backgroundColor : ""
    };
  });
  ok("#vqTopbar がある", !帯.なし);
  if (!帯.なし) {
    /* ★ いちど ここに ぼかしの 帯（::before）を 敷いたが、
       **「変な ぼかしが 入ってる。いらない」**で 外した（2026-09-04）。
       上端は 素通しで、浮いている ピルだけが 透かす。戻さないこと。 */
    ok("時計の 裏に ぼかしの 帯を 敷いていない（素通し）",
      帯.ぼかし === "none" && 帯.地 === "none", "ぼかし=" + 帯.ぼかし + " 地=" + 帯.地.slice(0, 40));
    ok("ピルが ぼかしを 持つ", /blur/.test(帯.ピルのぼかし), 帯.ピルのぼかし);
    ok("ピルの地が 透けている", /(\/\s*0?\.\d+\)|,\s*0?\.\d+\s*\))/.test(帯.ピルの地), 帯.ピルの地);
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
  ok("下の場所取りが 60px + 安全領域（変数）",
    /calc\(60px \+ var\(--vq-sab,0px\)\)/.test(
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

/* ══ ⑪ 安全領域を 実機の 値に 差し替えて 一巡する ═══════════════════════
   ★ **これが 本命の 検査。** 8/13・8/18 に 外した ときは これが 作れず、
     入れ忘れを 実機でしか 見つけられなかった。

   上端は **開いた 直後**に 測る（送ってから 測ると、上へ 流れ去った 中身を
   「時計と 重なる」と 数えてしまう）。
   下端は **送り切った あと**に 測る（途中で 測ると、まだ 下に ある だけの
   ものを 拾い、本当に バーの 下に 残る ものが 埋もれる）。
   ══════════════════════════════════════════════════════════════════════ */
async function 実機の形() {
  const j = (r) => r.json().catch(() => ({}));
  const 印 = Date.now().toString(36); const H = { "Content-Type": "application/json" };
  let token = "";
  try {
    const a = await fetch(BASE + "/api/auth/register/start", { method: "POST", headers: H,
      body: JSON.stringify({ email: "sa" + 印 + "@gmail.com", gradePrefix: "H2", nickname: "s" + 印, password: "Passw0rd!z3" }) }).then(j);
    const b = await fetch(BASE + "/api/auth/register/verify", { method: "POST", headers: H,
      body: JSON.stringify({ challengeId: a.challengeId, code: a.devCode }) }).then(j);
    const c = await fetch(BASE + "/api/auth/register/consent", { method: "POST", headers: H,
      body: JSON.stringify({ registrationSession: b.registrationSession, agreeTerms: true, agreePrivacy: true, agreeAge: true, pin: "1379" }) }).then(j);
    token = c.token || "";
  } catch (e) {}
  if (!token) { console.log("\n⑪ ★実機の形（安全領域 " + SAT + "/" + SAB + "px）"); ok("試す人を 作れた（echo モードで 起動しているか）", false, "token が 取れない"); return; }

  const br = await chromium.launch();
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e.message).slice(0, 120)));
  await pg.addInitScript((t) => { localStorage.setItem("app.auth.token.v1", t); localStorage.setItem("app.auth.mode.v1", "user"); }, token);
  await pg.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.waitForFunction(() => !!document.getElementById("vqMobBar"), null, { timeout: 60000 }).catch(() => {});
  await pg.waitForTimeout(3000);
  await pg.evaluate(([t, b]) => {
    document.documentElement.style.setProperty("--vq-sat", t + "px");
    document.documentElement.style.setProperty("--vq-sab", b + "px");
    /* 実機は 最初から 値が 入る。ここは 後から 差し替えるので 測り直させる。 */
    window.dispatchEvent(new Event("resize"));
    ["vqLumiTour", "vqTour", "vqInstall", "vqNewsFlash", "vqPin"].forEach((id) => { const e = document.getElementById(id); if (e) e.remove(); });
  }, [SAT, SAB]);
  await pg.waitForTimeout(900);

  const 測る = () => pg.evaluate(([SAT, SAB]) => {
    const 出 = { 上: [], 下: [] };
    const 名 = (e) => {
      let s = e.tagName.toLowerCase();
      if (e.id) s += "#" + e.id;
      const cl = ((e.getAttribute && e.getAttribute("class")) || "").split(/\s+/).filter(Boolean).slice(0, 2);
      if (cl.length) s += "." + cl.join(".");
      const r = e.getRootNode(); if (r && r.host) s = "«" + r.host.id + "»/" + s;
      const t = (e.textContent || "").trim().replace(/\s+/g, " ").slice(0, 22);
      return s + (t ? " " + t : "");
    };
    const 走る = (root) => {
      for (const e of root.querySelectorAll("*")) {
        if (e.shadowRoot) 走る(e.shadowRoot);
        /* 自分の style だけ 見ると **祖先が 透明** な ものまで 拾う
           （閉じている ドロワーの 中身が どの 画面でも 出た）。 */
        if (e.checkVisibility && !e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, contentVisibilityAuto: true })) continue;
        const cs = getComputedStyle(e);
        if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") continue;
        if (cs.pointerEvents === "none" && !(e.textContent || "").trim()) continue;
        const b = e.getBoundingClientRect();
        if (b.width < 8 || b.height < 8 || (b.width > 380 && b.height > 700)) continue;
        /* 横も 見る。画面の 外へ 逃がしてある もの（transform で 横に どけた
           画面）は top だけ 見ると 拾ってしまう。 */
        if (b.right <= 2 || b.left >= innerWidth - 2) continue;
        const 押 = /^(button|a|input|select|textarea)$/.test(e.tagName.toLowerCase());
        const 字 = Array.from(e.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim());
        if (!押 && !字) continue;
        if (b.top < SAT && b.bottom > 2) 出.上.push(名(e));
        /* ★ 浮いた 島（#vqMobBar）自身は 除く。
           島は 安全領域を **わざと** 足さずに 下端 近くへ 置いている
           （足すと 島の 下に 何も 無い 帯が 出る → 2026-09-04 の 訴え）。
           ここで 見たいのは「**読む もの** が ホームバーに 隠れて いないか」。 */
        if (e.getRootNode() && e.getRootNode().host && e.getRootNode().host.id === "vqMobBar") continue;
        if (b.bottom > innerHeight - SAB && b.top < innerHeight - 2) 出.下.push(名(e));
      }
    };
    走る(document);
    const u = (a) => Array.from(new Set(a)).slice(0, 6);
    return { 上: u(出.上), 下: u(出.下) };
  }, [SAT, SAB]);

  const 巻き = async (先) => {
    for (let i = 0; i < (先 ? 3 : 1); i++) {
      await pg.evaluate((先) => {
        const 動く = (root) => { for (const e of root.querySelectorAll("*")) { if (e.shadowRoot) 動く(e.shadowRoot); if (先) { if (e.scrollHeight > e.clientHeight + 8) e.scrollTop = e.scrollHeight; } else if (e.scrollTop) e.scrollTop = 0; } };
        動く(document);
        window.scrollTo(0, 先 ? document.body.scrollHeight : 0);
      }, 先);
      await pg.waitForTimeout(340);
    }
  };

  console.log("\n⑪ ★安全領域 " + SAT + "/" + SAB + "px を 入れて 一巡（上端＝送る前／下端＝送り切り）");
  /* ★ 新UI（#vqScreens）は 自分で 下を 確保する。
     旧UI（main）の 画面も 混ぜて 測る。--vq-mobbar-h を 使う側が
     どこにも 無い ので、旧UI が 島の 下に 潜っていないかは ここで しか 見えない。 */
  const 画面 = [["ホーム", null], ["プリセット", "library"], ["通知", "notifications"],
    ["フィード", "feed"], ["チャット", "chat"],
    ["インサイト（旧UI）", "insight"], ["お知らせ（旧UI）", "news"], ["Qredit（旧UI）", "qredit"]];
  for (const [名, tab] of 画面) {
    if (tab) {
      await pg.evaluate((t) => { const b = document.querySelector('.app-tab-btn[data-app-tab="' + t + '"]'); if (b) b.click(); }, tab);
      await pg.waitForTimeout(1600);
    }
    await 巻き(false);
    const 上 = (await 測る()).上;
    await 巻き(true);
    const 下 = (await 測る()).下;
    ok(名 + ": 時計の 帯(" + SAT + "px)に 食い込む ものが 無い", 上.length === 0, 上.join(" / "));
    ok(名 + ": ホームバーの 帯(" + SAB + "px)に 残る ものが 無い", 下.length === 0, 下.join(" / "));
  }
  /* 左パネル（ドロワー）は 別に 開いて 見る */
  await 巻き(false);
  await pg.evaluate(() => { const b = document.getElementById("appV2SidebarToggle"); if (b) b.click(); });
  await pg.waitForTimeout(1000);
  await 巻き(false);
  const p上 = (await 測る()).上;
  await 巻き(true);
  const p下 = (await 測る()).下;
  ok("左パネル: 時計の 帯に 食い込む ものが 無い", p上.length === 0, p上.join(" / "));
  ok("左パネル: ホームバーの 帯に 残る ものが 無い", p下.length === 0, p下.join(" / "));

  /* ══ ⑫ 上端の 中身（2026-09-04 の 訴え）══════════════════════════
     「上部の が ホーム、プリセットに 適用されてない」
       … 直す前は 中身が 131px から 始まり、時計の 裏にも ピルの 裏にも
         何も 来ていなかった（＝ 透ける ものが 無い）。
     「今の 時計に 被るから もう少し 下げて」… 0px は 時計と 重なった。
     「今度は ハンバーガーと 被ってる。もうちょい 下げたら」… ＋10px も 被った。
     → いまは **時計 ＋ ピルの 高さ**。静止では 何にも 被らない。
       送れば 中身が ピルと 時計の 裏を 通り、そこで 透ける。 */
  console.log("\n⑫ ★上端の 中身（上端から 始まり、半透明の ピルの 裏を 通る）");
  /* ★ ホームも 明示して 戻る。null に すると 直前の 画面（左パネルなど）が
     残ったまま 測って しまい、中身が 取れずに 落ちる。 */
  for (const [名, tab] of [["ホーム", "home"], ["プリセット", "library"]]) {
    if (tab) {
      await pg.evaluate((t) => { const b = document.querySelector('.app-tab-btn[data-app-tab="' + t + '"]'); if (b) b.click(); }, tab);
      await pg.waitForTimeout(1600);
    }
    await 巻き(false);
    const m = await pg.evaluate(([SAT]) => {
      const s = document.getElementById("vqScreens");
      const wrap = s && s.shadowRoot ? s.shadowRoot.querySelector(".wrap") : null;
      const tb = document.getElementById("vqTopbar");
      const pill = tb && tb.shadowRoot ? tb.shadowRoot.querySelector(".bar") : null;
      if (!wrap || !pill) return null;
      const pr = pill.getBoundingClientRect();
      let 上端 = 1e9;
      for (const e of wrap.querySelectorAll("*")) {
        const b = e.getBoundingClientRect();
        if (b.height < 6 || b.width < 6) continue;
        if (b.top < 上端) 上端 = b.top;
      }
      return { 中身の上端: Math.round(上端), ピルの上: Math.round(pr.top), ピルの下: Math.round(pr.bottom), SAT: SAT };
    }, [SAT]);
    if (!m) { ok(名 + ": 測れた", false); continue; }
    /* ★ 2026-09-04「まだ 時計まで 上端が 達してない」→ 上は 空けない。
       他の 画面（main）は webview の 上端から 中身が 始まる。
       ホーム・プリセットだけ ピル(58px)ぶん 空けて いたのが「達して いない」
       に 見えて いた。浮いた ピルは 半透明なので 裏を 中身が 通って 透ける。 */
    ok(名 + ": 中身が 上端から 始まる（ピルの 裏を 通る）",
      m.中身の上端 <= 20, "中身の上端=" + m.中身の上端 + "px");
    ok(名 + ": ピルが 中身の 上に 浮いている",
      m.ピルの上 <= m.中身の上端 + 8, "ピルの上=" + m.ピルの上 + " 中身=" + m.中身の上端);
  }

  /* ══ ⑭ 時計の 帯の 色（2026-09-04・実機の 写真で 判明）════════════
     ホーム画面の アプリでは 上の 安全領域（時計の 帯）は webview の 外で、
     iOS が theme-color で 塗る。そこが アプリの 地色と 違うと **段差**に なる。
     media="(prefers-color-scheme:…)" は **端末の 設定**しか 見ないので、
     アプリ側で テーマを 選んで いる 場合（端末 ダーク × アプリ ライト）に
     必ず 食い違う。→ JS が アプリの 地色を 入れる。 */
  /* ══ ⑭ 時計の 帯（2026-09-04・実機の 写真から 判明）════════════════
     iOS では **theme-color で 帯の 色は 変わらない**（Android/Chrome 用）。
     実測: theme-color に #131218 を 入れても 帯は rgb(47,46,48) の まま。
     iOS で 効くのは status-bar-style の default / black / black-translucent。
     → 暗い テーマなら black、明るければ default。 */
  console.log("\n⑭ ★時計の 帯が アプリの テーマに 合う");
  for (const m of ["light", "dark", "light"]) {
    const c = await pg.evaluate((m) => {
      document.documentElement.setAttribute("data-theme-mode", m);
      return new Promise((r) => setTimeout(() => r({
        型: (document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]') || {}).content || "",
        色: (document.querySelector('meta[name="theme-color"]') || {}).content || "",
        地: getComputedStyle(document.documentElement).getPropertyValue("--vq-bg-canvas").trim()
      }), 350));
    }, m);
    ok("アプリ " + m + ": 帯の 型 = " + (m === "dark" ? "black" : "default"),
      c.型 === (m === "dark" ? "black" : "default"), "型=" + c.型);
    ok("アプリ " + m + ": theme-color も 地色（Android 用）",
      c.色.toLowerCase() === c.地.toLowerCase(), "色=" + c.色 + " 地色=" + c.地);
  }

  /* ══ ⑮ ホーム・プリセットの 下の 隙間（2026-09-04）════════════════
     訴え「ホーム画面、プリセットだけ 毎回 下端に 隙間が できる」。
     この 2 つだけ #vqScreens という 別の 器で、中身の 下余白に
     **器の 高さ**（＝ 島 ＋ 島の 下の 空き ＝ 100px）を 使って いた。
     浮いた 島の **上にも 下にも** 空きが でき、そこだけ 隙間に 見えた。
     → 中身は **島の 下端**まで 続かせる（--vqs-pbc）。 */
  console.log("\n⑮ ★ホーム・プリセットの 下に 隙間が できない");
  await pg.evaluate(() => {
    document.documentElement.style.setProperty("--vq-sab", "34px");
    window.dispatchEvent(new Event("resize"));
  });
  await pg.waitForTimeout(700);
  const 隙 = await pg.evaluate(() => {
    const h = document.getElementById("vqMobBar");
    const s = document.getElementById("vqScreens");
    const bar = h && h.shadowRoot ? h.shadowRoot.querySelector(".bar") : null;
    const wrap = s && s.shadowRoot ? s.shadowRoot.querySelector(".wrap") : null;
    if (!bar || !wrap) return null;
    return {
      島の下端: Math.round(bar.getBoundingClientRect().bottom),
      中身の下余白: Math.round(parseFloat(getComputedStyle(wrap).paddingBottom) || 0),
      島の下の空き: Math.round(innerHeight - bar.getBoundingClientRect().bottom),
      pbc: s.style.getPropertyValue("--vqs-pbc")
    };
  });
  if (!隙) ok("測れた", false);
  else {
    ok("中身の 下余白 ＝ 島の 下の 空き（器の 高さでは ない）",
      Math.abs(隙.中身の下余白 - 隙.島の下の空き) <= 1,
      "余白=" + 隙.中身の下余白 + "px 島の下=" + 隙.島の下の空き + "px");
    ok("中身が 島の 下端まで 届く（下に 何も無い 帯を 作らない）",
      隙.中身の下余白 <= 隙.島の下の空き + 1,
      "余白=" + 隙.中身の下余白 + "px");
    ok("--vqs-pbc が 配られている", !!隙.pbc, 隙.pbc);
  }

  ok("一巡して 画面エラーが 出ていない", errs.length === 0, errs.join(" / "));
  await br.close();
}

(async () => {
  console.log("═══ vqsafearea — 全画面（standalone）の上下端 ═══");
  staticChecks();
  await liveChecks();
  await 実機の形();
  console.log("\n─────────────────────────────");
  console.log("通過 " + pass + " / 失敗 " + fail);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("落ちた:", e); process.exit(1); });
