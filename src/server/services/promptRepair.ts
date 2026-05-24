import type { ScenarioSchema } from "./schemaIntrospect.js";
import { serializeSchemaForPrompt } from "./promptNlToSql.js";

export const REPAIR_SYSTEM = `You read a failed Postgres SELECT and the error Postgres returned, then either fix it or explain why it can't be fixed.

Given the schema, the user's SQL, and the pg error message:

Output exactly two sections, in this order, no markdown headers, no preamble:

WHY
One sentence (under 30 words) plainly stating what went wrong. Reference the specific column / table / clause that caused it when possible.

FIX
Either:
- One corrected SELECT statement on the lines after "FIX", bare (no fences, no extra prose). It must use SELECT only, valid pg syntax, the same scenario's tables, and lowercase keywords. Fully qualify only when needed.
OR, if the question is fundamentally unanswerable against this schema (e.g. needs columns that don't exist anywhere), instead of an SQL block write the single line:
CANNOT_ANSWER <one-sentence reason why no SELECT would work>

Do not output anything outside the WHY and FIX sections.`;

export function buildRepairPrompt(
  schema: ScenarioSchema,
  failedSql: string,
  pgError: string,
): { system: string; user: string } {
  const schemaText = serializeSchemaForPrompt(schema);
  return {
    system: REPAIR_SYSTEM,
    user: `Schema:\n${schemaText}\n\nUser SQL:\n${failedSql}\n\nPostgres error:\n${pgError}`,
  };
}

export interface RepairOk {
  sql: string;
  why: string;
}
export interface RepairCannotAnswer {
  error: "CANNOT_ANSWER";
  why: string;
}
export type RepairResult = RepairOk | RepairCannotAnswer;

// Parses the WHY/FIX shape. Lenient by design — the model usually obeys but
// occasionally wraps the SQL in fences or skips a section header.
export function parseRepairResponse(raw: string): RepairResult {
  const trimmed = raw.trim();
  if (!trimmed) return { error: "CANNOT_ANSWER", why: "model returned an empty response" };

  // Extract WHY: everything between WHY and FIX (or CANNOT_ANSWER), or the
  // first non-empty line if neither header is present.
  let why = "";
  const whyMatch = trimmed.match(
    /(?:^|\n)\s*WHY\s*\n+([\s\S]*?)(?=\n\s*(?:FIX|CANNOT_ANSWER)\b|$)/i,
  );
  if (whyMatch?.[1]) {
    why = whyMatch[1].trim();
  } else {
    why = trimmed.split(/\r?\n/)[0]?.trim() ?? "";
  }

  // CANNOT_ANSWER — accept whether it appears under a FIX header or on its own
  // line at the bottom.
  const caMatch = trimmed.match(/CANNOT_ANSWER\s+(.+?)$/im);
  if (caMatch) {
    return { error: "CANNOT_ANSWER", why: why || caMatch[1]?.trim() || "no reason given" };
  }

  // FIX body: everything after "FIX" up to end. Strip optional code fences.
  const fixMatch = trimmed.match(/(?:^|\n)\s*FIX\s*\n+([\s\S]+)$/i);
  let sqlBlock = fixMatch?.[1]?.trim() ?? "";
  if (!sqlBlock) {
    // No FIX header — assume the trailing block is the SQL.
    sqlBlock = trimmed;
  }
  const fenced = sqlBlock.match(/```(?:sql|postgres(?:ql)?)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) sqlBlock = fenced[1].trim();
  sqlBlock = sqlBlock
    .replace(/^```(?:sql|postgres(?:ql)?)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  if (!sqlBlock) {
    return { error: "CANNOT_ANSWER", why: why || "no SQL returned" };
  }
  return { sql: sqlBlock, why: why || "fix proposed" };
}
