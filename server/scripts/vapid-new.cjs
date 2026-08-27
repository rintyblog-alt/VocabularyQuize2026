/* ══════════════════════════════════════════════════════════════════════════
   vapid-new.cjs — 通知の鍵（VAPID）を作り直す

   通知の鍵は **2 つで 1 組**:
     ・公開鍵  … wrangler.toml に平文で書く（人に見せてよい）
     ・秘密鍵  … wrangler secret に入れる（誰にも見せない）
   組がずれると、通知は **エラーも出さずに 1 通も届かなくなる**。

   このスクリプトは 1 回の実行で 1 組だけ作り、
     ・公開鍵は 画面に出す
     ・秘密鍵は 画面に出さず、そのまま wrangler へ流し込む
   ので、秘密鍵が 画面にも 履歴にも 残らない。

   使い方（server/ の中で）:
     node scripts/vapid-new.cjs --config wrangler.toml       ← 本番へ入れる
     node scripts/vapid-new.cjs --dry                        ← 作れるかだけ試す（入れない）

   実行後、画面に出た公開鍵を wrangler.toml の
     WEB_PUSH_VAPID_PUBLIC_KEY = "..."
   へ貼り替えること。**貼り替えないと通知は動かない。**
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";

const { generateKeyPairSync, webcrypto } = require("node:crypto");
const { spawn } = require("node:child_process");

const argv = process.argv.slice(2);
const dry = argv.includes("--dry");
const ci = argv.indexOf("--config");
const config = ci >= 0 ? argv[ci + 1] : "";

if (!dry && !config) {
  console.error("使い方: node scripts/vapid-new.cjs --config wrangler.toml");
  console.error("        node scripts/vapid-new.cjs --dry");
  process.exit(2);
}
/* 本番以外へ間違って入れないための念押しはしない（dev で試すのも正しい使い方）。
   ただし config は必ず明示させる（既定で本番へ入るのを防ぐ）。 */

/* ── 鍵を作る（P-256）───────────────────────────────────────────── */
const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const jwk = privateKey.export({ format: "jwk" });
const raw = (s) => Buffer.from(String(s), "base64url");

const pubBytes = Buffer.concat([Buffer.from([4]), raw(jwk.x), raw(jwk.y)]);
const privBytes = raw(jwk.d);
const pub = pubBytes.toString("base64url");
const priv = privBytes.toString("base64url");

/* ── 本体（worker.js）と同じ検査を ここでも通す ────────────────────
   65 バイト・先頭 0x04・秘密 32 バイト。ここで落ちるものを入れない。 */
function 検査() {
  if (pubBytes.length !== 65) return "公開鍵が " + pubBytes.length + " バイト（65 でない）";
  if (pubBytes[0] !== 4) return "公開鍵の先頭が 0x04 でない";
  if (privBytes.length !== 32) return "秘密鍵が " + privBytes.length + " バイト（32 でない）";
  return "";
}

(async () => {
  const ng = 検査();
  if (ng) { console.error("作れませんでした: " + ng); process.exit(1); }

  /* 本体と同じ手順で 実際に署名鍵として読み込めるかまで試す。
     「形は合っているのに使えない」を ここで潰す。 */
  try {
    await webcrypto.subtle.importKey(
      "jwk",
      { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y, d: jwk.d, ext: true },
      { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]
    );
  } catch (e) {
    console.error("署名鍵として読み込めませんでした: " + String(e && e.message));
    process.exit(1);
  }

  console.log("");
  console.log("  ✅ 通知の鍵を 1 組 作りました（形も 署名も 確認済み）");
  console.log("");
  console.log("  ── 公開鍵（wrangler.toml に貼る／人に見せてよい）──");
  console.log("");
  console.log("  " + pub);
  console.log("");

  if (dry) {
    console.log("  --dry なので 秘密鍵は どこにも入れていません。");
    console.log("  この公開鍵も 捨ててください（本番へ入れるときは もう一度 実行）。");
    console.log("");
    return;
  }

  /* ── 秘密鍵は 画面に出さず、そのまま wrangler の口へ流す ── */
  const p = spawn("npx", ["wrangler", "secret", "put", "WEB_PUSH_VAPID_PRIVATE_KEY", "--config", config], {
    stdio: ["pipe", "inherit", "inherit"]
  });
  p.stdin.write(priv);
  p.stdin.end();
  p.on("close", (code) => {
    console.log("");
    if (code === 0) {
      console.log("  ✅ 秘密鍵を入れました（画面には 一度も出していません）");
      console.log("");
      console.log("  ★ 残り 1 手: " + (config || "wrangler.toml") + " の");
      console.log("      WEB_PUSH_VAPID_PUBLIC_KEY = \"...\"");
      console.log("    を 上の公開鍵に 貼り替えてください。");
      console.log("    貼り替えないと 通知は 1 通も 届きません。");
    } else {
      console.log("  ✗ 秘密鍵を入れられませんでした（終了コード " + code + "）");
      console.log("    公開鍵も 使わないでください。もう一度 実行して 1 組 作り直します。");
    }
    console.log("");
    process.exit(code === 0 ? 0 : 1);
  });
})();
