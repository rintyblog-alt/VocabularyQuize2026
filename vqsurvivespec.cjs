#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqsurvivespec.cjs — 観戦（脱落しても 最後まで 見られる）の 検査。

   これまでは サバイバルで 落ちた 瞬間に 結果が 出て、
   **誰が 勝ったのか 分からないまま 終わって いた。**

     ① 脱落しても すぐ 結果に ならない
     ② カメラが 残っている 人を 追う
     ③ 隣の 人へ 移れる
     ④ 見ている 人が 落ちたら 自動で 次へ
     ⑤ 全員 いなくなったら 結果へ
     ⑥ 「結果を 見る」で いつでも 抜けられる
     ⑦ **記録は 落ちた その場で 残す**（見ている 途中で 抜けても 消えない）

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
  節("① 作り");
  const mt = fs.readFileSync("client/assets/vocabu-survive/game/match.js", "utf8");
  ok("脱落で すぐ 結果に しない", /_eliminatedSelf\(\)/.test(mt) && !/e\.p === this\.local\) \{ this\.hud\.big\("脱落…", "goal"\); this\._finish\(\)/.test(mt));
  ok("観戦の 出入りが ある", /_spectateStep/.test(mt) && /_spectateTick/.test(mt));
  ok("記録は 落ちた 場で 残す", /_saveSelf\(\);\s*\n\s*const 残り/.test(mt));
  ok("二重に 残さない", /if \(this\._saved\) return;/.test(mt));
  const hd = fs.readFileSync("client/assets/vocabu-survive/ui/hud.js", "utf8");
  ok("HUD に 観戦の 帯が ある", /vs-spec/.test(hd));
  ok("「結果を 見る」が ある", /結果を 見る/.test(hd));

  const { chromium } = require("playwright");
  const nick = "sp" + Date.now().toString(36).slice(-6);
  const reg = await (await fetch(BASE + "/api/auth/register", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gradePrefix: "H1", nickname: nick, password: "DevSp#2026a", tosAccepted: true, tosVersion: "1" })
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

    節("② サバイバルで 落ちる");
    await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const lb = window.VocabuSurvive.__app.shell.get("lobby");
      lb.courseIndex = 0; lb.botCount = 5; lb.mode = "survival"; lb._render();
      r.querySelector(".vs-lb-start").click();
    });
    await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "match", null, { timeout: 30000, polling: 250 });
    await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const b = r.querySelector(".vs-help .vs-btn"); if (b) b.click();
    });
    await pg.waitForFunction(() => window.VocabuSurvive.__app.shell.get("match").sim.phase === "running",
      null, { timeout: 20000, polling: 200 });
    /* 自分の 残機を 0 に して 落とす（実際に 落ちるのを 待つと 何分も かかる） */
    const 落ちた = await pg.evaluate(async () => {
      const m = window.VocabuSurvive.__app.shell.get("match");
      m.local.lives = 1;
      /* 場外へ 置いて 落とす */
      m.local.y = -60; m.local.vy = -20;
      await new Promise((r) => setTimeout(r, 900));
      return {
        脱落: !!m.local.eliminated, 観戦: !!m.spectate, 結果: !!m._done,
        残: m.sim.players.filter((p) => !p.finished).length
      };
    });
    ok("脱落した", 落ちた.脱落 === true, 落ちた);
    ok("**まだ 結果を 出していない**", 落ちた.結果 === false, 落ちた);
    ok("観戦に 入る", 落ちた.観戦 === true, 落ちた);
    ok("まだ 走っている 人が いる", 落ちた.残 > 0, 落ちた.残);

    const 帯 = await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const el = r.querySelector(".vs-spec");
      return el ? { 出: !el.classList.contains("vs-hide"),
        名: (el.querySelector(".vs-spec-nm") || {}).textContent,
        釦: el.querySelectorAll(".vs-spec-b").length,
        抜: !!el.querySelector(".vs-spec-e") } : null;
    });
    ok("観戦の 帯が 出る", 帯 && 帯.出, 帯);
    ok("誰を 見ているか 出る", 帯 && 帯.名 && 帯.名.length > 0, 帯);
    ok("前後の ボタンが ある", 帯 && 帯.釦 === 2, 帯);
    ok("「結果を 見る」が ある", 帯 && 帯.抜, 帯);

    節("③ カメラが 相手を 追う");
    await 待つ(1200);
    const 追う = await pg.evaluate(() => {
      const m = window.VocabuSurvive.__app.shell.get("match");
      const t = m.sim.players.filter((p) => p.id === m.spectate.id)[0];
      const c = m.cam;
      return { 見: m.spectate.id, 相手: t ? [t.x, t.z] : null,
        目: c && c.target ? [c.target[0], c.target[2]] : (c && c.pos ? [c.pos[0], c.pos[2]] : null),
        自分: [m.local.x, m.local.z] };
    });
    ok("見ている 相手が いる", !!追う.相手, 追う);
    ok("**自分（場外）を 追っていない**",
      追う.相手 && Math.abs(追う.相手[1] - 追う.自分[1]) > 1, 追う);

    節("④ 隣の 人へ 移る");
    const 前の人 = await pg.evaluate(() => window.VocabuSurvive.__app.shell.get("match").spectate.id);
    await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      r.querySelectorAll(".vs-spec-b")[1].click();
    });
    await 待つ(300);
    const 次の人 = await pg.evaluate(() => {
      const m = window.VocabuSurvive.__app.shell.get("match");
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      return { id: m.spectate.id, 名: (r.querySelector(".vs-spec-nm") || {}).textContent,
        生: m.sim.players.filter((p) => !p.finished).length };
    });
    if (次の人.生 > 1) {
      ok("▶ で 隣の 人へ 移る", 次の人.id !== 前の人, [前の人, 次の人.id]);
    } else {
      ok("残り 1 人なら そのまま", 次の人.id === 前の人, 次の人);
    }
    ok("名前も 変わる", 次の人.名 && 次の人.名.length > 0, 次の人);
    /* 戻る */
    await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      r.querySelectorAll(".vs-spec-b")[0].click();
    });
    await 待つ(300);
    const 戻り = await pg.evaluate(() => window.VocabuSurvive.__app.shell.get("match").spectate.id);
    ok("◀ で 戻れる", 戻り === 前の人 || 次の人.生 <= 1, [前の人, 戻り]);

    節("⑤ 見ている 人が 落ちたら 次へ");
    const 自動 = await pg.evaluate(async () => {
      const m = window.VocabuSurvive.__app.shell.get("match");
      const 生 = m.sim.players.filter((p) => !p.finished);
      if (生.length < 2) return { 飛: true };
      const 前 = m.spectate.id;
      const t = 生.filter((p) => p.id === 前)[0];
      if (t) { t.finished = true; t.eliminated = true; t.rank = 9; }
      await new Promise((r) => setTimeout(r, 700));
      return { 前, 後: m.spectate ? m.spectate.id : null, 結果: !!m._done };
    });
    if (自動.飛) console.log("     （残りが 少ないので 飛ばす）");
    else {
      ok("**見ていた 人が 落ちたら 自動で 次へ**", 自動.後 && 自動.後 !== 自動.前, 自動);
      ok("まだ 結果に していない", 自動.結果 === false, 自動);
    }

    節("⑥ 全員 いなく なったら 結果へ");
    const 終い = await pg.evaluate(async () => {
      const m = window.VocabuSurvive.__app.shell.get("match");
      for (const p of m.sim.players) { if (p !== m.local) { p.finished = true; p.eliminated = true; } }
      await new Promise((r) => setTimeout(r, 900));
      return { 結果: !!m._done, 観戦: !!m.spectate };
    });
    ok("**結果へ 移る**", 終い.結果 === true, 終い);
    ok("観戦は 終わる", 終い.観戦 === false, 終い);
    await 待つ(1800);
    const 画面 = await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const el = r.querySelector(".vs-res");
      const sp = r.querySelector(".vs-spec");
      return { 結果: el && el.getAttribute("data-on") === "1",
        題: (r.querySelector(".vs-res-title") || {}).textContent,
        帯: sp ? !sp.classList.contains("vs-hide") : false };
    });
    ok("結果の 画面が 出る", 画面.結果 === true, 画面);
    ok("観戦の 帯は 消える", 画面.帯 === false, 画面);
    ok("「脱落」と 出る", /脱落/.test(String(画面.題)), 画面.題);

    節("⑦ 「結果を 見る」で 抜けられる");
    await pg.evaluate(() => {
      const app = window.VocabuSurvive.__app;
      const m = app.shell.get("match"); if (m && m.result) m.result.hide();
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
    await pg.waitForFunction(() => window.VocabuSurvive.__app.shell.get("match").sim.phase === "running",
      null, { timeout: 20000, polling: 200 });
    const 抜ける = await pg.evaluate(async () => {
      const m = window.VocabuSurvive.__app.shell.get("match");
      m.local.lives = 1; m.local.y = -60; m.local.vy = -20;
      await new Promise((r) => setTimeout(r, 900));
      const 観戦 = !!m.spectate;
      const r2 = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      r2.querySelector(".vs-spec-e").click();
      await new Promise((r) => setTimeout(r, 900));
      return { 観戦, 結果: !!m._done, 後の観戦: !!m.spectate };
    });
    ok("いちど 観戦に 入る", 抜ける.観戦 === true, 抜ける);
    ok("**「結果を 見る」で すぐ 結果へ**", 抜ける.結果 === true, 抜ける);
    ok("観戦は 終わる", 抜ける.後の観戦 === false, 抜ける);

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
