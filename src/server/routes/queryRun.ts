import { Router } from "express";
import { z } from "zod";
import { validateSelectOnly } from "../services/sqlValidator.js";
import { runReadOnly, runExplain, SafeRunnerError } from "../services/safeRunner.js";

export const queryRouter: Router = Router();

const RunBody = z.object({
  scenarioSlug: z.string().min(1),
  sql: z.string().min(1).max(10_000),
});

queryRouter.post("/api/query/run", async (req, res) => {
  const parsed = RunBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "bad_body", issues: parsed.error.issues });
    return;
  }
  const validation = validateSelectOnly(parsed.data.sql);
  if (!validation.ok) {
    res.status(400).json({ error: "rejected_sql", reason: validation.reason });
    return;
  }
  try {
    const result = await runReadOnly(parsed.data.sql, parsed.data.scenarioSlug);
    res.json(result);
  } catch (err) {
    handleRunError(err, res);
  }
});

queryRouter.post("/api/query/explain", async (req, res) => {
  const parsed = RunBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "bad_body", issues: parsed.error.issues });
    return;
  }
  const validation = validateSelectOnly(parsed.data.sql);
  if (!validation.ok) {
    res.status(400).json({ error: "rejected_sql", reason: validation.reason });
    return;
  }
  try {
    const plan = await runExplain(parsed.data.sql, parsed.data.scenarioSlug);
    res.json({ plan });
  } catch (err) {
    handleRunError(err, res);
  }
});

function handleRunError(err: unknown, res: import("express").Response): void {
  if (err instanceof SafeRunnerError) {
    if (err.code === "UNKNOWN_SCENARIO") {
      res.status(404).json({ error: "unknown_scenario" });
      return;
    }
    // Everything else we report as a 400 (the request was syntactically OK
    // but the SQL was bad — timeout, syntax, permission). Helps the UI show
    // a clean error banner instead of a 500.
    res.status(400).json({ error: err.code.toLowerCase(), reason: err.message });
    return;
  }
  console.error("[queryRun] unexpected", err);
  res.status(500).json({ error: "internal" });
}
