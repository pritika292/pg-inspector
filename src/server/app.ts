import express, { type Express } from "express";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { securityHeaders } from "./middleware/securityHeaders.js";
import { scenariosRouter } from "./routes/scenarios.js";
import { queryRouter } from "./routes/queryRun.js";
import { queryAiRouter } from "./routes/queryAi.js";

// dist/server/app.js → ../client = dist/client (where vite emits the SPA).
const CLIENT_DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../client");

// SPA paths that should serve index.html instead of returning 404. The visualizer
// app is currently a single page; this list grows as we add routes.
const SPA_PATHS = ["/"];

export function createApp(): Express {
  const app = express();

  app.set("trust proxy", true);
  app.disable("x-powered-by");
  app.use(securityHeaders);
  app.use(express.json({ limit: "16kb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use(scenariosRouter);
  app.use(queryRouter);
  app.use(queryAiRouter);

  // Serve the built SPA when it's present. In development we use vite's dev
  // server at :5173 (with /api proxied to :3014), so this branch is a no-op.
  // In production, dist/client/ exists and we serve it.
  const indexHtml = path.join(CLIENT_DIST, "index.html");
  if (existsSync(indexHtml)) {
    app.use(
      "/assets",
      express.static(path.join(CLIENT_DIST, "assets"), {
        immutable: true,
        maxAge: "1y",
      }),
    );
    for (const p of SPA_PATHS) {
      app.get(p, (_req, res) => {
        res.sendFile(indexHtml);
      });
    }
  }

  return app;
}
