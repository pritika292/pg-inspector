import { z } from "zod";

// Crash on boot rather than ship with placeholder / wrong values. Silent
// misconfig is the worst kind.

const ConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3014),

  // The HTTP server uses this exclusively (read-only role).
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .startsWith("postgres://", { message: "DATABASE_URL must start with postgres://" }),

  // The migrator + seeder use this. The HTTP server NEVER touches it.
  // Optional in dev (fallback to DATABASE_URL); required in prod.
  ADMIN_DATABASE_URL: z.string().default(""),

  REDIS_URL: z
    .string()
    .min(1, "REDIS_URL is required")
    .startsWith("redis://", { message: "REDIS_URL must start with redis://" }),

  // Azure OpenAI via Managed Identity. No API key. The AI client (Epic 4.8,
  // #38) constructs an AzureOpenAI client with a bearer-token provider.
  // Optional in tests (the fake client is injected); required in prod.
  AZURE_OPENAI_ENDPOINT: z.string().default(""),
  AZURE_OPENAI_DEPLOYMENT: z.string().default("gpt-4.1-mini"),
  AZURE_OPENAI_API_VERSION: z.string().default("2024-12-01-preview"),

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Config = z.infer<typeof ConfigSchema>;

const REDACTED_KEYS = /(?:PASSWORD|SECRET|TOKEN|KEY)$/i;

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        REDACTED_KEYS.test(k) ? "***" : redact(v),
      ]),
    );
  }
  return value;
}

export function parseConfig(env: NodeJS.ProcessEnv): Config {
  const result = ConfigSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid config:\n${issues}`);
  }
  const data = result.data;

  if (data.NODE_ENV === "production") {
    const violations: string[] = [];

    if (!data.ADMIN_DATABASE_URL.startsWith("postgres://")) {
      violations.push(
        "  - ADMIN_DATABASE_URL: required in production and must start with postgres://",
      );
    }
    if (data.DATABASE_URL.includes("localhost") || data.DATABASE_URL.includes("devpass")) {
      violations.push("  - DATABASE_URL: must not contain localhost or devpass in production");
    }
    if (!data.REDIS_URL.endsWith("/13")) {
      violations.push(
        "  - REDIS_URL: must end with /13 in production (pg-inspector uses Redis DB 13)",
      );
    }
    if (!data.AZURE_OPENAI_ENDPOINT.startsWith("https://")) {
      violations.push("  - AZURE_OPENAI_ENDPOINT: required https:// URL in production");
    }

    if (violations.length > 0) throw new Error(`Invalid config:\n${violations.join("\n")}`);
  }

  // In dev, ADMIN_DATABASE_URL falls back to DATABASE_URL (single Postgres
  // user with full rights in docker-compose.local.yml).
  if (data.ADMIN_DATABASE_URL === "") {
    return Object.freeze({ ...data, ADMIN_DATABASE_URL: data.DATABASE_URL });
  }
  return Object.freeze(data);
}

function loadConfig(): Config {
  try {
    return parseConfig(process.env);
  } catch (err) {
    process.stderr.write((err as Error).message + "\n");
    process.exit(1);
  }
}

// Singleton: parsed and frozen at module load. Tests import parseConfig +
// redact directly; never this singleton.
export const config: Config = loadConfig();
