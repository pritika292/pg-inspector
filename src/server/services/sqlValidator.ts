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

// Tree-walk over a statement. Returns ok iff every branch is a read-only
// SELECT-shaped form (plain select, set ops over selects, or WITH whose
// CTE + body are also walked recursively).
function checkStatement(stmt: Statement): ValidatorResult {
  if (stmt.type === "select") return { ok: true };

  // pgsql-ast-parser flattens set operations into top-level `union` / `union all`
  // nodes with `left` and `right` recursive children. INTERSECT / EXCEPT
  // aren't recognized by the parser (returns a parse error), so we don't
  // need to handle them here.
  if (stmt.type === "union" || stmt.type === "union all") {
    const left = checkStatement(stmt.left as Statement);
    if (!left.ok) return left;
    const right = checkStatement(stmt.right as Statement);
    if (!right.ok) return right;
    return { ok: true };
  }

  if (stmt.type === "with") {
    // Plain WITH: bind is an array of { alias, statement } objects.
    for (const binding of stmt.bind) {
      const inner = checkStatement(binding.statement as Statement);
      if (!inner.ok) {
        return {
          ok: false,
          reason: `CTE '${binding.alias.name}' must be a SELECT (${inner.reason})`,
        };
      }
    }
    const body = checkStatement(stmt.in as Statement);
    if (!body.ok) {
      return { ok: false, reason: `WITH body must be a SELECT (${body.reason})` };
    }
    return { ok: true };
  }

  if (stmt.type === "with recursive") {
    // WITH RECURSIVE: pgsql-ast-parser flattens this differently. `bind` is
    // the recursive statement (typically a `union all` of base case + step),
    // and `in` is the body after the CTE.
    const cte = checkStatement(stmt.bind as Statement);
    if (!cte.ok) {
      return {
        ok: false,
        reason: `CTE '${stmt.alias?.name ?? "recursive"}' must be a SELECT (${cte.reason})`,
      };
    }
    const body = checkStatement(stmt.in as Statement);
    if (!body.ok) {
      return { ok: false, reason: `WITH RECURSIVE body must be a SELECT (${body.reason})` };
    }
    return { ok: true };
  }

  return { ok: false, reason: `statement type '${stmt.type}' is not allowed; only SELECT` };
}
