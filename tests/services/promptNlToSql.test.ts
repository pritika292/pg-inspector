import { describe, expect, it } from "vitest";
import {
  parseNlToSqlResponse,
  serializeSchemaForPrompt,
  buildNlToSqlPrompt,
} from "../../src/server/services/promptNlToSql.js";
import type { ScenarioSchema } from "../../src/server/services/schemaIntrospect.js";

describe("parseNlToSqlResponse", () => {
  it("returns bare SQL", () => {
    expect(parseNlToSqlResponse("SELECT 1")).toEqual({ sql: "SELECT 1" });
  });

  it("trims leading/trailing whitespace", () => {
    expect(parseNlToSqlResponse("\n  SELECT 1  \n")).toEqual({ sql: "SELECT 1" });
  });

  it("returns CANNOT_ANSWER passthrough with a reason", () => {
    expect(parseNlToSqlResponse("CANNOT_ANSWER schema has no foo table")).toEqual({
      error: "CANNOT_ANSWER",
      reason: "schema has no foo table",
    });
  });

  it("returns CANNOT_ANSWER with default reason when none given", () => {
    expect(parseNlToSqlResponse("CANNOT_ANSWER")).toEqual({
      error: "CANNOT_ANSWER",
      reason: "no reason given",
    });
  });

  it("treats empty / whitespace-only model output as CANNOT_ANSWER", () => {
    expect(parseNlToSqlResponse("")).toMatchObject({ error: "CANNOT_ANSWER" });
    expect(parseNlToSqlResponse("   \n  ")).toMatchObject({ error: "CANNOT_ANSWER" });
  });

  it("extracts SQL from ```sql code fences", () => {
    const raw = "```sql\nSELECT 1\n```";
    expect(parseNlToSqlResponse(raw)).toEqual({ sql: "SELECT 1" });
  });

  it("extracts SQL from ```postgresql and ```postgres fences", () => {
    expect(parseNlToSqlResponse("```postgresql\nSELECT 1\n```")).toEqual({ sql: "SELECT 1" });
    expect(parseNlToSqlResponse("```postgres\nSELECT 1\n```")).toEqual({ sql: "SELECT 1" });
  });

  it("extracts SQL from an un-labeled ``` fence", () => {
    expect(parseNlToSqlResponse("```\nSELECT 1\n```")).toEqual({ sql: "SELECT 1" });
  });

  it("strips a 'Here's the SQL:' preamble", () => {
    const raw = "Here's the SQL to count posts:\n\nSELECT COUNT(*) FROM posts";
    expect(parseNlToSqlResponse(raw)).toEqual({ sql: "SELECT COUNT(*) FROM posts" });
  });

  it("extracts SQL from a fenced block even when surrounded by prose", () => {
    const raw = "Sure! Here's the query:\n\n```sql\nSELECT 1\n```\n\nThis returns one row.";
    expect(parseNlToSqlResponse(raw)).toEqual({ sql: "SELECT 1" });
  });

  it("handles multi-line SQL inside a fence", () => {
    const raw =
      "```sql\nSELECT a.name, COUNT(b.id)\nFROM accounts a\nLEFT JOIN orders b ON b.account_id = a.id\nGROUP BY a.name\n```";
    const out = parseNlToSqlResponse(raw);
    expect(out).toHaveProperty("sql");
    expect((out as { sql: string }).sql).toContain("SELECT a.name");
    expect((out as { sql: string }).sql).toContain("GROUP BY a.name");
  });

  it("does not pretend a model preamble is SQL when no obvious extraction works", () => {
    // The validator will catch this downstream; the parser shouldn't lie.
    const raw = "I don't know how to answer this.";
    const out = parseNlToSqlResponse(raw);
    expect(out).toHaveProperty("sql");
    expect((out as { sql: string }).sql).toBe("I don't know how to answer this.");
  });
});

describe("serializeSchemaForPrompt", () => {
  const fixture: ScenarioSchema = {
    scenario: "demo",
    schemas: [
      {
        name: "demo_identity",
        tables: [
          {
            name: "users",
            rowCount: 100,
            columns: [
              { name: "id", dataType: "integer", isNullable: false, isPrimaryKey: true },
              { name: "email", dataType: "text", isNullable: false, isPrimaryKey: false },
              { name: "karma", dataType: "integer", isNullable: true, isPrimaryKey: false },
            ],
            primaryKey: ["id"],
            indexes: [
              {
                name: "users_brin",
                columns: ["created_at"],
                isUnique: false,
                using: "brin",
                isPartial: false,
              },
            ],
          },
        ],
      },
    ],
    fks: [
      {
        from: { schema: "demo_identity", table: "users", column: "tenant_id" },
        to: { schema: "demo_billing", table: "tenants", column: "id" },
        kind: "cross_schema_same_scenario",
      },
      {
        from: { schema: "demo_identity", table: "users", column: "soft" },
        to: { schema: "other_scenario", table: "users", column: "id" },
        kind: "cross_scenario_soft",
      },
    ],
    seedQuestions: [],
    totals: { tables: 1, rows: 100 },
  };

  it("includes table + column types", () => {
    const text = serializeSchemaForPrompt(fixture);
    expect(text).toContain("demo_identity.users");
    expect(text).toContain("id integer PK NOT NULL");
    expect(text).toContain("email text NOT NULL");
    expect(text).toContain("karma integer");
  });

  it("calls out non-btree indexes (BRIN etc) since they affect query shape", () => {
    const text = serializeSchemaForPrompt(fixture);
    expect(text).toMatch(/index users_brin: brin on \(created_at\)/);
  });

  it("includes intra-scenario FKs but omits cross-scenario soft refs (those are noise for SQL gen)", () => {
    const text = serializeSchemaForPrompt(fixture);
    expect(text).toContain("fk: demo_identity.users.tenant_id -> demo_billing.tenants.id");
    expect(text).not.toContain("soft");
    expect(text).not.toContain("other_scenario.users.id");
  });
});

describe("buildNlToSqlPrompt", () => {
  it("includes both schema text and question in user message", () => {
    const fixture: ScenarioSchema = {
      scenario: "demo",
      schemas: [
        {
          name: "demo_x",
          tables: [
            {
              name: "t",
              rowCount: 0,
              columns: [{ name: "id", dataType: "int", isNullable: false, isPrimaryKey: true }],
              primaryKey: ["id"],
              indexes: [],
            },
          ],
        },
      ],
      fks: [],
      seedQuestions: [],
      totals: { tables: 1, rows: 0 },
    };
    const p = buildNlToSqlPrompt(fixture, "how many rows?");
    expect(p.user).toContain("Schema:");
    expect(p.user).toContain("demo_x.t");
    expect(p.user).toContain("Question: how many rows?");
    expect(p.system).toMatch(/SELECT only/);
  });
});
