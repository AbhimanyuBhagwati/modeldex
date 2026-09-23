-- One row per vote. A voter is a salted hash of the network address, never the address itself.
-- Rows older than a week are pruned daily; lifetime totals live in `tallies`.
CREATE TABLE IF NOT EXISTS votes (
  model TEXT NOT NULL,
  voter TEXT NOT NULL,
  day TEXT NOT NULL,
  PRIMARY KEY (model, voter, day)
);
CREATE INDEX IF NOT EXISTS votes_by_day ON votes (day);
CREATE INDEX IF NOT EXISTS votes_by_voter ON votes (voter, day);

CREATE TABLE IF NOT EXISTS tallies (
  model TEXT PRIMARY KEY,
  total INTEGER NOT NULL DEFAULT 0
);
