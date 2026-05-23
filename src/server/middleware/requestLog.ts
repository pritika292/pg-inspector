import pinoHttp from "pino-http";
import pino from "pino";
import { config } from "../config.js";

// One-line-per-request structured log. Redacts secret-named fields out of
// headers + body so a stray Authorization can't surface in stdout. Never
// log bodies wholesale — too easy for a future endpoint to handle PII.

const REDACT_PATHS = [
  'req.headers["authorization"]',
  'req.headers["cookie"]',
  'req.headers["x-api-key"]',
  "req.headers.authorization",
  "req.headers.cookie",
];

const logger = pino({
  level: config.LOG_LEVEL,
  redact: { paths: REDACT_PATHS, censor: "***" },
});

export const requestLog = pinoHttp({
  logger,
  // Compact serializer — don't log the body, don't log headers besides ip
  // bookkeeping the framework needs.
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      ip: req.ip,
    }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
});
