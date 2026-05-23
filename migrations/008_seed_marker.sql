-- Tracked by runSeed(). When SEED_VERSION in code exceeds the latest value
-- here, runSeed truncates every scenario table and refills. Single-row
-- semantics: there's at most one row at any time.
CREATE TABLE IF NOT EXISTS _seed_marker (
  version     INT PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
