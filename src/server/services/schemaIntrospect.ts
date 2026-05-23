import { getPool } from "../db/pool.js";
import { cached } from "./redis.js";
import { getScenario, SCENARIOS, type ScenarioMeta } from "./scenarios.js";

export interface Column {
  name: string;
  dataType: string;
  isNullable: boolean;
  isPrimaryKey: boolean;
  softRef?: { schema: string; table: string; column: string };
}

export interface Index {
  name: string;
  columns: string[];
  isUnique: boolean;
  using: string; // "btree" | "brin" | etc.
  isPartial: boolean;
}

export interface Table {
  name: string;
  rowCount: number;
  columns: Column[];
  primaryKey: string[];
  indexes: Index[];
}

export interface ForeignKey {
  from: { schema: string; table: string; column: string };
  to: { schema: string; table: string; column: string };
  kind: "intra_schema" | "cross_schema_same_scenario" | "cross_scenario_soft";
}

export interface SchemaSchema {
  name: string;
  tables: Table[];
}

export interface ScenarioSchema {
  scenario: string;
  schemas: SchemaSchema[];
  fks: ForeignKey[];
  seedQuestions: ScenarioMeta["seedQuestions"];
  totals: { tables: number; rows: number };
}

interface OverviewRow {
  slug: string;
  name: string;
  industryAnalog: string;
  tagline: string;
  schemas: string[];
  accentVar: string;
  tableCount: number;
  rowCount: number;
}

// Quick per-scenario header data for the left pane. Computes tableCount +
// rowCount across all sub-schemas in one query. Cached 5 min.
export async function listScenarios(): Promise<OverviewRow[]> {
  return cached("pg-inspector:scenarios:list:v2", 300, async () => {
    const pool = getPool();
    const allSchemas = SCENARIOS.flatMap((s) => s.schemas);
    const { rows: counts } = await pool.query<{ schema: string; tables: string }>(
      `SELECT table_schema AS schema, COUNT(*)::text AS tables
       FROM information_schema.tables
       WHERE table_schema = ANY($1::text[]) AND table_type='BASE TABLE'
       GROUP BY table_schema`,
      [allSchemas],
    );
    const tableCounts = new Map(counts.map((c) => [c.schema, Number(c.tables)]));

    const out: OverviewRow[] = [];
    for (const s of SCENARIOS) {
      // Row count via pg_stat_user_tables (reltuples-based). It's an
      // estimate but cheap. Live COUNT(*) on a multi-million-row table
      // would be wasteful for a left-pane label.
      const { rows: pgStat } = await pool.query<{ total: string }>(
        `SELECT COALESCE(SUM(n_live_tup), 0)::text AS total
         FROM pg_stat_user_tables WHERE schemaname = ANY($1::text[])`,
        [s.schemas],
      );
      out.push({
        slug: s.slug,
        name: s.name,
        industryAnalog: s.industryAnalog,
        tagline: s.tagline,
        schemas: [...s.schemas],
        accentVar: s.accentVar,
        tableCount: s.schemas.reduce((acc, sc) => acc + (tableCounts.get(sc) ?? 0), 0),
        rowCount: Number(pgStat[0]?.total ?? "0"),
      });
    }
    return out;
  });
}

