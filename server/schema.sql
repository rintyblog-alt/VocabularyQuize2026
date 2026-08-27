PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  grade_prefix TEXT NOT NULL,
  nickname TEXT NOT NULL,
  nickname_norm TEXT NOT NULL,
  pass_hash TEXT NOT NULL,
  pass_salt TEXT NOT NULL,
  pass_iter INTEGER NOT NULL DEFAULT 100000,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  lock_until INTEGER NOT NULL DEFAULT 0,
  tos_accepted_at INTEGER NOT NULL,
  tos_version TEXT NOT NULL DEFAULT '1',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_login_at INTEGER NOT NULL DEFAULT 0,
  UNIQUE(grade_prefix, nickname_norm)
);

CREATE INDEX IF NOT EXISTS idx_users_grade_nickname_norm
  ON users (grade_prefix, nickname_norm);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  user_agent TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id
  ON auth_sessions (user_id);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at
  ON auth_sessions (expires_at);

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  key TEXT PRIMARY KEY,
  attempt_count INTEGER NOT NULL,
  first_attempt_at INTEGER NOT NULL,
  locked_until INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS shares (
  code TEXT PRIMARY KEY,
  app_version TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  preset_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shares_expires_at
  ON shares (expires_at);

CREATE TABLE IF NOT EXISTS ai_quota (
  key TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  normal_used INTEGER NOT NULL DEFAULT 0,
  reason_used INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_quota_day
  ON ai_quota (day);

CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  heading TEXT NOT NULL DEFAULT '',
  section TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_chunks_updated_at
  ON chunks (updated_at DESC);

CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts
USING fts5(
  chunk_id UNINDEXED,
  title,
  heading,
  section,
  text,
  tags
);

CREATE TABLE IF NOT EXISTS insight_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT '',
  ts INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT '',
  payload TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_insight_events_ts
  ON insight_events (ts DESC);

CREATE INDEX IF NOT EXISTS idx_insight_events_user_ts
  ON insight_events (user_id, ts DESC);

CREATE INDEX IF NOT EXISTS idx_insight_events_kind_ts
  ON insight_events (kind, ts DESC);

CREATE TABLE IF NOT EXISTS chat_history (
  user_id INTEGER PRIMARY KEY,
  history_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_chat_history_updated_at
  ON chat_history (updated_at DESC);

CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'contact',
  status TEXT NOT NULL DEFAULT 'submitted',
  source TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL DEFAULT '',
  reporter_user_id INTEGER NOT NULL DEFAULT 0,
  reporter_name TEXT NOT NULL DEFAULT '',
  reporter_handle TEXT NOT NULL DEFAULT '',
  target_type TEXT NOT NULL DEFAULT '',
  target_id TEXT NOT NULL DEFAULT '',
  target_user_id INTEGER NOT NULL DEFAULT 0,
  target_summary TEXT NOT NULL DEFAULT '',
  request_meta_json TEXT NOT NULL DEFAULT '{}',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  ai_model TEXT NOT NULL DEFAULT '',
  ai_provider TEXT NOT NULL DEFAULT '',
  ai_summary TEXT NOT NULL DEFAULT '',
  ai_category TEXT NOT NULL DEFAULT '',
  ai_priority TEXT NOT NULL DEFAULT '',
  ai_suggested_action TEXT NOT NULL DEFAULT '',
  ai_raw_json TEXT NOT NULL DEFAULT '{}',
  ai_error TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at
  ON support_tickets (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_tickets_kind_created_at
  ON support_tickets (kind, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_tickets_priority_created_at
  ON support_tickets (ai_priority, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_tickets_reporter_created_at
  ON support_tickets (reporter_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_tickets_target_created_at
  ON support_tickets (target_type, target_id, created_at DESC);

CREATE TABLE IF NOT EXISTS offenders (
  offender_code TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE,
  display_name_snapshot TEXT NOT NULL DEFAULT '',
  handle_snapshot TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'clear',
  current_ban_level TEXT NOT NULL DEFAULT '',
  current_ban_until INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_offenders_user_id
  ON offenders (user_id);

CREATE INDEX IF NOT EXISTS idx_offenders_status_updated_at
  ON offenders (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS offender_events (
  id TEXT PRIMARY KEY,
  offender_code TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  event_type TEXT NOT NULL DEFAULT '',
  target_type TEXT NOT NULL DEFAULT '',
  target_id TEXT NOT NULL DEFAULT '',
  violation_label TEXT NOT NULL DEFAULT '',
  reason_template TEXT NOT NULL DEFAULT '',
  ai_summary TEXT NOT NULL DEFAULT '',
  ai_confidence REAL NOT NULL DEFAULT 0,
  ai_category TEXT NOT NULL DEFAULT '',
  ai_severity TEXT NOT NULL DEFAULT '',
  ai_raw_json TEXT NOT NULL DEFAULT '{}',
  ban_level TEXT NOT NULL DEFAULT '',
  duration_days INTEGER NOT NULL DEFAULT 0,
  review_status TEXT NOT NULL DEFAULT 'logged',
  reviewed_at INTEGER NOT NULL DEFAULT 0,
  reviewed_by TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_offender_events_offender_created_at
  ON offender_events (offender_code, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_offender_events_review_status_created_at
  ON offender_events (review_status, created_at DESC);

CREATE TABLE IF NOT EXISTS account_enforcements (
  id TEXT PRIMARY KEY,
  offender_code TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  level TEXT NOT NULL DEFAULT '',
  starts_at INTEGER NOT NULL DEFAULT 0,
  ends_at INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  reason_label TEXT NOT NULL DEFAULT '',
  reason_template TEXT NOT NULL DEFAULT '',
  source_event_id TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_account_enforcements_user_active
  ON account_enforcements (user_id, is_active, ends_at DESC);

CREATE INDEX IF NOT EXISTS idx_account_enforcements_offender_created_at
  ON account_enforcements (offender_code, created_at DESC);

CREATE TABLE IF NOT EXISTS official_assistants (
  id TEXT PRIMARY KEY,
  account_kind TEXT NOT NULL DEFAULT 'official_extension_assistant',
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  avatar TEXT NOT NULL DEFAULT '',
  features_json TEXT NOT NULL DEFAULT '[]',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_official_assistants_active_created_at
  ON official_assistants (is_active, created_at DESC);

CREATE TABLE IF NOT EXISTS user_official_assistants (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  official_assistant_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  added_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, official_assistant_id)
);

CREATE INDEX IF NOT EXISTS idx_user_official_assistants_user_id
  ON user_official_assistants (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS battle_queue (
  id TEXT PRIMARY KEY,
  preset_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 10,
  user_id INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'WAITING',
  match_id TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_battle_queue_match
  ON battle_queue (preset_id, mode, count, state, expires_at, created_at);

CREATE INDEX IF NOT EXISTS idx_battle_queue_user
  ON battle_queue (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS battle_matches (
  id TEXT PRIMARY KEY,
  preset_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  count INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'ACTIVE',
  questions_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_battle_matches_expires
  ON battle_matches (expires_at, state);

CREATE TABLE IF NOT EXISTS battle_players (
  match_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  nickname TEXT NOT NULL DEFAULT '',
  correct INTEGER NOT NULL DEFAULT 0,
  total_time_ms INTEGER NOT NULL DEFAULT 0,
  progress INTEGER NOT NULL DEFAULT 0,
  finished INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (match_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_battle_players_match
  ON battle_players (match_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS battle_answers (
  match_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  q_index INTEGER NOT NULL,
  answer_text TEXT NOT NULL DEFAULT '',
  correct INTEGER NOT NULL DEFAULT 0,
  elapsed_ms INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (match_id, user_id, q_index)
);

CREATE INDEX IF NOT EXISTS idx_battle_answers_match
  ON battle_answers (match_id, user_id);

CREATE TABLE IF NOT EXISTS rt_queue (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL DEFAULT '',
  preset_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 10,
  user_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'WAITING',
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rt_queue_match
  ON rt_queue (preset_id, mode, count, status, expires_at, created_at);

CREATE INDEX IF NOT EXISTS idx_rt_queue_user
  ON rt_queue (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS qredit_balances (
  user_id INTEGER PRIMARY KEY,
  balance INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS qredit_ledger (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL DEFAULT '',
  direction TEXT NOT NULL DEFAULT '',
  amount INTEGER NOT NULL DEFAULT 0,
  balance_after INTEGER NOT NULL DEFAULT -1,
  reason_code TEXT NOT NULL DEFAULT '',
  reference_id TEXT NOT NULL DEFAULT '',
  idempotency_key TEXT NOT NULL,
  created_by TEXT NOT NULL DEFAULT 'system',
  meta_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_qredit_ledger_idempotency_key
  ON qredit_ledger (idempotency_key);

CREATE INDEX IF NOT EXISTS idx_qredit_ledger_user_created_at
  ON qredit_ledger (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_qredit_ledger_user_type_created_at
  ON qredit_ledger (user_id, type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_qredit_ledger_reference_id
  ON qredit_ledger (reference_id, created_at DESC);

CREATE TABLE IF NOT EXISTS qredit_packs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL DEFAULT 0,
  base_qredit INTEGER NOT NULL DEFAULT 0,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_qredit_packs_active_order
  ON qredit_packs (is_active, display_order ASC, price ASC);

CREATE TABLE IF NOT EXISTS qredit_campaigns (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL DEFAULT '',
  multiplier REAL NOT NULL DEFAULT 1,
  starts_at INTEGER NOT NULL DEFAULT 0,
  ends_at INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_qredit_campaigns_active_window
  ON qredit_campaigns (is_active, starts_at ASC, ends_at ASC);

CREATE TABLE IF NOT EXISTS subscription_qredit_rules (
  plan_name TEXT PRIMARY KEY,
  monthly_qredit INTEGER NOT NULL DEFAULT 0,
  qredit_join_price INTEGER NOT NULL DEFAULT 0,
  price_jpy INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_subscription_state (
  user_id INTEGER PRIMARY KEY,
  plan_name TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'inactive',
  source TEXT NOT NULL DEFAULT '',
  started_at INTEGER NOT NULL DEFAULT 0,
  renews_at INTEGER NOT NULL DEFAULT 0,
  last_monthly_grant_at INTEGER NOT NULL DEFAULT 0,
  qredit_join_price_paid INTEGER NOT NULL DEFAULT 0,
  cancel_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_subscription_state_plan_status
  ON user_subscription_state (plan_name, status, renews_at DESC);

CREATE TABLE IF NOT EXISTS user_unlocks (
  user_id INTEGER NOT NULL,
  unlock_key TEXT NOT NULL,
  unlocked_at INTEGER NOT NULL DEFAULT 0,
  source_ledger_id TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (user_id, unlock_key),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_unlocks_key_unlocked_at
  ON user_unlocks (unlock_key, unlocked_at DESC);

CREATE TABLE IF NOT EXISTS qredit_exam_reward_sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  preset_id TEXT NOT NULL DEFAULT '',
  question_total INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'issued',
  created_at INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL DEFAULT 0,
  completed_at INTEGER NOT NULL DEFAULT 0,
  rewarded_at INTEGER NOT NULL DEFAULT 0,
  idempotency_key TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_qredit_exam_reward_sessions_idempotency
  ON qredit_exam_reward_sessions (idempotency_key);

CREATE INDEX IF NOT EXISTS idx_qredit_exam_reward_sessions_user_created_at
  ON qredit_exam_reward_sessions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_qredit_exam_reward_sessions_user_preset_rewarded_at
  ON qredit_exam_reward_sessions (user_id, preset_id, rewarded_at DESC);
