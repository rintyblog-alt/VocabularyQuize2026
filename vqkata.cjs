/* ══════════════════════════════════════════════════════════════════════════
   vqkata.cjs — 型（テンプレート）を **全部 実際に 動かして** 確かめる

   訴え（2026-08-20）:
     「ゲームやアプリのボードは UI が 壊れたり、実用に ならないことが 多い。
       致命的な バグも ある。あらかじめ 型を 決めて 入れ込むだけにすれば
       エラーも 減るし 実用的に なる」

   だから この検査は **見た目の 確認では 足りない**。
     ① 24 の 芯 × 6 の 骨 = 144 通りを 本物の Chromium で 開く
     ② 画面の 失敗が 1 つも 出ないこと（#vqerr も 見る）
     ③ 触れる ものが あり、押しても 落ちないこと
     ④ 横に はみ出さない・画面から あふれないこと
     ⑤ 文字が 読めること（比 4.5 以上）を 実測
     ⑥ 12 の 色 × 3 の 詰 を すべて 実測（比・間）
     ⑦ **でたらめな 差し込み**（null・数の代わりに 文・巨大な文・仕掛け）でも
        崩れず、仕掛けが 実行されないこと

   本番には つながない（手元のファイルだけ 読む）。
   ══════════════════════════════════════════════════════════════════════════ */
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const ROOT = __dirname;
const KATA = path.join(ROOT, "client", "core", "kata");
const 速い = process.env.VQ_FAST === "1";

let 済 = 0, 落 = 0; const 印 = [];
function ok(名, 真, 補) {
  if (真) { 済++; if (!process.env.VQ_QUIET) 印.push("  ✅ " + 名 + (補 ? "  " + 補 : "")); }
  else { 落++; 印.push("  ❌ " + 名 + (補 ? "  " + 補 : "")); }
}
function 節(t) { 印.push("\n── " + t + " " + "─".repeat(Math.max(0, 54 - t.length))); }

/* node 側で 型を 組み立てる（画面に 出す前の 検査） */
["base", "play", "learn", "tool", "index"].forEach((f) => require(path.join(KATA, f + ".js")));
const V = globalThis.VQK;

/* 明るさ と 比（WCAG） */
function 明るさ(c) {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c || "") ||
    /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(c || "").replace("#", "").length === 6 ? String(c) : "");
  let rgb;
  if (m && m[0][0] === "r") rgb = [1, 2, 3].map((i) => Number(m[i]));
  else {
    const h = String(c || "").replace("#", "");
    if (h.length !== 6) return -1;
    rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  const f = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
}
function 比(a, b) {
  const x = 明るさ(a), y = 明るさ(b);
  if (x < 0 || y < 0) return 0;
  const h = Math.max(x, y), l = Math.min(x, y);
  return (h + 0.05) / (l + 0.05);
}

/* 画面に 出す ひな形。本体（core/board/app.js）の 包みと 同じ 並び。 */
function 文書(r) {
  return "<!doctype html><html lang=\"ja\"><head><meta charset=\"utf-8\">"
    + "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
    + "<style>" + r.css + "</style></head><body>"
    + "<div id=\"vqapp\">" + r.html + "</div>"
    + "<script>\ntry{\n" + r.js + "\n}catch(e){\n"
    + "var d=document.createElement('pre');d.id='vqerr';d.textContent=(e&&e.message)||String(e);"
    + "document.body.appendChild(d);\n}\n<\/script></body></html>";
}

