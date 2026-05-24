import { afterAll, beforeAll, describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import request from "supertest";
import { createApp } from "../../src/server/app.js";
import { migrate } from "../../src/server/db/migrate.js";
import { runSeed } from "../../src/server/db/seed/runSeed.js";
import { closePool } from "../../src/server/db/pool.js";
import { closeRedis, getRedis } from "../../src/server/services/redis.js";
import { SCENARIOS } from "../../src/server/services/scenarios.js";

// End-to-end test: for every scenario, walk every seed question and verify
// /api/query/run + /api/query/explain both succeed. This is the test that
// would have caught the trailing-semicolon bug if any seed question had a
// semicolon, and it catches any future seed question that gets out of sync
// with the actual schema.

const dbUrl = process.env.ADMIN_DATABASE_URL || process.env.DATABASE_URL || "";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe.skipIf(!dbUrl)("seed-question smoke tests against live DB", () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    const client = new pg.Client({ connectionString: dbUrl });
    await client.connect();
    await migrate(client, path.join(repoRoot, "migrations"));
    await runSeed(client, { force: true });
    await client.end();
    try {
      await getRedis().flushdb();
    } catch {
      /* no redis, fine */
    }
    app = createApp();
  }, 120_000);

  afterAll(async () => {
    await closePool();
    await closeRedis();
  });

  for (const scenario of SCENARIOS) {
    describe(`scenario: ${scenario.slug}`, () => {
      for (const q of scenario.seedQuestions) {
        it(`run: ${q.label}`, async () => {
          const res = await request(app)
            .post("/api/query/run")
            .send({ scenarioSlug: scenario.slug, sql: q.sql });
          expect(res.status, `body: ${res.text}`).toBe(200);
          expect(Array.isArray(res.body.rows)).toBe(true);
          expect(Array.isArray(res.body.columns)).toBe(true);
          expect(typeof res.body.elapsedMs).toBe("number");
        });

        it(`explain: ${q.label}`, async () => {
          const res = await request(app)
            .post("/api/query/explain")
            .send({ scenarioSlug: scenario.slug, sql: q.sql });
          expect(res.status, `body: ${res.text}`).toBe(200);
          expect(Array.isArray(res.body.plan)).toBe(true);
          expect(res.body.plan[0]).toHaveProperty("Plan");
        });
      }

      it("user-style trailing-semicolon variant works", async () => {
        const q = scenario.seedQuestions[0];
        expect(q).toBeDefined();
        const sql = q!.sql.trim() + ";";
        const res = await request(app)
          .post("/api/query/run")
          .send({ scenarioSlug: scenario.slug, sql });
        expect(res.status, `body: ${res.text}`).toBe(200);
      });

      it("user-style trailing-line-comment variant works", async () => {
        const q = scenario.seedQuestions[0];
        expect(q).toBeDefined();
        const sql = q!.sql.trim() + "\n-- the answer";
        const res = await request(app)
          .post("/api/query/run")
          .send({ scenarioSlug: scenario.slug, sql });
        expect(res.status, `body: ${res.text}`).toBe(200);
      });
    });
  }
});
