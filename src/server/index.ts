import { createApp } from "./app.js";
import { config } from "./config.js";
import { getAdminPool, closeAdminPool } from "./db/adminPool.js";
import { migrate } from "./db/migrate.js";
import { runSeed } from "./db/seed/runSeed.js";

async function bootstrap(): Promise<void> {
  const adminPool = getAdminPool();
  const client = await adminPool.connect();
  try {
    const { applied, skipped } = await migrate(client);
    if (applied.length > 0) {
      console.log(`[migrate] applied ${applied.length}: ${applied.join(", ")}`);
    } else {
      console.log(`[migrate] up to date (${skipped.length} already applied)`);
    }
    const seed = await runSeed(client);
    if (seed.ran) {
      console.log(`[seed] ${seed.reason} in ${seed.durationMs}ms`);
    } else {
      console.log(`[seed] skipped (${seed.reason})`);
    }
  } finally {
    client.release();
  }
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
