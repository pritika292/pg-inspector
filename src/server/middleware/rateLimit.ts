import rateLimit, { type Options } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from "express";
import { getRedis } from "../services/redis.js";

// 60 req/min/IP on /api/* surface. /health is exempted upstream.
// Redis-backed so multiple container replicas (we don't have any yet, but
// the future is short) share the bucket.
//
// Fail-open: if Redis errors (auth, network, eviction), we let the request
// through rather than 500-ing the whole API surface. A working rate limiter
// is great; a rate limiter that breaks every request is much worse than
// none. The Redis error is logged once per request via the wrapping
// fail-open shim.

let cached: RequestHandler | undefined;

export function getApiRateLimiter(): RequestHandler {
  if (cached) return cached;

  const base = rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: (req) => req.path === "/health",
    store: new RedisStore({
      sendCommand: (...args: string[]) => {
        const [head, ...rest] = args;
        if (!head) throw new Error("empty redis command");
        return getRedis().call(head, ...rest) as Promise<never>;
      },
      prefix: "pg-inspector:rl:",
    }),
  } satisfies Partial<Options>);

  let warnedThisMinute = false;
  cached = (req: Request, res: Response, next: NextFunction): void => {
    const failOpen: ErrorRequestHandler = (err, _r, _s, n) => {
      if (!warnedThisMinute) {
        warnedThisMinute = true;
        setTimeout(() => (warnedThisMinute = false), 60_000).unref();
        console.warn(
          `[rateLimit] backing store unhealthy, failing open: ${(err as Error).message}`,
        );
      }
      n();
    };
    try {
      base(req, res, (err?: unknown) => {
        if (err) return failOpen(err as Error, req, res, next);
        next();
      });
    } catch (err) {
      failOpen(err as Error, req, res, next);
    }
  };
  return cached;
}
