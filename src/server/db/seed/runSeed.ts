import type { ClientBase } from "pg";
import { seededFaker } from "./faker.js";
import { seedFintech } from "./fintech.js";
import { seedSocialMedia } from "./social_media.js";
import { seedEnterpriseSaas } from "./enterprise_saas.js";
import { seedInfraStartup } from "./infra_startup.js";
import { seedEcommerce } from "./ecommerce.js";

// Bump when seeders change in a way that should re-roll the fleet's data.
// runSeed checks _seed_marker.version and truncates+refills when out of date.
export const SEED_VERSION = 1;

const ALL_TABLES = [
  // Reverse-dependency order so TRUNCATE ... CASCADE works cleanly.
  "sm_engagement.votes",
  "sm_content.comments",
  "sm_content.posts",
  "sm_communities.subscriptions",
  "sm_communities.communities",
  "sm_identity.users",
  "es_tasks.tasks",
  "es_pipeline.activities",
  "es_pipeline.opportunities",
  "es_accounts.account_contacts",
  "es_accounts.contacts",
  "es_accounts.accounts",
  "es_identity.users",
  "infra_alerting.incidents",
  "infra_alerting.alerts",
  "infra_metrics.metrics_minutely",
  "infra_inventory.dashboards",
  "infra_inventory.services",
  "infra_identity.users",
  "ec_payments.payments",
  "ec_orders.order_items",
  "ec_orders.orders",
  "ec_customers.customers",
  "ec_catalog.products",
  "ec_catalog.stores",
  "ft_webhooks.webhooks_log",
  "ft_disputes.disputes",
  "ft_ledger.transactions",
  "ft_ledger.accounts",
  "ft_merchants.merchants",
  "ft_identity.users",
];

export interface SeedResult {
  ran: boolean;
  reason: string;
  durationMs: number;
}

export async function runSeed(client: ClientBase, opts?: { force?: boolean }): Promise<SeedResult> {
  const t0 = Date.now();

  const { rows } = await client.query<{ version: number }>(
    "SELECT version FROM _seed_marker ORDER BY version DESC LIMIT 1",
  );
  const current = rows[0]?.version ?? -1;

  if (!opts?.force && current >= SEED_VERSION) {
    return { ran: false, reason: `already at version ${current}`, durationMs: Date.now() - t0 };
  }

  // Truncate everything (CASCADE handles FKs). RESTART IDENTITY so seeders
  // can rely on starting IDs at 1.
  await client.query(`TRUNCATE ${ALL_TABLES.join(", ")} RESTART IDENTITY CASCADE`);

  const rng = seededFaker();
  await seedFintech(client, rng);

  // Pull the cross-scenario ID lists the downstream seeders need to populate
  // soft refs against. These are intentionally read AFTER fintech runs so
  // they reflect the actual IDENTITY-assigned IDs.
  const { rows: ftUsers } = await client.query<{ id: number }>("SELECT id FROM ft_identity.users");
  const ftUserIds = ftUsers.map((r) => r.id);
  const { rows: ftAccts } = await client.query<{ id: number }>("SELECT id FROM ft_ledger.accounts");
  const ftAccountIds = ftAccts.map((r) => r.id);

  await seedSocialMedia(client, rng, ftAccountIds);

  const { rows: smUsers } = await client.query<{ email: string }>(
    "SELECT email FROM sm_identity.users",
  );
  const smUserEmails = smUsers.map((r) => r.email);

  await seedEnterpriseSaas(client, rng, smUserEmails);

  const { rows: esContacts } = await client.query<{ email: string }>(
    "SELECT email FROM es_accounts.contacts",
  );
  const esContactEmails = esContacts.map((r) => r.email);

  await seedInfraStartup(client, rng, esContactEmails);
  await seedEcommerce(client, rng, ftUserIds);

  // ANALYZE so pg_stat_user_tables.n_live_tup is populated immediately.
  // Without it, the /api/scenarios endpoint reports rowCount=0 until
  // autovacuum gets around to it.
  await client.query("ANALYZE");

  await client.query("DELETE FROM _seed_marker");
  await client.query("INSERT INTO _seed_marker(version) VALUES($1)", [SEED_VERSION]);

  return {
    ran: true,
    reason: `bootstrapped at version ${SEED_VERSION}`,
    durationMs: Date.now() - t0,
  };
}
