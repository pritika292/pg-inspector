import type { ScenarioSchema } from "./schemaIntrospect.js";
import { serializeSchemaForPrompt } from "./promptNlToSql.js";

export const EXPLAIN_AI_SYSTEM = `You read Postgres EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) output and explain it to a senior engineer in plain English, then prescribe one concrete fix.

Identify the single most expensive node (highest Actual Total Time). Name the access method (seq scan / index scan / index only scan / bitmap heap / nested loop / hash join / merge join / sort / hash aggregate / cte scan).

Output exactly two sections, in this order, no markdown headers, no preamble:

READING
Three short sentences:
  (1) The bottleneck (what node, what time, on what relation).
  (2) Why it's slow (missing index, bad row estimate, cardinality blow-up, etc.).
  (3) What is already efficient (one brief positive — what the planner did well).

RECOMMENDATION
Start with a single DDL statement on its own line, beginning with CREATE INDEX or ALTER TABLE. Use a descriptive index name (idx_<table>_<cols>) and real column names from the schema. Then one sentence (under 30 words) explaining why this specific change targets the bottleneck node.

If the plan is already optimal and no DDL would help, write the single line "No DDL change recommended." followed by one sentence on why (e.g., "the seq scan is over a 50-row table where an index would never be used").

Be specific. Quote relation names, index names, and numbers from the plan. 120-220 words total.`;

export function buildExplainAiPrompt(
  schema: ScenarioSchema,
  sql: string,
  planJson: unknown,
): { system: string; user: string } {
  const schemaText = serializeSchemaForPrompt(schema);
  return {
    system: EXPLAIN_AI_SYSTEM,
    user: `Schema:\n${schemaText}\n\nSQL:\n${sql}\n\nPlan (JSON):\n${JSON.stringify(planJson)}`,
  };
}
