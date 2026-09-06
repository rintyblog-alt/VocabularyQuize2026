/* ══════════════════════════════════════════════════════════════════════════
   vqnewsbanner.cjs — お知らせの **表紙（バナー）を あげる**／
                      **画像を 添える**（2026-09-03）

   訴え:
     「News にバナー画像を設定できるようにし、さらに画像添付も可能にして。」

   直す前は こうだった:
     ・表紙は **URL を 手で 打つだけ**。どこか よそへ 画像を 置いてこないと
       バナーが 付けられなかった（http(s) 以外は 捨てていた）。
     ・アプリの お知らせの 書き口（/api/admin/news/save）は
       **media_json を 一度も 書いていなかった**。しかも INSERT OR REPLACE
       なので、直すたびに 管理画面から 添えた ものが **消えていた**。

   ★ 2 回目からは 鍵を 渡して 走らせる:
       VQ_ADMIN_TOTP=… node vqnewsbanner.cjs

   本番では 走らせない。
   ══════════════════════════════════════════════════════════════════════════ */
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const ADMIN_KEY = process.env.VQ_ADMIN_KEY || "vqlocaladmin-9f3a2c";
const crypto = require("crypto");

let 済 = 0, 落 = 0; const 印 = []; const 落ち = [];
function ok(名, 真, 補) {
  if (真) { 済++; 印.push("  ✅ " + 名 + (補 === undefined ? "" : "  " + 短(補))); }
  else { 落++; 落ち.push(名); 印.push("  ❌ " + 名 + (補 === undefined ? "" : "  → " + 短(補))); }
}
function 短(v) { const s = typeof v === "string" ? v : JSON.stringify(v); return String(s).slice(0, 220); }
function 節(t) { 印.push("\n── " + t + " " + "─".repeat(Math.max(0, 54 - t.length))); }

async function req(p, { method = "GET", body, token, admin, raw, type, name } = {}) {
  const h = {};
  if (raw) {
    h["content-type"] = type || "application/octet-stream";
    h["x-file-name"] = encodeURIComponent(name || "file");
  } else h["content-type"] = "application/json";
  if (token) h.authorization = "Bearer " + token;
  if (admin) h["x-admin-key"] = admin;
  const r = await fetch(BASE + p, { method, headers: h,
    body: raw ? raw : (body ? JSON.stringify(body) : undefined) });
  const t = await r.text();
  let j = {}; try { j = JSON.parse(t); } catch (e) { j = { _text: t }; }
  return { status: r.status, j, text: t };
}
/* ★ 作った お知らせは **必ず 片づける**（2026-09-03）。
   置いていくと、記事の 数や 探すことを 見る 別の 検査
   （vqnews.cjs）が、その ゴミで 落ちる。 */
