CREATE TABLE availability_options (id TEXT PRIMARY KEY,session_id TEXT NOT NULL,slot_json TEXT NOT NULL,expires_at TEXT NOT NULL);
CREATE INDEX availability_options_expiry ON availability_options(expires_at);
