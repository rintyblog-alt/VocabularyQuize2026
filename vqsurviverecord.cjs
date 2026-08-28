#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqsurviverecord.cjs — 記録の 検査（週ごと・友だち・区間）。

     ① 区間（中間地点を 通った 時刻）を 残す
     ② 区間は **自己ベストを 更新した ときだけ** 入れ替わる
     ③ でたらめな 区間は 受けない
     ④ 週ごとの 上位（月曜 始まり・その 週の 自己ベスト 1 行）
     ⑤ 友だちの 中での 順位（相互フォローだけ）
     ⑥ **自分の 順位は 上位 20 に 入らなくても 返る**
     ⑦ 画面（ロビーの 範囲 タブ・結果の 区間）

   使い方: 先に  cd server && ./dev-local.sh echo 8795
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
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

async function api(method, path, body, token) {
  const h = { "Content-Type": "application/json" };
  if (token) h.Authorization = "Bearer " + token;
  const r = await fetch(BASE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text();
  let d = null; try { d = t ? JSON.parse(t) : null; } catch (e) { d = { raw: t.slice(0, 200) }; }
  return { status: r.status, data: d || {} };
}
async function 人を作る(i) {
  const nick = "rc" + Date.now().toString(36).slice(-5) + i;
  const r = await api("POST", "/api/auth/register",
    { gradePrefix: "H1", nickname: nick, password: "DevRc#2026a", tosAccepted: true, tosVersion: "1" });
  if (!r.data.token) throw new Error("検証アカウントを作れません");
  const me = await api("GET", "/api/auth/me", undefined, r.data.token);
  return { token: r.data.token, name: nick, uid: String((me.data.user && me.data.user.id) || me.data.id || "") };
}
const 送る = (tk, row) => api("POST", "/api/survive/result", row, tk);

/* 週の 名前を 手元でも 計算して、サーバと 合っているかを 見る */
function 週の名(ms) {
  const d = new Date(ms);
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const 曜 = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - 曜 + 3);
  const 年 = dt.getUTCFullYear();
  const 元日 = new Date(Date.UTC(年, 0, 4));
  const 差 = Math.round((dt - 元日) / 86400000);
  const 週 = 1 + Math.floor((差 + ((元日.getUTCDay() + 6) % 7)) / 7);
  return 年 + "-W" + (週 < 10 ? "0" + 週 : String(週));
}

