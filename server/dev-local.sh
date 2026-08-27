#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
#  VocabuQuiz ローカル検証ランチャー（本番 www.vocabuquiz.app には一切触れない）
#
#  使い方:
#     ./dev-local.sh            # real モード（既定）: 本物のTurnstile＋本物のメール送信
#     ./dev-local.sh echo       # echo モード: メール送信せず、確認コードを"この端末"に表示
#     ./dev-local.sh real 9000  # ポート変更（既定 8788）
#
#  ・D1 は miniflare のローカルSQLite（本番D1に非接触）。データは各モードで隔離保存。
#  ・real  = server/.dev.vars の本物のシークレット（RESEND/TURNSTILE）を使用。
#            → ブラウザで Turnstile ウィジェットが出る（localhostでも動作）。コードは実際のGmail受信箱へ。
#  ・echo  = メール送信オフ＋Turnstile検証オフ。コードは端末ログに `code=NNNNNN` として出る。
#            → ブラウザは  http://127.0.0.1:PORT/?vqdev=1  で開くと Bot対策ウィジェットも省略され最速。
#  ・停止は Ctrl-C。 8/10 の本番公開までは `wrangler deploy` を実行しないこと。
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

MODE="${1:-real}"
# 既定 8791: アプリ本体がローカル配信時に API を http://<host>:8791 へ向ける実装のため、
# ここを合わせると 本体ログイン/自分情報 も 新登録/コード も 同一オリジンの同じローカルWorkerに届く。
PORT="${2:-${PORT:-8791}}"
HERE="$(cd "$(dirname "$0")" && pwd)"          # = server/
TEMPLATE="$HERE/wrangler.local.toml"
RUNDIR="$HERE/.local-run/$MODE"

if [[ "$MODE" != "real" && "$MODE" != "echo" ]]; then
  echo "✗ 不明なモード: '$MODE'（real か echo を指定）"; exit 1
fi
[[ -f "$TEMPLATE" ]] || { echo "✗ $TEMPLATE がありません"; exit 1; }

# wrangler バイナリ解決（グローバル優先）
WRANGLER="/Users/user/.npm-global/bin/wrangler"
if [[ ! -x "$WRANGLER" ]]; then
  if command -v wrangler >/dev/null 2>&1; then WRANGLER="$(command -v wrangler)"; else WRANGLER="npx wrangler"; fi
fi

# ポート使用中チェック
if lsof -ti "tcp:$PORT" >/dev/null 2>&1; then
  echo "✗ ポート $PORT は使用中です。別ポート: ./dev-local.sh $MODE 9001"; exit 1
fi

mkdir -p "$RUNDIR"
cp "$TEMPLATE" "$RUNDIR/wrangler.toml"          # config を run ディレクトリへ（.dev.vars を隣に置く）

umask 077
if [[ "$MODE" == "real" ]]; then
  SRC_VARS="$HERE/.dev.vars"
  [[ -f "$SRC_VARS" ]] || { echo "✗ $SRC_VARS がありません（RESEND の実シークレットが必要）"; exit 1; }
  # RESEND は使う（=本物のメール送信）。ローカルは Bot チェックの手間を無くすため TURNSTILE_SECRET_KEY は外す
  # （＝サーバ側 Turnstile 検証スキップ。?vqdev=1 でクライアント側ウィジェットも省略）。本番は Turnstile 有効のまま。
  grep -v '^TURNSTILE_SECRET_KEY=' "$SRC_VARS" > "$RUNDIR/.dev.vars"
  chmod 600 "$RUNDIR/.dev.vars"
  OPEN_URL="http://127.0.0.1:$PORT/?vqdev=1"
  CODE_HINT="確認コードは 実際の Gmail 受信箱 に届きます（Bot チェックなし）"
else
  # echo モード: 本番シークレットを使わずローカル生成。既存があれば維持（pepper変更で既存コード失効を避ける）
  if [[ ! -f "$RUNDIR/.dev.vars" ]]; then
    {
      echo "OTP_PEPPER=$(openssl rand -base64 36)"
      echo "REGISTRATION_SESSION_SECRET=$(openssl rand -base64 48)"
      echo "REG_DEV_ECHO_CODE=1"
      # RESEND_API_KEY / TURNSTILE_SECRET_KEY はあえて未設定（=メール送信オフ / Turnstile検証スキップ）
    } > "$RUNDIR/.dev.vars"
    chmod 600 "$RUNDIR/.dev.vars"
  fi
  OPEN_URL="http://127.0.0.1:$PORT/?vqdev=1"
  CODE_HINT="確認コードは この端末のログに  [reg][DEV] ... code=NNNNNN  として出ます"
fi

cat <<BANNER

