ALTER TABLE screenshots ADD COLUMN tags TEXT NOT NULL DEFAULT '';

DROP TRIGGER screenshots_ai;
DROP TRIGGER screenshots_ad;
DROP TRIGGER screenshots_au;
DROP TABLE screenshots_fts;

CREATE VIRTUAL TABLE screenshots_fts USING fts5(
  label, notes, tags,
  content='screenshots', content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER screenshots_ai AFTER INSERT ON screenshots BEGIN
  INSERT INTO screenshots_fts(rowid, label, notes, tags) VALUES (new.id, new.label, new.notes, new.tags);
END;
CREATE TRIGGER screenshots_ad AFTER DELETE ON screenshots BEGIN
  INSERT INTO screenshots_fts(screenshots_fts, rowid, label, notes, tags)
    VALUES ('delete', old.id, old.label, old.notes, old.tags);
END;
CREATE TRIGGER screenshots_au AFTER UPDATE OF label, notes, tags ON screenshots BEGIN
  INSERT INTO screenshots_fts(screenshots_fts, rowid, label, notes, tags)
    VALUES ('delete', old.id, old.label, old.notes, old.tags);
  INSERT INTO screenshots_fts(rowid, label, notes, tags) VALUES (new.id, new.label, new.notes, new.tags);
END;

INSERT INTO screenshots_fts(screenshots_fts) VALUES ('rebuild');
CREATE INDEX idx_screenshots_label ON screenshots(label);
