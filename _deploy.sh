#!/bin/zsh
# 出して、**本番が 同じ バイトを 返すまで 確かめる**。
# ★ 出した 直後は まだ 古い ものを 返す ことが ある（実測 10:50、1 回目 404）。
#   1 回 だけ 見て「違う」と 判断しない。
set -e
cd "$(dirname "$0")"
node vqrehash.cjs > /dev/null
( cd server && npx wrangler deploy 2>&1 | tail -2 )
H=$(grep -o 'vq-survive\.[a-f0-9]*\.js' client/index.html | head -1)
LOCAL=$(shasum -a256 "client/js/$H" | awk '{print $1}')
for i in 1 2 3 4 5 6; do
  sleep 8
  CODE=$(curl -s -o /tmp/_vqprod.js -w "%{http_code}" "https://www.vocabuquiz.app/js/$H")
  REMOTE=$(shasum -a256 /tmp/_vqprod.js | awk '{print $1}')
  if [ "$CODE" = "200" ] && [ "$LOCAL" = "$REMOTE" ]; then
    echo "OK  $H  $(date +%H:%M)  （バイト一致）"
    exit 0
  fi
  echo "  まだ: http=$CODE ($i/6)"
done
echo "NG  $H  本番が 同じ バイトを 返しません"
exit 1
