import Redis from "ioredis";
import { config } from "../config.js";

let client: Redis | undefined;

export function getRedis(): Redis {
  if (!client) {
    client = new Redis(config.REDIS_URL, {
      // Don't block boot if Redis is slow to come up — degrade to no-cache.
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: false,
    });
    client.on("error", (err) => {
      // We don't want noise per-request; a single line is enough.
      console.warn(`[redis] ${err.message}`);
    });
  }
  return client;
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit().catch(() => undefined);
    client = undefined;
  }
}

// Cache helper. JSON in, JSON out, TTL in seconds. Returns undefined on
// miss or any Redis failure; callers fall back to the source of truth.
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T> {
  const r = getRedis();
  try {
    const hit = await r.get(key);
    if (hit) return JSON.parse(hit) as T;
  } catch {
    // fall through
  }
  const fresh = await loader();
  try {
    await r.set(key, JSON.stringify(fresh), "EX", ttlSeconds);
  } catch {
    // ignore
  }
  return fresh;
}
