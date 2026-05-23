import { afterAll, beforeAll, describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import request from "supertest";
import { createApp } from "../../src/server/app.js";
import { migrate } from "../../src/server/db/migrate.js";
import { runSeed } from "../../src/server/db/seed/runSeed.js";
import { closePool } from "../../src/server/db/pool.js";
import { closeRedis } from "../../src/server/services/redis.js";

const dbUrl = process.env.ADMIN_DATABASE_URL || process.env.DATABASE_URL || "";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MIGRATIONS_DIR = path.join(repoRoot, "migrations");

describe.skipIf(!dbUrl)("/api/query/{run,explain}", () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    const client = new pg.Client({ connectionString: dbUrl });
    await client.connect();
    await migrate(client, MIGRATIONS_DIR);
    await runSeed(client);
    await client.end();
    app = createApp();
  }, 90_000);

  afterAll(async () => {
    await closePool();
    await closeRedis();
  });

  it("POST /api/query/run: happy path returns rows + elapsedMs", async () => {
    const res = await request(app)
      .post("/api/query/run")
      .send({ scenarioSlug: "social_media", sql: "SELECT COUNT(*)::text AS count FROM posts" });
    expect(res.status).toBe(200);
    expect(res.body.rows.length).toBe(1);
    expect(res.body.columns).toEqual(["count"]);
    expect(res.body.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it("scopes search_path per scenario", async () => {
    const res = await request(app)
      .post("/api/query/run")
      .send({ scenarioSlug: "social_media", sql: "SELECT title FROM posts LIMIT 1" });
    expect(res.status).toBe(200);
    expect(res.body.rows.length).toBe(1);
  });

  it("rejects modifying SQL via validator → 400", async () => {
    const res = await request(app)
      .post("/api/query/run")
      .send({ scenarioSlug: "social_media", sql: "DELETE FROM posts" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("rejected_sql");
  });

  it("rejects unknown scenario → 404", async () => {
    const res = await request(app)
      .post("/api/query/run")
      .send({ scenarioSlug: "not_a_scenario", sql: "SELECT 1" });
    expect(res.status).toBe(404);
  });

  it("statement_timeout fires on pg_sleep", async () => {
    const res = await request(app)
      .post("/api/query/run")
      .send({ scenarioSlug: "social_media", sql: "SELECT pg_sleep(2)" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("timeout");
  }, 10_000);

  it("truncates results past 500 rows with truncated:true", async () => {
    const res = await request(app)
      .post("/api/query/run")
      .send({ scenarioSlug: "social_media", sql: "SELECT * FROM posts" });
    expect(res.status).toBe(200);
    expect(res.body.rowCount).toBe(500);
    expect(res.body.truncated).toBe(true);
  });

  it("oversized SQL body → 400", async () => {
    const big = "SELECT " + "x".repeat(11000);
    const res = await request(app)
      .post("/api/query/run")
      .send({ scenarioSlug: "social_media", sql: big });
    expect(res.status).toBe(400);
  });

  it("POST /api/query/explain returns a JSON plan", async () => {
    const res = await request(app).post("/api/query/explain").send({
      scenarioSlug: "ecommerce",
      sql: "SELECT store_id, COUNT(*) FROM ec_orders.orders GROUP BY store_id ORDER BY 2 DESC LIMIT 10",
    });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.plan)).toBe(true);
    expect(res.body.plan[0]).toHaveProperty("Plan");
  });
});
