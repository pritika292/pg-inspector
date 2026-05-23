// Mirrored from server/services/schemaIntrospect.ts. Kept here so the
// client doesn't import from server.

export interface ScenarioListEntry {
  slug: string;
  name: string;
  industryAnalog: string;
  tagline: string;
  schemas: string[];
  accentVar: string;
  tableCount: number;
  rowCount: number;
}

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
  using: string;
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

export interface SeedQuestion {
  label: string;
  sql: string;
  why: string;
}

export interface ScenarioSchema {
  scenario: string;
  schemas: SchemaSchema[];
  fks: ForeignKey[];
  seedQuestions: SeedQuestion[];
  totals: { tables: number; rows: number };
}

export interface TablePage {
  columns: string[];
  rows: Record<string, unknown>[];
  totalRowCount: number;
  page: { limit: number; offset: number; hasMore: boolean };
}

export interface RunResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  elapsedMs: number;
  truncated: boolean;
}

export interface ExplainPlan {
  Plan: Record<string, unknown>;
  "Planning Time"?: number;
  "Execution Time"?: number;
}

export type ExplainResult = ExplainPlan[];

export interface AdviseResult {
  sql?: string;
  plan?: ExplainResult;
  suggestedDdl?: string[];
  why?: string;
  error?: string;
  reason?: string;
}

export interface NlToSqlResult {
  sql?: string;
  error?: "CANNOT_ANSWER";
  reason?: string;
}
