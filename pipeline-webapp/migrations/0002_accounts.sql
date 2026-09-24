-- Accounts are created by an admin; people cannot sign up or change their own password.
-- Passwords are never stored: only a salted PBKDF2-SHA256 hash, with the iteration count used,
-- so the strength can be raised later and old hashes upgrade themselves at the next sign-in.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'artist')),
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT
);

-- Only a SHA-256 of each session token is stored; the token itself lives in the browser's HttpOnly cookie.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX sessions_by_user ON sessions (user_id);

-- Who made each change, stamped by the server.
ALTER TABLE records ADD COLUMN updated_by TEXT NOT NULL DEFAULT '';
