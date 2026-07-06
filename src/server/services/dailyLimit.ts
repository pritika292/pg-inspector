import { getRedis } from "./redis.js";
import { config } from "../config.js";

// Global daily AI-run cap, backed by Redis so it survives container restarts
// (the previous in-memory bucket reset on every deploy). pg-inspector's HTTP
// server runs as a read-only Postgres role and cannot write a counter table,
// so Redis — which the app already uses for caching + rate limiting — is the
// natural store. INCR is atomic; the key carries a TTL to the next UTC
// midnight, so it resets daily on its own.

function secondsUntilUtcMidnight(): number {
  const now = new Date();
  const tomorrow = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0),
  );
  return Math.max(1, Math.ceil((tomorrow.getTime() - now.getTime()) / 1000));
}

function todayKey(): string {
  return `pgins:ai:runs:${new Date().toISOString().slice(0, 10)}`;
}

/**
 * Reserve one AI run for today. Returns true if within the cap. Counts
 * BEFORE the model call, so a granted slot is a hard ceiling on Azure OpenAI
 * spend. Fails OPEN on Redis errors (the per-IP limiter and the Azure
 * subscription cap remain as backstops) so a transient Redis blip never
 * takes the demo down.
 */
export async function reserveDailyAiRun(): Promise<boolean> {
  if (config.AI_DAILY_LIMIT <= 0) return true;
  const key = todayKey();
  try {
    const r = getRedis();
    const n = await r.incr(key);
    // Always (re)assert the TTL so the counter can't leak without an expiry.
    await r.expire(key, secondsUntilUtcMidnight());
    return n <= config.AI_DAILY_LIMIT;
  } catch {
    return true;
  }
}
