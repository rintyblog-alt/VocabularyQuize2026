/* ══════════════════════════════════════════════════════════════════════════
   vqnewsmedia.cjs — お知らせに 画像・動画を 添える／通知にも 送る（2026-08-20）

   訴え:
     「ダッシュボードから、通知の方にも アップロードできるようにして。
       今は News だけだからさ。
       あと、画像や 動画は アップできないの？
       動画の 再生バーとかは News の 表示でも Feed と 同じものを 使いたい」

   ★ 2 回目からは 鍵を 渡して 走らせる:
       VQ_ADMIN_TOTP=$(… SELECT totp_secret …) node vqnewsmedia.cjs

   本番では 走らせない。
   ══════════════════════════════════════════════════════════════════════════ */
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

let 済 = 0, 落 = 0; const 印 = []; const 落ち = [];
function ok(名, 真, 補) {
  if (真) { 済++; 印.push("  ✅ " + 名 + (補 === undefined ? "" : "  " + 短(補))); }
  else { 落++; 落ち.push(名); 印.push("  ❌ " + 名 + (補 === undefined ? "" : "  → " + 短(補))); }
}
function 短(v) { const s = typeof v === "string" ? v : JSON.stringify(v); return String(s).slice(0, 220); }
function 節(t) { 印.push("\n── " + t + " " + "─".repeat(Math.max(0, 54 - t.length))); }
function 待つ(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function req(p, { method = "GET", body, token } = {}) {
  const h = { "content-type": "application/json" };
  if (token) h.authorization = "Bearer " + token;
  const r = await fetch(BASE + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, j: await r.json().catch(() => ({})) };
}
let n = 0;
async function 作る() {
  n++;
  const tag = `nm${Date.now().toString(36)}${n}`;
  const s = await req("/api/auth/register/start", { method: "POST",
    body: { email: `vqnm.${tag}@gmail.com`, gradePrefix: "H2", nickname: "nm" + tag, password: "Testing!2345" } });
  if (!s.j.devCode) throw new Error("devCode が返りません: " + JSON.stringify(s.j).slice(0, 160));
  const v = await req("/api/auth/register/verify", { method: "POST", body: { challengeId: s.j.challengeId, code: s.j.devCode } });
  const c = await req("/api/auth/register/consent", { method: "POST",
    body: { registrationSession: v.j.registrationSession, agreeTerms: true, agreePrivacy: true, agreeAge: true, pin: "482913" } });
  const me = await req("/api/auth/me", { token: c.j.token });
  return { token: c.j.token, uid: Number(me.j?.user?.id || me.j?.id || 0) };
}

function jar() { return { c: {} }; }
async function adm(j, p, { method = "GET", body, raw, type, name } = {}) {
  const h = { "x-vq-admin": "1" };
  if (!raw) h["content-type"] = "application/json";
  else {
    h["content-type"] = type || "application/octet-stream";
    h["x-file-name"] = encodeURIComponent(name || "file");
  }
  const ck = Object.keys(j.c).map((k) => k + "=" + j.c[k]).join("; ");
  if (ck) h.cookie = ck;
  const r = await fetch(BASE + p, { method, headers: h,
    body: raw ? raw : (body ? JSON.stringify(body) : undefined), redirect: "manual" });
  for (const [k, v] of r.headers) {
    if (k.toLowerCase() !== "set-cookie") continue;
    for (const one of String(v).split(/,(?=[^;]+=)/)) {
      const m = /^\s*([^=]+)=([^;]*)/.exec(one);
      if (m) j.c[m[1].trim()] = m[2];
    }
  }
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
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
function totp(secret) {
  const key = b32d(secret);
  const c = Math.floor(Date.now() / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(c / 4294967296), 0); buf.writeUInt32BE(c >>> 0, 4);
  const hm = crypto.createHmac("sha1", key).update(buf).digest();
  const o = hm[hm.length - 1] & 0xf;
  const v = ((hm[o] & 0x7f) << 24) | (hm[o + 1] << 16) | (hm[o + 2] << 8) | hm[o + 3];
  return String(v % 1000000).padStart(6, "0");
}

/* 検証に 使う 中身。**本物の 見分け（先頭の 目印）を 通す**もの。 */
function ちいさい画像() {
  /* 1×1 の PNG */
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64");
}
function ちいさい動画() {
  const box = (type, payload) => {
    const b = Buffer.alloc(8 + payload.length);
    b.writeUInt32BE(8 + payload.length, 0); b.write(type, 4, "ascii"); payload.copy(b, 8);
    return b;
  };
  return Buffer.concat([
    box("ftyp", Buffer.concat([Buffer.from("isom", "ascii"), Buffer.from([0, 0, 2, 0]),
      Buffer.from("isomiso2avc1mp41", "ascii")])),
    box("free", Buffer.alloc(64)), box("moov", Buffer.alloc(128)), box("mdat", Buffer.alloc(256))
  ]);
}

(async () => {
  /* ══ 用意 ══════════════════════════════════════════════════ */
  const owner = jar();
  const email = process.env.VQ_ADMIN_EMAIL || "matsushiri20pc@gmail.com";
  const pw = process.env.VQ_ADMIN_PASS || "vq-official-test-1234";
  await adm(owner, "/api/admin/auth/bootstrap", { method: "POST", body: { email, password: pw } });
  const lg = await adm(owner, "/api/admin/auth/login", { method: "POST", body: { email, password: pw } });
  let 鍵 = process.env.VQ_ADMIN_TOTP || "";
  if (!鍵) {
    const su = await adm(owner, "/api/admin/auth/totp/setup", { method: "POST", body: {} });
    鍵 = su.body && su.body.secret ? su.body.secret : "";
    if (鍵) await adm(owner, "/api/admin/auth/totp/enable", { method: "POST", body: { code: totp(鍵) } });
  } else {
    await adm(owner, "/api/admin/auth/totp/verify", { method: "POST", body: { code: totp(鍵) } });
  }
  if (lg.status !== 200 || !鍵) {
    console.error("管理画面へ 入れませんでした。VQ_ADMIN_TOTP で 鍵を 渡してください。");
    process.exit(2);
  }
  await adm(owner, "/api/admin/auth/reauth", { method: "POST", body: { code: totp(鍵) } });
  const A = await 作る();

  節("① 管理から 画像・動画を あげられる");
  let 画像URL = "", 動画URL = "";
  {
    const im = await adm(owner, "/api/admin/upload", { method: "POST", raw: ちいさい画像(), type: "image/png", name: "t.png" });
    ok("画像を あげられる", im.status === 200 && !!im.body.url, im.body);
    ok("置き場は 自分のところ（/api/media/img/）", /^\/api\/media\/img\//.test(String(im.body.url || "")), im.body.url);
    画像URL = String(im.body.url || "");

    const vi = await adm(owner, "/api/admin/upload", { method: "POST", raw: ちいさい動画(), type: "video/mp4", name: "t.mp4" });
    ok("動画を あげられる", vi.status === 200 && !!vi.body.url, vi.body);
    ok("動画だと 分かっている", vi.body.kind === "video", vi.body.kind);
    ok("置き場は /api/media/vid/", /^\/api\/media\/vid\//.test(String(vi.body.url || "")), vi.body.url);
    動画URL = String(vi.body.url || "");

    const ng = await adm(owner, "/api/admin/upload", { method: "POST",
      raw: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>", "utf8"), type: "image/svg+xml", name: "x.svg" });
    ok("SVG は 受けない（他の人の 画面で 動かせてしまうため）", ng.status === 415, ng.status);

    const 出せる = await fetch(BASE + 画像URL);
    ok("あげた 画像が そのまま 取れる", 出せる.status === 200, 出せる.status);
  }

  節("② お知らせに 添えて 配信する（通知にも）");
  const 題 = "添えもののたしかめ " + Date.now();
  let ニュースID = "";
  {
    const r = await adm(owner, "/api/admin/announcements", { method: "POST", body: {
      title: 題, bodyMd: "画像と 動画を 添えました。\n\n**太字** も 使えます。",
      channel: "both", category: "release", status: "published",
      media: [{ url: 画像URL, name: "t.png" }, { url: 動画URL, name: "t.mp4" },
              { url: "https://example.com/x.png", name: "外" }],
      notify: true
    } });
    ok("配信できる", r.status === 200, r.body?.code || r.status);
    ok("★ 添えものは 2 つ（外の URL は 落とす）", r.body["添えもの"] === 2, r.body["添えもの"]);
    ok("★ 通知を 入れた", Number(r.body["通知を入れた"] || 0) >= 1, r.body["通知を入れた"]);
    ok("Feed へも 出した", r.body.feedPosted === true, r.body.feedPosted);
  }

  節("③ お知らせの 一覧・1 件に 添えものが 出る");
  {
    const l = await req("/api/news/list?limit=10", { token: A.token });
    const it = (l.j.items || []).filter((x) => x.title === 題)[0];
    ok("一覧に 出る", !!it, (l.j.items || []).slice(0, 2).map((x) => x.title));
    ニュースID = it ? it.id : "";
    ok("一覧にも 添えものが 付く", (it && it.media || []).length === 2, it && it.media);
    const one = await req("/api/news/item?id=" + encodeURIComponent(ニュースID), { token: A.token });
    const m = (one.j.item && one.j.item.media) || [];
    ok("1 件でも 添えものが 出る", m.length === 2, m);
    ok("画像と 動画が 1 つずつ", m.filter((x) => x.kind === "image").length === 1
      && m.filter((x) => x.kind === "video").length === 1, m.map((x) => x.kind));
    ok("外の URL は 混ざっていない", m.every((x) => /^\/api\/media\//.test(x.url)), m.map((x) => x.url));
  }

  節("④ Feed の 投稿にも 同じものが 入る");
  {
    const f = await req("/api/posts/feed?limit=20", { token: A.token });
    const p = (f.j.posts || []).filter((x) => x.title === 題)[0];
    ok("Feed に 出る", !!p, (f.j.posts || []).slice(0, 2).map((x) => x.title));
    const imgs = (p && p.images) || [];
    ok("★ Feed の 添えもの（images）に 入っている", imgs.length === 2, imgs);
    ok("動画も 入っている", imgs.some((u) => /\/api\/media\/vid\//.test(u)), imgs);
  }

  節("⑤ 通知（1 人 1 通・二重に 増えない）");
  {
    const nt = await req("/api/user/notifications?limit=30", { token: A.token });
    const list = nt.j.items || nt.j.notifications || [];
    const 当 = list.filter((x) => String(x.title || "") === 題);
    ok("★ 通知が 届いている", 当.length === 1, 当.length + " 通 / 全 " + list.length);
    ok("種類は お知らせ", 当[0] && String(当[0].type || "") === "news", 当[0] && 当[0].type);

    /* もう一度 同じ お知らせを 配信しても 増えない（id を 決め打ちにしてある） */
    const before = 当.length;
    await adm(owner, "/api/admin/auth/reauth", { method: "POST", body: { code: totp(鍵) } });
    const 再 = await adm(owner, "/api/admin/announcements", { method: "POST", body: {
      id: (await adm(owner, "/api/admin/announcements")).body.announcements
        .filter((x) => x.title === 題)[0].id,
      title: 題, bodyMd: "直しました。", channel: "both", category: "release",
      /* ★ 添えものは **そのまま 残す**。ここで 減らすと、あとの 画面の 検査が
         「動画が 無い」で 落ちる（実測で 踏んだ）。 */
      status: "published", media: [{ url: 画像URL }, { url: 動画URL }], notify: true } });
    ok("配信し直せる", 再.status === 200, 再.body?.code || 再.status);
    await 待つ(600);
    const nt2 = await req("/api/user/notifications?limit=30", { token: A.token });
    const list2 = nt2.j.items || nt2.j.notifications || [];
    const 当2 = list2.filter((x) => String(x.title || "") === 題);
    ok("★ 二重に 増えない（1 人 1 通のまま）", 当2.length === before, before + " → " + 当2.length);
  }

  節("⑥ 画面 — News で Feed と 同じ 再生バー");
  {
    const b = await chromium.launch({ headless: true });
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
    const p = await ctx.newPage();
    const 赤 = [];
    p.on("pageerror", (e) => 赤.push(String(e.message).slice(0, 160)));
    await p.addInitScript(([t]) => { try { localStorage.setItem("app.auth.token.v1", t); } catch (e) {} }, [A.token]);
    await p.goto(BASE + "/?vqdev=1&cb=" + Date.now(), { waitUntil: "domcontentloaded" });
    await p.waitForFunction(() => !!window.VQVID, null, { timeout: 30000 }).catch(() => {});
    ok("動画の 部品（VQVID）が ある", await p.evaluate(() => !!(window.VQVID && window.VQVID.html && window.VQVID.結線)));

    await p.waitForTimeout(3000);
    await p.evaluate(() => { document.body.setAttribute("data-app-tab", "news"); });
    /* ★ 「並んだ」まで 待つ。読み込み中でも 文字は あるので、
       文字の 長さで 待つと 空の 画面で 先へ 進んでしまう。 */
    const 並んだ = await p.waitForFunction(() => {
      const h = document.getElementById("vqNews");
      return !!(h && h.shadowRoot && h.shadowRoot.querySelector('[data-a="open"][data-id]'));
    }, null, { timeout: 30000 }).then(() => true).catch(() => false);
    ok("お知らせが 並ぶ", 並んだ === true);

    const 開いた = await p.evaluate(([id]) => {
      const h = document.getElementById("vqNews");
      if (!h || !h.shadowRoot) return { なし: true };
      const r = h.shadowRoot;
      const btn = r.querySelector('[data-a="open"][data-id="' + id + '"]')
        || Array.from(r.querySelectorAll("[data-id]")).filter((e) => e.getAttribute("data-id") === id)[0];
      if (btn) { btn.click(); return { 押した: true }; }
      return { 見つからない: Array.from(r.querySelectorAll("[data-id]")).map((e) => e.getAttribute("data-id")).slice(0, 5) };
    }, [ニュースID]);
    await p.waitForTimeout(1600);
    const 見 = await p.evaluate(() => {
      const h = document.getElementById("vqNews");
      if (!h || !h.shadowRoot) return { なし: true };
      const r = h.shadowRoot;
      return {
        画像: !!r.querySelector(".media-i"),
        動画: !!r.querySelector(".vid video"),
        再生: !!r.querySelector('[data-a="v-play"]'),
        バー: !!r.querySelector('[data-a="v-seek"]'),
        時間: !!r.querySelector("[data-vtime]"),
        つまみ: !!r.querySelector(".vid-k"),
        速さ: !!r.querySelector('[data-a="v-rate"]'),
        既定の操作: (function () { const v = r.querySelector(".vid video"); return v ? v.hasAttribute("controls") : null; })(),
        回る指定: Array.from(r.querySelectorAll("style")).some((s) => /vqKnob/.test(s.textContent))
      };
    });
    console.log("     " + JSON.stringify(開いた) + " / " + JSON.stringify(見));
    ok("お知らせを 開ける", 見.なし !== true && (見.画像 || 見.動画), 見);
    ok("★ 画像が 出る", 見.画像 === true, 見);
    ok("★ 動画が 出る", 見.動画 === true, 見);
    ok("★ Feed と 同じ 再生バー（再生・位置・時間・速さ）",
      見.再生 && 見.バー && 見.時間 && 見.速さ, 見);
    ok("★ つまみも 同じ（VQ の マーク）", 見.つまみ === true, 見);
    ok("ブラウザ既定の 操作は 出さない", 見.既定の操作 === false, 見.既定の操作);
    ok("再生中に 回る 指定も 届いている", 見.回る指定 === true, 見.回る指定);

    /* 実際に 触れるか（掴んで 動かす） */
    const 触 = await p.evaluate(async () => {
      const r = document.getElementById("vqNews").shadowRoot;
      const box = r.querySelector(".vid"), v = box && box.querySelector("[data-v]");
      const t = r.querySelector('[data-a="v-seek"]');
      if (!box || !v || !t) return { なし: true };
      Object.defineProperty(v, "duration", { configurable: true, get: () => 100 });
      const rect = t.getBoundingClientRect();
      const mk = (x, type) => new PointerEvent(type, { clientX: x, clientY: rect.top + rect.height / 2,
        bubbles: true, composed: true, pointerId: 1 });
      t.dispatchEvent(mk(rect.left + rect.width * 0.25, "pointerdown"));
      const 掴んだ = box.classList.contains("is-scrub");
      const 位置1 = Math.round(v.currentTime);
      t.dispatchEvent(mk(rect.left + rect.width * 0.75, "pointermove"));
      const 位置2 = Math.round(v.currentTime);
      t.dispatchEvent(mk(rect.left + rect.width * 0.75, "pointerup"));
      return { 掴んだ, 位置1, 位置2, 離した: !box.classList.contains("is-scrub") };
    });
    ok("★ 掴んで 動かせる", 触.掴んだ === true && 触.位置2 > 触.位置1, 触);
    ok("離したら 掴みが 外れる", 触.離した === true, 触);

    ok("画面の 失敗が 出ていない（再生できない 検証用ファイルの 断りは 除く）",
      赤.filter((x) => !/NotSupportedError|no supported sources/.test(x)).length === 0, 赤.slice(0, 3));
    await b.close();
  }

  節("⑦ 外の URL は 受けない");
  {
    await adm(owner, "/api/admin/auth/reauth", { method: "POST", body: { code: totp(鍵) } });
    const r = await adm(owner, "/api/admin/announcements", { method: "POST", body: {
      title: "外の URL のたしかめ " + Date.now(), bodyMd: "x", channel: "site", category: "release",
      status: "published", media: [{ url: "https://example.com/a.png" }, { url: "/api/media/xxx/b.png" }] } });
    ok("外の URL も 形の 違うものも 落とす", r.status === 200 && r.body["添えもの"] === 0, r.body["添えもの"]);
  }

  節("⑧ 管理ダッシュボードの 画面（本物の Chromium で 触る）");
  {
    const b = await chromium.launch({ headless: true });
    const ctx = await b.newContext({ viewport: { width: 1280, height: 950 } });
    const pg = await ctx.newPage();
    const 赤 = [];
    pg.on("pageerror", (e) => 赤.push(String(e.message).slice(0, 160)));
    await pg.goto(BASE + "/admin", { waitUntil: "domcontentloaded" });
    await pg.waitForTimeout(900);
    await pg.fill("#loginEmail", email).catch(() => {});
    await pg.fill("#loginPass", pw).catch(() => {});
    await pg.evaluate(() => document.getElementById("loginForm").requestSubmit());
    await pg.waitForTimeout(1800);
    const 要る = await pg.evaluate(() => {
      const e = document.getElementById("totpCode");
      return !!(e && e.offsetParent !== null);
    });
    if (要る) {
      await pg.fill("#totpCode", totp(鍵));
      await pg.evaluate(() => document.getElementById("totpForm").requestSubmit());
      await pg.waitForTimeout(2000);
    }
    await pg.goto(BASE + "/admin/announcements", { waitUntil: "domcontentloaded" });
    await pg.waitForTimeout(2600);
    const 画 = await pg.evaluate(() => ({
      通知の印: !!document.getElementById("anNotify"),
      選ぶボタン: !!document.querySelector('[data-act="anpick"]'),
      入れ物: !!document.getElementById("anMedia"),
      受ける種類: (document.getElementById("anFile") || {}).accept || ""
    }));
    ok("★ 「通知にも送る」の 印が ある", 画.通知の印 === true, 画);
    ok("★ 画像・動画を 選ぶ ボタンが ある", 画.選ぶボタン === true, 画);
    ok("添えものの 置き場が ある", 画.入れ物 === true, 画);
    ok("画像も 動画も 選べる",
      /image\//.test(画.受ける種類) && /video\/mp4/.test(画.受ける種類) && /video\/webm/.test(画.受ける種類),
      画.受ける種類);

    /* 実際に あげて、下書きに 出るか */
    const [ch] = await Promise.all([
      pg.waitForEvent("filechooser"),
      pg.evaluate(() => document.querySelector('[data-act="anpick"]').click())
    ]);
    await ch.setFiles([{ name: "t.png", mimeType: "image/png", buffer: ちいさい画像() }]);
    await pg.waitForTimeout(2500);
    const あげた = await pg.evaluate(() => {
      const box = document.getElementById("anMedia");
      const im = box ? box.querySelector("img") : null;
      return { 数: box ? box.children.length : 0, url: im ? im.getAttribute("src") : "",
               外す: !!document.querySelector('[data-act="androp"]'),
               知らせ: (document.getElementById("anUpMsg") || {}).textContent || "" };
    });
    ok("★ 画面から あげられる", あげた.数 === 1, あげた);
    ok("あげたものが 見える（置き場は 自分のところ）", /^\/api\/media\/img\//.test(あげた.url || ""), あげた.url);
    ok("外す ボタンも ある", あげた.外す === true, あげた);

    const 外した = await pg.evaluate(() => {
      document.querySelector('[data-act="androp"]').click();
      const box = document.getElementById("anMedia");
      return box ? box.children.length : -1;
    });
    ok("外せる", 外した === 0, 外した);
    ok("管理画面で 赤い字が 出ていない", 赤.length === 0, 赤.slice(0, 2).join(" / "));
    await b.close();
  }

  console.log(印.join("\n"));
  console.log("\n通った " + 済 + "/" + (済 + 落));
  if (落ち.length) console.log("落ちた: " + 落ち.join(" / "));
  void fs; void path;
  process.exit(落 ? 1 : 0);
})().catch((e) => {
  console.log(印.join("\n"));
  console.error("\n途中で 止まりました: " + (e && e.message ? e.message : e));
  process.exit(2);
});
