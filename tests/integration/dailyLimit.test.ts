import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { reserveDailyAiRun } from "../../src/server/services/dailyLimit.js";
import { closeRedis, getRedis } from "../../src/server/services/redis.js";
import { config } from "../../src/server/config.js";

// The global daily AI cap is enforced in Redis. These tests need a live
// Redis (provided by CI's services block); they skip otherwise.
const hasRedis = !!process.env.REDIS_URL;

describe.skipIf(!hasRedis)("reserveDailyAiRun (global daily AI cap)", () => {
  beforeAll(async () => {
    // The redis client is a shared singleton other suites may have closed;
    // wait until the (re)created connection is ready before issuing commands
    // (it's created with enableOfflineQueue:false, so early commands throw).
    const r = getRedis();
    if (r.status !== "ready") {
      await new Promise<void>((resolve) => r.once("ready", () => resolve()));
    }
  }, 30_000);
  beforeEach(async () => {
    await getRedis().flushdb();
  });
  afterAll(async () => {
    await closeRedis();
  });

  it("allows a run when under the cap", async () => {
    expect(await reserveDailyAiRun()).toBe(true);
  });

  it("blocks once today's counter has reached the cap", async () => {
    const key = `pgins:ai:runs:${new Date().toISOString().slice(0, 10)}`;
    await getRedis().set(key, String(config.AI_DAILY_LIMIT));
    // Counter already at the limit → the next reservation is rejected.
    expect(await reserveDailyAiRun()).toBe(false);
  });

  it("sets a positive TTL on the counter key", async () => {
    await reserveDailyAiRun();
    const key = `pgins:ai:runs:${new Date().toISOString().slice(0, 10)}`;
    const ttl = await getRedis().ttl(key);
    expect(ttl).toBeGreaterThan(0);
  });
});