┌──────────────────────────────────────────────────────────────────┐
│  VocabuQuiz LOCAL  (mode: $MODE / port: $PORT)
│  本番 www.vocabuquiz.app には触れていません（ローカルD1・別環境）
├──────────────────────────────────────────────────────────────────┤
│  ブラウザで開く →  $OPEN_URL
│  $CODE_HINT
│  停止: Ctrl-C
└──────────────────────────────────────────────────────────────────┘

BANNER

cd "$RUNDIR"

# ── LAN 公開（スマホ実機で試すとき）──────────────────────────────
#   ./dev-local.sh echo 8791 lan   のように 3 番目の引数へ lan を付けると
#   0.0.0.0 で待ち受け、同じ Wi-Fi のスマホから http://<MacのIP>:PORT で開ける。
#   ・既定は従来どおり 127.0.0.1（この Mac の中だけ）。
#   ・LAN 公開でも **インターネットへは出さない**（ルータの内側だけ）。
#   ・Bridge 側も同じ Wi-Fi から使うので VQ_BRIDGE_OPEN=1 で起動しておくこと。
BIND_IP="127.0.0.1"
PROTO_ARGS=()
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "")"

#   lan  … 平文 HTTP で LAN 公開（ログインとローカル AI は使えるが、
#           **通知とマイクは使えない**。ブラウザが「安全な文脈」でないと
#           Notification / ServiceWorker / getUserMedia を禁じるため）
#   lans … HTTPS で LAN 公開（自己署名。通知・マイク・Service Worker まで使える）
if [[ "${3:-}" == "lan" || "${3:-}" == "lans" ]]; then
  BIND_IP="0.0.0.0"
  SCHEME="http"
  if [[ "${3:-}" == "lans" ]]; then
    CERT_DIR="$HERE/.lan-cert"
    if [[ ! -f "$CERT_DIR/cert.pem" || ! -f "$CERT_DIR/key.pem" ]]; then
      echo "  証明書がありません。作ります: $CERT_DIR"
      mkdir -p "$CERT_DIR"
      cat > "$CERT_DIR/san.cnf" <<EOF
[req]
distinguished_name = dn
x509_extensions = v3
prompt = no
[dn]
CN = VocabuQuiz LAN Dev
[v3]
subjectAltName = @alt
basicConstraints = critical,CA:TRUE
keyUsage = critical,digitalSignature,keyCertSign
extendedKeyUsage = serverAuth
[alt]
IP.1 = ${LAN_IP:-127.0.0.1}
IP.2 = 127.0.0.1
DNS.1 = localhost
EOF
      openssl req -x509 -newkey rsa:2048 -nodes \
        -keyout "$CERT_DIR/key.pem" -out "$CERT_DIR/cert.pem" \
        -days 825 -config "$CERT_DIR/san.cnf" >/dev/null 2>&1
    fi
    SCHEME="https"
    PROTO_ARGS=(--local-protocol https
                --https-cert-path "$CERT_DIR/cert.pem"
                --https-key-path  "$CERT_DIR/key.pem")
  fi
  echo ""
  echo "  ── LAN 公開モード（$SCHEME）──"
  [[ -n "$LAN_IP" ]] && echo "  スマホから:  $SCHEME://$LAN_IP:$PORT" || echo "  スマホから:  $SCHEME://<この Mac の IP>:$PORT"
  echo "  ・同じ Wi-Fi の端末だけが対象です（インターネットには出ません）"
  if [[ "$SCHEME" == "https" ]]; then
    echo "  ・自己署名なので初回は警告が出ます。スマホで「詳細 → このまま進む」を選ぶこと。"
    echo "    iPhone は 設定 > 一般 > VPN とデバイス管理 で証明書を信頼すると警告が消えます。"
    echo "  ・ローカル AI も HTTPS で受ける必要があります（平文 http は混在扱いで遮断される）:"
    echo "      cd local-ai && VQ_BRIDGE_OPEN=1 VQ_BRIDGE_TLS_DIR=$HERE/.lan-cert node src/server.mjs"
  else
    echo "  ・**通知とマイクは使えません**（安全な文脈ではないため）。使うなら 3 番目を lans に。"
    echo "  ・ローカル AI も使うなら別ターミナルで:"
    echo "      cd local-ai && VQ_BRIDGE_OPEN=1 node src/server.mjs"
  fi
  echo ""
fi

# macOS 既定の bash 3.2 は、空の配列を "${ARR[@]}" で展開すると set -u に引っかかる。
# ${ARR[@]+...} を挟むと、空のときは何も渡さずに済む（LAN 公開のときは今までどおり）。
exec env CI=1 WRANGLER_SEND_METRICS=false $WRANGLER dev --port "$PORT" --ip "$BIND_IP" ${PROTO_ARGS[@]+"${PROTO_ARGS[@]}"}
