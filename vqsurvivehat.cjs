#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqsurvivehat.cjs — かぶりものの 検査。

   いちばん 大事なのは **見た目だけである** こと。
   「この 帽子は 速い」が 一度でも 起きると、選ぶ 楽しみが 消えて
   みんな 同じ 帽子に なる。そこを 数で 押さえる。

     ① 走りが 1 ミリも 変わらない（同じ 種で 同じ 軌跡）
     ② 当たりの 大きさが 変わらない
     ③ 形を 増やしていない（描き回数が 増えない）
     ④ 覚える・戻す（ロビー）
     ⑤ 対戦で 相手にも 伝わる
     ⑥ 12 種類 すべて 描けて 落ちない

   ①②③⑥ は 手元、④⑤ は 本物の 画面と サーバ。
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

(async () => {
  const { HATS, HAT_COLORS, hatByKey, BEAN_HEIGHT, BEAN_RADIUS, BEAN_MESHES } = await import(道("game/bean.js"));
  const { COURSE_BY_ID } = await import(道("data/courses.js"));
  const { buildCourse } = await import(道("game/course.js"));
  const { Player, STEP } = await import(道("game/player.js"));
  const { Bot } = await import(道("game/bot.js"));
  const { Sim, PHASE } = await import(道("game/sim.js"));

  節("① 走りが 変わらない");
  const 走る = (hat, hatColor) => {
    const course = buildCourse(COURSE_BY_ID.c04);
    const sim = new Sim(course, { timeLimit: 60, countdown: 0.1 });
    sim.autoGate = 1.0;
    const ps = [], bots = [];
    for (let i = 0; i < 4; i++) {
      const p = new Player({ id: "p" + i, name: "P" + i, colorIndex: i, hat, hatColor });
      sim.add(p); ps.push(p);
      bots.push(new Bot(p, course, { level: "hard", seed: 500 + i, lane: (i / 3) * 2 - 1 }));
    }
    sim.localId = ps[0].id;
    sim.start();
    const inputs = new Map();
    const 跡 = [];
    for (let 歩 = 0; 歩 < Math.round(50 / STEP) && sim.phase !== PHASE.FINISHED; 歩++) {
      for (const b of bots) inputs.set(b.p.id, b.decide(sim.time));
      sim.step(inputs);
      if (歩 % 30 === 0) 跡.push(ps.map((p) => [Math.round(p.x * 1e4), Math.round(p.y * 1e4), Math.round(p.z * 1e4)]));
    }
    return { 跡, 進み: ps.map((p) => Math.round(p.progress * 1e4)), 落ち: ps.map((p) => p.respawns | 0) };
  };
  const 素 = 走る("none", 0);
  ok("**帽子を 変えても 軌跡が 同じ**（リボン）", JSON.stringify(走る("ribbon", 4).跡) === JSON.stringify(素.跡));
  ok("**帽子を 変えても 軌跡が 同じ**（とんがり）", JSON.stringify(走る("party", 9).跡) === JSON.stringify(素.跡));
  ok("進みも 同じ", JSON.stringify(走る("phones", 1).進み) === JSON.stringify(素.進み), { a: 走る("phones", 1).進み, b: 素.進み });
  ok("落ちた 回数も 同じ", JSON.stringify(走る("halo", 11).落ち) === JSON.stringify(素.落ち));
  /* 総当たり: 12 種 すべてで 同じ に なるか */
  let ずれ = [];
  for (const ht of HATS) {
    const r = 走る(ht.key, 3);
    if (JSON.stringify(r.跡) !== JSON.stringify(素.跡)) ずれ.push(ht.key);
  }
  ok("**12 種 すべてで 走りが 同じ**", ずれ.length === 0, ずれ);

  節("② 当たりの 大きさ");
  const p1 = new Player({ id: "a", hat: "none" });
  const p2 = new Player({ id: "b", hat: "tophat", hatColor: 5 });
  ok("背の 高さが 同じ", p1.height === p2.height, [p1.height, p2.height]);
  ok("太さが 同じ", p1.radius === p2.radius, [p1.radius, p2.radius]);
  ok("形の 高さは 帽子を 含まない", BEAN_HEIGHT === 1.52 && BEAN_RADIUS === 0.40, [BEAN_HEIGHT, BEAN_RADIUS]);

  節("③ 形を 増やしていない");
  const 使う形 = new Set();
  for (const ht of HATS) for (const q of ht.parts) 使う形.add(q[0]);
  const 元からある = new Set(Object.values(BEAN_MESHES));
  const 新しい = [...使う形].filter((m) => !元からある.has(m));
  ok("かぶりものが 使う 形は すべて 走る人の 形の 中", 新しい.length === 0, 新しい);
  /* ★ 13 → 14 に した（2026-08-31）。
     足元の 接地影（vs_bean_shade）を 足した ぶん 1 つ 増える。
     これは かぶりものの ためでは なく **走る人が 床に 着いて いる ことを
     見せる ため**。粗さを 1 段だけに して 描き回数は 1 回に 抑えた
     （vqsurviveperf の 描き回数の 目安も 合わせて 直した。2026-08-31 時点は 52）。
     ★ **ここを 上げる ときは 必ず 描き回数の 目安も 見る。** */
  ok("形の 種類は 14 以内", 元からある.size <= 14, [...元からある].length);
  let 最大 = 0;
  for (const ht of HATS) 最大 = Math.max(最大, ht.parts.length);
  ok("いちばん 多い 帽子でも 4 部品 以内", 最大 <= 4, 最大);

  節("③' 育ちで 増える（2026-08-31）");
  {
    const { HAT_UNLOCK, hatOpen, hatNeed, GROWTH, nextReward } =
      await import(道("data/world.js"));
    const 表 = Object.keys(HAT_UNLOCK);
    const 迷子 = 表.filter((k) => !HATS.some((h) => h.key === k));
    ok("★ ごほうびの 鍵が すべて 実在する かぶりもの", 迷子.length === 0, 迷子);
    const 抜け = HATS.map((h) => h.key).filter((k) => HAT_UNLOCK[k] === undefined);
    ok("すべての かぶりものに 開く 段が ある", 抜け.length === 0, 抜け);
    const はじめ = 表.filter((k) => HAT_UNLOCK[k] === 0);
    ok("★ はじめから 使える ものが 3 つ 以上（何も 無い ところから 始めない）",
      はじめ.length >= 3, はじめ);
    ok("0 XP では 王冠は まだ", hatOpen("crown", 0) === false);
    ok("いちばん 上まで 育てば 王冠が 使える",
      hatOpen("crown", GROWTH[GROWTH.length - 1].at) === true);
    ok("まだの ときは 何が 要るか 言える", hatNeed("crown").indexOf("大樹") >= 0, hatNeed("crown"));
    const r = nextReward(0);
    ok("次の ごほうびが 引ける", !!r && !!r.stage, r && r.stage && r.stage.name);
    /* いちばん 上の 段に まだ 何も 割り当てて いない、が 起きやすい */
    const 段ごと = {};
    for (const k of 表) 段ごと[HAT_UNLOCK[k]] = (段ごと[HAT_UNLOCK[k]] || 0) + 1;
    const 空の段 = [];
    for (let i = 1; i < GROWTH.length; i++) if (!段ごと[i]) 空の段.push(GROWTH[i].name);
    ok("★ どの 段にも ごほうびが ある（空の 段が 無い）", 空の段.length === 0, 空の段);
  }

  節("④ 12 種と 色");
  /* ★ 12 → 16（2026-08-31）。育ちの ごほうびを 段ごとに 置く ため。
     **数を 決め打ちに しない**。「どの 段にも ごほうびが ある」ことは
     ③' で 見ている ので、ここは 「増えて いる・だぶって いない」だけ 見る。 */
  ok("かぶりものが 12 種 以上 ある", HATS.length >= 12, HATS.length);
  ok("いちばん上は なし", HATS[0].key === "none" && HATS[0].parts.length === 0, HATS[0]);
  ok("鍵が だぶらない", new Set(HATS.map((h) => h.key)).size === HATS.length, HATS.length);
  ok("名前が だぶらない", new Set(HATS.map((h) => h.name)).size === HATS.length, HATS.length);
  ok("色は 12 種", HAT_COLORS.length === 12, HAT_COLORS.length);
  ok("色は すべて #rrggbb", HAT_COLORS.every((c) => /^#[0-9a-f]{6}$/i.test(c.hex)), HAT_COLORS.map((c) => c.hex));
  ok("色の 値が 0〜1 に 収まる", HAT_COLORS.every((c) => c.rgb.length === 3 && c.rgb.every((v) => v >= 0 && v <= 1)));
  ok("知らない 鍵は なしに 落ちる", hatByKey("そんなのは無い").key === "none");
  ok("部品の 形が 揃っている（9 個ずつ）", HATS.every((h) => h.parts.every((q) => q.length === 9)),
    HATS.filter((h) => h.parts.some((q) => q.length !== 9)).map((h) => h.key));
  ok("色の 指定は 0〜3", HATS.every((h) => h.parts.every((q) => q[8] >= 0 && q[8] <= 3)));

  /* ── ここから 画面と サーバ ── */
  const { chromium } = require("playwright");
  const nick = "ht" + Date.now().toString(36).slice(-6);
  const reg = await (await fetch(BASE + "/api/auth/register", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gradePrefix: "H1", nickname: nick, password: "DevHt#2026a", tosAccepted: true, tosVersion: "1" })
  })).json();
  if (!reg.token) throw new Error("検証アカウントを作れません");

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
    await pg.waitForFunction(() => window.VocabuSurvive && window.VocabuSurvive.state().opened, null, { timeout: 30000 });
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

    節("④-b 立体の 走る人に すぐ 映る");
    /* ★ きせかえは **走る人を 見ながら** 変える もの。
       選んだ 色や 帽子が その場の 立体に 映らないと、何を 選んだのか 分からない。 */
    const 映 = await pg.evaluate(async () => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const lb = window.VocabuSurvive.__app.shell.get("lobby");
      lb._openPane("look");
      await new Promise((x) => setTimeout(x, 300));
      const 取 = () => {
        const m = lb.stage && lb.stage._me;
        return m ? { c: m.color.slice(0, 3).map((v) => Math.round(v * 100)), hat: m.hat ? m.hat.key : "" } : null;
      };
      const 前 = 取();
      r.querySelectorAll(".vs-lb-color")[4].click();
      r.querySelector('.vs-lb-hat[data-hat="ribbon"]').click();
      await new Promise((x) => setTimeout(x, 300));
      const 後 = 取();
      return { 舞台: !!lb.stage, 前, 後 };
    });
    if (!映.舞台) console.log("     （立体が 出せない ので 飛ばす）");
    else {
      ok("立体の 走る人が いる", !!映.前, 映);
      ok("**選んだ 色が すぐ 映る**", JSON.stringify(映.前.c) !== JSON.stringify(映.後.c), 映);
      ok("**選んだ かぶりものも すぐ 映る**", 映.後.hat === "ribbon", 映);
    }

    節("⑤ ロビーで えらぶ");
    const 並び = await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const d = r.querySelector(".vs-lb-hatbox"); if (!d) return null;
      d.open = true;
      return {
        帽子: Array.from(d.querySelectorAll(".vs-lb-hat")).map((e) => e.textContent),
        色: d.querySelectorAll(".vs-lb-hatc").length
      };
    });
    ok("えらぶ 所が 出る", !!並び, 並び);
    ok("すべて 並ぶ", 並び && 並び.帽子.length === HATS.length, 並び && 並び.帽子.length);
    ok("色も 12 個 並ぶ", 並び && 並び.色 === 12, 並び && 並び.色);

    await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      r.querySelector('.vs-lb-hat[data-hat="ribbon"]').click();
      r.querySelector('.vs-lb-hatc[data-hc="11"]').click();
    });
    await 待つ(200);
    const 選 = await pg.evaluate(() => {
      const lb = window.VocabuSurvive.__app.shell.get("lobby");
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      return { hat: lb.hat, hc: lb.hatColor, 見出し: r.querySelector(".vs-lb-hat-nm").textContent,
        覚え: localStorage.getItem("vq.survive.pick.v1") };
    });
    ok("えらんだ 帽子が 入る", 選.hat === "ribbon", 選.hat);
    ok("えらんだ 色が 入る", 選.hc === 11, 選.hc);
    ok("見出しに 名前が 出る", 選.見出し === "リボン", 選.見出し);
    ok("覚えている", /"hat":"ribbon"/.test(String(選.覚え)) && /"hatColor":11/.test(String(選.覚え)), String(選.覚え).slice(0, 200));

    節("⑥ 走っても 描き回数が 増えない");
    const 測る = async (hat) => {
      await pg.evaluate((hat) => {
        const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
        const lb = window.VocabuSurvive.__app.shell.get("lobby");
        lb.hat = hat; lb.courseIndex = 3; lb.botCount = 7; lb.mode = "race"; lb._render();
        r.querySelector(".vs-lb-start").click();
      }, hat);
      await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "match", null, { timeout: 30000 });
      await 待つ(2500);
      const d = await pg.evaluate(() => {
        const m = window.VocabuSurvive.__app.shell.get("match");
        const s = m.renderer.stats || {};
        return { draws: s.draws | 0, tris: s.tris | 0, 人: m.sim.players.length };
      });
      await pg.evaluate(() => {
        /* ★ shell.show("lobby") を 直に 呼ぶと state().screen が 変わらない
           （画面の 名前は 本体側の goLobby が 持っている）。必ず goLobby を 通す。 */
        const app = window.VocabuSurvive.__app;
        const m = app.shell.get("match"); if (m && m.quiz && m.quiz.close) m.quiz.close();
        return app.goLobby();
      });
      await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "lobby", null, { timeout: 20000, polling: 250 });
      return d;
    };
    const 無 = await 測る("none");
    const 有 = await 測る("ribbon");
    console.log("     8 人・帽子なし: 描き " + 無.draws + " / 面 " + 無.tris);
    console.log("     8 人・リボン  : 描き " + 有.draws + " / 面 " + 有.tris);
    ok("8 人 いる", 無.人 === 8 && 有.人 === 8, [無.人, 有.人]);
    ok("帽子ありでも 描き回数が 8 回以上 増えない", 有.draws - 無.draws <= 8, [無.draws, 有.draws]);
    ok("描き回数は 45 回 以内", 有.draws <= 45, 有.draws);

    節("⑦ 12 種 すべて 描けて 落ちない");
    const 前 = errs.length;
    const 全部 = await pg.evaluate(async () => {
      const mod = await import("/assets/vocabu-survive/game/bean.js").catch(() => null);
      const lb = window.VocabuSurvive.__app.shell.get("lobby");
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const keys = Array.from(r.querySelectorAll(".vs-lb-hat")).map((e) => e.getAttribute("data-hat"));
      lb.courseIndex = 0; lb.botCount = 7; lb._render();
      return keys;
    });
    ok("鍵が すべて 取れる", 全部.length === HATS.length, 全部.length);
    for (const k of ["tophat", "horn", "donut", "leafhat"]) {
      await pg.evaluate((hat) => {
        const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
        const lb = window.VocabuSurvive.__app.shell.get("lobby");
        lb.hat = hat; lb._render();
        r.querySelector(".vs-lb-start").click();
      }, k);
      await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "match", null, { timeout: 30000 });
      await 待つ(900);
      const 生き = await pg.evaluate(() => {
        const m = window.VocabuSurvive.__app.shell.get("match");
        return { 板: m.canvas.width > 100, 人: m.sim.players.length, 描: (m.renderer.stats || {}).draws | 0 };
      });
      ok(k + " で 落ちずに 描ける", 生き.板 && 生き.描 > 5, 生き);
      await pg.evaluate(() => {
        /* ★ shell.show("lobby") を 直に 呼ぶと state().screen が 変わらない
           （画面の 名前は 本体側の goLobby が 持っている）。必ず goLobby を 通す。 */
        const app = window.VocabuSurvive.__app;
        const m = app.shell.get("match"); if (m && m.quiz && m.quiz.close) m.quiz.close();
        return app.goLobby();
      });
      await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "lobby", null, { timeout: 20000 });
    }
    ok("描いている 間に 例外が 増えない", errs.length === 前, errs.slice(前, 前 + 3));

    節("⑧ 対戦で 相手にも 伝わる");
    const nick2 = "hu" + Date.now().toString(36).slice(-6);
    const reg2 = await (await fetch(BASE + "/api/auth/register", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gradePrefix: "H1", nickname: nick2, password: "DevHu#2026a", tosAccepted: true, tosVersion: "1" })
    })).json();
    const room = await (await fetch(BASE + "/api/survive/room", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + reg.token },
      body: JSON.stringify({ courseId: "c01" })
    })).json();
    const つなぐ = (tk) => new Promise((res) => {
      const ws = new WebSocket(WSBASE + "/ws/survive/" + room.roomId + "?token=" + encodeURIComponent(tk));
      const box = { ws, msgs: [], you: "" };
      const to = setTimeout(() => res(box), 4000);
      ws.onmessage = (ev) => {
        let m = null; try { m = JSON.parse(String(ev.data)); } catch (e) { return; }
        box.msgs.push(m);
        if (m.t === "welcome") { box.you = m.you; clearTimeout(to); res(box); }
      };
      ws.onerror = () => {};
    });
    const w1 = await つなぐ(reg.token), w2 = await つなぐ(reg2.token);
    await 待つ(300);
    w1.ws.send(JSON.stringify({ t: "hat", v: "donut", c: 7 }));
    await 待つ(400);
    const み = (w2.msgs.filter((m) => m.t === "room").pop() || {}).room;
    const 相手 = (み && み.players || []).filter((p) => p.id === w1.you)[0];
    ok("相手の 画面に 帽子が 届く", 相手 && 相手.hat === "donut", 相手);
    ok("色も 届く", 相手 && 相手.hatColor === 7, 相手 && 相手.hatColor);
    w1.ws.send(JSON.stringify({ t: "hat", v: "x".repeat(200), c: 99999 }));
    await 待つ(400);
    const み2 = (w2.msgs.filter((m) => m.t === "room").pop() || {}).room;
    const 相手2 = (み2 && み2.players || []).filter((p) => p.id === w1.you)[0];
    ok("長すぎる 名前は 切られる", 相手2 && String(相手2.hat).length <= 16, 相手2 && String(相手2.hat).length);
    ok("色の 番号は 枠に 収まる", 相手2 && 相手2.hatColor >= 0 && 相手2.hatColor <= 15, 相手2 && 相手2.hatColor);
    /* 色と 違い、かぶりものは だぶって よい。
       ★ 直前で w1 に でたらめな 値を 入れて いる ので、**戻してから** 見る。 */
    w1.ws.send(JSON.stringify({ t: "hat", v: "donut", c: 7 }));
    await 待つ(300);
    w2.ws.send(JSON.stringify({ t: "hat", v: "donut", c: 7 }));
    await 待つ(400);
    const み3 = (w1.msgs.filter((m) => m.t === "room").pop() || {}).room;
    const 二人 = (み3 && み3.players || []).filter((p) => p.hat === "donut");
    ok("かぶりものは だぶっても よい", 二人.length === 2, (み3 && み3.players || []).map((p) => p.hat));
    for (const w of [w1, w2]) { try { w.ws.close(); } catch (e) {} }

    節("⑨ 画面が 落ちていない");
    ok("画面の 例外 0 件", errs.length === 0, errs.slice(0, 4));
  } finally {
    await b.close().catch(() => {});
  }
  console.log("\n────────────────────────────────");
  console.log("  ok " + pass + " / NG " + fail);
  if (bad.length) console.log("  落ちたもの:\n   - " + bad.join("\n   - "));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
