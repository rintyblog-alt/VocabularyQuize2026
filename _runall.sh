#!/bin/zsh
export VQ_BASE=http://127.0.0.1:8791
export VQ_API=http://127.0.0.1:8791
OUT=/private/tmp/claude-501/-Users-user-Downloads-word-practice-v26-menu-terms-report-emailjs/924447ce-dcff-4fe8-a177-a097280139fa/scratchpad/testlog
mkdir -p $OUT
: > $OUT/summary.txt
for t in "$@"; do
  echo "=== $t ===" >> $OUT/summary.txt
  node $t.cjs > $OUT/$t.log 2>&1
  code=$?
  tail -6 $OUT/$t.log | sed 's/^/   /' >> $OUT/summary.txt
  echo "   exit=$code" >> $OUT/summary.txt
done
echo "--- 終わり ---" >> $OUT/summary.txt