// Full per-scenario schema. Cached 5 min.
export async function getScenarioSchema(slug: string): Promise<ScenarioSchema | undefined> {
  const meta = getScenario(slug);
  if (!meta) return undefined;

  return cached(`pg-inspector:scenarios:schema:v2:${slug}`, 300, async () => {
    const pool = getPool();

    // Columns + types + nullability + PK membership
    const { rows: colRows } = await pool.query<{
      table_schema: string;
      table_name: string;
      column_name: string;
      data_type: string;
      is_nullable: "YES" | "NO";
      is_pk: boolean;
      soft_ref: string | null;
    }>(
      `SELECT
         c.table_schema, c.table_name, c.column_name,
         c.data_type, c.is_nullable,
         EXISTS (
           SELECT 1 FROM pg_constraint pc
           WHERE pc.contype='p'
             AND pc.conrelid = (c.table_schema||'.'||c.table_name)::regclass
             AND c.column_name = ANY (
               SELECT a.attname FROM pg_attribute a
               WHERE a.attrelid = pc.conrelid AND a.attnum = ANY(pc.conkey)
             )
         ) AS is_pk,
         pgd.description AS soft_ref
       FROM information_schema.columns c
       LEFT JOIN pg_class pc ON pc.relname = c.table_name AND pc.relnamespace = (
         SELECT oid FROM pg_namespace WHERE nspname = c.table_schema
       )
       LEFT JOIN pg_attribute pa ON pa.attrelid = pc.oid AND pa.attname = c.column_name
       LEFT JOIN pg_description pgd ON pgd.objoid = pa.attrelid
         AND pgd.objsubid = pa.attnum
         AND pgd.description LIKE 'soft_ref:%'
       WHERE c.table_schema = ANY($1::text[])
       ORDER BY c.table_schema, c.table_name, c.ordinal_position`,
      [meta.schemas],
    );

    // Indexes
    const { rows: idxRows } = await pool.query<{
      schemaname: string;
      tablename: string;
      indexname: string;
      indexdef: string;
    }>(
      `SELECT schemaname, tablename, indexname, indexdef
       FROM pg_indexes WHERE schemaname = ANY($1::text[])`,
      [meta.schemas],
    );

    // Real FKs (intra-scenario, may cross schemas inside scenario)
    const { rows: fkRows } = await pool.query<{
      from_schema: string;
      from_table: string;
      from_column: string;
      to_schema: string;
      to_table: string;
      to_column: string;
    }>(
      `SELECT
         n1.nspname AS from_schema, c1.relname AS from_table, a1.attname AS from_column,
         n2.nspname AS to_schema,   c2.relname AS to_table,   a2.attname AS to_column
       FROM pg_constraint con
       JOIN pg_class c1 ON c1.oid = con.conrelid
       JOIN pg_namespace n1 ON n1.oid = c1.relnamespace
       JOIN pg_attribute a1 ON a1.attrelid = c1.oid AND a1.attnum = con.conkey[1]
       JOIN pg_class c2 ON c2.oid = con.confrelid
       JOIN pg_namespace n2 ON n2.oid = c2.relnamespace
       JOIN pg_attribute a2 ON a2.attrelid = c2.oid AND a2.attnum = con.confkey[1]
       WHERE con.contype = 'f'
         AND n1.nspname = ANY($1::text[])`,
      [meta.schemas],
    );

    // Row counts per table via pg_stat_user_tables (estimates)
    const { rows: rcRows } = await pool.query<{
      schemaname: string;
      relname: string;
      n_live_tup: string;
    }>(
      `SELECT schemaname, relname, n_live_tup::text
       FROM pg_stat_user_tables WHERE schemaname = ANY($1::text[])`,
      [meta.schemas],
    );
    const rowCountMap = new Map(
      rcRows.map((r) => [`${r.schemaname}.${r.relname}`, Number(r.n_live_tup)]),
    );

    // Build the column tree
    const tableMap = new Map<
      string,
      { schema: string; name: string; columns: Column[]; pk: string[] }
    >();
    for (const r of colRows) {
      const key = `${r.table_schema}.${r.table_name}`;
      let t = tableMap.get(key);
      if (!t) {
        t = { schema: r.table_schema, name: r.table_name, columns: [], pk: [] };
        tableMap.set(key, t);
      }
      let softRef: Column["softRef"] | undefined;
      if (r.soft_ref) {
        const m = r.soft_ref.match(/soft_ref:\s*(\w+)\.(\w+)\.(\w+)/);
        if (m && m[1] && m[2] && m[3]) softRef = { schema: m[1], table: m[2], column: m[3] };
      }
      t.columns.push({
        name: r.column_name,
        dataType: r.data_type,
        isNullable: r.is_nullable === "YES",
        isPrimaryKey: r.is_pk,
        ...(softRef ? { softRef } : {}),
      });
      if (r.is_pk) t.pk.push(r.column_name);
    }

    // Indexes per table
    const indexMap = new Map<string, Index[]>();
    for (const r of idxRows) {
      const key = `${r.schemaname}.${r.tablename}`;
      const using = (/USING\s+(\w+)/i.exec(r.indexdef)?.[1] ?? "btree").toLowerCase();
      const isUnique = /\bUNIQUE\b/i.test(r.indexdef);
      const isPartial = /\bWHERE\b/i.test(r.indexdef);
      const colsMatch = /\(([^)]+)\)/.exec(r.indexdef);
      const columns = colsMatch?.[1]?.split(",").map((c) => c.trim()) ?? [];
      const list = indexMap.get(key) ?? [];
      list.push({ name: r.indexname, columns, isUnique, using, isPartial });
      indexMap.set(key, list);
    }

    // Build schemas grouped
    const schemaTables = new Map<string, Table[]>();
    for (const sc of meta.schemas) schemaTables.set(sc, []);
    for (const t of tableMap.values()) {
      schemaTables.get(t.schema)?.push({
        name: t.name,
        rowCount: rowCountMap.get(`${t.schema}.${t.name}`) ?? 0,
        columns: t.columns,
        primaryKey: t.pk,
        indexes: indexMap.get(`${t.schema}.${t.name}`) ?? [],
      });
    }
    const schemas: SchemaSchema[] = meta.schemas.map((name) => ({
      name,
      tables: (schemaTables.get(name) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
    }));

    // Build FK list with kind classification
    const fks: ForeignKey[] = fkRows.map((r) => {
      const sameSchema = r.from_schema === r.to_schema;
      return {
        from: { schema: r.from_schema, table: r.from_table, column: r.from_column },
        to: { schema: r.to_schema, table: r.to_table, column: r.to_column },
        kind: sameSchema ? "intra_schema" : "cross_schema_same_scenario",
      };
    });

    // Add cross-scenario soft refs from the column comments
    for (const sch of schemas) {
      for (const t of sch.tables) {
        for (const c of t.columns) {
          if (c.softRef) {
            fks.push({
              from: { schema: sch.name, table: t.name, column: c.name },
              to: c.softRef,
              kind: "cross_scenario_soft",
            });
          }
        }
      }
    }

    const totals = {
      tables: schemas.reduce((a, s) => a + s.tables.length, 0),
      rows: schemas.reduce((a, s) => a + s.tables.reduce((aa, t) => aa + t.rowCount, 0), 0),
    };

    return { scenario: slug, schemas, fks, seedQuestions: [...meta.seedQuestions], totals };
  });
}

