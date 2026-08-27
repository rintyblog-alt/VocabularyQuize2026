VocabuQuiz Server (Cloudflare Workers + D1)
===========================================

Install
-------
1) Install Wrangler
- npm i -g wrangler

2) Create D1 database
- wrangler d1 create vocabuquiz_auth
- Copy the generated database_id into server/wrangler.toml

3) Apply schema (local)
- wrangler d1 execute vocabuquiz_auth --local --file=./schema.sql

4) Apply schema (remote)
- wrangler d1 execute vocabuquiz_auth --remote --file=./schema.sql

Run local dev
-------------
- cd server
- wrangler dev

Local checks
------------
- curl -i http://localhost:8787/
- curl -i http://localhost:8787/s/ABC123
- curl -s -X POST http://localhost:8787/api/share/create -H 'content-type: application/json' -d '{"schemaVersion":1,"appVersion":"v26","preset":{"name":"t","modes":{},"words":[{"id":1,"word":"a","meaning":"b"}]}}'
- curl -s 'http://localhost:8787/api/share/get?code=XXXXXX&appVersion=v26'

Deploy
------
- wrangler deploy

workers.dev subdomain prerequisite
----------------------------------
- Cloudflare Dashboard → Workers & Pages → workers.dev
- Register a workers.dev subdomain once for your account
- If this is not registered, deploy is blocked
- After registration, run `wrangler deploy` again

Routes
------
- OPTIONS * -> 204 + CORS
- POST /api/auth/register -> JSON
- POST /api/auth/login -> JSON
- GET /api/auth/me -> JSON
- POST /api/auth/delete -> JSON
- GET /api/chat/history -> JSON (認証ユーザーのチャット履歴取得)
- POST /api/chat/history -> JSON (認証ユーザーのチャット履歴保存)
- DELETE /api/chat/history -> JSON (認証ユーザーのチャット履歴削除)
- POST /api/share/create -> JSON
- GET /api/share/get -> JSON
- POST /api/ai/chat -> JSON (VQ AI ONE MAX / Meta Llama / site-context-first)
- POST /api/ai/ingest -> JSON (admin key required)
- POST /api/support/submit -> JSON (問い合わせ/通報の保存 + AIトリアージ)
- GET /api/lookup/preset?set=...&no=... -> JSON (厳密参照)
- GET /api/search?q=...&type=facts|chunks|insights|procedures&limit=10 -> JSON
- POST /api/answer -> JSON (intent判定 + data_pack根拠)
- POST /api/admin/upload_pack -> JSON (token required)
- POST /api/admin/refresh_pack -> JSON (token required, PACK_SOURCE_URLから再生成)
- POST /api/admin/rebuild_pack -> JSON (token required, D1 chunks/chunks_fts再構築)
- GET /api/debug/pack_stats -> JSON (chunk/fact件数・更新情報)
- GET/POST /api/debug/search_trace -> JSON (検索スコア内訳)
- GET /api/admin/support/submissions -> JSON (admin: 保存済み問い合わせ/通報の確認)
- POST /api/vocab/ask -> JSON
- POST /api/insight/summarize -> JSON
- POST /api/insight/log -> JSON (D1 insight_events保存)
- GET /api/insight/stats?range=7d -> JSON (D1 SQL集計)
- POST /api/insight/analyze -> JSON (stats根拠で提案)
- GET /s/:CODE -> HTML share page
- GET / -> static app (ASSETS) or text "OK"
- Others -> 404 JSON

data_pack setup (KV)
--------------------
1) KV namespace作成
- wrangler kv namespace create SEARCH_KV
- wrangler kv namespace create SEARCH_KV --preview

2) `wrangler.toml` に反映（例）
```toml
[[kv_namespaces]]
binding = "SEARCH_KV"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
preview_id = "yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy"
```

3) data_pack生成
- `node ./scripts/build_data_pack.js --docs ../client/docs.json --vocab ../client/vocab.json --insights ../client/insights.json --out /tmp/data_pack.json --source-id release-20260220`
- サイトURLから直接生成（SPA文字列抽出）
  - `node ./scripts/generate_site_pack.js --url https://rintyblog-alt.github.io/VocabularyQuize2026/ --out /tmp/site_pack.json --source-id site-crawl-manual`

4) KVへ投入（例）
- `wrangler kv key put --binding SEARCH_KV data_pack.json --path /tmp/data_pack.json`

5) 管理APIで更新（トークン必須）
- `curl -s -X POST https://<your-worker>/api/admin/upload_pack -H 'content-type: application/json' -H 'x-admin-token: <DATA_PACK_ADMIN_TOKEN>' --data-binary @/tmp/data_pack.json`

