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
});
