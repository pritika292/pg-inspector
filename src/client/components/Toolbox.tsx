import { useEffect, useState } from "react";
import clsx from "clsx";
import { QueryEditor } from "./QueryEditor.js";
import { TableView } from "./TableView.js";
import { PlanTree } from "./PlanTree.js";
import { AiCommentary } from "./AiCommentary.js";
import { AdvisePanel } from "./AdvisePanel.js";
import { apiGet, apiPost, apiPostStream, ApiError } from "../lib/api.js";
import type {
  AdviseResult,
  ExplainResult,
  NlToSqlResult,
  RunResult,
  ScenarioListEntry,
  ScenarioSchema,
} from "../lib/types.js";

interface Props {
  scenario: ScenarioListEntry;
}

type Tab = "results" | "plan" | "ai" | "advise";

interface State {
  sql: string;
  running: boolean;
  tab: Tab;
  runResult?: RunResult;
  runError?: string;
  plan?: ExplainResult;
  planError?: string;
  aiText: string;
  aiStreaming: boolean;
  advise?: AdviseResult;
  adviseLoading: boolean;
}

const TABS: { id: Tab; label: string }[] = [
  { id: "results", label: "RESULTS" },
  { id: "plan", label: "PLAN" },
  { id: "ai", label: "AI" },
  { id: "advise", label: "ADVISE" },
];

