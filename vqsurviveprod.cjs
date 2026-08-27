#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqsurviveprod.cjs — **本番に 出したあと**の 煙検査（要件 42）。

   触るのは 読み取りと 401 の 確かめだけ。**本番の データは 変えない。**
   （検証アカウントは 作らない。作ると 本番の users が 汚れる）

   使い方: node vqsurviveprod.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_PROD || "https://vocabuquiz-api.rintyblog.workers.dev";
let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ok   " + n); }
  else { fail++; bad.push(n); console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 300) : "")); }
};
const 節 = (t) => console.log("\n══ " + t + " ══");
const 取る = async (p, o) => {
  const r = await fetch(BASE + p, Object.assign({ signal: AbortSignal.timeout(15000) }, o || {}));
  const t = await r.text();
  let d = null; try { d = t ? JSON.parse(t) : null; } catch (e) { d = null; }
  return { status: r.status, text: t, data: d, headers: r.headers };
};

(async () => {
  console.log("本番: " + BASE + "\n");

  節("① 画面");
  const top = await 取る("/");
  ok("トップが 出る", top.status === 200 && top.text.length > 10000, top.status);
  const m = /\/js\/vq-survive\.([0-9a-f]{10})\.js/.exec(top.text);
  ok("VocabuSurvive の 束を 指している", !!m, m && m[0]);
  ok("押すまで 読まない（script タグに なっていない）",
    top.text.indexOf('src="/js/vq-survive.') < 0, "script で 直に 読んでいる");
  ok("左パネルに ボタンが ある", top.text.indexOf('data-app-tab="survive"') >= 0);
  ok("器が ある", top.text.indexOf('id="appSurvivePage"') >= 0);

  節("② 束");
  if (m) {
    const js = await 取る(m[0]);
    ok("束が 取れる", js.status === 200 && js.text.length > 50000, { status: js.status, len: js.text.length });
    console.log("     " + m[0] + " : " + (js.text.length / 1024).toFixed(1) + "KB");
    ok("1 年 溜めてよい 印が 付いている",
      /max-age=31536000/.test(String(js.headers.get("cache-control") || "")), js.headers.get("cache-control"));
    ok("中に VocabuSurvive が いる", js.text.indexOf("VocabuSurvive") >= 0);
    /* ★ 束は esbuild の 既定（ascii）なので **日本語は \uXXXX に なっている**。
       そのまま 探しても 見つからない。同じ 形に してから 探す。 */
    /* ★ esbuild の 逃がし方は **大文字の 16 進**（\u30C1）。
       小文字で 探しても 見つからない。大小を 揃えてから 探す。 */
    const esc = (t) => Array.from(t).map((c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0")).join("");
    const 低 = js.text.toLowerCase();
    const ある = (t) => js.text.indexOf(t) >= 0 || 低.indexOf(esc(t).toLowerCase()) >= 0;
    ok("コース 30 本 ぶんの 名前が 入っている", ある("チャンピオンシップ") && ある("はじまりの丘"));
  }

  節("③ API");
  const q = await 取る("/api/survive/questions", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ count: 3, seed: 12345 })
  });
  ok("問題が 出る", q.status === 200 && q.data && q.data.ok, q.status);
  ok("3 問 返る", q.data && (q.data.questions || []).length === 3, q.data && (q.data.questions || []).length);
  ok("選択肢が 4 つ・答えが 範囲に ある",
    q.data && (q.data.questions || []).every((x) => x.choices.length === 4 && x.answer >= 0 && x.answer < 4));
  /* 同じ 種なら 同じ 問題（対戦の 公平さ） */
  const q2 = await 取る("/api/survive/questions", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ count: 3, seed: 12345 })
  });
  ok("同じ 種なら 同じ 問題", JSON.stringify(q.data.questions) === JSON.stringify(q2.data.questions));

  節("④ 札の 関所");
  for (const [p, o] of [
    ["/api/survive/room", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }],
    ["/api/survive/stats", {}],
    ["/api/survive/friends", {}],
    ["/api/survive/result", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }]
  ]) {
    const r = await 取る(p, o);
    ok("札なし " + p + " → 401", r.status === 401, r.status);
  }
  const lb = await 取る("/api/survive/leaderboard/c01");
  ok("コースの 上位は 誰でも 見られる", lb.status === 200 && lb.data && lb.data.ok, lb.status);

  節("⑤ 左パネルの 表");
  const fl = await 取る("/api/flags/effective");
  ok("フラグが 引ける", fl.status === 200 && fl.data && fl.data.ok, fl.status);
  const rows = (fl.data && fl.data.flags) || [];
  const sv = rows.find((x) => x.key === "survive");
  const old = rows.find((x) => x.key === "survival");
  ok("survive が 出ている", !!sv, rows.map((x) => x.key));
  if (sv) {
    ok("survive は tab:survive を 指す", sv.path === "tab:survive", sv.path);
    ok("survive は 左パネルに 出る", sv.visible !== false && sv.visible !== 0, sv);
  }
  if (old) ok("旧 VocabuSurvival は 左パネルから 外れた", !old.visible, old);
  else console.log("     旧 survival の 行は 返っていない（＝出ない）");

  節("⑥ 本体が 壊れていない");
  for (const p of ["/api/flags/effective", "/api/public-config", "/manifest.webmanifest"]) {
    const r = await 取る(p);
    ok("本体 " + p + " → " + r.status, r.status === 200 || r.status === 404, r.status);
  }
  const me = await 取る("/api/auth/me");
  ok("札なしの /api/auth/me は 401", me.status === 401, me.status);

  console.log("\n────────────────────────────────");
  console.log("  ok " + pass + " / NG " + fail);
  if (bad.length) console.log("  落ちたもの:\n   - " + bad.join("\n   - "));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
