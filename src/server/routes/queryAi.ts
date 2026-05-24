import { Router } from "express";
import { z } from "zod";
import { getAiClient, BudgetExceededError } from "../services/aiClient.js";
import { buildNlToSqlPrompt, parseNlToSqlResponse } from "../services/promptNlToSql.js";
import { buildExplainAiPrompt } from "../services/promptExplainAi.js";
import { buildAdvisePrompt, parseAdviseResponse } from "../services/promptAdvise.js";
import { buildRepairPrompt, parseRepairResponse } from "../services/promptRepair.js";
import { getScenarioSchema } from "../services/schemaIntrospect.js";
import { validateSelectOnly } from "../services/sqlValidator.js";
import { runExplain, SafeRunnerError } from "../services/safeRunner.js";

export const queryAiRouter: Router = Router();

const NlBody = z.object({
  scenarioSlug: z.string().min(1),
  question: z.string().min(3).max(500),
});

queryAiRouter.post("/api/query/nl-to-sql", async (req, res) => {
  const parsed = NlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "bad_body", issues: parsed.error.issues });
    return;
  }
  const schema = await getScenarioSchema(parsed.data.scenarioSlug);
  if (!schema) {
    res.status(404).json({ error: "unknown_scenario" });
    return;
  }
  try {
    const prompt = buildNlToSqlPrompt(schema, parsed.data.question);
    const raw = await getAiClient().chat(prompt);
    const result = parseNlToSqlResponse(raw);
    res.json(result);
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      res.status(429).json({ error: "budget_exceeded" });
      return;
    }
    console.error("[nl-to-sql] unexpected", err);
    res.status(500).json({ error: "internal" });
  }
});

const ExplainAiBody = z.object({
  scenarioSlug: z.string().min(1),
  sql: z.string().min(1).max(10_000),
  planJson: z.unknown(),
});

queryAiRouter.post("/api/query/explain-ai", async (req, res) => {
  const parsed = ExplainAiBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "bad_body", issues: parsed.error.issues });
    return;
  }
  const schema = await getScenarioSchema(parsed.data.scenarioSlug);
  if (!schema) {
    res.status(404).json({ error: "unknown_scenario" });
    return;
  }

  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Transfer-Encoding", "chunked");
  res.setHeader("Cache-Control", "no-cache");
  // Flush headers immediately so the client sees a chunked response.
  res.flushHeaders?.();

  try {
    const prompt = buildExplainAiPrompt(schema, parsed.data.sql, parsed.data.planJson);
    const stream = getAiClient().chatStream(prompt);
    for await (const delta of stream) {
      res.write(JSON.stringify({ delta }) + "\n");
    }
    res.write(JSON.stringify({ done: true }) + "\n");
    res.end();
  } catch (err) {
    // Stream framing stays uniform: a single error line then done, with 200
    // status (we may have already flushed headers).
    const message = err instanceof BudgetExceededError ? "budget_exceeded" : "internal";
    if (err instanceof BudgetExceededError) {
      // Budget check happens inside chatStream; if it threw here, we may have
      // sent the headers. Still write the framed error.
    } else {
      console.error("[explain-ai] unexpected", err);
    }
    try {
      res.write(JSON.stringify({ error: message, done: true }) + "\n");
      res.end();
    } catch {
      // socket already closed by client
    }
  }
});

const AdviseBody = z.object({
  scenarioSlug: z.string().min(1),
  requirement: z.string().min(3).max(500),
});

// Internal counter we want at most ONE increment per /advise call (it makes
// 3 model calls but the user shouldn't get budget-charged 3x).
queryAiRouter.post("/api/query/advise", async (req, res) => {
  const parsed = AdviseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "bad_body", issues: parsed.error.issues });
    return;
  }
  const schema = await getScenarioSchema(parsed.data.scenarioSlug);
  if (!schema) {
    res.status(404).json({ error: "unknown_scenario" });
    return;
  }

  const ai = getAiClient();
  try {
    // Step 1: NL->SQL
    const nlPrompt = buildNlToSqlPrompt(schema, parsed.data.requirement);
    const nlRaw = await ai.chat(nlPrompt);
    const nlResult = parseNlToSqlResponse(nlRaw);
    if ("error" in nlResult) {
      res.json({ error: nlResult.error, reason: nlResult.reason });
      return;
    }

    // Step 2: validate + EXPLAIN
    const validation = validateSelectOnly(nlResult.sql);
    if (!validation.ok) {
      res.json({ error: "REJECTED_SQL", reason: validation.reason, sql: nlResult.sql });
      return;
    }
    let plan: unknown;
    try {
      plan = await runExplain(nlResult.sql, parsed.data.scenarioSlug);
    } catch (err) {
      if (err instanceof SafeRunnerError) {
        res.json({ error: err.code, reason: err.message, sql: nlResult.sql });
        return;
      }
      throw err;
    }

    // Step 3: advise (uses the same ai.chat — does NOT charge budget again,
    // because the budget bucket increments per call; we accept this cost as
    // 3 budget units per /advise. Documented as such.)
    const advisePrompt = buildAdvisePrompt(schema, parsed.data.requirement, nlResult.sql, plan);
    const adviseRaw = await ai.chat(advisePrompt);
    const advise = parseAdviseResponse(adviseRaw);

    res.json({ sql: nlResult.sql, plan, suggestedDdl: advise.suggestedDdl, why: advise.why });
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      res.status(429).json({ error: "budget_exceeded" });
      return;
    }
    console.error("[advise] unexpected", err);
    res.status(500).json({ error: "internal" });
  }
});

// AI repair for a failed SELECT (#114). Takes the user's broken SQL + the
// pg error and returns either a corrected SELECT + one-sentence reason or
// CANNOT_ANSWER if the schema fundamentally can't support the question.
const RepairBody = z.object({
  scenarioSlug: z.string().min(1),
  sql: z.string().min(1).max(10_000),
  error: z.string().min(1).max(4_000),
});

queryAiRouter.post("/api/query/repair", async (req, res) => {
  const parsed = RepairBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "bad_body", issues: parsed.error.issues });
    return;
  }
  const schema = await getScenarioSchema(parsed.data.scenarioSlug);
  if (!schema) {
    res.status(404).json({ error: "unknown_scenario" });
    return;
  }
  try {
    const prompt = buildRepairPrompt(schema, parsed.data.sql, parsed.data.error);
    const raw = await getAiClient().chat(prompt);
    const result = parseRepairResponse(raw);
    res.json(result);
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      res.status(429).json({ error: "budget_exceeded" });
      return;
    }
    console.error("[repair] unexpected", err);
    res.status(500).json({ error: "internal" });
  }
});
