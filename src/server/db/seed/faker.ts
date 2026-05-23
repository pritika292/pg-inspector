import { faker, type Faker } from "@faker-js/faker";
import pgFormat from "pg-format";
import type { ClientBase } from "pg";

// Deterministic seed so two boots produce byte-identical data. Bump if the
// seeders themselves change in a way we want re-rolled across the fleet.
export const FAKER_SEED = 4242;

export function seededFaker(): Faker {
  faker.seed(FAKER_SEED);
  return faker;
}

// Bulk insert via pg-format's %L (list literal). One round-trip per call,
// regardless of row count. Used for every seeder.
export async function bulkInsert(
  client: ClientBase,
  fqTable: string,
  columns: readonly string[],
  rows: ReadonlyArray<ReadonlyArray<unknown>>,
): Promise<void> {
  if (rows.length === 0) return;
  const cols = columns.map((c) => pgFormat("%I", c)).join(", ");
  const sql = pgFormat(`INSERT INTO ${fqTable} (${cols}) VALUES %L`, rows);
  await client.query(sql);
}

// Tag-based uniquifier for fake emails so seeders generating thousands of
// rows can't collide with themselves on faker's finite-ish vocabulary.
// "+tag" is a real RFC-5321 subaddressing convention so the string still
// looks like an email.
export function uniqueEmail(rng: Faker, tag: string | number): string {
  const base = rng.internet.email().toLowerCase();
  return base.replace("@", `+${tag}@`);
}

// Sample N indices (without replacement, allowing duplicates with high N).
// Skewed = exponent > 1 favors low-index items (top-K hot pattern).
export function pickN(rng: Faker, total: number, n: number, opts?: { skew?: number }): number[] {
  const skew = opts?.skew ?? 1;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const u = rng.number.float({ min: 0, max: 1 });
    const idx = Math.floor(Math.pow(u, skew) * total);
    out.push(Math.min(idx, total - 1));
  }
  return out;
}