export function Toolbox({ scenario }: Props): JSX.Element {
  const [schema, setSchema] = useState<ScenarioSchema | undefined>(undefined);
  const [state, setState] = useState<State>({
    sql: "",
    running: false,
    tab: "results",
    aiText: "",
    aiStreaming: false,
    adviseLoading: false,
  });

  useEffect(() => {
    let cancelled = false;
    apiGet<ScenarioSchema>(`/api/scenarios/${scenario.slug}`)
      .then((data) => {
        if (cancelled) return;
        setSchema(data);
        setState({
          sql: "",
          running: false,
          tab: "results",
          aiText: "",
          aiStreaming: false,
          adviseLoading: false,
        });
      })
      .catch(() => {
        /* errors surface in Visualizer */
      });
    return () => {
      cancelled = true;
    };
  }, [scenario.slug]);

  const setSql = (sql: string): void => setState((s) => ({ ...s, sql }));

  async function run(): Promise<void> {
    setState((s) => ({ ...s, running: true, runError: undefined, tab: "results" }));
    try {
      const result = await apiPost<RunResult>("/api/query/run", {
        scenarioSlug: scenario.slug,
        sql: state.sql,
      });
      setState((s) => ({ ...s, running: false, runResult: result }));
    } catch (err) {
      setState((s) => ({ ...s, running: false, runError: errorMessage(err) }));
    }
  }

  async function explain(): Promise<void> {
    setState((s) => ({ ...s, running: true, planError: undefined, tab: "plan" }));
    try {
      const { plan } = await apiPost<{ plan: ExplainResult }>("/api/query/explain", {
        scenarioSlug: scenario.slug,
        sql: state.sql,
      });
      setState((s) => ({ ...s, running: false, plan }));
    } catch (err) {
      setState((s) => ({ ...s, running: false, planError: errorMessage(err) }));
    }
  }

  async function ask(): Promise<void> {
    // Tiny prompt: stay in-flow rather than open a modal for v1.
    const question = window.prompt(`Ask a question about the ${scenario.name} schema:`);
    if (!question) return;
    setState((s) => ({ ...s, running: true, tab: "results" }));
    try {
      const result = await apiPost<NlToSqlResult>("/api/query/nl-to-sql", {
        scenarioSlug: scenario.slug,
        question,
      });
      if (result.sql) {
        setState((s) => ({ ...s, running: false, sql: result.sql! }));
      } else {
        setState((s) => ({
          ...s,
          running: false,
          runError: `${result.error ?? "error"}: ${result.reason ?? ""}`,
        }));
      }
    } catch (err) {
      setState((s) => ({ ...s, running: false, runError: errorMessage(err) }));
    }
  }

  async function streamExplainAi(): Promise<void> {
    if (!state.plan) {
      setState((s) => ({ ...s, runError: "Run EXPLAIN first to get a plan to read." }));
      return;
    }
    setState((s) => ({ ...s, aiText: "", aiStreaming: true, tab: "ai" }));
    try {
      let acc = "";
      for await (const evt of apiPostStream("/api/query/explain-ai", {
        scenarioSlug: scenario.slug,
        sql: state.sql,
        planJson: state.plan,
      })) {
        const obj = evt as { delta?: string; done?: boolean; error?: string };
        if (obj.error) {
          acc += `\n[stream error: ${obj.error}]`;
          break;
        }
        if (obj.delta) {
          acc += obj.delta;
          setState((s) => ({ ...s, aiText: acc }));
        }
        if (obj.done) break;
      }
      setState((s) => ({ ...s, aiStreaming: false }));
    } catch (err) {
      setState((s) => ({ ...s, aiStreaming: false, aiText: errorMessage(err) }));
    }
  }

  async function advise(): Promise<void> {
    const requirement = window.prompt(
      `Describe what you need. The AI will draft SQL, fetch its plan, and suggest schema changes:`,
    );
    if (!requirement) return;
    setState((s) => ({ ...s, adviseLoading: true, tab: "advise" }));
    try {
      const result = await apiPost<AdviseResult>("/api/query/advise", {
        scenarioSlug: scenario.slug,
        requirement,
      });
      setState((s) => ({ ...s, adviseLoading: false, advise: result, sql: result.sql ?? s.sql }));
    } catch (err) {
      setState((s) => ({
        ...s,
        adviseLoading: false,
        advise: { error: "request_failed", reason: errorMessage(err) },
      }));
    }
  }

  return (
    <div className="te-panel border-t h-[280px] shrink-0 flex">
      <div className="w-1/2 flex flex-col min-w-0 border-r te-hairline">
        <QueryEditor
          sql={state.sql}
          onSqlChange={setSql}
          seedQuestions={schema?.seedQuestions ?? []}
          running={state.running}
          onRun={run}
          onExplain={explain}
          onAsk={ask}
          onAdvise={advise}
          accentVar={scenario.accentVar}
        />
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="border-b te-hairline flex items-center px-3 gap-4 h-9 shrink-0">
          {TABS.map((t) => {
            const isActive = state.tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setState((s) => ({ ...s, tab: t.id }))}
                className={clsx(
                  "te-mono text-[10px] uppercase tracking-widest transition-colors h-full flex items-center",
                  isActive ? "text-ink border-b-2" : "text-ink-mute hover:text-ink-dim",
                )}
                style={isActive ? { borderColor: `var(${scenario.accentVar})` } : undefined}
              >
                {t.label}
              </button>
            );
          })}
          <div className="ml-auto flex items-center gap-3">
            {state.tab === "plan" && state.plan && (
              <button type="button" onClick={streamExplainAi} className="te-button">
                EXPLAIN IN ENGLISH
              </button>
            )}
            {state.runError && state.tab === "results" && (
              <span className="te-label" style={{ color: "var(--accent-fintech)" }}>
                {state.runError}
              </span>
            )}
            {state.planError && state.tab === "plan" && (
              <span className="te-label" style={{ color: "var(--accent-fintech)" }}>
                {state.planError}
              </span>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden">
          {state.tab === "results" &&
            (state.runResult ? (
              <TableView result={state.runResult} />
            ) : (
              <div className="p-3 te-label">no query run yet</div>
            ))}
          {state.tab === "plan" &&
            (state.plan ? (
              <PlanTree plan={state.plan} />
            ) : (
              <div className="p-3 te-label">no plan yet — click EXPLAIN</div>
            ))}
          {state.tab === "ai" && <AiCommentary text={state.aiText} streaming={state.aiStreaming} />}
          {state.tab === "advise" && (
            <AdvisePanel advise={state.advise} loading={state.adviseLoading} />
          )}
        </div>
      </div>
    </div>
  );
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}
