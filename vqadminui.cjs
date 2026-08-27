/* ══════════════════════════════════════════════════════════════════════
   段D の自己検証 — 左サイドパネルが **機能フラグから描かれているか**

   ★ ここは「消えること」だけでなく **戻ること**も見る。
     消せても戻せないなら、障害のときのキルスイッチとして使えない。
   ★ 併せて、既存の全機能へサイドパネルから行けることを確かめる
     （段D は既存コードに触れる唯一の箇所なので、ここが本丸）。
   ══════════════════════════════════════════════════════════════════════ */
const BASE = process.env.VQ_BASE || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const PW = process.env.VQ_ADMIN_PASS || "";
if (!PW) { console.error("VQ_ADMIN_PASS=... を付けて実行してください。"); process.exit(2); }

const crypto = require("crypto");
let pass = 0, fail = 0; const 落ち = [];
function ok(n, c, d) {
  if (c) { pass++; console.log("  ✅ " + n); }
  else { fail++; 落ち.push(n); console.log("  ❌ " + n + (d !== undefined ? "  → " + JSON.stringify(d).slice(0, 300) : "")); }
}
function 節(t) { console.log("\n■ " + t); }

function base32Decode(s) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, value = 0; const out = [];
  for (const c of String(s).toUpperCase().replace(/[^A-Z2-7]/g, "")) {
    value = (value << 5) | A.indexOf(c); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}
function totp(secret) {
  const c = Math.floor(Date.now() / 1000 / 30);
  const b = Buffer.alloc(8);
  b.writeUInt32BE(Math.floor(c / 0x100000000), 0); b.writeUInt32BE(c >>> 0, 4);
  const mac = crypto.createHmac("sha1", base32Decode(secret)).update(b).digest();
  const o = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[o] & 0x7f) << 24) | (mac[o + 1] << 16) | (mac[o + 2] << 8) | mac[o + 3];
  return String(bin % 1000000).padStart(6, "0");
}

let cookie = "";
async function api(path, opts) {
  opts = opts || {};
  const init = { method: opts.method || "GET", headers: {}, redirect: "manual" };
  if (cookie) init.headers["Cookie"] = cookie;
  if (init.method !== "GET") {
    init.headers["Content-Type"] = "application/json";
    init.headers["X-VQ-Admin"] = "1";
    init.body = JSON.stringify(opts.body || {});
  }
  const r = await fetch(BASE + path, init);
  const sc = r.headers.get("set-cookie");
  if (sc) { const m = /vqadm=([^;]*)/.exec(sc); if (m) cookie = "vqadm=" + m[1]; }
  const t = await r.text();
  let b = {}; try { b = JSON.parse(t); } catch (e) { b = { __raw: t.slice(0, 150) }; }
  return { status: r.status, body: b };
}

async function 左パネル(pg) {
  return pg.evaluate(() => {
    const h = document.getElementById("vqShell");
    const sr = h && h.shadowRoot;
    if (!sr) return { ok: false, why: "vqShell がない" };
    const items = Array.from(sr.querySelectorAll("[data-nav] .vqs-item")).map((b) => ({
      key: b.getAttribute("data-flag") || "",
      text: (b.textContent || "").trim(),
      nav: b.closest("[data-nav]").getAttribute("data-nav"),
      shown: !!(b.offsetParent || b.getClientRects().length)
    }));
    return { ok: true, items };
  });
}

