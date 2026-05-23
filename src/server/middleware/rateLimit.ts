import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import type { RequestHandler } from "express";
import { getRedis } from "../services/redis.js";

// 60 req/min/IP on /api/* surface. /health is exempted upstream.
// Redis-backed so multiple container replicas (we don't have any yet, but
// the future is short) share the bucket.

let cached: RequestHandler | undefined;

export function getApiRateLimiter(): RequestHandler {
  if (cached) return cached;
  cached = rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: (req) => req.path === "/health",
    store: new RedisStore({
      // rate-limit-redis hands us a Redis command + args; we forward through
      // ioredis's lower-level call() so we don't have to type each command.
      // The cast is necessary because ioredis types call() loosely.
      sendCommand: (...args: string[]) => {
        const [head, ...rest] = args;
        if (!head) throw new Error("empty redis command");
        return getRedis().call(head, ...rest) as Promise<never>;
      },
      prefix: "pg-inspector:rl:",
    }),
  });
  return cached;
}
