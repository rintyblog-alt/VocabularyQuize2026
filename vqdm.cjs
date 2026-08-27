/* ══════════════════════════════════════════════════════════════════════════
   vqdm.cjs — DM（1 対 1 のやりとり）の 通し検証

   ・相互フォローでない相手へは **3 件まで**（4 件目は 断る）
   ・消しても 枠は 戻らない
   ・相互フォローに なったら 無制限
   ・未読 / 既読 / 返信 / ピン / 報告 / プリセット共有 / 差分
   本番では 走らせない。
   ══════════════════════════════════════════════════════════════════════════ */
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

let 済 = 0, 落 = 0; const 印 = [];
function ok(名, 真, 補) {
  if (真) { 済++; 印.push("  ✅ " + 名 + (補 ? "  " + 補 : "")); }
  else { 落++; 印.push("  ❌ " + 名 + (補 ? "  " + 補 : "")); }
}
function 節(t) { 印.push("\n── " + t + " " + "─".repeat(Math.max(0, 56 - t.length))); }

async function req(path, { method = "GET", body, token } = {}) {
  const h = { "content-type": "application/json" };
  if (token) h.authorization = "Bearer " + token;
  const r = await fetch(BASE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, j };
}

async function 待つ(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function 起きるまで待つ() {
  for (let i = 0; i < 90; i++) {
    try {
      const r = await fetch(BASE + "/api/public/config");
      if (r.ok || r.status === 404 || r.status === 401) return true;
    } catch (e) {}
    await 待つ(1000);
  }
  return false;
}

let 連番 = 0;
async function 作る(名) {
  連番++;
  const tag = `dmt${Date.now().toString(36)}${連番}`;
  const email = `vqdm.${tag}@gmail.com`;
  const s = await req("/api/auth/register/start", {
    method: "POST",
    body: { email, gradePrefix: "H2", nickname: 名 + tag, password: "Testing!2345" }
  });
  if (!s.j.devCode) throw new Error("devCode が返りません: " + JSON.stringify(s.j).slice(0, 200));
  const v = await req("/api/auth/register/verify", {
    method: "POST", body: { challengeId: s.j.challengeId, code: s.j.devCode }
  });
  const c = await req("/api/auth/register/consent", {
    method: "POST",
    body: { registrationSession: v.j.registrationSession, agreeTerms: true, agreePrivacy: true, agreeAge: true, pin: "482913" }
  });
  if (!c.j.token) throw new Error("token が返りません: " + JSON.stringify(c.j).slice(0, 200));
  const me = await req("/api/auth/me", { token: c.j.token });
  return { token: c.j.token, uid: Number(me.j?.user?.id || me.j?.id || 0), nickname: 名 + tag, email };
}

(async () => {
  if (!(await 起きるまで待つ())) { console.error("ローカルの Worker が 起きません。"); process.exit(2); }

  節("下ごしらえ");
  const A = await 作る("dma");
  const B = await 作る("dmb");
  const C = await 作る("dmc");
  ok("検証用の人を 3 人 作れた", A.uid > 0 && B.uid > 0 && C.uid > 0, `A=${A.uid} B=${B.uid} C=${C.uid}`);

  節("① 相手を 探して 話しかける");
  const 探 = await req("/api/groups/user-search?q=" + encodeURIComponent(B.nickname), { token: A.token });
  const 見 = (探.j.users || []).some((u) => u.userId === B.uid);
  ok("誰でも 探せる", 見, `${(探.j.users || []).length} 人`);

  const 開 = await req("/api/dm/open", { method: "POST", body: { userId: B.uid }, token: A.token });
  ok("部屋を 開ける", 開.status === 200 && !!開.j.threadId, 開.j.threadId || JSON.stringify(開.j).slice(0, 120));
  const TID = 開.j.threadId;
  ok("最初は 相互フォローでない", 開.j.limit && 開.j.limit.mutual === false, JSON.stringify(開.j.limit));
  ok("残りは 3 件", 開.j.limit && 開.j.limit.left === 3, JSON.stringify(開.j.limit));
  const 開2 = await req("/api/dm/open", { method: "POST", body: { userId: B.uid }, token: A.token });
  ok("もう一度 開いても 同じ部屋（二重に できない）", 開2.j.threadId === TID, 開2.j.threadId);

  節("② 相互フォローでないと 3 件まで");
  const 送 = [];
  for (let i = 1; i <= 3; i++) {
    const r = await req("/api/dm/send", { method: "POST", body: { threadId: TID, kind: "text", body: "こんにちは " + i }, token: A.token });
    送.push(r);
  }
  ok("1 件目が 通る", 送[0].status === 200, String(送[0].status));
  ok("3 件目まで 通る", 送[2].status === 200, String(送[2].status));
  ok("3 件目の あと 残りが 0", 送[2].j.limit && 送[2].j.limit.left === 0, JSON.stringify(送[2].j.limit));
  const 四 = await req("/api/dm/send", { method: "POST", body: { threadId: TID, kind: "text", body: "4 件目" }, token: A.token });
  ok("4 件目は 断る", 四.status === 403 && 四.j.code === "DM_LIMIT", `${四.status} ${四.j.code}`);
  ok("断る文に 件数と 直しかたが 書いてある", /3 件/.test(四.j.message || "") && /フォロー/.test(四.j.message || ""), (四.j.message || "").slice(0, 60));

  節("③ 未読と 既読");
  /* ★ ここは **相手が まだ 何もしていない** うちに 見ること。
     送ることは 読んだことでもある（下の ④ で 確かめる）ので、
     先に 相手に 送らせると 未読は 0 に なってしまう。 */
  const B一覧 = await req("/api/dm/threads", { token: B.token });
  const B部屋 = (B一覧.j.threads || []).find((t) => t.id === TID);
  ok("相手の 一覧に 出る", !!B部屋, B部屋 ? "あり" : "なし");
  ok("未読が 3 件", B部屋 && B部屋.unread === 3, String(B部屋 && B部屋.unread));

  const A読 = await req("/api/dm/messages?threadId=" + encodeURIComponent(TID), { token: A.token });
  ok("やりとりが 3 件 見える", (A読.j.messages || []).length === 3, String((A読.j.messages || []).length));
  ok("相手は まだ 読んでいない", Number(A読.j.otherReadTs || 0) === 0, String(A読.j.otherReadTs));

  節("④ 相手にも 3 件の枠が 別にある／送ることは 読んだこと");
  const B送 = await req("/api/dm/send", { method: "POST", body: { threadId: TID, kind: "text", body: "はじめまして" }, token: B.token });
  ok("相手は 自分の枠で 送れる", B送.status === 200, String(B送.status));
  ok("相手の 残りは 2 件", B送.j.limit && B送.j.limit.left === 2, JSON.stringify(B送.j.limit));
  const B一覧b = await req("/api/dm/threads", { token: B.token });
  ok("送ったら 自分の未読は 消える", (B一覧b.j.threads || []).find((t) => t.id === TID).unread === 0, "");
  const A読b = await req("/api/dm/messages?threadId=" + encodeURIComponent(TID), { token: A.token });
  ok("相手が 送った時点で 既読の時刻が 入る", Number(A読b.j.otherReadTs || 0) > 0, String(A読b.j.otherReadTs));
  ok("やりとりが 4 件に なる", (A読b.j.messages || []).length === 4, String((A読b.j.messages || []).length));

  await req("/api/dm/read", { method: "POST", body: { threadId: TID }, token: B.token });
  const A読2 = await req("/api/dm/messages?threadId=" + encodeURIComponent(TID), { token: A.token });
  ok("読んだら 既読の時刻が 進む", Number(A読2.j.otherReadTs || 0) >= Number(A読b.j.otherReadTs || 0), String(A読2.j.otherReadTs));
  const B一覧2 = await req("/api/dm/threads", { token: B.token });
  ok("読んだら 未読が 0 になる", (B一覧2.j.threads || []).find((t) => t.id === TID).unread === 0, "");

  節("⑤ 返信・ピン・消す");
  const 元 = (A読2.j.messages || [])[0];
  const 返 = await req("/api/dm/send", { method: "POST", body: { threadId: TID, kind: "text", body: "それについて", replyTo: 元.id }, token: B.token });
  ok("返信できる", 返.status === 200 && 返.j.message.replyTo === 元.id, 返.j.message && 返.j.message.replyTo);

  const 留 = await req("/api/dm/pin", { method: "POST", body: { threadId: TID, messageId: 元.id, on: true }, token: A.token });
  ok("ピン留めできる", (留.j.pinned || []).indexOf(元.id) >= 0, JSON.stringify(留.j.pinned));
  const 外 = await req("/api/dm/pin", { method: "POST", body: { threadId: TID, messageId: 元.id, on: false }, token: A.token });
  ok("ピンを 外せる", (外.j.pinned || []).indexOf(元.id) < 0, JSON.stringify(外.j.pinned));

  const 他人が消す = await req("/api/dm/delete", { method: "POST", body: { messageId: 元.id }, token: B.token });
  ok("人のものは 消せない", 他人が消す.status === 403, String(他人が消す.status));

  節("⑥ 消しても 枠は 戻らない");
  const 開C = await req("/api/dm/open", { method: "POST", body: { userId: C.uid }, token: A.token });
  const TIDC = 開C.j.threadId;
  const c1 = await req("/api/dm/send", { method: "POST", body: { threadId: TIDC, kind: "text", body: "1" }, token: A.token });
  await req("/api/dm/send", { method: "POST", body: { threadId: TIDC, kind: "text", body: "2" }, token: A.token });
  const c3 = await req("/api/dm/send", { method: "POST", body: { threadId: TIDC, kind: "text", body: "3" }, token: A.token });
  ok("3 件 送って 残り 0", c3.j.limit.left === 0, JSON.stringify(c3.j.limit));
  const 消 = await req("/api/dm/delete", { method: "POST", body: { messageId: c1.j.message.id }, token: A.token });
  ok("自分のものは 消せる", 消.status === 200, String(消.status));
  const c4 = await req("/api/dm/send", { method: "POST", body: { threadId: TIDC, kind: "text", body: "4" }, token: A.token });
  ok("消しても 4 件目は 送れない", c4.status === 403 && c4.j.code === "DM_LIMIT", `${c4.status} ${c4.j.code}`);
  const 見え = await req("/api/dm/messages?threadId=" + encodeURIComponent(TIDC), { token: C.token });
  const 消えた = (見え.j.messages || []).find((m) => m.id === c1.j.message.id);
  ok("消したものは 相手からも 中身が 見えない", 消えた && 消えた.deleted === true && !消えた.body, JSON.stringify(消えた && { d: 消えた.deleted, b: 消えた.body }));

  節("⑦ 相互フォローに なると 無制限");
  await req("/api/follow/toggle", { method: "POST", body: { userId: B.uid, on: true }, token: A.token });
  await req("/api/follow/toggle", { method: "POST", body: { userId: A.uid, on: true }, token: B.token });
  const 開3 = await req("/api/dm/open", { method: "POST", body: { userId: B.uid }, token: A.token });
  ok("相互フォローと 判定される", 開3.j.limit && 開3.j.limit.mutual === true, JSON.stringify(開3.j.limit));
  const 無 = await req("/api/dm/send", { method: "POST", body: { threadId: TID, kind: "text", body: "解禁" }, token: A.token });
  ok("4 件目以降も 送れる", 無.status === 200, String(無.status));
  ok("残りは 無制限（-1）", 無.j.limit && 無.j.limit.left === -1, JSON.stringify(無.j.limit));
  for (let i = 0; i < 5; i++) await req("/api/dm/send", { method: "POST", body: { threadId: TID, kind: "text", body: "連投 " + i }, token: A.token });
  const 連 = await req("/api/dm/send", { method: "POST", body: { threadId: TID, kind: "text", body: "まだ送れる" }, token: A.token });
  ok("10 件を 越えても 送れる", 連.status === 200, String(連.status));

  節("⑧ スタンプ・場所の 見張り");
  const ス = await req("/api/dm/send", { method: "POST", body: { threadId: TID, kind: "sticker", body: "🎉" }, token: A.token });
  ok("スタンプが 送れる", ス.status === 200 && ス.j.message.kind === "sticker", ス.j.message && ス.j.message.body);
  const 外部 = await req("/api/dm/send", { method: "POST", body: { threadId: TID, kind: "image", mediaUrl: "https://example.com/a.png" }, token: A.token });
  ok("外の場所は 受けない", 外部.status === 400, String(外部.status));
  const 変な種 = await req("/api/dm/send", { method: "POST", body: { threadId: TID, kind: "script", body: "x" }, token: A.token });
  ok("知らない種類は 受けない", 変な種.status === 400, String(変な種.status));
  const 空 = await req("/api/dm/send", { method: "POST", body: { threadId: TID, kind: "text", body: "   " }, token: A.token });
  ok("空の文は 受けない", 空.status === 400, String(空.status));

  節("⑨ プリセットの 共有");
  const preset = { id: "p_test_1", name: "検証用プリセット", subjectId: "sub:english",
    questions: [{ q: "apple", a: "りんご" }, { q: "dog", a: "犬" }] };
  const 共 = await req("/api/dm/send", { method: "POST", body: { threadId: TID, kind: "preset", preset }, token: A.token });
  ok("プリセットを 送れる", 共.status === 200 && 共.j.message.kind === "preset", String(共.status));
  ok("見出しに 名前と 問数が 入る",
    共.j.message.meta && 共.j.message.meta.name === "検証用プリセット" && 共.j.message.meta.questionCount === 2,
    JSON.stringify(共.j.message.meta));
  const 取 = await req("/api/dm/preset?messageId=" + encodeURIComponent(共.j.message.id), { token: B.token });
  ok("相手が 中身を 取り出せる", 取.status === 200 && 取.j.preset && 取.j.preset.questions.length === 2, String(取.status));
  const 他 = await req("/api/dm/preset?messageId=" + encodeURIComponent(共.j.message.id), { token: C.token });
  ok("関係ない人は 取り出せない", 他.status === 403, String(他.status));

  節("⑩ 差分（画面が 短い間隔で 呼ぶもの）");
  const 印時 = Date.now();
  await 待つ(20);
  await req("/api/dm/send", { method: "POST", body: { threadId: TID, kind: "text", body: "差分の分" }, token: B.token });
  const 差 = await req("/api/dm/sync?since=" + 印時 + "&threadId=" + encodeURIComponent(TID), { token: A.token });
  ok("差分に 新しい分だけ 来る", (差.j.messages || []).length === 1, String((差.j.messages || []).length));
  ok("未読の 合計が 返る", typeof 差.j.totalUnread === "number" && 差.j.totalUnread >= 1, String(差.j.totalUnread));
  ok("動いた部屋が 返る", (差.j.threads || []).some((t) => t.id === TID), JSON.stringify((差.j.threads || []).map((t) => t.id)));
  const 差2 = await req("/api/dm/sync?since=" + Date.now() + "&threadId=" + encodeURIComponent(TID), { token: A.token });
  ok("変わっていなければ 空", (差2.j.messages || []).length === 0 && (差2.j.threads || []).length === 0, "");

  節("⑪ 部屋の状態（ピン・知らせ・隠す）と 報告");
  await req("/api/dm/thread", { method: "POST", body: { threadId: TIDC, pinned: true }, token: A.token });
  const 一 = await req("/api/dm/threads", { token: A.token });
  ok("ピンした部屋が 一番上に 来る", (一.j.threads || [])[0] && (一.j.threads || [])[0].id === TIDC, (一.j.threads || [])[0] && (一.j.threads || [])[0].id);
  ok("ピンの印が 立つ", (一.j.threads || [])[0].pinned === true, "");
  await req("/api/dm/thread", { method: "POST", body: { threadId: TIDC, pinned: false, hidden: true }, token: A.token });
  const 一2 = await req("/api/dm/threads", { token: A.token });
  ok("隠した部屋は 一覧から 消える", !(一2.j.threads || []).some((t) => t.id === TIDC), "");
  const 一3 = await req("/api/dm/threads", { token: C.token });
  ok("隠しても 相手の一覧からは 消えない", (一3.j.threads || []).some((t) => t.id === TIDC), "");

  const 報 = await req("/api/dm/report", { method: "POST", body: { threadId: TID, messageId: "", reason: "spam", note: "検証" }, token: B.token });
  ok("報告できる", 報.status === 200, String(報.status));
  const 報無 = await req("/api/dm/report", { method: "POST", body: { threadId: TID, reason: "" }, token: B.token });
  ok("理由なしの 報告は 受けない", 報無.status === 400, String(報無.status));

  節("⑫ 人の部屋は のぞけない");
  const 覗 = await req("/api/dm/messages?threadId=" + encodeURIComponent(TID), { token: C.token });
  ok("入っていない部屋は 見られない", 覗.status === 403, String(覗.status));
  const 覗送 = await req("/api/dm/send", { method: "POST", body: { threadId: TID, kind: "text", body: "よそ者" }, token: C.token });
  ok("入っていない部屋へは 送れない", 覗送.status === 403, String(覗送.status));
  const 未 = await req("/api/dm/threads");
  ok("ログインしていないと 見られない", 未.status === 401, String(未.status));
  const 自分 = await req("/api/dm/open", { method: "POST", body: { userId: A.uid }, token: A.token });
  ok("自分あては 作れない", 自分.status === 400, String(自分.status));

  console.log(印.join("\n"));
  console.log("\n" + (落 === 0 ? "通った" : "落ちた") + "  " + 済 + "/" + (済 + 落));
  process.exit(落 === 0 ? 0 : 1);
})().catch((e) => { console.error("止まりました:", e.message); process.exit(2); });
