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

const CLIENT_DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../client");
const SPA_PATHS = ["/", "/about"];

export interface AppOptions {
  enableRateLimit?: boolean;
  enableRequestLog?: boolean;
}

export function createApp(opts: AppOptions = {}): Express {
  const app = express();

  app.set("trust proxy", true);
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
  const indexHtml = path.join(CLIENT_DIST, "index.html");
  if (existsSync(indexHtml)) {
    app.use(
      "/assets",
      express.static(path.join(CLIENT_DIST, "assets"), { immutable: true, maxAge: "1y" }),
    );
    for (const p of SPA_PATHS) {
      app.get(p, (_req, res) => {
        res.sendFile(indexHtml);
      });
    }
  }

  return app;
}
