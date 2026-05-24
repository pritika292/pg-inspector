import { getPool } from "../db/pool.js";
import { getScenario } from "./scenarios.js";

// Layer 3 of the SQL safety stack. Every user SELECT runs inside a
// transaction with:
//   - SET LOCAL search_path TO <scenario_schema_1>, <_2>, ..., public
//   - SET LOCAL statement_timeout = 1000ms
//   - SET LOCAL idle_in_transaction_session_timeout = 5000ms
//   - the user's SELECT, wrapped in SELECT * FROM (...) LIMIT 501 so even
//     unbounded queries cap server-side
//   - ROLLBACK at the end (so any incidental side effects via SELECT-
//     calling-function are undone — defensive overkill, but free)

const HARD_LIMIT = 500;

// Normalize the user-typed SQL before wrapping. Strips trailing `;`,
// trailing whitespace, and trailing `--` line comments so they don't end up
// inside the parenthesized wrap `SELECT * FROM (...) LIMIT 501`.
//
// The `;` matters because Postgres rejects `... ;)` as "syntax error at or
// near \";\". A `--` line comment with no terminating newline would eat the
// closing `)`. Mixing both (e.g. `SELECT 1; -- ok`) shows up in real user
// pastes.
//
// String-literal safety: `(?<=\s)--` only matches a `--` preceded by
// whitespace, so `SELECT '-- foo'` (where `--` is inside a string after `'`)
// is left alone. Tested explicitly.
export function normalizeUserSql(sql: string): string {
  return sql.replace(/(?:[;\s]|(?<=\s)--[^\n]*)+$/u, "");
}

export interface RunResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  elapsedMs: number;
  truncated: boolean;
}

export class SafeRunnerError extends Error {
  constructor(
    message: string,
    readonly code: "TIMEOUT" | "PERMISSION_DENIED" | "BAD_SQL" | "UNKNOWN_SCENARIO" | "OTHER",
  ) {
    super(message);
    this.name = "SafeRunnerError";
  }
}

// Bare SELECT runner. Returns { columns, rows, ... }.
export async function runReadOnly(sql: string, scenarioSlug: string): Promise<RunResult> {
  const meta = getScenario(scenarioSlug);
  if (!meta) throw new SafeRunnerError(`unknown scenario: ${scenarioSlug}`, "UNKNOWN_SCENARIO");

  // Wrap on new lines so trailing `--` comments can't swallow the `)`.
  const wrapped = `SELECT * FROM (\n${normalizeUserSql(sql)}\n) AS pginspector_wrap LIMIT ${HARD_LIMIT + 1}`;
  return runWithGuards(wrapped, meta.schemas);
}

// EXPLAIN runner. Allows up to 5s because EXPLAIN ANALYZE actually executes
// the query; some plans take longer than the 1s budget. No LIMIT wrapping —
// EXPLAIN returns one row, not query results.
export async function runExplain(sql: string, scenarioSlug: string): Promise<unknown> {
  const meta = getScenario(scenarioSlug);
  if (!meta) throw new SafeRunnerError(`unknown scenario: ${scenarioSlug}`, "UNKNOWN_SCENARIO");

  // Newline before user SQL is important here too: a trailing line comment in
  // the user's SQL would otherwise have nothing to terminate it.
  const explainSql = `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)\n${normalizeUserSql(sql)}`;
  const result = await runWithGuards(explainSql, meta.schemas, {
    timeoutMs: 5000,
    skipLimitWrap: true,
  });
  // EXPLAIN returns a single column "QUERY PLAN" with a JSON array.
  const firstRow = result.rows[0];
  if (!firstRow) throw new SafeRunnerError("explain returned no rows", "OTHER");
  const plan = (firstRow as Record<string, unknown>)["QUERY PLAN"];
  return plan;
}

interface GuardOpts {
  timeoutMs?: number;
  skipLimitWrap?: boolean;
}

async function runWithGuards(
  sql: string,
  scenarioSchemas: string[],
  opts: GuardOpts = {},
): Promise<RunResult> {
  const pool = getPool();
  const client = await pool.connect();
  const t0 = Date.now();
  try {
    await client.query("BEGIN READ ONLY");
    // search_path: scenario schemas first, then public for _migrations etc.
    // All identifiers are well-known so direct interpolation is safe.
    const sp = scenarioSchemas.map((s) => `"${s}"`).join(", ");
    await client.query(`SET LOCAL search_path TO ${sp}, public`);
    await client.query(`SET LOCAL statement_timeout = '${opts.timeoutMs ?? 1000}ms'`);
    await client.query("SET LOCAL idle_in_transaction_session_timeout = '5000ms'");

    const result = await client.query(sql);
    const elapsedMs = Date.now() - t0;

    const fields = result.fields ?? [];
    const truncated = !opts.skipLimitWrap && result.rows.length > HARD_LIMIT;
    const rowsOut = truncated ? result.rows.slice(0, HARD_LIMIT) : result.rows;

    return {
      columns: fields.map((f) => f.name),
      rows: rowsOut as Record<string, unknown>[],
      rowCount: rowsOut.length,
      elapsedMs,
      truncated,
    };
  } catch (err) {
    const pgErr = err as Error & { code?: string };
    // Postgres error codes:
    //   57014: statement_timeout
    //   42501: insufficient_privilege
    //   42xxx: syntax / undefined column-name / etc.
    let code: SafeRunnerError["code"] = "OTHER";
    if (pgErr.code === "57014") code = "TIMEOUT";
    else if (pgErr.code === "42501") code = "PERMISSION_DENIED";
    else if (pgErr.code?.startsWith("42")) code = "BAD_SQL";
    throw new SafeRunnerError(pgErr.message, code);
  } finally {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    client.release();
  }
}
