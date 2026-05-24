import express, { type Express } from "express";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { securityHeaders } from "./middleware/securityHeaders.js";
import { requestLog } from "./middleware/requestLog.js";
import { getApiRateLimiter } from "./middleware/rateLimit.js";
import { scenariosRouter } from "./routes/scenarios.js";
import { queryRouter } from "./routes/queryRun.js";
import { queryAiRouter } from "./routes/queryAi.js";

const SPA_PATHS = ["/", "/about"];

// Resolve the built-client directory. In production (running from dist/),
// it's at ../client. In tests/dev (running TypeScript from src/), the built
// client lives at ../../dist/client. Try the prod layout first; fall back
// to the source-relative layout for vitest.
function findClientDist(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const prodLayout = path.resolve(here, "../client");
  if (existsSync(path.join(prodLayout, "assets"))) return prodLayout;
  const sourceLayout = path.resolve(here, "../../dist/client");
  if (existsSync(path.join(sourceLayout, "assets"))) return sourceLayout;
  return prodLayout; // both will fail the assets check downstream
}

const CLIENT_DIST = findClientDist();

export interface AppOptions {
  enableRateLimit?: boolean;
  enableRequestLog?: boolean;
}

export function createApp(opts: AppOptions = {}): Express {
  const app = express();

  // Caddy is the one hop between us and the client. Trusting exactly one
  // hop satisfies express-rate-limit's validator (which refuses the bare
  // `true` setting as too permissive — a spoofed X-Forwarded-For could
  // otherwise bypass the per-IP bucket).
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(securityHeaders);

  // Off by default in tests (where supertest is the only consumer); on by
  // default in src/server/index.ts boot for prod.
  if (opts.enableRequestLog) app.use(requestLog);

  app.use(express.json({ limit: "16kb" }));

  if (opts.enableRateLimit) {
    app.use("/api", getApiRateLimiter());
  }

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use(scenariosRouter);
  app.use(queryRouter);
  app.use(queryAiRouter);

  // Serve the built SPA when it's present. In dev, vite at :5173 handles the
  // SPA and /api is proxied to :3014.
  //
  // Gate on dist/client/assets, not dist/client/index.html. When tests run
  // from source via vitest, `import.meta.url` resolves to src/server/app.ts
  // so CLIENT_DIST ends up as src/client (an existing dir with index.html).
  // The post-build assets/ dir only exists in dist/client, so checking for
  // it is the unambiguous test.
  const indexHtml = path.join(CLIENT_DIST, "index.html");
  const assetsDir = path.join(CLIENT_DIST, "assets");
  if (existsSync(indexHtml) && existsSync(assetsDir)) {
    app.use("/assets", express.static(assetsDir, { immutable: true, maxAge: "1y" }));
    for (const p of SPA_PATHS) {
      app.get(p, (_req, res) => {
        res.sendFile(indexHtml);
      });
    }
  }

  return app;
}