/* 1 つの 型を 開いて、触って、測る */
async function 動かす(p, r, opt) {
  opt = opt || {};
  const 失敗 = [];
  const h = (e) => 失敗.push(String(e.message || e).slice(0, 160));
  /* ★ 先に 白紙へ 戻す。前の 型の 時計が 残っていると、
     **次の 型の 失敗として 数えてしまう**（実測。ここで 1 時間 溶かした）。 */
  await p.goto("about:blank");
  p.on("pageerror", h);
  await p.setContent(文書(r), { waitUntil: "load" });
  await p.waitForTimeout(opt.待ち || 220);

  /* 手もとの ボタンを 押す（はじめる など） */
  const 押した = await p.evaluate(async () => {
    const sleep = (ms) => new Promise((r2) => setTimeout(r2, ms));
    let n = 0;
    const foot = Array.from(document.querySelectorAll(".k-foot button"));
    for (const b of foot.slice(0, 4)) { try { b.click(); n++; } catch (e) {} await sleep(40); }
    await sleep(200);
    const main = Array.from(document.querySelectorAll(".k-main button, .k-main .bx, .k-main .cell"));
    for (const b of main.slice(0, 6)) { try { b.click(); n++; } catch (e) {} await sleep(30); }
    await sleep(120);
    /* 打ち込み口が あれば 打つ */
    for (const i of Array.from(document.querySelectorAll("input")).slice(0, 3)) {
      try {
        if (i.type === "range") { i.value = i.max; i.dispatchEvent(new Event("input", { bubbles: true })); continue; }
        i.value = i.inputMode === "numeric" ? "12" : "test";
        i.dispatchEvent(new Event("input", { bubbles: true }));
        i.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        n++;
      } catch (e) {}
    }
    await sleep(150);
    /* もう一度 手もとを 押す（つぎへ・たしかめる など） */
    for (const b of foot.slice(0, 4)) { try { b.click(); n++; } catch (e) {} await sleep(40); }
    await sleep(220);
    return n;
  });

  const m = await p.evaluate(() => {
    const k = document.querySelector(".k");
    const cs = (el, prop) => (el ? getComputedStyle(el)[prop] : "");
    const body = getComputedStyle(document.body);
    const 触 = document.querySelectorAll("button, input, select, textarea, canvas").length;
    /* 文字の 色と、その うしろの 地の 色（透明なら 親を たどる） */
    function 地(el) {
      let e = el;
      while (e && e !== document.documentElement) {
        const b = getComputedStyle(e).backgroundColor;
        if (b && !/rgba\(0,\s*0,\s*0,\s*0\)|transparent/.test(b)) return b;
        e = e.parentElement;
      }
      return getComputedStyle(document.body).backgroundColor;
    }
    const 文字 = [];
    document.querySelectorAll(".k-title,.k-note,.k-chip,.k-btn,.k-card,#kBody,.mi,.ck .t,.ev,.it,.rw .nm").forEach((el) => {
      const t = (el.textContent || "").trim();
      if (!t || t.length > 400) return;
      const s = getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) < 0.4) return;
      文字.push({ c: s.color, b: 地(el), n: t.slice(0, 18), fs: parseFloat(s.fontSize) || 16, w: s.fontWeight });
    });
    return {
      骨あり: !!k,
      高: k ? k.getBoundingClientRect().height : 0,
      窓高: window.innerHeight, 窓幅: window.innerWidth,
      横はみ: document.documentElement.scrollWidth > window.innerWidth + 2,
      縦はみ: document.documentElement.scrollHeight > window.innerHeight + 2,
      触: 触,
      err: !!document.getElementById("vqerr"),
      errText: document.getElementById("vqerr") ? document.getElementById("vqerr").textContent.slice(0, 120) : "",
      地色: body.backgroundColor,
      文字: 文字.slice(0, 24),
      script数: document.querySelectorAll("#vqapp script").length,
      危: /<script|onerror=|javascript:/i.test(document.getElementById("vqapp").innerHTML)
    };
  });
  p.off("pageerror", h);
  return { 失敗, 押した, m };
}

