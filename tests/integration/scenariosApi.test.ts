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

describe.skipIf(!dbUrl)("/api/scenarios endpoints", () => {
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

  it("GET /api/scenarios returns five scenarios with totals", async () => {
    const res = await request(app).get("/api/scenarios");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(5);
    const slugs = res.body.map((s: { slug: string }) => s.slug).sort();
    expect(slugs).toEqual([
      "ecommerce",
      "enterprise_saas",
      "fintech",
      "infra_startup",
      "social_media",
    ]);
    const social = res.body.find((s: { slug: string }) => s.slug === "social_media");
    expect(social.tableCount).toBeGreaterThan(5);
    expect(social.rowCount).toBeGreaterThan(1000);
  });

  it("GET /api/scenarios/social_media returns schema tree + fks + seed questions", async () => {
    const res = await request(app).get("/api/scenarios/social_media");
    expect(res.status).toBe(200);
    expect(res.body.scenario).toBe("social_media");
    expect(res.body.schemas.length).toBe(4);
    const schemaNames = res.body.schemas.map((s: { name: string }) => s.name).sort();
    expect(schemaNames).toEqual(["sm_communities", "sm_content", "sm_engagement", "sm_identity"]);

    // At least one cross-schema FK + at least one cross-scenario soft ref
    const kinds = new Set(res.body.fks.map((f: { kind: string }) => f.kind));
    expect(kinds.has("cross_schema_same_scenario")).toBe(true);
    expect(kinds.has("cross_scenario_soft")).toBe(true);

    expect(res.body.seedQuestions.length).toBeGreaterThan(0);
  });

  it("GET /api/scenarios/social_media: posts table is present with rowCount", async () => {
    const res = await request(app).get("/api/scenarios/social_media");
    const content = res.body.schemas.find((s: { name: string }) => s.name === "sm_content");
    const posts = content.tables.find((t: { name: string }) => t.name === "posts");
    expect(posts).toBeDefined();
    expect(posts.rowCount).toBeGreaterThan(2000);
    expect(posts.indexes.some((i: { name: string }) => i.name.includes("community"))).toBe(true);
  });

  it("GET /api/scenarios/missing → 404", async () => {
    const res = await request(app).get("/api/scenarios/missing");
    expect(res.status).toBe(404);
  });

  it("GET /api/scenarios/social_media/tables/posts returns paged rows", async () => {
    const res = await request(app).get("/api/scenarios/social_media/tables/posts?limit=10");
    expect(res.status).toBe(200);
    expect(res.body.rows.length).toBe(10);
    expect(res.body.columns).toContain("title");
    expect(res.body.totalRowCount).toBeGreaterThan(100);
  });

  it("rejects unknown table → 404 (no SQL injection vector)", async () => {
    const res = await request(app).get("/api/scenarios/social_media/tables/posts;DROP+TABLE+x");
    expect(res.status).toBe(404);
  });

  it("rejects out-of-range limit", async () => {
    const res = await request(app).get("/api/scenarios/social_media/tables/posts?limit=10000");
    expect(res.status).toBe(400);
  });
});
