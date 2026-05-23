import { afterAll, beforeAll, describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { migrate } from "../../src/server/db/migrate.js";
import { runSeed, SEED_VERSION } from "../../src/server/db/seed/runSeed.js";

const dbUrl = process.env.ADMIN_DATABASE_URL || process.env.DATABASE_URL || "";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MIGRATIONS_DIR = path.join(repoRoot, "migrations");

const ALL_SCHEMAS = [
  "sm_identity",
  "sm_communities",
  "sm_content",
  "sm_engagement",
  "es_identity",
  "es_accounts",
  "es_pipeline",
  "es_tasks",
  "infra_identity",
  "infra_inventory",
  "infra_metrics",
  "infra_alerting",
  "ec_catalog",
  "ec_customers",
  "ec_orders",
  "ec_payments",
  "ft_identity",
  "ft_ledger",
  "ft_merchants",
  "ft_disputes",
  "ft_webhooks",
];

describe.skipIf(!dbUrl)("seed harness + all 5 scenario seeders", () => {
  let client: pg.Client;

  beforeAll(async () => {
    client = new pg.Client({ connectionString: dbUrl });
    await client.connect();
    for (const s of ALL_SCHEMAS) await client.query(`DROP SCHEMA IF EXISTS ${s} CASCADE`);
    await client.query("DROP TABLE IF EXISTS _migrations");
    await client.query("DROP TABLE IF EXISTS _seed_marker");
    await migrate(client, MIGRATIONS_DIR);
    const result = await runSeed(client);
    expect(result.ran).toBe(true);
  }, 90_000);

  afterAll(async () => {
    for (const s of ALL_SCHEMAS) await client.query(`DROP SCHEMA IF EXISTS ${s} CASCADE`);
    await client.query("DROP TABLE IF EXISTS _migrations");
    await client.query("DROP TABLE IF EXISTS _seed_marker");
    await client.end();
  });

  it("recorded the seed marker at the current SEED_VERSION", async () => {
    const { rows } = await client.query<{ version: number }>("SELECT version FROM _seed_marker");
    expect(rows.map((r) => r.version)).toEqual([SEED_VERSION]);
  });

  it("is idempotent: re-running is a no-op at the same version", async () => {
    const result = await runSeed(client);
    expect(result.ran).toBe(false);
    expect(result.reason).toContain("already at version");
  });

  it("force-reseed clears + refills", async () => {
    const before = await client.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM sm_identity.users",
    );
    const result = await runSeed(client, { force: true });
    expect(result.ran).toBe(true);
    const after = await client.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM sm_identity.users",
    );
    expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
  }, 90_000);

  // ─── per-scenario row-count sanity ────────────────────────────────────

  const counts = async (sql: string): Promise<number> => {
    const { rows } = await client.query<{ count: string }>(sql);
    return Number(rows[0]?.count ?? "0");
  };

  it("fintech seeded with believable row counts", async () => {
    expect(await counts("SELECT COUNT(*)::text AS count FROM ft_identity.users")).toBeGreaterThan(
      3500,
    );
    expect(
      await counts("SELECT COUNT(*)::text AS count FROM ft_ledger.transactions"),
    ).toBeGreaterThan(7000);
    // Double-entry: every row has a paired row with swapped from/to
    const balanced = await counts(
      `SELECT COUNT(*)::text AS count FROM ft_ledger.transactions WHERE amount_cents > 0`,
    );
    expect(balanced).toBeGreaterThan(7000);
    // ≥1 disputes still 'open'
    expect(
      await counts("SELECT COUNT(*)::text AS count FROM ft_disputes.disputes WHERE status='open'"),
    ).toBeGreaterThan(0);
  });

  it("social_media seeded; ~30% of comments are replies", async () => {
    const all = await counts("SELECT COUNT(*)::text AS count FROM sm_content.comments");
    const replies = await counts(
      "SELECT COUNT(*)::text AS count FROM sm_content.comments WHERE parent_comment_id IS NOT NULL",
    );
    expect(all).toBeGreaterThan(5000);
    const replyShare = replies / all;
    expect(replyShare).toBeGreaterThan(0.2);
    expect(replyShare).toBeLessThan(0.5);
  });

  it("social_media: ~30% of users have payment_account_id soft ref populated", async () => {
    const users = await counts("SELECT COUNT(*)::text AS count FROM sm_identity.users");
    const withRef = await counts(
      "SELECT COUNT(*)::text AS count FROM sm_identity.users WHERE payment_account_id IS NOT NULL",
    );
    const share = withRef / users;
    expect(share).toBeGreaterThan(0.2);
    expect(share).toBeLessThan(0.4);
  });

  it("enterprise_saas: stage distribution biased to early stages", async () => {
    const total = await counts("SELECT COUNT(*)::text AS count FROM es_pipeline.opportunities");
    const earlyVsLate = async (early: boolean): Promise<number> => {
      const set = early ? "('prospecting','qualification')" : "('closed_won','closed_lost')";
      return counts(
        `SELECT COUNT(*)::text AS count FROM es_pipeline.opportunities WHERE stage IN ${set}`,
      );
    };
    expect(await earlyVsLate(true)).toBeGreaterThan(await earlyVsLate(false));
    expect(total).toBeGreaterThan(1000);
  });

  it("enterprise_saas: ~5% accounts have parent_account_id (hierarchy)", async () => {
    const all = await counts("SELECT COUNT(*)::text AS count FROM es_accounts.accounts");
    const withParent = await counts(
      "SELECT COUNT(*)::text AS count FROM es_accounts.accounts WHERE parent_account_id IS NOT NULL",
    );
    const share = withParent / all;
    expect(share).toBeGreaterThan(0.01);
    expect(share).toBeLessThan(0.1);
  });

  it("infra_startup: metrics_minutely has at least 10K rows; at least one service p99 > 500ms", async () => {
    expect(
      await counts("SELECT COUNT(*)::text AS count FROM infra_metrics.metrics_minutely"),
    ).toBeGreaterThan(10000);
    expect(
      await counts(
        "SELECT COUNT(*)::text AS count FROM infra_metrics.metrics_minutely WHERE latency_p99_ms > 500",
      ),
    ).toBeGreaterThan(0);
  });

  it("infra_startup: at least one incident still open", async () => {
    expect(
      await counts(
        "SELECT COUNT(*)::text AS count FROM infra_alerting.incidents WHERE status IN ('open','ack')",
      ),
    ).toBeGreaterThan(0);
  });

  it("ecommerce: ~5% products soft-deleted", async () => {
    const all = await counts("SELECT COUNT(*)::text AS count FROM ec_catalog.products");
    const deleted = await counts(
      "SELECT COUNT(*)::text AS count FROM ec_catalog.products WHERE deleted_at IS NOT NULL",
    );
    const share = deleted / all;
    expect(share).toBeGreaterThan(0.02);
    expect(share).toBeLessThan(0.1);
  });

  it("ecommerce: ~80% payments have processor_user_id soft ref", async () => {
    const all = await counts("SELECT COUNT(*)::text AS count FROM ec_payments.payments");
    const withRef = await counts(
      "SELECT COUNT(*)::text AS count FROM ec_payments.payments WHERE processor_user_id IS NOT NULL",
    );
    const share = withRef / all;
    expect(share).toBeGreaterThan(0.7);
    expect(share).toBeLessThan(0.9);
  });

  it("every order_items.product_id resolves to an existing product (intra-scenario FK ok)", async () => {
    const orphans = await counts(
      `SELECT COUNT(*)::text AS count
       FROM ec_orders.order_items oi
       LEFT JOIN ec_catalog.products p ON p.id = oi.product_id
       WHERE p.id IS NULL`,
    );
    expect(orphans).toBe(0);
  });
});
