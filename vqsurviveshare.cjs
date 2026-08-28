#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqsurviveshare.cjs — 自作コースを **対戦で 配る**。

   これまでは「相手が 持っていない」ので 対戦で 使えなかった。
   コースは 数キロバイトなので、**合言葉ごと 部屋に 配れば** 使える。

     ① 部屋主が えらぶと 部屋に 入る
     ② 部屋の 知らせには **名前だけ**（合言葉は 重いので 始める ときに 1 回）
     ③ 部屋主で なければ 変えられない
     ④ 変な 合言葉は 受けない
     ⑤ **2 枚の 画面が 同じ コースで 走る**
     ⑥ 長さも 自作の ぶんが 送られる（検算が ずれない）

   使い方: 先に  cd server && ./dev-local.sh echo 8795
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const path = require("path");
const 道 = (p) => "file://" + path.join(__dirname, "client/assets/vocabu-survive", p);
const BASE = process.env.VQ_API || "http://127.0.0.1:8795";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const WSBASE = BASE.replace(/^http/, "ws");

let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ok   " + n); }
  else { fail++; bad.push(n); console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 300) : "")); }
};
const 節 = (t) => console.log("\n══ " + t + " ══");
const 待つ = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, p, body, token) {
  const h = { "Content-Type": "application/json" };
  if (token) h.Authorization = "Bearer " + token;
  const r = await fetch(BASE + p, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text();
  let d = null; try { d = t ? JSON.parse(t) : null; } catch (e) { d = {}; }
  return { status: r.status, data: d || {} };
}
async function 人を作る(i) {
  const nick = "sh" + Date.now().toString(36).slice(-5) + i;
  const r = await api("POST", "/api/auth/register",
    { gradePrefix: "H1", nickname: nick, password: "DevSh#2026a", tosAccepted: true, tosVersion: "1" });
  if (!r.data.token) throw new Error("検証アカウントを作れません");
  return { token: r.data.token, name: nick };
}
function つなぐ(url, token) {
  return new Promise((res) => {
    const ws = new WebSocket(url + "?token=" + encodeURIComponent(token));
    const box = { ws, msgs: [], you: "" };
    const to = setTimeout(() => res(box), 4000);
    ws.onmessage = (ev) => {
      let m = null; try { m = JSON.parse(String(ev.data)); } catch (e) { return; }
      box.msgs.push(m);
      if (m.t === "welcome") { box.you = m.you; clearTimeout(to); res(box); }
    };
    ws.onerror = () => {};
  });
}

(async () => {
  const M = await import(道("data/mycourse.js"));
  const { buildCourse } = await import(道("game/course.js"));

  const c = M.newCourse("my:sh1", "配る コース");
  c.sections.splice(3, 0, { t: "stones", count: 5, gap: 4, spread: 1.4, bob: 0.5 });
  const code = M.exportCode(c);
  const 長 = Math.round(buildCourse(M.toDef(c)).length);
  console.log("     合言葉 " + code.length + " 文字 / 長さ " + 長 + "m\n");

  const A = await 人を作る(1), B = await 人を作る(2);
  const room = (await api("POST", "/api/survive/room", { courseId: "c01" }, A.token)).data;
  const ws = WSBASE + "/ws/survive/" + room.roomId;
  const a = await つなぐ(ws, A.token), b = await つなぐ(ws, B.token);
  await 待つ(300);

  節("① 部屋主が 配る");
  a.ws.send(JSON.stringify({ t: "course", id: c.id, code, name: c.name }));
  await 待つ(400);
  const 部屋 = (b.msgs.filter((m) => m.t === "room").pop() || {}).room;
  ok("相手に 届く", !!部屋, 部屋);
  ok("コースの 番号が 変わる", 部屋 && 部屋.courseId === c.id, 部屋 && 部屋.courseId);
  ok("名前が 出る", 部屋 && 部屋.courseName === "配る コース", 部屋 && 部屋.courseName);
  ok("自作コースが ある と 分かる", 部屋 && 部屋.hasCourse === 1, 部屋 && 部屋.hasCourse);
  ok("**合言葉そのものは 部屋の 知らせに 載せない**（毎回 3KB 配らない）",
    部屋 && 部屋.courseCode === undefined, 部屋 && String(部屋.courseCode || "").length);

  節("② 部屋主で なければ 変えられない");
  b.ws.send(JSON.stringify({ t: "course", id: "c30", code: "", name: "よこどり" }));
  await 待つ(400);
  const 部屋2 = (a.msgs.filter((m) => m.t === "room").pop() || {}).room;
  ok("変わらない", 部屋2 && 部屋2.courseId === c.id, 部屋2 && 部屋2.courseId);

  節("③ 変な 合言葉は 受けない");
  for (const 変 of ["ただの 文字", "VS1", "<script>", "A".repeat(30000)]) {
    a.ws.send(JSON.stringify({ t: "course", id: "my:x", code: 変, name: "変" }));
    await 待つ(250);
    const r = (b.msgs.filter((m) => m.t === "room").pop() || {}).room;
    ok("「" + String(変).slice(0, 10) + "」は 自作として 受けない", r && r.hasCourse === 0, r && r.hasCourse);
  }
  /* 戻す */
  a.ws.send(JSON.stringify({ t: "course", id: c.id, code, name: c.name }));
  await 待つ(350);

  節("④ 始めると 合言葉が 1 回だけ 配られる");
  a.ws.send(JSON.stringify({ t: "start", length: 長 }));
  await 待つ(700);
  const goA = a.msgs.filter((m) => m.t === "go").pop();
  const goB = b.msgs.filter((m) => m.t === "go").pop();
  ok("2 人とも 合図を 受ける", !!goA && !!goB);
  ok("合言葉が 付いてくる", goB && goB.courseCode === code, goB && String(goB.courseCode || "").slice(0, 20));
  ok("名前も 付いてくる", goB && goB.courseName === "配る コース", goB && goB.courseName);
  ok("2 人に 同じ もの", JSON.stringify(goA.courseCode) === JSON.stringify(goB.courseCode));

  節("⑤ 受け取った 側が 同じ コースを 組み立てられる");
  const 戻 = M.importCode(goB.courseCode, goB.courseId);
  ok("読める", !!戻, 戻);
  const b2 = buildCourse(M.toDef(戻));
  ok("**長さが 一致**", Math.round(b2.length) === 長, [Math.round(b2.length), 長]);
  ok("門の 数も 一致", b2.gates.length === buildCourse(M.toDef(c)).gates.length, b2.gates.length);
  ok("中間地点も 一致", b2.checkpoints.length === buildCourse(M.toDef(c)).checkpoints.length);

  for (const w of [a, b]) { try { w.ws.close(); } catch (e) {} }

  /* ── 画面 2 枚で 実際に ── */
  節("⑥ 画面 2 枚で 同じ コースを 走る");
  const { chromium } = require("playwright");
  const br = await chromium.launch({
    args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader", "--disable-dev-shm-usage"]
  });
  const errs = [];
  try {
    const 開く = async (who) => {
      const ctx = await br.newContext({ viewport: { width: 1100, height: 780 } });
      const pg = await ctx.newPage();
      pg.on("pageerror", (e) => errs.push(who.name + ": " + String(e && e.message || e)));
      await ctx.addInitScript((tk) => {
        try {
          localStorage.setItem("app.auth.token.v1", tk);
          localStorage.setItem("app.auth.expiresAt.v1", String(Date.now() + 86400000));
          localStorage.setItem("vq.survive.help.v1", "1");
        } catch (e) {}
      }, who.token);
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
      return { ctx, pg };
    };
    const A2 = await 人を作る(3), B2 = await 人を作る(4);
    const x = await 開く(A2), y = await 開く(B2);

    /* 主が コースを 作って 保存 */
    await x.pg.evaluate(async (sec) => {
      const mod = await import("/assets/vocabu-survive/data/mycourse.js");
      const c2 = mod.newCourse("my:room1", "部屋で 配る コース");
      c2.sections = sec;
      await mod.saveMyCourse(c2, 1);
      const lb = window.VocabuSurvive.__app.shell.get("lobby");
      await lb._loadMine();
    }, c.sections);
    await 待つ(500);

    /* 部屋を 作る → 入る */
    await x.pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      r.querySelector(".vs-lb-onrow .vs-btn").click();
    });
    await x.pg.waitForFunction(() => {
      const lb = window.VocabuSurvive.__app.shell.get("lobby");
      return lb && lb.roomId && lb.net && lb.net.connected;
    }, null, { timeout: 25000, polling: 250 });
    const code2 = await x.pg.evaluate(() => window.VocabuSurvive.__app.shell.get("lobby").roomId);
    await y.pg.evaluate((id) => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      r.querySelector(".vs-lb-code").value = id;
      const bs = r.querySelectorAll(".vs-lb-onrow .vs-btn");
      bs[bs.length - 1].click();
    }, code2);
    await 待つ(1500);

    /* 主が 自作コースを えらぶ */
    const 押 = await x.pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const b2 = r.querySelector(".vs-lb-mineb");
      if (!b2 || b2.disabled) return { だめ: true, 止: b2 ? b2.disabled : null };
      b2.click();
      return { だめ: false };
    });
    ok("部屋主は 自作コースを 押せる", !押.だめ, 押);
    await 待つ(900);
    const 相手 = await y.pg.evaluate(() => {
      const lb = window.VocabuSurvive.__app.shell.get("lobby");
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const b2 = r.querySelector(".vs-lb-mineb");
      return { 名: lb._roomCourseName, 有: lb._roomHasCourse, 止: b2 ? b2.disabled : null };
    });
    ok("相手にも 名前が 届く", /部屋で 配る/.test(String(相手.名)), 相手);
    ok("相手は 押せない（部屋主だけ）", 相手.止 !== false, 相手);

    /* 始める */
    await x.pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      r.querySelector(".vs-lb-start").click();
    });
    for (const p2 of [x, y]) {
      await p2.pg.waitForFunction(() => window.VocabuSurvive.state().screen === "match",
        null, { timeout: 30000, polling: 250 });
    }
    await 待つ(1500);
    const 双 = await Promise.all([x, y].map((p2) => p2.pg.evaluate(() => {
      const m = window.VocabuSurvive.__app.shell.get("match");
      return { id: m.course.id, 名: m.course.name, 長: Math.round(m.course.length),
        門: m.course.gates.length, 中: m.course.checkpoints.length, 人: m.sim.players.length };
    })));
    ok("**2 枚とも 自作コース**", 双.every((v) => /^my:/.test(v.id)), 双);
    ok("**長さが 同じ**", 双[0].長 === 双[1].長, 双.map((v) => v.長));
    ok("門の 数が 同じ", 双[0].門 === 双[1].門, 双.map((v) => v.門));
    ok("中間地点の 数が 同じ", 双[0].中 === 双[1].中, 双.map((v) => v.中));
    ok("名前も 同じ", 双[0].名 === 双[1].名, 双.map((v) => v.名));
    ok("2 人 いる", 双.every((v) => v.人 === 2), 双.map((v) => v.人));
    ok("画面の 例外 0 件", errs.length === 0, errs.slice(0, 3));
  } finally {
    await br.close().catch(() => {});
  }

  console.log("\n────────────────────────────────");
  console.log("  ok " + pass + " / NG " + fail);
  if (bad.length) console.log("  落ちたもの:\n   - " + bad.join("\n   - "));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
