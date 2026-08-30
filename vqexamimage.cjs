/* ══════════════════════════════════════════════════════════════════════════
   vqexamimage.cjs — **AI が 外から 画像を 持ってきて 資料に する**

   訴え（2026-08-30・Rinty さん）
     「AI が 外部から 画像を 持ってきて、画像資料として 出題できる ものも 作ったり」

   決めたこと:
     ★ **AI に 画像の 住所を 書かせない。** 作り話の URL を 書いてくるだけで、
       印刷では 取りに 行けず 白い 四角に なる（前に 踏んだ）。
       AI が 出すのは **探す 言葉**（imageQuery）だけ。
     ★ 取り先は Wikimedia Commons **だけ**（鍵が 要らず、出典と 許諾が
       機械で 読める）。**許諾の 読めない 画像は 使わない。**
     ★ 出典・作者・許諾を 必ず 図に 添える。
     ★ 取れなかった 図は 落とす（白い 四角を 出さない）。

   使い方: VQ_BASE=http://127.0.0.1:9002 node vqexamimage.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "http://127.0.0.1:9002";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const j = (r) => r.json().catch(() => ({}));
let 済 = 0, 落 = 0; const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + String(追).slice(0, 200) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + String(追).slice(0, 320) : "")); }
};
async function 札() {
  const 印 = Date.now().toString(36) + Math.floor(Math.random() * 9999);
  const r = await fetch(BASE + "/api/auth/register/start", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "gi" + 印 + "@gmail.com", gradePrefix: "H2", nickname: ("g" + 印).slice(0,14), password: "Passw0rd!z3" }) }).then(j);
  const v = await fetch(BASE + "/api/auth/register/verify", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challengeId: r.challengeId, code: r.devCode }) }).then(j);
  const c = await fetch(BASE + "/api/auth/register/consent", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ registrationSession: v.registrationSession, agreeTerms: true, agreePrivacy: true, agreeAge: true, pin: "1379" }) }).then(j);
  if (!c.token) throw new Error("札が 取れない");
  return c.token;
}

(async () => {
  console.log("測る先:", BASE);
  const tok = await 札();
  const 打 = (body) => fetch(BASE + "/api/exam/image", { method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok },
    body: JSON.stringify(body) }).then(j);

  節("① 実際に 外から 取ってくる");
  const t0 = Date.now();
  const g = await 打({ queries: ["Mount Fuji", "alluvial fan aerial"] });
  const ms = Date.now() - t0;
  見(g && g.ok, "口が 開いている", g && (g.ok ? "ok" : g.message));
  const 取 = ((g && g.results) || []).filter((x) => x.ok);
  見(取.length >= 1, "★ 1 枚以上 取れる", 取.length + " / " + ((g.results || []).length) + "（" + ms + "ms）");
  取.forEach((x) => {
    const im = x.image;
    見(/^data:image\/(png|jpeg|gif|webp);base64,/.test(im.dataUrl),
       "★ そのまま 紙に 貼れる 形（data:）", x.query + " → " + im.dataUrl.slice(0, 24) + "…");
    見(!!im.license, "★ 許諾が 付いてくる", x.query + " → " + im.license);
    見(!!im.source && !!im.page, "★ 出典（どこの 何か）も 付いてくる", im.source);
    見(im.bytes > 0 && im.bytes <= 1.5 * 1024 * 1024, "★ 大きさが 上限（1.5MB）以内",
       Math.round(im.bytes / 1024) + "KB");
  });

  節("② 探す言葉が 無い／変な ときは 断る");
  const a = await 打({});
  見(a && a.ok !== true, "★ 言葉が 無ければ 断る", a && (a.code || a.message));
  const b = await 打({ queries: ["ｚｚｚどう考えても存在しない語句9999"] });
  const 無 = ((b && b.results) || [])[0];
  見(b && b.ok === true, "口は 200 で 返る");
  見(無 && 無.ok === false, "★ 見つからなければ「無い」と 返す（作り話を しない）",
     無 && 無["なぜ"]);

  節("③ 許諾の 読めない ものは 混ぜない");
  {
    /* 取れた もの すべてに 許諾が 付いていること。1 つでも 空なら 落ちる。 */
    const 全 = ((g && g.results) || []).filter((x) => x.ok).map((x) => x.image.license);
    見(全.length === 0 || 全.every(Boolean), "★ 許諾の 無い 画像は 1 枚も 混ざらない",
       全.join(" / ") || "（取れた 画像なし）");
  }

  節("④ 画面の 側：AI には 言葉だけ 書かせる");
  {
    const fs = require("fs");
    const m = fs.readFileSync("js-src/vq-make.js", "utf8");
    const w = fs.readFileSync("server/src/worker.js", "utf8");
    const c = fs.readFileSync("js-src/vq2-app.b85018b5b8.js", "utf8");
    見(/外の画像を入れる/.test(m), "画面に 取り込みの 段取りが ある");
    見(/imageQuery/.test(c), "資料の 受け取りが imageQuery を 通す");
    見(/URL は 書かないでください/.test(w), "★ AI に「URL は 書くな」と 言っている");
    見(/wikimedia\\\\.org/.test(w) || /wikimedia\.org/.test(w), "★ 取り先を Commons に 絞っている");
    見(/画像の許諾/.test(w), "★ 許諾の 見張りが ある");
  }

  console.log("\n────────────────────────────");
  console.log("通った: " + 済 + " / 落ちた: " + 落);
  if (落ち.length) console.log("落ちたもの:\n  - " + 落ち.join("\n  - "));
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error("ERR", String(e && e.message || e)); process.exit(1); });
