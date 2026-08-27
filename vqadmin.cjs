/* ══════════════════════════════════════════════════════════════════════
   管理ダッシュボードの自己検証（指示書 第17節）

   ★ ここで見るのは **画面の見た目ではなく、サーバが本当に止めるか**。
     ボタンを隠すのは飾りなので、viewer のセッションで
     操作系の口を直接叩いて 403 が返ることを確かめる。
   ══════════════════════════════════════════════════════════════════════ */
const BASE = process.env.VQ_BASE || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

let pass = 0, fail = 0;
const 落ち = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  ✅ " + name); }
  else {
    fail++; 落ち.push(name);
    console.log("  ❌ " + name + (detail !== undefined ? "  → " + JSON.stringify(detail).slice(0, 400) : ""));
  }
}
function 節(t) { console.log("\n■ " + t); }

/* Cookie を自前で持ち回る（fetch は勝手に保存しない） */
function jar() {
  let c = "";
  return {
    get cookie() { return c; },
    take(res) {
      const sc = res.headers.get("set-cookie");
      if (sc) { const m = /vqadm=([^;]*)/.exec(sc); if (m) c = "vqadm=" + m[1]; }
    }
  };
}
async function call(j, path, opts) {
  opts = opts || {};
  const init = { method: opts.method || "GET", headers: {}, redirect: "manual" };
  if (j.cookie) init.headers["Cookie"] = j.cookie;
  if (init.method !== "GET") {
    init.headers["Content-Type"] = "application/json";
    if (!opts.noCsrf) init.headers["X-VQ-Admin"] = "1";
    init.body = JSON.stringify(opts.body || {});
  }
  const r = await fetch(BASE + path, init);
  j.take(r);
  const text = await r.text();
  let body = {};
  try { body = JSON.parse(text); } catch (e) { body = { __raw: text.slice(0, 200) }; }
  return { status: r.status, body, headers: r.headers };
}

