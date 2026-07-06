import { AzureOpenAI } from "openai";
import { DefaultAzureCredential, getBearerTokenProvider } from "@azure/identity";
import { config } from "../config.js";
import { reportAiUsage } from "./aiUsageEmit.js";
import { reserveDailyAiRun } from "./dailyLimit.js";

// Azure OpenAI client wired through Managed Identity (prod: VM's
// System-Assigned Identity; local dev: az login user's identity via
// DefaultAzureCredential cascade). No API key. The VM identity already
// has 'Cognitive Services User' on pritika-ai; local users need the same.

export class BudgetExceededError extends Error {
  constructor() {
    super("daily AI budget exceeded");
    this.name = "BudgetExceededError";
  }
}

export interface ChatOptions {
  system: string;
  user: string;
  maxOutputTokens?: number;
  temperature?: number;
}

export interface AiClient {
  chat(opts: ChatOptions): Promise<string>;
  chatStream(opts: ChatOptions): AsyncIterable<string>;
  budgetRemaining(): number;
  resetBudgetForTest(): void;
}

// The daily AI-run cap now lives in Redis (see services/dailyLimit.ts) so it
// survives container restarts. BudgetExceededError is still thrown when the
// cap is hit, and the routes still map it to a 429.

let singleton: AiClient | undefined;

export function getAiClient(): AiClient {
  if (!singleton) singleton = makeRealClient();
  return singleton;
}

// Test seam: inject a fake client. Resets when getAiClient() is called again.
export function setAiClientForTests(client: AiClient | undefined): void {
  singleton = client;
}

function makeRealClient(): AiClient {
  if (config.NODE_ENV === "production" && !config.AZURE_OPENAI_ENDPOINT.startsWith("https://")) {
    throw new Error("AZURE_OPENAI_ENDPOINT missing or invalid in production");
  }

  const credential = new DefaultAzureCredential();
  const azureADTokenProvider = getBearerTokenProvider(
    credential,
    "https://cognitiveservices.azure.com/.default",
  );

  const client = new AzureOpenAI({
    azureADTokenProvider,
    apiVersion: config.AZURE_OPENAI_API_VERSION,
    endpoint: config.AZURE_OPENAI_ENDPOINT,
  });

  const deployment = config.AZURE_OPENAI_DEPLOYMENT;

  return {
    async chat(opts: ChatOptions): Promise<string> {
      if (!(await reserveDailyAiRun())) throw new BudgetExceededError();
      const res = await client.chat.completions.create({
        model: deployment,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
        max_completion_tokens: opts.maxOutputTokens ?? 500,
        temperature: opts.temperature ?? 0.1,
      });
      // Report tokens to controlroom for the cross-family dashboard tiles.
      // Fire-and-forget; never blocks the response.
      reportAiUsage(deployment, res.usage?.prompt_tokens ?? 0, res.usage?.completion_tokens ?? 0);
      return res.choices[0]?.message?.content ?? "";
    },

    async *chatStream(opts: ChatOptions): AsyncIterable<string> {
      if (!(await reserveDailyAiRun())) throw new BudgetExceededError();
      const stream = await client.chat.completions.create({
        model: deployment,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
        max_completion_tokens: opts.maxOutputTokens ?? 1000,
        temperature: opts.temperature ?? 0.2,
        stream: true,
        // Last chunk carries a `usage` block when this is on.
        stream_options: { include_usage: true },
      });
      let prompt = 0;
      let completion = 0;
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) yield delta;
        if (chunk.usage) {
          prompt = chunk.usage.prompt_tokens ?? 0;
          completion = chunk.usage.completion_tokens ?? 0;
        }
      }
      reportAiUsage(deployment, prompt, completion);
    },

    // budgetRemaining/resetBudgetForTest are retained for the AiClient
    // interface + test seam. The real cap now lives in Redis (dailyLimit.ts);
    // the live remaining count isn't cheaply available synchronously here and
    // isn't used in production, so report the configured ceiling.
    budgetRemaining: () => config.AI_DAILY_LIMIT,
    resetBudgetForTest: () => undefined,
  };
}
