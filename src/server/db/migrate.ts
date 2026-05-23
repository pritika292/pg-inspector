import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";
import { config } from "../config.js";

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../migrations",
);

export interface MigrateResult {
  applied: string[];
  skipped: string[];
}

// Applies any .sql files in `dir` that haven't been applied yet. Tracked in
// _migrations(name, applied_at). Each migration runs in its own transaction;
// a failure rolls that migration back and aborts the run with the offending
// filename. Idempotent across re-invocations.
export async function migrate(
  client: pg.ClientBase,
  dir: string = MIGRATIONS_DIR,
): Promise<MigrateResult> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name        TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  if (!existsSync(dir)) {
    return { applied: [], skipped: [] };
  }

  const entries = await readdir(dir);
  const files = entries.filter((f) => f.endsWith(".sql")).sort();

  const { rows } = await client.query<{ name: string }>("SELECT name FROM _migrations");
  const appliedSet = new Set(rows.map((r) => r.name));

  const result: MigrateResult = { applied: [], skipped: [] };

  for (const file of files) {
    if (appliedSet.has(file)) {
      result.skipped.push(file);
      continue;
    }
    const sql = await readFile(path.join(dir, file), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO _migrations(name) VALUES($1)", [file]);
      await client.query("COMMIT");
      result.applied.push(file);
    } catch (err) {
      await client.query("ROLLBACK");
      throw new Error(`Migration ${file} failed: ${(err as Error).message}`, { cause: err });
    }
  }

  return result;
}

async function main(): Promise<void> {
  const client = new pg.Client({ connectionString: config.ADMIN_DATABASE_URL });
  await client.connect();
  try {
    const { applied, skipped } = await migrate(client);
    if (applied.length === 0) {
      console.log(`No migrations to apply (${skipped.length} already applied).`);
    } else {
      console.log(`Applied ${applied.length} migration(s):`);
      for (const f of applied) console.log(`  - ${f}`);
    }
  } finally {
    await client.end();
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
