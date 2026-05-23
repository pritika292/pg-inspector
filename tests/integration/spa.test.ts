import { describe, expect, it } from "vitest";
import request from "supertest";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../../src/server/app.js";

// SPA serving only kicks in when dist/client/ exists. From within tsx (running
// from source), that path resolves alongside this file's compiled output — so
// in the test process we resolve it from the repo root instead.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const builtIndex = path.join(repoRoot, "dist", "client", "index.html");
const haveBuild = existsSync(builtIndex);

describe.runIf(haveBuild)("GET / (SPA)", () => {
  it("serves dist/client/index.html at /", async () => {
    const res = await request(createApp()).get("/");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/);
    expect(res.text).toContain('<div id="root"></div>');
    expect(res.text).toContain("pg-inspector");
  });
});

describe.runIf(!haveBuild)("GET / (no SPA build)", () => {
  it("skips SPA serving when dist/client is absent", async () => {
    // No matching handler → 404. This is the dev-server case where vite at
    // :5173 handles the SPA and :3014 only handles /api + /health.
    const res = await request(createApp()).get("/");
    expect(res.status).toBe(404);
  });
});
