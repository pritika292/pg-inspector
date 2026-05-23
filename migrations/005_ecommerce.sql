-- ecommerce scenario: Shopify-like.
--   ec_catalog   — stores + products (soft delete)
--   ec_customers — customers
--   ec_orders    — orders + order_items
--   ec_payments  — payments

-- ─── ec_catalog ──────────────────────────────────────────────────────────

CREATE TABLE ec_catalog.stores (
  id           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  owner_email  TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ec_catalog.products (
  id              INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id        INT NOT NULL REFERENCES ec_catalog.stores(id) ON DELETE CASCADE,
  sku             TEXT NOT NULL,
  name            TEXT NOT NULL,
  price_cents     BIGINT NOT NULL CHECK (price_cents >= 0),
  inventory_qty   INT NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,
  UNIQUE (store_id, sku)
);

CREATE INDEX products_store_active_idx
  ON ec_catalog.products(store_id, is_active, deleted_at);

-- ─── ec_customers ────────────────────────────────────────────────────────

CREATE TABLE ec_customers.customers (
  id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id    INT NOT NULL REFERENCES ec_catalog.stores(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  full_name   TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, email)
);

-- ─── ec_orders ───────────────────────────────────────────────────────────

CREATE TABLE ec_orders.orders (
  id            INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id      INT NOT NULL REFERENCES ec_catalog.stores(id) ON DELETE CASCADE,
  customer_id   INT NOT NULL REFERENCES ec_customers.customers(id) ON DELETE RESTRICT,
  status        TEXT NOT NULL CHECK (status IN ('pending','paid','shipped','delivered','refunded','cancelled')),
  total_cents   BIGINT NOT NULL CHECK (total_cents >= 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX orders_store_created_idx ON ec_orders.orders(store_id, created_at DESC);

-- Partial index: only rows in transient states. Tiny on disk, fast for the
-- common "show me open orders" dashboard query.
CREATE INDEX orders_pending_paid_partial_idx
  ON ec_orders.orders(status, created_at)
  WHERE status IN ('pending','paid');

CREATE TABLE ec_orders.order_items (
  order_id           INT NOT NULL REFERENCES ec_orders.orders(id) ON DELETE CASCADE,
  product_id         INT NOT NULL REFERENCES ec_catalog.products(id) ON DELETE RESTRICT,
  qty                INT NOT NULL CHECK (qty > 0),
  unit_price_cents   BIGINT NOT NULL CHECK (unit_price_cents >= 0),
  PRIMARY KEY (order_id, product_id)
);

-- ─── ec_payments ─────────────────────────────────────────────────────────

CREATE TABLE ec_payments.payments (
  id                  INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id            INT NOT NULL REFERENCES ec_orders.orders(id) ON DELETE CASCADE,
  amount_cents        BIGINT NOT NULL CHECK (amount_cents >= 0),
  status              TEXT NOT NULL CHECK (status IN ('pending','succeeded','failed','refunded')),
  provider            TEXT NOT NULL,
  -- Cross-scenario soft ref: populated by the ecommerce seeder with an
  -- existing ft_identity.users.id. The COMMENT is in 007_cross_scenario_soft_refs.sql.
  processor_user_id   INT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
