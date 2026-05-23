import express, { type Express } from "express";
import { securityHeaders } from "./middleware/securityHeaders.js";

// createApp() is the factory the boot script (index.ts) and tests share. It
// wires middleware + routes onto a fresh Express instance and returns it.
// Anything that needs to mutate state (the listener, the DB pool) lives
// outside of here so tests can spin up a clean app per test file.
export function createApp(): Express {
  const app = express();

  // Caddy fronts us in prod; respect its X-Forwarded-For so per-IP logic
  // (rate limiting, request logging) sees real client addresses. Safe with
  // no proxy: req.ip falls back to the socket address.
  app.set("trust proxy", true);

  app.disable("x-powered-by");
  app.use(securityHeaders);
  app.use(express.json({ limit: "16kb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  return app;
}
