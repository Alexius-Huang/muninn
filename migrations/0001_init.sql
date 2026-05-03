CREATE TABLE IF NOT EXISTS groups (
  id           TEXT    PRIMARY KEY,
  name         TEXT    NOT NULL,
  lat          REAL    NOT NULL,
  lng          REAL    NOT NULL,
  place_id     TEXT,
  location_name TEXT,
  created_at   TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS photos (
  id               TEXT PRIMARY KEY,
  group_id         TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  captured_at      TEXT,
  r2_key           TEXT,
  created_at       TEXT NOT NULL
);
