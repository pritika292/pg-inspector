import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/server/app.js";

describe("GET /health", () => {
  it("returns 200 with { ok: true }", async () => {
    const res = await request(createApp()).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("sets X-Frame-Options: DENY via helmet", async () => {
    const res = await request(createApp()).get("/health");
    expect(res.headers["x-frame-options"]).toBe("DENY");
  });

  it("sets HSTS at the 1-hour safety-valve max-age", async () => {
    // Short max-age is intentional. If the cert pipeline breaks, browsers
    // fall back to HTTP within an hour. Bump to 31536000 after 24h of
    // stable renewals (same playbook as controlroom).
    const res = await request(createApp()).get("/health");
    expect(res.headers["strict-transport-security"]).toMatch(/max-age=3600/);
    expect(res.headers["strict-transport-security"]).toContain("includeSubDomains");
  });

  it("does not advertise the X-Powered-By header", async () => {
    const res = await request(createApp()).get("/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});
