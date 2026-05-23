import { Router } from "express";
import { z } from "zod";
import { getScenarioSchema, getTablePage, listScenarios } from "../services/schemaIntrospect.js";

export const scenariosRouter: Router = Router();

scenariosRouter.get("/api/scenarios", async (_req, res) => {
  const list = await listScenarios();
  res.json(list);
});

scenariosRouter.get("/api/scenarios/:slug", async (req, res) => {
  const slug = req.params.slug;
  const schema = await getScenarioSchema(slug);
  if (!schema) {
    res.status(404).json({ error: "scenario_not_found" });
    return;
  }
  res.json(schema);
});

const PageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

scenariosRouter.get("/api/scenarios/:slug/tables/:table", async (req, res) => {
  const parsed = PageQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "bad_query", issues: parsed.error.issues });
    return;
  }
  const page = await getTablePage(
    req.params.slug,
    req.params.table,
    parsed.data.limit,
    parsed.data.offset,
  );
  if (!page) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({
    columns: page.columns,
    rows: page.rows,
    totalRowCount: page.totalRowCount,
    page: {
      limit: parsed.data.limit,
      offset: parsed.data.offset,
      hasMore: page.rows.length === parsed.data.limit,
    },
  });
});
