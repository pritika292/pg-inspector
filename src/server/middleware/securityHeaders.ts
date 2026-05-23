import helmet from "helmet";
import type { RequestHandler } from "express";

// HSTS starts at 1 hour as a safety valve: if the cert pipeline ever breaks,
// browsers fall back to HTTP within an hour rather than being locked out for a
// year. Bump to 31_536_000 once Caddy has been quietly renewing certs for
// ~24h. Mirrors controlroom's pattern exactly.
const HSTS_MAX_AGE_SECONDS = 60 * 60;

export const securityHeaders: RequestHandler = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    },
  },
  frameguard: { action: "deny" },
  noSniff: true,
  referrerPolicy: { policy: "no-referrer" },
  permittedCrossDomainPolicies: false,
  strictTransportSecurity: {
    maxAge: HSTS_MAX_AGE_SECONDS,
    includeSubDomains: true,
    preload: false,
  },
});
