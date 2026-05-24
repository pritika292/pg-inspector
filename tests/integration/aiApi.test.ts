import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import request from "supertest";
import { createApp } from "../../src/server/app.js";
import { migrate } from "../../src/server/db/migrate.js";
import { runSeed } from "../../src/server/db/seed/runSeed.js";
import { closePool } from "../../src/server/db/pool.js";
import { closeRedis } from "../../src/server/services/redis.js";
import {
  type AiClient,
  BudgetExceededError,
  setAiClientForTests,
} from "../../src/server/services/aiClient.js";

const dbUrl = process.env.ADMIN_DATABASE_URL || process.env.DATABASE_URL || "";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MIGRATIONS_DIR = path.join(repoRoot, "migrations");

// Build a fake AI client that responds with whatever we tell it to.
function makeFake(opts: {
  chat?: (s: string, u: string) => string | Promise<string>;
  chatStream?: (s: string, u: string) => AsyncIterable<string> | Iterable<string>;
  budgetRemaining?: number;
  throwBudget?: boolean;
}): AiClient {
  let calls = 0;
  const remaining = opts.budgetRemaining ?? 200;
  return {
    async chat({ system, user }) {
      calls++;
      if (opts.throwBudget) throw new BudgetExceededError();
      return Promise.resolve(opts.chat ? opts.chat(system, user) : "");
    },
    async *chatStream({ system, user }) {
      calls++;
      if (opts.throwBudget) throw new BudgetExceededError();
      const src = opts.chatStream ? opts.chatStream(system, user) : ["fallback"];
      for await (const chunk of src as AsyncIterable<string>) yield chunk;
    },
    budgetRemaining: () => remaining - calls,
    resetBudgetForTest: () => undefined,
  };
}

