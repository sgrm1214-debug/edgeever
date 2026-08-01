PRAGMA foreign_keys = ON;

CREATE TABLE memo_import_sources (
  workspace_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (length(trim(source)) BETWEEN 1 AND 80),
  external_id TEXT NOT NULL CHECK (length(trim(external_id)) BETWEEN 1 AND 512),
  memo_id TEXT NOT NULL,
  source_updated_at TEXT,
  content_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (workspace_id, source, external_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  FOREIGN KEY (memo_id) REFERENCES memos(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
);

CREATE INDEX idx_memo_import_sources_memo
  ON memo_import_sources(workspace_id, memo_id);
