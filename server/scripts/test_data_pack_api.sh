#!/usr/bin/env bash
set -euo pipefail

BASE="${1:-http://127.0.0.1:8787}"

printf '\n[1] lookup standard_all No.223\n'
curl -sS "${BASE}/api/lookup/preset?set=standard_all&no=223" | tee /tmp/vq_lookup_223.json

printf '\n[2] answer vocab_lookup (standard_all 223)\n'
curl -sS -X POST "${BASE}/api/answer" \
  -H 'content-type: application/json' \
  -d '{"question":"standard_all の 223 は何？"}' | tee /tmp/vq_answer_223.json

grep -qi 'demand' /tmp/vq_answer_223.json

printf '\n[3] answer non-insight should NOT include render_hints.graph\n'
curl -sS -X POST "${BASE}/api/answer" \
  -H 'content-type: application/json' \
  -d '{"question":"サイト内の共有の説明はどこ？"}' | tee /tmp/vq_answer_site.json

if grep -q '"render_hints"' /tmp/vq_answer_site.json; then
  echo "NG: render_hints returned for non-insight intent"
  exit 1
fi

printf '\n[4] answer insight MAY include render_hints.graph\n'
curl -sS -X POST "${BASE}/api/answer" \
  -H 'content-type: application/json' \
  -d '{"question":"インサイトの推移を見せて"}' | tee /tmp/vq_answer_insight.json

echo "OK: required checks passed"
