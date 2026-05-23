import type { ScenarioSchema } from "./schemaIntrospect.js";
import { serializeSchemaForPrompt } from "./promptNlToSql.js";

export const ADVISE_SYSTEM = `You suggest schema and query improvements for Postgres.

Given a schema, a SQL statement that addresses a requirement, and the EXPLAIN plan, produce a single JSON object on one line with these keys:
  suggestedDdl: string[] — zero to four DDL statements that would make the query faster or correct. Each starts with CREATE INDEX, ALTER TABLE, or ALTER INDEX. No DROP. No DELETE.
  why: string — one paragraph (80-200 words) connecting the plan's bottleneck to the suggested DDL.

Output ONLY the JSON object. No markdown, no commentary outside the JSON.`;

export function buildAdvisePrompt(
  schema: ScenarioSchema,
  requirement: string,
  sql: string,
  plan: unknown,
): { system: string; user: string } {
  const schemaText = serializeSchemaForPrompt(schema);
  return {
    system: ADVISE_SYSTEM,
    user: `Schema:\n${schemaText}\n\nRequirement: ${requirement}\n\nSQL:\n${sql}\n\nPlan (JSON):\n${JSON.stringify(plan)}`,
  };
}

export interface AdviseResponse {
  suggestedDdl: string[];
  why: string;
}

export function parseAdviseResponse(raw: string): AdviseResponse {
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    const parsed = JSON.parse(trimmed) as Partial<AdviseResponse>;
    const suggestedDdl = Array.isArray(parsed.suggestedDdl)
      ? parsed.suggestedDdl.filter((s): s is string => typeof s === "string")
      : [];
    const why = typeof parsed.why === "string" ? parsed.why : "(model returned no rationale)";
    return { suggestedDdl, why };
  } catch {
    return { suggestedDdl: [], why: `(could not parse model output: ${trimmed.slice(0, 200)})` };
  }
}
