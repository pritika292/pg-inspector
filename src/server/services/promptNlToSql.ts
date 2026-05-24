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

// The model is instructed to emit either "CANNOT_ANSWER <reason>" or a bare
// SQL statement. In practice gpt-4.1-mini sometimes ignores "no markdown" and
// wraps in ```sql fences, sometimes adds a preamble like "Here's the SQL:".
// This parser handles the common deviations defensively.
//
//   - CANNOT_ANSWER detection looks at the first non-whitespace line so a
//     trailing one-liner reason still parses.
//   - SQL extraction prefers the body of a ```[sql|postgres|postgresql] code
//     block when present; otherwise falls back to the whole trimmed string
//     (with any fence markers stripped). The validator gets the last word on
//     whether what comes out is actually a SELECT.
export function parseNlToSqlResponse(
  raw: string,
): { sql: string } | { error: "CANNOT_ANSWER"; reason: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { error: "CANNOT_ANSWER", reason: "model returned an empty response" };
  }

  // CANNOT_ANSWER may appear after a brief preamble; check the first line.
  const firstLine = trimmed.split(/\r?\n/, 1)[0]?.trim() ?? "";
  if (firstLine.toUpperCase().startsWith("CANNOT_ANSWER")) {
    const reason = firstLine.replace(/^CANNOT_ANSWER\s*/i, "").trim() || "no reason given";
    return { error: "CANNOT_ANSWER", reason };
  }

  // Prefer the inside of the first ```sql / ```postgres / ```postgresql /
  // plain ``` fenced block. The (?:...) groups make this match the closing
  // fence too.
  const fenced = trimmed.match(/```(?:sql|postgres(?:ql)?)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return { sql: fenced[1].trim() };
  }

  // No fence: strip any leading "Here's the SQL:" style preamble of the form
  // "<text>:\n<sql>" if the second line starts with SELECT / WITH.
  const preambleMatch = trimmed.match(/^[^\n]*:\s*\n+\s*((?:WITH|SELECT)\b[\s\S]+)$/i);
  if (preambleMatch?.[1]) {
    return { sql: preambleMatch[1].trim() };
  }

  // Last resort: strip stray fence opener/closer markers and return the rest.
  const cleaned = trimmed
    .replace(/^```(?:sql|postgres(?:ql)?)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  return { sql: cleaned };
}
