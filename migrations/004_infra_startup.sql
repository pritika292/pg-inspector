-- infra_startup scenario: Datadog-like.
--   infra_identity   — internal users
--   infra_inventory  — services + dashboards
--   infra_metrics    — minute-grain time-series
--   infra_alerting   — alerts + incidents

-- ─── infra_identity ──────────────────────────────────────────────────────

CREATE TABLE infra_identity.users (
  id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  full_name   TEXT NOT NULL,
  role        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── infra_inventory ─────────────────────────────────────────────────────

CREATE TABLE infra_inventory.services (
  id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  tier        TEXT NOT NULL CHECK (tier IN ('tier1','tier2','tier3')),
  team        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE infra_inventory.dashboards (
  id              INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name            TEXT NOT NULL,
  owner_user_id   INT NOT NULL REFERENCES infra_identity.users(id) ON DELETE RESTRICT,
  queries_json    JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── infra_metrics ───────────────────────────────────────────────────────

CREATE TABLE infra_metrics.metrics_minutely (
  service_id        INT NOT NULL REFERENCES infra_inventory.services(id) ON DELETE CASCADE,
  ts                TIMESTAMPTZ NOT NULL,
  latency_p50_ms    REAL,
  latency_p95_ms    REAL,
  latency_p99_ms    REAL,
  error_rate        REAL,
  request_count     BIGINT,
  PRIMARY KEY (service_id, ts)
);

-- BRIN — block-range index — is the right shape for append-mostly,
-- ordered-by-time data. Tiny on disk, fast for range scans by ts. The
-- interview talking point.
CREATE INDEX metrics_ts_brin
  ON infra_metrics.metrics_minutely USING BRIN (ts);

CREATE INDEX metrics_service_ts_idx
  ON infra_metrics.metrics_minutely(service_id, ts DESC);

-- ─── infra_alerting ──────────────────────────────────────────────────────

CREATE TABLE infra_alerting.alerts (
  id              INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  service_id      INT NOT NULL REFERENCES infra_inventory.services(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  severity        TEXT NOT NULL CHECK (severity IN ('low','med','high','crit')),
  condition_expr  TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE infra_alerting.incidents (
  id                          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  alert_id                    INT NOT NULL REFERENCES infra_alerting.alerts(id) ON DELETE CASCADE,
  opened_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at                   TIMESTAMPTZ,
  acknowledged_by_user_id     INT REFERENCES infra_identity.users(id) ON DELETE SET NULL,
  status                      TEXT NOT NULL CHECK (status IN ('open','ack','resolved'))
);

CREATE INDEX incidents_status_opened_idx
  ON infra_alerting.incidents(status, opened_at);