// Paged table data. Schema + table validated against the scenario's
// table list before any SQL is built — no string interpolation of unverified
// names into the query.
export async function getTablePage(
  slug: string,
  tableName: string,
  limit: number,
  offset: number,
): Promise<
  { columns: string[]; rows: Record<string, unknown>[]; totalRowCount: number } | undefined
> {
  const sch = await getScenarioSchema(slug);
  if (!sch) return undefined;
  let schemaName: string | undefined;
  let table: Table | undefined;
  for (const s of sch.schemas) {
    const found = s.tables.find((t) => t.name === tableName);
    if (found) {
      schemaName = s.name;
      table = found;
      break;
    }
  }
  if (!schemaName || !table) return undefined;

  const pool = getPool();
  const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));
  const safeOffset = Math.max(0, Math.floor(offset));
  // Identifier interpolated is the schema + table NAME, but both were just
  // validated against the schemaIntrospect output. quote_ident-style escape
  // is the right tool but pg's parameter binding doesn't cover identifiers,
  // so we use a strict identifier regex check as the second layer.
  if (!/^[a-z_][a-z0-9_]*$/.test(schemaName) || !/^[a-z_][a-z0-9_]*$/.test(tableName)) {
    return undefined;
  }
  const { rows } = await pool.query(
    `SELECT * FROM "${schemaName}"."${tableName}" ORDER BY 1 LIMIT $1 OFFSET $2`,
    [safeLimit, safeOffset],
  );
  return {
    columns: table.columns.map((c) => c.name),
    rows: rows as Record<string, unknown>[],
    totalRowCount: table.rowCount,
  };
}
