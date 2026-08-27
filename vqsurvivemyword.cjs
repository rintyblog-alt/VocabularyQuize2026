#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqsurvivemyword.cjs — **自分の 単語で 遊べるか**を 本物の 画面で 確かめる。

   vqsurvivepreset.cjs は サーバと 部品を 見た。
   こちらは 画面を 開いて、
     単語帳を 作る → ロビーに 出る → えらぶ → 走る → **門に その 単語が 出る**
   まで 通す。ここまで 見ないと 「選べるが 出ない」に 気づけない。

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

async function 人を作る() {
  const nick = "mw" + Date.now().toString(36).slice(-6);
  const r = await fetch(BASE + "/api/auth/register", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gradePrefix: "H1", nickname: nick, password: "DevMw#2026a", tosAccepted: true, tosVersion: "1" })
  });
  const d = await r.json();
  if (!d.token) throw new Error("検証アカウントを作れません: " + JSON.stringify(d).slice(0, 160));
  return { token: d.token, name: nick };
}

const 印 = "MYW" + Date.now().toString(36).slice(-4);

(async () => {
  const U = await 人を作る();
  const b = await chromium.launch({
    args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader", "--disable-dev-shm-usage"]
  });
  const errs = [];
  try {
    const ctx = await b.newContext({ viewport: { width: 1180, height: 800 } });
    const pg = await ctx.newPage();
    pg.on("pageerror", (e) => errs.push("pageerror: " + String(e && e.message || e)));
    await ctx.addInitScript((tk) => {
      try {
        localStorage.setItem("app.auth.token.v1", tk);
        localStorage.setItem("app.auth.expiresAt.v1", String(Date.now() + 86400000));
      } catch (e) {}
    }, U.token);
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

    節("① 単語帳を 作る（本体の 置き場に）");
    await pg.waitForFunction(() => !!(window.VQ2 && window.VQ2.store && window.VQ2.store.savePreset), null, { timeout: 25000 });
    const 作った = await pg.evaluate((印) => {
      const cards = [];
      for (let i = 0; i < 20; i++) cards.push({ id: i + 1, front: 印 + "a" + i, back: 印 + "b" + i, tags: [] });
      const p = {
        id: "myw-" + 印, name: "検査用 わたしの 単語帳", subjectId: "sub:english",
        schemaVersion: 2, description: "", visibility: "private", cards, questions: []
      };
      const r = window.VQ2.store.savePreset(p, { force: true });
      return { ok: !!(r && r.ok), msg: r && r.message, 件数: (window.VQ2.store.listPresets() || []).length };
    }, 印);
    ok("単語帳を 置けた", 作った.ok, 作った);
    ok("一覧に 1 つ 以上 ある", 作った.件数 >= 1, 作った.件数);

    節("② ロビーに 出る");
    await pg.evaluate(() => document.querySelector('#appTabBar [data-app-tab="survive"]').click());
    await pg.waitForFunction(() => window.VocabuSurvive && window.VocabuSurvive.state().opened, null, { timeout: 30000 });
    await pg.waitForFunction(() => {
      const h = document.querySelector("#appSurvivePage .vq-survive-host");
      return !!(h && h.shadowRoot && h.shadowRoot.querySelector(".vs-load-start"));
    }, null, { timeout: 30000, polling: 250 });
    await pg.evaluate(() => {
      document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot.querySelector(".vs-load-start").click();
    });
    await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "lobby", null, { timeout: 25000 });
    ok("ロビーまで 来る", true);

    節("③ えらぶ 所に 出ているか");
    await pg.waitForFunction(() => {
      const lb = window.VocabuSurvive.__app.shell.get("lobby");
      return lb && lb._qzMine && lb._qzMine.length > 0;
    }, null, { timeout: 20000, polling: 250 }).catch(() => {});
    const 一覧 = await pg.evaluate(() => {
      const lb = window.VocabuSurvive.__app.shell.get("lobby");
      return { mine: lb._qzMine || [], off: lb._qzOfficial || [], pub: lb._qzPublic || [] };
    });
    ok("自分の 単語帳が 出る", 一覧.mine.length >= 1, 一覧.mine);
    ok("語数が 出る（20 語）", 一覧.mine.some((q) => q.words === 20), 一覧.mine.map((q) => q.words));
    ok("名前が 出る", 一覧.mine.some((q) => q.name === "検査用 わたしの 単語帳"), 一覧.mine.map((q) => q.name));

    const 表示 = await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const d = r.querySelector(".vs-lb-qz");
      if (!d) return null;
      d.open = true;
      return {
        見出し: Array.from(d.querySelectorAll(".vs-lb-qz-h")).map((e) => e.textContent),
        行: Array.from(d.querySelectorAll(".vs-lb-qz-it")).map((e) => ({
          名: e.querySelector(".vs-lb-qz-l").textContent,
          添: (e.querySelector(".vs-lb-qz-s") || {}).textContent || "",
          止: e.disabled
        }))
      };
    });
    ok("画面に えらぶ 所が 出る", !!表示, 表示);
    ok("いちばん上は 内蔵の 単語", 表示 && 表示.行[0] && 表示.行[0].名 === "内蔵の 単語", 表示 && 表示.行[0]);
    ok("見出しで 分かれている", 表示 && 表示.見出し.some((t) => /あなたの/.test(t)), 表示 && 表示.見出し);
    ok("ひとりの ときは 押せる", 表示 && 表示.行.every((r) => !r.止), 表示 && 表示.行.filter((r) => r.止));

    節("④ えらぶ");
    await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const 行 = Array.from(r.querySelectorAll(".vs-lb-qz-it"));
      const t = 行.filter((e) => e.querySelector(".vs-lb-qz-l").textContent === "検査用 わたしの 単語帳")[0];
      t.click();
    });
    await 待つ(300);
    const 選 = await pg.evaluate(() => window.VocabuSurvive.__app.shell.get("lobby").qz);
    ok("えらんだ ものが 覚えられる", 選.kind === "mine" && /検査用/.test(選.name), 選);
    const 見出し = await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      return r.querySelector(".vs-lb-qz-nm").textContent;
    });
    ok("閉じた ときに 名前が 見える", /検査用/.test(見出し), 見出し);

    節("⑤ 走ると 門に その 単語が 出る");
    await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      /* 短い コースで 早く 門に 着く ように 1 本目 */
      const lb = window.VocabuSurvive.__app.shell.get("lobby");
      lb.courseIndex = 0; lb.botCount = 0; lb.mode = "race"; lb._render();
      r.querySelector(".vs-lb-start").click();
    });
    await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "match", null, { timeout: 30000 });
    await pg.waitForFunction(() => {
      const m = window.VocabuSurvive.__app.shell.get("match");
      return m && m.questions && m.questions.length > 0;
    }, null, { timeout: 20000, polling: 200 });
    const 問題 = await pg.evaluate(() => {
      const m = window.VocabuSurvive.__app.shell.get("match");
      return m.questions.slice(0, 8);
    });
    const 文 = JSON.stringify(問題);
    ok("問題が 用意される", 問題.length > 0, 問題.length);
    ok("**自分の 単語が 出ている**", 文.indexOf(印) >= 0, 文.slice(0, 200));
    ok("4 択に なっている", 問題.every((q) => q.choices.length === 4), 問題[0]);
    ok("答えが 選択肢の 中に ある", 問題.every((q) => q.choices[q.answer] !== undefined), 問題[0]);

    /* 実際に 門を 開けて みる（画面に 出るか）*/
    const 門 = await pg.evaluate(() => {
      const m = window.VocabuSurvive.__app.shell.get("match");
      m.quiz.ask(m.questions[0], 12);
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const p = r.querySelector(".vs-quiz");
      return {
        問: (p.querySelector(".vs-quiz-q") || {}).textContent || "",
        選: Array.from(p.querySelectorAll(".vs-quiz-label")).map((e) => e.textContent),
        開: !!m.quiz.open
      };
    });
    ok("門が 開く", 門.開 === true, 門);
    ok("門の 画面に **自分の 単語**が 出る", String(門.問).indexOf(印) >= 0, 門.問);
    ok("門の 画面に 選択肢が 4 つ", 門.選.length === 4, 門.選);
    ok("選択肢も 自分の 単語", 門.選.every((t) => String(t).indexOf(印) >= 0), 門.選);

    節("⑥ 対戦では 選べない");
    await pg.evaluate(() => {
      const s = window.VocabuSurvive.__app.shell;
      const m = s.get("match");
      if (m && m.quiz && m.quiz.close) m.quiz.close();
      return s.show("lobby");
    });
    await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "lobby", null, { timeout: 20000 }).catch(() => {});
    await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      r.querySelector(".vs-lb-onrow .vs-btn").click();   /* 部屋を 作る */
    });
    await pg.waitForFunction(() => {
      const lb = window.VocabuSurvive.__app.shell.get("lobby");
      return lb && lb.roomId && lb.net && lb.net.connected;
    }, null, { timeout: 25000, polling: 250 }).catch(() => {});
    await 待つ(500);
    const 部屋で = await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const lb = window.VocabuSurvive.__app.shell.get("lobby");
      const d = r.querySelector(".vs-lb-qz"); d.open = true;
      return {
        部屋: lb.roomId,
        行: Array.from(d.querySelectorAll(".vs-lb-qz-it")).map((e) => ({
          名: e.querySelector(".vs-lb-qz-l").textContent,
          添: (e.querySelector(".vs-lb-qz-s") || {}).textContent || "",
          止: e.disabled
        })),
        断り: (d.querySelector(".vs-lb-note") || {}).textContent || ""
      };
    });
    ok("部屋に 入った", /^[A-Z0-9]{6}$/.test(String(部屋で.部屋 || "")), 部屋で.部屋);
    const 私の行 = 部屋で.行.filter((r) => /検査用/.test(r.名))[0];
    ok("対戦では 自分の 単語帳が **押せない**", 私の行 && 私の行.止 === true, 私の行);
    ok("なぜ 押せないか 書いてある", 私の行 && /対戦では 使えません/.test(私の行.添), 私の行);
    ok("内蔵の 単語は 部屋主なら 押せる", 部屋で.行[0] && 部屋で.行[0].止 === false, 部屋で.行[0]);
    ok("断りの 言葉が 出る", /対戦では|部屋主/.test(部屋で.断り), 部屋で.断り);

    節("⑦ 画面が 落ちていない");
    ok("画面の 例外 0 件", errs.length === 0, errs.slice(0, 4));
  } finally {
    await b.close().catch(() => {});
  }
  console.log("\n────────────────────────────────");
  console.log("  ok " + pass + " / NG " + fail);
  if (bad.length) console.log("  落ちたもの:\n   - " + bad.join("\n   - "));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
