/* ══════════════════════════════════════════════════════════════════════════
   vqdowntime.cjs — ダウンタイム（サービスを 止める）の 通し検証（2026-08-20）

   訴え:
     「ダッシュボードから ダウンタイムを 有効にできるように。
       ダウンタイムを オンにしたら 登録者は 全員 ログアウトされ、
       ログインしても、登録しても、ダウンタイム中の モーダルが 出て、
       何も 操作は できなくなる。ホーム画面で モーダルは 背景ぼかし。
       どんな 理由で ダウンタイム中なのかも 表示されるように。アイコンと。
       そこに 見出しと、理由も。何時から 何時までとかも あれば」

   ★ 2 回目からは 鍵を 渡して 走らせる:
       SEC=$(cd server/.local-run/echo && npx wrangler d1 execute vocabuquiz_auth --local \
         --command "SELECT totp_secret FROM admins LIMIT 1" --json | …)
       VQ_ADMIN_TOTP=$SEC node vqdowntime.cjs

   本番では 走らせない。
   ══════════════════════════════════════════════════════════════════════════ */
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const crypto = require("crypto");
const { chromium } = require("playwright");

let 済 = 0, 落 = 0; const 印 = []; const 落ち = [];
function ok(名, 真, 補) {
  if (真) { 済++; 印.push("  ✅ " + 名 + (補 === undefined ? "" : "  " + 短(補))); }
  else { 落++; 落ち.push(名); 印.push("  ❌ " + 名 + (補 === undefined ? "" : "  → " + 短(補))); }
}
function 短(v) { const s = typeof v === "string" ? v : JSON.stringify(v); return String(s).slice(0, 220); }
function 節(t) { 印.push("\n── " + t + " " + "─".repeat(Math.max(0, 54 - t.length))); }
function 待つ(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function req(path, { method = "GET", body, token } = {}) {
  const h = { "content-type": "application/json" };
  if (token) h.authorization = "Bearer " + token;
  const r = await fetch(BASE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, j: await r.json().catch(() => ({})) };
}
let n = 0;
async function 作る() {
  n++;
  const tag = `dt${Date.now().toString(36)}${n}`;
  const s = await req("/api/auth/register/start", { method: "POST",
    body: { email: `vqdt.${tag}@gmail.com`, gradePrefix: "H2", nickname: "dt" + tag, password: "Testing!2345" } });
  if (!s.j.devCode) throw new Error("devCode が返りません: " + JSON.stringify(s.j).slice(0, 200));
  const v = await req("/api/auth/register/verify", { method: "POST", body: { challengeId: s.j.challengeId, code: s.j.devCode } });
  const c = await req("/api/auth/register/consent", { method: "POST",
    body: { registrationSession: v.j.registrationSession, agreeTerms: true, agreePrivacy: true, agreeAge: true, pin: "482913" } });
  return { token: c.j.token, nickname: "dt" + tag, tag };
}

/* 管理（Cookie ＋ 独自ヘッダ） */
function jar() { return { c: {} }; }
async function adm(j, path, { method = "GET", body } = {}) {
  const h = { "content-type": "application/json", "x-vq-admin": "1" };
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

(async () => {
  /* ══ 用意 ═══════════════════════════════════════════════════
     ★ 先に **管理へ 入って、止まっていたら 必ず 解除する**。
       前の 検証が 途中で 止まると 止まったままに なり、
       次の 検証が 「利用者すら 作れない」で 死ぬ（実測）。 */
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
  const 管理できる = lg.status === 200 && !!鍵
    && (await adm(owner, "/api/admin/maintenance")).status === 200;
  if (!管理できる) {
    console.error("管理画面へ 入れませんでした。TOTP の 鍵を VQ_ADMIN_TOTP で 渡してください。");
    process.exit(2);
  }
  /* 「壊す操作」は 再認証が 要る */
  await adm(owner, "/api/admin/auth/reauth", { method: "POST", body: { code: totp(鍵) } });

  /* 前の 検証の 後始末（止まったままなら 解除してから 始める） */
  {
    const g0 = await adm(owner, "/api/admin/maintenance");
    if (g0.body && g0.body.downtime && g0.body.downtime.enabled) {
      await adm(owner, "/api/admin/maintenance", { method: "POST", body: {
        enabled: false, title: "後片づけ", reason: "前の検証の後始末", icon: "wrench" } });
      await 待つ(6000);
    }
  }
  const A = await 作る();

  節("① 止めていないときは ふつうに 動く");
  {
    const c = await req("/api/public/config");
    ok("設定が 引ける", c.status === 200, c.status);
    ok("止まっていない", c.j?.appConfig?.maintenance?.active === false, c.j?.appConfig?.maintenance?.active);
    const me = await req("/api/auth/me", { token: A.token });
    ok("ログインが 生きている", me.status === 200, me.status);
    const g = await adm(owner, "/api/admin/maintenance");
    ok("管理画面から 今の状態が 見える", g.status === 200 && g.body.downtime, g.body?.downtime);
    ok("使える 印は 7 つ", (g.body.icons || []).length === 7, g.body.icons);
  }

  節("② 理由が 無ければ 止めさせない");
  {
    const r = await adm(owner, "/api/admin/maintenance", { method: "POST", body: {
      enabled: true, title: "メンテナンス中", reason: "", icon: "wrench" } });
    ok("理由が 空だと 断る", r.status === 400 && r.body.code === "REASON_REQUIRED", r.body);
    const r2 = await adm(owner, "/api/admin/maintenance", { method: "POST", body: {
      enabled: true, title: "x", reason: "y", icon: "wrench",
      startsAt: new Date(Date.now() + 7200000).toISOString(),
      endsAt: new Date(Date.now() + 3600000).toISOString() } });
    ok("終わりが 始まりより 前だと 断る", r2.status === 400 && r2.body.code === "BAD_RANGE", r2.body);
  }

  節("③ 止める");
  const 終わり = new Date(Date.now() + 3600000);
  {
    const r = await adm(owner, "/api/admin/maintenance", { method: "POST", body: {
      enabled: true, title: "サーバの入れ替え中です",
      reason: "データベースを 新しいものへ 移しています。\n終わりましたら そのまま 使えます。",
      icon: "cloud", endsAt: 終わり.toISOString(), logoutAll: true } });
    ok("止められる", r.status === 200 && r.body.enabled === true, r.body);
    ok("★ 生きていた ログインを 実際に 切った", Number(r.body["切った合言葉"] || 0) >= 1, r.body["切った合言葉"]);
    await 待つ(6000);                       /* 本体の 覚えは 5 秒 */
  }

  節("④ 止まっている 間の ふるまい");
  {
    const c = await req("/api/public/config");
    ok("設定だけは 通る（画面が 事情を 知るため）", c.status === 200, c.status);
    const m = c.j?.appConfig?.maintenance || {};
    ok("止まっていると 返る", m.active === true, m.active);
    ok("見出しが 入っている", m.title === "サーバの入れ替え中です", m.title);
    ok("理由が 入っている", /データベースを/.test(String(m.message || "")), String(m.message || "").slice(0, 40));
    ok("印が 入っている", m.icon === "cloud", m.icon);
    ok("終わりの 時刻が 入っている", Math.abs(Number(m.endAt) - 終わり.getTime()) < 2000, m.endAt);

    const me = await req("/api/auth/me", { token: A.token });
    ok("★ 前の ログインでは 何もできない", me.status === 503 || me.status === 401, me.status);
    ok("止まっていると 分かる 返事", me.j?.code === "MAINTENANCE" || me.status === 401, me.j?.code || me.status);

    const 入 = await req("/api/auth/login", { method: "POST", body: { gradePrefix: "H2", nickname: A.nickname, password: "Testing!2345" } });
    ok("★ ログインできない", 入.status === 503 && 入.j.code === "MAINTENANCE", { s: 入.status, c: 入.j.code });
    ok("ログインの 断りにも 理由が 付く", /データベースを/.test(String(入.j?.maintenance?.message || "")), 入.j?.maintenance?.title);

    const 登 = await req("/api/auth/register/start", { method: "POST",
      body: { email: "vqdt.zzz@gmail.com", gradePrefix: "H2", nickname: "zzzz", password: "Testing!2345" } });
    ok("★ 新規登録も できない", 登.status === 503 && 登.j.code === "MAINTENANCE", { s: 登.status, c: 登.j.code });

    const 他 = await req("/api/posts/feed?limit=3");
    ok("ほかの API も 止まる", 他.status === 503 && 他.j.code === "MAINTENANCE", 他.status);
    const 公 = await req("/api/official-presets");
    ok("読むだけの API も 止まる", 公.status === 503, 公.status);

    const g = await adm(owner, "/api/admin/maintenance");
    ok("★ 管理ダッシュボードは 止まらない（ここから 解除できる）", g.status === 200, g.status);
    ok("止めている 最中でも 管理は 状態を 読める", g.body?.downtime?.enabled === true, g.body?.downtime?.enabled);
    const 監 = await adm(owner, "/api/admin/audit?limit=3");
    ok("★ 管理の ほかの 画面も 生きている（締め出されない）", 監.status === 200, 監.status);
  }

  節("⑤ 画面（本物の Chromium）");
  {
    const b = await chromium.launch({ headless: true });
    const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
    const p = await ctx.newPage();
    const 赤 = [];
    p.on("pageerror", (e) => 赤.push(String(e.message).slice(0, 160)));
    /* 止まる前に ログインしていた 人として 開く */
    await p.addInitScript(([t]) => { try { localStorage.setItem("app.auth.token.v1", t); } catch (e) {} }, [A.token]);
    await p.goto(BASE + "/?vqdev=1&cb=" + Date.now(), { waitUntil: "domcontentloaded" });
    await p.waitForFunction(() => {
      const h = document.getElementById("vqDowntime");
      return !!(h && h.getAttribute("data-open") === "1");
    }, null, { timeout: 30000 }).catch(() => {});

    const 見 = await p.evaluate(() => {
      const h = document.getElementById("vqDowntime");
      if (!h || !h.shadowRoot) return { なし: true };
      const r = h.shadowRoot;
      const mak = r.querySelector(".mak"), box = r.querySelector(".box");
      const cs = mak ? getComputedStyle(mak) : null;
      const hs = getComputedStyle(h);
      return {
        開いている: h.getAttribute("data-open") === "1",
        ぼかし: cs ? (cs.backdropFilter || cs.webkitBackdropFilter || "") : "",
        幕: cs ? cs.backgroundColor : "",
        見出し: (r.querySelector("h1") || {}).textContent || "",
        時間: (r.querySelector(".when") || {}).textContent || "",
        理由: (r.querySelector(".why") || {}).textContent || "",
        印: !!r.querySelector("svg.ic"),
        いちばん上: Number(hs.zIndex) >= 2147483000,
        画面いっぱい: box ? box.getBoundingClientRect().width > 200 : false,
        合言葉: (function () { try { return localStorage.getItem("app.auth.token.v1"); } catch (e) { return "?"; } })()
      };
    });
    ok("モーダルが 出る", 見.開いている === true, 見);
    ok("★ 背景が ぼけている", /blur/.test(String(見.ぼかし || "")), 見.ぼかし);
    ok("幕も 掛かっている（ぼかしが 効かない端末むけ）", /rgba?\(/.test(String(見.幕 || "")), 見.幕);
    ok("見出しが 出る", 見.見出し === "サーバの入れ替え中です", 見.見出し);
    ok("理由が 出る", /データベースを/.test(見.理由 || ""), (見.理由 || "").slice(0, 40));
    ok("何時までかが 出る", /\d{1,2}:\d{2}/.test(見.時間 || ""), 見.時間);
    ok("アイコンが 出る", 見.印 === true);
    ok("いちばん 上に ある", 見.いちばん上 === true);
    ok("★ 合言葉が 消えている（＝ ログアウト）", !見.合言葉, 見.合言葉);

    /* 触れないこと */
    const 触 = await p.evaluate(async () => {
      let 押せた = 0;
      const b2 = document.createElement("button");
      b2.id = "vqdtProbe";
      b2.style.cssText = "position:fixed;left:8px;top:8px;z-index:10";
      b2.addEventListener("click", () => { 押せた++; });
      document.body.appendChild(b2);
      b2.click();                                  /* JS からは 通る（これは 想定内） */
      const 直 = 押せた;
      押せた = 0;
      /* 人が 押すのと 同じ ように（本物の click イベント） */
      b2.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      const 人 = 押せた;
      const st = getComputedStyle(document.documentElement).overflow;
      b2.remove();
      return { 直, 人, 巻き: st };
    });
    ok("★ 下の ボタンは 押しても 効かない", 触.人 === 0, 触);
    ok("画面は 動かせない（巻きを 止めている）", 触.巻き === "hidden", 触.巻き);

    /* ログイン画面から 来ても 出る */
    const p2 = await ctx.newPage();
    await p2.addInitScript(() => { try { localStorage.removeItem("app.auth.token.v1"); } catch (e) {} });
    await p2.goto(BASE + "/?vqdev=1&cb=" + Date.now(), { waitUntil: "domcontentloaded" });
    const 出た2 = await p2.waitForFunction(() => {
      const h = document.getElementById("vqDowntime");
      return !!(h && h.getAttribute("data-open") === "1");
    }, null, { timeout: 30000 }).then(() => true).catch(() => false);
    ok("★ ログインしていない 人にも 出る", 出た2 === true);

    ok("画面の 失敗が 出ていない", 赤.length === 0, 赤.slice(0, 3).join(" / "));
    await b.close();
  }

  節("⑥ 解除する");
  {
    await adm(owner, "/api/admin/auth/reauth", { method: "POST", body: { code: totp(鍵) } });
    const r = await adm(owner, "/api/admin/maintenance", { method: "POST", body: {
      enabled: false, title: "サーバの入れ替え中です", reason: "おわり", icon: "cloud" } });
    ok("解除できる", r.status === 200 && r.body.enabled === false, r.body);
    await 待つ(6000);
    const c = await req("/api/public/config");
    ok("止まっていない", c.j?.appConfig?.maintenance?.active === false, c.j?.appConfig?.maintenance);
    const 他 = await req("/api/official-presets");
    ok("API が 戻る", 他.status === 200, 他.status);
    const 入 = await req("/api/auth/login", { method: "POST", body: { gradePrefix: "H2", nickname: A.nickname, password: "Testing!2345" } });
    ok("★ ログインし直せる", 入.status === 200 && !!入.j.token, { s: 入.status, t: !!入.j.token });
  }

  節("⑦ 管理ダッシュボードの 画面（本物の Chromium で 触る）");
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
    await pg.goto(BASE + "/admin/downtime", { waitUntil: "domcontentloaded" });
    await pg.waitForTimeout(2600);
    const 画 = await pg.evaluate(() => ({
      並び: !!document.querySelector('a[href="/admin/downtime"]'),
      見出し欄: !!document.getElementById("dtTitle"),
      理由欄: !!document.getElementById("dtReason"),
      印の数: document.querySelectorAll('[data-act="dticon"]').length,
      開始欄: !!document.getElementById("dtFrom"),
      終了欄: !!document.getElementById("dtTo"),
      止めるボタン: !!document.querySelector('[data-act="dtsave"][data-op="on"]'),
      見本: !!document.querySelector("#dtPreview svg")
    }));
    ok("ダウンタイムの 画面が 出る", 画.見出し欄 && 画.理由欄 && 画.止めるボタン, 画);
    ok("左の 並びに 入っている", 画.並び === true, 画.並び);
    ok("印は 7 つ 選べる", 画.印の数 === 7, 画.印の数);
    ok("開始・終了も 入れられる", 画.開始欄 && 画.終了欄, 画);
    ok("利用者に 出る 見た目が その場で 見える", 画.見本 === true, 画.見本);

    const 選 = await pg.evaluate(() => {
      document.querySelector('[data-act="dticon"][data-k="bolt"]').click();
      return {
        値: document.getElementById("dtIcon").value,
        押した: document.querySelector('[data-act="dticon"][data-k="bolt"]').getAttribute("aria-pressed")
      };
    });
    ok("印を 選べる", 選.値 === "bolt" && 選.押した === "true", 選);

    const 変 = await pg.evaluate(async () => {
      const t2 = document.getElementById("dtTitle");
      t2.value = "見本のたしかめ";
      t2.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 200));
      return (document.querySelector("#dtPreview h3") || {}).textContent || "";
    });
    ok("打つと 見本も 変わる", 変 === "見本のたしかめ", 変);
    ok("管理画面で 赤い字が 出ていない", 赤.length === 0, 赤.slice(0, 2).join(" / "));
    await b.close();
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