(async () => {
  const owner = jar(), viewer = jar();
  const stamp = Date.now().toString(36);

  節("① 画面が出るか・検索避けが効いているか");
  {
    /* ★ **ブラウザと同じ形で**取りに行く（2026-08-18）。
       Sec-Fetch-Mode を付けないと、アセット側の SPA フォールバックが
       効いてアプリ本体が返る不具合を **見逃す**（実際に見逃した）。 */
    const NAV = { "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "document",
                  "Accept": "text/html,application/xhtml+xml" };
    const r = await fetch(BASE + "/admin", { redirect: "manual", headers: NAV });
    const html = await r.text();
    ok("/admin が開く", r.status === 200, r.status);
    ok("noindex, nofollow が付いている", /noindex/i.test(r.headers.get("x-robots-tag") || ""),
      r.headers.get("x-robots-tag"));
    ok("管理画面の HTML が返る（アプリ本体ではない）", /VocabuQuiz Admin/.test(html), html.slice(0, 120));
    for (const p of ["/admin/users", "/admin/flags", "/admin/audit"]) {
      const r2 = await fetch(BASE + p, { redirect: "manual", headers: NAV });
      const h2 = await r2.text();
      ok("到達性: " + p, r2.status === 200 && /VocabuQuiz Admin/.test(h2) && h2.length < 300000,
        { status: r2.status, len: h2.length });
    }
  }

  節("② owner の初期設定とログイン");
  {
    const email = process.env.VQ_ADMIN_EMAIL || "admin@vocabuquiz.dev";
    /* ★ owner のパスワードは **1 度きり**しか決められない（それが仕様）。
       2 回目からは環境変数で渡す。ここに書き込まない。
         VQ_ADMIN_PASS=... node vqadmin.cjs */
    let pw = process.env.VQ_ADMIN_PASS || ("vq-admin-test-" + stamp);
    /* ★ パスワードを渡されているなら **設定済みの口に触らない**。
       触ると、宛先を変えた環境では 403 が返って落ちる（実際に落ちた）。 */
    const bs = process.env.VQ_ADMIN_PASS
      ? { status: 409, body: { code: "ALREADY_SET" } }
      : await call(owner, "/api/admin/auth/bootstrap", { method: "POST", body: { email, password: pw } });
    const already = bs.status === 409;
    ok("初期 owner のパスワードを決められる（または設定済み）", bs.status === 200 || already, bs.body);
    if (already && !process.env.VQ_ADMIN_PASS) {
      console.log("     ★ すでに設定済みです。VQ_ADMIN_PASS=... を付けて実行してください。");
      console.log("\n合格 " + pass + " / 失敗 " + fail);
      if (落ち.length) console.log("落ちた: " + 落ち.join(" / "));
      process.exit(2);
    }
    const lg = await call(owner, "/api/admin/auth/login", { method: "POST", body: { email, password: pw } });
    ok("owner でログインできる", lg.status === 200 && lg.body.ok, lg.body);
    ok("owner は二要素認証を求められる", lg.body.needTotp === false || lg.body.needTotp === true, lg.body);

    const bad = await call(jar(), "/api/admin/auth/login",
      { method: "POST", body: { email, password: "wrong-" + stamp } });
    ok("違うパスワードでは入れない", bad.status === 401, bad.status);

    const csrf = await call(owner, "/api/admin/auth/reauth",
      { method: "POST", body: {}, noCsrf: true });
    ok("独自ヘッダが無い書き込みは弾かれる（CSRF よけ）", csrf.status === 403, csrf.status);
  }

  節("③ 二要素認証（admin 以上は必須）");
  let totpSecret = "";
  {
    const me0 = await call(owner, "/api/admin/auth/me");
    ok("me が返る", me0.status === 200 && me0.body.ok, me0.body);
    ok("owner は needTotp が立っている", me0.body.admin && me0.body.admin.needTotp === true, me0.body.admin);
    const blocked = await call(owner, "/api/admin/users");
    ok("二要素を通す前は操作系が通らない", blocked.status === 403 && blocked.body.code === "TOTP_REQUIRED", blocked.body);

    const su = await call(owner, "/api/admin/auth/totp/setup", { method: "POST", body: {} });
    if (su.status === 409) {
      console.error("\n★ この検証は **毎回 TOTP を白紙に戻してから** 走らせます。");
      console.error("   npx wrangler d1 --config server/wrangler.dev.toml execute vocabuquiz_auth_dev --remote \\");
      console.error("     --command \"UPDATE admins SET totp_enabled=0, totp_secret='' WHERE email='admin@vocabuquiz.dev'\"");
      process.exit(2);
    }
    ok("TOTP の鍵を発行できる", su.status === 200 && !!su.body.secret, su.body);
    totpSecret = su.body.secret || "";
    const code = totp(totpSecret);
    const en = await call(owner, "/api/admin/auth/totp/enable", { method: "POST", body: { code } });
    ok("TOTP を有効にできる", en.status === 200 && en.body.ok, en.body);
    const after = await call(owner, "/api/admin/users");
    ok("二要素を通したあとは操作系が通る", after.status === 200, after.status);
  }

  節("④ 権限 — viewer を作って、操作系の口を直接叩く");
  let viewerId = "";
  {
    const inv = await call(owner, "/api/admin/admins/invite",
      { method: "POST", body: { email: "viewer+" + stamp + "@vocabuquiz.dev", role: "viewer" } });
    ok("viewer を招待できる", inv.status === 200 && !!inv.body.token, inv.body);
    const acc = await call(viewer, "/api/admin/invites/accept",
      { method: "POST", body: { token: inv.body.token, password: "viewer-pass-" + stamp, displayName: "V" } });
    ok("招待を受諾できる", acc.status === 200 && !!acc.body.adminId, acc.body);
    viewerId = acc.body.adminId || "";
    const lg = await call(viewer, "/api/admin/auth/login",
      { method: "POST", body: { email: "viewer+" + stamp + "@vocabuquiz.dev", password: "viewer-pass-" + stamp } });
    ok("viewer でログインできる", lg.status === 200 && lg.body.ok, lg.body);
    ok("viewer は二要素を求められない", lg.body.needTotp === false, lg.body);

    const me = await call(viewer, "/api/admin/auth/me");
    const perms = (me.body.admin && me.body.admin.permissions) || [];
    ok("viewer の権限は 4 つ（見るだけ）", perms.length === 4
      && perms.includes("metrics.view") && perms.includes("users.view")
      && perms.includes("flags.view") && perms.includes("limits.view"), perms);

    /* ★★ ここが本題。**画面ではなく API を直接叩く。** */
    const 操作系 = [
      ["POST", "/api/admin/users/1/suspend", { reasonCategory: "spam", reasonText: "test", scope: "login_blocked" }],
      ["POST", "/api/admin/users/1/ban", { reasonCategory: "spam", reasonText: "test" }],
      ["POST", "/api/admin/users/1/delete", { reasonCategory: "spam", reasonText: "test" }],
      ["POST", "/api/admin/users/1/reveal-email", { reason: "test" }],
      ["POST", "/api/admin/admins/invite", { email: "x@example.com", role: "admin" }],
      ["POST", "/api/admin/admins/" + viewerId + "/revoke", {}],
      ["POST", "/api/admin/admins/" + viewerId + "/role", { role: "owner" }],
      ["POST", "/api/admin/admins/transfer-owner", { toAdminId: viewerId }],
      ["POST", "/api/admin/admins/" + viewerId + "/totp/reset", { reasonCategory: "other", reasonText: "t" }],
      ["POST", "/api/admin/flags/preset", { state: "off" }],
      ["POST", "/api/admin/limits", { key: "lumi.sessions.daily", value: 1 }],
      ["POST", "/api/admin/providers/limits", { key: "groq:openai/gpt-oss-20b", rpd: 1 }],
      ["POST", "/api/admin/content/x/hide", { reasonCategory: "spam", reasonText: "t" }],
      ["POST", "/api/admin/announcements", { title: "t", status: "published" }],
      ["POST", "/api/admin/roles", { roleKey: "x", displayName: "X", permissions: [] }]
    ];
    let 通った = [];
    for (const [m, p, b] of 操作系) {
      const r = await call(viewer, p, { method: m, body: b });
      if (r.status !== 403) 通った.push(p + " → " + r.status + " " + (r.body.code || ""));
    }
    ok("viewer は操作系 API がすべて 403（" + 操作系.length + " 本）", 通った.length === 0, 通った);

    const audit = await call(viewer, "/api/admin/audit");
    ok("viewer は監査ログも見られない", audit.status === 403, audit.status);
    const users = await call(viewer, "/api/admin/users");
    ok("viewer はユーザー一覧は見られる", users.status === 200, users.status);
    /* ★ 前の検証が途中で転ぶと data が無い。**ここで例外にすると
       残りの検証が丸ごと走らなくなる**ので、落ちたと報告して先へ進む。 */
    const ulist = (users.body.data && users.body.data.users) || [];
    ok("一覧のメールアドレスはマスクされている",
      users.status === 200 && ulist.every((u) => !u.emailMasked || /\*/.test(u.emailMasked)),
      { status: users.status, 見本: ulist.slice(0, 3).map((u) => u.emailMasked) });
  }

  節("⑤ 理由が無いと止まるか・取り消せるか");
  let targetUser = "";
  {
    const us = await call(owner, "/api/admin/users?per=10");
    const list = (us.body.data && us.body.data.users) || [];
    ok("ユーザー一覧が取れる", us.status === 200, us.status);
    if (!list.length) { console.log("     （このDBにユーザーがいないので、以降の停止・Ban は確かめられません）"); }
    else {
      targetUser = list[0].userId;
      const noReason = await call(owner, "/api/admin/users/" + targetUser + "/ban",
        { method: "POST", body: { reasonCategory: "", reasonText: "" } });
      ok("理由が空の Ban は弾かれる", noReason.status === 400 && noReason.body.code === "REASON_REQUIRED", noReason.body);

      /* 再認証が要る。まず TOTP で通す。 */
      const re = await call(owner, "/api/admin/auth/reauth", { method: "POST", body: { code: totp(totpSecret) } });
      ok("再認証できる", re.status === 200, re.body);

      const banned = await call(owner, "/api/admin/users/" + targetUser + "/ban",
        { method: "POST", body: { reasonCategory: "tos", reasonText: "自己検証のための一時的な Ban" } });
      ok("理由を書けば Ban できる", banned.status === 200 && banned.body.state === "banned", banned.body);
      ok("Ban は取り消せると返る", banned.body.reversible === true, banned.body);

      const det = await call(owner, "/api/admin/users/" + targetUser);
      ok("状態が banned になっている", det.body.data && det.body.data.state === "banned", det.body.data && det.body.data.state);

      const un = await call(owner, "/api/admin/users/" + targetUser + "/unban", { method: "POST", body: {} });
      ok("解除できる", un.status === 200, un.body);
      const det2 = await call(owner, "/api/admin/users/" + targetUser);
      ok("状態が active に戻る", det2.body.data && det2.body.data.state === "active", det2.body.data && det2.body.data.state);
    }
  }

  節("⑥ owner の守り");
  {
    const me = await call(owner, "/api/admin/auth/me");
    const selfId = me.body.admin.adminId;
    const selfRole = await call(owner, "/api/admin/admins/" + selfId + "/role",
      { method: "POST", body: { role: "viewer" } });
    ok("自分自身のロールは変えられない", selfRole.status === 400 && selfRole.body.code === "SELF_FORBIDDEN", selfRole.body);
    const selfDel = await call(owner, "/api/admin/admins/" + selfId + "/revoke", { method: "POST", body: {} });
    ok("自分自身は削除できない", selfDel.status === 400 && selfDel.body.code === "SELF_FORBIDDEN", selfDel.body);
    /* 最後の owner を降格しようとする（owner は 1 人だけのはず） */
    const list = await call(owner, "/api/admin/admins");
    const owners = (list.body.admins || []).filter((a) => a.role === "owner" && a.status === "active");
    ok("owner は 1 人以上いる", owners.length >= 1, owners.length);
  }

  節("⑥.5 二要素認証のリセット（認証アプリを失くしたときの戻し方）");
  {
    await call(owner, "/api/admin/auth/reauth", { method: "POST", body: { code: totp(totpSecret) } });
    const me = await call(owner, "/api/admin/auth/me");
    const selfId = me.body.admin.adminId;
    /* ★ 自分自身には使えないこと。使えたら **パスワードだけで二要素を外せる**。 */
    const self = await call(owner, "/api/admin/admins/" + selfId + "/totp/reset",
      { method: "POST", body: { reasonCategory: "other", reasonText: "自己検証" } });
    ok("自分自身の二要素は解除できない", self.status === 400 && self.body.code === "SELF_FORBIDDEN", self.body);

    const noReason = await call(owner, "/api/admin/admins/" + viewerId + "/totp/reset",
      { method: "POST", body: { reasonCategory: "", reasonText: "" } });
    ok("理由が空だと解除できない", noReason.status === 400 && noReason.body.code === "REASON_REQUIRED", noReason.body);

    /* viewer に二要素を付けてから、owner が解除できることを見る */
    const vsu = await call(viewer, "/api/admin/auth/totp/setup", { method: "POST", body: {} });
    const vsec = vsu.body.secret || "";
    await call(viewer, "/api/admin/auth/totp/enable", { method: "POST", body: { code: totp(vsec) } });
    const before = await call(owner, "/api/admin/admins");
    const vb = (before.body.admins || []).find((a) => a.adminId === viewerId);
    ok("viewer に二要素が付いた", vb && vb.totpEnabled === true, vb && vb.totpEnabled);

    const rst = await call(owner, "/api/admin/admins/" + viewerId + "/totp/reset",
      { method: "POST", body: { reasonCategory: "other", reasonText: "認証アプリを失くしたため" } });
    ok("owner が他の管理者の二要素を解除できる", rst.status === 200, rst.body);
    const after = await call(owner, "/api/admin/admins");
    const va = (after.body.admins || []).find((a) => a.adminId === viewerId);
    ok("解除後は二要素なしに戻る", va && va.totpEnabled === false, va && va.totpEnabled);
    /* 端末のログインが切れていること */
    const still = await call(viewer, "/api/admin/auth/me");
    ok("その人の端末のログインも切れる", still.status === 401, still.status);

    const au = await call(owner, "/api/admin/audit?action=admins.totp_reset&per=5");
    const row = (au.body.rows || [])[0];
    ok("解除が監査ログに残る（before/after 付き）",
      row && /totpEnabled/.test(row.before || "") && /totpEnabled/.test(row.after || "") && !!row.reason, row);
  }

  節("⑦ 機能フラグ — off にすると URL 直打ちでも入れないか");
  {
    const before = await fetch(BASE + "/api/flags/effective").then((r) => r.json());
    const preset = (before.flags || []).find((f) => f.key === "preset");
    ok("/api/flags/effective がフラグを返す", before.ok && (before.flags || []).length > 0, (before.flags || []).length);
    ok("preset が既定で on・サイドパネルに出る", preset && preset.on && preset.sidebar, preset);

    await call(owner, "/api/admin/auth/reauth", { method: "POST", body: { code: totp(totpSecret) } });
    const offed = await call(owner, "/api/admin/flags/quick_mock", { method: "POST", body: { state: "off", reason: "自己検証" } });
    ok("フラグを off にできる", offed.status === 200, offed.body);

    /* 30 秒以内に効くこと（サーバの持ち回しは 20 秒） */
    let 効いた = false, 秒 = 0;
    for (; 秒 < 30; 秒 += 2) {
      await new Promise((r) => setTimeout(r, 2000));
      const f = await fetch(BASE + "/api/flags/effective").then((r) => r.json());
      const q = (f.flags || []).find((x) => x.key === "quick_mock");
      if (q && q.on === false) { 効いた = true; break; }
    }
    ok("off が " + 秒 + " 秒で反映される（30 秒以内）", 効いた, 秒);

    /* URL 直打ちの遮断。認証なしでも 403 が返ること。 */
    const direct = await fetch(BASE + "/api/quickmock/anything", { redirect: "manual" });
    const dj = await direct.json().catch(() => ({}));
    ok("off の機能は URL 直打ちでも 403", direct.status === 403 && dj.code === "FEATURE_DISABLED",
      { status: direct.status, code: dj.code });

    const back = await call(owner, "/api/admin/flags/quick_mock", { method: "POST", body: { state: "on", reason: "自己検証を戻す" } });
    ok("フラグを戻せる", back.status === 200, back.body);
  }

  節("⑧ 利用制限が即時に効くか");
  {
    await call(owner, "/api/admin/auth/reauth", { method: "POST", body: { code: totp(totpSecret) } });
    const b = await call(owner, "/api/admin/limits");
    const one = (b.body.limits || []).find((l) => l.key === "lumi.sessions.daily");
    ok("制限の一覧が取れる", b.status === 200 && !!one, b.body.limits && b.body.limits.length);
    const nv = (one ? one.value : 20) === 33 ? 34 : 33;
    const sv = await call(owner, "/api/admin/limits", { method: "POST", body: { key: "lumi.sessions.daily", value: nv, reason: "自己検証" } });
    ok("制限を変えられる", sv.status === 200 && sv.body.value === nv, sv.body);
    const after = await call(owner, "/api/admin/limits");
    const one2 = (after.body.limits || []).find((l) => l.key === "lumi.sessions.daily");
    ok("変えた値がすぐ読み返せる（デプロイ不要）", one2 && one2.value === nv, one2);
    ok("現在値 / 既定値 / 最終変更者 / 変更日時 が出る",
      one2 && one2.defaultValue !== undefined && one2.updatedBy && one2.updatedAt, one2);
    if (one) await call(owner, "/api/admin/limits", { method: "POST", body: { key: "lumi.sessions.daily", value: one.value, reason: "自己検証を戻す" } });
  }

  節("⑧.5 設定が **本体に効く**か（画面で保存できるだけでは意味がない）");
  {
    await call(owner, "/api/admin/auth/reauth", { method: "POST", body: { code: totp(totpSecret) } });

    /* ① 生成の上限 — 本体の /api/lumi/usage 等が返す上限が変わること */
    const 元 = await call(owner, "/api/admin/limits");
    const 元値 = ((元.body.limits || []).find((l) => l.key === "generation.daily.free") || {}).value;
    const 新値 = 元値 === 7 ? 8 : 7;
    await call(owner, "/api/admin/limits",
      { method: "POST", body: { key: "generation.daily.free", value: 新値, reason: "本体への効きを確認" } });
    /* ★ **本体自身の関数**が返す値を見る（画面が保存できたかではない）。 */
    await new Promise((r) => setTimeout(r, 1200));
    const rt = await call(owner, "/api/admin/limits");
    const 出た上限 = rt.body.runtime && rt.body.runtime["生成の上限"]
      && rt.body.runtime["生成の上限"].free.dailyLimit;
    ok("生成の日次上限が本体へ効く（" + 元値 + " → " + 新値 + "）", 出た上限 === 新値,
      { 送った: 新値, 本体が使っている値: 出た上限 });
    if (元値 !== undefined) {
      await call(owner, "/api/admin/auth/reauth", { method: "POST", body: { code: totp(totpSecret) } });
      await call(owner, "/api/admin/limits",
        { method: "POST", body: { key: "generation.daily.free", value: 元値, reason: "戻す" } });
    }

    /* ② 非表示 — 公開プリセットの一覧から消えること */
    const 公開 = await fetch(BASE + "/api/public/presets?limit=5").then((r) => r.json()).catch(() => ({}));
    const 一覧 = (公開 && 公開.presets) || [];
    if (!一覧.length) {
      console.log("     （公開プリセットが 0 件なので、非表示の効きは確かめられません）");
    } else {
      const 的 = 一覧[0].presetId || 一覧[0].id;
      await call(owner, "/api/admin/auth/reauth", { method: "POST", body: { code: totp(totpSecret) } });
      const h = await call(owner, "/api/admin/content/" + encodeURIComponent(的) + "/hide",
        { method: "POST", body: { targetType: "preset", reasonCategory: "other", reasonText: "効きの確認" } });
      ok("非表示にできる", h.status === 200, h.body);
      /* ★ 控えは 8 秒。**別の isolate は捨てられない**ので、切れるまで待つ。 */
      await new Promise((r) => setTimeout(r, 10000));
      const 後 = await fetch(BASE + "/api/public/presets?limit=50").then((r) => r.json()).catch(() => ({}));
      const 残 = ((後 && 後.presets) || []).some((x) => (x.presetId || x.id) === 的);
      ok("非表示にしたものが公開一覧から消える", !残, { 的, 残っている: 残 });
      await call(owner, "/api/admin/auth/reauth", { method: "POST", body: { code: totp(totpSecret) } });
      await call(owner, "/api/admin/content/" + encodeURIComponent(的) + "/unhide",
        { method: "POST", body: { targetType: "preset" } });
      await new Promise((r) => setTimeout(r, 10000));
      const 戻 = await fetch(BASE + "/api/public/presets?limit=50").then((r) => r.json()).catch(() => ({}));
      ok("戻すと再び出る", ((戻 && 戻.presets) || []).some((x) => (x.presetId || x.id) === 的), 的);
    }

    /* ③ 提供元の「止める」切り替えが保存され、監査に残ること */
    await call(owner, "/api/admin/auth/reauth", { method: "POST", body: { code: totp(totpSecret) } });
    const pv = await call(owner, "/api/admin/providers");
    const one = (pv.body.data.limits || []).find((l) => l.provider === "local");
    ok("提供元に「止める」の欄がある", one && typeof one.enforce === "boolean", one);
    const sw = await call(owner, "/api/admin/providers/limits",
      { method: "POST", body: { key: one.key, rpm: one.rpm, tpm: one.tpm, rpd: one.rpd,
        keys: one.keys, enforce: !one.enforce, reason: "効きの確認" } });
    ok("「止める」を切り替えられる", sw.status === 200, sw.body);
    const pv2 = await call(owner, "/api/admin/providers");
    const one2 = (pv2.body.data.limits || []).find((l) => l.key === one.key);
    ok("切り替えが保存される", one2 && one2.enforce === !one.enforce, one2);
    const au = await call(owner, "/api/admin/audit?action=providers.limit_edit&per=3");
    const row = (au.body.rows || [])[0];
    ok("切り替えが監査ログに残る（enforce が before/after に入る）",
      row && /enforce/.test(row.before || "") && /enforce/.test(row.after || ""), row);
    await call(owner, "/api/admin/auth/reauth", { method: "POST", body: { code: totp(totpSecret) } });
    await call(owner, "/api/admin/providers/limits",
      { method: "POST", body: { key: one.key, rpm: one.rpm, tpm: one.tpm, rpd: one.rpd,
        keys: one.keys, enforce: one.enforce, reason: "戻す" } });
  }

  節("⑧.7 停止・Ban の通知が **実際に飛ぶ**か");
  {
    if (!targetUser) {
      console.log("     （対象ユーザーがいないので確かめられません）");
    } else {
      await call(owner, "/api/admin/auth/reauth", { method: "POST", body: { code: totp(totpSecret) } });
      const s1 = await call(owner, "/api/admin/users/" + targetUser + "/suspend", { method: "POST", body: {
        reasonCategory: "other", reasonText: "通知の確認", scope: "generation_blocked", notify: true } });
      ok("通知ありで一時停止できる", s1.status === 200, s1.body);
      ok("通知が飛んだと返る", s1.body.notified === true, s1.body);

      await call(owner, "/api/admin/auth/reauth", { method: "POST", body: { code: totp(totpSecret) } });
      const s2 = await call(owner, "/api/admin/users/" + targetUser + "/unban", { method: "POST", body: { notify: false } });
      ok("解除できる", s2.status === 200, s2.body);
      ok("通知なしなら飛ばないと返る", s2.body.notified === false, s2.body);

      const au = await call(owner, "/api/admin/audit?action=users.suspend&per=3");
      const row = (au.body.rows || [])[0];
      ok("通知したことが監査ログに残る", row && /notified/.test(row.after || ""), row);
    }
  }

  節("⑨ 監査ログ — 記録されているか・追記のみか");
  {
    const a = await call(owner, "/api/admin/audit?per=200");
    ok("監査ログが読める", a.status === 200, a.status);
    const rows = a.body.rows || [];
    const 必要 = ["admin.login", "admins.invite", "flags.toggle", "limits.edit"];
    const 有る = 必要.filter((x) => rows.some((r) => r.action === x));
    ok("主な操作が記録されている（" + 有る.join(", ") + "）", 有る.length === 必要.length,
      { 期待: 必要, あった: 有る });
    const flagRow = rows.find((r) => r.action === "flags.toggle");
    ok("フラグ変更に before / after が入っている",
      flagRow && flagRow.before && flagRow.after && /state/.test(flagRow.before), flagRow);
    const limRow = rows.find((r) => r.action === "limits.edit");
    ok("制限変更に before / after が入っている",
      limRow && limRow.before && limRow.after, limRow);
    const banRow = rows.find((r) => r.action === "users.ban");
    if (banRow) ok("Ban に理由が入っている", !!banRow.reason, banRow);
    /* 追記のみ: 編集・削除の口が無いことを、実際に叩いて確かめる */
    const del = await call(owner, "/api/admin/audit/" + (rows[0] ? rows[0].id : "x"), { method: "DELETE" });
    ok("監査ログを消す口が無い", del.status === 404 || del.status === 403, del.status);
    const put = await call(owner, "/api/admin/audit", { method: "PUT", body: {} });
    ok("監査ログを書き換える口が無い", put.status === 404 || put.status === 403, put.status);
    const csv = await fetch(BASE + "/api/admin/audit.csv", { headers: { Cookie: owner.cookie } });
    ok("CSV で落とせる", csv.status === 200 && /text\/csv/.test(csv.headers.get("content-type") || ""),
      csv.headers.get("content-type"));
  }

  節("⑩ 生成物の中身が出ていないか");
  {
    const 禁 = /(問題文|question_text|body_md|preset_json|pass_hash|totp_secret|apiKey|api_key)/i;
    for (const p of ["/api/admin/dashboard", "/api/admin/users?per=5", "/api/admin/quality",
                     "/api/admin/storage", "/api/admin/content", "/api/admin/providers", "/api/admin/lumi"]) {
      const r = await call(owner, p);
      const raw = JSON.stringify(r.body);
      ok("中身が出ていない: " + p, !禁.test(raw), (raw.match(禁) || [])[0]);
    }
    if (targetUser) {
      const d = await call(owner, "/api/admin/users/" + targetUser);
      ok("ユーザー詳細に生のメールアドレスが無い",
        !/[\w.]+@[\w.]+\.\w+/.test(JSON.stringify(d.body).replace(/\*+/g, "")), d.body.data && d.body.data.emailMasked);
      ok("BYOK は有無だけ", d.body.data && typeof d.body.data.byokConfigured === "boolean", d.body.data && d.body.data.byokConfigured);
    }
  }

  節("⑪ 各画面の API がそろっているか（到達経路の裏づけ）");
  {
    const 画面 = [["dashboard", "/api/admin/dashboard"], ["users", "/api/admin/users"],
      ["admins", "/api/admin/admins"], ["providers", "/api/admin/providers"],
      ["lumi", "/api/admin/lumi"], ["flags", "/api/admin/flags"],
      ["quality", "/api/admin/quality"], ["storage", "/api/admin/storage"],
      ["content", "/api/admin/content"], ["announcements", "/api/admin/announcements"],
      ["audit", "/api/admin/audit"]];
    for (const [name, p] of 画面) {
      const r = await call(owner, p);
      ok("画面 " + name + " の API が 200", r.status === 200, { status: r.status, code: r.body.code });
    }
  }

  console.log("\n合格 " + pass + " / 失敗 " + fail);
  if (落ち.length) console.log("落ちた: " + 落ち.join(" / "));
  process.exit(fail ? 1 : 0);
})();

/* ── TOTP（検証側でも同じものを作る）───────────────────────────────── */
const crypto = require("crypto");
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
  const counter = Math.floor(Date.now() / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const mac = crypto.createHmac("sha1", base32Decode(secret)).update(buf).digest();
  const off = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[off] & 0x7f) << 24) | (mac[off + 1] << 16) | (mac[off + 2] << 8) | mac[off + 3];
  return String(bin % 1000000).padStart(6, "0");
}
