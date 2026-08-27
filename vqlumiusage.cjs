/* ══════════════════════════════════════════════════════════════════════
   LUMI の使用量（記録・期間・画面）

   「あとどれくらい使えるのか」を、利用者がいつでも見られるようにした。

   ここで見るのは 4 つ。
     ・期間の計算  日次＝**使い始めから 24 時間**（カレンダー日ではない）
                   週次＝**毎週日曜 00:00 日本時間**（サーバが UTC でも）
     ・色          100% に近づくほど赤くなる
     ・記録        サーバに貯まり、別の端末から見ても同じ数になる
     ・嘘をつかない 取れなかったときに **0% と出さない**

   **「1 回で何 % 使うか」の決まりは、まだ入っていない。**
   ここで確かめるのは、記録できること・正しく期間を切れること・出せること。

   使い方: node vqlumiusage.cjs            （全部）
           node vqlumiusage.cjs --no-ai    （AI を呼ばない範囲だけ）
   ══════════════════════════════════════════════════════════════════════ */
const fs = require("fs");
const path = require("path");
const API = process.env.VQ_API || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
const UI = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/-dev\.|127\.0\.0\.1|localhost/.test(API)) { console.error("本番では実行しません。"); process.exit(2); }
if (!/-dev\.|127\.0\.0\.1|localhost/.test(UI)) { console.error("本番では実行しません。"); process.exit(2); }

const INDEX = require("./vqsrc.cjs").丸ごと();
const WORKER = fs.readFileSync(path.join(__dirname, "server", "src", "worker.js"), "utf8");

let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => {
  c ? (pass++, console.log("  ok   " + n))
    : (fail++, bad.push(n), console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 240) : "")));
};
const section = (t) => console.log("\n══ " + t + " ══");
const JST = (ms) => new Date(ms).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", hour12: false });
/* 日本時間の「YYYY-MM-DD HH:mm」を ms にする（テスト側の物差し） */
const at = (s) => {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/);
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - 9 * 3600 * 1000;
};

/* サーバの計算部分だけを取り出して動かす。**テスト側で書き写さない。** */
function serverBits() {
  const s = WORKER.indexOf("const LUMI_JST_OFFSET_MS =");
  const e = WORKER.indexOf("/* ── ① 記録");
  if (s < 0 || e < 0 || e <= s) throw new Error("使用量の部品が見つかりません");
  /* ★ limitValue は 別のまとまり（admin.js）から 来ている。
     ここは 期間の 計算を 見る検査なので、**管理画面の 上書きは 無し**
     （null）として 動かす。渡さないと ReferenceError で 落ちる。
     2026-08-28: 圧縮前を 読むように 直すまで、この検査は
     その手前で 落ちていて ここまで 来ていなかった。 */
  return new Function("env", "limitValue", WORKER.slice(s, e)
    + "\nreturn { week: lumiWeeklyPeriod, compute: lumiUsageCompute,"
    + "         policy: lumiUsagePolicy, cost: lumiUsageCost, DAY: LUMI_DAY_MS };")(
      undefined, function () { return null; });
}
const S = serverBits();
/* 使用率と「使えるか」は保存より後ろにあるので、別に取り出す。 */
function serverBits2() {
  const s = WORKER.indexOf("function lumiPercentage(");
  const e = WORKER.indexOf("/* ── ④ 画面へ返す形");
  return new Function(WORKER.slice(s, e) + "\nreturn { pct: lumiPercentage, can: lumiCanUse };")();
}
const S2 = serverBits2();
/* 画面側の色分けと残り時間 */
function clientBits() {
  const s = INDEX.indexOf("  function usageTone(pct) {");
  const e = INDEX.indexOf("  /* 1 行ぶん。");
  if (s < 0 || e < 0 || e <= s) throw new Error("画面側の部品が見つかりません");
  return new Function(INDEX.slice(s, e) + "\nreturn { tone: usageTone, until: usageUntil, ago: usageAgo };")();
}
const C = clientBits();

