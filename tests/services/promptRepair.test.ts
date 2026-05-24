import { describe, expect, it } from "vitest";
import { buildRepairPrompt, parseRepairResponse } from "../../src/server/services/promptRepair.js";
import type { ScenarioSchema } from "../../src/server/services/schemaIntrospect.js";

const FIXTURE_SCHEMA: ScenarioSchema = {
  slug: "social_media",
  schemas: [
    {
      name: "social_media",
      tables: [
        {
          name: "posts",
          columns: [
            { name: "id", dataType: "bigint", isPrimaryKey: true, isNullable: false },
            { name: "title", dataType: "text", isPrimaryKey: false, isNullable: false },
            { name: "score", dataType: "integer", isPrimaryKey: false, isNullable: false },
          ],
          indexes: [],
          rowCount: 0,
        },
      ],
    },
  ],
  fks: [],
  seedQuestions: [],
};

describe("parseRepairResponse", () => {
  it("parses a clean WHY + FIX response", () => {
    const raw = `WHY
The column foo doesn't exist on posts; the closest match is score.

FIX
select title, score from posts order by score desc limit 10`;
    const r = parseRepairResponse(raw);
    expect(r).toHaveProperty("sql");
    if ("sql" in r) {
      expect(r.sql).toMatch(/select title, score/i);
      expect(r.why).toMatch(/foo doesn't exist/);
    }
  });

  it("strips ```sql fences inside the FIX block", () => {
    const raw = `WHY
Missing semicolon was extra.

FIX
\`\`\`sql
select id from posts limit 5
\`\`\``;
    const r = parseRepairResponse(raw);
    expect(r).toMatchObject({ sql: "select id from posts limit 5" });
  });

  it("returns CANNOT_ANSWER when the model declares it", () => {
    const raw = `WHY
The schema has no login timestamp column anywhere.

FIX
CANNOT_ANSWER no login-related column exists in any table`;
    const r = parseRepairResponse(raw);
    expect(r).toMatchObject({ error: "CANNOT_ANSWER" });
    if ("why" in r) expect(r.why).toMatch(/login/i);
  });

  it("treats empty model output as CANNOT_ANSWER", () => {
    expect(parseRepairResponse("")).toMatchObject({ error: "CANNOT_ANSWER" });
    expect(parseRepairResponse("   \n  ")).toMatchObject({ error: "CANNOT_ANSWER" });
  });

  it("falls back when WHY/FIX headers are missing — first line is the why, rest is SQL", () => {
    const raw = `score column should be int not text.\nselect title, score from posts`;
    const r = parseRepairResponse(raw);
    expect(r).toHaveProperty("sql");
    if ("sql" in r) {
      expect(r.why).toMatch(/score column/);
      expect(r.sql).toMatch(/select title, score/i);
    }
  });
});

describe("buildRepairPrompt", () => {
  it("embeds the failed SQL and pg error verbatim", () => {
    const p = buildRepairPrompt(
      FIXTURE_SCHEMA,
      "SELECT foo FROM posts",
      'ERROR: column "foo" does not exist',
    );
    expect(p.system).toContain("WHY");
    expect(p.system).toContain("FIX");
    expect(p.user).toContain("SELECT foo FROM posts");
    expect(p.user).toContain('column "foo" does not exist');
    expect(p.user).toContain("social_media.posts");
  });
});
