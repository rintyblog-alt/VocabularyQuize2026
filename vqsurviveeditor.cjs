#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqsurviveeditor.cjs — コースを 自分で 作る の 検査。

     ① ひな形が そのまま 走れる
     ② 区画の 出し入れ・並べ替え（スタートと ゴールは 動かない）
     ③ **作りながら 測る**（検査 vqsurvivegap と 同じ 判定）
     ④ 合言葉で 渡せる／もらった ものを 洗う
     ⑤ 桁外れ・知らない 区画を 入れても 落ちない
     ⑥ 置き場は IndexedDB・上限が ある
     ⑦ 画面（作る → 保存 → ロビーに 出る → 走る）
     ⑧ **対戦では 使えない**（相手が 持っていない）

   使い方: 先に  cd server && ./dev-local.sh echo 8795
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const path = require("path");
const 道 = (p) => "file://" + path.join(__dirname, "client/assets/vocabu-survive", p);
const BASE = process.env.VQ_API || "http://127.0.0.1:8795";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const fs = require("fs");

let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ok   " + n); }
  else { fail++; bad.push(n); console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 300) : "")); }
};
const 節 = (t) => console.log("\n══ " + t + " ══");
const 待つ = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const M = await import(道("data/mycourse.js"));
  const { buildCourse } = await import(道("game/course.js"));
  const { analyzeCourse, 越えられる隙間, 越えられる段差 } = await import(道("game/analyze.js"));
  const { COURSES } = await import(道("data/courses.js"));

  節("① ひな形");
  const t0 = M.newCourse("my:t1", "ためし");
  const b0 = buildCourse(M.toDef(t0));
  const a0 = analyzeCourse(b0);
  ok("組み立てられる", b0.length > 60, Math.round(b0.length));
  ok("**そのまま 走れる**（跳べない ところが ない）", a0.ok, a0.warn);
  ok("クイズの 門が ある", b0.gates.length >= 1, b0.gates.length);
  ok("中間地点が ある", b0.checkpoints.length >= 1, b0.checkpoints.length);
  ok("スタートが 先頭", t0.sections[0].t === "start", t0.sections[0]);
  ok("ゴールが 最後", t0.sections[t0.sections.length - 1].t === "finish", t0.sections.slice(-1));

  節("② 測り方は 検査と 同じ");
  /* 本物の コースに かけて、vqsurvivegap と 同じ 答えに なるか */
  const c1 = buildCourse(COURSES[0]);
  const a1 = analyzeCourse(c1);
  ok("作り置きの コースも 測れる", a1.ok, a1.warn);
  ok("線が 1 か所（隙間 5.5 / 段差 2.4）", 越えられる隙間 === 5.5 && 越えられる段差 === 2.4,
    [越えられる隙間, 越えられる段差]);
  const gapsrc = fs.readFileSync("vqsurvivegap.cjs", "utf8");
  ok("**検査も 同じ ものを 使っている**", /analyzeCourse/.test(gapsrc) && !/越えられる隙間 = /.test(gapsrc));

  節("③ 跳べない コースは 跳べないと 出る");
  const 悪 = M.newCourse("my:bad", "とべない");
  悪.sections.splice(2, 0, { t: "gap", len: 12 });
  const ab = analyzeCourse(buildCourse(M.toDef(悪)));
  ok("大きすぎる すきまを 見つける", !ab.ok && ab.warn.some((w) => /すきま/.test(w)), ab.warn);
  ok("どこか まで 言う", ab.warn.some((w) => /@\d+m/.test(w)), ab.warn);
  const 段 = M.newCourse("my:step", "だんさ");
  段.sections.splice(2, 0, { t: "ramp", len: 8, dy: 10, w: 10 });
  const as = analyzeCourse(buildCourse(M.toDef(段)));
  console.log("     急な 坂: すきま " + as.gap.toFixed(1) + " / 段差 " + as.step.toFixed(1));
  ok("坂は 段差に ならない（上れる）", as.step <= 越えられる段差, as.step);

  節("④ 合言葉");
  const code = M.exportCode(t0);
  ok("VS1 で 始まる", /^VS1[A-Za-z0-9\-_]+$/.test(code), code.slice(0, 20));
  ok("短い（2KB 以内）", code.length < 2048, code.length);
  const back = M.importCode(code, "my:t2");
  ok("読み戻せる", !!back, back);
  ok("名前が 残る", back.name === "ためし", back.name);
  ok("**中身が 同じ**", JSON.stringify(back.sections) === JSON.stringify(M.cleanSections(t0.sections)));
  ok("走れる ものに なる", analyzeCourse(buildCourse(M.toDef(back))).ok);
  for (const 変 of ["", "ただの 文字", "VS1", "VS1!!!!", "VS2" + code.slice(3), null, undefined, "VS1" + "A".repeat(40)]) {
    ok("でたらめ「" + String(変).slice(0, 12) + "」は 断る", M.importCode(変) === null, M.importCode(変));
  }

  節("⑤ 洗う（もらった ものを そのまま 使わない）");
  const 汚 = M.cleanSections([
    { t: "path", len: 1e9, w: -50 },
    { t: "そんな区画は無い", len: 20 },
    { t: "gap", len: "abc" },
    null, 42, "path",
    { t: "gate", limit: 99999, gw: 0 },
    { t: "path", len: 20, w: 10, obs: [{ t: "しらない仕掛け" }, { t: "spinner", dz: 1e9, len: 999 }] }
  ]);
  ok("知らない 区画は 落とす", !汚.some((x) => x.t === "そんな区画は無い"), 汚.map((x) => x.t));
  ok("数の 型が 違う ものは 既定へ", 汚.filter((x) => x.t === "gap")[0].len === 12, 汚.filter((x) => x.t === "gap")[0]);
  ok("桁外れの 長さを 抑える", 汚[0].len <= 40 && 汚[0].w >= 5, 汚[0]);
  ok("桁外れの 門も 抑える", 汚.filter((x) => x.t === "gate")[0].limit <= 30, 汚.filter((x) => x.t === "gate")[0]);
  const 仕 = 汚.filter((x) => x.obs)[0];
  ok("知らない 仕掛けは 落とす", 仕 && 仕.obs.length === 1 && 仕.obs[0].t === "spinner", 仕 && 仕.obs);
  ok("仕掛けの 数も 抑える", 仕 && 仕.obs[0].dz <= 40 && 仕.obs[0].len <= 40, 仕 && 仕.obs[0]);
  const 長 = M.cleanSections(new Array(200).fill({ t: "path", len: 20, w: 10 }));
  ok("区画の 数に 上限（40）", 長.length <= 40, 長.length);
  ok("洗った あとも 組み立てられる", (() => {
    try { buildCourse(M.toDef({ id: "my:x", name: "x", theme: "meadow", difficulty: 3, sections: 汚 })); return true; }
    catch (e) { return false; }
  })());

  節("⑥ 置き場");
  const src = fs.readFileSync("client/assets/vocabu-survive/data/mycourse.js", "utf8");
  ok("**IndexedDB を 使う**", /indexedDB\.open/.test(src));
  ok("localStorage を 使っていない", !/localStorage\s*\./.test(src));
  ok("上限が ある", /MAX = \d+/.test(src));
  ok("直す ときは 上限を 見ない", /あった \|\| 数 >= MAX|!あった && 数 >= MAX/.test(src));

  /* ── 画面 ── */
  const { chromium } = require("playwright");
  const nick = "ed" + Date.now().toString(36).slice(-6);
  const reg = await (await fetch(BASE + "/api/auth/register", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gradePrefix: "H1", nickname: nick, password: "DevEd#2026a", tosAccepted: true, tosVersion: "1" })
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
    await pg.evaluate(() => document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot.querySelector(".vs-load-start").click());
    await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "lobby", null, { timeout: 25000, polling: 250 });

    節("⑦ 画面");
    const 入口 = await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const b = Array.from(r.querySelectorAll(".vs-btn")).filter((e) => /コースを 作る/.test(e.textContent))[0];
      return { 有: !!b };
    });
    ok("ロビーに「コースを 作る」が ある", 入口.有, 入口);

    await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      Array.from(r.querySelectorAll(".vs-btn")).filter((e) => /コースを 作る/.test(e.textContent))[0].click();
    });
    await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "editor", null, { timeout: 20000, polling: 200 });
    await 待つ(500);
    const 編 = await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      return {
        区: r.querySelectorAll(".vs-ed-row").length,
        足: r.querySelectorAll(".vs-ed-addb").length,
        風: r.querySelectorAll(".vs-ed-theme").length,
        判: Array.from(r.querySelectorAll(".vs-ed-check p")).map((e) => e.textContent),
        悪: r.querySelectorAll(".vs-ed-check .vs-ed-bad").length
      };
    });
    ok("編集の 画面へ 移る", 編.区 > 0, 編);
    ok("ひな形が 9 区画", 編.区 === 9, 編.区);
    ok("足せる 区画が 並ぶ", 編.足 >= 10, 編.足);
    ok("風景が 10 種", 編.風 === 10, 編.風);
    ok("**その場で 判定が 出る**", 編.判.length >= 4, 編.判);
    ok("ひな形は 全部 ○", 編.悪 === 0, 編.判);

    /* 区画を 足す → 判定が 変わる */
    await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      Array.from(r.querySelectorAll(".vs-ed-addb")).filter((e) => /すきま/.test(e.textContent))[0].click();
    });
    await 待つ(400);
    const 足 = await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const ed = window.VocabuSurvive.__app.shell.get("editor");
      return { 区: r.querySelectorAll(".vs-ed-row").length, 選: ed.sel,
        判: Array.from(r.querySelectorAll(".vs-ed-check p")).map((e) => e.textContent) };
    });
    ok("区画が 増える", 足.区 === 10, 足.区);
    ok("足した ものが 選ばれる", 足.選 >= 1, 足.選);
    ok("ゴールの 前に 入る", 足.選 < 足.区 - 1, 足);

    /* すきまを 大きく して 赤が 出るか */
    const 赤 = await pg.evaluate(async () => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const ed = window.VocabuSurvive.__app.shell.get("editor");
      ed.course.sections[ed.sel].len = 12;
      ed._render();
      await new Promise((x) => setTimeout(x, 300));
      return { 悪: r.querySelectorAll(".vs-ed-check .vs-ed-bad").length,
        文: Array.from(r.querySelectorAll(".vs-ed-check .vs-ed-bad")).map((e) => e.textContent) };
    });
    ok("**跳べない と 赤で 出る**", 赤.悪 >= 1, 赤);
    ok("何が だめか 書いてある", 赤.文.some((t) => /すきま/.test(t)), 赤.文);

    /* 戻して 保存 */
    await pg.evaluate(async () => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const ed = window.VocabuSurvive.__app.shell.get("editor");
      ed.course.sections[ed.sel].len = 5;
      ed.course.name = "検査で 作った コース";
      ed._render();
      await new Promise((x) => setTimeout(x, 200));
      Array.from(r.querySelectorAll(".vs-btn")).filter((e) => /^保存/.test(e.textContent))[0].click();
      await new Promise((x) => setTimeout(x, 900));
    });
    const 保 = await pg.evaluate(async () => {
      const mod = await import("/assets/vocabu-survive/data/mycourse.js");
      const list = await mod.listMyCourses();
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      return { 数: list.length, 名: list[0] && list[0].name,
        一覧: r.querySelectorAll(".vs-ed-mrow").length };
    });
    ok("保存できる", 保.数 === 1, 保);
    ok("名前が 残る", 保.名 === "検査で 作った コース", 保.名);
    ok("作った 一覧に 出る", 保.一覧 === 1, 保.一覧);

    /* 合言葉 */
    const 言 = await pg.evaluate(async () => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      Array.from(r.querySelectorAll(".vs-btn")).filter((e) => /合言葉を 作る/.test(e.textContent))[0].click();
      await new Promise((x) => setTimeout(x, 400));
      return r.querySelector(".vs-ed-code").value;
    });
    ok("合言葉が 出る", /^VS1/.test(言), 言.slice(0, 20));

    /* ロビーへ 戻る → 一覧に 出る → 走れる */
    await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      r.querySelector(".vs-ed-head .vs-lb-x").click();
    });
    await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "lobby", null, { timeout: 20000, polling: 250 });
    await 待つ(800);
    const 並 = await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      return Array.from(r.querySelectorAll(".vs-lb-mineb")).map((e) => e.textContent);
    });
    ok("ロビーの 一覧に 出る", 並.length === 1 && /検査で 作った/.test(並[0]), 並);

    await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      r.querySelector(".vs-lb-mineb").click();
    });
    await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "match", null, { timeout: 30000, polling: 250 });
    await 待つ(1200);
    const 走 = await pg.evaluate(() => {
      const m = window.VocabuSurvive.__app.shell.get("match");
      return { id: m.course.id, 名: m.course.name, 長: Math.round(m.course.length),
        門: m.course.gates.length, 板: m.canvas.width };
    });
    ok("**自分の コースで 走れる**", /^my:/.test(走.id), 走);
    ok("名前も 引き継ぐ", /検査で 作った/.test(走.名), 走.名);
    ok("組み立てられている", 走.長 > 60 && 走.門 >= 1 && 走.板 > 100, 走);

    節("⑧ 対戦では 使えない");
    await pg.evaluate(() => {
      const app = window.VocabuSurvive.__app;
      const m = app.shell.get("match"); if (m && m.quiz && m.quiz.close) m.quiz.close();
      return app.goLobby();
    });
    await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "lobby", null, { timeout: 20000, polling: 250 });
    await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      r.querySelector(".vs-lb-onrow .vs-btn").click();
    });
    await pg.waitForFunction(() => {
      const lb = window.VocabuSurvive.__app.shell.get("lobby");
      return lb && lb.roomId && lb.net && lb.net.connected;
    }, null, { timeout: 25000, polling: 250 }).catch(() => {});
    await 待つ(700);
    const 部 = await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const b = r.querySelector(".vs-lb-mineb");
      return { 部屋: window.VocabuSurvive.__app.shell.get("lobby").roomId,
        止: b ? b.disabled : null, 断: !!Array.from(r.querySelectorAll(".vs-lb-note"))
          .filter((e) => /相手が その コースを 持っていません/.test(e.textContent))[0] };
    });
    ok("部屋に 入った", /^[A-Z0-9]{6}$/.test(String(部.部屋 || "")), 部.部屋);
    ok("**自分の コースは 押せなく なる**", 部.止 === true, 部);
    ok("なぜ 使えないか 書いてある", 部.断, 部);

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
