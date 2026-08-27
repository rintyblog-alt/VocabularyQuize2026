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
