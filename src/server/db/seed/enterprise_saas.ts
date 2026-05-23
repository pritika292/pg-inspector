import type { ClientBase } from "pg";
import type { Faker } from "@faker-js/faker";
import { bulkInsert, pickN, uniqueEmail } from "./faker.js";

const N_USERS = 200;
const N_ACCOUNTS = 500;
const N_CONTACTS = 2000;
const N_OPPORTUNITIES = 1500;
const N_ACTIVITIES = 8000;
const N_TASKS = 1000;

const INDUSTRIES = [
  "fintech",
  "biotech",
  "saas",
  "logistics",
  "retail",
  "media",
  "energy",
  "edtech",
];
const STAGES = [
  "prospecting",
  "qualification",
  "proposal",
  "negotiation",
  "closed_won",
  "closed_lost",
] as const;
const ACT_TYPES = ["call", "email", "meeting", "note"] as const;
const TASK_STATUSES = ["open", "in_progress", "done", "cancelled"] as const;
const ROLES = ["AE", "SDR", "CSM", "SE", "AM"];
const CONTACT_ROLES = ["primary", "billing", "technical", "decision_maker"];

export async function seedEnterpriseSaas(
  client: ClientBase,
  rng: Faker,
  smUserEmails: string[],
): Promise<void> {
  // es_identity.users
  const userRows = Array.from({ length: N_USERS }, (_, i) => [
    uniqueEmail(rng, `es${i}`),
    rng.person.fullName(),
    rng.helpers.arrayElement(ROLES),
    rng.date.past({ years: 6 }),
  ]);
  await bulkInsert(
    client,
    "es_identity.users",
    ["email", "full_name", "role", "created_at"],
    userRows,
  );

  // es_accounts.accounts — ~5% have parent_account_id (2-3 level hierarchy)
  const accountRows: unknown[][] = [];
  for (let i = 1; i <= N_ACCOUNTS; i++) {
    const hasParent = i > 50 && rng.number.float({ min: 0, max: 1 }) < 0.05;
    const parentId = hasParent ? rng.number.int({ min: 1, max: i - 1 }) : null;
    accountRows.push([
      rng.company.name(),
      rng.helpers.arrayElement(INDUSTRIES),
      rng.number.int({ min: 10, max: 50_000 }),
      parentId,
      rng.date.past({ years: 8 }),
    ]);
  }
  await bulkInsert(
    client,
    "es_accounts.accounts",
    ["name", "industry", "employee_count", "parent_account_id", "created_at"],
    accountRows,
  );

  // es_accounts.contacts — emails are UNIQUE globally
  const contactRows: unknown[][] = Array.from({ length: N_CONTACTS }, (_, i) => [
    rng.number.int({ min: 1, max: N_ACCOUNTS }),
    rng.person.fullName(),
    uniqueEmail(rng, `c${i}`),
    rng.person.jobTitle(),
    rng.date.past({ years: 5 }),
  ]);
  await bulkInsert(
    client,
    "es_accounts.contacts",
    ["account_id", "full_name", "email", "title", "created_at"],
    contactRows,
  );

  // es_accounts.account_contacts — junction (composite PK requires uniqueness)
  const junctionSeen = new Set<string>();
  const junctionRows: unknown[][] = [];
  const target = N_CONTACTS;
  while (junctionRows.length < target) {
    const a = rng.number.int({ min: 1, max: N_ACCOUNTS });
    const c = rng.number.int({ min: 1, max: N_CONTACTS });
    const k = `${a}-${c}`;
    if (junctionSeen.has(k)) continue;
    junctionSeen.add(k);
    junctionRows.push([a, c, rng.helpers.arrayElement(CONTACT_ROLES)]);
  }
  await bulkInsert(
    client,
    "es_accounts.account_contacts",
    ["account_id", "contact_id", "role"],
    junctionRows,
  );

  // es_pipeline.opportunities — realistic stage distribution
  const oppoRows = Array.from({ length: N_OPPORTUNITIES }, () => [
    rng.number.int({ min: 1, max: N_ACCOUNTS }),
    rng.number.int({ min: 1, max: N_USERS }),
    `${rng.company.buzzVerb()} - ${rng.company.buzzNoun()}`,
    rng.helpers.weightedArrayElement([
      { weight: 35, value: STAGES[0] },
      { weight: 25, value: STAGES[1] },
      { weight: 15, value: STAGES[2] },
      { weight: 10, value: STAGES[3] },
      { weight: 10, value: STAGES[4] },
      { weight: 5, value: STAGES[5] },
    ]),
    rng.number.int({ min: 5_000, max: 1_500_000 }),
    rng.date.soon({ days: 365 }),
    rng.date.past({ years: 2 }),
  ]);
  await bulkInsert(
    client,
    "es_pipeline.opportunities",
    ["account_id", "owner_user_id", "name", "stage", "amount_usd", "close_date", "created_at"],
    oppoRows,
  );

  // es_pipeline.activities — skewed to large accounts; 20% have soft ref
  const actAccountIdxs = pickN(rng, N_ACCOUNTS, N_ACTIVITIES, { skew: 2.5 });
  const activityRows = actAccountIdxs.map((aIdx) => {
    const accountId = aIdx + 1;
    const contactId =
      rng.number.float({ min: 0, max: 1 }) < 0.7
        ? rng.number.int({ min: 1, max: N_CONTACTS })
        : null;
    const oppoId =
      rng.number.float({ min: 0, max: 1 }) < 0.4
        ? rng.number.int({ min: 1, max: N_OPPORTUNITIES })
        : null;
    const externalEmail =
      rng.number.float({ min: 0, max: 1 }) < 0.2 && smUserEmails.length > 0
        ? (smUserEmails[rng.number.int({ min: 0, max: smUserEmails.length - 1 })] ?? null)
        : null;
    return [
      accountId,
      contactId,
      oppoId,
      rng.number.int({ min: 1, max: N_USERS }),
      rng.helpers.arrayElement(ACT_TYPES),
      rng.lorem.sentences({ min: 1, max: 3 }),
      rng.date.recent({ days: 180 }),
      externalEmail,
    ];
  });
  await bulkInsert(
    client,
    "es_pipeline.activities",
    [
      "account_id",
      "contact_id",
      "opportunity_id",
      "actor_user_id",
      "type",
      "body",
      "created_at",
      "actor_external_email",
    ],
    activityRows,
  );

  // es_tasks.tasks
  const taskRows = Array.from({ length: N_TASKS }, () => [
    rng.number.int({ min: 1, max: N_USERS }),
    rng.number.float({ min: 0, max: 1 }) < 0.7 ? rng.number.int({ min: 1, max: N_ACCOUNTS }) : null,
    rng.date.soon({ days: 60 }),
    rng.helpers.arrayElement(TASK_STATUSES),
    rng.lorem.sentence({ min: 3, max: 10 }),
    rng.date.recent({ days: 90 }),
  ]);
  await bulkInsert(
    client,
    "es_tasks.tasks",
    ["owner_user_id", "account_id", "due_date", "status", "title", "created_at"],
    taskRows,
  );
}
