/* ══════════════════════════════════════════════════════════════════════
   線で結ぶ問題の見た目（組み合わせ・matching）

   実測 2026-08-12: 右側の説明文が **1 文字ずつ縦に**折れていた。
   線を描く SVG が position:absolute で **グリッドの列を 1 つも使わない**ため、
   右の列が 2 列目（44px）に入っていたのが原因。

   ここで見るのは「左右の幅が釣り合っているか」と「文が縦に折れていないか」。
   影の DOM（Shadow DOM）の中でしか本当の CSS は効かないので、
   index.html から CSS を取り出して、同じ器を作って測る。

   使い方: node vqmatchui.cjs
   ══════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => {
  c ? (pass++, console.log("  ok   " + n))
    : (fail++, bad.push(n), console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 220) : "")));
};
const section = (t) => console.log("\n══ " + t + " ══");

/* 画面の CSS を取り出す。**テスト側で書き写さない**（写すと古くなる）。 */
function shellCss() {
  const src = require("./vqsrc.cjs").丸ごと();
  const at = src.indexOf('var SHELL_CSS = "');
  if (at < 0) throw new Error("SHELL_CSS が見つかりません");
  const from = src.indexOf('"', at);
  /* JS の文字列リテラルの終わりを探す（エスケープされた " は飛ばす）。 */
  let i = from + 1;
  while (i < src.length) {
    if (src[i] === "\\") { i += 2; continue; }
    if (src[i] === '"') break;
    i++;
  }
  return JSON.parse(src.slice(from, i + 1));
}

const RUN = (css) => {
  const M = VQ2.qmodel, R = VQ2.qrender;
  const q = M.normalize({
    id: "m1", type: "matching", points: 3,
    prompt: "次の感染症に関連する用語とその説明を正しく組み合わせなさい。",
    pairs: {
      left: [{ id: "L1", text: "潜伏期間" }, { id: "L2", text: "不顕性感染" }, { id: "L3", text: "二次感染者数" }],
      right: [{ id: "R1", text: "感染から発症までの期間" },
              { id: "R2", text: "感染しても症状が出ないまま経過する状態のこと" },
              { id: "R3", text: "1人の感染者から生じる感染者の数" }],
      correct: { L1: "R1", L2: "R2", L3: "R3" }
    }
  });
  function measure(width, mobile) {
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:0;top:0;z-index:99999;background:#fff;width:" + width + "px";
    document.body.appendChild(host);
    const sr = host.attachShadow({ mode: "open" });
    /* スマホの見た目は `.vq2-root.is-mobile` で切り替わる。
       付けずに測ると、実機とは違うものを測ってしまう。 */
    sr.innerHTML = "<style>" + css + "</style><div class='vq2-root" + (mobile ? " is-mobile" : "")
      + "'><div class='vq2-q'>" + R.html(q, null, { mobile: !!mobile }) + "</div></div>";
    const cols = [...sr.querySelectorAll(".vq2-match-col")];
    const w = {};
    cols.forEach((c) => { w[c.getAttribute("data-side")] = Math.round(c.getBoundingClientRect().width); });
    const right = [...sr.querySelectorAll('[data-side="right"] .vq2-match-t')].map((t) => {
      const r = t.getBoundingClientRect();
      const lh = parseFloat(getComputedStyle(t).lineHeight) || 20;
      return { chars: t.textContent.length, w: Math.round(r.width), lines: Math.max(1, Math.round(r.height / lh)) };
    });
    const out = { width, mobile: !!mobile, left: w.left, right: w.right, items: right };
    host.remove();
    return out;
  }
  return [measure(1100, false), measure(760, false), measure(390, true)];
};

(async () => {
  const css = shellCss();
  const br = await chromium.launch();
  const pg = await br.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e.message).slice(0, 160)));
  await pg.goto(BASE, { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => window.VQ2 && VQ2.qmodel && VQ2.qrender, null, { timeout: 30000 });
  const res = await pg.evaluate(RUN, css);
  await br.close();

  res.forEach((r) => {
    section("画面の幅 " + r.width + "px" + (r.mobile ? "（スマホ・上下に積む）" : ""));
    console.log("   左 " + r.left + "px ／ 右 " + r.right + "px");
    console.log("   右の文: " + r.items.map((x) => x.chars + "字 → " + x.w + "px・" + x.lines + "行").join(" ／ "));
    /* **左右が釣り合っていること。** 片方が潰れていたら、そこで折れる。 */
    ok(r.mobile ? "上下とも同じ幅いっぱいに広がる" : "左右の幅が釣り合っている（差が 2 割以内）",
      r.left > 0 && r.right > 0 && Math.abs(r.left - r.right) <= Math.max(r.left, r.right) * 0.2,
      { left: r.left, right: r.right });
    /* スマホでは半分ではなく **幅いっぱい**を使えていること。 */
    if (r.mobile) ok("★スマホで幅いっぱいを使う（半分に潰れていない）",
      r.right >= r.width * 0.7, { width: r.width, right: r.right });
    /* 1 文字ずつ縦に折れていないこと。日本語は文字ごとに折れるので、
       幅が狭いと「行数 ≒ 文字数」になる。 */
    ok("★1 文字ずつ縦に折れていない",
      r.items.every((x) => x.lines <= Math.max(3, Math.ceil(x.chars / 6))), r.items);
    /* 長い文でも 3 行までに収まること（利用者の希望）。 */
    ok("★長い文でも 3 行までに収まる", r.items.every((x) => x.lines <= 3), r.items);
  });

  ok("画面のエラーが出ていない", errs.length === 0, errs.slice(0, 2));
  console.log("\n合格 " + pass + " / 不合格 " + fail);
  if (bad.length) console.log("直すところ:\n  - " + bad.join("\n  - "));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("実行できませんでした:", e); process.exit(1); });
