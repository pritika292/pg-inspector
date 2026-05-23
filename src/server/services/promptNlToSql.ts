import type { ScenarioSchema } from "./schemaIntrospect.js";

// Serializes a ScenarioSchema into a tight schema-as-text block the LLM can
// read. Keeps token count down; one line per column.
export function serializeSchemaForPrompt(schema: ScenarioSchema): string {
  const lines: string[] = [];
  for (const sch of schema.schemas) {
    lines.push(`-- schema ${sch.name}`);
    for (const t of sch.tables) {
      const cols = t.columns
        .map(
          (c) =>
            `${c.name} ${c.dataType}${c.isPrimaryKey ? " PK" : ""}${c.isNullable ? "" : " NOT NULL"}`,
        )
        .join(", ");
      lines.push(`${sch.name}.${t.name}(${cols})`);
      for (const idx of t.indexes) {
        if (idx.using !== "btree") {
          lines.push(`  -- index ${idx.name}: ${idx.using} on (${idx.columns.join(", ")})`);
        }
      }
    }
  }
  for (const fk of schema.fks) {
    if (fk.kind === "cross_scenario_soft") continue;
    lines.push(
      `-- fk: ${fk.from.schema}.${fk.from.table}.${fk.from.column} -> ${fk.to.schema}.${fk.to.table}.${fk.to.column}`,
    );
  }
  return lines.join("\n");
}

export const NL_TO_SQL_SYSTEM = `You generate Postgres SELECT statements only.

Given the schema below and a user question, output exactly one SQL statement that answers the question.

Rules:
- SELECT only. No DDL or DML.
- Use lowercase SQL keywords.
- Fully-qualify tables as <schema>.<table> only when the schema is not already in scope. The runtime sets search_path to the scenario's sub-schemas, so unqualified table names work.
- Prefer indexed columns in WHERE / ORDER BY where the schema notes suggest one.
- If the question cannot be answered with a SELECT against this schema, output exactly one line: CANNOT_ANSWER <one-sentence reason>.
- Output the SQL bare — no markdown fences, no explanation.`;

export function buildNlToSqlPrompt(
  schema: ScenarioSchema,
  question: string,
): { system: string; user: string } {
  const schemaText = serializeSchemaForPrompt(schema);
  return {
    system: NL_TO_SQL_SYSTEM,
    user: `Schema:\n${schemaText}\n\nQuestion: ${question}`,
  };
}

export function parseNlToSqlResponse(
  raw: string,
): { sql: string } | { error: "CANNOT_ANSWER"; reason: string } {
  const trimmed = raw.trim();
  if (trimmed.toUpperCase().startsWith("CANNOT_ANSWER")) {
    const reason = trimmed.replace(/^CANNOT_ANSWER\s*/i, "").trim() || "no reason given";
    return { error: "CANNOT_ANSWER", reason };
  }
  // Strip stray code fences just in case.
  const cleaned = trimmed
    .replace(/^```(?:sql)?\s*/i, "")
    .replace(/```$/, "")
    .trim();
  return { sql: cleaned };
}
