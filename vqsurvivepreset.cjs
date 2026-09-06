#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqsurvivepreset.cjs — 「自分の 単語で 遊ぶ」の 検査。

   何を 確かめるか:
     ① 一覧の 口（/api/survive/presets）は 誰でも 読める ものだけ 返す
     ② 公開した 単語帳から 問題が 作られる（中身が 一致する）
     ③ **非公開の 単語帳は 他人から 引けない**
     ④ presetKind:"mine" を サーバへ 送っても 通らない（手元で しか 作らない）
     ⑤ 部屋で 部屋主が 選ぶと **全員 同じ 問題**に なる
     ⑥ 部屋主で なければ 単語帳を 変えられない
     ⑦ 画面の 中の 作り（手元の 単語帳・同じ 種で 同じ 問題）

   使い方: 先に  cd server && ./dev-local.sh echo 8795
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_API || "http://127.0.0.1:8795";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const WSBASE = BASE.replace(/^http/, "ws");
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
  const nick = "pr" + Date.now().toString(36).slice(-5) + i;
  const r = await api("POST", "/api/auth/register",
    { gradePrefix: "H1", nickname: nick, password: "DevPr#2026a", tosAccepted: true, tosVersion: "1" });
  if (!r.data.token) throw new Error("検証アカウントを作れません: " + JSON.stringify(r.data).slice(0, 200));
  return { token: r.data.token, name: nick };
}
function つなぐ(url, token) {
  return new Promise((res) => {
    const ws = new WebSocket(url + (token ? "?token=" + encodeURIComponent(token) : ""));
    const box = { ws, msgs: [], you: "", closed: false };
    const to = setTimeout(() => res(box), 4000);
    ws.onmessage = (ev) => {
      let m = null; try { m = JSON.parse(String(ev.data)); } catch (e) { return; }
      box.msgs.push(m);
      if (m.t === "welcome") { box.you = m.you; clearTimeout(to); res(box); }
    };
    ws.onclose = () => { box.closed = true; };
    ws.onerror = () => {};
  });
}

/* 目印の 付いた 単語（これが 出れば 「その 単語帳から 作った」と 言える） */
const 印 = "ZQX" + Date.now().toString(36).slice(-4);
function 単語(n) {
  const cards = [];
  for (let i = 0; i < n; i++) cards.push({ id: i + 1, front: 印 + "a" + i, back: 印 + "b" + i });
  return cards;
}
function プリセット(id, name, n) {
  return { id, name, subjectId: "sub:english", schemaVersion: 2, cards: 単語(n), questions: [] };
}

