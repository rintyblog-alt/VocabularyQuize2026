#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
#  開発版 Worker をデプロイする（本番 www.vocabuquiz.app には一切触れない）
#
#  使い方:
#     cd server && ./scripts/deploy-dev.sh
#
#  この script は次を必ず守る:
#   ・wrangler へ渡す --config は wrangler.dev.toml に固定（本番 toml を使わない）
#   ・name が "-dev" で終わらなければ即中止
#   ・check-dev-config.mjs を通らなければ即中止
#   ・D1 が未作成なら作り、schema を当てる（本番 D1 には触らない）
#   ・本番 Worker 名 vocabuquiz-api が出てきたら即中止
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"     # = server/scripts
SERVER="$(cd "$HERE/.." && pwd)"          # = server
CONFIG="$SERVER/wrangler.dev.toml"
DEV_DB="vocabuquiz_auth_dev"
PROD_WORKER="vocabuquiz-api"
PROD_DB_ID="fe6346ac-dc7d-4a69-90a6-1919456716b2"

WRANGLER="/Users/user/.npm-global/bin/wrangler"
if [[ ! -x "$WRANGLER" ]]; then
  if command -v wrangler >/dev/null 2>&1; then WRANGLER="$(command -v wrangler)"; else WRANGLER="npx wrangler"; fi
fi

say()  { printf "\n\033[1m%s\033[0m\n" "$*"; }
fail() { printf "\n\033[31m✗ %s\033[0m\n" "$*"; exit 1; }

[[ -f "$CONFIG" ]] || fail "$CONFIG がありません"

# ── 0) 本番へ向いていないことを、まず設定ファイルで確かめる ──────────────
#   D1 を作る前は、まだ database_id が決まらない。ここでは
#   「本番へ触れないか」だけを見て、ID の確定は deploy 直前に確かめる。
say "0) 設定の安全確認（本番へ触れないか）"
node "$HERE/check-dev-config.mjs" --config "$CONFIG" --allow-placeholder || \
  fail "設定が安全ではありません。修正してから、もう一度実行してください。"

NAME="$(grep -m1 '^name *=' "$CONFIG" | sed 's/.*= *"\(.*\)"/\1/')"
[[ "$NAME" == *-dev ]] || fail "name が '-dev' で終わっていません: $NAME"
[[ "$NAME" != "$PROD_WORKER" ]] || fail "name が本番と同じです"
grep -q "$PROD_DB_ID" "$CONFIG" && fail "本番 D1 の database_id が含まれています"
echo "  対象 Worker: $NAME"

# ── 1) ログイン確認 ────────────────────────────────────────────────
say "1) Cloudflare の認証確認"
if ! $WRANGLER whoami >/dev/null 2>&1; then
  fail "Cloudflare にログインしていません。先に  wrangler login  を実行してください。"
fi
$WRANGLER whoami 2>/dev/null | grep -i "account" | head -3 || true

# ── 2) 開発版 D1 ──────────────────────────────────────────────────
say "2) 開発版 D1 の確認"
if $WRANGLER d1 info "$DEV_DB" >/dev/null 2>&1; then
  echo "  $DEV_DB は作成済み"
else
  echo "  $DEV_DB を作成します（本番 D1 には触れません）"
  $WRANGLER d1 create "$DEV_DB"
  echo ""
  echo "  ▲ 表示された database_id を $CONFIG の"
  echo "     [[d1_databases]] の database_id と、[vars] の D1_DATABASE_ID の"
  echo "     **両方**へ貼り付けてから、もう一度この script を実行してください。"
  exit 0
fi

#   ここまで来たら database_id は確定しているはず。deploy 前に **もう一度**、
#   今度はプレースホルダも許さずに確かめる。
say "3) デプロイ前の最終確認（ID 確定・本番 D1 でないこと）"
node "$HERE/check-dev-config.mjs" --config "$CONFIG" || \
  fail "database_id が未確定か、本番を指しています。deploy を中止しました。"

say "3.5) 開発版 D1 へ schema を適用"
$WRANGLER d1 execute "$DEV_DB" --file="$SERVER/schema.sql" --remote --yes

# ── 4) デプロイ ───────────────────────────────────────────────────
say "4) 開発版 Worker をデプロイ"
$WRANGLER deploy --config "$CONFIG"

say "完了"
echo "  開発版 URL: https://${NAME}.<あなたの workers.dev サブドメイン>.workers.dev"
echo "  本番 https://www.vocabuquiz.app は変更していません。"
