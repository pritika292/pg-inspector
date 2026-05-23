import { createApp } from "./app.js";
import { config } from "./config.js";
import { getAdminPool, closeAdminPool } from "./db/adminPool.js";
import { migrate } from "./db/migrate.js";

async function bootstrap(): Promise<void> {
  // Migrations run on every container start. The runner is idempotent.
  const adminPool = getAdminPool();
  const client = await adminPool.connect();
  try {
    const { applied, skipped } = await migrate(client);
    if (applied.length > 0) {
      console.log(`[migrate] applied ${applied.length}: ${applied.join(", ")}`);
    } else {
      console.log(`[migrate] up to date (${skipped.length} already applied)`);
    }
  } finally {
    client.release();
  }
  // Admin pool is unused once migrations have run; the HTTP server only
  // touches the read-only pool. Closing keeps the connection count low.
  await closeAdminPool();

  const app = createApp();
  app.listen(config.PORT, () => {
    console.log(`pg-inspector listening on :${config.PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