(async () => {
  /* owner でログインし、二要素を通す */
  const lg = await api("/api/admin/auth/login", { method: "POST", body: { email: "admin@vocabuquiz.dev", password: PW } });
  if (lg.status !== 200) { console.error("ログインできません", lg.body); process.exit(2); }
  const su = await api("/api/admin/auth/totp/setup", { method: "POST", body: {} });
  let secret = process.env.VQ_ADMIN_TOTP || (su.body && su.body.secret) || "";
  if (su.status === 409 && !process.env.VQ_ADMIN_TOTP) {
    console.error("TOTP 登録済みです。VQ_ADMIN_TOTP=<鍵> を付けて実行してください。"); process.exit(2);
  }
  if (su.status === 200) await api("/api/admin/auth/totp/enable", { method: "POST", body: { code: totp(secret) } });
  else await api("/api/admin/auth/totp/verify", { method: "POST", body: { code: totp(secret) } });
  await api("/api/admin/auth/reauth", { method: "POST", body: { code: totp(secret) } });

  const { chromium } = require("playwright");
  const br = await chromium.launch();
  const pg = await (await br.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));

  await pg.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.waitForFunction(() => !!document.getElementById("vqShell"), { timeout: 40000 });
  await pg.waitForTimeout(3000);

  節("① 左パネルがフラグから描かれているか");
  {
    const p = await 左パネル(pg);
    ok("左パネルが出ている", p.ok && p.items.length > 0, p);
    ok("すべての項目がフラグのキーを持っている（＝直書きが残っていない）",
      p.items.length > 0 && p.items.every((i) => !!i.key), p.items.filter((i) => !i.key));
    const flags = await fetch(BASE + "/api/flags/effective").then((r) => r.json());
    const 出るはず = (flags.flags || []).filter((f) => f.sidebar).map((f) => f.key).sort();
    const 出ている = p.items.map((i) => i.key).sort();
    ok("フラグの「出す」と画面の項目が一致する",
      JSON.stringify(出るはず) === JSON.stringify(出ている), { 期待: 出るはず, 実際: 出ている });
    ok("既存の全機能へ行ける（ホーム/プリセット/Feed/NEWS/Insights/Survival/Quick Chat/通知/設定/プロフィール）",
      ["home", "preset", "feed", "news", "insights", "survival", "quick_chat", "notifications", "settings", "profile"]
        .every((k) => 出ている.includes(k)), 出ている);
    ok("画面の失敗が出ていない", errs.length === 0, errs.slice(0, 3));
  }

  節("② off にすると消え、on で戻るか（30 秒以内）");
  {
    const off = await api("/api/admin/flags/survival", { method: "POST", body: { state: "off", reason: "段D の自己検証" } });
    ok("フラグを off にできる", off.status === 200, off.body);
    let 消えた = false, t1 = 0;
    for (; t1 < 32; t1 += 2) {
      await pg.waitForTimeout(2000);
      const p = await 左パネル(pg);
      if (!p.items.some((i) => i.key === "survival")) { 消えた = true; break; }
    }
    ok("VocabuSurvival が " + t1 + " 秒で左パネルから消える（30 秒以内・再読み込みなし）", 消えた, t1);

    /* URL 直打ちの遮断（サーバ側） */
    const direct = await fetch(BASE + "/api/survival/anything");
    const dj = await direct.json().catch(() => ({}));
    ok("off の機能は URL 直打ちでも 403", direct.status === 403 && dj.code === "FEATURE_DISABLED",
      { status: direct.status, code: dj.code });

    await api("/api/admin/auth/reauth", { method: "POST", body: { code: totp(secret) } });
    const on = await api("/api/admin/flags/survival", { method: "POST", body: { state: "on", reason: "段D の自己検証を戻す" } });
    ok("フラグを on に戻せる", on.status === 200, on.body);
    let 戻った = false, t2 = 0;
    for (; t2 < 32; t2 += 2) {
      await pg.waitForTimeout(2000);
      const p = await 左パネル(pg);
      if (p.items.some((i) => i.key === "survival")) { 戻った = true; break; }
    }
    ok("VocabuSurvival が " + t2 + " 秒で戻る", 戻った, t2);
    const back = await fetch(BASE + "/api/survival/anything");
    ok("戻したら URL 直打ちも通る（403 ではない）", back.status !== 403, back.status);
  }

  節("③ β バッジと注意書きが出るか");
  {
    await api("/api/admin/auth/reauth", { method: "POST", body: { code: totp(secret) } });
    const r = await api("/api/admin/flags/workplace", { method: "POST", body: {
      state: "beta", badge: "β", visibleInSidebar: true, sidebarOrder: 70,
      path: "tab:library", notice: "Workplaceはβ版です。生成結果は必ずご確認ください", reason: "段D の自己検証"
    } });
    ok("Workplace を β バッジ付きで出せる", r.status === 200, r.body);
    let 見えた = null, t3 = 0;
    for (; t3 < 32; t3 += 2) {
      await pg.waitForTimeout(2000);
      const p = await 左パネル(pg);
      const it = p.items.filter((i) => i.key === "workplace")[0];
      if (it) { 見えた = it; break; }
    }
    ok("左パネルに Workplace が出る（" + t3 + " 秒）", !!見えた, 見えた);
    ok("β の札が付いている", !!見えた && /β/.test(見えた.text), 見えた && 見えた.text);
    const f = await fetch(BASE + "/api/flags/effective").then((x) => x.json());
    const wf = (f.flags || []).filter((x) => x.key === "workplace")[0];
    ok("注意書きが画面へ渡っている", wf && /β版/.test(wf.notice || ""), wf && wf.notice);
    /* 片づける */
    await api("/api/admin/auth/reauth", { method: "POST", body: { code: totp(secret) } });
    await api("/api/admin/flags/workplace", { method: "POST", body: {
      state: "beta", badge: "β", visibleInSidebar: false, sidebarOrder: 0,
      path: "feature:workplace", reason: "段D の自己検証を戻す" } });
  }

  節("④ 通信できないときに左パネルが空にならないか");
  {
    const pg2 = await (await br.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await pg2.route("**/api/flags/effective", (r) => r.abort());
    await pg2.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded", timeout: 60000 });
    await pg2.waitForFunction(() => !!document.getElementById("vqShell"), { timeout: 40000 });
    await pg2.waitForTimeout(3000);
    const p = await 左パネル(pg2);
    ok("フラグが取れなくても左パネルは空にならない", p.ok && p.items.length >= 10, p.items && p.items.length);
    await pg2.close();
  }

  節("⑤ 監査ログに段Dの操作が残っているか");
  {
    const a = await api("/api/admin/audit?action=flags.toggle&per=20");
    const rows = (a.body.rows || []);
    ok("flags.toggle が記録されている", rows.length > 0, rows.length);
    const one = rows[0];
    ok("before / after に state が入っている",
      one && /"state"/.test(one.before || "") && /"state"/.test(one.after || ""), one);
    ok("理由が残っている", one && !!one.reason, one && one.reason);
  }

  節("⑥ 管理画面そのものをブラウザで通す（API だけでは画面の証拠にならない）");
  {
    const ap = await (await br.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
    const aerr = [];
    ap.on("pageerror", (e) => aerr.push(String(e).slice(0, 200)));
    /* ★ ログイン前の auth/me は **401 が正しい**（まだ入っていないので）。
       これを数えると、正しい動きを失敗として数えてしまう。 */
    ap.on("console", (m) => {
      const t = m.text();
      if (m.type() === "error" && !/401|Unauthorized/.test(t)) aerr.push("console: " + t.slice(0, 200));
    });
    await ap.goto(BASE + "/admin", { waitUntil: "domcontentloaded", timeout: 60000 });
    await ap.waitForTimeout(2500);
    ok("ログイン画面が出る", await ap.isVisible("#scLogin"), await ap.content().then((c) => c.length));
    await ap.fill("#loginEmail", "admin@vocabuquiz.dev");
    await ap.fill("#loginPass", PW);
    await ap.click("#loginForm button[type=submit]");
    await ap.waitForTimeout(2500);
    const totpOut = await ap.isVisible("#scTotp");
    ok("二要素認証の画面へ進む", totpOut, totpOut);
    if (totpOut) {
      await ap.fill("#totpCode", totp(secret));
      await ap.click("#totpForm button[type=submit]");
      await ap.waitForTimeout(2500);
    }
    ok("本体の画面が出る", await ap.isVisible("#scApp"), await ap.isVisible("#scApp"));
    const navCount = await ap.evaluate(() => document.querySelectorAll("#navList a[data-page]").length);
    ok("ナビに 11 画面すべてある", navCount === 11, navCount);

    const 画面 = ["dashboard", "users", "admins", "providers", "lumi", "flags",
                  "quality", "storage", "content", "announcements", "audit"];
    for (const k of 画面) {
      await ap.click('#navList a[data-page="' + k + '"]');
      await ap.waitForTimeout(1800);
      const r = await ap.evaluate(() => ({
        title: (document.getElementById("pageTitle") || {}).textContent || "",
        len: (document.getElementById("pageBody") || {}).innerHTML.length,
        loading: /読み込んでいます/.test((document.getElementById("pageBody") || {}).textContent || ""),
        err: /読み込めませんでした|権限がありません/.test((document.getElementById("pageBody") || {}).textContent || "")
      }));
      ok("画面 " + k + " が描ける（" + r.title + " / " + r.len + " 文字）",
        r.len > 200 && !r.loading && !r.err, r);
    }
    ok("管理画面で JS の失敗が出ていない", aerr.length === 0, aerr.slice(0, 3));
    /* 横あふれが無いか（表は自分の枠の中で横スクロールする決まり） */
    const 溢れ = await ap.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok("ページが横にあふれていない", 溢れ <= 1, 溢れ);
    await ap.close();
  }

  console.log("\n合格 " + pass + " / 失敗 " + fail);
  if (落ち.length) console.log("落ちた: " + 落ち.join(" / "));
  await br.close();
  process.exit(fail ? 1 : 0);
})();
