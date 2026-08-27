/* 開発環境の分離が効いているかを確かめる（AI もブラウザも使わない）。

   ここで固定するのは次の 4 点。
     ・API の接続先が本番ホストのときだけ本番を指す
     ・開発版の設定が本番 D1 を掴んだら止まる
     ・開発版では Firebase 連携が無効になる
     ・DEV 表示と noindex が本番では出ない

   実行: node vqdevenv.cjs
*/
const fs = require("fs");
const path = require("path");

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; failures.push(name + (detail ? " — " + detail : "")); console.log(`  × ${name}${detail ? " — " + detail : ""}`); }
}
function section(t) { console.log(`\n── ${t} ──`); }

const ROOT = __dirname;
const INDEX = fs.readFileSync(path.join(ROOT, "client", "index.html"), "utf8");
const WORKER = fs.readFileSync(path.join(ROOT, "server", "src", "worker.js"), "utf8");
const PROD_TOML = fs.readFileSync(path.join(ROOT, "server", "wrangler.toml"), "utf8");
const DEV_TOML = fs.readFileSync(path.join(ROOT, "server", "wrangler.dev.toml"), "utf8");
const GITIGNORE = fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8");

/* client/index.html から純関数だけを取り出して評価する。
   ブラウザ全体を起こさずに接続先の決まり方を確かめられる。 */
function loadResolvers() {
  const grab = (name) => {
    const i = INDEX.indexOf("function " + name + "(");
    if (i < 0) throw new Error(name + " が見つかりません");
    /* 対応する閉じ括弧まで取る */
    let depth = 0, started = false, end = i;
    for (let k = i; k < INDEX.length; k++) {
      const c = INDEX[k];
      if (c === "{") { depth++; started = true; }
      else if (c === "}") { depth--; if (started && depth === 0) { end = k + 1; break; } }
    }
    return INDEX.slice(i, end);
  };
  const src = 'const VQ_PRODUCTION_HOSTS = ["vocabuquiz.app", "www.vocabuquiz.app"];\n'
    + 'const VQ_PRODUCTION_API = "https://vocabuquiz-api.rintyblog.workers.dev";\n'
    + grab("__vqResolveApiBase") + "\n" + grab("__vqResolveEnv") + "\n"
    + "return { api: __vqResolveApiBase, env: __vqResolveEnv, PROD_API: VQ_PRODUCTION_API };";
  return new Function(src)();
}
const R = loadResolvers();

/* ══════════════════════════════════════════════════════════
   §6 API 接続先
   ══════════════════════════════════════════════════════════ */
section("§6 API の接続先");
ok("本番ホスト vocabuquiz.app は本番 API を選ぶ",
  R.api("vocabuquiz.app", false, "https://vocabuquiz.app") === R.PROD_API);
ok("本番ホスト www.vocabuquiz.app は本番 API を選ぶ",
  R.api("www.vocabuquiz.app", false, "https://www.vocabuquiz.app") === R.PROD_API);
ok("開発版 workers.dev は location.origin を選ぶ",
  R.api("vocabuquiz-api-dev.rintyblog.workers.dev", false, "https://vocabuquiz-api-dev.rintyblog.workers.dev")
    === "https://vocabuquiz-api-dev.rintyblog.workers.dev");
ok("未知のサブドメインは本番 API を選ばない",
  R.api("sede-demo.vocabuquiz.app", false, "https://sede-demo.vocabuquiz.app") !== R.PROD_API,
  R.api("sede-demo.vocabuquiz.app", false, "https://sede-demo.vocabuquiz.app"));
ok("Netlify などの別ホストも本番 API を選ばない",
  R.api("vocabuquiz-dev.netlify.app", false, "https://vocabuquiz-dev.netlify.app") !== R.PROD_API);
ok("ローカルは従来どおり :8791 を選ぶ",
  R.api("127.0.0.1", true, "http://127.0.0.1:8788") === "http://127.0.0.1:8791");
