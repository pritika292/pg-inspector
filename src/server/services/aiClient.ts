import { AzureOpenAI } from "openai";
import { DefaultAzureCredential, getBearerTokenProvider } from "@azure/identity";
import { config } from "../config.js";

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

// In-memory daily bucket. Reset at UTC midnight.
const DAILY_CAP = 200;

class BudgetBucket {
  private dayKey = todayUtcKey();
  private used = 0;

  spend(n = 1): void {
    const today = todayUtcKey();
    if (today !== this.dayKey) {
      this.dayKey = today;
      this.used = 0;
    }
    if (this.used + n > DAILY_CAP) throw new BudgetExceededError();
    this.used += n;
  }

  remaining(): number {
    const today = todayUtcKey();
    if (today !== this.dayKey) return DAILY_CAP;
    return DAILY_CAP - this.used;
  }

  reset(): void {
    this.dayKey = todayUtcKey();
    this.used = 0;
  }
}

function todayUtcKey(): string {
  return new Date().toISOString().slice(0, 10);
}

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

  const budget = new BudgetBucket();
  const deployment = config.AZURE_OPENAI_DEPLOYMENT;

  return {
    async chat(opts: ChatOptions): Promise<string> {
      budget.spend(1);
      const res = await client.chat.completions.create({
        model: deployment,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
        max_completion_tokens: opts.maxOutputTokens ?? 500,
        temperature: opts.temperature ?? 0.1,
      });
      return res.choices[0]?.message?.content ?? "";
    },

    async *chatStream(opts: ChatOptions): AsyncIterable<string> {
      budget.spend(1);
      const stream = await client.chat.completions.create({
        model: deployment,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
        max_completion_tokens: opts.maxOutputTokens ?? 1000,
        temperature: opts.temperature ?? 0.2,
        stream: true,
      });
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) yield delta;
      }
    },

    budgetRemaining: () => budget.remaining(),
    resetBudgetForTest: () => budget.reset(),
  };
}
