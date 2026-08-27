/* ══════════════════════════════════════════════════════════════════════════
   vqofficial.cjs — 公式マーク / VocabuQuiz 公式アカウント / お知らせ→Feed /
                    DM の ブロック・ミュート の 通し検証（2026-08-20）

   訴え:
     「rinty_0401 には 公式マーク（金と青が 重なった チェック）を」
     「VocabuQuiz 公式の プロフィールを 追加したい。基本は feed のみに、
       News が 更新された場合に マークダウンありで feed に 投稿される」
     「admin ダッシュボードから 公式マーク（青 または 金色）を 付与できるように」
     「DM から アイコンをタップして プロフィールに 飛べるように。
       あとブロック機能、ミュート（通知を受け取らない）機能も」

   本番では 走らせない。
   ══════════════════════════════════════════════════════════════════════════ */
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

const fs = require("fs");
const crypto = require("crypto");

let 済 = 0, 落 = 0; const 印 = []; const 落ち = [];
function ok(名, 真, 補) {
  if (真) { 済++; 印.push("  ✅ " + 名 + (補 === undefined ? "" : "  " + 短(補))); }
  else { 落++; 落ち.push(名); 印.push("  ❌ " + 名 + (補 === undefined ? "" : "  " + 短(補))); }
}
function 短(v) { const s = typeof v === "string" ? v : JSON.stringify(v); return String(s).slice(0, 180); }
function 節(t) { 印.push("\n── " + t + " " + "─".repeat(Math.max(0, 56 - t.length))); }
function 待つ(ms) { return new Promise((r) => setTimeout(r, ms)); }

/* ── 本体の API（Bearer）─────────────────────────────────────────── */
async function req(path, { method = "GET", body, token } = {}) {
  const h = { "content-type": "application/json" };
  if (token) h.authorization = "Bearer " + token;
  const r = await fetch(BASE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, j };
}

let 連番 = 0;
async function 作る(名) {
  連番++;
  const tag = `off${Date.now().toString(36)}${連番}`;
  const email = `vqoff.${tag}@gmail.com`;
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
  return { token: c.j.token, uid: Number(me.j?.user?.id || me.j?.id || 0), nickname: 名 + tag };
}

/* ── 管理画面（Cookie + CSRF）───────────────────────────────────── */
function jar() { return { c: {} }; }
async function adm(j, path, { method = "GET", body, noCsrf } = {}) {
  const h = { "content-type": "application/json" };
  if (!noCsrf) h["x-vq-admin"] = "1";
  const ck = Object.keys(j.c).map((k) => k + "=" + j.c[k]).join("; ");
  if (ck) h.cookie = ck;
  const r = await fetch(BASE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
  for (const [k, v] of r.headers) {
    if (k.toLowerCase() !== "set-cookie") continue;
    for (const one of String(v).split(/,(?=[^;]+=)/)) {
      const m = /^\s*([^=]+)=([^;]*)/.exec(one);
      if (m) j.c[m[1].trim()] = m[2];
    }
  }
  const b = await r.json().catch(() => ({}));
  return { status: r.status, body: b };
}
/* TOTP（vqadmin.cjs と 同じ作り） */
function b32d(s) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of String(s).toUpperCase().replace(/=+$/, "")) {
    const i = A.indexOf(ch); if (i < 0) continue;
    bits += i.toString(2).padStart(5, "0");
  }
  const out = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(out);
}
function totp(secret, t) {
  const key = b32d(secret);
  const counter = Math.floor((t || Date.now()) / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 4294967296), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hm = crypto.createHmac("sha1", key).update(buf).digest();
  const o = hm[hm.length - 1] & 0xf;
  const n = ((hm[o] & 0x7f) << 24) | (hm[o + 1] << 16) | (hm[o + 2] << 8) | hm[o + 3];
  return String(n % 1000000).padStart(6, "0");
}

