import { afterAll, beforeAll, describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  normalizeUserSql,
  runReadOnly,
  runExplain,
  SafeRunnerError,
} from "../../src/server/services/safeRunner.js";
import { migrate } from "../../src/server/db/migrate.js";
import { runSeed } from "../../src/server/db/seed/runSeed.js";
import { closePool } from "../../src/server/db/pool.js";

const dbUrl = process.env.ADMIN_DATABASE_URL || process.env.DATABASE_URL || "";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("normalizeUserSql", () => {
  it("removes a trailing semicolon", () => {
    expect(normalizeUserSql("SELECT 1;")).toBe("SELECT 1");
  });

  it("removes multiple trailing semicolons (pasted accidents)", () => {
    expect(normalizeUserSql("SELECT 1;;")).toBe("SELECT 1");
    expect(normalizeUserSql("SELECT 1; ; ;")).toBe("SELECT 1");
  });

  it("removes a trailing semicolon with whitespace after it", () => {
    expect(normalizeUserSql("SELECT 1;   \n  ")).toBe("SELECT 1");
  });

  it("leaves SQL without a trailing semicolon alone", () => {
    expect(normalizeUserSql("SELECT 1")).toBe("SELECT 1");
  });

  it("strips a trailing line comment", () => {
    expect(normalizeUserSql("SELECT 1 -- ok")).toBe("SELECT 1");
  });

  it("strips a trailing line comment that follows a semicolon", () => {
    expect(normalizeUserSql("SELECT 1; -- ok")).toBe("SELECT 1");
  });

  it("strips a trailing line comment on its own line", () => {
    expect(normalizeUserSql("SELECT 1\n-- trailing")).toBe("SELECT 1");
  });

  it("does not strip internal semicolons inside string literals", () => {
    // Tail is `'` so the regex shouldn't trim anything. The validator
    // rejects multi-statement separately.
    expect(normalizeUserSql("SELECT ';'")).toBe("SELECT ';'");
  });

  it("does not strip internal `--` inside string literals", () => {
    expect(normalizeUserSql("SELECT '-- not a comment'")).toBe("SELECT '-- not a comment'");
  });

  it("trims trailing whitespace even without a semicolon", () => {
    expect(normalizeUserSql("SELECT 1\n\n\n")).toBe("SELECT 1");
  });

  it("leaves an empty / whitespace-only input as empty", () => {
    expect(normalizeUserSql("   \n  ")).toBe("");
    expect(normalizeUserSql("")).toBe("");
  });
});

