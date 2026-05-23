import { afterAll, beforeAll, describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { migrate } from "../../src/server/db/migrate.js";

const dbUrl = process.env.ADMIN_DATABASE_URL || process.env.DATABASE_URL || "";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MIGRATIONS_DIR = path.join(repoRoot, "migrations");

const SCENARIO_SCHEMAS: Record<string, string[]> = {
  social_media: ["sm_identity", "sm_communities", "sm_content", "sm_engagement"],
  enterprise_saas: ["es_identity", "es_accounts", "es_pipeline", "es_tasks"],
  infra_startup: ["infra_identity", "infra_inventory", "infra_metrics", "infra_alerting"],
  ecommerce: ["ec_catalog", "ec_customers", "ec_orders", "ec_payments"],
  fintech: ["ft_identity", "ft_ledger", "ft_merchants", "ft_disputes", "ft_webhooks"],
};
const ALL_SCHEMAS = Object.values(SCENARIO_SCHEMAS).flat();

describe.skipIf(!dbUrl)("scenario schemas + migrations", () => {
  let client: pg.Client;

  beforeAll(async () => {
    client = new pg.Client({ connectionString: dbUrl });
    await client.connect();

    // Clean slate — drop everything we own + the migration ledger.
    for (const s of ALL_SCHEMAS) {
      await client.query(`DROP SCHEMA IF EXISTS ${s} CASCADE`);
    }
    await client.query("DROP TABLE IF EXISTS _migrations");

    const result = await migrate(client, MIGRATIONS_DIR);
    expect(result.applied.length).toBe(7);
  });

  afterAll(async () => {
    for (const s of ALL_SCHEMAS) {
      await client.query(`DROP SCHEMA IF EXISTS ${s} CASCADE`);
    }
    await client.query("DROP TABLE IF EXISTS _migrations");
    await client.end();
  });

  it("created all 21 sub-schemas across 5 scenarios", async () => {
    const { rows } = await client.query<{ schema_name: string }>(
      "SELECT schema_name FROM information_schema.schemata WHERE schema_name = ANY($1::text[])",
      [ALL_SCHEMAS],
    );
    expect(rows.map((r) => r.schema_name).sort()).toEqual([...ALL_SCHEMAS].sort());
  });

  for (const [scenario, schemas] of Object.entries(SCENARIO_SCHEMAS)) {
    it(`${scenario}: each sub-schema has at least one table`, async () => {
      const { rows } = await client.query<{ table_schema: string; count: string }>(
        `SELECT table_schema, COUNT(*)::text AS count
         FROM information_schema.tables
         WHERE table_schema = ANY($1::text[]) AND table_type = 'BASE TABLE'
         GROUP BY table_schema`,
        [schemas],
      );
      const observed = new Set(rows.map((r) => r.table_schema));
      for (const s of schemas) {
        expect(observed.has(s), `${s} has no tables`).toBe(true);
      }
    });
  }

  it("BRIN index exists on infra_metrics.metrics_minutely(ts)", async () => {
    const { rows } = await client.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname='infra_metrics' AND tablename='metrics_minutely' AND indexdef ILIKE '%using brin%'`,
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it("partial index exists on ec_orders.orders for pending+paid", async () => {
    const { rows } = await client.query<{ indexname: string; indexdef: string }>(
      `SELECT indexname, indexdef FROM pg_indexes
       WHERE schemaname='ec_orders' AND tablename='orders' AND indexdef ILIKE '%where%status%'`,
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it("idempotency_key on ft_ledger.transactions is UNIQUE", async () => {
    const { rows } = await client.query<{ contype: string }>(
      `SELECT contype FROM pg_constraint
       WHERE conrelid = 'ft_ledger.transactions'::regclass
         AND contype = 'u'
         AND pg_get_constraintdef(oid) ILIKE '%idempotency_key%'`,
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it("intra-scenario cross-schema FK works (sm_content.posts → sm_identity.users)", async () => {
    const { rows } = await client.query<{ confrelid: string }>(
      `SELECT pg_get_constraintdef(c.oid) AS confrelid
       FROM pg_constraint c
       WHERE c.conrelid = 'sm_content.posts'::regclass
         AND c.contype = 'f'
         AND pg_get_constraintdef(c.oid) ILIKE '%sm_identity.users%'`,
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it("four cross-scenario soft refs are declared via pg_description", async () => {
    const { rows } = await client.query<{ description: string }>(
      `SELECT description FROM pg_description WHERE description LIKE 'soft_ref:%'`,
    );
    expect(rows.length).toBe(4);
    const targets = new Set(rows.map((r) => r.description.replace("soft_ref:", "").trim()));
    expect(targets.has("ft_identity.users.id")).toBe(true);
    expect(targets.has("es_accounts.contacts.email")).toBe(true);
    expect(targets.has("ft_ledger.accounts.id")).toBe(true);
    expect(targets.has("sm_identity.users.email")).toBe(true);
  });

  it("re-running the migrator is a no-op", async () => {
    const result = await migrate(client, MIGRATIONS_DIR);
    expect(result.applied).toEqual([]);
    expect(result.skipped.length).toBe(7);
  });
});