ok("LAN の私有IPも :8791 を選ぶ",
  R.api("192.168.1.20", true, "http://192.168.1.20:8788") === "http://192.168.1.20:8791");
ok("*.vocabuquiz.app を丸ごと本番扱いする正規表現を使っていない",
  !/\/\(\^\|\\\.\)vocabuquiz\\\.app\$\/|\(\^\|\\\.\)vocabuquiz/.test(INDEX)
  || !/test\(__APP_HOSTNAME__\)\s*\?\s*"https:\/\/vocabuquiz-api/.test(INDEX));

section("§6 環境の判定");
ok("本番ホストは production", R.env("www.vocabuquiz.app", false, false, "https://www.vocabuquiz.app") === "production");
ok("開発版ホストは development",
  R.env("vocabuquiz-api-dev.rintyblog.workers.dev", false, false, "https://x") === "development");
ok("localhost は local", R.env("localhost", true, false, "http://localhost:8788") === "local");
ok("file: は local", R.env("", false, true, "null") === "local");

section("§6 window への公開（|| 本番 フォールバックを塞ぐ）");
ok("window.AUTH_API_BASE を必ず設定している", /window\.AUTH_API_BASE = VQ_API_BASE;/.test(INDEX));
ok("window.API_BASE を必ず設定している", /window\.API_BASE = VQ_API_BASE;/.test(INDEX));
ok("予備の接続先へ本番を足すのは本番のときだけ",
  /if \(typeof VQ_IS_PRODUCTION === "undefined" \|\| VQ_IS_PRODUCTION\)\s*\n\s*pushBase\("https:\/\/vocabuquiz-api/.test(INDEX));
ok("AUTH_API_FALLBACK_BASE が開発版で本番を指さない",
  /const AUTH_API_FALLBACK_BASE = VQ_IS_PRODUCTION \? VQ_PRODUCTION_API : VQ_API_BASE;/.test(INDEX));

/* ══════════════════════════════════════════════════════════
   §5 本番 D1 書き込み防止
   ══════════════════════════════════════════════════════════ */
section("§5 本番 D1 書き込み防止");
/* worker.js から純関数を取り出して評価する */
function loadWorkerGuard() {
  const start = WORKER.indexOf("const PRODUCTION_D1_ID =");
  const end = WORKER.indexOf("export function firebaseEnabled");
  if (start < 0 || end < 0) throw new Error("環境ガードが見つかりません");
  const body = WORKER.slice(start, end).replace(/export function/g, "function");
  return new Function(body + "\nreturn { check: checkEnvironmentSafety, isDev: isDevelopmentEnv };")();
}
const G = loadWorkerGuard();
ok("本番（VQ_ENV 未設定）は素通り", G.check({}).ok === true);
ok("本番（VQ_ENV=production）は素通り",
  G.check({ VQ_ENV: "production", D1_DATABASE_NAME: "vocabuquiz_auth" }).ok === true);
ok("development + 本番 D1 名 で起動拒否",
  G.check({ VQ_ENV: "development", D1_DATABASE_NAME: "vocabuquiz_auth" }).ok === false);
ok("development + 本番 D1 の ID で起動拒否",
  G.check({ VQ_ENV: "development", D1_DATABASE_ID: "fe6346ac-dc7d-4a69-90a6-1919456716b2" }).ok === false);
ok("development + 本番 APP_BASE_URL で起動拒否",
  G.check({ VQ_ENV: "development", APP_BASE_URL: "https://vocabuquiz.app" }).ok === false);
ok("development + CF_PAGES_API_TOKEN で起動拒否",
  G.check({ VQ_ENV: "development", CF_PAGES_API_TOKEN: "x" }).ok === false);
ok("development + RESEND_API_KEY で起動拒否",
  G.check({ VQ_ENV: "development", RESEND_API_KEY: "x" }).ok === false);
ok("正しい開発版設定は通る",
  G.check({ VQ_ENV: "development", D1_DATABASE_NAME: "vocabuquiz_auth_dev",
            D1_DATABASE_ID: "aaaa-bbbb", APP_BASE_URL: "https://vocabuquiz-api-dev.x.workers.dev" }).ok === true);
ok("リクエスト処理の前にガードを呼んでいる",
  /const envGuard = checkEnvironmentSafety\(env\);[\s\S]{0,400}?const url = new URL\(request\.url\);/.test(WORKER));

/* ══════════════════════════════════════════════════════════
   §5 Firebase 無効化
   ══════════════════════════════════════════════════════════ */
section("§5 開発版の Firebase 無効化");
ok("Firestore を取る口で開発版を弾く",
  /_vqFirebaseBlockedReason\(\);\s*\n\s*if \(blocked\)/.test(INDEX));
ok("本番では従来どおり動く（production なら理由を返さない）",
  /typeof window\.VQ_IS_PRODUCTION === "boolean" && !window\.VQ_IS_PRODUCTION/.test(INDEX));
ok("利用者へ理由が伝わる文言がある", /開発環境では Firebase 連携が無効です/.test(INDEX));
ok("通知の書き込みも同じ口を通る（_adminGetDb → _drawerShareGetDb）",
  /_adminState\.db = _drawerShareGetDb\(\);/.test(INDEX));
ok("Worker 側にも判定関数がある", /export function firebaseEnabled\(env\)/.test(WORKER));

/* ══════════════════════════════════════════════════════════
   §7 DEV 表示
   ══════════════════════════════════════════════════════════ */
section("§7 DEV 表示");
const badge = (() => {
  const i = INDEX.indexOf('<script id="vq-env-badge">');
  const j = INDEX.indexOf("</script>", i);
  return i < 0 ? "" : INDEX.slice(i, j);
})();
ok("バッジのスクリプトが head にある", !!badge && INDEX.indexOf(badge) < INDEX.indexOf("</head>"));
ok("本番ホストでは即 return（何もしない）", /if \(PROD\.indexOf\(h\) >= 0\) return;/.test(badge));
ok("開発版で noindex,nofollow を入れる", /m\.content = "noindex,nofollow,noarchive"/.test(badge));
ok("本番では meta robots を足さない（return が先）",
  badge.indexOf("return;") < badge.indexOf('m.name = "robots"'));
ok("タイトル先頭へ [DEV] を付ける", /"\[" \+ \(mode === "local" \? "LOCAL" : "DEV"\) \+ "\] "/.test(badge));
/* 文字は出さない方針へ変更（利用者の指示）。帯だけで見分ける。 */
ok("バッジに文字を入れない", !/textContent = .*BUILD/.test(badge) && /aria-hidden/.test(badge));
ok("バッジが操作を妨げない（pointer-events:none）", /pointer-events:none/.test(badge));
ok("本番と視覚的に区別できる（上端の縞）",
  /repeating-linear-gradient/.test(badge) && /height:4px/.test(badge));
ok("印刷時はバッジを出さない", /@media print\{#vqEnvBadge\{display:none\}\}/.test(badge));

/* ══════════════════════════════════════════════════════════
   §1〜§4 設定ファイル
   ══════════════════════════════════════════════════════════ */
section("§1 秘密情報");
ok("wrangler.toml に Cloudflare API Token が無い", !/cfut_[A-Za-z0-9]{10,}/.test(PROD_TOML));
ok("wrangler.toml に CF_PAGES_API_TOKEN の代入が無い", !/^\s*CF_PAGES_API_TOKEN\s*=/m.test(PROD_TOML));
ok("wrangler.dev.toml にも API Token が無い", !/cfut_[A-Za-z0-9]{10,}/.test(DEV_TOML));
ok("wrangler.dev.toml に CF_PAGES_API_TOKEN が無い", !/^\s*CF_PAGES_API_TOKEN\s*=/m.test(DEV_TOML));
ok("wrangler.dev.toml に RESEND_API_KEY が無い", !/^\s*RESEND_API_KEY\s*=/m.test(DEV_TOML));
ok("CF_ACCOUNT_ID は Token と別の行にある（構造分離）",
  /^\s*CF_ACCOUNT_ID\s*=/m.test(PROD_TOML) && !/CF_ACCOUNT_ID.*CF_PAGES_API_TOKEN/.test(PROD_TOML));

section("§4 開発版設定");
const chk = require("child_process");
ok("wrangler.dev.toml の name が本番と違う", /^name = "vocabuquiz-api-dev"$/m.test(DEV_TOML));
ok("VQ_ENV = development", /^VQ_ENV = "development"$/m.test(DEV_TOML));
ok("cron を持たない", !/^\[triggers\]/m.test(DEV_TOML));
ok("D1 は本番の database_id を使っていない", !/fe6346ac-dc7d-4a69-90a6-1919456716b2/.test(DEV_TOML));
ok("D1 の名前に _dev が付いている", /database_name = "vocabuquiz_auth_dev"/.test(DEV_TOML));
ok("vars と [[d1_databases]] の ID が一致している",
  (() => {
    const a = (/^D1_DATABASE_ID = "(.*)"$/m.exec(DEV_TOML) || [])[1];
    const b = (/^database_id = "(.*)"$/m.exec(DEV_TOML) || [])[1];
    return !!a && a === b;
  })());

/* プレースホルダ拒否は **合成した設定**で確かめる。
   実ファイルの状態（ID 確定済みかどうか）に左右されないようにするため。 */
const { checkDevConfig } = require("./server/scripts/check-dev-config.cjs.js");
ok("プレースホルダのままなら検査が拒否する",
  checkDevConfig(DEV_TOML.replace(/"c[0-9a-f-]{8,}"/g, '"__VOCABUQUIZ_DEV_D1_ID__"')
    .replace(/^database_id = ".*"$/m, 'database_id = "__VOCABUQUIZ_DEV_D1_ID__"'))
    .some((m) => /プレースホルダ/.test(m)));
ok("本番 D1 の ID を書いたら検査が拒否する",
  checkDevConfig(DEV_TOML.replace(/^database_id = ".*"$/m,
    'database_id = "fe6346ac-dc7d-4a69-90a6-1919456716b2"'))
    .some((m) => /本番 D1/.test(m)));
ok("いまの開発版設定は検査を通る", checkDevConfig(DEV_TOML).length === 0,
  JSON.stringify(checkDevConfig(DEV_TOML)));
const res = chk.spawnSync("node", [path.join(ROOT, "server/scripts/check-dev-config.mjs")], { encoding: "utf8" });
ok("実ファイルでも検査を通る（deploy してよい状態）", res.status === 0, (res.stdout || "").slice(-200));
ok("本番設定の検査は通る", /✓ 秘密値は含まれていません/.test(res.stdout || ""));

section("§3 .gitignore");
for (const p of ["node_modules/", "_backup_*/", "_wip_*/", "_bk_*/", "server/.local-run/",
                 "server/.dev.vars", "server/app.db", "exports/", "test-results/",
                 "tmp_*", "artifacts/", "*.log", ".DS_Store"]) {
  ok(`${p} を除外している`, GITIGNORE.split(/\r?\n/).some((l) => l.trim() === p));
}
ok(".claude/settings.local.json を除外している（実トークンが残る）",
  /^\.claude\/settings\.local\.json$/m.test(GITIGNORE));
ok("client/_backup_*/ も除外している", /^client\/_backup_\*\/$/m.test(GITIGNORE));
ok("server/wrangler.toml は追跡できる（無条件 ignore していない）",
  !/^server\/wrangler\.toml$/m.test(GITIGNORE));

console.log(`\n══ まとめ ══`);
console.log(`  合格 ${pass} / 不合格 ${fail}`);
failures.forEach((f) => console.log(`    - ${f}`));
process.exit(fail ? 1 : 0);
