-- Every piece of pipeline data (projects, sheet rows, history events, team members, weekly entries,
-- shared comments) is one record. Each write bumps a global sequence number so browsers can fetch
-- only what changed, and each record carries a version so concurrent edits are detected, not lost.
CREATE TABLE records (
  kind TEXT NOT NULL,
  id TEXT NOT NULL,
  project TEXT NOT NULL DEFAULT '',
  stage TEXT NOT NULL DEFAULT '',
  data TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  deleted INTEGER NOT NULL DEFAULT 0,
  seq INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (kind, id)
);

CREATE INDEX records_by_seq ON records (seq);

CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);

INSERT INTO meta (key, value) VALUES ('seq', 0);

-- Never holds rows: inserting into it is how a batch aborts itself when a version check fails.
CREATE TABLE version_guard (
  ok INTEGER NOT NULL CHECK (ok = 0)
);
