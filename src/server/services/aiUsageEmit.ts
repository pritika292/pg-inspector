// Fire-and-forget reporter that POSTs per-call usage to controlroom's
// /api/ai-usage/:slug endpoint. controlroom aggregates calls / tokens /
// est cost across the family and surfaces them on the public dashboard.
//
// Best-effort. The chat() path doesn't await this — telemetry must never
// add latency to the AI response and a controlroom hiccup must never
// surface as a 5xx to the pg-inspector visitor.

const INGEST_URL = "https://controlroom.pritika.studio/api/ai-usage/pg-inspector";

// Per-1M-token prices in USD, as of 2026 for the deployments we run.
// Numbers are best-effort estimates; controlroom stores what we report so
// adjustments here automatically update the dashboard's cost tile.
const PRICE_PER_M_USD: Record<string, { prompt: number; completion: number }> = {
  "gpt-4.1-mini": { prompt: 0.4, completion: 1.6 },
  "gpt-4o-mini": { prompt: 0.15, completion: 0.6 },
  "gpt-4o": { prompt: 2.5, completion: 10.0 },
};

const FALLBACK_PRICE = { prompt: 0.4, completion: 1.6 };

function estCostCents(model: string, promptTokens: number, completionTokens: number): number {
  const price = PRICE_PER_M_USD[model] ?? FALLBACK_PRICE;
  const dollars =
    (promptTokens / 1_000_000) * price.prompt + (completionTokens / 1_000_000) * price.completion;
  return dollars * 100;
}

export function reportAiUsage(model: string, promptTokens: number, completionTokens: number): void {
  // Skip in tests to keep them deterministic and offline-friendly.
  if (process.env["NODE_ENV"] === "test") return;
  // Skip if usage didn't come back (some streaming paths).
  if (promptTokens < 0 || completionTokens < 0) return;

  const body = JSON.stringify({
    model,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    est_cost_cents: estCostCents(model, promptTokens, completionTokens),
  });

  void fetch(INGEST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  }).catch(() => {
    // Swallow. Telemetry must not crash the caller.
  });
}
