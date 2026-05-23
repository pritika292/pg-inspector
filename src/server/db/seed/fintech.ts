import type { ClientBase } from "pg";
import type { Faker } from "@faker-js/faker";
import { bulkInsert, pickN, uniqueEmail } from "./faker.js";

const N_USERS = 4000;
const N_MERCHANTS = 300;
const N_ACCOUNTS = 2000;
const N_TXN_PAIRS = 4000; // 8000 transaction rows total
const N_DISPUTES = 200;
const N_WEBHOOKS = 1500;

const CURRENCIES = ["USD", "EUR", "GBP", "INR"] as const;
const ACCOUNT_KINDS = ["checking", "savings", "external"] as const;
const TXN_STATUSES = ["pending", "posted", "reversed"] as const;
const DISPUTE_REASONS = ["fraud", "duplicate", "unrecognized", "service_not_received"] as const;
const MCC_CODES = ["5411", "5812", "5732", "7372", "4900", "7011", "6011", "5942"];
const COUNTRIES = ["US", "GB", "IN", "DE", "FR", "JP", "AU"];

export async function seedFintech(client: ClientBase, rng: Faker): Promise<void> {
  // ft_identity.users
  const userRows = Array.from({ length: N_USERS }, (_, i) => [
    uniqueEmail(rng, `ft${i}`),
    rng.person.fullName(),
    rng.date.past({ years: 5 }),
    rng.helpers.weightedArrayElement([
      { weight: 90, value: "verified" },
      { weight: 8, value: "pending" },
      { weight: 2, value: "rejected" },
    ]),
  ]);
  await bulkInsert(
    client,
    "ft_identity.users",
    ["email", "full_name", "created_at", "kyc_status"],
    userRows,
  );

  // ft_merchants.merchants
  const merchantRows = Array.from({ length: N_MERCHANTS }, () => [
    rng.company.name(),
    rng.helpers.arrayElement(MCC_CODES),
    rng.helpers.arrayElement(COUNTRIES),
    rng.date.past({ years: 3 }),
  ]);
  await bulkInsert(
    client,
    "ft_merchants.merchants",
    ["name", "mcc_code", "country", "created_at"],
    merchantRows,
  );

  // ft_ledger.accounts — pin user_id distribution so most users have 1-2
  // accounts. Indexes 1..N_USERS map directly to the IDENTITY sequence start.
  const accountUserIdxs = pickN(rng, N_USERS, N_ACCOUNTS, { skew: 1.2 });
  const accountRows = accountUserIdxs.map((u) => [
    u + 1,
    rng.helpers.arrayElement(ACCOUNT_KINDS),
    rng.number.int({ min: 0, max: 1_000_000_00 }),
    rng.helpers.arrayElement(CURRENCIES),
    rng.date.past({ years: 4 }),
  ]);
  await bulkInsert(
    client,
    "ft_ledger.accounts",
    ["user_id", "kind", "balance_cents", "currency", "created_at"],
    accountRows,
  );

  // ft_ledger.transactions — paired: each pair has one debit + one credit
  // with the SAME amount, opposite from/to, so double-entry balances.
  const txnRows: unknown[][] = [];
  for (let i = 0; i < N_TXN_PAIRS; i++) {
    const fromIdx = rng.number.int({ min: 1, max: N_ACCOUNTS });
    let toIdx = rng.number.int({ min: 1, max: N_ACCOUNTS });
    if (toIdx === fromIdx) toIdx = (toIdx % N_ACCOUNTS) + 1;
    const amount = rng.number.int({ min: 10, max: 50_000_00 });
    const currency = rng.helpers.arrayElement(CURRENCIES);
    const status = rng.helpers.arrayElement(TXN_STATUSES);
    const createdAt = rng.date.recent({ days: 30 });
    const postedAt = status === "posted" ? createdAt : null;
    const merchantId =
      rng.number.float({ min: 0, max: 1 }) < 0.6
        ? rng.number.int({ min: 1, max: N_MERCHANTS })
        : null;
    // Two rows per pair: debit (from->to) and credit (to->from) so the
    // ledger balances. Distinct idempotency keys.
    txnRows.push([
      fromIdx,
      toIdx,
      merchantId,
      amount,
      currency,
      status,
      `txn_${i}_d_${rng.string.uuid()}`,
      createdAt,
      postedAt,
    ]);
    txnRows.push([
      toIdx,
      fromIdx,
      merchantId,
      amount,
      currency,
      status,
      `txn_${i}_c_${rng.string.uuid()}`,
      createdAt,
      postedAt,
    ]);
  }
  await bulkInsert(
    client,
    "ft_ledger.transactions",
    [
      "from_account_id",
      "to_account_id",
      "merchant_id",
      "amount_cents",
      "currency",
      "status",
      "idempotency_key",
      "created_at",
      "posted_at",
    ],
    txnRows,
  );

  // ft_disputes.disputes — link to random transactions. Most resolved.
  const totalTxns = N_TXN_PAIRS * 2;
  const disputeRows = Array.from({ length: N_DISPUTES }, () => {
    const status = rng.helpers.weightedArrayElement([
      { weight: 10, value: "open" },
      { weight: 60, value: "won" },
      { weight: 30, value: "lost" },
    ]) as "open" | "won" | "lost";
    const opened = rng.date.recent({ days: 60 });
    const resolved = status === "open" ? null : rng.date.between({ from: opened, to: new Date() });
    return [
      rng.number.int({ min: 1, max: totalTxns }),
      opened,
      resolved,
      rng.helpers.arrayElement(DISPUTE_REASONS),
      status,
    ];
  });
  await bulkInsert(
    client,
    "ft_disputes.disputes",
    ["transaction_id", "opened_at", "resolved_at", "reason", "status"],
    disputeRows,
  );

  // ft_webhooks.webhooks_log
  const webhookRows = Array.from({ length: N_WEBHOOKS }, (_, i) => [
    rng.helpers.arrayElement([
      "charge.succeeded",
      "charge.failed",
      "dispute.created",
      "payout.paid",
    ]),
    rng.number.float({ min: 0, max: 1 }) < 0.8
      ? rng.number.int({ min: 1, max: N_MERCHANTS })
      : null,
    JSON.stringify({ amount: rng.number.int({ min: 10, max: 1000_00 }), ref: rng.string.uuid() }),
    `wh_${i}_${rng.string.uuid()}`,
    rng.date.recent({ days: 7 }),
    rng.number.float({ min: 0, max: 1 }) < 0.95 ? rng.date.recent({ days: 7 }) : null,
  ]);
  await bulkInsert(
    client,
    "ft_webhooks.webhooks_log",
    ["event_type", "merchant_id", "payload", "idempotency_key", "received_at", "processed_at"],
    webhookRows,
  );
}