describe.skipIf(!dbUrl)("/api/query/{nl-to-sql,explain-ai,advise}", () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    const client = new pg.Client({ connectionString: dbUrl });
    await client.connect();
    await migrate(client, MIGRATIONS_DIR);
    await runSeed(client);
    await client.end();
    app = createApp();
  }, 90_000);

  afterEach(() => {
    setAiClientForTests(undefined);
  });

  afterAll(async () => {
    await closePool();
    await closeRedis();
  });

  it("POST /api/query/nl-to-sql returns SQL from fake model", async () => {
    setAiClientForTests(makeFake({ chat: () => "SELECT COUNT(*) FROM posts" }));
    const res = await request(app)
      .post("/api/query/nl-to-sql")
      .send({ scenarioSlug: "social_media", question: "how many posts are there?" });
    expect(res.status).toBe(200);
    expect(res.body.sql).toBe("SELECT COUNT(*) FROM posts");
  });

  it("POST /api/query/nl-to-sql parses CANNOT_ANSWER", async () => {
    setAiClientForTests(makeFake({ chat: () => "CANNOT_ANSWER no aggregate column available" }));
    const res = await request(app)
      .post("/api/query/nl-to-sql")
      .send({ scenarioSlug: "social_media", question: "weather report" });
    expect(res.status).toBe(200);
    expect(res.body.error).toBe("CANNOT_ANSWER");
    expect(res.body.reason).toMatch(/aggregate/);
  });

  it("POST /api/query/nl-to-sql returns 429 on budget exhaustion", async () => {
    setAiClientForTests(makeFake({ throwBudget: true }));
    const res = await request(app)
      .post("/api/query/nl-to-sql")
      .send({ scenarioSlug: "social_media", question: "anything goes here" });
    expect(res.status).toBe(429);
  });

  it("POST /api/query/nl-to-sql rejects unknown scenario", async () => {
    setAiClientForTests(makeFake({ chat: () => "SELECT 1" }));
    const res = await request(app)
      .post("/api/query/nl-to-sql")
      .send({ scenarioSlug: "missing", question: "anything goes here" });
    expect(res.status).toBe(404);
  });

  it("POST /api/query/explain-ai streams NDJSON chunks ending with done:true", async () => {
    async function* gen(): AsyncIterable<string> {
      yield "The ";
      yield "bottleneck ";
      yield "is the seq scan.";
    }
    setAiClientForTests(makeFake({ chatStream: () => gen() }));
    const res = await request(app)
      .post("/api/query/explain-ai")
      .send({
        scenarioSlug: "social_media",
        sql: "SELECT * FROM posts",
        planJson: [{ Plan: { "Node Type": "Seq Scan" } }],
      });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/x-ndjson/);
    const lines = res.text
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(lines.length).toBe(4);
    expect(lines[0].delta).toBe("The ");
    expect(lines[3].done).toBe(true);
  });

  it("POST /api/query/advise: full chain returns sql + plan + suggestedDdl + why", async () => {
    let call = 0;
    setAiClientForTests(
      makeFake({
        chat: () => {
          call++;
          if (call === 1) {
            return "SELECT COUNT(*) FROM posts";
          }
          return JSON.stringify({
            suggestedDdl: ["CREATE INDEX idx_posts_score ON sm_content.posts(score DESC)"],
            why: "The plan shows a seq scan over posts; an index on score would help.",
          });
        },
      }),
    );
    const res = await request(app)
      .post("/api/query/advise")
      .send({ scenarioSlug: "social_media", requirement: "give me top posts by score" });
    expect(res.status).toBe(200);
    expect(res.body.sql).toBe("SELECT COUNT(*) FROM posts");
    expect(Array.isArray(res.body.plan)).toBe(true);
    expect(res.body.suggestedDdl).toEqual([
      "CREATE INDEX idx_posts_score ON sm_content.posts(score DESC)",
    ]);
    expect(res.body.why).toMatch(/seq scan/);
  });

  it("POST /api/query/advise: short-circuits on CANNOT_ANSWER without calling explain", async () => {
    let call = 0;
    setAiClientForTests(
      makeFake({
        chat: () => {
          call++;
          if (call === 1) return "CANNOT_ANSWER no relevant tables";
          return "{}";
        },
      }),
    );
    const res = await request(app)
      .post("/api/query/advise")
      .send({ scenarioSlug: "social_media", requirement: "fix world hunger" });
    expect(res.status).toBe(200);
    expect(res.body.error).toBe("CANNOT_ANSWER");
    expect(call).toBe(1); // didn't call advise step
  });

  // ─── /api/query/repair (#114) ────────────────────────────────────────

  it("POST /api/query/repair returns a corrected SELECT + reason", async () => {
    setAiClientForTests(
      makeFake({
        chat: () => `WHY
The column score doesn't exist on users; it's on posts.

FIX
select title, score from posts order by score desc limit 10`,
      }),
    );
    const res = await request(app).post("/api/query/repair").send({
      scenarioSlug: "social_media",
      sql: "SELECT score FROM users",
      error: 'column "score" does not exist',
    });
    expect(res.status).toBe(200);
    expect(res.body.sql).toMatch(/select title, score/i);
    expect(res.body.why).toMatch(/score doesn't exist/);
  });

  it("POST /api/query/repair passes through CANNOT_ANSWER", async () => {
    setAiClientForTests(
      makeFake({
        chat: () => `WHY
No login timestamps exist anywhere in this schema.

FIX
CANNOT_ANSWER no login-related column exists`,
      }),
    );
    const res = await request(app).post("/api/query/repair").send({
      scenarioSlug: "social_media",
      sql: "SELECT last_login FROM users",
      error: 'column "last_login" does not exist',
    });
    expect(res.status).toBe(200);
    expect(res.body.error).toBe("CANNOT_ANSWER");
  });

  it("POST /api/query/repair returns 429 on budget exhaustion", async () => {
    setAiClientForTests(makeFake({ throwBudget: true }));
    const res = await request(app).post("/api/query/repair").send({
      scenarioSlug: "social_media",
      sql: "SELECT 1",
      error: "anything",
    });
    expect(res.status).toBe(429);
  });

  it("POST /api/query/repair rejects unknown scenario", async () => {
    setAiClientForTests(makeFake({ chat: () => "WHY x\nFIX\nselect 1" }));
    const res = await request(app)
      .post("/api/query/repair")
      .send({ scenarioSlug: "missing", sql: "SELECT 1", error: "x" });
    expect(res.status).toBe(404);
  });
});
