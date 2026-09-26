CREATE TABLE destinations (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  path        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_default  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE screenshots (
  id              INTEGER PRIMARY KEY,
  path            TEXT NOT NULL UNIQUE,
  original_name   TEXT NOT NULL,
  captured_at     TEXT NOT NULL,
  size_bytes      INTEGER NOT NULL,
  hash            TEXT NOT NULL,
  label           TEXT NOT NULL DEFAULT '',
  notes           TEXT NOT NULL DEFAULT '',
  destination_id  INTEGER NOT NULL REFERENCES destinations(id),
  status          TEXT NOT NULL DEFAULT 'present',
  pending_move_to INTEGER REFERENCES destinations(id),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_screenshots_captured ON screenshots(captured_at DESC);
CREATE INDEX idx_screenshots_dest     ON screenshots(destination_id);

CREATE VIRTUAL TABLE screenshots_fts USING fts5(
  label, notes,
  content='screenshots', content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER screenshots_ai AFTER INSERT ON screenshots BEGIN
  INSERT INTO screenshots_fts(rowid, label, notes) VALUES (new.id, new.label, new.notes);
END;
CREATE TRIGGER screenshots_ad AFTER DELETE ON screenshots BEGIN
  INSERT INTO screenshots_fts(screenshots_fts, rowid, label, notes)
    VALUES ('delete', old.id, old.label, old.notes);
END;
CREATE TRIGGER screenshots_au AFTER UPDATE OF label, notes ON screenshots BEGIN
  INSERT INTO screenshots_fts(screenshots_fts, rowid, label, notes)
    VALUES ('delete', old.id, old.label, old.notes);
  INSERT INTO screenshots_fts(rowid, label, notes) VALUES (new.id, new.label, new.notes);
END;

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
