#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqsurvive2p.cjs — **画面 2 つで 実際に 対戦する**（要件 34）。

   vqsurvivenet.cjs は WebSocket を 直に 叩いて サーバを 見た。
   こちらは **本物の 画面を 2 枚 開いて**、
     部屋を 作る → あいことばで 入る → 部屋主が 始める →
     相手が 画面に 出る → 動くと 相手にも 伝わる → 結果
   まで 通す。画面側の 通信の 道が 本当に 繋がっているかは これでしか 分からない。

   使い方: 先に  cd server && ./dev-local.sh echo 8795
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const { chromium } = require("playwright");
const BASE = process.env.VQ_API || "http://127.0.0.1:8795";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ok   " + n); }
  else { fail++; bad.push(n); console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 300) : "")); }
};
const 節 = (t) => console.log("\n══ " + t + " ══");
const 待つ = (ms) => new Promise((r) => setTimeout(r, ms));

async function 人を作る(i) {
  const nick = "tp" + Date.now().toString(36).slice(-5) + i;
  const r = await fetch(BASE + "/api/auth/register", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gradePrefix: "H1", nickname: nick, password: "DevTp#2026a", tosAccepted: true, tosVersion: "1" })
  });
  const d = await r.json();
  if (!d.token) throw new Error("検証アカウントを作れません: " + JSON.stringify(d).slice(0, 160));
  return { token: d.token, name: nick };
}

const 影 = (fn, arg) => ({ fn, arg });