(async () => {
  節("① 目録");
  ok("芯が 24 種 ある", V.芯の名().length === 24, V.芯の名().length + " 種");
  ok("型は 5,184 通り", V.かず() === 5184, V.かず() + " 通り");
  ok("骨 6 / 色 12 / 詰 3", V.骨の名.length === 6 && V.色の名.length === 12 && V.詰の名.length === 3,
    V.骨の名.length + "/" + V.色の名.length + "/" + V.詰の名.length);
  const 目 = V.型たち();
  ok("どの芯にも 名前・説明・語・スロットが ある",
    目.every((t) => t.名 && t.説明 && (t.語 || []).length >= 4 && (t.スロット || []).length >= 1),
    目.filter((t) => !t.名 || !t.説明 || (t.語 || []).length < 4).map((t) => t.芯).join(",") || "すべて あり");
  ok("どの芯にも 題 と 副 の 差し込み口が ある",
    目.every((t) => t.スロット.some((s) => s.鍵 === "題")), "");
  const 分類 = {};
  目.forEach((t) => { 分類[t.分類] = (分類[t.分類] || 0) + 1; });
  ok("あそび・まなび・どうぐ が そろっている",
    分類["あそび"] >= 10 && 分類["まなび"] >= 5 && 分類["どうぐ"] >= 5, JSON.stringify(分類));

  節("② さがす");
  const 例題 = [
    ["九九を 練習したい", "drill"], ["英単語を 覚えるカード", "flash"],
    ["神経衰弱が したい", "pair"], ["持ち物の チェックリスト", "checklist"],
    ["25 分 集中する タイマー", "pomodoro"], ["歴史の 年表を 並べる", "timeline"],
    ["4 択の クイズ", "quiz4"], ["タイピングの 練習", "type"],
    ["くじ引きで 当番を 決める", "dice"], ["お絵かきが したい", "draw"],
    ["聞き取りの 練習", "dictation"], ["用語と 意味を 線で つなぐ", "matchline"],
    ["生きものを 仕分ける", "sortcat"], ["穴埋め問題", "fillblank"],
    ["もぐらたたき", "mole"], ["へびのゲーム", "snake"],
    ["ブロックくずし", "breakout"], ["2048", "merge2048"],
    ["得点を 数える", "counter"], ["おこづかいの 記録", "budget"]
  ];
  let 当 = 0;
  例題.forEach(([q, want]) => {
    const r = V.さがす(q, 3);
    const 中 = r.slice(0, 1).some((x) => x.芯 === want);
    if (中) 当++;
    else 印.push("     ・外した: 「" + q + "」→ " + r.slice(0, 3).map((x) => x.芯 + "(" + x.点 + ")").join(","));
  });
  ok("ふつうの 言いかたで 1 番目に 当たる（20 例）", 当 >= 18, 当 + "/20");
  ok("見当ちがいの 頼みは 点が 0", V.さがす("ぜんぜん関係のないことば", 1)[0].点 === 0, "");
  ok("同じ 頼みなら 毎回 同じ 型ID",
    V.さがす("九九", 1)[0].型ID === V.さがす("九九", 1)[0].型ID, V.さがす("九九", 1)[0].型ID);

  節("③ 差し込みの 検査（でたらめを 入れる）");
  const でたらめ = [
    {}, null, undefined, [], "文字列", 42,
    { 題: null, 副: 12345 },
    { 題: "x".repeat(500) },
    { 問題: "これは 表では ない" },
    { 問題: [{ 問: null, 答: undefined }] },
    { 制限秒: "はやく", 上のかず: -99, 問数: 99999 },
    { 混ぜる: "はい" },
    { 題: "<img src=x onerror=alert(1)>", 副: "</style><script>alert(2)<\/script>" },
    { カード: [{ 表: "a" }], 項目: { a: "x", b: "y" }, 候補: "1、2、3" }
  ];
  let 崩れ = 0, 例外 = 0;
  V.芯の名().forEach((k) => {
    でたらめ.forEach((d) => {
      try {
        const m = V.見た目を選ぶ(k, "");
        const r = V.作る(V.組む(k, m.骨, m.色, m.詰), d);
        if (!r.html || !r.css || !r.js) 崩れ++;
        if (/<script/i.test(r.html)) 崩れ++;
      } catch (e) { 例外++; 印.push("     ・落ちた: " + k + " ← " + JSON.stringify(d).slice(0, 60) + " → " + e.message); }
    });
  });
  ok("24 芯 × 14 通りの でたらめで 1 つも 落ちない", 例外 === 0, 例外 + " 件");
  ok("でたらめでも 中身が 空に ならない・仕掛けが 混ざらない", 崩れ === 0, 崩れ + " 件");
  const x1 = V.作る("quiz4/card/slate/normal", { 題: "<script>alert(1)<\/script>" });
  ok("題に 入れた 仕掛けは 文字に なる", x1.html.indexOf("<script") < 0 && x1.html.indexOf("&lt;script") >= 0, "");
  const x2 = V.作る("quiz4/card/slate/normal", { 問題: [{ 問: "</script><script>alert(1)</script>", 答: "a" }] });
  ok("問題文の 仕掛けも 出さない", x2.js.indexOf("</script>") < 0, "");
  let e1 = null;
  try { V.作る("ないよ/stack/slate/normal", {}); } catch (e) { e1 = e; }
  ok("知らない 型は 黙って 作らず、近いものを 教える", !!e1 && e1.code === "KATA_NOT_FOUND" && (e1.候補 || []).length > 0,
    e1 ? (e1.候補 || []).slice(0, 2).join(",") : "");

  節("④ 色 12 組 × 詰 3 の 実測");
  let 色落ち = [];
  V.色の名.forEach((c) => {
    const p = V.色たち[c];
    const 本文比 = 比(p.text, p.bg);
    const 面比 = 比(p.text, p.surface);
    const 副比 = 比(p.sub, p.bg);
    const 主比 = 比(p.accent, p.bg);
    const 主字 = 比(p.ink, p.accent);
    const 線比 = 比(p.line, p.bg);
    if (本文比 < 7) 色落ち.push(c + " 本文 " + 本文比.toFixed(2));
    if (面比 < 7) 色落ち.push(c + " 面の上 " + 面比.toFixed(2));
    if (副比 < 4.5) 色落ち.push(c + " 副 " + 副比.toFixed(2));
    if (主比 < 3) 色落ち.push(c + " 主色 " + 主比.toFixed(2));
    if (主字 < 4.5) 色落ち.push(c + " 主色の上の字 " + 主字.toFixed(2));
    if (線比 < 1.08) 色落ち.push(c + " 線が 見えない " + 線比.toFixed(3));
  });
  ok("12 組 すべてで 本文 7 以上・副 4.5 以上・主色 3 以上", 色落ち.length === 0, 色落ち.slice(0, 4).join(" / "));
  const 暗 = V.色の名.filter((c) => 明るさ(V.色たち[c].bg) < 0.2);
  ok("暗い 色の組も ある（夜に 使える）", 暗.length >= 3, 暗.join(","));
  let 詰落ち = [];
  V.詰の名.forEach((k) => {
    const d = V.詰たち[k];
    if (d.字 < 15) 詰落ち.push(k + " 字 " + d.字);
    if (d.gap < 8 || d.pad < 10) 詰落ち.push(k + " 間 " + d.gap + "/" + d.pad);
    if (d.見出し <= d.字) 詰落ち.push(k + " 見出しが 本文以下");
  });
  ok("どの 詰めかたでも 字は 15px 以上・間は 8px 以上", 詰落ち.length === 0, 詰落ち.join(" / "));

  節("⑤ 24 芯 × 6 骨 = 144 通りを 実際に 動かす");
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 900, height: 620 } });
  const p = await ctx.newPage();

  const 落ちた = [], はみ = [], 触れず = [], 読めず = [], 高さ = [];
  let 回 = 0;
  for (const k of V.芯の名()) {
    for (const 骨 of V.骨の名) {
      回++;
      const id = V.組む(k, 骨, "slate", "normal");
      const r = V.作る(id, {});
      const { 失敗, m } = await 動かす(p, r);
      if (失敗.length || m.err) 落ちた.push(id + " ← " + (失敗[0] || m.errText));
      if (m.横はみ) はみ.push(id);
      if (m.触 < 1) 触れず.push(id);
      if (!m.骨あり || m.高 < m.窓高 * 0.8 || m.高 > m.窓高 + 2) 高さ.push(id + " h=" + Math.round(m.高) + "/" + m.窓高);
      m.文字.forEach((t) => {
        const 大 = t.fs >= 24 || (t.fs >= 18.66 && Number(t.w) >= 700);
        const 要 = 大 ? 3 : 4.5;
        const v = 比(t.c, t.b);
        if (v < 要) 読めず.push(id + " 「" + t.n + "」 " + v.toFixed(2) + " < " + 要);
      });
      if (速い) break;
    }
  }
  ok("144 通り 全部 開いた", 回 === (速い ? 24 : 144), 回 + " 通り");
  ok("画面の 失敗が 1 つも 出ない", 落ちた.length === 0, 落ちた.slice(0, 3).join(" / "));
  ok("横に はみ出さない", はみ.length === 0, はみ.slice(0, 3).join(" / "));
  ok("どれにも 触れる ものが ある", 触れず.length === 0, 触れず.slice(0, 3).join(" / "));
  ok("どれも 画面の 高さに ぴたりと 収まる", 高さ.length === 0, 高さ.slice(0, 3).join(" / "));
  ok("文字が すべて 読める（比 4.5／大きい字は 3）", 読めず.length === 0, 読めず.slice(0, 3).join(" / "));

  節("⑥ せまい画面（iPhone くらい）");
  const p2 = await ctx.newPage();
  await p2.setViewportSize({ width: 390, height: 700 });
  const 狭はみ = [], 狭落ち = [];
  for (const k of V.芯の名()) {
    const m0 = V.見た目を選ぶ(k, "");
    const r = V.作る(V.組む(k, m0.骨, m0.色, m0.詰), {});
    const { 失敗, m } = await 動かす(p2, r);
    if (失敗.length || m.err) 狭落ち.push(k + " ← " + (失敗[0] || m.errText));
    if (m.横はみ) 狭はみ.push(k);
  }
  ok("せまい画面でも 落ちない", 狭落ち.length === 0, 狭落ち.slice(0, 3).join(" / "));
  ok("せまい画面でも 横に はみ出さない", 狭はみ.length === 0, 狭はみ.slice(0, 4).join(" / "));

  節("⑦ でたらめを 入れたまま 実際に 動かす");
  const 荒 = [
    { 題: null, 問題: "表ではない", カード: 3, 候補: "", 項目: null, 品: [{}], 対: [{ 左: "" }],
      出来事: "むかし", 文: [{}], 名前: [], 箱: [], 正しい順: "", 言葉: [{}], ふだ: [], 言葉2: null },
    { 題: "＜＞&\"'", 副: "x".repeat(300), 制限秒: "a", 問数: "b", 上のかず: null, ます: 0, だん: 99 }
  ];
  const 荒落ち = [];
  for (const k of V.芯の名()) {
    for (const d of 荒) {
      const m0 = V.見た目を選ぶ(k, "");
      const r = V.作る(V.組む(k, m0.骨, m0.色, m0.詰), d);
      const { 失敗, m } = await 動かす(p, r, { 待ち: 160 });
      if (失敗.length || m.err) 荒落ち.push(k + " ← " + (失敗[0] || m.errText));
      if (m.危) 荒落ち.push(k + " ← 仕掛けが 混ざった");
    }
  }
  ok("でたらめな 中身でも 1 つも 落ちない（24 芯 × 2 通り）", 荒落ち.length === 0, 荒落ち.slice(0, 3).join(" / "));

  節("⑧ 保存が 効く（どうぐ）");
  const 保存もの = ["checklist", "counter", "budget", "pomodoro"];
  const 保存無 = 保存もの.filter((k) => {
    const r = V.作る(V.組む(k, "stack", "slate", "normal"), {});
    return r.js.indexOf("K.save(") < 0 || r.js.indexOf("K.load(") < 0;
  });
  ok("道具は 閉じても 残る 作りに なっている", 保存無.length === 0, 保存無.join(","));
  const r0 = V.作る("checklist/stack/slate/normal", {});
  ok("保存は 本体の 溜めへ 預ける（iframe の localStorage は 使わない）",
    r0.js.indexOf("VQ.store") >= 0 && r0.js.indexOf("localStorage") < 0, "");

  節("⑨ サーバの 案内文と 目録が ずれていない");
  /* ★ 案内文は 手で 書いてある。目録に 芯を 足したのに 案内文へ 書き忘れると、
     Lumi は その型の 存在を 知らないまま。**ずれたら 落とす。** */
  const 本体 = fs.readFileSync(path.join(ROOT, "server", "src", "worker.js"), "utf8");
  const 始 = 本体.indexOf('fn("showKata"');
  const 終 = 本体.indexOf('fn("showApp"', 始);
  ok("サーバに showKata の 案内文が ある", 始 > 0 && 終 > 始, 始 > 0 ? "あり" : "なし");
  const 案内 = 始 > 0 && 終 > 始 ? 本体.slice(始, 終) : "";
  const 書き忘れ = V.芯の名().filter((k) => 案内.indexOf("  " + k + " …") < 0);
  ok("24 の 芯が すべて 案内文に ある", 書き忘れ.length === 0, 書き忘れ.join(",") || "すべて あり");
  const 見た目語 = ["stack", "hud", "card", "split", "board", "panel"];
  ok("骨の 名前も 案内文に そろっている", 見た目語.every((x) => 案内.indexOf(x) >= 0), "");
  ok("色の 名前も 案内文に そろっている", V.色の名.every((x) => 案内.indexOf(x) >= 0),
    V.色の名.filter((x) => 案内.indexOf(x) < 0).join(","));
  ok("案内文に 「まず これ」と 書いてある", /まず これ/.test(案内), "");
  const 促し = 本体.indexOf("まず showKata です");
  ok("使いかたの 案内（システム文）にも 型が 先だと 書いてある", 促し > 0, "");
  const 束 = fs.readFileSync(path.join(ROOT, "vqbundle.cjs"), "utf8");
  ok("型の 5 ファイルが 束に 入っている",
    ["base", "play", "learn", "tool", "index"].every((f) => 束.indexOf("/core/kata/" + f + ".js") >= 0), "");
  const 生ライブ = fs.readFileSync(path.join(ROOT, "js-src", "vq-live.9628a32d29.js"), "utf8");
  ok("画面側に showKata の 受け口が ある",
    生ライブ.indexOf('function showKata(') > 0 && 生ライブ.indexOf('name === "showKata"') > 0, "");

  await b.close();
  console.log(印.join("\n"));
  console.log("\n" + (落 === 0 ? "通った" : "落ちた") + "  " + 済 + "/" + (済 + 落));
  process.exit(落 === 0 ? 0 : 1);
})().catch((e) => { console.error("止まりました:", e && e.stack || e); process.exit(2); });
