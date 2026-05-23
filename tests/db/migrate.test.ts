import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import pg from "pg";
import { migrate } from "../../src/server/db/migrate.js";

// Real Postgres test. Set ADMIN_DATABASE_URL to opt in. CI's pg service +
// docker-compose.local.yml both wire this up; bare clones without docker
// running silently skip via .skipIf.
const dbUrl = process.env.ADMIN_DATABASE_URL || process.env.DATABASE_URL || "";

describe.skipIf(!dbUrl)("migration runner", () => {
  let client: pg.Client;
  let dir: string;

  beforeAll(async () => {
    client = new pg.Client({ connectionString: dbUrl });
    await client.connect();
    // Each suite gets a private schema so it doesn't bleed into other suites
    // or the real app schemas.
    await client.query("DROP SCHEMA IF EXISTS migrate_test CASCADE");
    await client.query("CREATE SCHEMA migrate_test");
    await client.query("SET search_path TO migrate_test, public");
    dir = await mkdtemp(path.join(tmpdir(), "migrate-test-"));
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
    await client.query("DROP SCHEMA IF EXISTS migrate_test CASCADE");
    await client.end();
  });

  it("applies pending migrations in lexicographic order", async () => {
    await writeFile(path.join(dir, "002_b.sql"), "CREATE TABLE b(id INT);");
    await writeFile(path.join(dir, "001_a.sql"), "CREATE TABLE a(id INT);");

    const result = await migrate(client, dir);
    expect(result.applied).toEqual(["001_a.sql", "002_b.sql"]);
    expect(result.skipped).toEqual([]);

    const { rows } = await client.query<{ name: string }>(
      "SELECT name FROM _migrations ORDER BY name",
    );
    expect(rows.map((r) => r.name)).toEqual(["001_a.sql", "002_b.sql"]);
  });

  it("is idempotent on re-run", async () => {
    const result = await migrate(client, dir);
    expect(result.applied).toEqual([]);
    expect(result.skipped).toEqual(["001_a.sql", "002_b.sql"]);
  });

  it("rolls back a failing migration and records nothing", async () => {
    await writeFile(
      path.join(dir, "003_bad.sql"),
      "CREATE TABLE c(id INT); CREATE TABLE a(id INT);",
    );
    await expect(migrate(client, dir)).rejects.toThrow(/003_bad.sql/);

    const { rows: ledger } = await client.query<{ name: string }>(
      "SELECT name FROM _migrations WHERE name='003_bad.sql'",
    );
    expect(ledger).toHaveLength(0);

    const { rows: tableCheck } = await client.query<{ count: string }>(
      "SELECT COUNT(*)::text FROM information_schema.tables WHERE table_schema='migrate_test' AND table_name='c'",
    );
    expect(tableCheck[0]?.count).toBe("0");
  });

  it("handles a missing migrations dir gracefully", async () => {
    const result = await migrate(client, path.join(tmpdir(), "definitely-not-a-dir-" + Date.now()));
    expect(result.applied).toEqual([]);
    expect(result.skipped).toEqual([]);
  });
});