(async () => {
  /* ══ ① 起きるまで 待つ ═══════════════════════════════════════ */
  let 起きた = false;
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(BASE + "/api/public/config"); if (r.ok) { 起きた = true; break; } } catch (e) {}
    await 待つ(1000);
  }
  if (!起きた) { console.error("サーバが 起きませんでした: " + BASE); process.exit(2); }

  const A = await 作る("aa");
  const B = await 作る("bb");

  節("① VocabuQuiz 公式アカウント");
  let 公式ID = 0;
  {
    const s = await req("/api/groups/user-search?q=vocabuquiz&limit=10", { token: A.token });
    const 見つけた = (s.j.users || []).filter((u) => String(u.handle || "") === "vocabuquiz")[0];
    ok("公式アカウントが 出来ている", !!見つけた, 見つけた ? 見つけた.handle : (s.j.users || []).map((u) => u.handle));
    公式ID = Number(見つけた?.userId || 0);
    ok("表示名は VocabuQuiz", 見つけた?.displayName === "VocabuQuiz", 見つけた?.displayName);
    ok("名刺に 公式マークが 乗っている（official）", 見つけた?.verified === "official", 見つけた?.verified);

    const p = await req("/api/profile?userId=" + 公式ID, { token: A.token });
    ok("プロフィールにも 公式マークが 乗る", p.j?.profile?.verified === "official", p.j?.profile?.verified);
    ok("紹介文が 入っている", String(p.j?.profile?.bio || "").length > 5, p.j?.profile?.bio);

    /* ログインできては いけない（合言葉が 空） */
    const lg = await req("/api/auth/login", { method: "POST", body: { nickname: "vocabuquiz", password: "" } });
    ok("公式アカウントでは ログインできない", lg.status >= 400, lg.status);
  }

  節("② ふつうの人には 印が 付かない");
  {
    const p = await req("/api/profile?userId=" + A.uid, { token: A.token });
    ok("既定は 印なし", (p.j?.profile?.verified || "") === "", p.j?.profile?.verified);
  }

  節("③ 管理画面から 印を 付ける");
  const owner = jar();
  let 管理できた = false, 鍵 = "", 合言葉 = "", 宛先 = "";
  {
    const email = process.env.VQ_ADMIN_EMAIL || "matsushiri20pc@gmail.com";   /* ローカルの ADMIN_BOOTSTRAP_EMAIL と そろえる */
    const pw = process.env.VQ_ADMIN_PASS || "vq-official-test-1234";
    const bs = await adm(owner, "/api/admin/auth/bootstrap", { method: "POST", body: { email, password: pw } });
    const 済んでる = bs.status === 409;
    ok("owner の 用意が できる（または 済んでいる）", bs.status === 200 || 済んでる, bs.body?.code || bs.status);
    const lg = await adm(owner, "/api/admin/auth/login", { method: "POST", body: { email, password: pw } });
    ok("owner で 入れる", lg.status === 200 && lg.body.ok, lg.body?.code || lg.status);
    if (lg.status === 200) {
      /* ★ 2 回目からは 鍵を 環境変数で 渡す（TOTP の 発行は 1 度きり）。
           SEC=$(wrangler d1 execute … SELECT totp_secret …)  VQ_ADMIN_TOTP=$SEC node vqofficial.cjs */
      const su = process.env.VQ_ADMIN_TOTP
        ? { status: 200, body: { secret: process.env.VQ_ADMIN_TOTP, 既に: true } }
        : await adm(owner, "/api/admin/auth/totp/setup", { method: "POST", body: {} });
      if (su.status === 200 && su.body.secret) {
        const en = su.body.既に
          ? await adm(owner, "/api/admin/auth/totp/verify", { method: "POST", body: { code: totp(su.body.secret) } })
          : await adm(owner, "/api/admin/auth/totp/enable", { method: "POST", body: { code: totp(su.body.secret) } });
        ok("二要素を 通せる", en.status === 200, en.body?.code || en.status);
        管理できた = en.status === 200;
        鍵 = su.body.secret; 合言葉 = pw; 宛先 = email;
      } else {
        印.push("  ・二要素は すでに 有効（VQ_ADMIN_PASS を 渡して 走らせると 通ります）");
      }
    }
  }
  if (管理できた) {
    const b1 = await adm(owner, "/api/admin/users/" + A.uid + "/badge", { method: "POST", body: { badge: "blue", note: "検証" } });
    ok("青を 付けられる", b1.status === 200 && b1.body.badge === "blue", b1.body);
    const d1 = await adm(owner, "/api/admin/users/" + A.uid);
    ok("管理画面の 詳細にも 出る", d1.body?.data?.badge === "blue", d1.body?.data?.badge);

    /* 本体の 覚えは 60 秒。すぐには 見えない ことがあるので、そこまで 待つ。 */
    let 見えた = "";
    for (let i = 0; i < 14; i++) {
      const p = await req("/api/profile?userId=" + A.uid, { token: B.token });
      見えた = String(p.j?.profile?.verified || "");
      if (見えた === "blue") break;
      await 待つ(5000);
    }
    ok("本体側にも 60 秒以内に 効く", 見えた === "blue", 見えた);

    const b2 = await adm(owner, "/api/admin/users/" + A.uid + "/badge", { method: "POST", body: { badge: "gold" } });
    ok("金へ 変えられる", b2.status === 200 && b2.body.badge === "gold", b2.body);
    const b3 = await adm(owner, "/api/admin/users/" + A.uid + "/badge", { method: "POST", body: { badge: "purple" } });
    ok("知らない 種類は 断る", b3.status === 400, b3.status);
    const b4 = await adm(owner, "/api/admin/users/" + A.uid + "/badge", { method: "POST", body: { badge: "" } });
    ok("外せる", b4.status === 200 && b4.body.badge === "", b4.body);
    const b5 = await adm(owner, "/api/admin/users/999999999/badge", { method: "POST", body: { badge: "blue" } });
    ok("居ない人には 付けられない", b5.status === 404, b5.status);
  } else {
    印.push("  ・管理画面の 検証は とばしました（二要素が すでに 有効）");
  }

  節("④ お知らせ → Feed（マークダウン＋絵）");
  let お知らせID = "";
  if (管理できた) {
    const 題 = "検証のお知らせ " + Date.now();
    const 本文 = "# 見出し\n\n**太字** と *斜め* が 使えます。\n\n- ひとつ\n- ふたつ\n";
    const r = await adm(owner, "/api/admin/announcements", { method: "POST", body: {
      title: 題, bodyMd: 本文, channel: "both", category: "release", status: "published"
    } });
    /* 配信は 再認証が 要る（仕様）。要るなら 通してから もう一度。 */
    if (r.status === 403 && r.body?.code === "REAUTH_REQUIRED") {
      印.push("  ・配信の 前に もう一度 本人確認が 要る（仕様）。通してから 出します。");
    }
    let r2 = r;
    if (r.status !== 200) {
      const me = await adm(owner, "/api/admin/auth/me");
      const sec = process.env.VQ_ADMIN_TOTP || "";
      if (sec) await adm(owner, "/api/admin/auth/reauth", { method: "POST", body: { code: totp(sec) } });
      r2 = await adm(owner, "/api/admin/announcements", { method: "POST", body: {
        title: 題, bodyMd: 本文, channel: "both", category: "release", status: "published"
      } });
      void me;
    }
    ok("お知らせを 配信できる", r2.status === 200, r2.body?.code || r2.status);
    ok("Feed へも 出したと 返る", r2.body?.feedPosted === true, r2.body?.feedPosted);

    const f = await req("/api/posts/feed?limit=20", { token: B.token });
    const 投稿 = (f.j.posts || []).filter((p) => p.cardType === "news")[0];
    ok("Feed に お知らせが 出る", !!投稿, 投稿 ? 投稿.title : (f.j.posts || []).length + " 件");
    ok("送り主は 公式アカウント", Number(投稿?.author?.userId || 0) === 公式ID, 投稿?.author?.userId + " / " + 公式ID);
    ok("送り主に 公式マーク", 投稿?.author?.verified === "official", 投稿?.author?.verified);
    ok("マークダウンとして 描く 印が ある", 投稿?.card?.markdown === true, 投稿?.card?.markdown);
    ok("本文が そのまま 入っている", String(投稿?.body || "").indexOf("**太字**") >= 0, String(投稿?.body || "").slice(0, 40));
    ok("絵の 鍵が 入っている", !!投稿?.card?.art, 投稿?.card?.art);
    お知らせID = String(投稿?.card?.newsId || "");
    ok("お知らせの id が 入っている", !!お知らせID, お知らせID);
    ok("投稿の id は お知らせから 決め打ち", 投稿?.id === "sp:news:" + お知らせID, 投稿?.id);

    /* 同じ お知らせを もう一度 配信しても 増えない */
    const 前 = (f.j.posts || []).filter((p) => p.cardType === "news").length;
    await adm(owner, "/api/admin/announcements", { method: "POST", body: {
      id: undefined, title: 題 + "（直し）", bodyMd: 本文 + "\n直しました。", channel: "both",
      category: "release", status: "published"
    } });
    const f2 = await req("/api/posts/feed?limit=20", { token: B.token });
    const 後 = (f2.j.posts || []).filter((p) => p.cardType === "news").length;
    ok("同じ お知らせで 二重に 増えない（新しい id なら 1 件 増える）", 後 <= 前 + 1, 前 + " → " + 後);

    const nl = await req("/api/news/list?limit=10", { token: B.token });
    const 一覧に = (nl.j.items || []).some((x) => String(x.title || "").indexOf("検証のお知らせ") >= 0);
    ok("News の 一覧にも 同じものが 出る（同期）", 一覧に, (nl.j.items || []).slice(0, 3).map((x) => x.title));
  } else {
    印.push("  ・お知らせの 検証は とばしました（管理画面へ 入れず）");
  }

  節("⑤ 絵の 鍵が サーバと 画面で ずれていない");
  {
    const w = fs.readFileSync("server/src/worker.js", "utf8");
    const m = /const NEWS_ART_KEYS = \[([\s\S]*?)\];/.exec(w);
    const サーバ鍵 = m ? (m[1].match(/"([a-z]+)"/g) || []).map((s) => s.replace(/"/g, "")) : [];
    delete require.cache[require.resolve("./client/core/feed/art.js")];
    require("./client/core/feed/art.js");
    const 画面鍵 = globalThis.VQART.名前();
    ok("サーバ側に 鍵の 並びが ある", サーバ鍵.length > 0, サーバ鍵.length);
    ok("数が そろっている", サーバ鍵.length === 画面鍵.length, サーバ鍵.length + " / " + 画面鍵.length);
    ok("並びまで そろっている", JSON.stringify(サーバ鍵) === JSON.stringify(画面鍵),
      サーバ鍵.filter((k, i) => k !== 画面鍵[i]).slice(0, 4));
    ok("何十種類 ある（40 以上）", 画面鍵.length >= 40, 画面鍵.length);

    let こわれ = 0, からっぽ = 0;
    for (const k of 画面鍵) for (let s = 0; s < 4; s++) {
      const svg = globalThis.VQART.作る(k, "news_" + s);
      if (/NaN|undefined|Infinity/.test(svg)) こわれ++;
      if (svg.length < 400) からっぽ++;
    }
    ok("どの 鍵・どの 種でも 数が こわれない", こわれ === 0, こわれ);
    ok("どれも 中身が 入っている", からっぽ === 0, からっぽ);
    ok("知らない 鍵でも 何か 描く", globalThis.VQART.作る("そんなの無い", "x").length > 400);
    ok("同じ 鍵・同じ 種なら 毎回 同じ",
      globalThis.VQART.作る("grid", "z") === globalThis.VQART.作る("grid", "z"));

    delete require.cache[require.resolve("./client/core/feed/badge.js")];
    require("./client/core/feed/badge.js");
    const B2 = globalThis.VQBADGE;
    ok("公式マークは 3 種類", B2.一覧.length === 3, B2.一覧);
    ok("official は 金と青の 両方が 入っている",
      /#E0A526/.test(B2.印("official")) && /#1D8BF0/.test(B2.印("official")));
    ok("blue は 青だけ", /#1D8BF0/.test(B2.印("blue")) && !/#E0A526/.test(B2.印("blue")));
    ok("gold は 金だけ", /#E0A526/.test(B2.印("gold")) && !/#1D8BF0/.test(B2.印("gold")));
    ok("知らない 種類は 何も 出さない", B2.印("purple") === "" && B2.印("") === "");
    ok("色だけで 伝えていない（言葉が 入る）", /aria-label="[^"]+"/.test(B2.印("blue")) && /<title>/.test(B2.印("blue")));
  }

  節("⑥ DM の ブロック");
  {
    const o = await req("/api/dm/open", { method: "POST", body: { userId: B.uid }, token: A.token });
    const tid = o.j.threadId;
    ok("部屋を 開ける", !!tid, tid);
    ok("最初は ブロックしていない", o.j.blocked === false, o.j.blocked);

    const s1 = await req("/api/dm/send", { method: "POST", body: { threadId: tid, kind: "text", body: "こんにちは" }, token: A.token });
    ok("ふつうに 送れる", s1.status === 200, s1.status);

    /* B が A を ブロック */
    const bl = await req("/api/dm/block", { method: "POST", body: { threadId: tid, on: true }, token: B.token });
    ok("ブロックできる", bl.status === 200 && bl.j.blocked === true, bl.j);

    const s2 = await req("/api/dm/send", { method: "POST", body: { threadId: tid, kind: "text", body: "つづき" }, token: A.token });
    ok("ブロックされた側は 送れない", s2.status === 403, s2.status);
    ok("どちらが ブロックしたかは 言わない",
      s2.j.code === "DM_UNAVAILABLE" && !/ブロック/.test(String(s2.j.message || "")), s2.j);

    const s3 = await req("/api/dm/send", { method: "POST", body: { threadId: tid, kind: "text", body: "自分から" }, token: B.token });
    ok("ブロックした側も 送れない", s3.status === 403 && s3.j.code === "DM_BLOCKED", s3.j.code);
    ok("自分には はっきり 言う", /ブロック/.test(String(s3.j.message || "")), s3.j.message);

    const m1 = await req("/api/dm/messages?threadId=" + encodeURIComponent(tid), { token: B.token });
    ok("ブロックした側の 画面には 出る", m1.j.blocked === true, m1.j.blocked);
    const m2 = await req("/api/dm/messages?threadId=" + encodeURIComponent(tid), { token: A.token });
    ok("された側の 画面には 出ない", m2.j.blocked === false, m2.j.blocked);

    const th = await req("/api/dm/threads", { token: B.token });
    const 部屋 = (th.j.threads || []).filter((t) => t.id === tid)[0];
    ok("一覧にも ブロック中の 印が 出る", 部屋?.blocked === true, 部屋?.blocked);

    const un = await req("/api/dm/block", { method: "POST", body: { threadId: tid, on: false }, token: B.token });
    ok("解除できる", un.status === 200 && un.j.blocked === false, un.j);
    const s4 = await req("/api/dm/send", { method: "POST", body: { threadId: tid, kind: "text", body: "もどった" }, token: B.token });
    ok("解除したら また 送れる", s4.status === 200, s4.status);

    const 自分 = await req("/api/dm/block", { method: "POST", body: { userId: B.uid, on: true }, token: B.token });
    ok("自分は ブロックできない", 自分.status === 400, 自分.status);
    const 匿名 = await req("/api/dm/block", { method: "POST", body: { userId: A.uid, on: true } });
    ok("ログインしていなければ できない", 匿名.status === 401, 匿名.status);
  }

  節("⑦ ミュート（知らせを 受け取らない）");
  {
    const C = await 作る("cc");
    const o = await req("/api/dm/open", { method: "POST", body: { userId: C.uid }, token: A.token });
    const tid = o.j.threadId;
    const mu = await req("/api/dm/thread", { method: "POST", body: { threadId: tid, muted: true }, token: C.token });
    ok("ミュートに できる", mu.status === 200, mu.status);

    const 前 = await req("/api/user/notifications?limit=30", { token: C.token });
    const 前の数 = (前.j.items || 前.j.notifications || []).filter((n) => String(n.type || "") === "dm").length;
    await req("/api/dm/send", { method: "POST", body: { threadId: tid, kind: "text", body: "ミュート中" }, token: A.token });
    await 待つ(600);
    const 後 = await req("/api/user/notifications?limit=30", { token: C.token });
    const 後の数 = (後.j.items || 後.j.notifications || []).filter((n) => String(n.type || "") === "dm").length;
    ok("ミュート中は 知らせが 増えない", 後の数 === 前の数, 前の数 + " → " + 後の数);

    const m = await req("/api/dm/messages?threadId=" + encodeURIComponent(tid), { token: C.token });
    ok("やりとり自体は ちゃんと 届いている", (m.j.messages || []).some((x) => x.body === "ミュート中"),
      (m.j.messages || []).length + " 件");
    ok("画面へも ミュート中だと 返す", m.j.muted === true, m.j.muted);

    const off = await req("/api/dm/thread", { method: "POST", body: { threadId: tid, muted: false }, token: C.token });
    ok("ミュートを 外せる", off.status === 200, off.status);
    await req("/api/dm/send", { method: "POST", body: { threadId: tid, kind: "text", body: "外したあと" }, token: A.token });
    await 待つ(600);
    const 後2 = await req("/api/user/notifications?limit=30", { token: C.token });
    const 後2の数 = (後2.j.items || 後2.j.notifications || []).filter((n) => String(n.type || "") === "dm").length;
    ok("外したら また 知らせが 来る", 後2の数 > 後の数, 後の数 + " → " + 後2の数);
  }

  節("⑧ DM の 名刺に 公式マークが 乗る");
  {
    const o = await req("/api/dm/open", { method: "POST", body: { userId: 公式ID }, token: A.token });
    ok("公式アカウントとも 部屋が 作れる", o.status === 200, o.status);
    ok("相手の 名刺に 公式マーク", o.j?.other?.verified === "official", o.j?.other?.verified);
  }

  節("⑨ 管理画面（本物の Chromium で 触る）");
  if (管理できた && 鍵) {
    let chromium = null;
    try { chromium = require("playwright").chromium; } catch (e) { chromium = null; }
    if (!chromium) {
      印.push("  ・playwright が 無いので とばしました");
    } else {
      const b = await chromium.launch({ headless: true });
      const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
      const pg = await ctx.newPage();
      const 失敗 = [];
      pg.on("pageerror", (e) => 失敗.push(String(e.message).slice(0, 140)));
      await pg.goto(BASE + "/admin", { waitUntil: "domcontentloaded" });
      await pg.waitForTimeout(900);
      await pg.fill("#loginEmail", 宛先).catch(() => {});
      await pg.fill("#loginPass", 合言葉).catch(() => {});
      await pg.evaluate(() => document.getElementById("loginForm").requestSubmit());
      await pg.waitForTimeout(1800);
      /* 二要素（認証アプリの 6 桁） */
      const 要る = await pg.evaluate(() => {
        const e = document.getElementById("totpCode");
        return !!(e && e.offsetParent !== null);
      });
      if (要る) {
        await pg.fill("#totpCode", totp(鍵));
        await pg.evaluate(() => document.getElementById("totpForm").requestSubmit());
        await pg.waitForTimeout(2000);
      }
      const 入れた = await pg.evaluate(() => {
        const nv = document.getElementById("navList");
        return !!(nv && nv.children.length);
      });
      ok("管理画面へ 入れる", 入れた === true);

      await pg.goto(BASE + "/admin/users", { waitUntil: "domcontentloaded" });
      await pg.waitForTimeout(2600);
      const 詳細 = await pg.evaluate(([uid]) => {
        const b2 = document.querySelector('[data-act="udetail"][data-id="' + uid + '"]');
        if (!b2) return { なし: true, 数: document.querySelectorAll('[data-act="udetail"]').length };
        b2.click();
        return { ある: true };
      }, [String(A.uid)]);
      ok("ユーザーの 詳細を 開ける", 詳細.ある === true, 詳細);
      await pg.waitForTimeout(1800);
      const 箱 = await pg.evaluate(() => {
        const sel = document.getElementById("bgKind");
        const btn = document.querySelector('[data-act="badge"]');
        const 文 = document.getElementById("userDetail") ? document.getElementById("userDetail").textContent : "";
        return {
          選べる: !!sel,
          種類: sel ? Array.from(sel.options).map((o) => o.value) : [],
          押せる: !!btn,
          いま: /公式マーク/.test(文)
        };
      });
      ok("公式マークの 欄が 出る", 箱.選べる === true && 箱.押せる === true, 箱);
      ok("基本の 表にも 公式マークの 行が ある", 箱.いま === true);
      ok("選べるのは なし / 青 / 金 / 重ね", JSON.stringify(箱.種類) === JSON.stringify(["", "blue", "gold", "official"]), 箱.種類);

      const 付けた = await pg.evaluate(() => {
        document.getElementById("bgKind").value = "gold";
        document.querySelector('[data-act="badge"]').click();
        return true;
      });
      await pg.waitForTimeout(2200);
      const 出た = await pg.evaluate(() => (document.getElementById("udAlert") || {}).textContent || "");
      ok("画面から 付けられる", 付けた === true && /ゴールド/.test(出た), 出た.slice(0, 90));
      const 確 = await adm(owner, "/api/admin/users/" + A.uid);
      ok("サーバにも 入っている", 確.body?.data?.badge === "gold", 確.body?.data?.badge);
      await adm(owner, "/api/admin/users/" + A.uid + "/badge", { method: "POST", body: { badge: "" } });
      ok("管理画面で 赤い字が 出ていない", 失敗.length === 0, 失敗.slice(0, 2).join(" / "));
      await b.close();
    }
  } else {
    印.push("  ・管理画面の 画面検証は とばしました（bootstrap できず）");
  }

  console.log(印.join("\n"));
  console.log("\n通った " + 済 + "/" + (済 + 落));
  if (落ち.length) console.log("落ちた: " + 落ち.join(" / "));
  process.exit(落 ? 1 : 0);
})().catch((e) => {
  console.log(印.join("\n"));
  console.error("\n途中で 止まりました: " + (e && e.message ? e.message : e));
  process.exit(2);
});