const 片づける = [];
let n = 0;
async function 人を作る() {
  n++;
  const tag = `nb${Date.now().toString(36)}${n}`;
  const s = await req("/api/auth/register/start", { method: "POST",
    body: { email: `vqnb.${tag}@gmail.com`, gradePrefix: "H2", nickname: "nb" + tag, password: "Testing!2345" } });
  if (!s.j.devCode) throw new Error("devCode が返りません: " + JSON.stringify(s.j).slice(0, 200));
  const v = await req("/api/auth/register/verify", { method: "POST",
    body: { challengeId: s.j.challengeId, code: s.j.devCode } });
  const c = await req("/api/auth/register/consent", { method: "POST",
    body: { registrationSession: v.j.registrationSession, agreeTerms: true, agreePrivacy: true, agreeAge: true, pin: "482913" } });
  return { token: c.j.token };
}
function ちいさい画像() {
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
/* ── 管理ダッシュボード（Cookie で 入る）─────────────────────────── */
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

async function 一件(id, token) {
  const r = await req("/api/news/item?id=" + encodeURIComponent(id), { token });
  return r.j.item || null;
}

(async () => {
  const A = await 人を作る();

  節("① あげる（本体と 同じ口）");
  let 画像 = "", 動画 = "";
  {
    const im = await req("/api/upload/image", { method: "POST", token: A.token,
      raw: ちいさい画像(), type: "image/png", name: "banner.png" });
    ok("画像を あげられる", im.status === 200 && !!im.j.url, im.j);
    ok("置き場は /api/media/img/", /^\/api\/media\/img\//.test(String(im.j.url || "")), im.j.url);
    画像 = String(im.j.url || "");

    const vi = await req("/api/upload/image", { method: "POST", token: A.token,
      raw: ちいさい動画(), type: "video/mp4", name: "m.mp4" });
    ok("動画を あげられる", vi.status === 200 && vi.j.kind === "video", vi.j);
    動画 = String(vi.j.url || "");

    const 取 = await fetch(BASE + 画像);
    ok("あげた 画像が そのまま 取れる", 取.status === 200, 取.status);
  }

  節("② ★ あげた 画像を 表紙に できる（今回の 訴え）");
  const 題 = "バナーのたしかめ " + Date.now();
  let ID = "";
  {
    const r = await req("/api/admin/news/save", { method: "POST", admin: ADMIN_KEY, token: A.token,
      body: { title: 題, summary: "表紙のたしかめ", category: "feature",
              body: "本文です。", coverUrl: 画像, status: "published", publishedAt: Date.now() - 1000 } });
    ok("保存できる", r.status === 200 && !!r.j.id, r.j);
    ID = String(r.j.id || "");
    if (ID) 片づける.push(ID);
    const it = await 一件(ID, A.token);
    ok("★ 表紙が **消えずに 残る**（直す前は 空になっていた）", it && it.coverUrl === 画像, it && it.coverUrl);
  }

  節("③ 表紙に できない ものは 通さない");
  {
    const 試す = async (v, 名, 期待) => {
      const r = await req("/api/admin/news/save", { method: "POST", admin: ADMIN_KEY, token: A.token,
        body: { id: ID, title: 題, category: "feature", body: "本文です。", coverUrl: v,
                status: "published", publishedAt: Date.now() - 1000 } });
      const it = await 一件(ID, A.token);
      ok(名, it && it.coverUrl === 期待, { 入れた: v, 出た: it && it.coverUrl });
    };
    await 試す("javascript:alert(1)", "javascript: は 落とす", "");
    await 試す("data:image/png;base64,AAAA", "data: は 落とす", "");
    await 試す(動画, "★ 動画は 表紙に しない（画像だけ）", "");
    await 試す("/api/media/fil/x.pdf", "ファイルも 表紙に しない", "");
    await 試す("/etc/passwd", "よその 道は 落とす", "");
    await 試す("https://example.com/x.png", "外の http(s) は これまでどおり 通る", "https://example.com/x.png");
    await 試す(画像, "自分の 置き場の 画像は 通る", 画像);
  }

  節("④ ★ 画像・動画を 添えられる（今回の 訴え）");
  {
    const r = await req("/api/admin/news/save", { method: "POST", admin: ADMIN_KEY, token: A.token,
      body: { id: ID, title: 題, category: "feature", body: "本文です。", coverUrl: 画像,
              status: "published", publishedAt: Date.now() - 1000,
              media: [{ kind: "image", url: 画像, name: "banner.png", bytes: 68 },
                      { kind: "video", url: 動画, name: "m.mp4", bytes: 464 },
                      { kind: "image", url: "https://example.com/x.png", name: "外" }] } });
    ok("保存できる", r.status === 200, r.j);
    const it = await 一件(ID, A.token);
    ok("★ 添えものが 出る（直す前は 一度も 保存されなかった）", it && (it.media || []).length === 2,
      it && (it.media || []).map((m) => m.url));
    ok("外の URL は 落とす", it && !(it.media || []).some((m) => /example\.com/.test(m.url)),
      it && (it.media || []).map((m) => m.url));
    ok("動画だと 分かっている", it && (it.media || []).some((m) => m.kind === "video"),
      it && (it.media || []).map((m) => m.kind));
    const l = await req("/api/news/list", { token: A.token });
    const li = (l.j.items || []).filter((x) => x.id === ID)[0];
    ok("一覧にも 添えものが 出る", li && (li.media || []).length === 2, li && (li.media || []).length);
    ok("一覧にも 表紙が 出る", li && li.coverUrl === 画像, li && li.coverUrl);
  }

  節("⑤ ★ 直しても 添えものが 消えない（今日 直した バグ）");
  {
    /* media を **送らずに** 題だけ 直す。
       直す前は INSERT OR REPLACE で media_json が 既定値に 戻り、
       管理画面から 添えた ものが 黙って 消えていた。 */
    const r = await req("/api/admin/news/save", { method: "POST", admin: ADMIN_KEY, token: A.token,
      body: { id: ID, title: 題 + "（直した）", category: "feature", body: "直した 本文。",
              coverUrl: 画像, status: "published", publishedAt: Date.now() - 1000 } });
    ok("直せる", r.status === 200, r.j);
    const it = await 一件(ID, A.token);
    ok("★ 添えものは そのまま", it && (it.media || []).length === 2, it && (it.media || []).length);
    ok("表紙も そのまま", it && it.coverUrl === 画像, it && it.coverUrl);
    ok("題は 直っている", it && /直した/.test(it.title), it && it.title);
  }

  節("⑥ 空の 並びを 送ると 消える（外したい ときは 外せる）");
  {
    await req("/api/admin/news/save", { method: "POST", admin: ADMIN_KEY, token: A.token,
      body: { id: ID, title: 題, category: "feature", body: "本文。", coverUrl: 画像,
              status: "published", publishedAt: Date.now() - 1000, media: [] } });
    const it = await 一件(ID, A.token);
    ok("添えものを 外せる", it && (it.media || []).length === 0, it && (it.media || []).length);
    /* 戻す（後ろの 節が 使う） */
    await req("/api/admin/news/save", { method: "POST", admin: ADMIN_KEY, token: A.token,
      body: { id: ID, title: 題, category: "feature", body: "本文。", coverUrl: 画像,
              status: "published", publishedAt: Date.now() - 1000,
              media: [{ kind: "image", url: 画像 }, { kind: "video", url: 動画 }] } });
  }

  節("⑦ 上限は 8 つ");
  {
    const 山 = [];
    for (let i = 0; i < 12; i++) 山.push({ kind: "image", url: 画像 });
    await req("/api/admin/news/save", { method: "POST", admin: ADMIN_KEY, token: A.token,
      body: { id: ID, title: 題, category: "feature", body: "本文。", coverUrl: 画像,
              status: "published", publishedAt: Date.now() - 1000, media: 山 } });
    const it = await 一件(ID, A.token);
    ok("12 を 送っても 8 で 止まる", it && (it.media || []).length === 8, it && (it.media || []).length);
    /* 戻す */
    await req("/api/admin/news/save", { method: "POST", admin: ADMIN_KEY, token: A.token,
      body: { id: ID, title: 題, category: "feature", body: "本文。", coverUrl: 画像,
              status: "published", publishedAt: Date.now() - 1000,
              media: [{ kind: "image", url: 画像 }, { kind: "video", url: 動画 }] } });
  }

  節("⑧ 鍵が 無ければ 書けない");
  {
    const r = await req("/api/admin/news/save", { method: "POST", token: A.token,
      body: { id: ID, title: "のっとり", category: "feature", body: "x" } });
    ok("管理キー 無しは 403", r.status === 403, r.status);
    const it = await 一件(ID, A.token);
    ok("中身は 変わっていない", it && !/のっとり/.test(it.title), it && it.title);
  }

  節("⑨ 公式サイトの 記事にも 出る");
  {
    const 日 = new Date(Number((await 一件(ID, A.token)).publishedAt));
    const p = "/site/news/" + 日.getFullYear() + "/"
      + String(日.getMonth() + 1).padStart(2, "0") + "/" + encodeURIComponent(ID);
    const r = await fetch(BASE + p);
    const h = await r.text();
    ok("記事の ページが 開く", r.status === 200, r.status);
    ok("表紙が 出る", h.indexOf('class="article__cover"') >= 0 && h.indexOf(画像) >= 0, r.status);
    ok("★ 添えものが 出る", h.indexOf('class="article__media"') >= 0, h.indexOf('article__media'));
    ok("★ 動画も 出る", h.indexOf("<video") >= 0, h.indexOf("<video"));
    const og = /<meta property="og:image" content="([^"]*)"/.exec(h);
    ok("★ 共有の 絵は 絶対 URL（/ で 始まらない）",
      !!og && /^https?:\/\//.test(og[1]) && og[1].indexOf(画像) > 0, og && og[1]);
  }

  節("⑩ 画面（アプリの お知らせ）");
  {
    let chromium = null;
    try { ({ chromium } = require("playwright")); } catch (e) { chromium = null; }
    if (!chromium) {
      印.push("  （playwright が 無いので 画面の 検査は 飛ばしました）");
    } else {
      const br = await chromium.launch();
      const pg = await br.newPage({ viewport: { width: 420, height: 900 } });
      const 例外 = [];
      pg.on("pageerror", (e) => 例外.push(String(e && e.message || e)));
      await pg.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
      await pg.evaluate(([t, k]) => {
        localStorage.setItem("app.auth.token.v1", t);
        localStorage.setItem("vq_admin_key", k);
      }, [A.token, ADMIN_KEY]);
      await pg.goto(BASE + "/?vqdev=1#news", { waitUntil: "domcontentloaded" });
      await pg.waitForTimeout(2500);

      const 見た = await pg.evaluate((id) => {
        const h = document.getElementById("vqNewsHost") || document.querySelector("#vqNews,[id*='ews']");
        const 全 = [];
        const 潜る = (n) => {
          if (!n) return;
          if (n.shadowRoot) 全.push(n.shadowRoot);
          (n.children ? Array.from(n.children) : []).forEach(潜る);
        };
        潜る(document.body);
        for (const r of 全) {
          const c = r.querySelector('[data-a="open"][data-id="' + id + '"]');
          if (c) return { あった: true, 表紙: !!c.querySelector(".cover img") };
        }
        return { あった: false, 表紙: false, 影: 全.length };
      }, ID);
      ok("一覧に 記事が 出る", 見た.あった === true, 見た);
      ok("★ 札に 表紙の 絵が 出る", 見た.表紙 === true, 見た);
      ok("画面の 例外は 0 件", 例外.length === 0, 例外.slice(0, 2));
      await br.close();
    }
  }

  節("⑪ ★ 画面から あげて 添える（本物の 指で）");
  {
    let chromium = null;
    try { ({ chromium } = require("playwright")); } catch (e) { chromium = null; }
    if (!chromium) {
      印.push("  （playwright が 無いので 飛ばしました）");
    } else {
      const fs = require("fs"), os = require("os"), pathm = require("path");
      const 置 = fs.mkdtempSync(pathm.join(os.tmpdir(), "vqnb-"));
      const 絵 = pathm.join(置, "banner.png"); fs.writeFileSync(絵, ちいさい画像());
      const 絵2 = pathm.join(置, "shot.png"); fs.writeFileSync(絵2, ちいさい画像());
      const 動 = pathm.join(置, "clip.mp4"); fs.writeFileSync(動, ちいさい動画());

      const br = await chromium.launch();
      const pg = await br.newPage({ viewport: { width: 900, height: 950 } });
      const 例外 = [];
      pg.on("pageerror", (e) => 例外.push(String((e && e.message) || e)));
      await pg.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
      await pg.evaluate(([t, k]) => {
        localStorage.setItem("app.auth.token.v1", t);
        localStorage.setItem("vq_admin_key", k);
      }, [A.token, ADMIN_KEY]);
      await pg.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
      await pg.waitForTimeout(2500);
      /* お知らせの 面を 出す。本体の 口（__vqOpenNews）を 使う。 */
      await pg.evaluate(() => { if (window.__vqOpenNews) window.__vqOpenNews(); });
      await pg.waitForTimeout(1800);
      /* ★ 案内の 覆い（案内・入れかた・新着の 帯）が 前に いると
         押せない。ここで 見るのは お知らせの 画面なので、伏せる。 */
      await pg.evaluate(() => {
        ["vqLumiTour", "vqTour", "vqInstall", "vqNewsFlash", "vqPin"].forEach((id) => {
          const e = document.getElementById(id); if (e) e.style.display = "none";
        });
      });
      await pg.waitForTimeout(300);

      /* 書く（本物の click） */
      /* ★ 同じ 目印は ほかの 影の DOM にも いる。
         **お知らせの 器の 中**だけを 指す（.first() だと 隠れている
         別の 画面の ものを 掴んで、押せずに 止まる）。 */
      const N = (sel) => pg.locator('#vqNews ' + sel);
      const E = (sel) => pg.locator('#vqNewsOverlay ' + sel);
      const 書く = N('[data-a="new"]').first();
      ok("「記事を書く」が 出る", await 書く.count() > 0);
      await 書く.waitFor({ state: "visible", timeout: 15000 });
      await 書く.click();
      await pg.waitForTimeout(500);
      ok("編集の 窓が 開く", await E('[data-e="title"]').count() > 0);

      /* 打ち込む（本物の 文字） */
      const 題2 = "画面からのたしかめ " + Date.now();
      await E('[data-e="title"]').fill(題2);
      await E('[data-e="body"]').fill("本文を 打ちました。\n\n消えないこと。");

      /* ★ 表紙を あげる */
      await E('[data-a="ed-cover-up"]').click();
      await E('input[data-f="cover"]').setInputFiles(絵);
      await pg.waitForTimeout(2200);
      ok("★ 表紙の 絵が その場で 出る", await E(".cov img").count() === 1, await E(".cov img").count());
      const 表URL = await E('[data-e="cover"]').inputValue();
      ok("表紙の 欄に 置き場の 道が 入る", /^\/api\/media\/img\//.test(表URL), 表URL);
      ok("★ 打ち込んだ 本文が 消えていない",
        (await E('[data-e="body"]').inputValue()).indexOf("消えないこと") >= 0);
      ok("★ 打ち込んだ 題も 消えていない",
        (await E('[data-e="title"]').inputValue()) === 題2);

      /* ★ 画像・動画を 添える（2 つ 同時に 選ぶ） */
      await E('[data-a="ed-media-up"]').click();
      await E('input[data-f="media"]').setInputFiles([絵2, 動]);
      await pg.waitForTimeout(3000);
      ok("★ 添えものが 2 つ 並ぶ", await E(".mg .it").count() === 2, await E(".mg .it").count());
      ok("動画も 見える", await E(".mg .it video").count() === 1, await E(".mg .it video").count());

      /* 1 つ 外す */
      await E('.mg .it [data-a="ed-media-x"]').first().click();
      await pg.waitForTimeout(300);
      ok("× で 外せる", await E(".mg .it").count() === 1, await E(".mg .it").count());

      /* 保存 */
      await E('[data-a="ed-save"]').click();
      await pg.waitForTimeout(2500);
      ok("窓が 閉じる", await E('[data-e="title"]').count() === 0);

      const l2 = await req("/api/news/list", { token: A.token });
      const 新 = (l2.j.items || []).filter((x) => x.title === 題2)[0];
      ok("★ 保存されている", !!新, (l2.j.items || []).slice(0, 3).map((x) => x.title));
      if (新) 片づける.push(新.id);
      ok("★ 表紙が 付いている", !!新 && /^\/api\/media\/img\//.test(String(新.coverUrl || "")),
        新 && 新.coverUrl);
      ok("★ 添えものが 1 つ 付いている", !!新 && (新.media || []).length === 1,
        新 && (新.media || []).length);
      const it2 = 新 ? await 一件(新.id, A.token) : null;
      ok("★ 本文も そのまま", !!it2 && it2.body.indexOf("消えないこと") >= 0,
        it2 && it2.body.slice(0, 40));
      ok("画面の 例外は 0 件", 例外.length === 0, 例外.slice(0, 2));

      /* 記事を 開くと 表紙と 添えものが 出る */
      await pg.evaluate((id) => { if (window.__vqOpenNews) window.__vqOpenNews(id); }, 新 ? 新.id : "");
      await pg.waitForTimeout(1800);
      await pg.waitForTimeout(1200);
      ok("★ 記事の 頭に 表紙が 出る", await N(".art .cover img").count() >= 1, await N(".art .cover img").count());
      ok("★ 記事に 添えものが 出る", await N(".media .media-i, .media .vid").count() >= 1,
        await N(".media .media-i, .media .vid").count());

      await br.close();
      try { fs.rmSync(置, { recursive: true, force: true }); } catch (e) {}
    }
  }

  節("⑫ 管理ダッシュボードからも 表紙を あげられる");
  {
    const 鍵 = process.env.VQ_ADMIN_TOTP || "";
    if (!鍵) {
      印.push("  （VQ_ADMIN_TOTP が 無いので 飛ばしました。"
        + "sqlite3 の admins.totp_secret を 渡すと 走ります）");
    } else {
      const owner = jar();
      const email = process.env.VQ_ADMIN_EMAIL || "matsushiri20pc@gmail.com";
      const pw = process.env.VQ_ADMIN_PASS || "vq-official-test-1234";
      await adm(owner, "/api/admin/auth/bootstrap", { method: "POST", body: { email, password: pw } });
      const lg = await adm(owner, "/api/admin/auth/login", { method: "POST", body: { email, password: pw } });
      await adm(owner, "/api/admin/auth/totp/verify", { method: "POST", body: { code: totp(鍵) } });
      await adm(owner, "/api/admin/auth/reauth", { method: "POST", body: { code: totp(鍵) } });
      ok("管理画面へ 入れる", lg.status === 200, lg.status);

      const im = await adm(owner, "/api/admin/upload", { method: "POST",
        raw: ちいさい画像(), type: "image/png", name: "cover.png" });
      ok("管理から 画像を あげられる", im.status === 200 && !!im.body.url, im.body);
      const 表 = String(im.body.url || "");

      const 題3 = "管理からのバナー " + Date.now();
      const r = await adm(owner, "/api/admin/announcements", { method: "POST", body: {
        title: 題3, bodyMd: "本文です。", channel: "both", category: "release",
        status: "published", coverUrl: 表, summary: "バナーのたしかめ", notify: false } });
      ok("配信できる", r.status === 200, r.body?.code || r.status);

      const l = await req("/api/news/list", { token: A.token });
      const it = (l.j.items || []).filter((x) => x.title === 題3)[0];
      ok("お知らせに 出る", !!it, (l.j.items || []).slice(0, 3).map((x) => x.title));
      if (it) 片づける.push(it.id);
      ok("★ あげた 画像が 表紙に なる（直す前は http(s) しか 通らなかった）",
        !!it && it.coverUrl === 表, it && it.coverUrl);

      /* 画面（管理ダッシュボード）に 口が あるか */
      let chromium = null;
      try { ({ chromium } = require("playwright")); } catch (e) { chromium = null; }
      if (chromium) {
        const fs = require("fs"), os = require("os"), pathm = require("path");
        const 置 = fs.mkdtempSync(pathm.join(os.tmpdir(), "vqnb2-"));
        const 絵 = pathm.join(置, "cover.png"); fs.writeFileSync(絵, ちいさい画像());
        const br = await chromium.launch();
        const ctx = await br.newContext();
        await ctx.addCookies(Object.keys(owner.c).map((k) => ({
          name: k, value: owner.c[k], domain: "127.0.0.1", path: "/" })));
        const pg = await ctx.newPage();
        const 赤 = [];
        pg.on("pageerror", (e) => 赤.push(String((e && e.message) || e)));
        await pg.goto(BASE + "/admin/announcements", { waitUntil: "domcontentloaded" });
        await pg.waitForTimeout(1800);
        ok("★ 「画像をあげる」の ボタンが ある",
          await pg.locator('[data-act="ancoverpick"]').count() === 1,
          await pg.locator('[data-act="ancoverpick"]').count());
        ok("表紙の 入れ物が ある", await pg.locator("#anCoverFile").count() === 1);
        await pg.locator("#anCoverFile").setInputFiles(絵);
        await pg.waitForTimeout(2500);
        const v = await pg.locator("#anCover").inputValue();
        ok("★ 画面から あげると 欄に 道が 入る", /^\/api\/media\/img\//.test(v), v);
        ok("★ その場で 絵が 出る", await pg.locator("#anCoverPrev img").count() === 1,
          await pg.locator("#anCoverPrev img").count());
        await pg.locator('[data-act="ancoverdrop"]').click();
        await pg.waitForTimeout(300);
        ok("外せる", (await pg.locator("#anCover").inputValue()) === ""
          && (await pg.locator("#anCoverPrev img").count()) === 0);
        ok("管理画面の 例外は 0 件", 赤.length === 0, 赤.slice(0, 2));
        await br.close();
        try { fs.rmSync(置, { recursive: true, force: true }); } catch (e) {}
      }
    }
  }

  節("⑬ 片づけ");
  {
    let 消 = 0;
    for (const id of Array.from(new Set(片づける))) {
      const r = await req("/api/admin/news/delete", { method: "POST", admin: ADMIN_KEY, body: { id } });
      if (r.status === 200) 消++;
    }
    ok("作った お知らせを 全部 消した", 消 === new Set(片づける).size, 消 + " / " + new Set(片づける).size);
  }

  console.log(印.join("\n"));
  console.log("\n" + "═".repeat(64));
  console.log(`  通った: ${済}   落ちた: ${落}`);
  if (落) console.log("  落ちた項目:\n   - " + 落ち.join("\n   - "));
  console.log("═".repeat(64));
  process.exit(落 ? 1 : 0);
})().catch((e) => {
  console.log(印.join("\n"));
  console.error("\n落ちました:", e && e.stack || e);
  process.exit(1);
});
