/* ══════════════════════════════════════════════════════════════════════
   vqicon.cjs — アイコンが 文字に 化けないことを 確かめる

   訴え（2026-08-19）:「アイコンが PC・モバイルともに バグり散らかしてる」

   何が 起きていたか（実測で 突き止めた・2 つ 重なっていた）:
     ① 書体の設定（61 種類）が font-family を **!important** で 塗り替える。
        塗らない相手の並びに `.ms` は 在ったが **`.vq2-ms` が 抜けていた**。
        アイコンは 合字で 描いているので、書体が 変わると
        絵ではなく「menu_book」という **名前が そのまま 文字で 出る**。
        44px の枠から あふれて 隣と 重なる ＝ あの見た目。
     ② アイコンの可変フォントを **Google Fonts から 実行時に** 取っていた
        （display=swap）。届かない・遅い端末では 代わりの書体のまま ＝ 同じ見た目。

   ここで 確かめること:
     ・素の状態で アイコンが 絵として 出る（幅が 文字幅に ならない）
     ・**書体を 変えても** 絵のまま
     ・影の DOM（vq2 の窓）の 中でも 絵のまま
     ・外（Google）へ 取りに行っていない

   使い方: node vqicon.cjs
   ══════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_UI || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ok   " + n); }
  else { fail++; bad.push(n); console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 300) : "")); }
};
const 節 = (t) => console.log("\n══ " + t + " ══");

(async () => {
  const { chromium } = require("playwright");
  const browser = await chromium.launch();

  /* 外（Google）への 通信を 全部 止める。届かない端末を 作る。 */
  async function 開く(名, 書体) {
    const ctx = await browser.newContext();
    await ctx.route("**://fonts.googleapis.com/**", (r) => r.abort());
    await ctx.route("**://fonts.gstatic.com/**", (r) => r.abort());
    const page = await ctx.newPage();
    const 外 = [];
    /* ★ 見るのは **アイコンの書体** だけ。Inter などは
         「61 種類から 選ぶ」機能で わざと 外から 取っている（別の話）。 */
      page.on("request", (r) => {
        if (/fonts\.(googleapis|gstatic)\.com/.test(r.url()) && /Material.Symbols|materialsymbols/i.test(r.url()))
          外.push(r.url());
      });
    if (書体) {
      await page.addInitScript((f) => {
        localStorage.setItem("vq.font.v1", JSON.stringify(f));
      }, 書体);
    }
    await page.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(3500);
    return { 名, ctx, page, 外 };
  }

  /* 1 文字ぶんの 絵なら 幅は およそ 字の大きさ。文字だと ずっと 広い。 */
  const 測る = (page) => page.evaluate(async () => {
    await document.fonts.ready.catch(() => {});
    const 出 = { 本体: {}, 影: {} };
    const 一つ = (親, クラス, 追加) => {
      const s = document.createElement("span");
      s.className = クラス; s.textContent = "menu_book";
      s.style.cssText = "position:absolute;left:-9999px;font-size:26px;" + (追加 || "");
      親.appendChild(s);
      const w = Math.round(s.getBoundingClientRect().width);
      const ff = getComputedStyle(s).fontFamily;
      s.remove();
      return { 幅: w, 書体: ff.slice(0, 30), 絵になった: w <= 40 };
    };
    出.本体.ms = 一つ(document.body, "ms");
    /* 影の DOM（vq2 の窓と 同じ形）を 作って 中でも 測る */
    const host = document.createElement("div");
    document.body.appendChild(host);
    const sr = host.attachShadow({ mode: "open" });
    const st = document.createElement("style");
    st.textContent = '.vq2-ms{font-family:"Material Symbols Rounded";font-weight:500;'
      + 'font-style:normal;line-height:1;display:inline-block;letter-spacing:normal;'
      + '-webkit-font-feature-settings:"liga";font-variation-settings:"FILL" 1;}';
    sr.appendChild(st);
    const box = document.createElement("div"); sr.appendChild(box);
    /* 書体の設定は 影の中へも 配られる。同じ形を 作って 確かめる。 */
    const 設定 = document.getElementById("vqsetFont");
    if (設定) { const c = document.createElement("style"); c.textContent = 設定.textContent; sr.appendChild(c); }
    出.影.vq2ms = 一つ(box, "vq2-ms");
    host.remove();
    出.設定あり = !!設定;
    出.除外 = 設定 ? (設定.textContent.match(/:not\([^)]*\)/g) || []).join("") : "";
    出.いまの書体 = getComputedStyle(document.body).fontFamily.slice(0, 40);
    return 出;
  });

  節("① 素のまま（書体は 既定）");
  const A = await 開く("既定", null);
  const a = await 測る(A.page);
  ok("本体で アイコンが 絵になる（幅 " + a.本体.ms.幅 + "）", a.本体.ms.絵になった, a.本体.ms);
  ok("影の中でも 絵になる（幅 " + a.影.vq2ms.幅 + "）", a.影.vq2ms.絵になった, a.影.vq2ms);
  ok("Google へ 取りに行っていない（" + A.外.length + " 回）", A.外.length === 0, A.外.slice(0, 3));

  節("② ★ 書体を 変えても 絵のまま（ここが 抜けていた）");
  const B = await 開く("書体あり", {
    id: "test-serif", s: '"Hiragino Mincho ProN", serif', g: "",
    /* ★ **古い** 除外の並び（.vq2-ms が 入っていない）を わざと 覚えさせる。
       すでに 書体を 選んでいる人の 端末は この状態。 */
    x: ':not(.ms):not(code):not(pre):not(kbd):not(samp)'
  });
  const bb = await 測る(B.page);
  /* ★ 見るのは「書体が 変わったか」ではなく **アイコンを 外しているか**。
     古い 除外の並びを 覚えている端末でも、起動時に 足し直すようにした。 */
  ok("書体の仕込みが 出ている", bb.設定あり, bb);
  /* ★ 画面の style は 起動の途中で 差し替わるので、**もとのコード**で 確かめる。
     ここが 抜けると、書体を 選んだ人だけ アイコンが 文字に 化ける。 */
  const fs2 = require("fs"), path2 = require("path");
  const 店 = fs2.readdirSync("js-src").find((x) => /^vq-settings-store\./.test(x));
  const 店中 = fs2.readFileSync(path2.join("js-src", 店), "utf8");
  ok("★ 設定の 除外に .ms が 入っている", /:not\(\.ms\)/.test(店中));
  ok("★ 設定の 除外に .vq2-ms が 入っている（ここが 抜けていた）", /:not\(\.vq2-ms\)/.test(店中));
  const 索 = fs2.readFileSync("client/index.html", "utf8");
  ok("★ 起動の仕込みでも アイコンを 必ず 外す", /\[".ms", ".vq2-ms"/.test(索));
  ok("★ 本体の アイコンが 文字に ならない（幅 " + bb.本体.ms.幅 + "）", bb.本体.ms.絵になった, bb.本体.ms);
  ok("★ 影の中の アイコンも 文字に ならない（幅 " + bb.影.vq2ms.幅 + "）", bb.影.vq2ms.絵になった, bb.影.vq2ms);
  ok("書体を 変えても Google へ 行かない", B.外.length === 0, B.外.slice(0, 3));

  節("③ 手元の書体が 本当に 配られているか");
  const c = await A.page.evaluate(async () => {
    const 出 = { 面: [], 中身: "" };
    document.fonts.forEach((f) => { if (/Material/.test(f.family)) 出.面.push(f.family + "/" + f.weight + "/" + f.status); });
    const l = [...document.querySelectorAll('link[rel="stylesheet"]')].find((x) => /material-symbols/.test(x.href));
    出.CSS = l ? l.href.split("/").pop() : null;
    出.媒体 = l ? l.media : null;
    if (l) { try { 出.中身 = await (await fetch(l.href)).text(); } catch (e) {} }
    return 出;
  });
  ok("アイコンの CSS を 読んでいる", !!c.CSS, c);
  ok("すぐ 当てている（media が print でない）", c.媒体 !== "print", c.媒体);
  ok("手元の書体を 指している", /\/vendor\/fonts\//.test(c.中身), c.中身.slice(-160));
  ok("可変（100 700）で 入っている", /font-weight:\s*100 700/.test(c.中身), c.中身.slice(-160));
  ok("書体が 実際に 読み込まれた", c.面.some((x) => /loaded/.test(x)), c.面);

  await browser.close();
  console.log("\n════════════════════════════════════════════");
  console.log("  合計 " + (pass + fail) + " 件 / 通った " + pass + " / 落ちた " + fail);
  if (bad.length) { console.log("  落ちたもの:"); bad.forEach((x) => console.log("   - " + x)); }
  console.log("════════════════════════════════════════════");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("落ちました: " + (e && e.stack || e)); process.exit(1); });
