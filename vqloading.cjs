#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqloading.cjs — ロード画面（2026-09-02 作り直し）

   訴え:「ロード画面を もっと おしゃれで、モダンに しない？
          今のだと ちょっと 安っぽいから さ。
          **アイコンの ロードに しないで、一度 波打つような 感じ**に したい」

   見るもの:
     ① マーク（アイコン）が **1 つも 無い**
     ② 波（輪）が ある／**一度きり**（繰り返さない）
     ③ 題字の 字が **順に 遅れて** 出る（波が 通る）
     ④ ずっと 動き続けるのは **細い 線 1 本だけ**
     ⑤ 暗い 見た目でも 白く 光らない
     ⑥ ★ **CSS が 2 か所に ある**（index.html の 起動用 と vq-ds.css）。
        片方だけ 直すと 起動直後と あとで 見た目が 変わる。**同じ**か 見る。
     ⑦ 動きを 減らす 設定でも 出る ところまでは 出る
     ⑧ 処理中の 覆い（#globalLoadingOverlay）にも 同じ 波（題字は 出さない）

   使い方: node vqloading.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const fs = require("fs"), path = require("path");
const { chromium } = require("playwright");
let ok = 0, ng = 0; const 落 = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (c, t, d) => { if (c) { ok++; console.log("  ok   " + t + (d !== undefined ? "  → " + JSON.stringify(d).slice(0, 220) : "")); }
  else { ng++; 落.push(t); console.log("  NG   " + t + (d !== undefined ? "  → " + JSON.stringify(d).slice(0, 320) : "")); } };
const 待 = (m) => new Promise(s => setTimeout(s, m));

/* 1 枚だけを 出す（ほかの 覆いは 伏せ、動きを 頭から やり直す）。 */
const 出す = (pg, id, 暗) => pg.evaluate(([id, 暗]) => {
  document.documentElement.setAttribute("data-theme-mode", 暗 ? "dark" : "light");
  for (const x of ["vqPin", "vqNewAuth", "authGate", "firstLaunchOverlay", "vqbFlow", "vqInstall"]) {
    const e = document.getElementById(x); if (e) e.style.display = "none";
  }
  document.documentElement.classList.remove("vqna-showing");
  document.body.classList.add("auth-booting");
  const s = document.getElementById(id);
  s.classList.remove("hidden");
  if (id === "globalLoadingOverlay") s.style.display = "flex";
  const c = s.cloneNode(true); s.parentNode.replaceChild(c, s);   /* 動きを 最初から */
}, [id, 暗]);

