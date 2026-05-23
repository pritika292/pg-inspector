// Static scenario metadata. The DB layout, sub-schemas, and seed shapes
// are described here so /api/scenarios doesn't have to query the DB for
// every facet. Things that depend on DB state (table count, row count)
// are computed in schemaIntrospect.ts.

export interface SeedQuestion {
  label: string;
  sql: string;
  why: string;
}

export interface ScenarioMeta {
  slug: string;
  name: string;
  industryAnalog: string;
  tagline: string;
  schemas: string[];
  accentVar: string;
  seedQuestions: SeedQuestion[];
}

export const SCENARIOS: readonly ScenarioMeta[] = Object.freeze([
  {
    slug: "social_media",
    name: "social media",
    industryAnalog: "Reddit-like",
    tagline: "Recursive comments, vote skew, hot-content queries.",
    schemas: ["sm_identity", "sm_communities", "sm_content", "sm_engagement"],
    accentVar: "--accent-social",
    seedQuestions: [
      {
        label: "Top 10 posts by score this month",
        sql:
          "SELECT title, score FROM sm_content.posts " +
          "WHERE created_at > NOW() - INTERVAL '30 days' " +
          "ORDER BY score DESC LIMIT 10;",
        why: "Hot-content read against the (community_id, created_at DESC) index.",
      },
      {
        label: "Posts per community in the last 7 days",
        sql:
          "SELECT c.slug, COUNT(p.id) AS posts " +
          "FROM sm_communities.communities c " +
          "LEFT JOIN sm_content.posts p " +
          "  ON p.community_id = c.id AND p.created_at > NOW() - INTERVAL '7 days' " +
          "GROUP BY c.slug ORDER BY posts DESC LIMIT 20;",
        why: "Cross-schema JOIN between sm_communities and sm_content.",
      },
      {
        label: "Comments with the most replies",
        sql:
          "SELECT c.id, c.body, COUNT(r.id) AS reply_count " +
          "FROM sm_content.comments c " +
          "JOIN sm_content.comments r ON r.parent_comment_id = c.id " +
          "GROUP BY c.id, c.body ORDER BY reply_count DESC LIMIT 10;",
        why: "Self-join on recursive comments tree.",
      },
    ],
  },
  {
    slug: "enterprise_saas",
    name: "enterprise saas",
    industryAnalog: "Salesforce-like",
    tagline: "Audit trails, account hierarchy, opportunity pipeline.",
    schemas: ["es_identity", "es_accounts", "es_pipeline", "es_tasks"],
    accentVar: "--accent-enterprise",
    seedQuestions: [
      {
        label: "Pipeline value by stage",
        sql:
          "SELECT stage, COUNT(*) AS deals, SUM(amount_usd) AS total " +
          "FROM es_pipeline.opportunities " +
          "GROUP BY stage ORDER BY total DESC;",
        why: "Hits the (stage, close_date) index.",
      },
      {
        label: "Top 10 accounts by activity volume this quarter",
        sql:
          "SELECT a.name, COUNT(act.id) AS activities " +
          "FROM es_accounts.accounts a " +
          "JOIN es_pipeline.activities act ON act.account_id = a.id " +
          "WHERE act.created_at > NOW() - INTERVAL '90 days' " +
          "GROUP BY a.name ORDER BY activities DESC LIMIT 10;",
        why: "Cross-schema JOIN between es_accounts and es_pipeline.",
      },
      {
        label: "Account hierarchy: parents with their children",
        sql:
          "SELECT p.name AS parent, c.name AS child " +
          "FROM es_accounts.accounts p " +
          "JOIN es_accounts.accounts c ON c.parent_account_id = p.id " +
          "ORDER BY p.name LIMIT 20;",
        why: "Self-FK walk for org-tree visualization.",
      },
    ],
  },
  {
    slug: "infra_startup",
    name: "infra startup",
    industryAnalog: "Datadog-like",
    tagline: "Time-series metrics, alert dedup, high-cardinality.",
    schemas: ["infra_identity", "infra_inventory", "infra_metrics", "infra_alerting"],
    accentVar: "--accent-infra",
    seedQuestions: [
      {
        label: "p99 latency by service in the last hour",
        sql:
          "SELECT s.slug, AVG(m.latency_p99_ms) AS avg_p99 " +
          "FROM infra_inventory.services s " +
          "JOIN infra_metrics.metrics_minutely m ON m.service_id = s.id " +
          "WHERE m.ts > NOW() - INTERVAL '1 hour' " +
          "GROUP BY s.slug ORDER BY avg_p99 DESC LIMIT 10;",
        why: "Uses the BRIN index on metrics_minutely(ts).",
      },
      {
        label: "Currently open incidents",
        sql:
          "SELECT a.name AS alert, i.opened_at, i.status " +
          "FROM infra_alerting.incidents i " +
          "JOIN infra_alerting.alerts a ON a.id = i.alert_id " +
          "WHERE i.status IN ('open','ack') " +
          "ORDER BY i.opened_at;",
        why: "Hits the (status, opened_at) partial index.",
      },
      {
        label: "Services with the noisiest tier3",
        sql:
          "SELECT s.slug, MAX(m.latency_p99_ms) AS peak_p99 " +
          "FROM infra_inventory.services s " +
          "JOIN infra_metrics.metrics_minutely m ON m.service_id = s.id " +
          "WHERE s.tier = 'tier3' " +
          "GROUP BY s.slug ORDER BY peak_p99 DESC LIMIT 10;",
        why: "Filters by tier (low-cardinality), aggregates over high-cardinality metrics.",
      },
    ],
  },
  {
    slug: "ecommerce",
    name: "ecommerce",
    industryAnalog: "Shopify-like",
    tagline: "Order lifecycle, inventory, refunds, GMV.",
    schemas: ["ec_catalog", "ec_customers", "ec_orders", "ec_payments"],
    accentVar: "--accent-ecommerce",
    seedQuestions: [
      {
        label: "Top 10 stores by GMV this month",
        sql:
          "SELECT s.name, SUM(o.total_cents)/100.0 AS gmv_usd " +
          "FROM ec_catalog.stores s " +
          "JOIN ec_orders.orders o ON o.store_id = s.id " +
          "WHERE o.created_at > NOW() - INTERVAL '30 days' " +
          "  AND o.status NOT IN ('cancelled','refunded') " +
          "GROUP BY s.name ORDER BY gmv_usd DESC LIMIT 10;",
        why: "Cross-schema JOIN; (store_id, created_at DESC) index helps.",
      },
      {
        label: "Pending orders older than 3 days",
        sql:
          "SELECT id, store_id, created_at, total_cents " +
          "FROM ec_orders.orders " +
          "WHERE status IN ('pending','paid') AND created_at < NOW() - INTERVAL '3 days' " +
          "ORDER BY created_at LIMIT 50;",
        why: "Hits the partial index orders(status, created_at) WHERE status IN ('pending','paid').",
      },
      {
        label: "Top 10 SKUs by units sold",
        sql:
          "SELECT p.sku, p.name, SUM(oi.qty) AS units " +
          "FROM ec_orders.order_items oi " +
          "JOIN ec_catalog.products p ON p.id = oi.product_id " +
          "GROUP BY p.sku, p.name ORDER BY units DESC LIMIT 10;",
        why: "Cross-schema JOIN; hot path for inventory dashboards.",
      },
    ],
  },
  {
    slug: "fintech",
    name: "fintech",
    industryAnalog: "Stripe-like",
    tagline: "Double-entry ledger, idempotency, webhooks, disputes.",
    schemas: ["ft_identity", "ft_ledger", "ft_merchants", "ft_disputes", "ft_webhooks"],
    accentVar: "--accent-fintech",
    seedQuestions: [
      {
        label: "Total pending transaction value by currency",
        sql:
          "SELECT currency, SUM(amount_cents)/100.0 AS pending_total " +
          "FROM ft_ledger.transactions " +
          "WHERE status = 'pending' " +
          "GROUP BY currency ORDER BY pending_total DESC;",
        why: "Uses the partial index transactions(status, created_at) WHERE status='pending'.",
      },
      {
        label: "Open disputes with their transaction amounts",
        sql:
          "SELECT d.id, d.reason, t.amount_cents/100.0 AS amount " +
          "FROM ft_disputes.disputes d " +
          "JOIN ft_ledger.transactions t ON t.id = d.transaction_id " +
          "WHERE d.status = 'open' " +
          "ORDER BY t.amount_cents DESC LIMIT 20;",
        why: "Cross-schema JOIN; hits (status, opened_at) on disputes.",
      },
      {
        label: "Top 10 merchants by transaction count",
        sql:
          "SELECT m.name, COUNT(t.id) AS tx_count " +
          "FROM ft_merchants.merchants m " +
          "JOIN ft_ledger.transactions t ON t.merchant_id = m.id " +
          "GROUP BY m.name ORDER BY tx_count DESC LIMIT 10;",
        why: "Cross-schema JOIN ft_merchants -> ft_ledger.",
      },
    ],
  },
]);

export function getScenario(slug: string): ScenarioMeta | undefined {
  return SCENARIOS.find((s) => s.slug === slug);
}