(async () => {
  const A = await 人を作る(1), B = await 人を作る(2), C = await 人を作る(3);
  /* このコースは この検査でしか 使わない（他の 検査と 混ざらない ように） */
  const cid = "rc" + Date.now().toString(36).slice(-8);

  節("① 区間を 残す");
  const r1 = await 送る(A.token, {
    courseId: cid, finished: true, time: 40.0, rank: 1, correct: 3, wrong: 1,
    splits: [10.0, 22.0, 33.0]
  });
  ok("残せた", r1.status === 200 && r1.data.saved, r1.data);
  ok("XP は サーバが 決める", typeof r1.data.xp === "number" && r1.data.xp > 0, r1.data.xp);
  const lb1 = await api("GET", "/api/survive/leaderboard/" + cid, undefined, A.token);
  ok("区間が 返る", JSON.stringify(lb1.data.splits) === JSON.stringify([10000, 22000, 33000]), lb1.data.splits);
  ok("自分の 記録が 出る", lb1.data.me && lb1.data.me.rank === 1 && lb1.data.me.bestMs === 40000, lb1.data.me);

  節("② 更新した ときだけ 入れ替わる");
  await 送る(A.token, { courseId: cid, finished: true, time: 55.0, rank: 3, splits: [12, 30, 44] });
  const lb2 = await api("GET", "/api/survive/leaderboard/" + cid, undefined, A.token);
  ok("**遅い 走りでは 区間が 変わらない**", JSON.stringify(lb2.data.splits) === JSON.stringify([10000, 22000, 33000]), lb2.data.splits);
  ok("自己ベストも 変わらない", lb2.data.me && lb2.data.me.bestMs === 40000, lb2.data.me);
  await 送る(A.token, { courseId: cid, finished: true, time: 30.0, rank: 1, splits: [8, 17, 25] });
  const lb3 = await api("GET", "/api/survive/leaderboard/" + cid, undefined, A.token);
  ok("速い 走りでは 区間が 入れ替わる", JSON.stringify(lb3.data.splits) === JSON.stringify([8000, 17000, 25000]), lb3.data.splits);
  ok("自己ベストも 縮む", lb3.data.me && lb3.data.me.bestMs === 30000, lb3.data.me);

  節("③ でたらめな 区間は 受けない");
  const 変 = [
    { name: "順が 逆", splits: [20, 10, 30] },
    { name: "ゴールより 遅い", splits: [10, 20, 999] },
    { name: "同じ 値が 並ぶ", splits: [10, 10, 20] },
    { name: "負の 数", splits: [-5, 10, 20] },
    { name: "数で ない", splits: ["あ", "い"] },
    { name: "配列で ない", splits: { a: 1 } }
  ];
  for (const v of 変) {
    /* いずれも **速い 走り**で 送る。受けて しまえば 区間が 壊れる。 */
    const t = 20 + 変.indexOf(v) * 0.001;
    await 送る(A.token, { courseId: cid, finished: true, time: t, rank: 1, splits: v.splits });
    const g = await api("GET", "/api/survive/leaderboard/" + cid, undefined, A.token);
    const 壊れず = JSON.stringify(g.data.splits) === JSON.stringify([8000, 17000, 25000]);
    ok(v.name + " は 受けない", 壊れず, g.data.splits);
  }
  const 最後 = await api("GET", "/api/survive/leaderboard/" + cid, undefined, A.token);
  ok("それでも タイム自体は 縮んでいる（走りは 認める）", 最後.data.me.bestMs < 30000, 最後.data.me);

  節("④ 週ごと");
  await 送る(B.token, { courseId: cid, finished: true, time: 12.0, rank: 1 });
  await 送る(C.token, { courseId: cid, finished: true, time: 60.0, rank: 2 });
  const w = await api("GET", "/api/survive/leaderboard/" + cid + "?period=week", undefined, A.token);
  ok("週の 名前が 返る", /^\d{4}-W\d{2}$/.test(String(w.data.week)), w.data.week);
  ok("**週の 名前が 手元の 計算と 一致**", w.data.week === 週の名(Date.now()), [w.data.week, 週の名(Date.now())]);
  ok("period が week に なる", w.data.period === "week", w.data.period);
  ok("3 人 出る", w.data.rows.length === 3, w.data.rows.map((r) => r.bestMs));
  ok("速い 順に 並ぶ", w.data.rows[0].bestMs <= w.data.rows[1].bestMs && w.data.rows[1].bestMs <= w.data.rows[2].bestMs,
    w.data.rows.map((r) => r.bestMs));
  ok("B が 1 位（12 秒）", w.data.rows[0].bestMs === 12000, w.data.rows[0]);
  ok("**1 人 1 行**（何度 走っても 増えない）",
    new Set(w.data.rows.map((r) => r.id)).size === w.data.rows.length, w.data.rows.map((r) => r.id));
  const 全 = await api("GET", "/api/survive/leaderboard/" + cid, undefined, A.token);
  ok("全体でも 3 人", 全.data.rows.length === 3, 全.data.rows.length);
  ok("period の 既定は all", 全.data.period === "all", 全.data.period);

  節("⑤ 友だちの 中での 順位");
  const f0 = await api("GET", "/api/survive/leaderboard/" + cid + "?scope=friends", undefined, A.token);
  ok("友だちが いなければ 自分だけ", f0.data.rows.length === 1 && f0.data.rows[0].id === A.uid,
    f0.data.rows.map((r) => r.id).concat([A.uid]));
  ok("scope が friends に なる", f0.data.scope === "friends", f0.data.scope);
  const f無 = await api("GET", "/api/survive/leaderboard/" + cid + "?scope=friends");
  ok("札なしの 友だち順位は 断る", f無.status === 401, f無.status);

  /* A ↔ B を 相互フォローに する */
  const 続く = [];
  for (const [x, y] of [[A, B], [B, A]]) {
    const r = await api("POST", "/api/follow/toggle", { targetUserId: Number(y.uid) }, x.token);
    続く.push(r.status);
  }
  console.log("     フォローの 返り: " + JSON.stringify(続く));
  const f1 = await api("GET", "/api/survive/leaderboard/" + cid + "?scope=friends", undefined, A.token);
  if (続く.every((s) => s === 200)) {
    ok("相互フォローの 相手が 入る", f1.data.rows.some((r) => r.id === B.uid), f1.data.rows.map((r) => r.id));
    ok("**フォローして いない C は 入らない**", !f1.data.rows.some((r) => r.id === C.uid), f1.data.rows.map((r) => r.id));
    ok("順位は 1 から 振り直す", f1.data.rows[0].rank === 1, f1.data.rows[0]);
  } else {
    console.log("     （フォローの 口が 使えないので ここは 飛ばす）");
  }

  節("⑥ 上位に 入らなくても 自分の 順位が 返る");
  /* 25 人 分の 速い 記録を 入れて、A を 押し出す */
  const 群 = [];
  for (let i = 0; i < 24; i++) 群.push(人を作る(100 + i));
  const 人々 = await Promise.all(群);
  for (let i = 0; i < 人々.length; i++) {
    await 送る(人々[i].token, { courseId: cid, finished: true, time: 1 + i * 0.1, rank: 1 });
  }
  const big = await api("GET", "/api/survive/leaderboard/" + cid, undefined, A.token);
  ok("上位は 20 行まで", big.data.rows.length === 20, big.data.rows.length);
  ok("A は 上位 20 に いない", !big.data.rows.some((r) => r.id === A.uid));
  ok("**それでも A の 順位が 返る**", big.data.me && big.data.me.id === A.uid && big.data.me.rank > 20, big.data.me);
  ok("A の タイムも 返る", big.data.me && big.data.me.bestMs > 0, big.data.me);
  const 匿 = await api("GET", "/api/survive/leaderboard/" + cid);
  ok("札なしなら 自分の 行は 無い", 匿.data.me === null, 匿.data.me);
  ok("札なしでも 上位は 見える", 匿.data.rows.length === 20, 匿.data.rows.length);

  節("⑥-b これまでの 成績が 画面に 出る");
  /* ★ サーバは ずっと 数えて いたのに、どこにも 出して いなかった。 */
  {
    const lob = fs.readFileSync("client/assets/vocabu-survive/ui/lobby.js", "utf8");
    ok("成績を 取りに 行く", /\/api\/survive\/stats/.test(lob));
    ok("成績の 欄が ある", /vs-lb-stats/.test(lob));
    ok("札が 無い ときの 断りが ある", /ログインすると 成績が 残ります/.test(lob));
    ok("まだ 走っていない ときの 言葉が ある", /まだ 1 回も 走っていません/.test(lob));
    /* 実際の 中身も 見る */
    const st = await api("GET", "/api/survive/stats", undefined, A.token);
    ok("成績の 口が 返る", st.status === 200 && st.data.stats, st.status);
    for (const k of ["matches", "wins", "finishes", "xp", "correct", "wrong", "seconds"]) {
      ok("成績に " + k + " が ある", typeof st.data.stats[k] === "number", st.data.stats);
    }
    ok("記録の 一覧も 返る", Array.isArray(st.data.records), typeof st.data.records);
  }

  節("⑦ 画面の 作り");
  const lob = fs.readFileSync("client/assets/vocabu-survive/ui/lobby.js", "utf8");
  ok("範囲の タブが ある", /vs-lb-rec-tab/.test(lob) && /今週/.test(lob) && /友だち/.test(lob));
  ok("自分の 行を 別に 出す", /vs-lb-rec-gap/.test(lob));
  ok("札が 無い ときの 断りが ある", /ログインすると 友だちの/.test(lob));
  const mt = fs.readFileSync("client/assets/vocabu-survive/game/match.js", "utf8");
  ok("中間地点で 時刻を 積む", /_splits\.push/.test(mt));
  ok("戻されても 二重に 積まない", /this\._splits\.length < e\.index/.test(mt));
  ok("自己ベスト更新の ときだけ 区間を 覚える", /SPLIT_KEY \+ ":" \+ this\.course\.id, JSON\.stringify\(this\._splits\)/.test(mt));
  const rs = fs.readFileSync("client/assets/vocabu-survive/ui/result.js", "utf8");
  ok("結果に 区間が 出る", /vs-res-splits/.test(rs));
  ok("速い/遅いで 色を 変える", /data-good/.test(rs));

  節("⑦-b 作り物の 記録は 上位表に 載せない");
  /* ★ ひとりで 走った ぶんは 画面の 自己申告。
     そのままでは 数字を 打ち込むだけで 1 位に なれる。 */
  {
    const cid3 = "ck" + Date.now().toString(36).slice(-7);
    /* まず ふつうに 走る（長さ 200m・40 秒）→ サーバが 長さを 覚える */
    const r0 = await 送る(A.token, { courseId: cid3, finished: true, time: 40, rank: 1, length: 200 });
    ok("ふつうの 記録は 認める", r0.data.ranked === true, r0.data);
    const g0 = await api("GET", "/api/survive/leaderboard/" + cid3, undefined, A.token);
    ok("上位表に 載る", g0.data.me && g0.data.me.bestMs === 40000, g0.data.me);

    /* 作り物 ①: あり得ない 速さ（200m を 3 秒） */
    const r1 = await 送る(B.token, { courseId: cid3, finished: true, time: 3, rank: 1, length: 200 });
    ok("**速すぎる 記録は 上位表に 載せない**", r1.data.ranked === false, r1.data);
    ok("理由を 返す", /速すぎ/.test(String(r1.data.why || "")), r1.data.why);
    const g1 = await api("GET", "/api/survive/leaderboard/" + cid3, undefined, B.token);
    ok("1 位が 入れ替わらない", g1.data.rows[0] && g1.data.rows[0].bestMs === 40000, g1.data.rows);

    /* 作り物 ②: 長さの 申告を 変える（20m の コースだと 言い張る） */
    const r2 = await 送る(C.token, { courseId: cid3, finished: true, time: 5, rank: 1, length: 20 });
    ok("**長さの 申告が 合わない ものも 載せない**", r2.data.ranked === false, r2.data);
    ok("理由を 返す", /長さ/.test(String(r2.data.why || "")), r2.data.why);

    /* それでも 成績（XP・回数）は 数える */
    const st3 = await api("GET", "/api/survive/stats", undefined, B.token);
    ok("走った ことは 数える（締め出さない）", st3.status === 200 && st3.data.stats.matches > 0, st3.data.stats);
    ok("XP は 付く", st3.data.stats.xp > 0, st3.data.stats.xp);

    /* ふつうに 速い 記録は ちゃんと 載る（200m を 30 秒 = 6.7m/s） */
    const r3 = await 送る(B.token, { courseId: cid3, finished: true, time: 30, rank: 1, length: 200 });
    ok("**速いだけの 記録は ちゃんと 載る**", r3.data.ranked === true, r3.data);
    const g3 = await api("GET", "/api/survive/leaderboard/" + cid3, undefined, B.token);
    ok("1 位が 入れ替わる", g3.data.rows[0] && g3.data.rows[0].bestMs === 30000, g3.data.rows);
  }

  節("⑧ 走って 出る 中間地点（実際に 走らせる）");
  {
    const path = require("path");
    const 道 = (q) => "file://" + path.join(__dirname, "client/assets/vocabu-survive", q);
    const { COURSE_BY_ID } = await import(道("data/courses.js"));
    const { buildCourse } = await import(道("game/course.js"));
    const { Player, STEP } = await import(道("game/player.js"));
    const { Bot } = await import(道("game/bot.js"));
    const { Sim, PHASE } = await import(道("game/sim.js"));

    const course = buildCourse(COURSE_BY_ID.c02);
    const sim = new Sim(course, { timeLimit: 240, countdown: 0.1 });
    sim.autoGate = 1.0;
    const p = new Player({ id: "me", name: "me", colorIndex: 0 });
    sim.add(p); sim.localId = p.id;
    const bot = new Bot(p, course, { level: "perfect", seed: 11 });
    sim.start();
    /* match.js と **同じ 積み方**を そのまま 真似る */
    const splits = [];
    const inputs = new Map();
    let 戻り = 0;
    for (let 歩 = 0; 歩 < Math.round(240 / STEP) && sim.phase !== PHASE.FINISHED; 歩++) {
      inputs.set(p.id, bot.decide(sim.time));
      for (const e of sim.step(inputs)) {
        if (e.t === "checkpoint" && e.p === p) {
          if (splits.length < e.index) splits.push(Math.round(sim.raceTime * 100) / 100);
        }
        if (e.t === "respawn" && e.p === p) 戻り++;
      }
    }
    console.log("     中間地点 " + course.checkpoints.length + " 個 / 通った " + splits.length +
      " 個 / 戻された " + 戻り + " 回 / ゴール " + (p.finished ? p.finishTime.toFixed(1) + "s" : "×"));
    ok("中間地点を 通れる", splits.length > 0, splits);
    ok("**時刻が 増える 順に 並ぶ**", splits.every((v, i) => i === 0 || v > splits[i - 1]), splits);
    ok("中間地点の 数を 超えない", splits.length <= course.checkpoints.length, [splits.length, course.checkpoints.length]);
    if (p.finished) {
      ok("どれも ゴール時間より 前", splits.every((v) => v <= p.finishTime + 0.02), [splits, p.finishTime]);
      /* サーバが 受けるか（実際に 走って 出た 値で 確かめる） */
      const cid2 = cid + "b";
      const r = await 送る(A.token, {
        courseId: cid2, finished: true, time: p.finishTime, rank: 1, splits
      });
      ok("実際に 走った 区間を サーバが 受ける", r.status === 200 && r.data.saved, r.data);
      const g = await api("GET", "/api/survive/leaderboard/" + cid2, undefined, A.token);
      ok("**そのまま 返ってくる**",
        JSON.stringify(g.data.splits) === JSON.stringify(splits.map((v) => Math.round(v * 1000))),
        { 送: splits, 返: g.data.splits });
    } else {
      console.log("     （ゴールまで 行かなかったので サーバ側は 飛ばす）");
    }
    /* 戻されても 二重に 積まない（同じ 中間地点を 二度 通る 走り） */
    ok("戻されても 区間が だぶらない", new Set(splits).size === splits.length, splits);
  }

  console.log("\n────────────────────────────────");
  console.log("  ok " + pass + " / NG " + fail);
  if (bad.length) console.log("  落ちたもの:\n   - " + bad.join("\n   - "));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
