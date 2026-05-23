-- fintech scenario: Stripe-like.
--   ft_identity  — users (KYC)
--   ft_ledger    — accounts + transactions (double-entry, idempotency keys)
--   ft_merchants — merchants
--   ft_disputes  — disputes
--   ft_webhooks  — webhook receipts

-- ─── ft_identity ─────────────────────────────────────────────────────────

CREATE TABLE ft_identity.users (
  id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  full_name   TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  kyc_status  TEXT NOT NULL CHECK (kyc_status IN ('pending','verified','rejected'))
);

-- ─── ft_merchants ────────────────────────────────────────────────────────

CREATE TABLE ft_merchants.merchants (
  id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT NOT NULL,
  mcc_code    CHAR(4) NOT NULL,
  country     CHAR(2) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── ft_ledger ───────────────────────────────────────────────────────────

CREATE TABLE ft_ledger.accounts (
  id              INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id         INT NOT NULL REFERENCES ft_identity.users(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL CHECK (kind IN ('checking','savings','external')),
  balance_cents   BIGINT NOT NULL DEFAULT 0,
  currency        CHAR(3) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ft_ledger.transactions (
  id                INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  from_account_id   INT NOT NULL REFERENCES ft_ledger.accounts(id) ON DELETE RESTRICT,
  to_account_id     INT NOT NULL REFERENCES ft_ledger.accounts(id) ON DELETE RESTRICT,
  merchant_id       INT REFERENCES ft_merchants.merchants(id) ON DELETE SET NULL,
  amount_cents      BIGINT NOT NULL CHECK (amount_cents > 0),
  currency          CHAR(3) NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('pending','posted','reversed')),
  -- Idempotency key — UNIQUE so a retried POST from the upstream payment
  -- service can't double-charge. The interview talking point.
  idempotency_key   TEXT NOT NULL UNIQUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  posted_at         TIMESTAMPTZ
);

CREATE INDEX transactions_from_created_idx
  ON ft_ledger.transactions(from_account_id, created_at DESC);
CREATE INDEX transactions_to_created_idx
  ON ft_ledger.transactions(to_account_id, created_at DESC);
CREATE INDEX transactions_pending_partial_idx
  ON ft_ledger.transactions(status, created_at)
  WHERE status = 'pending';

-- ─── ft_disputes ─────────────────────────────────────────────────────────

CREATE TABLE ft_disputes.disputes (
  id              INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  transaction_id  INT NOT NULL REFERENCES ft_ledger.transactions(id) ON DELETE CASCADE,
  opened_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ,
  reason          TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('open','won','lost'))
);

CREATE INDEX disputes_status_opened_idx
  ON ft_disputes.disputes(status, opened_at);

-- ─── ft_webhooks ─────────────────────────────────────────────────────────

CREATE TABLE ft_webhooks.webhooks_log (
  id               INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_type       TEXT NOT NULL,
  merchant_id      INT REFERENCES ft_merchants.merchants(id) ON DELETE SET NULL,
  payload          JSONB NOT NULL,
  idempotency_key  TEXT NOT NULL UNIQUE,
  received_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at     TIMESTAMPTZ
);