(async () => {
  const A = await 人を作る(1), B = await 人を作る(2);
  console.log("     " + A.name + " と " + B.name + "\n");

  const b = await chromium.launch({
    args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader", "--disable-dev-shm-usage"]
  });
  const errs = [];
  try {
    const 開く = async (who) => {
      const ctx = await b.newContext({ viewport: { width: 1100, height: 760 } });
      const pg = await ctx.newPage();
      pg.on("pageerror", (e) => errs.push(who.name + " pageerror: " + String(e && e.message || e)));
      /* 札を 先に 入れておく（読み込む 前） */
      await ctx.addInitScript((tk) => {
        try {
          localStorage.setItem("app.auth.token.v1", tk);
          localStorage.setItem("app.auth.expiresAt.v1", String(Date.now() + 86400000));
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
      await pg.waitForFunction(() => window.VocabuSurvive && window.VocabuSurvive.state().opened, null, { timeout: 30000 });
      await pg.waitForFunction(() => (window.VocabuSurvive.state().loaded || []).length >= 5, null, { timeout: 30000 }).catch(() => {});
      /* 影の DOM と START が 出るまで 待つ（出る 前に 押すと 落ちる）。
         ★ 見張りは **時間で**（polling）。既定の rAF だと、
           描きが 詰まっている 間 一度も 評価されない ことが ある。 */
      await pg.waitForFunction(() => {
        const h = document.querySelector("#appSurvivePage .vq-survive-host");
        return !!(h && h.shadowRoot && h.shadowRoot.querySelector(".vs-load-start"));
      }, null, { timeout: 30000, polling: 250 });
      await pg.evaluate(() => {
        const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
        r.querySelector(".vs-load-start").click();
      });
      await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "lobby", null, { timeout: 25000 });
      return { ctx, pg };
    };

    節("① 2 枚 開く");
    const a = await 開く(A);
    const c = await 開く(B);
    ok("2 枚とも ロビーまで 来る", true);
    const tk = await a.pg.evaluate(() => (typeof window._authGetToken === "function") ? !!window._authGetToken() : false);
    ok("札が 効いている", tk === true);

    節("② 部屋を 作る");
    await a.pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      r.querySelector(".vs-lb-onrow .vs-btn").click();       /* 部屋を 作る */
    });
    await a.pg.waitForFunction(() => {
      const lb = window.VocabuSurvive.__app.shell.get("lobby");
      return lb && lb.roomId && lb.net && lb.net.connected;
    }, null, { timeout: 25000, polling: 250 }).catch(() => {});
    const roomId = await a.pg.evaluate(() => window.VocabuSurvive.__app.shell.get("lobby").roomId);
    ok("あいことばが 出る", /^[A-Z0-9]{6}$/.test(String(roomId || "")), roomId);
    console.log("     あいことば: " + roomId);
    const host = await a.pg.evaluate(() => window.VocabuSurvive.__app.shell.get("lobby").isHost);
    ok("作った 人が 部屋主に なる", host === true, host);

    節("③ あいことばで 入る");
    await c.pg.evaluate((id) => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      r.querySelector(".vs-lb-code").value = id;
      const btns = r.querySelectorAll(".vs-lb-onrow .vs-btn");
      btns[btns.length - 1].click();                          /* 入る */
    }, roomId);
    await c.pg.waitForFunction(() => {
      const lb = window.VocabuSurvive.__app.shell.get("lobby");
      return lb && lb.net && lb.net.connected && lb.party.length >= 2;
    }, null, { timeout: 25000, polling: 250 }).catch(() => {});
    await 待つ(700);
    const 両方 = await Promise.all([a, c].map((x) => x.pg.evaluate(() => {
      const lb = window.VocabuSurvive.__app.shell.get("lobby");
      return { room: lb.roomId, n: lb.party.length, host: lb.isHost, names: lb.party.map((p) => p.name) };
    })));
    ok("2 人とも 同じ 部屋に いる", 両方[0].room === 両方[1].room && 両方[0].room === roomId, 両方);
    ok("2 人 見えている", 両方[0].n === 2 && 両方[1].n === 2, 両方.map((x) => x.n));
    ok("入った 人は 部屋主で ない", 両方[1].host === false, 両方[1].host);
    ok("画面に 相手の 名前が 出る", 両方[0].names.some((n) => n === B.name), 両方[0].names);

    節("④ 部屋主が 始める");
    await a.pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      r.querySelector(".vs-lb-start").click();
    });
    for (const x of [a, c]) {
      await x.pg.waitForFunction(() => window.VocabuSurvive.state().screen === "match", null, { timeout: 30000 }).catch(() => {});
    }
    const 画面 = await Promise.all([a, c].map((x) => x.pg.evaluate(() => window.VocabuSurvive.state().screen)));
    ok("2 枚とも 試合の 画面へ 移る", 画面[0] === "match" && 画面[1] === "match", 画面);
    const 中身 = await Promise.all([a, c].map((x) => x.pg.evaluate(() => {
      const m = window.VocabuSurvive.__app.shell.get("match");
      return { players: m.sim.players.length, bots: m.bots.length, online: !!m.online,
               course: m.course.id, seed: m.cfg.seed, remote: m.sim.players.filter((p) => p.remote).length };
    })));
    ok("2 人ぶん いる", 中身[0].players === 2 && 中身[1].players === 2, 中身.map((x) => x.players));
    ok("ボットは 入らない", 中身[0].bots === 0 && 中身[1].bots === 0, 中身.map((x) => x.bots));
    ok("相手は「よそから 来る 人」に なっている", 中身[0].remote === 1 && 中身[1].remote === 1, 中身.map((x) => x.remote));
    ok("同じ コース", 中身[0].course === 中身[1].course, 中身.map((x) => x.course));
    ok("同じ 種（問題が そろう）", 中身[0].seed === 中身[1].seed, 中身.map((x) => x.seed));
    const 問 = await Promise.all([a, c].map((x) => x.pg.evaluate(() => {
      const m = window.VocabuSurvive.__app.shell.get("match");
      return (m.questions || []).map((q) => q.prompt).slice(0, 3);
    })));
    ok("★ 2 人に 同じ 問題が 出る", JSON.stringify(問[0]) === JSON.stringify(問[1]), 問);

    節("⑤ 動きが 相手の 画面に 出る");
    for (const x of [a, c]) {
      await x.pg.waitForFunction(() => {
        const m = window.VocabuSurvive.__app.shell.get("match");
        return m && m.sim && m.sim.phase === "running";
      }, null, { timeout: 25000, polling: 250 }).catch(() => {});
    }
    const 前 = await c.pg.evaluate(() => {
      const m = window.VocabuSurvive.__app.shell.get("match");
      const r = m.sim.players.find((p) => p.remote);
      return r ? { z: r.z, pr: r.progress } : null;
    });
    /* A を 走らせる */
    await a.pg.keyboard.down("KeyW");
    await 待つ(2600);
    await a.pg.keyboard.up("KeyW");
    await 待つ(700);
    const 後 = await c.pg.evaluate(() => {
      const m = window.VocabuSurvive.__app.shell.get("match");
      const r = m.sim.players.find((p) => p.remote);
      return r ? { z: r.z, pr: r.progress, name: r.name } : null;
    });
    const 自分 = await a.pg.evaluate(() => {
      const m = window.VocabuSurvive.__app.shell.get("match");
      return { z: m.local.z, pr: m.local.progress };
    });
    console.log("     A 本人: pr=" + 自分.pr.toFixed(1) + " / B から 見た A: pr=" + (後 ? 後.pr.toFixed(1) : "?"));
    ok("A が 実際に 進んだ", 自分.pr > 8, 自分);
    ok("★ B の 画面でも A が 進んでいる", 後 && 後.pr > 6, { 前, 後 });
    ok("ずれが 6m 以内（補間の 遅らせ ぶん）", 後 && Math.abs(後.pr - 自分.pr) < 6, { 本人: 自分.pr, 相手側: 後 && 後.pr });
    const 名札 = await c.pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      return Array.from(r.querySelectorAll(".vs-plate .vs-plate-nm")).map((e) => e.textContent);
    });
    ok("相手の 名札が 出る", 名札.length >= 1, 名札);

    節("⑥ 順位表に 2 人 出る");
    const 順位 = await Promise.all([a, c].map((x) => x.pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      return Array.from(r.querySelectorAll(".vs-hud-row")).filter((e) => e.style.display !== "none")
        .map((e) => e.querySelector(".vs-hud-nm").textContent);
    })));
    ok("2 枚とも 2 人 出ている", 順位[0].length === 2 && 順位[1].length === 2, 順位);

    節("⑦ 切れても 相手は 続く");
    await c.pg.evaluate(() => {
      const m = window.VocabuSurvive.__app.shell.get("match");
      if (m.net) m.net.close();
    });
    await 待つ(1200);
    const 生 = await a.pg.evaluate(() => {
      const m = window.VocabuSurvive.__app.shell.get("match");
      return { running: m.running, phase: m.sim.phase };
    });
    ok("相手が 切れても 試合は 続く", 生.running && 生.phase === "running", 生);

    節("⑧ 例外");
    const 無視 = /favicon|net::ERR_|Failed to load resource|firebase|config\.public|AudioContext|play\(\) failed|WebSocket is closed/i;
    const 実害 = errs.filter((e) => !無視.test(e));
    ok("実害の ある 例外が 0 件", 実害.length === 0, 実害.slice(0, 6));
    console.log("     （参考）出た 全部: " + errs.length + " 件");
  } finally {
    await b.close();
  }
  console.log("\n────────────────────────────────");
  console.log("  ok " + pass + " / NG " + fail);
  if (bad.length) console.log("  落ちたもの:\n   - " + bad.join("\n   - "));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
