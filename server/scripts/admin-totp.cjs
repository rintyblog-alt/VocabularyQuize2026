/* ══════════════════════════════════════════════════════════════════════
   ローカル検証用: 管理画面の 6 桁コードを出す（2026-08-18）

   ★ 何のためのもの
     管理画面（/admin）の二要素認証は、認証アプリに鍵を登録して
     6 桁を入れる作り。**ローカルで動きを確かめるたびにスマホを出すのは
     手間**なので、ローカルの D1 から鍵を読んで、いまの 6 桁を出す。

   ★ 使ってよい場所
     ローカルの miniflare の D1 **だけ**。本番はもちろん、検証用 Worker
     （-dev）の D1 も読まない（そもそもファイルとして手元に無い）。
     鍵そのものは出さない。出すのは 30 秒で消える 6 桁だけ。

   使い方:
     node server/scripts/admin-totp.cjs            # echo モード
     node server/scripts/admin-totp.cjs real       # real モード
   ══════════════════════════════════════════════════════════════════════ */
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const MODE = process.argv[2] === "real" ? "real" : "echo";
const 置き場 = path.join(__dirname, "..", ".local-run", MODE,
  ".wrangler", "state", "v3", "d1", "miniflare-D1DatabaseObject");

if (!fs.existsSync(置き場)) {
  console.error("✗ ローカルの D1 がありません: " + 置き場);
  console.error("  先に  cd server && ./dev-local.sh " + MODE + " 8791  を動かしてください。");
  process.exit(2);
}
const db = fs.readdirSync(置き場).filter((f) => f.endsWith(".sqlite"))
  .map((f) => path.join(置き場, f))[0];
if (!db) { console.error("✗ .sqlite が見つかりません"); process.exit(2); }

let rows = "";
try {
  /* ★ sqlite3 の中の "\t" は **タブにならない**（2026-08-18・実測）。
     そのまま 2 文字として出て、切れずに 1 本の文字列になり、
     **鍵をそのまま画面へ出してしまった**。char(9) で本物のタブを入れる。 */
  rows = execFileSync("sqlite3", [db,
    "SELECT email || char(9) || role || char(9) || totp_secret || char(9) || totp_enabled"
    + " FROM admins WHERE totp_secret <> ''"
  ], { encoding: "utf8" }).trim();
} catch (e) {
  console.error("✗ sqlite3 が使えません: " + String(e.message).slice(0, 120));
  process.exit(2);
}
if (!rows) {
  /* ★ 「エラーだ」と言われた（2026-08-18）。**失敗ではなく順番の話**なのに、
     ✗ から始まる 2 行では そう読めなかった。何をすればいいかを順に書く。 */
  console.log("まだ鍵がありません。鍵は **ログインした瞬間に作られます。**");
  console.log("");
  console.log("  1) ブラウザで  http://127.0.0.1:8791/admin  を開く");
  console.log("  2) メールアドレスとパスワードでログインする");
  console.log("  3) 二要素認証の画面に変わり、鍵が表示される");
  console.log("  4) その画面を開いたまま、もう一度このコマンドを動かす");
  console.log("  5) 出た 6 桁を画面に入れる");
  console.log("");
  console.log("※ パスワードを決めていないときは、ログイン画面の下にある");
  console.log("   「はじめての owner を設定する」から先に決めてください。");
  process.exit(0);
}

function base32Decode(s) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, value = 0; const out = [];
  for (const c of String(s).toUpperCase().replace(/[^A-Z2-7]/g, "")) {
    value = (value << 5) | A.indexOf(c); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}
function totp(secret, step) {
  const b = Buffer.alloc(8);
  b.writeUInt32BE(Math.floor(step / 0x100000000), 0);
  b.writeUInt32BE(step >>> 0, 4);
  const m = crypto.createHmac("sha1", base32Decode(secret)).update(b).digest();
  const o = m[m.length - 1] & 0x0f;
  const n = ((m[o] & 0x7f) << 24) | (m[o + 1] << 16) | (m[o + 2] << 8) | m[o + 3];
  return String(n % 1000000).padStart(6, "0");
}

const step = Math.floor(Date.now() / 1000 / 30);
const 残り = 30 - Math.floor(Date.now() / 1000) % 30;
console.log("（" + MODE + " モードのローカル D1）");
rows.split("\n").forEach((line) => {
  const [email, role, secret, enabled] = line.split("\t");
  /* 安全弁: 分け方を間違えたら **出さずに止める**（鍵を漏らさない） */
  if (!secret || !/^[A-Z2-7]{16,}$/.test(secret)) {
    console.error("✗ 読み方が違います。鍵を出さないためここで止めます。");
    process.exit(3);
  }
  console.log("");
  console.log("  " + email + "（" + role + "・"
    + (Number(enabled) ? "登録済み" : "まだ登録していない") + "）");
  console.log("  いまのコード: " + totp(secret, step) + "   （あと " + 残り + " 秒）");
  if (残り <= 5) console.log("  次のコード  : " + totp(secret, step + 1));
});
console.log("");
console.log("※ 鍵そのものは出しません。出しているのは 30 秒で消える 6 桁だけです。");
