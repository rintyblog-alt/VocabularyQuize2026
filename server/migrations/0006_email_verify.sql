-- ════════════════════════════════════════════════════════════════════════════
-- 0006_email_verify.sql
-- 新規登録: Gmail 所有確認（メールアドレス確認）+ 利用規約/プライバシー同意フロー
--
-- 【重要 / 適用方法】
--   本番 D1(vocabuquiz_auth) は、Worker 起動時の ensureDbSchema() が
--   この内容を「冪等」に自動適用します（CREATE TABLE IF NOT EXISTS / ensureCols /
--   ensureIndex）。したがって通常は Worker を deploy するだけで反映されます。
--   このファイルは (a) 記録 (b) 新規/空DB への手動適用 (c) 正式な
--   `wrangler d1 migrations apply` 運用のための参照です。
--
--   既に Worker が起動済みの本番 DB では users への ALTER 済みのため、
--   下記 ALTER 群は "duplicate column name" になります（＝適用済みの証・無害）。
--   その場合は ALTER セクションを飛ばし、CREATE TABLE / INDEX 部分だけ適用してください。
--
-- 【ロールバック】
--   ・registration_challenges: DROP TABLE registration_challenges;（登録途中データのみ・正式ユーザーに影響なし）
--   ・users の追加列: SQLite/D1 は DROP COLUMN 制約があるため、通常は「列を使わない」運用で無害化。
--     どうしても除去する場合は users を作り直す移行が必要（既存ユーザー保全のため非推奨）。
--   ・部分ユニーク索引: DROP INDEX idx_users_email_canonical_uq;
-- ════════════════════════════════════════════════════════════════════════════

-- ── 登録途中データ（正式 users とは別。同意完了まで正式アカウントを作らない） ──
CREATE TABLE IF NOT EXISTS registration_challenges (
  id TEXT PRIMARY KEY,
  email_original TEXT NOT NULL DEFAULT '',       -- 表示用（ユーザー入力の見た目・ドメインのみ小文字化）
  email_canonical TEXT NOT NULL DEFAULT '',      -- 重複判定用（Gmail 正規化: 小文字/ドット除去/+以降除去/gmail.com統一）
  login_id TEXT NOT NULL DEFAULT '',
  login_id_norm TEXT NOT NULL DEFAULT '',
  grade_prefix TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL DEFAULT '',         -- PBKDF2（既存 users と同方式）。平文は保存しない
  password_salt TEXT NOT NULL DEFAULT '',
  password_iter INTEGER NOT NULL DEFAULT 100000,
  code_digest TEXT NOT NULL DEFAULT '',           -- HMAC-SHA256(OTP_PEPPER, challengeId:code)。平文コードは保存しない
  code_expires_at INTEGER NOT NULL DEFAULT 0,
  last_sent_at INTEGER NOT NULL DEFAULT 0,
  resend_count INTEGER NOT NULL DEFAULT 0,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDING_EMAIL_VERIFICATION',
  -- PENDING_EMAIL_VERIFICATION / EMAIL_VERIFIED_PENDING_CONSENT / ACTIVE / EXPIRED / LOCKED / RESTART_REQUIRED / CANCELLED
  email_verified_at INTEGER NOT NULL DEFAULT 0,
  consented_at INTEGER NOT NULL DEFAULT 0,
  terms_version TEXT NOT NULL DEFAULT '',
  privacy_version TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_reg_ch_email_canonical ON registration_challenges (email_canonical, status);
CREATE INDEX IF NOT EXISTS idx_reg_ch_login_id_norm ON registration_challenges (login_id_norm);
CREATE INDEX IF NOT EXISTS idx_reg_ch_status ON registration_challenges (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_reg_ch_expires ON registration_challenges (code_expires_at);

-- ── 正式 users への列追加（既存ユーザーは空/0 のまま・非破壊。既に適用済みなら "duplicate column" で無害） ──
ALTER TABLE users ADD COLUMN email TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN email_canonical TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN email_verified_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN privacy_version TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN consented_at INTEGER NOT NULL DEFAULT 0;

-- Gmail 正規化の重複防止（空値の既存ユーザーは除外する部分ユニーク索引）
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_canonical_uq ON users (email_canonical) WHERE email_canonical != '';
