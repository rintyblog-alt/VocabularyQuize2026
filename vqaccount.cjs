/* ══════════════════════════════════════════════════════════════════════
   vqaccount.cjs — プリセットと会話が **アカウントごと**になっているか

   訴え（2026-08-19）:
     「プリセットも 必ず アカウントごと。端末を 変えても
       ローカルストレージではなく アカウントごとに。
       今の状態だと、端末を 変えると 同じアカウントでも
       全く プリセットが 異なる。」

   何が 起きていたか（実測）:
     いままでの同期が 送っていたのは **旧 V1 の鍵**
     （wordPractice400.presets.v1）だけだった。
     いま アプリが 実際に 読み書きしているのは vq2.presets.v1 で、
     そちらは **一度も 送られていなかった**。

   ここで いちばん 大事に 見ること:
     ★ **上書きで 消えないこと。**
       端末 A に 1,2 / 端末 B に 3 が 在るとき、
       まるごと 上書きすると どちらかが 消える。
       「端末ごとに 全く 違う」いまの状態は まさにそれなので、
       **突き合わせ（両方 残る）**でなければ 意味が無い。

   使い方: node vqaccount.cjs        （先に server/dev-local.sh echo）
   ══════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_API || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ok   " + n); }
  else { fail++; bad.push(n); console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 300) : "")); }
};
const 節 = (t) => console.log("\n══ " + t + " ══");

async function api(method, path, body, token) {
  const h = { "Content-Type": "application/json" };
  if (token) h.Authorization = "Bearer " + token;
  const r = await fetch(BASE + path, { method, headers: h,
    body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text();
  let d = null; try { d = t ? JSON.parse(t) : null; } catch (e) { d = { raw: t.slice(0, 200) }; }
  return { status: r.status, data: d || {} };
}
async function 人を作る(印) {
  const nick = 印 + Date.now().toString(36).slice(-6) + Math.floor(Math.random() * 90 + 10);
  const r = await api("POST", "/api/auth/register",
    { gradePrefix: "H1", nickname: nick, password: "DevAcc#2026a", tosAccepted: true, tosVersion: "1" });
  if (!r.data.token) throw new Error("検証アカウントを作れません: " + JSON.stringify(r.data).slice(0, 200));
  return { nick, token: r.data.token };
}
const プリセット = (id, 名, 時) => ({
  id, name: 名, schemaVersion: 2, ownerId: "u", updatedAt: 時, createdAt: 時, revision: 1,
  questions: [{ id: id + "-q1", type: "multiple_choice", prompt: 名 + " の問題",
                choices: ["あ", "い", "う", "え"], answerIndex: 0 }]
});

(async () => {
  console.log("接続先: " + BASE);
  const 私 = await 人を作る("acA");
  const 他 = await 人を作る("acB");
  console.log("検証アカウント: " + 私.nick + " / " + 他.nick);

  節("① 置き場が 出来ているか");
  const 空 = await api("GET", "/api/account/store", undefined, 私.token);
  ok("はじめは 空", 空.status === 200 && (空.data.keys || []).length === 0, 空.data);
  ok("置いてよい鍵に プリセットが 入っている",
     (空.data.allowedKeys || []).includes("vq2.presets.v1"), 空.data.allowedKeys);
  ok("ログインなしは 401", (await api("GET", "/api/account/store")).status === 401);

  節("② 端末 A が プリセットを 置く");
  const A = [プリセット("p1", "英単語", "2026-08-19T01:00:00.000Z"),
             プリセット("p2", "日本史", "2026-08-19T02:00:00.000Z")];
  const 置A = await api("POST", "/api/account/store",
    { items: [{ key: "vq2.presets.v1", value: JSON.stringify(A), updatedAt: 2000 }] }, 私.token);
  ok("置けた", 置A.status === 200 && (置A.data.saved || []).length === 1, 置A.data);
  const 読A = await api("GET", "/api/account/store?key=vq2.presets.v1", undefined, 私.token);
  ok("そのまま 読み戻せる", 読A.data.value === JSON.stringify(A), String(読A.data.value || "").slice(0, 80));

  節("③ 他の人には 見えない");
  const 他読 = await api("GET", "/api/account/store?key=vq2.presets.v1", undefined, 他.token);
  ok("他人には 見えない", 他読.data.value === null, 他読.data);
  const 他一覧 = await api("GET", "/api/account/store", undefined, 他.token);
  ok("他人の一覧は 空", (他一覧.data.keys || []).length === 0, 他一覧.data);

  節("④ 知らない鍵は 置かせない");
  const だめ鍵 = await api("POST", "/api/account/store",
    { key: "何でも置ける鍵", value: "x", updatedAt: 1 }, 私.token);
  ok("知らない鍵は 断る", (だめ鍵.data.rejected || []).length === 1, だめ鍵.data);
  ok("受けた件数は 0", (だめ鍵.data.saved || []).length === 0, だめ鍵.data);

  節("⑤ 古い版で 上書きされない（別端末の 遅れ）");
  const 古い = await api("POST", "/api/account/store",
    { key: "vq2.presets.v1", value: JSON.stringify([プリセット("p9", "ふるい", "2026-01-01T00:00:00.000Z")]),
      updatedAt: 1000 }, 私.token);
  ok("古い版は 断られる", (古い.data.rejected || []).length === 1, 古い.data);
  const 読A2 = await api("GET", "/api/account/store?key=vq2.presets.v1", undefined, 私.token);
  ok("中身は そのまま", 読A2.data.value === JSON.stringify(A), String(読A2.data.value || "").slice(0, 60));

  節("⑥ 大きいものも 割って 持てる（D1 の 1 行 2MB を 超える）");
  const でかい = [];
  for (let i = 0; i < 900; i++) {
    const p = プリセット("big" + i, "大きい問題集 " + i, "2026-08-19T03:00:00.000Z");
    p.questions[0].prompt = "あ".repeat(400);
    でかい.push(p);
  }
  const 大文 = JSON.stringify(でかい);
  console.log("     （大きさ " + 大文.length.toLocaleString() + " 文字）");
  const 置大 = await api("POST", "/api/account/store",
    { key: "vq2.mocks.v1", value: 大文, updatedAt: 3000 }, 私.token);
  ok("2MB を 超えても 置ける", 置大.status === 200 && (置大.data.saved || []).length === 1, 置大.data);
  const 読大 = await api("GET", "/api/account/store?key=vq2.mocks.v1", undefined, 私.token);
  ok("割ったものが 1 文字も 変わらずに 戻る", 読大.data.value === 大文,
     { 期待: 大文.length, 実際: String(読大.data.value || "").length });

  節("⑦ 消したら 印が 残る（他の端末へ 伝わる）");
  const 消 = await api("DELETE", "/api/account/store?key=vq2.mocks.v1", undefined, 私.token);
  ok("消せた", 消.status === 200, 消.data);
  const 読消 = await api("GET", "/api/account/store?key=vq2.mocks.v1", undefined, 私.token);
  ok("中身は 無い", 読消.data.value === null, 読消.data);
  ok("消した印は 残る", 読消.data.deletedAt > 0, 読消.data);

  節("⑧ 会話は 永久に 残るか");
  const 本文 = JSON.stringify([{ id: "m1", role: "user", text: "ずっと残ってほしい" }]);
  await api("POST", "/api/chat/sessions",
    { sessions: [{ id: "ever-1", title: "ずっと", body: 本文, updatedAt: Date.now() }] }, 私.token);
  const 会話 = await api("GET", "/api/chat/sessions?id=ever-1", undefined, 私.token);
  ok("会話が 残る", 会話.data.session && 会話.data.session.body === 本文, 会話.data.session);
  /* たくさん置いても 一覧から こぼれないか（前は 500 で 打ち切っていた） */
  const 束 = [];
  for (let i = 0; i < 120; i++) {
    束.push({ id: "many-" + i, title: "会話 " + i,
              body: JSON.stringify([{ id: "m", text: "x" }]), updatedAt: 1000000 + i });
  }
  const 沢山 = await api("POST", "/api/chat/sessions", { sessions: 束 }, 私.token);
  ok("120 本 まとめて 置ける", (沢山.data.savedIds || []).length === 120, (沢山.data.savedIds || []).length);
  const 全部 = await api("GET", "/api/chat/sessions", undefined, 私.token);
  ok("121 本 すべて 一覧に 出る（こぼれない）",
     (全部.data.sessions || []).filter((x) => !x.deletedAt).length >= 121,
     (全部.data.sessions || []).length);

  console.log("\n════════════════════════════════════════════");
  console.log("  合計 " + (pass + fail) + " 件 / 通った " + pass + " / 落ちた " + fail);
  if (bad.length) { console.log("  落ちたもの:"); bad.forEach((b) => console.log("   - " + b)); }
  console.log("════════════════════════════════════════════");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("落ちました: " + (e && e.stack || e)); process.exit(1); });
