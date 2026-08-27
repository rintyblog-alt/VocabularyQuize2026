/* アクティビティ表示の見た目を確かめる。
   実アプリの shell.css と、実際の itemHtml が吐く HTML をそのまま使う。 */
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
fs.mkdirSync("shots/act", { recursive: true });

const css = fs.readFileSync("client/v2/ui/shell.css", "utf8");
/* 変数は本体のビルドから拾う（:root の定義ブロック） */
const built = fs.readFileSync("client/index.html", "utf8");
const m = built.match(/--vq-dur-fast[\s\S]{0,4000}?\}/);
const varsBlock = built.slice(built.lastIndexOf(":root", built.indexOf("--vq-dur-fast")),
                             built.indexOf("}", built.indexOf("--vq-ease-spring")) + 1);

(async () => {
  const b = await chromium.launch({ headless: true });
  const pg = await b.newPage({ viewport: { width: 430, height: 820 } });
  await pg.goto("http://127.0.0.1:8791/?vqdev=1&vq2=all&cb=" + Date.now(),
    { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.waitForTimeout(3000);

  const r = await pg.evaluate(async (arg) => {
    const A = window.VQ2 && window.VQ2.activity;
    if (!A) return { err: "activity なし" };
    /* 実アプリと同じ土俵：Shadow DOM に shell.css を入れて描く */
    const holder = document.createElement("div");
    holder.id = "vqact-vis";
    holder.style.cssText = "position:fixed;left:0;top:0;width:430px;height:820px;"
      + "z-index:2147483647;background:#fff";
    document.body.appendChild(holder);
    const sr = holder.attachShadow({ mode: "open" });
    const st = document.createElement("style");
    st.textContent = arg.vars + "\n" + arg.css
      + "\n.vq2-root{padding:14px;font-family:Inter,'Hiragino Sans',sans-serif}";
    sr.appendChild(st);
    const root = document.createElement("div");
    root.className = "vq2-root";
    sr.appendChild(root);

    const host = document.createElement("div");
    host.className = "vq2-tl";
    root.appendChild(host);

    const tl = A.createTimeline({});
    tl.host = host;
    [
      { kind: "planning", title: "整理して設計する", status: "done",
        short: "まず「初回生成」と「キャッシュ済み再生成」を分け、目標時間を現実的に定義します。大容量資料の連続処理は、選別・並列化・キャッシュ・進捗表示を組み合わせないと固定時間の保証は難しいです。" },
      { kind: "thinking", title: "見積もりを現実化する", status: "done",
        short: "100 問を詳細解説付きで一括生成する場合、いまの逐次処理では 15 分以内は難しいと見積もります。" },
      { kind: "document", title: "資料を読み取っています", status: "running", badge: { text: "4 / 10", tone: "accent" } },
      { kind: "warning", title: "一部のページを読めませんでした", status: "warn" },
      { kind: "error", title: "作成に失敗しました", status: "error" },
      { kind: "success", title: "1m 6s 考えました", status: "done", short: "完了" }
    ].forEach((x) => tl.push(x));
    tl.paint();
    await new Promise((r) => setTimeout(r, 200));

    const nodes = [...sr.querySelectorAll(".vq2-tl-i")].map((li) => {
      const n = li.querySelector(".vq2-tl-node");
      const c = n ? getComputedStyle(n) : null;
      return { cls: li.className.replace("vq2-tl-i ", ""),
               bg: c ? c.backgroundColor : null, fg: c ? c.color : null,
               shadow: c ? c.boxShadow : null };
    });
    /* 出るときの動きを、時間を追って読む（本当に動いているかを数で見る） */
    window.__vqAdd = () => tl.push({ kind: "generation", title: "新しく足した行",
                                     status: "done", short: "ふわりと出るかを見ます" });
    window.__vqFrame = () => {
      const f = sr.querySelector(".vq2-tl-i.is-new");
      if (!f) return null;
      const c = getComputedStyle(f);
      return { opacity: +c.opacity, transform: c.transform, filter: c.filter };
    };
    const fresh0 = null;
    return { nodes };
  }, { css, vars: varsBlock });

  console.log(JSON.stringify(r, null, 1));
  /* 1 件足して、20ms ごとに見え方を読む */
  await pg.evaluate(() => window.__vqAdd());
  const frames = [];
  for (let i = 0; i < 12; i++) {
    frames.push(await pg.evaluate(() => window.__vqFrame()));
    await pg.waitForTimeout(40);
  }
  console.log("\n出るときの見え方（40ms ごと）:");
  frames.forEach((f, i) => {
    if (!f) { console.log("  " + (i * 40) + "ms  —"); return; }
    console.log("  " + String(i * 40).padStart(3) + "ms  不透明度 " + f.opacity.toFixed(2)
      + "  ぼかし " + (f.filter === "none" ? "なし" : f.filter)
      + "  位置 " + (f.transform === "none" ? "定位置" : f.transform.slice(0, 40)));
  });
  const el = await pg.$("#vqact-vis");
  if (el) await el.screenshot({ path: "shots/act/timeline.png" });
  else await pg.screenshot({ path: "shots/act/timeline.png" });
  console.log("画像: shots/act/timeline.png");
  await b.close();
})();