(async () => {
  節("⓪ 控えの 問題（通信が 落ちた とき・まだ ログインして いない 人が 見る もの）");
  {
    /* ★ 2026-08-31 に 80 → 200 問に 増やした とき、書き足した 中に
       **空の 選択肢・別の 言語の 文字・書きかけ** が 6 件 混ざって いた。
       中身を 目で 全部 見るのは 無理なので、機械で 数える。
       ここが 壊れると **学ぶ 人に 壊れた 問題を 出す**。 */
    const src = fs.readFileSync("client/assets/vocabu-survive/data/questions.js", "utf8");
    const 行 = src.split("\n").filter((l) => /^\s*\[".*\],\s*\d+,\s*"[^"]+"\],?\s*$/.test(l));
    ok("控えの 問題が 150 問 以上 ある", 行.length >= 150, 行.length);

    /* 1 行ずつ 本物の 配列に する（形が 合わない ものは ここで 落ちる）。 */
    const 組 = [];
    const 壊れ = [];
    for (const l of 行) {
      try {
        const v = JSON.parse("[" + l.trim().replace(/,\s*$/, "") + "]")[0];
        組.push(v);
      } catch (e) { 壊れ.push(l.trim().slice(0, 70)); }
    }
    ok("★ すべて 読める 形に なっている", 壊れ.length === 0, 壊れ.slice(0, 3));

    const 空 = 組.filter((q) => !q[0] || !Array.isArray(q[1]) || q[1].length !== 4
      || q[1].some((c) => !String(c || "").trim()));
    ok("★ 見出しが あり、選択肢が 4 つ とも 空でない", 空.length === 0,
      空.slice(0, 3).map((q) => q[0]));

    const だぶり = 組.filter((q) => new Set(q[1]).size !== 4);
    ok("★ 同じ 選択肢が 2 つ ない", だぶり.length === 0, だぶり.slice(0, 3).map((q) => q[0]));

    const 位置 = 組.filter((q) => q[2] !== 0);
    ok("正解は 必ず 0 番（出す ときに 混ぜる 決まり）", 位置.length === 0,
      位置.slice(0, 3).map((q) => q[0]));

    /* 書きかけ・別の 言語の 文字。**ここが 今回 6 件 出た。** */
    const 変 = 組.filter((q) => {
      const t = q[0] + "|" + q[1].join("|");
      return /[\u0400-\u04FF]/.test(t) || /…/.test(t) || /\bTODO\b|\bXXX\b/.test(t);
    });
    ok("★ 書きかけ・別の 言語の 文字が 混ざって いない", 変.length === 0,
      変.slice(0, 3).map((q) => q[0]));

    const 見出し = 組.map((q) => String(q[0]));
    const 重 = 見出し.filter((x, i) => 見出し.indexOf(x) !== i && !/正しい つづり/.test(x));
    ok("同じ 見出しが だぶって いない（つづり問題は 除く）", 重.length === 0, 重.slice(0, 4));

    const 印 = {};
    組.forEach((q) => { 印[q[3]] = (印[q[3]] || 0) + 1; });
    ok("印（意味/語彙/…）が 6 種類 以上", Object.keys(印).length >= 6, 印);
    ok("どの 印にも 10 問 以上 ある", Object.values(印).every((n) => n >= 10), 印);
  }

  const A = await 人を作る(1), B = await 人を作る(2);

  節("① 一覧の 口");
  const l0 = await api("GET", "/api/survive/presets");
  ok("札なしでも 一覧は 読める", l0.status === 200 && l0.data.ok, l0.status);
  ok("公開の 入れ物が ある", Array.isArray(l0.data.public), typeof l0.data.public);
  ok("公式の 入れ物が ある", Array.isArray(l0.data.official), typeof l0.data.official);
  ok("**自分の 単語帳は 返さない**（対戦で 使えない ものを 混ぜない）",
    l0.data.mine === undefined, Object.keys(l0.data));

  節("② 公開した 単語帳から 問題が 作られる");
  const pid = "sv" + Date.now().toString(36).slice(-6);
  const slug = "sv-" + Date.now().toString(36).slice(-6);
  const pub = await api("POST", "/api/preset/publish",
    { preset: プリセット(pid, "検査用 公開単語帳", 20), isPublic: true, slug, publicTitle: "検査用 公開単語帳" }, A.token);
  ok("公開できた", pub.status === 200, pub.data);
  const 自分のid = pub.data && (pub.data.userId || pub.data.ownerId || pub.data.owner);

  const l1 = await api("GET", "/api/survive/presets", undefined, A.token);
  const 見つけた = (l1.data.public || []).filter((p) => String(p.id) === pid)[0];
  ok("一覧に 出る", !!見つけた, (l1.data.public || []).map((p) => p.id).slice(0, 6));
  const owner = 見つけた ? 見つけた.owner : 自分のid;
  ok("持ち主の 番号が 付く", owner > 0, owner);

  const q1 = await api("POST", "/api/survive/questions",
    { count: 6, seed: 12345, presetKind: "public", presetId: pid, presetOwner: owner }, A.token);
  ok("その 単語帳から 作られた", q1.data.source === "preset", q1.data.source);
  ok("語数が 返る（20 語）", q1.data.words === 20, q1.data.words);
  const 文 = JSON.stringify(q1.data.questions || []);
  ok("**中身が 一致する**（目印の 単語が 出ている）", 文.indexOf(印) >= 0, 文.slice(0, 160));
  ok("6 問 返る", (q1.data.questions || []).length === 6, (q1.data.questions || []).length);
  const 形 = (q1.data.questions || []).every((q) =>
    q && q.prompt && Array.isArray(q.choices) && q.choices.length === 4 &&
    typeof q.answer === "number" && q.answer >= 0 && q.answer < 4);
  ok("形が 揃っている（4 択・答えの 番号）", 形, (q1.data.questions || [])[0]);
  const 重なり = (q1.data.questions || []).every((q) => new Set(q.choices).size === 4);
  ok("選択肢が だぶらない", 重なり, (q1.data.questions || []).map((q) => q.choices));

  節("③ 誰でも 同じ ものを 引ける（対戦で 使える 条件）");
  const q1b = await api("POST", "/api/survive/questions",
    { count: 6, seed: 12345, presetKind: "public", presetId: pid, presetOwner: owner }, B.token);
  ok("他の 人も 引ける（公開だから）", q1b.data.source === "preset", q1b.data.source);
  ok("**同じ 種なら 同じ 問題**", JSON.stringify(q1b.data.questions) === JSON.stringify(q1.data.questions));
  const q1c = await api("POST", "/api/survive/questions",
    { count: 6, seed: 99, presetKind: "public", presetId: pid, presetOwner: owner });
  ok("札なしでも 公開の ものは 引ける", q1c.data.source === "preset", q1c.data.source);
  ok("種が 違えば 問題も 変わる", JSON.stringify(q1c.data.questions) !== JSON.stringify(q1.data.questions));

  節("④ 非公開の ものは 引けない");
  const hid = "hd" + Date.now().toString(36).slice(-6);
  const 秘 = "SEC" + Date.now().toString(36).slice(-4);
  const cards = [];
  for (let i = 0; i < 20; i++) cards.push({ id: i + 1, front: 秘 + "a" + i, back: 秘 + "b" + i });
  const hp = await api("POST", "/api/preset/publish",
    { preset: { id: hid, name: "非公開", subjectId: "sub:english", schemaVersion: 2, cards, questions: [] }, isPublic: false }, A.token);
  console.log("     非公開で 置けたか: " + (hp.status === 200));
  for (const [誰, tk] of [["持ち主", A.token], ["他人", B.token], ["札なし", undefined]]) {
    const r = await api("POST", "/api/survive/questions",
      { count: 4, seed: 1, presetKind: "public", presetId: hid, presetOwner: owner }, tk);
    ok("非公開は " + 誰 + " からも 引けない", r.data.source !== "preset", r.data.source);
    ok("非公開の 単語が 一文字も 出ない（" + 誰 + "）", JSON.stringify(r.data).indexOf(秘) < 0);
  }

  節("⑤ mine は サーバでは 通らない");
  const qm = await api("POST", "/api/survive/questions",
    { count: 4, seed: 1, presetKind: "mine", presetId: pid, presetOwner: owner }, A.token);
  ok("presetKind:mine は サーバが 使わない（内蔵へ 落ちる）", qm.data.source !== "preset", qm.data.source);
  const qk = await api("POST", "/api/survive/questions",
    { count: 4, seed: 1, presetKind: "official", presetId: pid, presetOwner: owner }, A.token);
  ok("種類を 取り違えても 引けない（公開を 公式として 頼む）", qk.data.source !== "preset", qk.data.source);
  const qn = await api("POST", "/api/survive/questions",
    { count: 4, seed: 1, presetKind: "public", presetId: pid, presetOwner: owner + 1 }, A.token);
  ok("持ち主の 番号が 違えば 引けない", qn.data.source !== "preset", qn.data.source);

  節("⑥ 部屋で 全員 同じ 問題に なる");
  const cr = await api("POST", "/api/survive/room", { courseId: "c01" }, A.token);
  const roomId = cr.data.roomId;
  const ws = WSBASE + "/ws/survive/" + roomId;
  const a = await つなぐ(ws, A.token);
  const b = await つなぐ(ws, B.token);
  await 待つ(300);

  /* 部屋主で ない 人が 変えようと する */
  b.ws.send(JSON.stringify({ t: "preset", kind: "public", id: pid, owner, name: "よこどり" }));
  await 待つ(350);
  let 部屋 = a.msgs.filter((m) => m.t === "room").pop();
  ok("部屋主で なければ 単語帳を 変えられない", !部屋 || !部屋.room.presetId, 部屋 && 部屋.room.presetId);

  /* 部屋主が 選ぶ */
  a.ws.send(JSON.stringify({ t: "preset", kind: "public", id: pid, owner, name: "検査用 公開単語帳" }));
  await 待つ(400);
  部屋 = b.msgs.filter((m) => m.t === "room").pop();
  ok("部屋主なら 変えられる", 部屋 && 部屋.room.presetId === pid, 部屋 && 部屋.room.presetId);
  ok("選んだ 名前が 相手にも 見える", 部屋 && 部屋.room.presetName === "検査用 公開単語帳", 部屋 && 部屋.room.presetName);

  /* 始める */
  a.ws.send(JSON.stringify({ t: "start", length: 200 }));
  await 待つ(700);
  const goA = a.msgs.filter((m) => m.t === "go").pop();
  const goB = b.msgs.filter((m) => m.t === "go").pop();
  ok("始まった", !!goA && !!goB, { a: !!goA, b: !!goB });
  const qa = (goA && goA.questions) || [], qb = (goB && goB.questions) || [];
  ok("問題が 配られる", qa.length > 0, qa.length);
  ok("**二人に 同じ 問題**", JSON.stringify(qa) === JSON.stringify(qb));
  ok("**選んだ 単語帳の 単語**（目印が 出ている）", JSON.stringify(qa).indexOf(印) >= 0, JSON.stringify(qa).slice(0, 160));
  ok("配る ときは 答えを 隠す", qa.every((q) => q && q.answer === undefined), qa[0]);

  /* 自分の 単語帳を 送っても 断る */
  const cr2 = await api("POST", "/api/survive/room", { courseId: "c01" }, A.token);
  const a2 = await つなぐ(WSBASE + "/ws/survive/" + cr2.data.roomId, A.token);
  await 待つ(200);
  a2.ws.send(JSON.stringify({ t: "preset", kind: "mine", id: "なんでも", owner: 0, name: "手元の" }));
  await 待つ(350);
  const 部屋2 = a2.msgs.filter((m) => m.t === "room").pop();
  ok("**自分の 単語帳は 部屋で 受け付けない**", !部屋2 || !部屋2.room.presetId, 部屋2 && 部屋2.room.presetKind);

  節("⑦ 画面の 中の 作り");
  const src = fs.readFileSync("client/assets/vocabu-survive/data/questions.js", "utf8");
  ok("手元の 単語帳を 出す 口が ある", /export function listLocalPresets/.test(src));
  ok("手元で 問題を 作る 口が ある", /export function questionsFromPairs/.test(src));
  ok("3 通りの 形（cards / words / items）を 見ている",
    /cards/.test(src) && /words/.test(src) && /items/.test(src));
  const lob = fs.readFileSync("client/assets/vocabu-survive/ui/lobby.js", "utf8");
  ok("ロビーに えらぶ 所が ある", /vs-lb-qz/.test(lob));
  ok("対戦では 自分の 単語帳を 選べない ように している", /対戦では 使えません/.test(lob));
  ok("送る ときに mine を 空に する", /kind === "mine"/.test(lob));

  /* 同じ 種 → 同じ 問題（画面の ほう）を 実際に 動かして 確かめる */
  const mod = await import("./client/assets/vocabu-survive/data/questions.js");
  const pairs = [];
  for (let i = 0; i < 20; i++) pairs.push(["w" + i, "い" + i]);
  const A1 = mod.questionsFromPairs(pairs, 6, 4242);
  const A2 = mod.questionsFromPairs(pairs, 6, 4242);
  const A3 = mod.questionsFromPairs(pairs, 6, 4243);
  ok("画面: 同じ 種 → 同じ 問題", JSON.stringify(A1) === JSON.stringify(A2));
  ok("画面: 違う 種 → 違う 問題", JSON.stringify(A1) !== JSON.stringify(A3));
  ok("画面: 4 択に なる", A1.every((q) => q.choices.length === 4 && new Set(q.choices).size === 4), A1[0]);
  ok("画面: 答えが 選択肢の 中に ある", A1.every((q) => q.choices[q.answer] !== undefined), A1[0]);
  const 位置 = {};
  for (const q of mod.questionsFromPairs(pairs, 20, 7)) 位置[q.answer] = (位置[q.answer] || 0) + 1;
  ok("画面: 答えの 位置が 1 か所に 偏らない", Object.keys(位置).length >= 3, 位置);
  /* サーバと 同じ 手順か（同じ 種・同じ 単語 → 同じ 問題）*/
  const 手元 = mod.questionsFromPairs(単語(20).map((c) => [c.front, c.back]), 6, 12345);
  ok("**画面と サーバで 同じ 問題に なる**",
    JSON.stringify(手元.map((q) => [q.prompt, q.choices, q.answer])) ===
    JSON.stringify((q1.data.questions || []).map((q) => [q.prompt, q.choices, q.answer])),
    { 手元: 手元[0], サーバ: (q1.data.questions || [])[0] });

  for (const x of [a, b, a2]) { try { x.ws.close(); } catch (e) {} }
  console.log("\n────────────────────────────────");
  console.log("  ok " + pass + " / NG " + fail);
  if (bad.length) console.log("  落ちたもの:\n   - " + bad.join("\n   - "));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
