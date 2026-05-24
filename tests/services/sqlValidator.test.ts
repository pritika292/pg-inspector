import { describe, expect, it } from "vitest";
import { validateSelectOnly } from "../../src/server/services/sqlValidator.js";

describe("validateSelectOnly", () => {
  const accept = (sql: string) => {
    const r = validateSelectOnly(sql);
    expect(r, sql).toEqual({ ok: true });
  };
  const reject = (sql: string, contains?: string) => {
    const r = validateSelectOnly(sql);
    expect(r.ok, sql).toBe(false);
    if (contains) expect((r as { ok: false; reason: string }).reason).toMatch(contains);
  };

  it("accepts plain SELECT", () => {
    accept("SELECT 1");
    accept("SELECT * FROM posts");
    accept("SELECT id, title FROM sm_content.posts WHERE score > 100");
  });

  it("accepts SELECT with WHERE, JOIN, GROUP BY, ORDER BY, LIMIT", () => {
    accept(
      "SELECT a.id, COUNT(b.id) FROM accounts a JOIN orders b ON b.account_id=a.id " +
        "WHERE b.status='paid' GROUP BY a.id ORDER BY 2 DESC LIMIT 10",
    );
  });

  it("accepts SELECT with subquery in WHERE", () => {
    accept("SELECT * FROM posts WHERE author_id IN (SELECT id FROM users WHERE karma > 100)");
  });

  it("accepts WITH ... SELECT (read-only CTE)", () => {
    accept("WITH hot AS (SELECT * FROM posts WHERE score > 100) SELECT * FROM hot LIMIT 10");
  });

  it("rejects INSERT", () => {
    reject("INSERT INTO posts (title) VALUES ('x')", /not allowed/);
  });

  it("rejects UPDATE", () => {
    reject("UPDATE posts SET score = 0", /not allowed/);
  });

  it("rejects DELETE", () => {
    reject("DELETE FROM posts", /not allowed/);
  });

  it("rejects CREATE TABLE", () => {
    reject("CREATE TABLE x(id INT)", /not allowed/);
  });

  it("rejects ALTER TABLE", () => {
    reject("ALTER TABLE posts ADD COLUMN x INT", /not allowed/);
  });

  it("rejects DROP TABLE", () => {
    reject("DROP TABLE posts", /not allowed/);
  });

  it("rejects TRUNCATE", () => {
    reject("TRUNCATE posts", /not allowed/);
  });

  it("rejects statement chaining via ;", () => {
    reject("SELECT 1; SELECT 2", /multiple statements/);
  });

  it("rejects WITH containing a modifying CTE", () => {
    reject(
      "WITH x AS (INSERT INTO posts (title) VALUES ('x') RETURNING id) SELECT * FROM x",
      /must be a SELECT/,
    );
  });

  it("rejects malformed SQL", () => {
    reject("SELECT *** FROM", /parse error/);
  });

  it("rejects empty input", () => {
    reject("", /empty/);
  });

  it("rejects whitespace-only input", () => {
    reject("   \n  \t  ", /empty/);
  });

  it("accepts SELECT ending with a single trailing semicolon", () => {
    accept("SELECT 1;");
    accept("SELECT 1;\n");
    accept("SELECT 1;   ");
  });

  it("accepts SELECT with leading/trailing whitespace", () => {
    accept("  SELECT 1  ");
    accept("\n\nSELECT 1\n\n");
  });

  it("accepts SELECT with leading and trailing block comments", () => {
    accept("/* preamble */ SELECT 1");
    accept("SELECT 1 /* trailing */");
  });

  it("accepts SELECT with line comment at the end", () => {
    accept("SELECT 1 -- ok");
  });

  it("accepts WITH RECURSIVE that walks a SELECT", () => {
    accept(
      "WITH RECURSIVE t(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM t WHERE n < 5) SELECT * FROM t",
    );
  });

  it("accepts SELECT with window functions + DISTINCT ON", () => {
    accept(
      "SELECT DISTINCT ON (author_id) author_id, score, " +
        "ROW_NUMBER() OVER (PARTITION BY author_id ORDER BY score DESC) AS rn " +
        "FROM posts ORDER BY author_id, score DESC",
    );
  });

  it("accepts SELECT with UNION ALL", () => {
    accept("SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3");
  });

  it("rejects VALUES (non-SELECT statement type)", () => {
    reject("VALUES (1, 2, 3)", /not allowed|values/i);
  });

  it("rejects SHOW (Postgres meta-command)", () => {
    reject("SHOW search_path", /not allowed/);
  });

  it("rejects MERGE", () => {
    reject(
      "MERGE INTO posts USING orders ON 1=1 WHEN MATCHED THEN DO NOTHING",
      /not allowed|parse/i,
    );
  });

  it("rejects COPY", () => {
    reject("COPY posts TO STDOUT", /not allowed|parse/i);
  });

  it("rejects multi-statement even with leading/trailing whitespace", () => {
    reject("  SELECT 1;  SELECT 2;  ", /multiple statements/);
  });

  it("rejects modifying CTE inside RECURSIVE WITH", () => {
    reject(
      "WITH RECURSIVE x AS (DELETE FROM posts RETURNING id) SELECT * FROM x",
      /must be a SELECT|parse/i,
    );
  });

  it("rejects user-prefixed EXPLAIN (we add EXPLAIN ourselves; double-EXPLAIN parses funny)", () => {
    // pgsql-ast-parser rejects bare EXPLAIN; even if it didn't, the wrap layer
    // would produce SELECT * FROM (EXPLAIN ANALYZE ...) which Postgres rejects.
    reject("EXPLAIN SELECT 1", /parse|not allowed/i);
  });
});
