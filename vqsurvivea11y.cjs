#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqsurvivea11y.cjs — 使いやすさの 点検（要件 26）。

     ① キーボードだけで ロビーを ひと通り 操作できる
     ② 押せる ものに 名前が 付いている（読み上げで 何か 分かる）
     ③ 選ばれている ことが 印で 分かる（色だけに 頼らない）
     ④ 順位・時間・門の 問題が 読み上げに 届く（aria-live / role）
     ⑤ 焦点の 輪が 見える（キーボードで 動かした とき）
     ⑥ 文字と 背景の 明暗の 差（WCAG AA 4.5:1）
     ⑦ 動きを 減らす 設定（prefers-reduced-motion）を 見ている

   使い方: 先に  cd server && ./dev-local.sh echo 8795
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_API || "http://127.0.0.1:8795";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const fs = require("fs");

let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ok   " + n); }
  else { fail++; bad.push(n); console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 320) : "")); }
};
const 節 = (t) => console.log("\n══ " + t + " ══");
const 待つ = (ms) => new Promise((r) => setTimeout(r, ms));

/* 明暗の 差（WCAG）。#rrggbb か rgb() を 受ける。 */
function 明るさ(c) {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c) || /#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(c);
  if (!m) return null;
  const v = /^#/.test(c) ? [1, 2, 3].map((i) => parseInt(m[i], 16)) : [1, 2, 3].map((i) => Number(m[i]));
  const f = v.map((x) => { const s = x / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); });
  return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
}
function 比(a, b) {
  const x = 明るさ(a), y = 明るさ(b);
  if (x === null || y === null) return null;
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

(async () => {
  const { chromium } = require("playwright");
  const nick = "a1" + Date.now().toString(36).slice(-6);
  const reg = await (await fetch(BASE + "/api/auth/register", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gradePrefix: "H1", nickname: nick, password: "DevA1#2026a", tosAccepted: true, tosVersion: "1" })
  })).json();
  const br = await chromium.launch({
    args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader", "--disable-dev-shm-usage"]
  });
  const errs = [];
  try {
    const ctx = await br.newContext({ viewport: { width: 1280, height: 860 } });
    const pg = await ctx.newPage();
    pg.on("pageerror", (e) => errs.push(String(e && e.message || e)));
    await ctx.addInitScript((tk) => {
      try {
        localStorage.setItem("app.auth.token.v1", tk);
        localStorage.setItem("app.auth.expiresAt.v1", String(Date.now() + 86400000));
        localStorage.setItem("vq.survive.help.v1", "1");
      } catch (e) {}
    }, reg.token);
    await pg.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await pg.waitForFunction(() => !!document.getElementById("appSurvivePage"), null, { timeout: 25000 });
    await pg.evaluate(() => {
      const f = () => {
        document.body.classList.remove("auth-booting", "auth-gate-open", "first-launch-open");
        for (const id of ["authGate", "authBootSplash", "firstLaunchOverlay", "globalLoadingOverlay"]) {
          const e = document.getElementById(id); if (e) e.classList.add("hidden");
        }
      };
      f(); if (!window.__g) window.__g = setInterval(f, 120);
    });
    await pg.evaluate(() => document.querySelector('#appTabBar [data-app-tab="survive"]').click());
    await pg.waitForFunction(() => !!(window.VocabuSurvive && window.VocabuSurvive.state().opened),
      null, { timeout: 45000, polling: 250 });
    await pg.waitForFunction(() => {
      const h = document.querySelector("#appSurvivePage .vq-survive-host");
      return !!(h && h.shadowRoot && h.shadowRoot.querySelector(".vs-load-start"));
    }, null, { timeout: 45000, polling: 250 });

    節("① 読み込み画面");
    const 読 = await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const bar = r.querySelector(".vs-load-bar");
      return {
        進: bar ? { role: bar.getAttribute("role"), now: bar.getAttribute("aria-valuenow"),
          min: bar.getAttribute("aria-valuemin"), max: bar.getAttribute("aria-valuemax") } : null,
        釦: !!r.querySelector(".vs-load-start")
      };
    });
    ok("進み具合に role=progressbar", 読.進 && 読.進.role === "progressbar", 読.進);
    ok("進み具合に 数が 付く", 読.進 && 読.進.min === "0" && 読.進.max === "100", 読.進);
    ok("START が ある", 読.釦);

    await pg.evaluate(() => document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot.querySelector(".vs-load-start").click());
    await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "lobby", null, { timeout: 25000, polling: 250 });

    節("② 押せる ものに 名前が ある");
    const 名 = await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const 無名 = [];
      for (const e of r.querySelectorAll("button, [role='radio'], [role='tab'], [role='listbox'] > *")) {
        const t = (e.textContent || "").trim();
        const a = e.getAttribute("aria-label") || e.getAttribute("title") || "";
        if (!t && !a) 無名.push((e.className || "").toString().slice(0, 34) || e.tagName);
      }
      return { 無名, 総: r.querySelectorAll("button").length };
    });
    ok("名前の 無い ボタンが 0 個", 名.無名.length === 0, 名.無名);
    console.log("     ボタン " + 名.総 + " 個");

    節("③ まとまりに 役と 名前");
    const 群 = await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const out = [];
      for (const e of r.querySelectorAll("[role='radiogroup'], [role='tablist'], [role='listbox'], nav")) {
        out.push({ role: e.getAttribute("role") || e.tagName.toLowerCase(),
          lab: e.getAttribute("aria-label") || "" });
      }
      return out;
    });
    ok("まとまりが 5 つ 以上 ある", 群.length >= 5, 群.length);
    ok("**どの まとまりにも 名前が 付いている**", 群.every((g) => g.lab.length > 0), 群.filter((g) => !g.lab));

    節("④ 選ばれている ことが 印で 分かる");
    const 印 = await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const 数 = (s) => r.querySelectorAll(s).length;
      return {
        色: 数(".vs-lb-color[aria-checked='true']"),
        遊: 数(".vs-lb-mode[aria-checked='true']"),
        段: 数(".vs-lb-tier[aria-selected='true']"),
        コ: 数(".vs-lb-card[aria-selected='true']") + 数("[role='option'][aria-selected='true']"),
        記: 数(".vs-lb-rec-tab[aria-selected='true']"),
        帽: 数(".vs-lb-hat[aria-checked='true']")
      };
    });
    ok("色は 1 つだけ 選ばれている", 印.色 === 1, 印.色);
    ok("遊び方は 1 つだけ", 印.遊 === 1, 印.遊);
    ok("難しさは 1 つだけ", 印.段 === 1, 印.段);
    ok("記録の 範囲は 1 つだけ", 印.記 === 1, 印.記);
    ok("かぶりものは 1 つだけ", 印.帽 === 1, 印.帽);

    節("⑤ キーボードだけで 触れる");
    /* 影の DOM の 中を Tab で 回る */
    await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const b = r.querySelector(".vs-lb-tier"); if (b) b.focus();
    });
    const 巡 = [];
    for (let i = 0; i < 26; i++) {
      await pg.keyboard.press("Tab");
      const cur = await pg.evaluate(() => {
        let e = document.activeElement;
        while (e && e.shadowRoot && e.shadowRoot.activeElement) e = e.shadowRoot.activeElement;
        if (!e) return null;
        const b = e.getBoundingClientRect();
        return { t: e.tagName, c: (e.className || "").toString().slice(0, 30),
          見: b.width > 4 && b.height > 4,
          輪: (() => { const cs = getComputedStyle(e); return cs.outlineStyle !== "none" || cs.boxShadow !== "none"; })() };
      });
      if (cur) 巡.push(cur);
    }
    const 押せる = 巡.filter((x) => x.t === "BUTTON" || x.t === "INPUT" || x.t === "SUMMARY");
    ok("Tab で 押せる ものへ 移れる", 押せる.length >= 8, { 回った: 巡.length, 押せる: 押せる.length });
    ok("移った 先が 画面に 出ている", 押せる.every((x) => x.見), 押せる.filter((x) => !x.見).slice(0, 3));

    /* Enter で 実際に 選べる */
    const 前 = await pg.evaluate(() => window.VocabuSurvive.__app.shell.get("lobby").mode);
    await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      r.querySelector('.vs-lb-mode[data-mode="survival"]').focus();
    });
    await pg.keyboard.press("Enter");
    await 待つ(250);
    const 後 = await pg.evaluate(() => window.VocabuSurvive.__app.shell.get("lobby").mode);
    ok("**Enter で 遊び方を 選べる**", 後 === "survival" && 前 !== 後, [前, 後]);

    節("⑥ 読み上げに 届く（試合の 画面）");
    await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const lb = window.VocabuSurvive.__app.shell.get("lobby");
      lb.courseIndex = 0; lb.botCount = 3; lb.mode = "race"; lb._render();
      r.querySelector(".vs-lb-start").click();
    });
    await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "match", null, { timeout: 30000, polling: 250 });
    await 待つ(1200);
    const 試 = await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const q = (s) => { const e = r.querySelector(s); return e ? {
        role: e.getAttribute("role") || "", live: e.getAttribute("aria-live") || "",
        lab: e.getAttribute("aria-label") || "" } : null; };
      return { 観: q(".vs-spec"), 幕: q(".vs-hud-big"), 門: q(".vs-quiz"),
        報: q(".vs-quiz-feed"), 板: q("canvas"), 止: q(".vs-pause") };
    });
    ok("門は dialog として 出る", 試.門 && 試.門.role === "dialog", 試.門);
    ok("門に 名前が 付く", 試.門 && 試.門.lab.length > 0, 試.門);
    ok("正解・不正解が 読み上げに 流れる", 試.報 && (試.報.live === "assertive" || 試.報.role === "status"), 試.報);
    ok("観戦の 帯は status", 試.観 && 試.観.role === "status", 試.観);

    /* 門を 開けて 中を 見る */
    const 門中 = await pg.evaluate(() => {
      const m = window.VocabuSurvive.__app.shell.get("match");
      m.quiz.ask(m.questions[0], 12);
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const opts = Array.from(r.querySelectorAll(".vs-quiz-opt"));
      return { 数: opts.length,
        番号: opts.map((e) => (e.querySelector(".vs-quiz-key") || {}).textContent),
        文: opts.map((e) => (e.querySelector(".vs-quiz-label") || {}).textContent),
        問: (r.querySelector(".vs-quiz-q") || {}).textContent };
    });
    ok("門に 4 つの 選択肢", 門中.数 === 4, 門中.数);
    ok("**番号が 見える**（色だけに 頼らない）",
      門中.番号.join("") === "1234", 門中.番号);
    ok("選択肢に 文字が 入っている", 門中.文.every((t) => t && t.length > 0), 門中.文);
    ok("問題文が 出る", 門中.問 && 門中.問.length > 0, 門中.問);

    節("⑦ 文字と 背景の 明暗");
    /* ★ 背景は **半透明**の ことが 多い（rgba(255,255,255,.075) を
       濃い 札の 上に 重ねる）。そのまま 白として 数えると
       「白地に 白文字」に 見えて、実際には 読める ものを 落としてしまう。
       親を たどって 重ね合わせた 色で 見る。 */
    const 色 = await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const 解 = (c) => {
        const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(c || "");
        if (!m) return null;
        return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
      };
      const 重ねる = (上, 下) => [0, 1, 2].map((i) => 上[i] * 上[3] + 下[i] * (1 - 上[3])).concat([1]);
      const 実背景 = (e) => {
        let 下 = [11, 16, 32, 1];           /* いちばん 下の 地（濃い 紺） */
        const 鎖 = [];
        let x = e;
        while (x) { 鎖.push(x); x = x.parentElement; }
        for (let i = 鎖.length - 1; i >= 0; i--) {
          const c = 解(getComputedStyle(鎖[i]).backgroundColor);
          if (c && c[3] > 0) 下 = 重ねる(c, 下);
        }
        return 下;
      };
      const 拾 = (s) => { const e = r.querySelector(s); if (!e) return null;
        const cs = getComputedStyle(e);
        const f = 解(cs.color) || [255, 255, 255, 1];
        const b = 実背景(e);
        /* 文字にも 透明度が あれば 背景に 重ねる */
        const fc = f[3] < 1 ? 重ねる(f, b) : f;
        const rgb = (v) => "rgb(" + Math.round(v[0]) + ", " + Math.round(v[1]) + ", " + Math.round(v[2]) + ")";
        return { c: rgb(fc), b: rgb(b), 生: cs.color + " / " + cs.backgroundColor };
      };
      return { 問: 拾(".vs-quiz-q"), 選: 拾(".vs-quiz-opt"), 番: 拾(".vs-quiz-key"),
        時: 拾(".vs-hud-time"), 札: 拾(".vs-quiz-card"), 順: 拾(".vs-hud-rank"),
        経: 拾(".vs-hud-cp"), 名: 拾(".vs-hud-row-nm") };
    });
    for (const [nm, v] of Object.entries(色)) {
      if (!v) continue;
      const c = 比(v.c, v.b);
      if (c === null) continue;
      console.log("     " + nm + ": " + c.toFixed(2) + ":1  (" + v.生 + ")");
      ok(nm + " の 明暗が 4.5:1 以上", c >= 4.5, { 色: v.c, 背: v.b, 比: c && c.toFixed(2), 生: v.生 });
    }

    節("⑦-b うすい 文字（ロビー）");
    /* ★ うすい 文字こそ 危ない。ここが 落ちる ことが いちばん 多い。 */
    await pg.evaluate(() => {
      const app = window.VocabuSurvive.__app;
      const m = app.shell.get("match"); if (m && m.quiz && m.quiz.close) m.quiz.close();
      return app.goLobby();
    });
    await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "lobby",
      null, { timeout: 20000, polling: 250 });
    await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      for (const d of r.querySelectorAll("details")) d.open = true;
    });
    await 待つ(400);
    const うす = await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const 解 = (c) => {
        const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(c || "");
        if (!m) return null;
        return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
      };
      const 重 = (上, 下) => [0, 1, 2].map((i) => 上[i] * 上[3] + 下[i] * (1 - 上[3])).concat([1]);
      const 背 = (e) => {
        let 下 = [11, 16, 32, 1]; const 鎖 = []; let x = e;
        while (x) { 鎖.push(x); x = x.parentElement; }
        for (let i = 鎖.length - 1; i >= 0; i--) {
          const c = 解(getComputedStyle(鎖[i]).backgroundColor);
          if (c && c[3] > 0) 下 = 重(c, 下);
        }
        return 下;
      };
      const rgb = (v) => "rgb(" + Math.round(v[0]) + ", " + Math.round(v[1]) + ", " + Math.round(v[2]) + ")";
      const 拾 = (s2) => { const e = r.querySelector(s2); if (!e) return null;
        const cs = getComputedStyle(e);
        const f = 解(cs.color) || [255, 255, 255, 1];
        const b = 背(e);
        const px = parseFloat(cs.fontSize) || 14;
        const 太 = (parseInt(cs.fontWeight, 10) || 400) >= 700;
        return { c: rgb(f[3] < 1 ? 重(f, b) : f), b: rgb(b), px, 大: px >= 24 || (太 && px >= 18.66) };
      };
      /* 結果の 画面も 出しておく（ふだんは 隠れている） */
      const m = window.VocabuSurvive.__app.shell.get("match");
      try {
        m.result.show({ rank: 2, total: 4, finished: true, time: 33.3, correct: 2, wrong: 1,
          respawns: 1, xp: 120, best: 40, newBest: false, mode: "race",
          standings: [{ rank: 1, name: "A", colorIndex: 0, finished: true, finishTime: 30, pct: 1, me: false },
                      { rank: 2, name: "あなた", colorIndex: 1, finished: true, finishTime: 33.3, pct: 1, me: true }],
          courseName: "検査", splits: [10, 22], bestSplits: [11, 20],
          cup: { round: 1, rounds: 3, keep: 3, total: 4, survivors: [{ name: "A" }], out: [{ name: "B" }],
                 meAlive: true, last: false, next: null } });
      } catch (e) {}
      return {
        見出し: 拾(".vs-lb-lab"), 案内: 拾(".vs-lb-note"), 説明: 拾(".vs-lb-mode-d"),
        段: 拾(".vs-lb-tier"), 記番: 拾(".vs-lb-rec-no"), 単語添: 拾(".vs-lb-qz-s"),
        帽: 拾(".vs-lb-hat"), 品: 拾(".vs-lb-q"), 合言葉: 拾(".vs-lb-code"),
        結見出し: 拾(".vs-res-sl"), 結添: 拾(".vs-res-ss"), 結番: 拾(".vs-res-no"),
        区間名: 拾(".vs-res-spn"), 勝札: 拾(".vs-res-cuplab"), 勝丸: 拾(".vs-res-cupdot"),
        観: 拾(".vs-spec-l"), 覧番: 拾(".vs-hud-no"), 覧差: 拾(".vs-hud-td")
      };
    });
    for (const [nm, v] of Object.entries(うす)) {
      if (!v) continue;
      const c = 比(v.c, v.b);
      if (c === null) continue;
      const 要 = v.大 ? 3.0 : 4.5;
      console.log("     " + nm + ": " + c.toFixed(2) + ":1  (" + v.px + "px" + (v.大 ? " 大" : "") + " 要 " + 要 + ")");
      ok(nm + " の 明暗が " + 要 + ":1 以上", c >= 要, { 色: v.c, 背: v.b, 比: c && c.toFixed(2), px: v.px });
    }

    節("⑧ 動きを 減らす 設定");
    const src = fs.readFileSync("client/assets/vocabu-survive/boot/loading.js", "utf8")
      + fs.readFileSync("client/assets/vocabu-survive/ui/theme.js", "utf8")
      + fs.readFileSync("client/assets/vocabu-survive/ui/hud.js", "utf8");
    ok("prefers-reduced-motion を 見ている", /prefers-reduced-motion/.test(src));

    節("⑨ 例外");
    ok("画面の 例外 0 件", errs.length === 0, errs.slice(0, 4));
  } finally {
    await br.close().catch(() => {});
  }
  console.log("\n────────────────────────────────");
  console.log("  ok " + pass + " / NG " + fail);
  if (bad.length) console.log("  落ちたもの:\n   - " + bad.join("\n   - "));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