Scheduled refresh (optional)
----------------------------
- `DATA_PACK_SCHEDULE_ENABLED=1` のときのみ cron で legacy docs/vocab/insights から再構築します。
- 既定では `PACK_SOURCE_URL` (例: GitHub Pages) を再取得し、差分(ETag/Last-Modified/hash)がある場合のみ data_pack を更新します。
- URL取得に失敗した場合のみ legacy docs/vocab/insights 再構築へフォールバックします。
- `wrangler.toml` 例:
```toml
[triggers]
crons = ["*/30 * * * *"]
```

RAG / pack API quick test
-------------------------
- D1 pack 再構築（管理者）
  - `curl -s -X POST https://<your-worker>/api/admin/rebuild_pack -H 'content-type: application/json' -H 'x-admin-token: <DATA_PACK_ADMIN_TOKEN>' -d '{"force":true}'`
- 検索
  - `curl -sG https://<your-worker>/api/search --data-urlencode 'q=共有コード' --data-urlencode 'type=chunks' --data-urlencode 'limit=10'`
- 回答
  - `curl -s -X POST https://<your-worker>/api/answer -H 'content-type: application/json' -d '{"question":"standard_all の 223 は？"}'`
- search trace
  - `curl -sG https://<your-worker>/api/debug/search_trace --data-urlencode 'q=No.223 demand' --data-urlencode 'type=facts'`
- answer trace
  - `curl -s -X POST https://<your-worker>/api/debug/answer_trace -H 'content-type: application/json' -d '{"question":"最近のインサイト推移を知りたい"}'`
- pack stats
  - `curl -s https://<your-worker>/api/debug/pack_stats`
- insight log
  - `curl -s -X POST https://<your-worker>/api/insight/log -H 'content-type: application/json' -d '{"kind":"chat","payload":{"text":"sample"}}'`
- insight stats
  - `curl -sG https://<your-worker>/api/insight/stats --data-urlencode 'range=7d'`
- insight analyze
  - `curl -s -X POST https://<your-worker>/api/insight/analyze -H 'content-type: application/json' -d '{"question":"最近の傾向を教えて","range":"7d"}'`

Workers AI setup
----------------
- `wrangler.toml`:
  - `[ai]`
  - `binding = "AI"`
- Required secrets/vars:
  - `FIREBASE_PROJECT_ID`
  - `FIREBASE_CLIENT_EMAIL`
  - `FIREBASE_PRIVATE_KEY`
  - `ADMIN_KEY`
  - `OPENAI_API_KEY` (secret, optional: gpt-5-mini/gpt-5.2利用時)
  - `MODEL_NORMAL` (var, default: gpt-5-mini)
  - `MODEL_REASON` (var, default: gpt-5.2)
  - `CHAT_PROVIDER` (var, default: workers_ai)
  - `CHAT_MODEL_PRIMARY` (var, default: @cf/meta/llama-4-scout-17b-16e-instruct)
  - `CHAT_MODEL_REASONING` (var, default: @cf/meta/llama-4-scout-17b-16e-instruct)
  - `CHAT_MAX_TOKENS_NORMAL` (var, default: 640)
  - `CHAT_MAX_TOKENS_REASONING` (var, default: 1200)
  - `CHAT_API_BASE` / `CHAT_API_KEY` (optional: Meta系 openai-compatible endpoint を使う場合)
  - `AI_MODEL_NORMAL` (var, Workers AI fallback)
  - `AI_MODEL_REASONING` (var, Workers AI fallback)
  - `SUPPORT_AI_MODEL` (var, default: @cf/meta/llama-4-scout-17b-16e-instruct)
- Deploy after schema migration:
  - `wrangler d1 execute vocabuquiz_auth --remote --file=./schema.sql`

AI endpoint quick test
----------------------
- `/api/ai/chat` は認証が必要です（`Authorization: Bearer <token>`）。
- 先に `/api/auth/register` or `/api/auth/login` で token を取得してから実行してください。
- 例:
  - `curl -s -X POST http://localhost:8787/api/ai/chat -H 'content-type: application/json' -H 'authorization: Bearer <token>' -d '{"mode":"normal","text":"英単語の復習方法を教えて","messages":[{"role":"user","content":"英単語の復習方法を教えて"}]}'`
  - `curl -s -X POST http://localhost:8787/api/ai/chat -H 'content-type: application/json' -H 'authorization: Bearer <token>' -d '{"mode":"reason","messages":[{"role":"user","content":"苦手分析して次の一手を出して"}]}'`

Firestore collections used by AI
--------------------------------
- `rag_docs/{chunkId}`:
  - `id, chunkId, title, tags[], text, updatedAt, createdAt`
- `userMemory/{uid}`:
  - `daily:{dateKey,normalCount,reasoningCount}`
  - `memory:{shortTerm,longTerm,updatedAt}`
  - `turnCount, updatedAt`
- `chatLogs/{uid}/items/{autoId}`:
  - `role, text, ts, mode, citations[]`

Security notes
--------------
- Passwords are stored only as PBKDF2 hashes (no plaintext)
- Login/register rate-limit lock is enabled
- User-level lock is enabled after repeated failed attempts
- Session tokens are hashed before storing in DB
