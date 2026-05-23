import pg from "pg";
import { config } from "../config.js";

// Read-only pool — the only DB identity the HTTP server ever uses.
// Migrate + seed use adminPool.ts instead.

let pool: pg.Pool | undefined;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: config.DATABASE_URL,
      max: 10,
      // Per-connection statement_timeout as a defense-in-depth backstop.
      // safeRunner.ts (Epic 4.5) sets a tighter SET LOCAL per-query.
      statement_timeout: 5000,
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
