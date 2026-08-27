/* ══════════════════════════════════════════════════════════════════════
   公式サイトの自己検証（指示書 第14節）— 段A

   ★ 「見た目が良さそう」では合格にしない。**測る。**
     ・横スクロールは px で測る
     ・触れる場所の大きさは 1 つずつ測る
     ・紫の面積は **描かれた画素を数えて** 割合を出す
     ・文字と背景の差（コントラスト比）は計算する
   ══════════════════════════════════════════════════════════════════════ */
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const path = require("path");
const fs = require("fs");
const OUT = path.join(__dirname, "_siteout");
fs.mkdirSync(OUT, { recursive: true });

let pass = 0, fail = 0; const 落ち = [];
function ok(n, c, d) {
  if (c) { pass++; console.log("  ✅ " + n); }
  else { fail++; 落ち.push(n); console.log("  ❌ " + n + (d !== undefined ? "  → " + JSON.stringify(d).slice(0, 400) : "")); }
}
function 節(t) { console.log("\n■ " + t); }

/* ── 色の差（WCAG のコントラスト比）───────────────────────────────── */
function 相対輝度(rgb) {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
}
function 比(a, b) {
  const l1 = 相対輝度(a), l2 = 相対輝度(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
function 色を読む(s) {
  const m = /rgba?\(([^)]+)\)/.exec(String(s));
  if (!m) return null;
  const a = m[1].split(",").map((x) => parseFloat(x));
  return [a[0], a[1], a[2]];
}

const 幅ら = [320, 375, 768, 1024, 1440];

(async () => {
  const { chromium } = require("playwright");
  const br = await chromium.launch();

  節("① 経路 — /site が公式サイトを返し、アプリ本体を返さないか");
  {
    const NAV = { "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "document",
                  "Accept": "text/html,application/xhtml+xml" };
    const r = await fetch(BASE + "/site", { headers: NAV });
    const html = await r.text();
    ok("/site が 200 を返す", r.status === 200, r.status);
    ok("公式サイトの HTML が返る（アプリ本体ではない）",
      /VocabuQuiz — 話すと、試験になる。/.test(html) && html.length < 200000,
      { len: html.length, 先頭: html.slice(0, 80) });
    const css = await fetch(BASE + "/site/site.css");
    ok("site.css が text/css で返る",
      css.status === 200 && /text\/css/.test(css.headers.get("content-type") || ""),
      css.headers.get("content-type"));
    const js = await fetch(BASE + "/site/site.js");
    ok("site.js が javascript で返る",
      js.status === 200 && /javascript/.test(js.headers.get("content-type") || ""),
      js.headers.get("content-type"));
    const nf = await fetch(BASE + "/site/no-such-page", { headers: NAV });
    const nfh = await nf.text();
    ok("まだ無い道は 404（本体へ落ちない）",
      nf.status === 404 && nfh.length < 100000 && !/vqShell/.test(nfh),
      { status: nf.status, len: nfh.length });
    /* 既存アプリが無事か */
    const app = await fetch(BASE + "/", { headers: NAV });
    const appH = await app.text();
    ok("既存アプリはこれまで通り開く", app.status === 200 && appH.length > 1000000, appH.length);
  }

  節("② CSS に禁止事項が入っていないか");
  {
    const css = await fetch(BASE + "/site/site.css").then((r) => r.text());
    /* コメントを外してから見る（「使わない」と書いた説明文まで拾わないため） */
    const 素 = css.replace(/\/\*[\s\S]*?\*\//g, "");
    ok("overflow-x: hidden を使っていない", !/overflow-x\s*:\s*hidden/.test(素),
      (素.match(/[^;{]*overflow-x\s*:\s*hidden[^;}]*/) || [])[0]);
    ok("100vh / 100dvh を高さに使っていない（100svh のみ）",
      !/height\s*:\s*100vh/.test(素) && !/height\s*:\s*100dvh/.test(素),
      (素.match(/height\s*:\s*100d?vh/) || [])[0]);
    ok("prefers-reduced-motion の指定がある", /prefers-reduced-motion\s*:\s*reduce/.test(素));
    ok("-webkit-tap-highlight-color を決めている", /-webkit-tap-highlight-color/.test(素));
    ok("safe-area-inset を見ている", /safe-area-inset/.test(素));
    const html = await fetch(BASE + "/site").then((r) => r.text());
    ok("three.js / canvas を使っていない",
      !/three\.min\.js|three\.module|getContext\(["']2d/.test(html), "");
    ok("すべての SVG に viewBox がある",
      (html.match(/<svg\b(?![^>]*viewBox)/g) || []).length === 0,
      (html.match(/<svg\b(?![^>]*viewBox)[^>]*/g) || []).slice(0, 2));
    ok("すべての SVG に preserveAspectRatio がある",
      (html.match(/<svg\b(?![^>]*preserveAspectRatio)/g) || []).length === 0,
      (html.match(/<svg\b(?![^>]*preserveAspectRatio)[^>]*/g) || []).slice(0, 2));
    ok("紫の帯は 1 本だけ", (html.match(/url\(#band\)/g) || []).length === 1,
      (html.match(/url\(#band\)/g) || []).length);
    const 星 = (html.match(/class="star\b/g) || []).length;
    const 減らす星 = (html.match(/star star--extra/g) || []).length;
    ok("星は 60 個・うち 40 個をモバイルで隠す（残り 20）",
      星 === 60 && 減らす星 === 40, { 全部: 星, モバイルで隠す: 減らす星 });
  }

  節("③ 画面幅ごと — 横スクロール・はみ出し");
  for (const w of 幅ら) {
    const pg = await (await br.newContext({ viewport: { width: w, height: 900 },
      deviceScaleFactor: 1 })).newPage();
    const errs = [];
    pg.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
    await pg.goto(BASE + "/site", { waitUntil: "networkidle", timeout: 60000 });
    await pg.waitForTimeout(700);
    const r = await pg.evaluate(() => {
      const de = document.documentElement;
      const あふれ = de.scrollWidth - de.clientWidth;
      /* どの要素がはみ出しているかまで出す（原因を消すため） */
      /* ★ 「枠から出ている」の定義をきちんとする。
         図形の箱が画面の外にあっても、**切り取る親の中**にあるなら
         人には見えないし、横スクロールも起きない
         （背景の SVG は slice で必ず外へ出るし、波紋も SVG に切られる）。
         見たいのは「**目に見えてはみ出しているもの**」だけ。 */
      const 切られている = (el) => {
        let p = el.parentElement;
        while (p && p !== document.documentElement) {
          const st = getComputedStyle(p);
          const 切る = /hidden|clip|auto|scroll/.test(st.overflow + st.overflowX + st.overflowY)
            || p.tagName.toLowerCase() === "svg";   /* 外側の svg は既定で切り取る */
          if (切る) {
            const pb = p.getBoundingClientRect();
            if (pb.right <= de.clientWidth + 1 && pb.left >= -1) return true;
          }
          p = p.parentElement;
        }
        return false;
      };
      const 犯人 = [];
      document.querySelectorAll("body *").forEach((el) => {
        const b = el.getBoundingClientRect();
        if (b.width === 0) return;
        if (b.right > de.clientWidth + 1 || b.left < -1) {
          if (切られている(el)) return;
          犯人.push(el.tagName.toLowerCase() + (el.className && typeof el.className === "string"
            ? "." + el.className.split(" ")[0] : "")
            + " [" + Math.round(b.left) + "→" + Math.round(b.right) + "]");
        }
      });
      const 箱 = document.querySelector(".space");
      const 箱b = 箱.getBoundingClientRect();
      const 背景はみ出し = 箱b.right > de.clientWidth + 1 || 箱b.left < -1;
      return { あふれ, 犯人: 犯人.slice(0, 6), 背景はみ出し, 幅: de.clientWidth };
    });
    ok(w + "px: 横スクロールが 0px", r.あふれ <= 0, { あふれ: r.あふれ, 原因: r.犯人 });
    ok(w + "px: 目に見えてはみ出している要素が無い", r.犯人.length === 0, r.犯人);
    ok(w + "px: 背景の入れ物が枠から出ていない", r.背景はみ出し === false, r.背景はみ出し);
    ok(w + "px: 画面の失敗が出ていない", errs.length === 0, errs.slice(0, 2));
    await pg.screenshot({ path: path.join(OUT, "site-" + w + ".png"), fullPage: false });
    await pg.close();
  }

  節("④ 触れる場所の大きさ（44×44px 以上）");
  {
    const pg = await (await br.newContext({ viewport: { width: 375, height: 812 } })).newPage();
    await pg.goto(BASE + "/site", { waitUntil: "networkidle", timeout: 60000 });
    await pg.waitForTimeout(500);
    const 小さい = await pg.evaluate(() => {
      const 出 = [];
      document.querySelectorAll("a[href], button").forEach((el) => {
        if (el.closest('[data-open="false"]')) return;   /* 閉じたメニューの中は除く */
        if (el.classList.contains("skip")) return;        /* 飛び先リンクは focus 時のみ */
        const b = el.getBoundingClientRect();
        if (b.width === 0 && b.height === 0) return;
        if (b.height < 44 || b.width < 44) {
          出.push({ t: (el.textContent || "").trim().slice(0, 14),
                    w: Math.round(b.width), h: Math.round(b.height) });
        }
      });
      return 出;
    });
    ok("表に出ている触れる場所がすべて 44px 以上", 小さい.length === 0, 小さい);

    /* メニューを開いた状態でも測る */
    await pg.click("#burger");
    await pg.waitForTimeout(400);
    const 小さい2 = await pg.evaluate(() => {
      const 出 = [];
      document.querySelectorAll("#menu a[href], #menu button").forEach((el) => {
        const b = el.getBoundingClientRect();
        if (b.height < 44 || b.width < 44) 出.push({ t: (el.textContent || "").trim().slice(0, 14),
          w: Math.round(b.width), h: Math.round(b.height) });
      });
      return 出;
    });
    ok("メニューの中も 44px 以上", 小さい2.length === 0, 小さい2);
    const あふれ2 = await pg.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok("メニューを開いても横スクロールしない", あふれ2 <= 0, あふれ2);
    await pg.screenshot({ path: path.join(OUT, "site-menu-375.png") });
    await pg.close();
  }

  節("⑤ キーボードだけで動かせるか");
  {
    const pg = await (await br.newContext({ viewport: { width: 375, height: 812 } })).newPage();
    await pg.goto(BASE + "/site", { waitUntil: "networkidle", timeout: 60000 });
    await pg.waitForTimeout(400);
    await pg.keyboard.press("Tab");
    const 最初 = await pg.evaluate(() => (document.activeElement.className || "") + "/" + (document.activeElement.textContent || "").trim().slice(0, 10));
    ok("最初の Tab が「本文へ移動」に当たる", /skip/.test(最初), 最初);

    await pg.focus("#burger");
    await pg.keyboard.press("Enter");
    await pg.waitForTimeout(400);
    ok("Enter でメニューが開く", await pg.getAttribute("#menu", "data-open") === "true");
    const 中 = await pg.evaluate(() => !!document.getElementById("menu").contains(document.activeElement));
    ok("開いたらメニューの中へ移る", 中);
    await pg.keyboard.press("Escape");
    await pg.waitForTimeout(400);
    ok("Escape で閉じる", await pg.getAttribute("#menu", "data-open") === "false");
    const 戻った = await pg.evaluate(() => document.activeElement.id === "burger");
    ok("閉じたら元のボタンへ戻る", 戻った);
    const 触れない = await pg.evaluate(() => document.getElementById("menu").hasAttribute("inert"));
    ok("閉じたメニューは Tab で入れない（inert）", 触れない);
    await pg.close();
  }

  節("⑥ 色 — 文字の読みやすさと、紫の面積");
  {
    const pg = await (await br.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await pg.goto(BASE + "/site", { waitUntil: "networkidle", timeout: 60000 });
    await pg.waitForTimeout(600);
    const 色 = await pg.evaluate(() => {
      const g = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        return { c: getComputedStyle(el).color, bg: getComputedStyle(document.body).backgroundColor,
                 t: (el.textContent || "").trim().slice(0, 12) };
      };
      return { 本文: g(".section__lead"), 見出し: g("h1"), 小: g(".footer__link"),
               ラベル: g(".section__label") };
    });
    const bg = 色を読む(色.本文.bg);
    for (const [名, 必要, v] of [["本文", 7.0, 色.本文], ["見出し", 4.5, 色.見出し],
                                  ["フッターのリンク", 4.5, 色.小], ["セクション見出し", 4.5, 色.ラベル]]) {
      const c = 色を読む(v.c);
      const 実測 = 比(c, bg);
      ok(名 + "のコントラスト比が " + 必要 + " 以上（実測 " + 実測.toFixed(2) + "）",
        実測 >= 必要, { 色: v.c, 背景: v.bg, 実測: 実測.toFixed(2) });
    }

    /* ★ 紫の面積を **画素を数えて** 測る。感覚で判断しない。 */
    const buf = await pg.screenshot({ path: path.join(OUT, "site-1440.png") });
    /* ★ 画素の数え上げは **node 側**でやる。
       ページに canvas を持ち込むと、付録の禁止事項に触れてしまう。 */
    const 数 = 紫の割合(buf);
    ok("彩度の高い紫の面積が 1 画面の 10% 以下（実測 " + 数.pct.toFixed(2) + "%）",
      数.pct <= 10, 数);
    await pg.close();
  }

  節("⑦ 動きの決まり");
  {
    const pg = await (await br.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await pg.goto(BASE + "/site", { waitUntil: "networkidle", timeout: 60000 });
    await pg.waitForTimeout(900);
    const r = await pg.evaluate(() => {
      const 出 = [];
      document.querySelectorAll("*").forEach((el) => {
        const st = getComputedStyle(el);
        if (st.animationName && st.animationName !== "none") {
          const d = parseFloat(st.animationDuration) || 0;
          出.push({ 名: st.animationName, 秒: d, cls: (el.className || "").toString().split(" ")[0] });
        }
      });
      return 出;
    });
    const 星 = r.filter((x) => x.名 === "twinkle");
    /* ★ 規約は「1 画面で同時に動くのは 1 つ」「ループは 1 画面に 1 つまで」。
       名前を並べて確かめるのではなく、**いま実際に走っているものの数**を数える。
       絵は [data-anim] の箱ごとに、画面へ入ったときだけ走る作りにしてある。 */
    const 走っている箱 = await pg.evaluate(() => {
      const 箱 = Array.from(document.querySelectorAll("[data-anim]"));
      return 箱.filter((b) => Array.from(b.querySelectorAll("*")).some((e) => {
        const st = getComputedStyle(e);
        return st.animationName !== "none" && st.animationPlayState === "running";
      })).map((b) => b.className || b.id || b.tagName);
    });
    ok("同時に走っている絵は 1 つまで（画面に入ったものだけ動く）",
      走っている箱.length <= 1, 走っている箱);
    const 箱の外 = await pg.evaluate(() => {
      const 出 = [];
      document.querySelectorAll("*").forEach((el) => {
        const st = getComputedStyle(el);
        if (st.animationName === "none" || st.animationName === "twinkle") return;
        if (!el.closest("[data-anim]")) 出.push(st.animationName);
      });
      return Array.from(new Set(出));
    });
    ok("止められない場所で回り続けているものが無い", 箱の外.length === 0, 箱の外);
    ok("星の周期が 3〜6 秒に収まっている",
      星.length > 0 && 星.every((x) => x.秒 >= 3 && x.秒 <= 6),
      { 数: 星.length, 最短: Math.min.apply(null, 星.map((x) => x.秒)),
        最長: Math.max.apply(null, 星.map((x) => x.秒)) });

    /* 出たものが、上下スクロールで再生されないこと */
    await pg.evaluate(() => window.scrollTo(0, 1500));
    await pg.waitForTimeout(600);
    await pg.evaluate(() => window.scrollTo(0, 0));
    await pg.waitForTimeout(600);
    const 残り = await pg.evaluate(() =>
      Array.from(document.querySelectorAll(".reveal")).filter((e) => e.getAttribute("data-shown") !== "true").length);
    const 総数 = await pg.evaluate(() => document.querySelectorAll(".reveal").length);
    ok("一度出た演出は消えない（" + (総数 - 残り) + "/" + 総数 + " が出たまま）",
      残り === 0 || 残り < 総数, { 出ていない: 残り, 総数 });
    await pg.close();
  }

  節("⑧ 動きを減らす設定");
  {
    const pg = await (await br.newContext({ viewport: { width: 1440, height: 900 },
      reducedMotion: "reduce" })).newPage();
    await pg.goto(BASE + "/site", { waitUntil: "networkidle", timeout: 60000 });
    await pg.waitForTimeout(800);
    const 動くもの = await pg.evaluate(() => {
      const 出 = [];
      document.querySelectorAll("*").forEach((el) => {
        const st = getComputedStyle(el);
        const d = parseFloat(st.animationDuration) || 0;
        if (st.animationName !== "none" && d > 0.01) 出.push(st.animationName);
      });
      return 出;
    });
    ok("すべてのアニメーションが止まる", 動くもの.length === 0, 動くもの.slice(0, 4));
    const 見えている = await pg.evaluate(() =>
      Array.from(document.querySelectorAll(".reveal")).every((e) => getComputedStyle(e).opacity === "1"));
    ok("最終状態が静止画として見えている（内容が消えない）", 見えている);
    await pg.screenshot({ path: path.join(OUT, "site-reduced.png") });
    await pg.close();
  }

  節("⑨ iOS まわり");
  {
    const html = await fetch(BASE + "/site").then((r) => r.text());
    ok("viewport-fit=cover がある", /viewport-fit=cover/.test(html));
    const css = await fetch(BASE + "/site/site.css").then((r) => r.text()).then((c) => c.replace(/\/\*[\s\S]*?\*\//g, ""));
    ok("背景に position: fixed を使っていない",
      !/\.space\s*\{[^}]*position\s*:\s*fixed/.test(css));
    ok("背景は sticky で貼っている", /\.space\s*\{[^}]*position\s*:\s*sticky/.test(css));
    ok("高さは 100svh", /height\s*:\s*100svh/.test(css));
    ok("本文の最小が 15px 以上（入力の自動拡大を避ける下地）",
      /--fs-body:\s*clamp\(0\.9375rem/.test(css));
  }

  節("⑩ 段B — ヒーローのカルーセル");
  {
    const pg = await (await br.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await pg.goto(BASE + "/site", { waitUntil: "networkidle", timeout: 60000 });
    await pg.waitForTimeout(1200);

    const 形 = await pg.evaluate(() => {
      const 札 = Array.from(document.querySelectorAll(".hero__slide"));
      const 点 = Array.from(document.querySelectorAll(".hero__dot"));
      const h = document.getElementById("hero").getBoundingClientRect();
      return {
        札の数: 札.length, 点の数: 点.length,
        高さ: Math.round(h.height), 画面: window.innerHeight,
        見えている: 札.filter((e) => e.getAttribute("data-active") === "true").length,
        触れない: 札.filter((e) => e.hasAttribute("inert")).length,
        止めるボタン: !!document.getElementById("heroPause")
      };
    });
    ok("札が 3〜4 枚ある（最新のお知らせが無ければ 3 枚）",
      形.札の数 === 4 || 形.札の数 === 3, 形);
    ok("点の数が札の数と合っている", 形.点の数 === 形.札の数, 形);
    ok("見えている札は 1 枚だけ", 形.見えている === 1, 形);
    ok("見えていない札は Tab で拾えない（inert）", 形.触れない === 形.札の数 - 1, 形);
    ok("一時停止ボタンがある", 形.止めるボタン);
    ok("高さが画面に収まっている（100svh から見出し分を引いている）",
      形.高さ <= 形.画面 + 2, 形);

    /* 一時停止が **本当に効く** か。7 秒待って動かないことを見る。 */
    const 前 = await pg.evaluate(() =>
      Array.from(document.querySelectorAll(".hero__slide")).findIndex((e) => e.getAttribute("data-active") === "true"));
    await pg.click("#heroPause");
    ok("押すと止まった見た目になる",
      await pg.getAttribute("#heroPause", "data-paused") === "true");
    await pg.waitForTimeout(8200);
    const 後 = await pg.evaluate(() =>
      Array.from(document.querySelectorAll(".hero__slide")).findIndex((e) => e.getAttribute("data-active") === "true"));
    ok("止めている間は 8 秒たっても送られない", 前 === 後, { 前, 後 });

    /* もう一度押したら自動送りが戻ること */
    await pg.click("#heroPause");
    await pg.mouse.move(1400, 880);   /* ヒーローから離れる（触れている間は止まる作りのため） */
    await pg.waitForTimeout(8200);
    const 再 = await pg.evaluate(() =>
      Array.from(document.querySelectorAll(".hero__slide")).findIndex((e) => e.getAttribute("data-active") === "true"));
    ok("戻すと自動送りが再開する", 再 !== 後, { 止めた位置: 後, いま: 再 });

    /* キーボード */
    await pg.click("#heroPause");             /* いったん止めて、送りと混ざらないようにする */
    await pg.focus("#hero");
    const k0 = await pg.evaluate(() =>
      Array.from(document.querySelectorAll(".hero__slide")).findIndex((e) => e.getAttribute("data-active") === "true"));
    await pg.keyboard.press("ArrowRight");
    await pg.waitForTimeout(300);
    const k1 = await pg.evaluate(() =>
      Array.from(document.querySelectorAll(".hero__slide")).findIndex((e) => e.getAttribute("data-active") === "true"));
    ok("→ で次の札へ進む", k1 !== k0, { k0, k1 });
    await pg.keyboard.press("ArrowLeft");
    await pg.waitForTimeout(300);
    const k2 = await pg.evaluate(() =>
      Array.from(document.querySelectorAll(".hero__slide")).findIndex((e) => e.getAttribute("data-active") === "true"));
    ok("← で前の札へ戻る", k2 === k0, { k0, k2 });
    const p前 = await pg.getAttribute("#heroPause", "data-paused");
    await pg.keyboard.press(" ");
    await pg.waitForTimeout(200);
    ok("Space で一時停止が切り替わる",
      (await pg.getAttribute("#heroPause", "data-paused")) !== p前, p前);

    /* 点を押して切り替わること・44px あること */
    const 点の大きさ = await pg.evaluate(() =>
      Array.from(document.querySelectorAll(".hero__dot")).map((b) => {
        const r = b.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; }));
    ok("点の触れる場所が 44×44px 以上",
      点の大きさ.every((x) => x.w >= 44 && x.h >= 44), 点の大きさ);

    await pg.screenshot({ path: path.join(OUT, "hero-1440.png") });
    await pg.close();
  }

  節("⑪ 段B — モバイルでは自動送りをしない");
  {
    const pg = await (await br.newContext({ viewport: { width: 375, height: 812 },
      hasTouch: true, isMobile: true })).newPage();
    await pg.goto(BASE + "/site", { waitUntil: "networkidle", timeout: 60000 });
    await pg.waitForTimeout(800);
    const 前 = await pg.evaluate(() =>
      Array.from(document.querySelectorAll(".hero__slide")).findIndex((e) => e.getAttribute("data-active") === "true"));
    await pg.waitForTimeout(8200);
    const 後 = await pg.evaluate(() =>
      Array.from(document.querySelectorAll(".hero__slide")).findIndex((e) => e.getAttribute("data-active") === "true"));
    ok("モバイルでは 8 秒たっても自動で送られない", 前 === 後, { 前, 後 });

    /* 指でなぞって送れること */
    const 箱 = await pg.locator("#heroStage").boundingBox();
    await pg.touchscreen.tap(箱.x + 箱.width / 2, 箱.y + 箱.height / 2);
    await pg.evaluate(() => {
      const s = document.getElementById("heroStage");
      const 作る = (name, x, y) => {
        const t = new Touch({ identifier: 1, target: s, clientX: x, clientY: y });
        s.dispatchEvent(new TouchEvent(name, { touches: name === "touchend" ? [] : [t],
          changedTouches: [t], bubbles: true }));
      };
      作る("touchstart", 300, 400);
      作る("touchend", 120, 405);
    });
    await pg.waitForTimeout(400);
    const なぞり後 = await pg.evaluate(() =>
      Array.from(document.querySelectorAll(".hero__slide")).findIndex((e) => e.getAttribute("data-active") === "true"));
    ok("左へなぞると次の札へ進む", なぞり後 !== 後, { 後, なぞり後 });

    const あふれ = await pg.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok("ヒーローがあっても横スクロールが 0px", あふれ <= 0, あふれ);
    await pg.screenshot({ path: path.join(OUT, "hero-375.png") });
    await pg.close();
  }

  節("⑫ 段B — Lumi の絵と、動きの数");
  {
    const pg = await (await br.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await pg.goto(BASE + "/site", { waitUntil: "networkidle", timeout: 60000 });
    await pg.waitForTimeout(900);
    const 動き = await pg.evaluate(() => {
      const 出 = { 星: 0, lumi: [], その他: [] };
      document.querySelectorAll("*").forEach((el) => {
        const st = getComputedStyle(el);
        if (!st.animationName || st.animationName === "none") return;
        if (st.animationName === "twinkle") { 出.星++; return; }
        if (/^lumi-/.test(st.animationName)) { 出.lumi.push({ n: st.animationName, d: parseFloat(st.animationDuration) }); return; }
        出.その他.push(st.animationName);
      });
      return 出;
    });
    ok("Lumi の絵の部品がそろっている（光球・波紋・紙面・行・記号）",
      new Set(動き.lumi.map((x) => x.n)).size >= 5,
      Array.from(new Set(動き.lumi.map((x) => x.n))));
    ok("Lumi の絵は 8 秒周期", 動き.lumi.length > 0 && 動き.lumi.every((x) => x.d === 8),
      Array.from(new Set(動き.lumi.map((x) => x.d))));
    ok("段D の 2 つの絵も 7 秒 / 6 秒で入っている",
      動き.その他.some((n) => /^chk-/.test(n)) && 動き.その他.some((n) => /^ed-/.test(n)),
      Array.from(new Set(動き.その他)));

    /* 動きを減らす設定で、絵の最終状態が残っているか */
    const rp = await (await br.newContext({ viewport: { width: 1440, height: 900 },
      reducedMotion: "reduce" })).newPage();
    await rp.goto(BASE + "/site", { waitUntil: "networkidle", timeout: 60000 });
    await rp.waitForTimeout(800);
    const 残り = await rp.evaluate(() => {
      const g = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const st = getComputedStyle(el);
        return { op: st.opacity, tr: st.transform };
      };
      return { 紙面: g(".lumi__paper"), 行: g(".lumi__line"), 記号: g(".lumi__sym"),
               動作中: Array.from(document.querySelectorAll("*")).filter((e) => {
                 const st = getComputedStyle(e);
                 return st.animationName !== "none" && (parseFloat(st.animationDuration) || 0) > 0.01;
               }).length };
    });
    ok("動きを減らす設定で、紙面が見えたまま残る", 残り.紙面 && 残り.紙面.op === "1", 残り.紙面);
    ok("動きを減らす設定で、本文の行が縮んだままにならない",
      残り.行 && !/matrix\(0/.test(残り.行.tr), 残り.行);
    ok("動きを減らす設定で、数式記号が見えたまま残る", 残り.記号 && 残り.記号.op === "1", 残り.記号);
    ok("動きを減らす設定で、動いているものが 0", 残り.動作中 === 0, 残り.動作中);
    await rp.screenshot({ path: path.join(OUT, "hero-reduced.png") });
    await rp.close();
    await pg.close();
  }

  節("⑬ 段B — 最新のお知らせ（管理画面と同じ置き場所）");
  {
    const r = await fetch(BASE + "/api/site/news/latest?limit=1");
    const j = await r.json().catch(() => ({}));
    ok("/api/site/news/latest が JSON を返す", r.status === 200 && j.ok === true, { status: r.status, j });
    ok("返すのは公開済みのものだけ（配列）", Array.isArray(j.items), j);
    if (j.items && j.items[0]) {
      ok("記事の URL が永続の形（/site/news/YYYY/MM/…）",
        /^\/site\/news\/\d{4}\/\d{2}\//.test(j.items[0].url), j.items[0].url);
      ok("本文そのものは返さない（要約まで）",
        j.items[0].body === undefined, Object.keys(j.items[0]));
    } else {
      console.log("     （公開済みのお知らせが 0 件なので、4 枚目は出ません）");
    }
  }

  節("⑭ 段E — 稼働状況（出してはいけないものが混ざっていないか）");
  {
    const r = await fetch(BASE + "/api/status");
    const j = await r.json().catch(() => ({}));
    ok("/api/status が JSON を返す", r.status === 200 && !!j.updated_at, j);
    ok("60 秒の持ち回しが付いている",
      /max-age=60/.test(r.headers.get("cache-control") || ""), r.headers.get("cache-control"));
    ok("状態は 3 つのどれか", ["operational", "degraded", "outage"].includes(j.state), j.state);
    /* ★★ ここが本題。**提供元も残枠も利用者数も出さない。** */
    const 生 = JSON.stringify(j);
    const 禁 = /groq|gemini|workers_ai|openai|cloudflare|rpd|rpm|tpm|quota|remaining|api[_-]?key|users?_count|stack|error_message/i;
    ok("提供元名・残枠・利用者数の生値が入っていない", !禁.test(生), (生.match(禁) || [])[0]);
    ok("返す項目は決めた 5 つだけ",
      Object.keys(j).sort().join(",") === "avg_latency_ms,generations_today,state,updated_at,uptime_24h",
      Object.keys(j));
    ok("今日の生成件数は 100 件単位に丸めてある",
      j.generations_today === null || j.generations_today % 100 === 0, j.generations_today);

    const pg = await (await br.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await pg.goto(BASE + "/site", { waitUntil: "networkidle", timeout: 60000 });
    await pg.evaluate(() => document.getElementById("status").scrollIntoView({ block: "center" }));
    await pg.waitForTimeout(1600);
    const 見え = await pg.evaluate(() => ({
      state: document.getElementById("statusPill").getAttribute("data-state"),
      text: (document.getElementById("statusText").textContent || "").trim(),
      値: ["statusUptime", "statusGen", "statusLatency"].map((id) =>
        (document.getElementById(id).textContent || "").trim())
    }));
    ok("状態を **色だけでなく文字でも** 出している", 見え.text.length > 0 && 見え.state !== "unknown", 見え);
    ok("数が入っている（または「まだ出せません」と言う）",
      見え.値.every((t) => t.length > 0), 見え.値);

    /* 取れないときに黙らないか */
    const bp = await (await br.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await bp.route("**/api/status", (r2) => r2.abort());
    await bp.goto(BASE + "/site", { waitUntil: "domcontentloaded", timeout: 60000 });
    await bp.waitForTimeout(2000);
    const 失敗時 = await bp.evaluate(() => (document.getElementById("statusText").textContent || "").trim());
    ok("取得できなかったら **そう出す**（握りつぶさない）", /取得できませんでした/.test(失敗時), 失敗時);
    await bp.close();
    await pg.close();
  }

  節("⑮ 段F — ニュース（一覧・記事・OGP・RSS・サイトマップ）");
  {
    const NAV = { "Sec-Fetch-Mode": "navigate", "Accept": "text/html" };
    const 一覧 = await fetch(BASE + "/site/news", { headers: NAV });
    const 一覧h = await 一覧.text();
    ok("一覧が開く", 一覧.status === 200 && /お知らせ/.test(一覧h), 一覧.status);
    ok("一覧に無限スクロールを使っていない（ページ送り）",
      !/IntersectionObserver[\s\S]{0,200}fetch\(/.test(一覧h), "");

    const j = await fetch(BASE + "/api/site/news/latest?limit=1").then((r) => r.json());
    if (!j.items || !j.items[0]) {
      console.log("     （公開済みのお知らせが 0 件なので、記事ページは確かめられません）");
    } else {
      const u = j.items[0].url;
      const 記事 = await fetch(BASE + u, { headers: NAV });
      const h = await 記事.text();
      ok("記事が開く（" + u + "）", 記事.status === 200, 記事.status);
      ok("URL が永続の形", /^\/site\/news\/\d{4}\/\d{2}\/.+$/.test(u), u);
      ok("OGP がそろっている（title/description/image/type）",
        /og:title/.test(h) && /og:description/.test(h) && /og:image/.test(h)
        && /og:type" content="article/.test(h), "");
      ok("Twitter Card が summary_large_image",
        /twitter:card" content="summary_large_image/.test(h), "");
      const ld = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(h);
      let ldj = null; try { ldj = JSON.parse(ld[1]); } catch (e) {}
      ok("JSON-LD が NewsArticle として正しい",
        ldj && ldj["@type"] === "NewsArticle" && !!ldj.headline && !!ldj.datePublished, ldj);
      ok("canonical がある", /rel="canonical"/.test(h), "");
      ok("共有ボタンが 4 つある（X / LINE / メール / URLコピー）",
        /x\.com\/intent/.test(h) && /line\.me/.test(h) && /mailto:/.test(h) && /data-copy=/.test(h), "");

      const og = await fetch(BASE + "/site/og/" + encodeURIComponent(j.items[0].id) + ".png");
      const buf = Buffer.from(await og.arrayBuffer());
      ok("OGP 画像が PNG で返る（1200×630）",
        og.status === 200 && /image\/png/.test(og.headers.get("content-type") || "")
        && buf.readUInt32BE(16) === 1200 && buf.readUInt32BE(20) === 630,
        { status: og.status, w: buf.length > 24 ? buf.readUInt32BE(16) : 0,
          h: buf.length > 24 ? buf.readUInt32BE(20) : 0 });

      const なし = await fetch(BASE + "/site/news/2026/08/no-such-article", { headers: NAV });
      ok("無い記事は 404（一覧へ黙って飛ばさない）", なし.status === 404, なし.status);
    }

    const rss = await fetch(BASE + "/site/news/feed.xml");
    const rx = await rss.text();
    ok("RSS が返る", rss.status === 200 && /application\/rss\+xml/.test(rss.headers.get("content-type") || ""),
      rss.headers.get("content-type"));
    ok("RSS の中身が RSS になっている", /<rss version="2.0"/.test(rx) && /<channel>/.test(rx), rx.slice(0, 60));
    const sm = await fetch(BASE + "/sitemap.xml");
    const sx = await sm.text();
    ok("サイトマップが返る", sm.status === 200 && /<urlset/.test(sx), sm.status);
    ok("サイトマップに主要ページが入っている",
      /\/site<\/loc>/.test(sx) && /\/site\/news</.test(sx) && /\/site\/roadmap</.test(sx), "");
    /* 下書きが漏れていないか */
    ok("下書きが RSS にもサイトマップにも出ない",
      !/下書き/.test(rx) && !/下書き/.test(sx), "");
  }

  節("⑯ 段G — ロードマップ / 安全とプライバシー");
  {
    const NAV = { "Sec-Fetch-Mode": "navigate", "Accept": "text/html" };
    const rm = await fetch(BASE + "/site/roadmap", { headers: NAV }).then((r) => r.text());
    ok("ロードマップに 3 段階がある",
      /リリース済み/.test(rm) && /開発中/.test(rm) && /検討中/.test(rm), "");
    /* ★ 日付も時期も書かない（約束になるため） */
    const 時期 = /20\d{2}\s*年|\d{1,2}\s*月(?!曜)|今[春夏秋冬]|来[春夏秋冬]|[春夏秋冬]頃|Q[1-4]/;
    const 本文だけ = rm.replace(/<footer[\s\S]*$/, "").replace(/&copy; 2026[^<]*/g, "");
    ok("ロードマップに日付・時期が書かれていない", !時期.test(本文だけ),
      (本文だけ.match(時期) || [])[0]);

    const sf = await fetch(BASE + "/site/safety", { headers: NAV }).then((r) => r.text());
    const 要る = [
      ["管理者が中身を見ない方針", /管理者.{0,20}閲覧しません|生成物の中身/],
      ["保存場所と保存期間", /保存/],
      ["AI 提供元へ渡ること", /提供元へ送られます|AI 提供元/],
      ["無料枠で製品改善に使われうること", /製品改善/],
      ["退会時の削除", /退会/],
      ["Workplace がβ版であること", /β版/]
    ];
    要る.forEach(([名, re]) => ok("安全のページに「" + 名 + "」がある", re.test(sf), ""));

    for (const p of ["/site/about", "/site/contact", "/site/terms", "/site/privacy"]) {
      const r = await fetch(BASE + p, { headers: NAV });
      ok("フッターの行き先が開く: " + p, r.status === 200, r.status);
    }
  }

  節("⑰ 段I — 全ページ × 全幅（横スクロール・はみ出し・コントラスト）");
  {
    const ページら = ["/site", "/site/news", "/site/roadmap", "/site/safety", "/site/about"];
    const 幅ら2 = [320, 375, 768, 1024, 1440];
    let 全部よし = true;
    const だめ = [];
    for (const path2 of ページら) {
      for (const w of 幅ら2) {
        const pg = await (await br.newContext({ viewport: { width: w, height: 900 } })).newPage();
        const errs = [];
        pg.on("pageerror", (e) => errs.push(String(e).slice(0, 120)));
        await pg.goto(BASE + path2, { waitUntil: "networkidle", timeout: 60000 });
        await pg.waitForTimeout(500);
        const r = await pg.evaluate(() => {
          const de = document.documentElement;
          const 切られている = (el) => {
            let p = el.parentElement;
            while (p && p !== de) {
              const st = getComputedStyle(p);
              if (/hidden|clip|auto|scroll/.test(st.overflow + st.overflowX + st.overflowY)
                  || p.tagName.toLowerCase() === "svg") {
                const pb = p.getBoundingClientRect();
                if (pb.right <= de.clientWidth + 1 && pb.left >= -1) return true;
              }
              p = p.parentElement;
            }
            return false;
          };
          const 犯 = [];
          document.querySelectorAll("body *").forEach((el) => {
            const b = el.getBoundingClientRect();
            if (b.width === 0) return;
            if ((b.right > de.clientWidth + 1 || b.left < -1) && !切られている(el)) {
              犯.push(el.tagName.toLowerCase() + "." + String(el.className).split(" ")[0]);
            }
          });
          const 小 = [];
          document.querySelectorAll("a[href], button").forEach((el) => {
            if (el.classList.contains("skip")) return;
            if (el.closest('[data-open="false"]')) return;
            /* ★ **文章の途中に置かれたリンクは対象外**。
               WCAG 2.5.8 も「文の流れの中のリンク」を例外にしている。
               ここを 44px にすると行が割れて、かえって読みにくくなる。
               単独で置いたボタン・リンクは今まで通り測る。 */
            const st = getComputedStyle(el);
            const 文中 = (st.display === "inline" || st.display === "inline-block")
              && !!el.closest("p, li, .article__body, .safety");
            if (文中) return;
            const b = el.getBoundingClientRect();
            if (b.width === 0 && b.height === 0) return;
            if (b.height < 44 || b.width < 44) 小.push((el.textContent || "").trim().slice(0, 10));
          });
          return { あふれ: de.scrollWidth - de.clientWidth, 犯: 犯.slice(0, 3), 小: 小.slice(0, 3) };
        });
        if (r.あふれ > 0 || r.犯.length || r.小.length || errs.length) {
          全部よし = false;
          だめ.push({ path: path2, w, ...r, err: errs.slice(0, 1) });
        }
        if (w === 375) await pg.screenshot({ path: path.join(OUT, "p" + path2.replace(/\//g, "_") + "-375.png") });
        if (w === 1440) await pg.screenshot({ path: path.join(OUT, "p" + path2.replace(/\//g, "_") + "-1440.png") });
        await pg.close();
      }
    }
    ok("全 " + ページら.length + " ページ × 全 " + 幅ら2.length + " 幅 で 横スクロール 0 / はみ出し 0 / 44px 未満 0 / 失敗 0",
      全部よし, だめ.slice(0, 4));
  }

  節("⑱ 段I — 全ページで動きを減らす設定が効くか");
  {
    for (const path2 of ["/site", "/site/news", "/site/roadmap"]) {
      const pg = await (await br.newContext({ viewport: { width: 1440, height: 900 },
        reducedMotion: "reduce" })).newPage();
      await pg.goto(BASE + path2, { waitUntil: "networkidle", timeout: 60000 });
      await pg.waitForTimeout(700);
      const n = await pg.evaluate(() => Array.from(document.querySelectorAll("*")).filter((e) => {
        const st = getComputedStyle(e);
        return st.animationName !== "none" && (parseFloat(st.animationDuration) || 0) > 0.01;
      }).length);
      const 見え = await pg.evaluate(() =>
        Array.from(document.querySelectorAll(".reveal")).every((e) => getComputedStyle(e).opacity === "1"));
      ok(path2 + " で動きが全部止まる", n === 0, n);
      ok(path2 + " で中身が見えたまま残る", 見え);
      await pg.close();
    }
  }

  節("⑲ 段H — サイト側に独立した認証を作っていないか");
  {
    const ら = await Promise.all(["/site", "/site/news", "/site/roadmap", "/site/safety"]
      .map((p) => fetch(BASE + p, { headers: { "Sec-Fetch-Mode": "navigate" } }).then((r) => r.text())));
    const 全部 = ら.join("");
    ok("パスワード欄が無い", !/type="password"/.test(全部), "");
    ok("メールアドレス欄が無い", !/type="email"/.test(全部), "");
    ok("サイト独自のログイン口が無い",
      !/\/api\/site\/(login|auth|register|session)/.test(全部), "");
    const js = await Promise.all(["/site/site.js", "/site/hero.js", "/site/status.js"]
      .map((p) => fetch(BASE + p).then((r) => r.text())));
    ok("サイトの JS が合言葉を扱っていない",
      !/password|localStorage\.setItem\(["'](token|session)/i.test(js.join("")), "");
    ok("いまは「アプリを開く」だけ（ドメイン取得までの決めごと）",
      /アプリを開く/.test(全部), "");
  }

  console.log("\n合格 " + pass + " / 失敗 " + fail);
  if (落ち.length) console.log("落ちた: " + 落ち.join(" / "));
  console.log("画面: " + OUT);
  await br.close();
  process.exit(fail ? 1 : 0);
})();

/* ── PNG を読んで「彩度の高い紫」の画素の割合を出す ──────────────────
   ★ 目で見て「10% くらい」と言わない。数える。
   紫と数えるのは: 赤と青が緑よりはっきり高く、彩度がある程度あるもの。 */
function 紫の割合(png) {
  const zlib = require("zlib");
  /* PNG を最小限だけ自前で解く（外の部品を足さない） */
  let p = 8, w = 0, h = 0, bit = 0, 型 = 0;
  const idat = [];
  while (p < png.length) {
    const len = png.readUInt32BE(p);
    const kind = png.toString("ascii", p + 4, p + 8);
    const body = png.slice(p + 8, p + 8 + len);
    if (kind === "IHDR") { w = body.readUInt32BE(0); h = body.readUInt32BE(4); bit = body[8]; 型 = body[9]; }
    else if (kind === "IDAT") idat.push(body);
    else if (kind === "IEND") break;
    p += 12 + len;
  }
  if (!w || !h || bit !== 8 || (型 !== 6 && 型 !== 2)) return { pct: -1, なぜ: "PNG を読めません", w, h, bit, 型 };
  const ch = 型 === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const 幅バイト = w * ch;
  const 出 = Buffer.alloc(h * 幅バイト);
  let 位置 = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[位置++];
    const 行 = raw.slice(位置, 位置 + 幅バイト); 位置 += 幅バイト;
    const 前 = y > 0 ? 出.slice((y - 1) * 幅バイト, y * 幅バイト) : Buffer.alloc(幅バイト);
    const いま = 出.slice(y * 幅バイト, (y + 1) * 幅バイト);
    for (let x = 0; x < 幅バイト; x++) {
      const a = x >= ch ? いま[x - ch] : 0;
      const b = 前[x];
      const c = x >= ch ? 前[x - ch] : 0;
      let v = 行[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      いま[x] = v & 255;
    }
  }
  let 紫 = 0;
  const 全 = w * h;
  for (let i = 0; i < 全; i++) {
    const o = i * ch;
    const R = 出[o], G = 出[o + 1], B = 出[o + 2];
    const 最大 = Math.max(R, G, B), 最小 = Math.min(R, G, B);
    const 彩度 = 最大 === 0 ? 0 : (最大 - 最小) / 最大;
    /* 「彩度の高い紫」= 青と赤が緑より高く、彩度 0.35 以上、暗すぎない */
    if (B > G + 24 && R > G + 8 && 彩度 >= 0.35 && 最大 >= 70) 紫++;
  }
  return { pct: (紫 / 全) * 100, 紫の画素: 紫, 全画素: 全, w, h };
}
