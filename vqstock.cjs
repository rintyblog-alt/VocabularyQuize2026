#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   vqstock.cjs — 参考資料（自由に 使える 絵）を 探して 取り込む

   訴え（2026-08-28）
     「生成時に、スライドに 新たに 参考資料（フリーのものを ネットから
       持ってきたり）… これは プレゼンだけじゃないからな？ 他の 3 つも そう」

   ここで 見ること:
     ① ログインが 要る
     ② 実際に **外から 見つかる**（Wikimedia Commons / Openverse）
     ③ **決まり（ライセンス）と 作者が 必ず 付く**（CC-BY の 決まりのため）
     ④ 取り込むと こちらの 置き場（/api/media/…）へ 入る
     ⑤ **探した結果に 無い 住所は 取り込めない**（中継に されない）
     ⑥ 内側の 住所は 断る（SSRF）

   使い方: node vqstock.cjs   （先に server/dev-local.sh echo 8791）
   ══════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_API || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ok   " + n); }
  else { fail++; bad.push(n); console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 260) : "")); }
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
async function 人を作る() {
  const nick = "stk" + Date.now().toString(36).slice(-6) + Math.floor(Math.random() * 90 + 10);
  const r = await api("POST", "/api/auth/register",
    { gradePrefix: "H1", nickname: nick, password: "DevStk#2026a", tosAccepted: true, tosVersion: "1" });
  if (!r.data.token) throw new Error("検証アカウントを作れません");
  return r.data.token;
}

(async () => {
  console.log("接続先: " + BASE);
  const 札 = await 人を作る();

  節("① 札が 無ければ 断る");
  ok("探すのは ログイン必須", (await api("POST", "/api/stock/find", { q: "cat" })).status === 401);
  ok("取り込むのも ログイン必須", (await api("POST", "/api/stock/adopt", { url: "https://x/y.png" })).status === 401);

  節("② 実際に 外から 見つかる");
  const f = await api("POST", "/api/stock/find", { q: "photosynthesis diagram", limit: 8 }, 札);
  ok("探せる", f.status === 200 && f.data.ok === true, { status: f.status });
  const 絵 = f.data.images || [];
  console.log("     提供元: " + JSON.stringify(f.data.提供元) + " / 件数 " + 絵.length
    + (f.data.落ちた && f.data.落ちた.length ? " / 落ちた: " + JSON.stringify(f.data.落ちた) : ""));
  ok("1 件以上 見つかる", 絵.length > 0, 絵.length);
  ok("提供元が 2 つとも 生きている",
    (f.data.提供元 || []).length === 2, f.data.提供元);
  ok("空の 言葉は 断る",
    (await api("POST", "/api/stock/find", { q: "  " }, 札)).status === 400);

  節("③ 決まりと 作者が 必ず 付く（CC の 条件）");
  const 欠 = 絵.filter((x) => !x.license || !x.url || !x.page);
  ok("すべてに 決まり・住所・出どころの頁が 付く", 欠.length === 0,
    欠.slice(0, 2).map((x) => x.title));
  const 変 = 絵.filter((x) => !/^(cc|by|public domain|pd|cc0)/i.test(String(x.license || "")));
  ok("自由に 使えると 分かるものだけ", 変.length === 0,
    変.slice(0, 3).map((x) => x.license));
  ok("取り込みの 印が 付いている",
    絵.every((x) => typeof x.取り込み印 === "string" && x.取り込み印.length >= 16));
  ok("決まりを 守れと 書いてある", /出典|作者/.test(String(f.data.決まり || "")), f.data.決まり);

  節("④ 取り込むと こちらの 置き場へ 入る");
  const 選 = 絵[0];
  const a = await api("POST", "/api/stock/adopt", {
    url: 選.url, 印: 選.取り込み印, author: 選.author, license: 選.license,
    licenseUrl: 選.licenseUrl, page: 選.page, source: 選.source
  }, 札);
  ok("取り込める", a.status === 200 && a.data.ok === true, { status: a.status, d: a.data });
  ok("こちらの 住所に なる", /^\/api\/media\//.test(String(a.data.url || "")), a.data.url);
  ok("中身が 入っている", Number(a.data.bytes || 0) > 500, a.data.bytes);
  ok("出どころを そのまま 返す",
    a.data.credit && a.data.credit.license === 選.license, a.data.credit);
  if (a.data.url) {
    const r = await fetch(BASE + a.data.url);
    const ct = r.headers.get("content-type") || "";
    ok("その住所で 実際に 絵が 出る", r.ok && /^image\//.test(ct), { status: r.status, ct });
  }

  節("⑤ 中継に されない（探した結果に 無い 住所）");
  const 無印 = await api("POST", "/api/stock/adopt",
    { url: "https://upload.wikimedia.org/wikipedia/commons/1/1a/x.png" }, 札);
  ok("印が 無ければ 断る", 無印.status === 400 && 無印.data.code === "NOT_FROM_SEARCH", 無印.data);
  const 偽印 = await api("POST", "/api/stock/adopt",
    { url: "https://example.test/a.png", 印: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" }, 札);
  ok("でたらめな 印でも 断る", 偽印.status === 400, 偽印.data);
  /* 別の 絵の 印を 使い回せない */
  if (絵.length >= 2) {
    const 取違 = await api("POST", "/api/stock/adopt",
      { url: 絵[1].url, 印: 絵[0].取り込み印 }, 札);
    ok("別の 絵の 印は 通らない", 取違.status === 400, 取違.data);
  }

  節("⑥ 内側の 住所は 断る（SSRF）");
  for (const u of ["http://127.0.0.1:8791/api/auth/me",
                   "http://169.254.169.254/latest/meta-data/",
                   "http://localhost/admin"]) {
    const r = await api("POST", "/api/stock/adopt", { url: u, 印: "x" }, 札);
    ok("内側へ 行かない: " + u.slice(0, 40), r.status === 400, r.data);
  }

  console.log("\n────────────────────────────────");
  console.log("  ok " + pass + " / NG " + fail);
  if (bad.length) console.log("  落ちたもの:\n   - " + bad.join("\n   - "));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
