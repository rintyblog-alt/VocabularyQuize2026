#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqsurvivecup.cjs — 勝ち抜き（遊び方 6 つ目）の 検査。

     ① 残る 人数の 決まり（最後まで 2 人 以上・決勝は 1 人）
     ② **1 本の 中身は レースと 同じ**（走りの 決まりを 変えていない）
     ③ 3 本の コースは 同じ 難しさから・だぶらない
     ④ 顔ぶれを 次の 本へ 連れて いく（名前・色・帽子・腕）
     ⑤ 落ちた 人は 次に 出ない
     ⑥ 画面（ロビーで 選べる／結果に ラウンドが 出る／次へ 進める）
     ⑦ 対戦では 選べない

   使い方: 先に  cd server && ./dev-local.sh echo 8795
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const path = require("path");
const 道 = (p) => "file://" + path.join(__dirname, "client/assets/vocabu-survive", p);
const BASE = process.env.VQ_API || "http://127.0.0.1:8795";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ok   " + n); }
  else { fail++; bad.push(n); console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 300) : "")); }
};
const 節 = (t) => console.log("\n══ " + t + " ══");
const 待つ = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const { cupKeep, CUP_ROUNDS, MODE, Sim, PHASE } = await import(道("game/sim.js"));
  const { COURSE_BY_ID, COURSES, tierOf } = await import(道("data/courses.js"));
  const { buildCourse } = await import(道("game/course.js"));
  const { Player, STEP } = await import(道("game/player.js"));
  const { Bot } = await import(道("game/bot.js"));
  const fs = require("fs");

  節("① 残る 人数");
  ok("3 本 立て", CUP_ROUNDS === 3, CUP_ROUNDS);
  ok("8 人 → 5 人", cupKeep(8, 1, 3) === 5, cupKeep(8, 1, 3));
  ok("5 人 → 3 人", cupKeep(5, 2, 3) === 3, cupKeep(5, 2, 3));
  ok("決勝は 1 人", cupKeep(3, 3, 3) === 1, cupKeep(3, 3, 3));
  ok("**途中で 1 人に しない**", cupKeep(2, 1, 3) === 2 && cupKeep(3, 1, 3) === 2,
    [cupKeep(2, 1, 3), cupKeep(3, 1, 3)]);
  ok("必ず 減る か 同じ（増えない）",
    [8, 7, 6, 5, 4, 3, 2].every((n) => cupKeep(n, 1, 3) <= n), [8, 7, 6, 5, 4, 3, 2].map((n) => cupKeep(n, 1, 3)));
  ok("遊び方の 名前が ある", MODE.CUP === "cup", MODE.CUP);

  節("② 1 本の 中身は レースと 同じ");
  const 走る = (mode) => {
    const course = buildCourse(COURSE_BY_ID.c05);
    /* match.js と 同じ: cup は Sim へ race として 渡す */
    const sim = new Sim(course, { timeLimit: 90, countdown: 0.1, mode: mode === "cup" ? "race" : mode });
    sim.autoGate = 1.0;
    const ps = [], bots = [];
    for (let i = 0; i < 5; i++) {
      const p = new Player({ id: "p" + i, name: "P" + i, colorIndex: i });
      sim.add(p); ps.push(p);
      bots.push(new Bot(p, course, { level: ["perfect", "hard", "normal", "easy", "hard"][i], seed: 300 + i, lane: (i / 4) * 2 - 1 }));
    }
    sim.localId = ps[0].id;
    sim.start();
    const inputs = new Map();
    for (let 歩 = 0; 歩 < Math.round(90 / STEP) && sim.phase !== PHASE.FINISHED; 歩++) {
      for (const b of bots) inputs.set(b.p.id, b.decide(sim.time));
      sim.step(inputs);
    }
    return { 順: sim.standings().map((r) => [r.id, r.rank, Math.round((r.finishTime || 0) * 1e3)]),
      位置: ps.map((p) => [Math.round(p.x * 1e4), Math.round(p.z * 1e4)]) };
  };
  const レース = 走る("race"), 勝ち抜き = 走る("cup");
  ok("**軌跡が 1 ミリも 変わらない**", JSON.stringify(レース.位置) === JSON.stringify(勝ち抜き.位置));
  ok("順位も 同じ", JSON.stringify(レース.順) === JSON.stringify(勝ち抜き.順), [レース.順[0], 勝ち抜き.順[0]]);
  ok("順位が 1 から 付く", レース.順[0][1] === 1, レース.順[0]);

  節("③ 3 本の コース");
  /* lobby.js と 同じ 決め方を そのまま 真似る */
  const コース選び = (courseIndex) => {
    const c = COURSES[courseIndex];
    const t = tierOf(courseIndex);
    const 候補 = [];
    for (let i = t.from; i <= t.to && i < COURSES.length; i++) 候補.push(COURSES[i].id);
    const courses = [c.id];
    let 種 = ((courseIndex + 1) * 2654435761) >>> 0;
    let 守 = 0;
    while (courses.length < CUP_ROUNDS && 守++ < 200) {
      種 = (種 * 1664525 + 1013904223) >>> 0;
      const id = 候補[種 % Math.max(1, 候補.length)];
      if (id && courses.indexOf(id) < 0) courses.push(id);
    }
    while (courses.length < CUP_ROUNDS) courses.push(c.id);
    return { courses, 候補 };
  };
  let 全部だぶらず = true, 全部同じ段 = true, 全部3本 = true, ぶれ = 0;
  for (let i = 0; i < COURSES.length; i++) {
    const { courses, 候補 } = コース選び(i);
    if (courses.length !== CUP_ROUNDS) 全部3本 = false;
    if (new Set(courses).size !== CUP_ROUNDS && 候補.length >= CUP_ROUNDS) 全部だぶらず = false;
    if (!courses.every((id) => 候補.indexOf(id) >= 0)) 全部同じ段 = false;
    if (JSON.stringify(コース選び(i).courses) !== JSON.stringify(courses)) ぶれ++;
  }
  ok("どのコースから 始めても 3 本 決まる", 全部3本);
  ok("段に 余裕が あれば だぶらない", 全部だぶらず);
  ok("**3 本とも 同じ 難しさの 段から**", 全部同じ段);
  ok("何度 選んでも 同じ 3 本", ぶれ === 0, ぶれ);
  ok("1 本目は いま 選んでいる コース", コース選び(7).courses[0] === COURSES[7].id, コース選び(7).courses);

  節("④⑤ 顔ぶれの 引き継ぎ（画面で 通す）");
  const { chromium } = require("playwright");
  const nick = "cp" + Date.now().toString(36).slice(-6);
  const reg = await (await fetch(BASE + "/api/auth/register", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gradePrefix: "H1", nickname: nick, password: "DevCp#2026a", tosAccepted: true, tosVersion: "1" })
  })).json();
  const b = await chromium.launch({
    args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader", "--disable-dev-shm-usage"]
  });
  const errs = [];
  try {
    const ctx = await b.newContext({ viewport: { width: 1180, height: 800 } });
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
    /* ★ 待ちは **時間で 見る**（polling）。既定の rAF だと、
       描きが 詰まっている 間 一度も 評価されない ことが ある。
       検査を 何本も 並べて 走らせると ここで 空振りしていた。 */
    await pg.waitForFunction(() => !!(window.VocabuSurvive && window.VocabuSurvive.state().opened),
      null, { timeout: 45000, polling: 250 });
    await pg.waitForFunction(() => {
      const h = document.querySelector("#appSurvivePage .vq-survive-host");
      return !!(h && h.shadowRoot && h.shadowRoot.querySelector(".vs-load-start"));
    }, null, { timeout: 45000, polling: 250 });
    await pg.evaluate(() => document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot.querySelector(".vs-load-start").click());
    await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "lobby", null, { timeout: 25000 });

    節("⑥ ロビーで 選べる");
    const 遊び方 = await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      return Array.from(r.querySelectorAll(".vs-lb-mode")).map((e) => ({
        k: e.getAttribute("data-mode"),
        l: (e.querySelector(".vs-lb-mode-l") || {}).textContent,
        止: e.disabled
      }));
    });
    ok("遊び方が 6 つ", 遊び方.length === 6, 遊び方.map((m) => m.k));
    ok("勝ち抜きが ある", 遊び方.some((m) => m.k === "cup" && m.l === "勝ち抜き"), 遊び方);
    ok("ひとりの ときは 押せる", !遊び方.filter((m) => m.k === "cup")[0].止);

    /* 勝ち抜きで 始める */
    await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const lb = window.VocabuSurvive.__app.shell.get("lobby");
      lb.courseIndex = 1; lb.mode = "cup"; lb.botCount = 7; lb._render();
      r.querySelector(".vs-lb-start").click();
    });
    await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "match", null, { timeout: 30000 });
    await 待つ(1200);
    const 一本目 = await pg.evaluate(() => {
      const m = window.VocabuSurvive.__app.shell.get("match");
      return {
        cup: m.cup, 人: m.sim.players.length, mode: m.sim.mode, course: m.course.id,
        顔: m.sim.players.map((p) => ({ id: p.id, name: p.name, c: p.colorIndex, hat: p.hat }))
      };
    });
    ok("勝ち抜きの 一式が 渡る", 一本目.cup && 一本目.cup.round === 1 && 一本目.cup.rounds === 3, 一本目.cup);
    ok("8 人 いる", 一本目.人 === 8, 一本目.人);
    ok("**Sim の 中は レース**", 一本目.mode === "race", 一本目.mode);
    ok("3 本の コースを 持っている", 一本目.cup.courses.length === 3, 一本目.cup);

    /* 1 本目を 終わらせて 結果を 見る（走らせずに 決着を 作る） */
    const 結果 = await pg.evaluate(() => {
      const m = window.VocabuSurvive.__app.shell.get("match");
      /* 順位を 決め打ちで 付けて 終わらせる。**画面の 出しかたを 見る**のが 目的。 */
      /* ★ 順位は **だぶらせない**。実際の 試合では ゴール順で 1 人 1 つ。
         だぶらせると 並べ替えの 順が 決まらず、検査自体が 当てに ならない。 */
      const ps = m.sim.players.slice();
      const 自分 = ps.indexOf(m.local);
      /* 自分を 3 番目に 置いて から 上から 1,2,3… と 振る */
      ps.splice(自分, 1); ps.splice(2, 0, m.local);
      for (let i = 0; i < ps.length; i++) {
        ps[i].finished = true; ps[i].rank = i + 1; ps[i].finishTime = 20 + i;
        ps[i].progress = m.course.length;
      }
      const rows = m.sim.standings().map((r) => Object.assign({}, r, { me: r.id === m.local.id }));
      return m._cupResult(rows);
    });
    ok("残る 人数が 出る", 結果 && 結果.keep === 5, 結果 && 結果.keep);
    ok("残る 顔ぶれが 5 人", 結果.survivors.length === 5, 結果.survivors.length);
    ok("落ちる 顔ぶれが 3 人", 結果.out.length === 3, 結果.out.length);
    ok("**順位の 順に 残る**", 結果.survivors.every((r, i) => r.rank === i + 1), 結果.survivors.map((r) => r.rank));
    ok("残る 人と 落ちる 人が だぶらない",
      !結果.survivors.some((a) => 結果.out.some((b) => b.id === a.id)));
    ok("3 位の 自分は 残る", 結果.meAlive === true, 結果.meAlive);
    ok("最後の 本では ない", 結果.last === false, 結果.last);
    ok("次の 本の 一式が ある", !!結果.next, 結果.next);
    ok("次は 2 本目", 結果.next.cup.round === 2, 結果.next.cup);
    ok("次の コースは 2 本目の もの", 結果.next.courseId === 一本目.cup.courses[1],
      [結果.next.courseId, 一本目.cup.courses]);
    ok("**次の ボットは 4 人**（自分を 抜いた 残り）", 結果.next.bots === 4, 結果.next.bots);
    ok("名前・色・帽子・腕を 連れて いく",
      結果.next.cup.bots.every((x) => x.name && typeof x.colorIndex === "number" && x.hat && x.level && x.seed),
      結果.next.cup.bots[0]);
    const 落ちたid = new Set(結果.out.map((r) => r.id));
    ok("**落ちた 人は 次に 出ない**", !結果.next.cup.bots.some((x) => 落ちたid.has(x.id)),
      結果.next.cup.bots.map((x) => x.id).concat([...落ちたid]));

    /* 自分が 落ちる 側だと 次が 無い */
    const 敗退 = await pg.evaluate(() => {
      const m = window.VocabuSurvive.__app.shell.get("match");
      /* 自分を いちばん 下へ 動かして 振り直す（だぶらせない） */
      const ps2 = m.sim.players.filter((p) => p !== m.local).concat([m.local]);
      for (let i = 0; i < ps2.length; i++) ps2[i].rank = i + 1;
      const rows = m.sim.standings().map((r) => Object.assign({}, r, { me: r.id === m.local.id }));
      return m._cupResult(rows);
    });
    ok("自分が 8 位なら 敗退", 敗退.meAlive === false, 敗退.meAlive);
    ok("敗退なら 次の 一式は 無い", 敗退.next === null, 敗退.next);

    /* 結果の 画面に 出るか */
    const 画面 = await pg.evaluate((cup) => {
      const m = window.VocabuSurvive.__app.shell.get("match");
      m.result.show({
        rank: 3, total: 8, finished: true, time: 22, correct: 2, wrong: 1, respawns: 0,
        xp: 100, best: 0, newBest: false, mode: "cup", standings: [], courseName: "検査",
        splits: [], bestSplits: [], cup
      });
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const el = r.querySelector(".vs-res-cup");
      return {
        出た: !!el && !el.classList.contains("vs-hide"),
        題: (r.querySelector(".vs-res-title") || {}).textContent,
        副: (r.querySelector(".vs-res-sub") || {}).textContent,
        丸: Array.from(r.querySelectorAll(".vs-res-cupdot")).map((e) => e.getAttribute("data-st")),
        次ボタン: !r.querySelector(".vs-res-btns .vs-btn").classList.contains("vs-hide"),
        次文: r.querySelector(".vs-res-btns .vs-btn").textContent
      };
    }, 結果);
    ok("結果に 勝ち抜きの 欄が 出る", 画面.出た, 画面);
    ok("「勝ち残り！」と 出る", 画面.題 === "勝ち残り！", 画面.題);
    ok("ラウンドが 出る", /ラウンド 1 \/ 3/.test(画面.副), 画面.副);
    ok("人数の 変わりが 出る", /8人 → 5人/.test(画面.副), 画面.副);
    ok("3 つの 丸が 出る", 画面.丸.length === 3 && 画面.丸[0] === "now", 画面.丸);
    ok("「次の ラウンドへ」が 出る", 画面.次ボタン && /次の ラウンドへ/.test(画面.次文), 画面);

    /* 実際に 次の 本へ 進む */
    await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      r.querySelector(".vs-res-btns .vs-btn").click();
    });
    await 待つ(2500);
    const 二本目 = await pg.evaluate(() => {
      const m = window.VocabuSurvive.__app.shell.get("match");
      return { round: m.cup && m.cup.round, 人: m.sim.players.length, course: m.course.id,
        顔: m.sim.players.map((p) => ({ id: p.id, name: p.name, c: p.colorIndex })) };
    });
    ok("**2 本目が 始まる**", 二本目.round === 2, 二本目);
    ok("5 人に 減っている", 二本目.人 === 5, 二本目.人);
    ok("コースが 変わる", 二本目.course === 一本目.cup.courses[1], [二本目.course, 一本目.cup.courses]);
    const 前の顔 = new Map(一本目.顔.map((x) => [x.id, x]));
    ok("**同じ 顔ぶれ**（名前も 色も 変わらない）",
      二本目.顔.filter((x) => x.id !== "me").every((x) => {
        const 前 = 前の顔.get(x.id);
        return 前 && 前.name === x.name && 前.c === x.c;
      }), 二本目.顔);
    ok("落ちた 人は 出ていない", !二本目.顔.some((x) => 落ちたid.has(x.id)), 二本目.顔.map((x) => x.id));

    節("⑦ 対戦では 選べない");
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
    await 待つ(600);
    const 部屋で = await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const lb = window.VocabuSurvive.__app.shell.get("lobby");
      return {
        部屋: lb.roomId, mode: lb.mode,
        止: Array.from(r.querySelectorAll(".vs-lb-mode")).map((e) => [e.getAttribute("data-mode"), e.disabled])
      };
    });
    ok("部屋に 入った", /^[A-Z0-9]{6}$/.test(String(部屋で.部屋 || "")), 部屋で.部屋);
    ok("**勝ち抜きが 押せなく なる**", 部屋で.止.filter((x) => x[0] === "cup")[0][1] === true, 部屋で.止);
    ok("レースは 押せる", 部屋で.止.filter((x) => x[0] === "race")[0][1] === false, 部屋で.止);
    ok("選んでいた 勝ち抜きは レースへ 戻る", 部屋で.mode === "race", 部屋で.mode);

    節("⑧ 画面が 落ちていない");
    ok("画面の 例外 0 件", errs.length === 0, errs.slice(0, 4));
  } finally {
    await b.close().catch(() => {});
  }
  console.log("\n────────────────────────────────");
  console.log("  ok " + pass + " / NG " + fail);
  if (bad.length) console.log("  落ちたもの:\n   - " + bad.join("\n   - "));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
