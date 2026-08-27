/* 開発版 Worker の設定が「本番へ触れない形」になっているかを、デプロイ前に確かめる。

   ここが通らないうちは wrangler deploy --config wrangler.dev.toml を実行しないこと。
   設定ミス 1 つで本番 D1 へ書けてしまうので、人の注意ではなくコードで止める。

   実行:
     node server/scripts/check-dev-config.mjs
     node server/scripts/check-dev-config.mjs --config server/wrangler.dev.toml
*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(HERE, "..");

/* 本番の識別子。ここに一致したら開発版として不合格。 */
export const PRODUCTION = {
  workerName: "vocabuquiz-api",
  d1DatabaseId: "fe6346ac-dc7d-4a69-90a6-1919456716b2",
  d1DatabaseName: "vocabuquiz_auth",
  baseUrl: "https://vocabuquiz.app"
};

/* toml を厳密に解析しない。必要なのは「値が何か」だけなので行で拾う。
   [vars] などのセクションをまたいで同名キーが出ることはこの設定では無い。 */
export function readToml(text) {
  const out = {};
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+?)\s*(?:#.*)?$/.exec(line);
    if (!m) continue;
    let v = m[2].trim();
    if (/^".*"$/.test(v) || /^'.*'$/.test(v)) v = v.slice(1, -1);
    /* 同名キーは最初のものを採る（本番/開発とも 1 度しか書かない） */
    if (!(m[1] in out)) out[m[1]] = v;
  }
  out.__sections = (String(text || "").match(/^\s*\[\[?[^\]]+\]\]?/gm) || [])
    .map((s) => s.trim());
  return out;
}

/* 開発版設定の検査。問題があれば理由の配列を返す（空なら合格）。 */
export function checkDevConfig(text, opts) {
  const allowPlaceholder = !!(opts && opts.allowPlaceholder);
  const t = readToml(text);
  const errors = [];

  if (t.name === PRODUCTION.workerName)
    errors.push(`name が本番と同じ（${PRODUCTION.workerName}）。上書きしてしまいます`);
  if (!t.name || !/-dev$/.test(t.name))
    errors.push(`name は "-dev" で終わる必要があります（現在: ${t.name || "未設定"}）`);

  if (t.VQ_ENV !== "development")
    errors.push(`VQ_ENV が "development" ではありません（現在: ${t.VQ_ENV || "未設定"}）`);

  /* D1 */
  if (!t.database_id)
    errors.push("database_id がありません");
  else if (/^__.*__$/.test(t.database_id) && !allowPlaceholder)
    errors.push(`database_id がプレースホルダのままです（${t.database_id}）。`
      + " wrangler d1 create vocabuquiz_auth_dev で作った ID に置き換えてください");
  else if (t.database_id === PRODUCTION.d1DatabaseId)
    errors.push("database_id が **本番 D1** です。開発版から本番のデータを壊します");
  if (t.database_name === PRODUCTION.d1DatabaseName)
    errors.push(`database_name が本番と同じ（${PRODUCTION.d1DatabaseName}）`);
  /* Worker の実行時ガードは vars 側の値を見る。両者がずれるとガードが効かない。 */
  if (t.D1_DATABASE_ID !== t.database_id
      && !(allowPlaceholder && /^__.*__$/.test(String(t.database_id))
           && /^__.*__$/.test(String(t.D1_DATABASE_ID))))
    errors.push("vars の D1_DATABASE_ID が [[d1_databases]] の database_id と一致しません"
      + "（Worker の実行時ガードが効かなくなります）");
  if (t.D1_DATABASE_NAME !== t.database_name)
    errors.push("vars の D1_DATABASE_NAME が [[d1_databases]] の database_name と一致しません");

  /* 秘密値を設定ファイルへ書いていないか */
  for (const k of ["CF_PAGES_API_TOKEN", "RESEND_API_KEY", "TURNSTILE_SECRET_KEY",
                   "OTP_PEPPER", "REGISTRATION_SESSION_SECRET", "WEB_PUSH_VAPID_PRIVATE_KEY",
                   "CF_AI_LIST_TOKEN", "OPENAI_API_KEY"]) {
    if (t[k]) errors.push(`${k} が設定ファイルに書かれています。秘密値は wrangler secret put で登録してください`);
  }

  /* cron を持たない */
  if (t.__sections.some((s) => s.startsWith("[triggers]")))
    errors.push("[triggers]（cron）があります。開発版では定期処理を動かしません");
  if (t.crons) errors.push("crons があります。開発版では定期処理を動かしません");

  /* 本番 URL を指していないか */
  if (t.APP_BASE_URL === PRODUCTION.baseUrl)
    errors.push("APP_BASE_URL が本番 URL です");

  return errors;
}

/* 本番設定に秘密値が混ざっていないかも見る（こちらは name/D1 は本番のままで正しい） */
export function checkProdConfig(text) {
  const t = readToml(text);
  const errors = [];
  for (const k of ["CF_PAGES_API_TOKEN", "RESEND_API_KEY", "TURNSTILE_SECRET_KEY",
                   "OTP_PEPPER", "REGISTRATION_SESSION_SECRET", "WEB_PUSH_VAPID_PRIVATE_KEY",
                   "CF_AI_LIST_TOKEN", "OPENAI_API_KEY"]) {
    if (t[k]) errors.push(`${k} が wrangler.toml に平文で書かれています（wrangler secret put へ移してください）`);
  }
  if (/cfut_[A-Za-z0-9]{10,}/.test(String(text || "")))
    errors.push("Cloudflare API Token らしき文字列が含まれています");
  /* 確認コードをレスポンスへ返す開発専用モード。本番に入ると乗っ取り可能になる。 */
  if (t.REG_DEV_ECHO_CODE)
    errors.push("REG_DEV_ECHO_CODE が本番設定に入っています（確認コードが応答へ出てしまいます）");
  return errors;
}

/* ── 直接実行されたときだけ検査を走らせる ── */
const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  /* --allow-placeholder: D1 を作る前の事前確認だけで使う。deploy 前は付けない。 */
  const allowPlaceholder = process.argv.includes("--allow-placeholder");
  const i = process.argv.indexOf("--config");
  const devPath = i >= 0 && process.argv[i + 1]
    ? path.resolve(process.argv[i + 1])
    : path.join(SERVER, "wrangler.dev.toml");
  const prodPath = path.join(SERVER, "wrangler.toml");

  let bad = 0;
  if (fs.existsSync(prodPath)) {
    const e = checkProdConfig(fs.readFileSync(prodPath, "utf8"));
    console.log(`\n── 本番設定 ${path.relative(SERVER, prodPath)} ──`);
    if (!e.length) console.log("  ✓ 秘密値は含まれていません");
    else { e.forEach((m) => console.log("  ✗ " + m)); bad += e.length; }
  }

  console.log(`\n── 開発版設定 ${path.relative(SERVER, devPath)} ──`);
  if (!fs.existsSync(devPath)) {
    console.log("  ✗ ファイルがありません");
    bad++;
  } else {
    const e = checkDevConfig(fs.readFileSync(devPath, "utf8"), { allowPlaceholder });
    if (!e.length) console.log("  ✓ 本番へ触れない設定になっています"
      + (allowPlaceholder ? "（D1 の ID は未確定・deploy 前に再確認します）" : ""));
    else { e.forEach((m) => console.log("  ✗ " + m)); bad += e.length; }
  }

  console.log("");
  if (bad) {
    console.log(`✗ ${bad} 件の問題があります。deploy しないでください。`);
    process.exit(1);
  }
  console.log("✓ 検査を通過しました。deploy して問題ありません。");
}