/* ── 1) 日次＝使い始めから 24 時間 ─────────────────────────────── */
section("日次の期間（使い始めから 24 時間・カレンダー日ではない）");
{
  const start = at("2026-08-12 15:30");
  const row = { daily_units: 5, daily_gen: 5, daily_period_start: start,
                daily_reset_at: start + S.DAY, weekly_period_start: 0 };
  const before = S.compute(row, at("2026-08-13 15:29"));
  const onTime = S.compute(row, at("2026-08-13 15:30"));
  const after = S.compute(row, at("2026-08-13 15:31"));
  console.log("   8/12 15:30 に使い始め → リセットは " + JST(start + S.DAY));
  ok("★リセット直前（翌 15:29）はまだ残っている", before.daily.used === 5, before.daily.used);
  ok("★リセット時刻ちょうど（翌 15:30）で 0 になる", onTime.daily.used === 0, onTime.daily.used);
  ok("★リセット直後（翌 15:31）も 0", after.daily.used === 0, after.daily.used);
  ok("★切れたあとはリセット時刻を出さない（次に使ったときから）",
    onTime.daily.resetAt === null, onTime.daily.resetAt);
  ok("生きている間はリセット時刻を出す", before.daily.resetAt === start + S.DAY);
  ok("24 時間ちょうどで切る", S.DAY === 24 * 3600 * 1000, S.DAY);
  ok("★カレンダー日をまたいでも切れない（0:00 では消えない）",
    S.compute(row, at("2026-08-13 00:05")).daily.used === 5);
  ok("生の数も一緒に消える", onTime.daily.generations === 0 && onTime.daily.questions === 0);
}

/* ── 2) 週次＝毎週日曜 00:00 JST ───────────────────────────────── */
section("週次の期間（毎週日曜 00:00 日本時間）");
{
  const cases = [
    ["2026-08-12 22:00", "水曜の夜"],
    ["2026-08-15 23:59", "土曜 23:59"],
    ["2026-08-16 00:00", "日曜 00:00 ちょうど"],
    ["2026-08-16 00:01", "日曜 00:01"]
  ];
  cases.forEach(([t, label]) => {
    const w = S.week(at(t));
    const wd = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", weekday: "long" });
    console.log("   " + label.padEnd(16) + " → 期間 " + JST(w.start) + " ～ " + JST(w.resetAt));
    ok(label + "：始まりが日曜 00:00 JST", wd.format(new Date(w.start)) === "日曜日"
      && JST(w.start).indexOf("0:00:00") > 0, JST(w.start));
    ok(label + "：終わりも日曜 00:00 JST", wd.format(new Date(w.resetAt)) === "日曜日");
    ok(label + "：ちょうど 7 日", w.resetAt - w.start === 7 * S.DAY);
  });
  const sat = S.week(at("2026-08-15 23:59"));
  const sun = S.week(at("2026-08-16 00:00"));
  ok("★土曜 23:59 と日曜 00:00 で期間が入れ替わる", sat.start !== sun.start,
    { 土: JST(sat.start), 日: JST(sun.start) });
  ok("★土曜のリセット時刻 ＝ 日曜の期間の始まり", sat.resetAt === sun.start);
  /* 前の週の数は持ち越さない */
  const row = { weekly_units: 9, weekly_period_start: sat.start, daily_period_start: 0 };
  ok("★週が変わると 0 になる", S.compute(row, at("2026-08-16 00:00")).weekly.used === 0);
  ok("同じ週の間は残る", S.compute(row, at("2026-08-15 23:59")).weekly.used === 9);
  ok("★週次のリセット時刻は、使っていなくても必ず出せる",
    S.compute({}, at("2026-08-12 22:00")).weekly.resetAt === sat.resetAt);
}
section("サーバが UTC でも日本時間で切る");
{
  /* UTC 15:00 = 翌日 0:00 JST。ここを間違えると 1 日ずれる。 */
  const w = S.week(Date.UTC(2026, 7, 15, 15, 0));      /* = 8/16 00:00 JST（日曜） */
  ok("★UTC 土曜 15:00（＝日本の日曜 0:00）で新しい週になる",
    w.start === Date.UTC(2026, 7, 15, 15, 0), JST(w.start));
}

/* ── 3) 使用率と色 ─────────────────────────────────────────────── */
section("使用率");
[[0, 100, 0], [25, 100, 25], [50, 100, 50], [75, 100, 75],
 [90, 100, 90], [99, 100, 99], [100, 100, 100], [120, 100, 100]].forEach(([u, l, want]) => {
  ok(u + " / " + l + " = " + want + "%", S2.pct(u, l) === want, S2.pct(u, l));
});
ok("★上限が 0（未設定）なら割合を出さない", S2.pct(3, 0) === null, S2.pct(3, 0));
ok("★無制限(-1)でも割合を出さない", S2.pct(3, -1) === null, S2.pct(3, -1));

