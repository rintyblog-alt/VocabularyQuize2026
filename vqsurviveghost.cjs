#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqsurviveghost.cjs — ゴースト（自己ベストと 並んで 走る）の 検査。

     ① 記録の 間引き（10Hz・小数 2 桁・上限）
     ② 再生（時刻 → 位置・向きの 回り込み・終わったら 消える）
     ③ 進み → 時刻（差を 出す もと）
     ④ 置き場は IndexedDB（**localStorage を 使っていない**）
     ⑤ 実際に 走った 記録で 通す
     ⑥ 画面（走ると 記録が 溜まる・自己ベストで 覚える・差が 出る・切れる）
     ⑦ **対戦では 出さない**

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
  const G = await import(道("data/ghost.js"));

  節("① 記録の 間引き");
  const rec = new G.GhostRecorder();
  for (let i = 0; i < 600; i++) {
    const t = i / 60;
    rec.sample(t, { x: t * 2, y: 1 + Math.sin(t), z: -t * 8, yaw: t * 0.3 }, t * 9);
  }
  ok("10 秒 走って 100 点 前後", rec.length >= 95 && rec.length <= 105, rec.length);
  ok("**60Hz を そのまま 溜めない**（6 倍に ならない）", rec.length < 200, rec.length);
  ok("1 点 6 つの 数", rec.a.length === rec.length * 6, [rec.a.length, rec.length]);
  ok("小数 2 桁に 丸める", rec.a.every((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-9),
    rec.a.slice(0, 8));
  ok("時刻が 増える 順", (() => {
    for (let i = 6; i < rec.a.length; i += 6) if (!(rec.a[i] > rec.a[i - 6])) return false;
    return true;
  })());
  const 長 = new G.GhostRecorder();
  for (let i = 0; i < 60 * 700; i += 6) 長.sample(i / 60, { x: 0, y: 0, z: 0, yaw: 0 }, i);
  ok("長すぎる 走りは 途中で 打ち切る（10 分）", 長.length <= 6100, 長.length);
  rec.reset();
  ok("reset で 空に なる", rec.length === 0);

  節("② 再生");
  const a = [];
  for (let i = 0; i <= 20; i++) a.push(i * 0.5, i, 2, -i * 4, 0, i * 5);
  const gp = new G.GhostPlayer({ a, ms: 10000 });
  ok("使える", gp.ok === true);
  gp.at(0);
  ok("0 秒の 位置", gp.x === 0 && gp.z === 0, [gp.x, gp.z]);
  gp.at(1.0);
  ok("1 秒の 位置（点の 上）", Math.abs(gp.x - 2) < 1e-6 && Math.abs(gp.z + 8) < 1e-6, [gp.x, gp.z]);
  gp.at(1.25);
  ok("**点と 点の 間を 補う**", Math.abs(gp.x - 2.5) < 1e-6 && Math.abs(gp.z + 10) < 1e-6, [gp.x, gp.z]);
  ok("進みも 補う", Math.abs(gp.progress - 12.5) < 1e-6, gp.progress);
  gp.at(9.9);
  ok("終わりの 手前は まだ 出る", gp.done === false, gp.done);
  gp.at(10.5);
  ok("**走り終えたら 消える**（ゴールに 立ち尽くさない）", gp.done === true, gp.done);
  gp.at(0.2);
  ok("時間を 巻き戻しても 追える", gp.done === false && gp.x > 0 && gp.x < 1, [gp.done, gp.x]);

  /* 向きの 回り込み */
  const b = [0, 0, 0, 0, Math.PI - 0.1, 0, 1, 0, 0, 0, -Math.PI + 0.1, 10];
  const gp2 = new G.GhostPlayer({ a: b, ms: 1000 });
  gp2.at(0.5);
  ok("**向きが 逆回りしない**（π を またぐ）", Math.abs(gp2.yaw) > 3.0, gp2.yaw);

  節("③ 進み → 時刻");
  ok("進み 0 なら 0 秒", Math.abs(gp.timeAt(0) - 0) < 1e-6, gp.timeAt(0));
  ok("進み 50 なら 5 秒", Math.abs(gp.timeAt(50) - 5) < 1e-6, gp.timeAt(50));
  ok("**間の 値も 出る**", Math.abs(gp.timeAt(52.5) - 5.25) < 1e-6, gp.timeAt(52.5));
  ok("まだ 行っていない 先は -1", gp.timeAt(9999) === -1, gp.timeAt(9999));
  const 空 = new G.GhostPlayer({ a: [0, 0, 0, 0, 0, 0], ms: 0 });
  ok("点が 1 つでも 落ちない", 空.ok === false && 空.timeAt(5) === -1);
  空.at(1);
  ok("点が 1 つなら done", 空.done === true);

  節("④ 置き場と 作り");
  const src = fs.readFileSync("client/assets/vocabu-survive/data/ghost.js", "utf8");
  ok("**IndexedDB を 使う**", /indexedDB\.open/.test(src));
  /* ★ 言葉としての「localStorage」は 説明に 出るので、**使っているか**を 見る。 */
  ok("localStorage を 使っていない", !/localStorage\s*\./.test(src),
    (src.match(/localStorage[^\n]{0,40}/g) || []).slice(0, 3));
  ok("開けない ときも 落ちない（null で 返す）", /res\(null\)/.test(src));
  const mt = fs.readFileSync("client/assets/vocabu-survive/game/match.js", "utf8");
  ok("自己ベストの ときだけ 覚える", /saveGhost\(this\.course\.id/.test(mt));
  ok("対戦では 出さない", /!this\.online && this\._ghostOn\(\)/.test(mt));

  節("⑤ 実際に 走った 記録で 通す");
  {
    const { COURSE_BY_ID } = await import(道("data/courses.js"));
    const { buildCourse } = await import(道("game/course.js"));
    const { Player, STEP } = await import(道("game/player.js"));
    const { Bot } = await import(道("game/bot.js"));
    const { Sim, PHASE } = await import(道("game/sim.js"));
    const course = buildCourse(COURSE_BY_ID.c02);
    const sim = new Sim(course, { timeLimit: 180, countdown: 0.1 });
    sim.autoGate = 1.0;
    const p = new Player({ id: "me", name: "me", colorIndex: 0 });
    sim.add(p); sim.localId = p.id;
    const bot = new Bot(p, course, { level: "perfect", seed: 21 });
    sim.start();
    const r = new G.GhostRecorder();
    const inputs = new Map();
    for (let 歩 = 0; 歩 < Math.round(180 / STEP) && sim.phase !== PHASE.FINISHED; 歩++) {
      inputs.set(p.id, bot.decide(sim.time));
      sim.step(inputs);
      if (sim.phase === PHASE.RUNNING && !p.finished) r.sample(sim.raceTime, p, p.progress);
    }
    console.log("     " + (p.finished ? p.finishTime.toFixed(1) + "s" : "×") + " / 点 " + r.length +
      " / " + Math.round(JSON.stringify(r.a).length / 1024) + "KB");
    ok("走ると 点が 溜まる", r.length > 30, r.length);
    ok("1 本 200KB 以内", JSON.stringify(r.a).length < 200 * 1024, JSON.stringify(r.a).length);
    const g = new G.GhostPlayer({ a: r.a, ms: (p.finishTime || 0) * 1000 });
    ok("再生できる", g.ok === true);
    g.at(0.5);
    const 半 = { x: g.x, z: g.z };
    g.at((p.finishTime || 10) * 0.5);
    ok("**途中の 位置が 出発と 違う**（ちゃんと 動いている）",
      Math.hypot(g.x - 半.x, g.z - 半.z) > 3, [半, { x: g.x, z: g.z }]);
    /* 進み → 時刻 が 単調 */
    let 単調 = true, 前 = -1;
    for (let pr = 0; pr < course.length; pr += course.length / 20) {
      const t = g.timeAt(pr);
      if (t < 0) break;
      if (t < 前) { 単調 = false; break; }
      前 = t;
    }
    ok("進むほど 時刻も 増える", 単調);
    g.at((p.finishTime || 10) + 1);
    ok("走り終えたら 消える", g.done === true);
  }

  /* ── 画面 ── */
  const { chromium } = require("playwright");
  const nick = "gh" + Date.now().toString(36).slice(-6);
  const reg = await (await fetch(BASE + "/api/auth/register", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gradePrefix: "H1", nickname: nick, password: "DevGh#2026a", tosAccepted: true, tosVersion: "1" })
  })).json();
  const br = await chromium.launch({
    args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader", "--disable-dev-shm-usage"]
  });
  const errs = [];
  try {
    const ctx = await br.newContext({ viewport: { width: 1180, height: 800 } });
    const pg = await ctx.newPage();
    pg.on("pageerror", (e) => errs.push(String(e && e.message || e)));
    await ctx.addInitScript((tk) => {
      try {
        localStorage.setItem("app.auth.token.v1", tk);
        localStorage.setItem("app.auth.expiresAt.v1", String(Date.now() + 86400000));
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

    節("⑥ 画面");
    const 設定 = await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const d = r.querySelector(".vs-lb-settings"); if (d) d.open = true;
      return {
        切替: Array.from(r.querySelectorAll(".vs-lb-toggle")).map((e) => e.textContent),
        消す: !!Array.from(r.querySelectorAll(".vs-btn")).filter((e) => /記録を 消す/.test(e.textContent))[0],
        入: window.VocabuSurvive.__app.shell.get("lobby").ghostOn
      };
    });
    ok("設定に「ベストと 走る」が ある", 設定.切替.some((t) => /ベストと 走る/.test(t)), 設定.切替);
    ok("記録を 消す ボタンが ある", 設定.消す, 設定.消す);
    ok("既定は 入", 設定.入 === true, 設定.入);

    await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const lb = window.VocabuSurvive.__app.shell.get("lobby");
      lb.courseIndex = 1; lb.botCount = 0; lb.mode = "timeattack"; lb._render();
      r.querySelector(".vs-lb-start").click();
    });
    await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "match", null, { timeout: 30000, polling: 250 });
    /* ★ 初めての 人には あそび方の 札が 出て、**合図が 止まる**。
       閉じないと いつまでも 走り出さない（0 秒 のまま だった）。 */
    await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const b = r.querySelector(".vs-help .vs-btn"); if (b) b.click();
    });
    await 待つ(6000);
    const 走り = await pg.evaluate(() => {
      const m = window.VocabuSurvive.__app.shell.get("match");
      return { 点: m.ghostRec ? m.ghostRec.length : -1, 幽霊: !!m.ghost, 時: m.sim.raceTime,
        相: m.sim.phase, 走: m.running, 助: !!(m.help && m.help.el && m.help.el.getAttribute("data-on")) };
    });
    console.log("     " + 走り.時.toFixed(1) + " 秒で 点 " + 走り.点);
    ok("走ると 点が 溜まる", 走り.点 > 5, 走り);
    ok("1 回目は ゴーストが 居ない", 走り.幽霊 === false, 走り.幽霊);
    ok("点の 数は 秒 × 10 くらい", Math.abs(走り.点 - 走り.時 * 10) < 走り.時 * 3 + 6, 走り);

    /* 覚えさせて、2 回目に 出るか */
    await pg.evaluate(async () => {
      const m = window.VocabuSurvive.__app.shell.get("match");
      const mod = await import("/assets/vocabu-survive/data/ghost.js");
      await mod.saveGhost(m.course.id, m.ghostRec.a.slice(), 20000);
    });
    await pg.evaluate(() => {
      const app = window.VocabuSurvive.__app;
      const m = app.shell.get("match"); if (m && m.quiz && m.quiz.close) m.quiz.close();
      return app.goLobby();
    });
    await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "lobby", null, { timeout: 20000, polling: 250 });
    await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      r.querySelector(".vs-lb-start").click();
    });
    await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "match", null, { timeout: 30000, polling: 250 });
    await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const b = r.querySelector(".vs-help .vs-btn"); if (b) b.click();
    });
    await pg.waitForFunction(() => !!window.VocabuSurvive.__app.shell.get("match").ghost,
      null, { timeout: 15000, polling: 200 }).catch(() => {});
    await 待つ(4000);
    const 二回目 = await pg.evaluate(() => {
      const m = window.VocabuSurvive.__app.shell.get("match");
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const el = r.querySelector(".vs-hud-ghost");
      return {
        幽霊: !!m.ghost, 見た目: !!m.ghostVis, done: m.ghost ? m.ghost.done : null,
        位置: m.ghost ? [Math.round(m.ghost.x * 10) / 10, Math.round(m.ghost.z * 10) / 10] : null,
        差: m._ghostDelta,
        帯: el ? { 出: !el.classList.contains("vs-hide"), 文: el.textContent } : null
      };
    });
    ok("**2 回目は ゴーストが 出る**", 二回目.幽霊 === true, 二回目);
    ok("見た目も できている", 二回目.見た目 === true);
    ok("ゴーストが 動いている", 二回目.位置 && (二回目.位置[0] !== 0 || 二回目.位置[1] !== 0), 二回目.位置);
    ok("差が 出る", typeof 二回目.差 === "number", 二回目.差);
    ok("HUD に 帯が 出る", 二回目.帯 && 二回目.帯.出, 二回目.帯);
    ok("帯に「ベスト ±秒」と 出る", 二回目.帯 && /^ベスト [+-]\d+\.\d$/.test(二回目.帯.文), 二回目.帯);

    /* ゴーストは 走りに 触らない */
    const 触らない = await pg.evaluate(() => {
      const m = window.VocabuSurvive.__app.shell.get("match");
      return { 人: m.sim.players.length, 当たり: m.course.world.solids.some((s) => s.ghost === true) };
    });
    ok("**人数に 入らない**（ぶつからない・順位に 入らない）", 触らない.人 === 1, 触らない.人);

    節("⑦ 消す");
    await pg.evaluate(() => {
      const app = window.VocabuSurvive.__app;
      const m = app.shell.get("match"); if (m && m.quiz && m.quiz.close) m.quiz.close();
      return app.goLobby();
    });
    await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "lobby", null, { timeout: 20000, polling: 250 });
    await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const d = r.querySelector(".vs-lb-settings"); if (d) d.open = true;
      Array.from(r.querySelectorAll(".vs-btn")).filter((e) => /記録を 消す/.test(e.textContent))[0].click();
    });
    await 待つ(900);
    const 消えた = await pg.evaluate(async () => {
      const mod = await import("/assets/vocabu-survive/data/ghost.js");
      const lb = window.VocabuSurvive.__app.shell.get("lobby");
      const d = await mod.loadGhost(window.VQ_SURVIVE_COURSES ? "c02" : "c02");
      return { 無: d === null, 文: null };
    });
    ok("消すと 無くなる", 消えた.無 === true, 消えた);

    節("⑧ 例外");
    ok("画面の 例外 0 件", errs.length === 0, errs.slice(0, 4));
  } finally {
    await br.close().catch(() => {});
  }
  console.log("\n────────────────────────────────");
  console.log("  ok " + pass + " / NG " + fail);
  if (bad.length) console.log("  落ちたもの:\n   - " + bad.join("\n   - "));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
