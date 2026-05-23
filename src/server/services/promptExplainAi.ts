import type { ScenarioSchema } from "./schemaIntrospect.js";
import { serializeSchemaForPrompt } from "./promptNlToSql.js";

export const EXPLAIN_AI_SYSTEM = `You read Postgres EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) output and explain it in plain English for a senior engineer.

Identify the single most expensive node (highest Actual Total Time). Name the access method (seq scan / index scan / index only scan / bitmap heap / nested loop / hash join / merge join / sort / hash aggregate / cte scan).

Cover, in order:
1. The bottleneck (one sentence: what node, what time, on what relation).
2. Why it's slow (one or two sentences: missing index, bad row estimate, cardinality blow-up, etc.).
3. A concrete next step (one or two sentences: a specific index to create, a query rewrite, a column to add).

Be specific. Quote relation names, index names, and numbers from the plan. Plain text, no markdown headers. 80-220 words.`;

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
