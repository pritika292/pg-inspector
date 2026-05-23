import pg from "pg";
import { config } from "../config.js";

// Admin pool — used ONLY by the migrator and seeder at boot. The HTTP
// server uses pool.ts (the read-only role). This separation is the
// interesting interview answer: the long-lived runtime never holds an
// identity that could DROP a table.

let adminPool: pg.Pool | undefined;

export function getAdminPool(): pg.Pool {
  if (!adminPool) {
    adminPool = new pg.Pool({ connectionString: config.ADMIN_DATABASE_URL, max: 2 });
  }
  return adminPool;
}

export async function closeAdminPool(): Promise<void> {
  if (adminPool) {
    await adminPool.end();
    adminPool = undefined;
  }
}
