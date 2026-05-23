-- enterprise_saas scenario: Salesforce-like.
--   es_identity — internal users (sales reps)
--   es_accounts — accounts (with self-FK hierarchy) + contacts + junction
--   es_pipeline — opportunities + activities (audit trail)
--   es_tasks    — tasks

-- ─── es_identity ─────────────────────────────────────────────────────────

CREATE TABLE es_identity.users (
  id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  full_name   TEXT NOT NULL,
  role        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── es_accounts ─────────────────────────────────────────────────────────

CREATE TABLE es_accounts.accounts (
  id                INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name              TEXT NOT NULL,
  industry          TEXT,
  employee_count    INT,
  parent_account_id INT REFERENCES es_accounts.accounts(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE es_accounts.contacts (
  id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id  INT NOT NULL REFERENCES es_accounts.accounts(id) ON DELETE CASCADE,
  full_name   TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  title       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX contacts_email_idx ON es_accounts.contacts(email);

CREATE TABLE es_accounts.account_contacts (
  account_id INT NOT NULL REFERENCES es_accounts.accounts(id) ON DELETE CASCADE,
  contact_id INT NOT NULL REFERENCES es_accounts.contacts(id) ON DELETE CASCADE,
  role       TEXT NOT NULL,
  PRIMARY KEY (account_id, contact_id)
);

-- ─── es_pipeline ─────────────────────────────────────────────────────────

CREATE TABLE es_pipeline.opportunities (
  id              INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id      INT NOT NULL REFERENCES es_accounts.accounts(id) ON DELETE CASCADE,
  owner_user_id   INT NOT NULL REFERENCES es_identity.users(id) ON DELETE RESTRICT,
  name            TEXT NOT NULL,
  stage           TEXT NOT NULL CHECK (stage IN ('prospecting','qualification','proposal','negotiation','closed_won','closed_lost')),
  amount_usd      INT NOT NULL,
  close_date      DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX opportunities_stage_close_idx ON es_pipeline.opportunities(stage, close_date);

CREATE TABLE es_pipeline.activities (
  id              INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id      INT REFERENCES es_accounts.accounts(id) ON DELETE CASCADE,
  contact_id      INT REFERENCES es_accounts.contacts(id) ON DELETE CASCADE,
  opportunity_id  INT REFERENCES es_pipeline.opportunities(id) ON DELETE CASCADE,
  actor_user_id   INT NOT NULL REFERENCES es_identity.users(id) ON DELETE RESTRICT,
  type            TEXT NOT NULL CHECK (type IN ('call','email','meeting','note')),
  body            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX activities_account_created_idx
  ON es_pipeline.activities(account_id, created_at DESC);

-- ─── es_tasks ────────────────────────────────────────────────────────────

CREATE TABLE es_tasks.tasks (
  id            INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_user_id INT NOT NULL REFERENCES es_identity.users(id) ON DELETE RESTRICT,
  account_id    INT REFERENCES es_accounts.accounts(id) ON DELETE CASCADE,
  due_date      DATE,
  status        TEXT NOT NULL CHECK (status IN ('open','in_progress','done','cancelled')),
  title         TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