(async () => {
  節("⑥ CSS が 2 か所とも 同じか（既知の 罠）");
  const 印 = "/* ══ ロード画面（2026-09-02 作り直し）";
  const 尾 = 'html:not([data-theme-mode="light"]) .liquid-loading-dots{ background:rgba(154,140,224,.20); }';
  const 抜 = (p) => {
    const s = fs.readFileSync(p, "utf8");
    const i = s.indexOf(印); if (i < 0) return null;
    const j = s.indexOf(尾, i); if (j < 0) return null;
    return s.slice(i, j + 尾.length);
  };
  const cssファイル = fs.readdirSync("client/css").filter(f => /^vq-ds\..*\.css$/.test(f))[0];
  const a = 抜("client/index.html"), b2 = 抜(path.join("client/css", cssファイル));
  見(!!a, "起動用（index.html）に ある", a && a.length);
  見(!!b2, "外の CSS（" + cssファイル + "）にも ある", b2 && b2.length);
  見(!!a && a === b2, "★★ **2 か所の 中身が 同じ**（片方だけ 直していない）",
    a && b2 ? { 起動: a.length, 外: b2.length } : null);
  見(!!a && !/vqload-mark|vqload-rosette|vqload-ring\b/.test(a),
    "★ 古い マークの 決まりが 残って いない");

  const br = await chromium.launch();
  const ctx = await br.newContext({ viewport: { width: 1280, height: 860 } });
  const pg = await ctx.newPage();
  const 例外 = []; pg.on("pageerror", e => 例外.push(String(e).slice(0, 140)));
  await pg.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await 待(3000);

  節("① マーク（アイコン）を 出さない");
  await 出す(pg, "authBootSplash", false);
  await 待(200);
  const 中 = await pg.evaluate(() => {
    const s = document.getElementById("authBootSplash");
    return { svg: s.querySelectorAll("svg").length,
             mark: s.querySelectorAll(".vqload-mark,.vqload-svg,.vqload-ring").length,
             ms: Array.from(s.querySelectorAll(".ms")).filter(e => !e.classList.contains("hidden")).length,
             波: s.querySelectorAll(".vqload-ripple").length,
             字: s.querySelectorAll(".vqload-word i").length };
  });
  見(中.svg === 0 && 中.mark === 0, "★★ **アイコンを 1 つも 出さない**", 中);
  見(中.ms === 0, "★ 見える 場所に 記号書体の 文字も 無い", 中.ms);

  節("② 波が 一度だけ");
  見(中.波 === 3, "★ 波が 3 本 ある", 中.波);
  const 波 = await pg.evaluate(() => {
    const es = Array.from(document.querySelectorAll("#authBootSplash .vqload-ripple"));
    return es.map(e => { const c = getComputedStyle(e);
      return { 名: c.animationName, 回: c.animationIterationCount,
               遅: c.animationDelay, 埋: c.animationFillMode }; });
  });
  見(波.every(x => x.名 === "vqlRipple"), "波の 動きが 当たって いる", 波[0]);
  見(波.every(x => x.回 === "1"), "★★ **繰り返さない**（一度きり）", 波.map(x => x.回));
  見(波[0].遅 !== 波[1].遅 && 波[1].遅 !== 波[2].遅, "★ 時間差で 広がる", 波.map(x => x.遅));

  /* 実際に 広がるか（大きさを 2 回 測る） */
  await 出す(pg, "authBootSplash", false);
  await 待(260);
  const 大1 = await pg.evaluate(() => document.querySelector("#authBootSplash .vqload-ripple").getBoundingClientRect().width);
  await 待(700);
  const 大2 = await pg.evaluate(() => document.querySelector("#authBootSplash .vqload-ripple").getBoundingClientRect().width);
  見(大2 > 大1 + 40, "★★ **本当に 広がって いる**", { 前: Math.round(大1), 後: Math.round(大2) });
  await 待(2200);
  const 大3 = await pg.evaluate(() => {
    const e = document.querySelector("#authBootSplash .vqload-ripple");
    return { 幅: e.getBoundingClientRect().width, 濃: getComputedStyle(e).opacity };
  });
  見(Number(大3.濃) < 0.05, "★ 広がりきったら 消える（残らない）", 大3);

  節("③ 題字を 波が 通る");
  const 字 = await pg.evaluate(() => {
    const es = Array.from(document.querySelectorAll("#authBootSplash .vqload-word i"));
    return { 数: es.length, 文: es.map(e => e.textContent).join(""),
             遅: es.map(e => getComputedStyle(e).animationDelay),
             色: es.map(e => getComputedStyle(e).color) };
  });
  見(字.文 === "VocabuQuiz", "★ 題字は VocabuQuiz", 字.文);
  見(字.数 === 10, "1 字ずつ 分かれて いる", 字.数);
  const 秒 = 字.遅.map(x => parseFloat(x));
  見(秒.every((v, i) => i === 0 || v > 秒[i - 1]), "★★ **左から 順に 遅れる**（波が 通る）", 字.遅.slice(0, 4));
  見(new Set(字.色).size === 2, "★ Quiz だけ 色を 変えて いる", Array.from(new Set(字.色)));

  節("④ 動き続けるのは 線 1 本だけ");
  const 無限 = await pg.evaluate(() => {
    const s = document.getElementById("authBootSplash");
    const out = [];
    const 名 = (e) => (e.className || "")
      || ((e.parentElement && e.parentElement.className ? e.parentElement.className + ">" : "") + e.tagName);
    const 見る = (e) => { const c = getComputedStyle(e);
      if (c.animationIterationCount.split(",").some(x => x.trim() === "infinite"))
        out.push(名(e)); };
    見る(s); s.querySelectorAll("*").forEach(見る);
    ["::before", "::after"].forEach(p => {
      [s, s.querySelector(".vqload-stage")].forEach(e => { if (!e) return;
        const c = getComputedStyle(e, p);
        if (c.animationIterationCount === "infinite") out.push((e.className || "") + p); });
    });
    return out;
  });
  見(無限.length === 1 && /liquid-loading-dots/.test(無限[0]),
    "★★ **ずっと 動くのは 細い 線 だけ**", 無限);

  節("⑤ 暗い 見た目");
  await 出す(pg, "authBootSplash", true);
  await 待(300);
  const 暗 = await pg.evaluate(() => {
    const s = document.getElementById("authBootSplash");
    const c = getComputedStyle(s);
    const w = getComputedStyle(s.querySelector(".vqload-word i"));
    return { 背: c.backgroundImage.slice(0, 60), 字: w.color,
             白い: /#fff|rgb\(255, 255, 255\)/i.test(c.backgroundColor) };
  });
  見(/23, 22, 30|17161E|15, 14, 20/.test(暗.背) || /rgba\(154, 140, 224/.test(暗.背),
    "★★ **暗い ときに 白く 光らない**", 暗.背);
  見(/2[0-9][0-9], 2[0-9][0-9]/.test(暗.字), "★ 暗い ときは 題字を 明るく", 暗.字);

  節("⑨ 終わる ときに 消えて いく");
  /* 訴え（2026-09-02）「ロード画面が 終わったら、アニメーションで、
     フェードアウトして いく 感じに したい」。
     直す前: **一度も 見えて いなかった**。1 枚は body.auth-booting の 間だけ
     display:flex で、本体は その 印を **先に 外す**。その 瞬間に
     display:none へ 落ちるので、動きは 走る前に 終わっていた
     （実測: 印を 外した 直後に display none / opacity 0）。 */
  await 出す(pg, "authBootSplash", false);
  await 待(700);
  const 退 = await pg.evaluate(() => new Promise(res => {
    const s = document.getElementById("authBootSplash");
    const 中 = s.querySelector(".liquid-loading-inner");
    const out = [];
    const 撮 = (t) => { const c = getComputedStyle(s), d = getComputedStyle(中);
      out.push({ t, disp: c.display, o: Number(c.opacity),
                 中o: Number(d.opacity), 中変: d.transform }); };
    撮(0);
    /* 本体（_authSetBooting(false)）と 同じ 順番 */
    document.body.classList.remove("auth-booting");
    s.classList.add("liquid-fade-out");
    撮(1);
    let n = 0;
    const iv = setInterval(() => { n += 70; 撮(n); if (n >= 490) { clearInterval(iv); res(out); } }, 70);
  }));
  const 直後 = 退[1], 途中 = 退.filter(x => x.t >= 70 && x.t <= 350);
  見(直後.disp === "flex", "★★ **印を 外した 直後も 出たまま**（消えない）", 直後.disp);
  見(途中.every(x => x.disp === "flex"), "★ 出て いく 間ずっと 出て いる",
    途中.map(x => x.disp).join(","));
  見(途中.some(x => x.o > 0.05 && x.o < 0.95),
    "★★ **だんだん 薄くなる**（ぱっと 消えない）", 途中.map(x => x.o));
  const 最後 = 退[退.length - 1];
  見(最後.o < 0.05, "★ 最後は 消える", 最後.o);
  見(途中.some(x => /matrix/.test(x.中変) && x.中変 !== "none"),
    "★★ **中身は 上へ 抜ける**（面より 先に）", 途中[1] && 途中[1].中変);
  見(退.findIndex(x => x.中o < 0.05) < 退.findIndex(x => x.o < 0.05),
    "★ 中身の ほうが 先に 消える",
    { 中: 退.findIndex(x => x.中o < 0.05), 面: 退.findIndex(x => x.o < 0.05) });

  /* 本体が しまう までの 時間が、動きの 長さより 短く ないか */
  const 尺 = await pg.evaluate(() => {
    const s = document.getElementById("authBootSplash");
    return getComputedStyle(s).animationDuration;
  });
  見(parseFloat(尺) <= 0.48, "★ 動きの 長さは しまう までの 480ms に 収まる", 尺);

  節("⑧ 処理中の 覆い");
  await 出す(pg, "globalLoadingOverlay", false);
  await 待(300);
  const 覆 = await pg.evaluate(() => {
    const s = document.getElementById("globalLoadingOverlay");
    const w = s.querySelector(".vqload-word");
    return { 波: s.querySelectorAll(".vqload-ripple").length,
             題: w ? getComputedStyle(w).display : "無",
             svg: s.querySelectorAll("svg").length };
  });
  見(覆.波 === 3, "★ 同じ 波が 出る", 覆.波);
  見(覆.題 === "none", "★ 題字は 出さない（1 秒で 消える 所に 題は 要らない）", 覆.題);
  見(覆.svg === 0, "★ こちらにも アイコンは 無い", 覆.svg);
  await ctx.close();

  節("⑦ 動きを 減らす 設定");
  const ctx2 = await br.newContext({ viewport: { width: 1280, height: 860 }, reducedMotion: "reduce" });
  const pg2 = await ctx2.newPage();
  await pg2.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await 待(3000);
  await 出す(pg2, "authBootSplash", false);
  await 待(500);
  const 減 = await pg2.evaluate(() => {
    const s = document.getElementById("authBootSplash");
    const i = s.querySelector(".vqload-word i");
    const r = s.querySelector(".vqload-ripple");
    const t = s.querySelector(".liquid-loading-text");
    return { 字濃: getComputedStyle(i).opacity, 波: getComputedStyle(r).display,
             文濃: getComputedStyle(t).opacity };
  });
  見(Number(減.字濃) === 1, "★★ **題字は ちゃんと 見える**（動かさなくても 出る）", 減.字濃);
  見(減.波 === "none", "★ 波は 出さない", 減.波);
  見(Number(減.文濃) === 1, "★ 文言も 見える", 減.文濃);
  await ctx2.close();

  見(例外.length === 0, "例外 0 件", 例外.slice(0, 3));
  await br.close();
  console.log("\n" + "─".repeat(32) + "\n  ok " + ok + " / NG " + ng);
  if (ng) { console.log("  落ちた: " + 落.join(" / ")); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
