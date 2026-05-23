import type { ClientBase } from "pg";
import type { Faker } from "@faker-js/faker";
import { bulkInsert, uniqueEmail } from "./faker.js";

const N_USERS = 100;
const N_SERVICES = 200;
const N_DASHBOARDS = 50;
const TS_STEPS = 72; // last 72 minutes
const N_ALERTS = 800;
const N_INCIDENTS = 100;

type Tier = "tier1" | "tier2" | "tier3";
const TEAMS = ["api", "data", "ml", "infra", "growth", "billing", "search", "media"];
const SEVERITIES = ["low", "med", "high", "crit"] as const;
const INCIDENT_STATUSES = ["open", "ack", "resolved"] as const;

function makeSlug(name: string, n: number): string {
  return `${name}-${n}`;
}

// Tier-aware base latencies (ms).
const TIER_BASE: Record<Tier, { p50: number; p95: number; p99: number }> = {
  tier1: { p50: 20, p95: 80, p99: 150 },
  tier2: { p50: 50, p95: 200, p99: 500 },
  tier3: { p50: 100, p95: 600, p99: 2000 },
};

export async function seedInfraStartup(
  client: ClientBase,
  rng: Faker,
  esContactEmails: string[],
): Promise<void> {
  // infra_identity.users — 30% have a soft ref
  const userRows = Array.from({ length: N_USERS }, (_, i) => {
    const externalEmail =
      rng.number.float({ min: 0, max: 1 }) < 0.3 && esContactEmails.length > 0
        ? (esContactEmails[rng.number.int({ min: 0, max: esContactEmails.length - 1 })] ?? null)
        : null;
    return [
      uniqueEmail(rng, `infra${i}`),
      rng.person.fullName(),
      rng.helpers.arrayElement(["sre", "swe", "manager", "oncall"]),
      rng.date.past({ years: 3 }),
      externalEmail,
    ];
  });
  await bulkInsert(
    client,
    "infra_identity.users",
    ["email", "full_name", "role", "created_at", "external_contact_email"],
    userRows,
  );

  // infra_inventory.services
  const serviceTiers: Tier[] = [];
  const serviceRows = Array.from({ length: N_SERVICES }, (_, i) => {
    const tier: Tier = rng.helpers.weightedArrayElement([
      { weight: 20, value: "tier1" },
      { weight: 50, value: "tier2" },
      { weight: 30, value: "tier3" },
    ]);
    serviceTiers.push(tier);
    const team = rng.helpers.arrayElement(TEAMS);
    return [
      makeSlug(team, i),
      `${team}-${rng.commerce.product().toLowerCase()}`,
      tier,
      team,
      rng.date.past({ years: 3 }),
    ];
  });
  await bulkInsert(
    client,
    "infra_inventory.services",
    ["slug", "name", "tier", "team", "created_at"],
    serviceRows,
  );

  // infra_inventory.dashboards
  const dashRows = Array.from({ length: N_DASHBOARDS }, () => [
    `${rng.helpers.arrayElement(["api", "infra", "growth", "money"])} - ${rng.lorem.words({ min: 2, max: 4 })}`,
    rng.number.int({ min: 1, max: N_USERS }),
    JSON.stringify([{ q: "rate(requests_total[5m])" }, { q: "latency_p99{tier='tier1'}" }]),
    rng.date.past({ years: 2 }),
  ]);
  await bulkInsert(
    client,
    "infra_inventory.dashboards",
    ["name", "owner_user_id", "queries_json", "created_at"],
    dashRows,
  );

  // infra_metrics.metrics_minutely — 200 services × 72 ts steps = 14,400 rows
  const metricsRows: unknown[][] = [];
  const now = Date.now();
  for (let svcIdx = 0; svcIdx < N_SERVICES; svcIdx++) {
    const tier = serviceTiers[svcIdx];
    if (!tier) continue;
    const base = TIER_BASE[tier];
    for (let step = 0; step < TS_STEPS; step++) {
      const noise = (mult: number) => mult * (0.7 + rng.number.float({ min: 0, max: 1 }) * 0.6);
      const ts = new Date(now - step * 60_000);
      metricsRows.push([
        svcIdx + 1,
        ts,
        base.p50 * noise(1),
        base.p95 * noise(1),
        base.p99 * noise(1),
        Math.max(0, rng.number.float({ min: 0, max: 0.05 })),
        rng.number.int({ min: 100, max: 50_000 }),
      ]);
    }
  }
  await bulkInsert(
    client,
    "infra_metrics.metrics_minutely",
    [
      "service_id",
      "ts",
      "latency_p50_ms",
      "latency_p95_ms",
      "latency_p99_ms",
      "error_rate",
      "request_count",
    ],
    metricsRows,
  );

  // infra_alerting.alerts
  const alertRows = Array.from({ length: N_ALERTS }, () => [
    rng.number.int({ min: 1, max: N_SERVICES }),
    `${rng.helpers.arrayElement(["high latency", "error spike", "saturation", "cert expiring"])}`,
    rng.helpers.weightedArrayElement([
      { weight: 50, value: SEVERITIES[0] },
      { weight: 30, value: SEVERITIES[1] },
      { weight: 15, value: SEVERITIES[2] },
      { weight: 5, value: SEVERITIES[3] },
    ]),
    `p99 > ${rng.number.int({ min: 100, max: 2000 })}ms FOR ${rng.number.int({ min: 5, max: 60 })}m`,
    rng.date.past({ years: 1 }),
  ]);
  await bulkInsert(
    client,
    "infra_alerting.alerts",
    ["service_id", "name", "severity", "condition_expr", "created_at"],
    alertRows,
  );

  // infra_alerting.incidents — 10 remain open
  const incidentRows = Array.from({ length: N_INCIDENTS }, (_, i) => {
    const opened = rng.date.recent({ days: 30 });
    const isOpen = i < 10;
    const status = isOpen
      ? rng.helpers.arrayElement([INCIDENT_STATUSES[0], INCIDENT_STATUSES[1]])
      : INCIDENT_STATUSES[2];
    const closed =
      status === "resolved" ? rng.date.between({ from: opened, to: new Date() }) : null;
    const ack =
      isOpen && rng.number.float({ min: 0, max: 1 }) < 0.4
        ? rng.number.int({ min: 1, max: N_USERS })
        : null;
    return [rng.number.int({ min: 1, max: N_ALERTS }), opened, closed, ack, status];
  });
  await bulkInsert(
    client,
    "infra_alerting.incidents",
    ["alert_id", "opened_at", "closed_at", "acknowledged_by_user_id", "status"],
    incidentRows,
  );
}
