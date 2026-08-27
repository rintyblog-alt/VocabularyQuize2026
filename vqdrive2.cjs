/* ══════════════════════════════════════════════════════════════════════
   vqdrive2.cjs — Google Drive 連携（2026-08-27）

   訴え:
     「Google Drive というのは、ユーザーが VocabuQuiz と 連携をして、
       個人個人で プリセットを そこに 保存させる 仕組み。
       カバー画像も あれば それも そこに 一緒に 保存させるようにする。
       目的は、VocabuQuiz 自体の サーバー（Cloudflare 自体の 容量を
       減らすため）が 目的」

   ここで 見ること:
     ① 設定が 無いときに **黙らない**（何が 足りないか 言う）
     ② 許しは drive.file だけ・毎回 同意を 聞く（refresh token のため）
     ③ **他所へ 飛ばせない**（戻り先は 決め打ちの中だけ）
        ← ここが いちばん 大事。開いた 踏み台に なると 実害が 出る
     ④ 繋がっていないのに 置こうとしたら はっきり 断る
     ⑤ 札は 生のまま しまわない（鍵をかけて しまう）
     ⑥ 容量の 画面に Drive の 欄が 出る

   本物の Google は 叩かない（合言葉を 持っていないため）。
   Google と やりとりする 手前までを すべて 確かめる。

   使い方: node vqdrive2.cjs   （先に server/dev-local.sh echo 8791）
   ══════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs");
const BASE = process.env.VQ_API || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ok   " + n); }
  else { fail++; bad.push(n); console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 300) : "")); }
};
const 節 = (t) => console.log("\n══ " + t + " ══");

async function api(method, path, body, token, opts) {
  const h = { "Content-Type": "application/json" };
  if (token) h.Authorization = "Bearer " + token;
  const r = await fetch(BASE + path, { method, headers: h, redirect: "manual",
    body: body === undefined ? undefined : JSON.stringify(body), ...(opts || {}) });
  const t = await r.text();
  let d = null; try { d = t ? JSON.parse(t) : null; } catch (e) { d = { raw: t.slice(0, 200) }; }
  return { status: r.status, data: d || {}, headers: r.headers, raw: t };
}
async function 人を作る(印) {
  const nick = 印 + Date.now().toString(36).slice(-6) + Math.floor(Math.random() * 90 + 10);
  const r = await api("POST", "/api/auth/register",
    { gradePrefix: "H1", nickname: nick, password: "DevDrv#2026a", tosAccepted: true, tosVersion: "1" });
  if (!r.data.token) throw new Error("検証アカウントを作れません: " + JSON.stringify(r.data).slice(0, 200));
  return { nick, token: r.data.token };
}

(async () => {
  console.log("接続先: " + BASE);
  const 私 = await 人を作る("drv");
  console.log("検証アカウント: " + 私.nick);

  節("① 札が 無ければ 断る");
  ok("状態は ログイン必須", (await api("GET", "/api/drive/status")).status === 401);
  ok("つなぐのも ログイン必須", (await api("POST", "/api/drive/connect", {})).status === 401);
  ok("預けるのも ログイン必須", (await api("PUT", "/api/drive/preset", { id: "x" })).status === 401);

  節("② いまの 状態");
  const st = await api("GET", "/api/drive/status", undefined, 私.token);
  ok("状態が 返る", st.status === 200 && st.data.ok === true, st.data);
  const 使える = !!st.data.使える;
  console.log("     設定の有無: " + (使える ? "そろっている" : "足りない → " + JSON.stringify(st.data.足りない設定)));
  ok("まだ つながっていない", st.data.つながっている === false, st.data);
  if (!使える) {
    ok("何が 足りないかを 名前で 返す",
      Array.isArray(st.data.足りない設定) && st.data.足りない設定.length > 0, st.data.足りない設定);
  }

  節("③ つなぐ 入口");
  const cn = await api("POST", "/api/drive/connect", {}, 私.token);
  if (!使える) {
    ok("設定が 無いときは 503 で はっきり 断る", cn.status === 503, cn.data);
    ok("断り文に 足りないものが 入っている",
      Array.isArray(cn.data.足りない) && cn.data.足りない.length > 0, cn.data);
  } else {
    ok("入口の URL が 返る", cn.status === 200 && typeof cn.data.url === "string", cn.data);
    const u = new URL(cn.data.url || "https://x.invalid/");
    ok("行き先は Google", u.origin === "https://accounts.google.com", u.origin);
    ok("許しは drive.file **だけ**",
      u.searchParams.get("scope") === "https://www.googleapis.com/auth/drive.file",
      u.searchParams.get("scope"));
    ok("あとから 使えるように offline", u.searchParams.get("access_type") === "offline");
    ok("毎回 同意を 聞く（これが 無いと 2 回目に 札が 来ない）",
      u.searchParams.get("prompt") === "consent");
    ok("state が 付いている", (u.searchParams.get("state") || "").length >= 20);
    ok("戻り先は 決め打ち（頼みから 組み立てない）",
      (u.searchParams.get("redirect_uri") || "").endsWith("/api/drive/callback"),
      u.searchParams.get("redirect_uri"));

    節("④ **他所へ 飛ばせない**（踏み台に させない）");
    const 悪 = await api("POST", "/api/drive/connect",
      { returnTo: "https://evil.example.test/steal" }, 私.token);
    ok("悪い戻り先を 出しても 入口は 作れる", 悪.status === 200, 悪.data);
    const 悪state = new URL(悪.data.url).searchParams.get("state");
    const 戻 = await fetch(BASE + "/api/drive/callback?error=access_denied&state="
      + encodeURIComponent(悪state), { redirect: "manual" });
    const 行 = String(戻.headers.get("location") || "");
    ok("戻り先が evil.example.test に ならない", 行.indexOf("evil.example.test") < 0, 行);
    ok("戻り先は 決めた 置き場", /^https?:\/\/(127\.0\.0\.1|localhost|vocabuquiz\.app|www\.vocabuquiz\.app)/.test(行), 行);
    ok("やめたことが 分かる形で 戻る", /drive=cancel/.test(行), 行);
  }

  節("⑤ state の 使い回しと 出まかせ");
  const で = await fetch(BASE + "/api/drive/callback?code=abc&state=でたらめ", { redirect: "manual" });
  const で行 = String(で.headers.get("location") || "");
  ok("知らない state は 通さない", /drive=(bad|notready)/.test(で行), で行);
  ok("知らない state でも 他所へ 飛ばない",
    /^https?:\/\/(127\.0\.0\.1|localhost|vocabuquiz\.app|www\.vocabuquiz\.app)/.test(で行), で行);

  節("⑥ つながっていないのに 預けようとしたら");
  const put = await api("PUT", "/api/drive/preset",
    { id: "p-test", name: "検証", value: JSON.stringify({ id: "p-test" }) }, 私.token);
  ok("409 で はっきり 断る", put.status === 409, { status: put.status, data: put.data });
  ok("断り文が 日本語で 分かる", /つながっていません/.test(String(put.data.message || "")), put.data);

  節("⑦ 一覧・取り出し・外す");
  const li = await api("GET", "/api/drive/preset", undefined, 私.token);
  ok("一覧は 空で 返る（落ちない）", li.status === 200 && Array.isArray(li.data.presets), li.data);
  const g1 = await api("GET", "/api/drive/preset?id=ないもの", undefined, 私.token);
  ok("無いものは 404", g1.status === 404, g1.data);
  const un = await api("POST", "/api/drive/unlink", undefined, 私.token);
  ok("外すのは いつでも 通る", un.status === 200 && un.data.ok === true, un.data);
  ok("外しても Drive の中身は 消さないと 書いてある",
    /消しません|そのまま/.test(String(un.data.message || "")), un.data);

  節("⑧ 容量の 画面に Drive の 欄が 出る");
  const us = await api("GET", "/api/storage/usage", undefined, 私.token);
  ok("容量が 返る", us.status === 200 && us.data.ok === true, { status: us.status });
  ok("drive の 欄が ある", us.data.drive && typeof us.data.drive === "object", us.data.drive);
  ok("つながっていないと false", us.data.drive && us.data.drive.つながっている === false, us.data.drive);
  ok("こちらから 出した ぶんが 0", us.data.drive
    && us.data.drive.こちらから出した && us.data.drive.こちらから出した.bytes === 0, us.data.drive);

  節("⑨ 札の しまいかた（元の コードを 見る）");
  const src = fs.readFileSync(__dirname + "/server/src/worker.js", "utf8");
  ok("札は 鍵をかけて しまう（AES-GCM）",
    /async function driveSeal\(env, 文\) \{[\s\S]{0,400}AES-GCM/.test(src));
  ok("鍵が 無ければ 機能ごと 出さない",
    /if \(key\.length < 16\) 足りない\.push\("DRIVE_TOKEN_KEY"\);/.test(src));
  ok("生の refresh token を そのまま 入れる 書き方が 無い",
    !/token_enc[^\n]*j\.refresh_token/.test(src) && /driveSeal\(env, String\(j\.refresh_token\)\)/.test(src));
  ok("Google 側で 取り消されたら 繋がりを 外す",
    /invalid_grant/.test(src) && /Google 側で 連携が 取り消されました/.test(src));
  /* 中身を そのまま 探す。返事の どこにも Google の 札が 混ざっていないこと。
     文字を 見るのではなく **返ってきた ものを 見る**（作りが 変わっても 効く）。 */
  const 札くさい = (o, 道) => {
    道 = 道 || "";
    if (o == null) return "";
    if (typeof o === "string") {
      if (/^ya29\.|^1\/\/|refresh_token|access_token/.test(o)) return 道 + " の中身";
      return "";
    }
    if (typeof o !== "object") return "";
    for (const k of Object.keys(o)) {
      if (/token|secret|refresh|credential/i.test(k)) return 道 + "." + k;
      const r = 札くさい(o[k], 道 + "." + k);
      if (r) return r;
    }
    return "";
  };
  const 見た = [];
  for (const [名, r] of [["status", st], ["connect", cn], ["preset一覧", li],
                          ["preset置き", put], ["unlink", un], ["usage", us]]) {
    const 出 = 札くさい(r.data, 名);
    if (出) 見た.push(出);
  }
  ok("どの返事にも Google の 札が 混ざっていない", 見た.length === 0, 見た);

  節("⑩ 置き場の 選びかた");
  ok("Drive を つないでいれば まず そちら",
    /if \(driveOn && bytes <= DRIVE_ONE_MAX\) return "drive";/.test(src));
  ok("Drive ぶんは Cloudflare の 使用量に 数えない",
    /FROM media_uploads WHERE backend <> 'drive' GROUP BY b/.test(src));
  ok("1 人あたりの 枠からも 除く",
    /backend NOT IN \('lost','drive'\)/.test(src));
  ok("読むときは Worker を 通す",
    /記録 === "drive"/.test(src) && /driveGet\(env, 持, "media:" \+ key\)/.test(src));

  節("⑪ 鍵を かけた 札が 本当に 開くか");
  /* miniflare の D1 は **外から 書いた ぶんを 見ない**（実測 2026-08-27:
     sqlite ファイルへ 直に 入れても サーバからは 見えなかった）ので、
     ここは 端から端ではなく **しまう／開く の 2 つの 関数そのもの**を
     取り出して 動かす。書き写さず、worker.js の 本文を そのまま 使う。 */
  {
    const 取る = (名) => {
      const i0 = src.indexOf("function " + 名 + "(");
      const i1 = src.indexOf("async function " + 名 + "(");
      const 頭 = i1 >= 0 && (i0 < 0 || i1 < i0) ? i1 : i0;
      if (頭 < 0) throw new Error("見つからない: " + 名);
      let d = 0, k = src.indexOf("{", 頭), 終 = k;
      for (; 終 < src.length; 終++) {
        if (src[終] === "{") d++;
        else if (src[終] === "}") { d--; if (!d) { 終++; break; } }
      }
      return src.slice(頭, 終);
    };
    const 部 = [取る("bytesToBase64Url"), 取る("base64UrlToBytes"),
                取る("driveKey"), 取る("driveSeal"), 取る("driveOpen")].join("\n");
    const f = new Function("crypto", 部 + "\nreturn { driveSeal, driveOpen };")(globalThis.crypto);
    const 鍵1 = { DRIVE_TOKEN_KEY: "この鍵はローカル検証のためだけのもの-0827" };
    const 鍵2 = { DRIVE_TOKEN_KEY: "べつのかぎ-0827" };
    const 中身 = "1//でたらめな-refresh-token-検証用";
    const 封 = await f.driveSeal(鍵1, 中身);
    ok("封は 中身を そのまま 含まない", 封.indexOf("refresh") < 0 && 封.indexOf(中身) < 0, 封.slice(0, 40));
    ok("封は 毎回 違う（同じ 中身でも）", (await f.driveSeal(鍵1, 中身)) !== 封);
    ok("同じ鍵なら 開く", (await f.driveOpen(鍵1, 封)) === 中身);
    ok("違う鍵では 開かない（空を 返す）", (await f.driveOpen(鍵2, 封)) === "");
    ok("いじられた 封は 開かない",
      (await f.driveOpen(鍵1, 封.slice(0, -3) + "AAA")) === "");
    ok("でたらめは 落ちずに 空", (await f.driveOpen(鍵1, "###")) === "");
  }

  console.log("\n────────────────────────────────");
  console.log("  ok " + pass + " / NG " + fail);
  if (bad.length) console.log("  落ちたもの:\n   - " + bad.join("\n   - "));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
