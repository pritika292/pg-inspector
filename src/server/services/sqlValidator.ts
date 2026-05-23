import { parse, type Statement } from "pgsql-ast-parser";

// Layer 2 of the SQL safety stack (see README / docs/11 deep-dive).
//
// Accepts iff the SQL is exactly one statement, of type 'select', and any
// CTEs are themselves SELECT-only. Rejects every modifying statement type
// the AST parser knows about plus statement chaining via ';'.
//
// Defense in depth: even if this passes a modifying statement through (bug
// in our walker, parser miss), the runtime role (inspector_ro) doesn't have
// INSERT/UPDATE/DELETE/etc. on the scenario schemas, so Postgres rejects.
// We do this validation first because it gives a cleaner error message
// than Postgres's 'permission denied for table foo'.

export type ValidatorResult = { ok: true } | { ok: false; reason: string };

export function validateSelectOnly(sql: string): ValidatorResult {
  if (!sql.trim()) return { ok: false, reason: "empty input" };
  let statements: Statement[];
  try {
    statements = parse(sql);
  } catch (err) {
    return { ok: false, reason: `parse error: ${(err as Error).message}` };
  }

  if (statements.length === 0) {
    return { ok: false, reason: "empty input" };
  }
  if (statements.length > 1) {
    return { ok: false, reason: "multiple statements are not allowed; submit one SELECT" };
  }

  const stmt = statements[0];
  if (!stmt) return { ok: false, reason: "parsed to no statement" };
  return checkStatement(stmt);
}

function checkStatement(stmt: Statement): ValidatorResult {
  if (stmt.type === "select") return { ok: true };

  if (stmt.type === "with") {
    // WITH [RECURSIVE] ... SELECT. Every CTE must itself be a SELECT, and
    // the body after the CTEs must be a SELECT.
    for (const binding of stmt.bind) {
      const inner = binding.statement;
      if (inner.type !== "select") {
        return {
          ok: false,
          reason: `CTE '${binding.alias.name}' must be a SELECT (got ${inner.type})`,
        };
      }
    }
    const body = stmt.in;
    if (body.type !== "select") {
      return { ok: false, reason: `WITH body must be a SELECT (got ${body.type})` };
    }
    return { ok: true };
  }

  return { ok: false, reason: `statement type '${stmt.type}' is not allowed; only SELECT` };
}