section("色（100% に近づくほど赤く）");
[[null, "none"], [0, "ok"], [25, "ok"], [49, "ok"], [50, "mid"], [69, "mid"],
 [70, "warn"], [84, "warn"], [85, "high"], [94, "high"],
 [95, "crit"], [99, "crit"], [100, "full"]].forEach(([p, want]) => {
  ok((p === null ? "未設定" : p + "%") + " → " + want, C.tone(p) === want, C.tone(p));
});
{
  /* 段が上がるほど赤くなっていること（色そのものを画面の CSS から読む） */
  const css = INDEX.slice(INDEX.indexOf("var USAGE_CSS = ["), INDEX.indexOf("].join(\"\\n\");", INDEX.indexOf("var USAGE_CSS = [")));
  const hexOf = (tone) => {
    const m = css.match(new RegExp('data-tone="' + tone + '"\\]>span\\{background:(#[0-9A-Fa-f]{6})'));
    return m ? m[1] : "";
  };
  /* 「赤い」＝ 赤以外（緑・青）が落ちていく、で測る。
     R-G で測ると、暗くした最大警告（R も下がる）が逆転して見える。 */
  const red = (h) => 510 - (parseInt(h.slice(3, 5), 16) + parseInt(h.slice(5, 7), 16));
  const tones = ["mid", "warn", "high", "crit", "full"].map((t) => ({ t, h: hexOf(t) }));
  console.log("   " + tones.map((x) => x.t + " " + x.h).join(" / "));
  ok("★段ごとに色が決まっている", tones.every((x) => /^#[0-9A-Fa-f]{6}$/.test(x.h)), tones);
  ok("★上の段ほど赤みが強い",
    tones.slice(1).every((x, i) => red(x.h) >= red(tones[i].h)), tones.map((x) => x.t + ":" + red(x.h)));
}

section("残り時間の書き方");
ok("1 日以上は「N日 N時間」", C.until(Date.now() + 28 * 3600e3, Date.now()) === "1日 4時間",
  C.until(Date.now() + 28 * 3600e3, Date.now()));
ok("1 日未満は「N時間N分」", C.until(Date.now() + (18 * 60 + 32) * 60e3, Date.now()) === "18時間32分",
  C.until(Date.now() + (18 * 60 + 32) * 60e3, Date.now()));
ok("1 時間未満は「N分」", C.until(Date.now() + 25 * 60e3, Date.now()) === "25分");
ok("★過ぎていれば空（作り話をしない）", C.until(Date.now() - 1000, Date.now()) === "");
ok("★まだ始まっていなければ空", C.until(null, Date.now()) === "");
ok("最終更新の書き方", C.ago(Date.now()) === "たった今" && C.ago(0) === "—");

/* ── 4) 方針の層（あとで差し替える所）───────────────────────────── */
section("上限の決め方（決め打ちしない・§12/§13）");
ok("★何も設定が無ければ「未設定(0)」", S.policy({}, { plan: "free" }).dailyLimit === 0);
ok("設定から読む", S.policy({ LUMI_DAILY_LIMIT: "50" }, { plan: "free" }).dailyLimit === 50);
ok("★プランごとに変えられる",
  S.policy({ LUMI_DAILY_LIMIT: "50", LUMI_DAILY_LIMIT_PAID: "300" }, { plan: "paid" }).dailyLimit === 300);
ok("プラン別が無ければ共通の値へ落ちる",
  S.policy({ LUMI_DAILY_LIMIT: "50" }, { plan: "paid" }).dailyLimit === 50);
ok("★空文字は「入っていない」（0 に化けない）",
  S.policy({ LUMI_DAILY_LIMIT: "50", LUMI_DAILY_LIMIT_FREE: "" }, { plan: "free" }).dailyLimit === 50);
ok("管理者は無制限", S.policy({}, { plan: "free", unlimited: true }).dailyLimit === -1);
ok("★週次も同じ仕組み",
  S.policy({ LUMI_WEEKLY_LIMIT: "200" }, { plan: "free" }).weeklyLimit === 200);

section("1 回あたりの重み（実測から決めた）");
ok("資料なしは 1", S.cost("generate", {}) === 1, S.cost("generate", {}));
ok("★資料つきは少し重い（1.5）", S.cost("generate", { hasFiles: true }) === 1.5,
  S.cost("generate", { hasFiles: true }));
ok("★重みは設定から変えられる（数を直書きしない）",
  S.cost("generate", { hasFiles: true, env: { LUMI_COST_FILES: "3" } }) === 3
  && S.cost("generate", { env: { LUMI_COST_PLAIN: "2" } }) === 2);
ok("空の設定は既定へ落ちる（0 に化けない）",
  S.cost("generate", { hasFiles: true, env: { LUMI_COST_FILES: "" } }) === 1.5);
ok("生成以外は数えない", S.cost("chat", {}) === 0 && S.cost("", {}) === 0);
ok("★換算は 1 か所（lumiUsageCost）にしかない",
  (WORKER.match(/function lumiUsageCost/g) || []).length === 1);
ok("★資料の有無を記録へ渡している",
  (WORKER.match(/hasFiles: files\.length > 0/g) || []).length === 2,
  (WORKER.match(/hasFiles: files\.length > 0/g) || []).length);

section("使えるかの判定（口だけ用意する・§10）");
ok("上限内なら通る", S2.can({ daily: { used: 1, limit: 50 }, weekly: { used: 1, limit: 200 } }).allowed === true);
ok("★日次に達したら allowed=false", S2.can({ daily: { used: 50, limit: 50 }, weekly: { used: 1, limit: 200 } }).allowed === false);
ok("週次に達しても false", S2.can({ daily: { used: 1, limit: 50 }, weekly: { used: 200, limit: 200 } }).reason === "weekly_limit");
ok("★上限が未設定なら止めない", S2.can({ daily: { used: 99, limit: 0 }, weekly: { used: 99, limit: 0 } }).allowed === true);
ok("★いまは判定するだけで止めていない",
  S2.can({ daily: { used: 1, limit: 50 }, weekly: { used: 1, limit: 200 } }).enforced === false);

/* ── 5) つなぎ（source を読む）─────────────────────────────────── */
section("つなぎ");
ok("使用量の表が ai_quota とは別になっている", /CREATE TABLE IF NOT EXISTS lumi_usage/.test(WORKER));
ok("★ai_quota を書き換えていない（既存のチャット枠を壊さない）",
  /CREATE TABLE IF NOT EXISTS ai_quota[\s\S]{0,400}deep_search_used/.test(WORKER));
ok("口が登録されている", /path === "\/api\/lumi\/usage"/.test(WORKER));
ok("★生成が成功したときだけ記録している",
  /if \(Array\.isArray\(out\.questions\) && out\.questions\.length\) \{[\s\S]{0,120}lumiUsageRecord/.test(WORKER));
/* 呼んでいる所だけを数える（定義は `o = {}` なので当たらない書き方にする）。
   ★ 2026-08-14 に **追加の指示（/api/aigen/revise）** が増えて 3 か所になった。
     直しも AI を 1 回使うので、枠に数えないと使い放題の抜け道になる。
     数だけだと「どこか 3 か所」で通ってしまうので、下で口ごとに確かめる。 */
/* ★ 2026-08-28: **5 か所**（生成 2 ＋ 直し ＋ 会話 2）。
   3 のままだったのは、この検査が 長いあいだ 途中で 落ちていて
   一度も ここまで 来ていなかったため（圧縮ずみを 読んでいたのが 元）。
   5 か所とも 中身を 見て、AI を 1 回 使う 所だと 確かめてある。
   **増えたら また 落ちる**（それが この検査の 役目）。 */
ok("★台帳で走らせた生成も記録している",
  (WORKER.match(/lumiUsageRecord\(env, uid, \{/g) || []).length === 5,
  (WORKER.match(/lumiUsageRecord\(env, uid, \{/g) || []).length);
ok("★追加の指示（直し）も 1 回として数えている",
  /使用量は、直しでも 1 回ぶんとして数える[\s\S]{0,400}lumiUsageRecord\(env, uid, \{/.test(WORKER));
ok("★記録の失敗で生成を止めていない", /\.catch\(\(\) => null\);[\s\S]{0,200}waitUntil\(rec\)/.test(WORKER));
ok("画面は入力欄の下にボタンを置いている", /data-usopen/.test(INDEX));
ok("★モーダルで開く（入力欄を押し下げない）", /U\.mount\("vq2-lumi-usage"/.test(INDEX));
ok("LUMI の画面で有効にしている", /title: "LUMI",[\s\S]{0,200}usage: true/.test(INDEX));
ok("★画面側で使用量を計算していない（localStorage へ保存していない）",
  !/localStorage[\s\S]{0,80}lumiUsage|lumiUsage[\s\S]{0,80}localStorage/.test(INDEX));
/* 「最終更新」が戻るのは 更新ボタン・閉じる・ページの読み込み直し の 3 つだけ。
   だから開くたびに取り直す。60 秒の作り置きは、同時に呼ばれたときの受け皿として残す。 */
ok("★開くたびに取り直す（更新ボタンも必ず取り直す）",
  (INDEX.match(/fetchUsage\(true\)/g) || []).length >= 2, (INDEX.match(/fetchUsage\(true\)/g) || []).length);
ok("作り置きの仕組みは残っている（同時に呼ばれても 1 回で済む）",
  /USAGE_TTL_MS/.test(INDEX) && /usageCache\.promise/.test(INDEX));
ok("★開いている間は「最終更新」の経過だけ進める（取りに行かない）",
  /最終更新：" \+ usageAgo\(usageCache\.at\)/.test(INDEX) && /setInterval/.test(INDEX));
ok("★取れなかったとき、前の数字を消していない", /前の数字は消さない/.test(INDEX));

section("端末のまとまり（アカウントを増やして枠を増やす、を止める）");
ok("端末の表がある", /CREATE TABLE IF NOT EXISTS device_accounts/.test(WORKER));
ok("★両方の schema 一覧に入っている（片方だけだと全 API が 500 になる）",
  (WORKER.match(/CREATE TABLE IF NOT EXISTS device_accounts/g) || []).length === 2,
  (WORKER.match(/CREATE TABLE IF NOT EXISTS device_accounts/g) || []).length);
ok("★指紋は鍵をかけて保存する（生では持たない）",
  /regHmacB64u\(secret, "dev:" \+ raw\)/.test(WORKER) && !/device_key.*raw/.test(WORKER));
ok("★IP も鍵をかけて保存する", /regHmacB64u\(secret, "net:" \+ ip\)/.test(WORKER));
ok("★IP だけでまとめていない（学校ごと 1 枠にしない）",
  !/WHERE net_key = /.test(WORKER));
ok("★短すぎる指紋は 1 つのまとまりにしない", /raw\.length < 16\) return ""/.test(WORKER));
ok("★秘密が無ければ端末を使わない（全員が同じ鍵にならない）",
  /if \(!secret\) return "";/.test(WORKER));
ok("使った時点で結び付けている", /await deviceLink\(env, o\.deviceKey, id/.test(WORKER));
ok("★上限は端末ぜんぶで見る", /lumiUsageLoadRow\(env, "dev:" \+ deviceKey\)/.test(WORKER));
ok("★端末が分からなければ本人ぶんに落とす（古い画面でも壊れない）",
  /: mineRow;/.test(WORKER));
ok("★登録は止めていない（締め出さない）",
  !/deviceAccountCount[\s\S]{0,300}return regPublicError/.test(WORKER));
ok("誰かは返さず人数だけ返す", /accounts: shared/.test(WORKER) && !/userIds/.test(WORKER));

section("画面の指紋");
ok("★保存したものを使っていない（シークレットで消えるため）",
  /function deviceSignal\(\)/.test(INDEX)
  && !/deviceSignal[\s\S]{0,600}localStorage/.test(INDEX));
ok("シークレットでも変わらない値を使っている",
  /Intl\.DateTimeFormat\(\)\.resolvedOptions\(\)\.timeZone/.test(INDEX)
  && /hardwareConcurrency/.test(INDEX) && /UNMASKED_RENDERER_WEBGL/.test(INDEX));
ok("★材料が足りなければ送らない", /v\.length >= 16 \? v : ""/.test(INDEX));
/* ★ 2026-08-14 に **追加の指示（/api/aigen/revise）** が増えて 4 か所になった。
   （生成 2 か所 ＋ 直し 1 か所 ＋ 使用状況 1 か所）
   ここも数だけでは弱いので、口ごとに付いていることを確かめる。 */
/* ★ 2026-08-28: **5 か所**。/api/aigen/revise・intent・questions × 2・
   /api/lumi/usage。4 のままだったのは 上と 同じ理由。 */
ok("生成 2 か所・直し・意図・使用状況に付けている",
  (INDEX.match(/deviceHeader\(\)\)/g) || []).length === 5,
  (INDEX.match(/deviceHeader\(\)\)/g) || []).length);
["/api/aigen/questions", "/api/aigen/revise", "/api/lumi/usage"].forEach(function (p) {
  /* その口を呼ぶ直前の headers に deviceHeader() があること。 */
  var i = INDEX.indexOf('apiBase() + "' + p + '"');
  ok("　" + p + " に端末が付いている",
    i > 0 && /deviceHeader\(\)\)/.test(INDEX.slice(i, i + 400)));
});

if (process.argv.indexOf("--no-ai") >= 0) { finish(); }
else { runApi().then(runUi).then(finish).catch((e) => {
  fail++; bad.push("実際に動かす");
  console.log("\n  NG   実際に動かす — " + (e && e.stack ? e.stack.split("\n")[0] : e));
  finish();
}); }

async function api(method, p, body, token) {
  const h = { "Content-Type": "application/json" };
  if (token) h.Authorization = "Bearer " + token;
  const r = await fetch(API + p, { method, headers: h,
    body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text();
  let d = null; try { d = t ? JSON.parse(t) : null; } catch (e) { d = { raw: t.slice(0, 200) }; }
  return { status: r.status, data: d || {} };
}
async function devToken(tag) {
  const nick = tag + Date.now().toString(36).slice(-6);
  const reg = await api("POST", "/api/auth/register",
    { gradePrefix: "H1", nickname: nick, password: "DevUsg#2026a", tosAccepted: true, tosVersion: "1" });
  if (reg.data.token) return { token: reg.data.token, nick };
  const a = await api("POST", "/api/auth/register/start",
    { email: nick + "@gmail.com", gradePrefix: "H1", nickname: nick, password: "DevUsg#2026a" });
  const b = await api("POST", "/api/auth/register/verify",
    { challengeId: a.data.challengeId, code: a.data.devCode });
  const c = await api("POST", "/api/auth/register/consent",
    { registrationSession: b.data.registrationSession, agreeTerms: true,
      agreePrivacy: true, agreeAge: true, pin: "8306" });
  if (!c.data.token) throw new Error("検証アカウントを作れません");
  return { token: c.data.token, nick };
}

async function runApi() {
  section("実際にサーバへ（" + API + "）");
  const anon = await api("GET", "/api/lumi/usage");
  ok("★未ログインでも 200 で返る（画面が壊れない）", anon.status === 200, anon.status);
  ok("★未ログインで 0% と出さない", anon.data.loggedIn === false && anon.data.daily === null,
    { loggedIn: anon.data.loggedIn, daily: anon.data.daily });
  ok("案内の文がある", !!anon.data.message, anon.data.message);

  const { token, nick } = await devToken("usg");
  const before = await api("GET", "/api/lumi/usage", undefined, token);
  ok("ログインすると数が返る", before.status === 200 && before.data.loggedIn === true);
  ok("★使う前は 0", before.data.daily.used === 0 && before.data.weekly.used === 0);
  ok("★使う前は日次のリセット時刻が無い（まだ始まっていない）",
    before.data.daily.resetAt === null, before.data.daily.resetAt);
  ok("週次のリセット時刻は最初から出る", !!before.data.weekly.resetAt);
  ok("上限が設定から来ている（決め打ちではない）",
    before.data.daily.limit > 0 && before.data.weekly.limit > 0,
    { d: before.data.daily.limit, w: before.data.weekly.limit });
  ok("時間帯が日本時間", before.data.timezone === "Asia/Tokyo");

  const t0 = Date.now();
  const gen = await api("POST", "/api/aigen/questions", { prompt: "中学理科 光合成 3問 4択で", count: 3 }, token);
  const made = (gen.data.questions || []).length;
  console.log("   LUMI で生成: " + made + " 問 / " + (Date.now() - t0) + "ms");
  ok("★LUMI の生成が壊れていない（§21）", gen.status === 200 && made > 0, { s: gen.status, made });
  await new Promise((r) => setTimeout(r, 2500));

  const after = await api("GET", "/api/lumi/usage", undefined, token);
  const D = after.data.daily, W = after.data.weekly;
  console.log("   日次 " + D.used + "/" + D.limit + " = " + D.percentage.toFixed(1) + "%"
    + "  リセット " + JST(D.resetAt));
  console.log("   週次 " + W.used + "/" + W.limit + " = " + W.percentage.toFixed(1) + "%"
    + "  リセット " + JST(W.resetAt));
  ok("★使った数がサーバに残る", D.used >= 1 && W.used >= 1, { d: D.used, w: W.used });
  ok("★生の数も残る（あとで換算し直せる）",
    D.generations === 1 && D.questions === made && D.aiCalls >= 1,
    { gen: D.generations, q: D.questions, calls: D.aiCalls });
  ok("★日次のリセットは「使った時刻 ＋ 24 時間」",
    Math.abs(D.resetAt - (D.periodStart + 24 * 3600e3)) < 1000
    && Math.abs(D.periodStart - t0) < 60000,
    { start: JST(D.periodStart), reset: JST(D.resetAt) });
  ok("★週次のリセットは日曜 00:00 日本時間",
    new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", weekday: "long" })
      .format(new Date(W.resetAt)) === "日曜日" && JST(W.resetAt).indexOf("0:00:00") > 0, JST(W.resetAt));
  ok("使用率が出る", D.percentage > 0 && W.percentage > 0);
  ok("残りが出る", D.remaining === D.limit - D.used);
  ok("判定の口がある（まだ止めない）", after.data.can && after.data.can.enforced === false);

  /* 別の端末から見ても同じ数（§8）。同じ利用者で新しい接続を張る。 */
  const other = await fetch(API + "/api/lumi/usage",
    { headers: { Authorization: "Bearer " + token, "Cache-Control": "no-cache" } }).then((r) => r.json());
  ok("★別の接続から見ても同じ数（端末を変えても同じ）",
    other.daily.used === D.used && other.weekly.used === W.used,
    { a: D.used, b: other.daily.used });
  /* 別の利用者には混ざらない */
  const two = await devToken("usg2");
  const mine = await api("GET", "/api/lumi/usage", undefined, two.token);
  ok("★ほかの人の使用量が混ざらない", mine.data.daily.used === 0, mine.data.daily.used);
  global.__token = token;
}

async function runUi() {
  section("画面（" + UI + "）");
  const { chromium } = require("playwright");
  const br = await chromium.launch();
  const errs = [];
  try {
    for (const view of [{ w: 1280, h: 900, name: "PC" }, { w: 390, h: 844, name: "iPhone" },
                        { w: 820, h: 1180, name: "タブレット" }]) {
      const pg = await br.newPage({ viewport: { width: view.w, height: view.h } });
      pg.on("pageerror", (e) => errs.push(view.name + ": " + String(e.message).slice(0, 120)));
      await pg.goto(UI, { waitUntil: "domcontentloaded", timeout: 40000 });
      await pg.waitForFunction(() => window.VQ2 && VQ2.presetStudio && VQ2.activity, null, { timeout: 40000 });
      await pg.evaluate(() => {
        document.querySelectorAll(".vq2-host").forEach((h) => h.remove());
        document.body.style.overflow = "";
        VQ2.presetStudio.open({ preset: { name: "確認", questions: [] } });
      });
      await pg.waitForFunction(() => {
        const h = document.getElementById("vq2-preset-studio");
        return !!(h && h.shadowRoot && h.shadowRoot.querySelector("[data-usopen]"));
      }, null, { timeout: 20000 });
      const btn = await pg.evaluate(() => {
        const sr = document.getElementById("vq2-preset-studio").shadowRoot;
        const b = sr.querySelector("[data-usopen]"), box = sr.querySelector(".vq2-tlc-box");
        const rb = b.getBoundingClientRect(), rx = box.getBoundingClientRect();
        return { text: b.textContent.trim(), below: rb.top >= rx.bottom - 2,
                 tap: Math.round(rb.height), w: Math.round(rb.width) };
      });
      ok(view.name + "：入力欄の**下**に「使用制限」がある",
        btn.below && /使用制限/.test(btn.text), btn);

      /* 見せかけの数を入れて、色・並び・伸びを見る */
      await pg.evaluate(() => {
        document.getElementById("vq2-preset-studio").shadowRoot.querySelector("[data-usopen]").click();
      });
      await pg.waitForFunction(() => {
        const h = document.getElementById("vq2-lumi-usage");
        return !!(h && h.shadowRoot && h.shadowRoot.querySelector(".vq2-us-modal"));
      }, null, { timeout: 15000 });
      const shape = await pg.evaluate(() => {
        const A = VQ2.activity;
        A.usageCache.error = ""; A.usageCache.at = Date.now();
        A.usageCache.data = {
          ok: true, loggedIn: true, plan: "free", unlimited: false,
          daily: { used: 45, limit: 50, percentage: 90, remaining: 5,
                   resetAt: Date.now() + 18 * 3600e3 + 32 * 60e3, periodStart: Date.now() - 5 * 3600e3 },
          weekly: { used: 46, limit: 200, percentage: 23, remaining: 154,
                    resetAt: Date.now() + 28 * 3600e3 },
          can: { allowed: true, enforced: false }
        };
        const sr = document.getElementById("vq2-lumi-usage").shadowRoot;
        sr.querySelector(".vq2-us-modal").innerHTML = A.usageModalHtml();
        const rows = [...sr.querySelectorAll(".vq2-us-row")].map((r) => ({
          name: r.querySelector(".vq2-us-name").textContent.trim(),
          sub: (r.querySelector(".vq2-us-sub") || {}).textContent || "",
          pct: r.querySelector(".vq2-us-pct").textContent.trim(),
          tone: r.querySelector(".vq2-us-bar").getAttribute("data-tone"),
          width: r.querySelector(".vq2-us-bar>span").style.width,
          trans: getComputedStyle(r.querySelector(".vq2-us-bar>span")).transitionDuration,
          stacked: getComputedStyle(r).gridTemplateColumns.split(" ").length === 1
        }));
        const host = document.getElementById("vq2-lumi-usage");
        return { rows, title: sr.querySelector(".vq2-us-title").textContent.replace(/\s+/g, " ").trim(),
                 refresh: !!sr.querySelector("[data-usrefresh]"),
                 upd: (sr.querySelector(".vq2-us-upd") || {}).textContent || "",
                 overflow: host.shadowRoot.querySelector(".vq2-root").scrollWidth
                   - host.shadowRoot.querySelector(".vq2-root").clientWidth };
      });
      console.log("   " + view.name + " " + view.w + "px: " + shape.title
        + " / " + shape.rows.map((r) => r.name + " " + r.pct.split("使用済み")[0] + r.tone).join(" ／ "));
      ok(view.name + "：日次と週次が並ぶ", shape.rows.length === 2, shape.rows.length);
      ok(view.name + "：90% は赤系（high）", shape.rows[0].tone === "high", shape.rows[0].tone);
      ok(view.name + "：23% は通常色（ok）", shape.rows[1].tone === "ok", shape.rows[1].tone);
      /* ブラウザは "90.0%" を "90%" へ丸めて返す。数として比べる。 */
      ok(view.name + "：帯の幅が使用率と合う",
        Math.abs(parseFloat(shape.rows[0].width) - 90) < 0.05, shape.rows[0].width);
      ok(view.name + "：滑らかに伸びる（アニメーションがある）",
        parseFloat(shape.rows[0].trans) > 0, shape.rows[0].trans);
      ok(view.name + "：リセットまでの時間が出る", /18時間32分後にリセット/.test(shape.rows[0].sub), shape.rows[0].sub);
      ok(view.name + "：更新ボタンと最終更新がある", shape.refresh && /たった今/.test(shape.upd), shape.upd);
      ok(view.name + "：横にはみ出さない", shape.overflow <= 1, shape.overflow);
      if (view.w <= 640) ok(view.name + "：★片手で読めるよう縦に積む", shape.rows[0].stacked, shape.rows[0]);
      else ok(view.name + "：左に名前・まん中に帯・右に割合", !shape.rows[0].stacked);

      /* 取れなかったとき 0% と出さない（§18） */
      const err = await pg.evaluate(() => {
        const A = VQ2.activity;
        A.usageCache.data = null; A.usageCache.error = "使用状況を取得できませんでした。";
        const sr = document.getElementById("vq2-lumi-usage").shadowRoot;
        sr.querySelector(".vq2-us-modal").innerHTML = A.usageModalHtml();
        /* **紙面だけを読む。** 影の DOM 全体には <style> が入っていて、
           その中の "0%"（keyframes）を拾ってしまう。 */
        const modal = sr.querySelector(".vq2-us-modal");
        return { text: modal.textContent.replace(/\s+/g, " "),
                 bars: modal.querySelectorAll(".vq2-us-bar").length,
                 /* **数字そのものが出ていないこと**を見る。
                    文中の「0%」は「0% とは書かない」という説明なので、
                    文字列で探すと自分の説明文に当たってしまう。 */
                 values: modal.querySelectorAll(".vq2-us-pct").length,
                 msg: !!modal.querySelector(".vq2-us-msg.is-err"),
                 retry: !!modal.querySelector("[data-usrefresh]") };
      });
      ok(view.name + "：★失敗したとき数字を 1 つも出さない（0% と書かない）",
        err.bars === 0 && err.values === 0 && err.msg,
        { 帯: err.bars, 割合: err.values, 文: err.text.slice(0, 60) });
      ok(view.name + "：失敗したら再試行できる", err.retry && /再試行/.test(err.text));
      await pg.close();
    }
    ok("画面のエラーが出ていない", errs.length === 0, errs.slice(0, 3));
  } finally {
    await br.close();
  }
}

function finish() {
  console.log("\n合格 " + pass + " / 不合格 " + fail);
  if (bad.length) console.log("直すところ:\n  - " + bad.join("\n  - "));
  process.exit(fail ? 1 : 0);
}
