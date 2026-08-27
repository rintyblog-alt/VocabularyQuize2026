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