describe.skipIf(!dbUrl)("safeRunner against real Postgres", () => {
  beforeAll(async () => {
    const client = new pg.Client({ connectionString: dbUrl });
    await client.connect();
    await migrate(client, path.join(repoRoot, "migrations"));
    await runSeed(client, { force: true });
    await client.end();
  }, 90_000);

  afterAll(async () => {
    await closePool();
  });

  it("runs a basic SELECT and returns rows", async () => {
    const r = await runReadOnly("SELECT 1::int AS one", "social_media");
    expect(r.rows).toEqual([{ one: 1 }]);
    expect(r.columns).toEqual(["one"]);
    expect(r.truncated).toBe(false);
  });

  it("runs the user's reported bug: trailing semicolon SELECT with JOIN + ORDER BY", async () => {
    const sql =
      "SELECT a.name AS alert, i.opened_at, i.status " +
      "FROM infra_alerting.incidents i " +
      "JOIN infra_alerting.alerts a ON a.id = i.alert_id " +
      "WHERE i.status IN ('open','ack') " +
      "ORDER BY i.opened_at;";
    const r = await runReadOnly(sql, "infra_startup");
    expect(r.columns).toEqual(["alert", "opened_at", "status"]);
    expect(r.rowCount).toBeGreaterThan(0);
  });

  it("tolerates a trailing single-line comment", async () => {
    const r = await runReadOnly("SELECT 42 AS answer -- the answer", "social_media");
    expect(r.rows).toEqual([{ answer: 42 }]);
  });

  it("tolerates a trailing single-line comment followed by a semicolon", async () => {
    const r = await runReadOnly("SELECT 42 AS answer; -- nope", "social_media");
    expect(r.rows).toEqual([{ answer: 42 }]);
  });

  it("tolerates multi-line SQL ending with a semicolon", async () => {
    const sql = `
      SELECT u.handle, COUNT(p.id) AS posts
      FROM sm_identity.users u
      JOIN sm_content.posts p ON p.author_id = u.id
      GROUP BY u.handle
      ORDER BY posts DESC
      LIMIT 5;
    `;
    const r = await runReadOnly(sql, "social_media");
    expect(r.columns).toEqual(["handle", "posts"]);
    expect(r.rowCount).toBeGreaterThan(0);
  });

  it("runs WITH ... SELECT (CTE) including with a trailing semicolon", async () => {
    const sql = `
      WITH hot AS (
        SELECT * FROM sm_content.posts WHERE score > 100
      )
      SELECT COUNT(*)::int AS n FROM hot;
    `;
    const r = await runReadOnly(sql, "social_media");
    expect(r.rows[0]?.n).toBeGreaterThan(0);
  });

  it("respects the scenario's search_path so unqualified table names resolve", async () => {
    // `posts` resolves to sm_content.posts only when search_path is set
    const r = await runReadOnly("SELECT COUNT(*)::int AS n FROM posts", "social_media");
    expect(typeof r.rows[0]?.n).toBe("number");
    expect(r.rows[0]?.n).toBeGreaterThan(0);
  });

  it("scopes search_path: ec_orders.orders unreachable as 'orders' in social_media context", async () => {
    await expect(runReadOnly("SELECT COUNT(*)::int FROM orders", "social_media")).rejects.toThrow(
      SafeRunnerError,
    );
  });

  it("truncates results past the hard limit and reports truncated:true", async () => {
    const r = await runReadOnly("SELECT * FROM sm_content.posts", "social_media");
    expect(r.rowCount).toBe(500);
    expect(r.truncated).toBe(true);
  });

  it("statement_timeout fires on pg_sleep beyond the budget", async () => {
    const t0 = Date.now();
    await expect(runReadOnly("SELECT pg_sleep(3)", "social_media")).rejects.toMatchObject({
      code: "TIMEOUT",
    });
    expect(Date.now() - t0).toBeLessThan(2500);
  }, 6_000);

  it("returns PERMISSION_DENIED if a modifying statement somehow reaches the runner", async () => {
    // safeRunner trusts the validator; calling it directly with INSERT is the
    // worst-case path. The role's grants should reject this.
    await expect(
      runReadOnly(
        "INSERT INTO sm_identity.users(handle, display_name, email) VALUES('x','x','x@y')",
        "social_media",
      ),
    ).rejects.toMatchObject({ code: expect.stringMatching(/PERMISSION_DENIED|BAD_SQL/) });
  });

  it("rejects unknown scenario slug", async () => {
    await expect(runReadOnly("SELECT 1", "not_a_scenario")).rejects.toMatchObject({
      code: "UNKNOWN_SCENARIO",
    });
  });

  it("runExplain returns a valid JSON plan array", async () => {
    const plan = await runExplain(
      "SELECT community_id, COUNT(*) FROM sm_content.posts GROUP BY community_id",
      "social_media",
    );
    expect(Array.isArray(plan)).toBe(true);
    expect((plan as unknown[])[0]).toHaveProperty("Plan");
  });

  it("runExplain tolerates a trailing semicolon", async () => {
    const plan = await runExplain("SELECT 1;", "social_media");
    expect(Array.isArray(plan)).toBe(true);
  });

  it("runExplain tolerates a trailing line comment", async () => {
    const plan = await runExplain("SELECT 1 -- ok", "social_media");
    expect(Array.isArray(plan)).toBe(true);
  });
});
