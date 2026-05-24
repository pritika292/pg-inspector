import { useEffect, useState } from "react";
import clsx from "clsx";
import { ArrowRight, Play, Search, Send, Sparkles, Wand2 } from "lucide-react";
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

type WriteMode = "sql" | "english" | "requirement";
type OutTab = "results" | "plan" | "ai" | "advise";

interface State {
  mode: WriteMode;
  sql: string;
  english: string;
  requirement: string;
  running: boolean;
  out: OutTab;
  runResult?: RunResult;
  runError?: string;
  plan?: ExplainResult;
  planError?: string;
  aiText: string;
  aiStreaming: boolean;
  advise?: AdviseResult;
  adviseLoading: boolean;
  askPending: boolean;
  askError?: string;
}

const ENGLISH_EXAMPLES = [
  "what are people posting about the most this week?",
  "which users haven't logged in for 30 days?",
  "show me services where latency spiked recently",
  "find products that have never been ordered",
];

const REQUIREMENT_EXAMPLES = [
  "I need a leaderboard of users by karma, updated every minute",
  "show me orders that have been stuck in pending for over 3 days",
  "list incidents grouped by severity for an oncall dashboard",
  "find merchants with the highest dispute rates",
];

const emptyState = (): State => ({
  mode: "sql",
  sql: "",
  english: "",
  requirement: "",
  running: false,
  out: "results",
  aiText: "",
  aiStreaming: false,
  adviseLoading: false,
  askPending: false,
});

export function Toolbox({ scenario }: Props): JSX.Element {
  const [schema, setSchema] = useState<ScenarioSchema | undefined>(undefined);
  const [state, setState] = useState<State>(emptyState());

  useEffect(() => {
    let cancelled = false;
    apiGet<ScenarioSchema>(`/api/scenarios/${scenario.slug}`)
      .then((data) => {
        if (cancelled) return;
        setSchema(data);
        setState(emptyState());
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [scenario.slug]);

  // ─── actions ────────────────────────────────────────────────────────

  async function run(): Promise<void> {
    setState((s) => ({ ...s, running: true, runError: undefined, out: "results" }));
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
    setState((s) => ({ ...s, running: true, planError: undefined, out: "plan" }));
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

  async function submitEnglish(): Promise<void> {
    const question = state.english.trim();
    if (!question) return;
    setState((s) => ({ ...s, askPending: true, askError: undefined }));
    try {
      const result = await apiPost<NlToSqlResult>("/api/query/nl-to-sql", {
        scenarioSlug: scenario.slug,
        question,
      });
      if (result.sql) {
        // SUCCESS: drop SQL into the editor and switch to SQL mode so the user
        // can review and click RUN. Results pane stays on RESULTS for clarity.
        setState((s) => ({
          ...s,
          askPending: false,
          sql: result.sql!,
          mode: "sql",
          out: "results",
        }));
      } else {
        setState((s) => ({
          ...s,
          askPending: false,
          askError: `${result.error ?? "error"}${result.reason ? `: ${result.reason}` : ""}`,
        }));
      }
    } catch (err) {
      setState((s) => ({ ...s, askPending: false, askError: errorMessage(err) }));
    }
  }

  async function submitRequirement(): Promise<void> {
    const requirement = state.requirement.trim();
    if (!requirement) return;
    setState((s) => ({ ...s, adviseLoading: true, advise: undefined, out: "advise" }));
    try {
      const result = await apiPost<AdviseResult>("/api/query/advise", {
        scenarioSlug: scenario.slug,
        requirement,
      });
      setState((s) => ({
        ...s,
        adviseLoading: false,
        advise: result,
        sql: result.sql ?? s.sql,
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        adviseLoading: false,
        advise: { error: "request_failed", reason: errorMessage(err) },
      }));
    }
  }

  async function streamExplainAi(): Promise<void> {
    if (!state.plan) {
      setState((s) => ({ ...s, runError: "Run EXPLAIN first to get a plan to read." }));
      return;
    }
    setState((s) => ({ ...s, aiText: "", aiStreaming: true, out: "ai" }));
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

  // ─── render ─────────────────────────────────────────────────────────

  const canRunSql = !state.running && state.sql.trim().length > 0;
  const accent = scenario.accentVar;

  return (
    <div className="te-panel border-t h-[320px] shrink-0 flex">
      {/* ──── WRITE pane ──── */}
      <div className="w-1/2 flex flex-col min-w-0 border-r te-hairline">
        <div className="px-3 py-2 border-b te-hairline flex items-center justify-between">
          <span className="te-label">write</span>
          <ModeStrip
            mode={state.mode}
            accent={accent}
            onChange={(m) => setState((s) => ({ ...s, mode: m }))}
          />
        </div>

        {state.mode === "sql" && (
          <SqlMode
            sql={state.sql}
            onSqlChange={(sql) => setState((s) => ({ ...s, sql }))}
            seedQuestions={schema?.seedQuestions ?? []}
            canRun={canRunSql}
            running={state.running}
            onRun={run}
            onExplain={explain}
            accent={accent}
          />
        )}
        {state.mode === "english" && (
          <EnglishMode
            value={state.english}
            onChange={(english) => setState((s) => ({ ...s, english }))}
            pending={state.askPending}
            onSubmit={submitEnglish}
            error={state.askError}
            scenarioName={scenario.name}
            accent={accent}
          />
        )}
        {state.mode === "requirement" && (
          <RequirementMode
            value={state.requirement}
            onChange={(requirement) => setState((s) => ({ ...s, requirement }))}
            loading={state.adviseLoading}
            onSubmit={submitRequirement}
            scenarioName={scenario.name}
            accent={accent}
          />
        )}
      </div>

      {/* ──── arrow joiner (visual cue that LEFT → RIGHT) ──── */}
      <div
        className="hidden md:flex flex-col items-center justify-center px-1 border-r te-hairline"
        style={{ background: "var(--surface)" }}
        aria-hidden
      >
        <ArrowRight size={12} className="text-ink-mute" />
      </div>

      {/* ──── OUTPUT pane ──── */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-3 py-2 border-b te-hairline flex items-center justify-between">
          <span className="te-label">output</span>
          <OutTabs
            tab={state.out}
            showAdvise={!!state.advise || state.adviseLoading}
            accent={accent}
            onChange={(t) => setState((s) => ({ ...s, out: t }))}
            rightSlot={
              state.out === "plan" && state.plan ? (
                <button type="button" onClick={streamExplainAi} className="te-button">
                  EXPLAIN IN ENGLISH
                </button>
              ) : null
            }
          />
        </div>

        <div className="flex-1 min-h-0 overflow-hidden">
          {state.out === "results" &&
            (state.runResult ? (
              <TableView result={state.runResult} />
            ) : state.runError ? (
              <ErrorPanel msg={state.runError} />
            ) : (
              <EmptyPanel msg="Run a query in the WRITE pane to see results here." />
            ))}
          {state.out === "plan" &&
            (state.plan ? (
              <PlanTree plan={state.plan} />
            ) : state.planError ? (
              <ErrorPanel msg={state.planError} />
            ) : (
              <EmptyPanel msg="Click EXPLAIN on a SELECT to see how Postgres will run it." />
            ))}
          {state.out === "ai" && <AiCommentary text={state.aiText} streaming={state.aiStreaming} />}
          {state.out === "advise" && (
            <AdvisePanel
              scenarioName={scenario.name}
              advise={state.advise}
              loading={state.adviseLoading}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── sub-components ────────────────────────────────────────────────────

function ModeStrip({
  mode,
  accent,
  onChange,
}: {
  mode: WriteMode;
  accent: string;
  onChange: (m: WriteMode) => void;
}): JSX.Element {
  const items: { id: WriteMode; label: string }[] = [
    { id: "sql", label: "SQL" },
    { id: "english", label: "ENGLISH" },
    { id: "requirement", label: "REQUIREMENT" },
  ];
  return (
    <div role="tablist" className="flex items-center gap-3">
      {items.map((i) => {
        const active = mode === i.id;
        return (
          <button
            key={i.id}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(i.id)}
            className={clsx(
              "te-mono text-[10px] uppercase tracking-widest transition-colors h-7 flex items-center px-1",
              active ? "text-ink border-b-2" : "text-ink-mute hover:text-ink-dim",
            )}
            style={active ? { borderColor: `var(${accent})` } : undefined}
          >
            {i.label}
          </button>
        );
      })}
    </div>
  );
}

function OutTabs({
  tab,
  showAdvise,
  accent,
  onChange,
  rightSlot,
}: {
  tab: OutTab;
  showAdvise: boolean;
  accent: string;
  onChange: (t: OutTab) => void;
  rightSlot?: React.ReactNode;
}): JSX.Element {
  const items: { id: OutTab; label: string }[] = [
    { id: "results", label: "RESULTS" },
    { id: "plan", label: "PLAN" },
    { id: "ai", label: "AI" },
  ];
  if (showAdvise) items.push({ id: "advise", label: "ADVISE" });
  return (
    <div className="flex items-center gap-3">
      <div role="tablist" className="flex items-center gap-3">
        {items.map((i) => {
          const active = tab === i.id;
          return (
            <button
              key={i.id}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => onChange(i.id)}
              className={clsx(
                "te-mono text-[10px] uppercase tracking-widest transition-colors h-7 flex items-center px-1",
                active ? "text-ink border-b-2" : "text-ink-mute hover:text-ink-dim",
              )}
              style={active ? { borderColor: `var(${accent})` } : undefined}
            >
              {i.label}
            </button>
          );
        })}
      </div>
      {rightSlot}
    </div>
  );
}

function SqlMode(p: {
  sql: string;
  onSqlChange: (s: string) => void;
  seedQuestions: { label: string; sql: string; why: string }[];
  canRun: boolean;
  running: boolean;
  onRun: () => void;
  onExplain: () => void;
  accent: string;
}): JSX.Element {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="relative flex-1 min-h-0">
        <textarea
          value={p.sql}
          onChange={(e) => p.onSqlChange(e.target.value)}
          spellCheck={false}
          placeholder="SELECT ... FROM ..."
          className="absolute inset-0 w-full h-full p-3 te-mono text-[12px] leading-relaxed text-ink bg-transparent resize-none outline-none placeholder:text-ink-mute"
          style={{ tabSize: 2 }}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && p.canRun) p.onRun();
          }}
        />
      </div>
      <div className="border-t te-hairline">
        {p.seedQuestions.length > 0 && (
          <div className="px-3 py-1.5 flex flex-wrap gap-1.5 border-b te-hairline">
            <span className="te-label self-center mr-1">examples</span>
            {p.seedQuestions.map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => p.onSqlChange(q.sql)}
                className="te-button"
                title={q.why}
                style={{ borderColor: `var(${p.accent})`, color: "var(--ink-dim)" }}
              >
                {q.label}
              </button>
            ))}
          </div>
        )}
        <div className="px-3 py-1.5 flex items-center gap-1.5">
          <button
            type="button"
            disabled={!p.canRun}
            onClick={p.onRun}
            className="te-button te-button-primary"
          >
            <Play size={12} />
            RUN
          </button>
          <button type="button" disabled={!p.canRun} onClick={p.onExplain} className="te-button">
            <Search size={12} />
            EXPLAIN
          </button>
          <span className="ml-auto te-label text-ink-mute">⌘+Enter to run</span>
        </div>
      </div>
    </div>
  );
}

function EnglishMode(p: {
  value: string;
  onChange: (v: string) => void;
  pending: boolean;
  onSubmit: () => void;
  error?: string;
  scenarioName: string;
  accent: string;
}): JSX.Element {
  return (
    <div className="flex-1 flex flex-col min-h-0 p-3 gap-3">
      <p className="text-[12px] leading-relaxed text-ink-dim">
        Ask in plain English. The AI drafts a Postgres SELECT against{" "}
        <span className="te-mono">{p.scenarioName}</span>, drops it into the editor (SQL mode), and
        switches back so you can review and RUN.
      </p>
      <textarea
        value={p.value}
        onChange={(e) => p.onChange(e.target.value.slice(0, 500))}
        rows={4}
        spellCheck
        placeholder={ENGLISH_EXAMPLES[0]}
        className="flex-1 te-panel p-2.5 text-[13px] leading-relaxed text-ink bg-transparent resize-none outline-none focus:border-[var(--ink-dim)]"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") p.onSubmit();
        }}
      />
      <div className="flex flex-wrap gap-1.5">
        <span className="te-label self-center mr-1">try</span>
        {ENGLISH_EXAMPLES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => p.onChange(s)}
            className="te-button"
            style={{ borderColor: `var(${p.accent})`, color: "var(--ink-dim)" }}
          >
            {s}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={p.pending || p.value.trim().length === 0}
          onClick={p.onSubmit}
          className="te-button te-button-primary"
        >
          <Send size={12} />
          {p.pending ? "GENERATING…" : "SUBMIT"}
        </button>
        <span className="te-label text-ink-mute">⌘+Enter</span>
        <span className="ml-auto te-label flex items-center gap-1 text-ink-mute">
          <Sparkles size={10} /> gpt-4.1-mini
        </span>
      </div>
      {p.error && (
        <p className="te-label" style={{ color: "var(--accent-fintech)" }}>
          {p.error}
        </p>
      )}
    </div>
  );
}

function RequirementMode(p: {
  value: string;
  onChange: (v: string) => void;
  loading: boolean;
  onSubmit: () => void;
  scenarioName: string;
  accent: string;
}): JSX.Element {
  return (
    <div className="flex-1 flex flex-col min-h-0 p-3 gap-3">
      <p className="text-[12px] leading-relaxed text-ink-dim">
        Describe a feature requirement. The AI drafts SQL, runs EXPLAIN against{" "}
        <span className="te-mono">{p.scenarioName}</span>, and proposes DDL changes (indexes, column
        adds) to make the plan faster. Nothing is auto-applied. Results land in the ADVISE tab on
        the right.
      </p>
      <textarea
        value={p.value}
        onChange={(e) => p.onChange(e.target.value.slice(0, 500))}
        rows={4}
        spellCheck
        placeholder={REQUIREMENT_EXAMPLES[0]}
        className="flex-1 te-panel p-2.5 text-[13px] leading-relaxed text-ink bg-transparent resize-none outline-none focus:border-[var(--ink-dim)]"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") p.onSubmit();
        }}
      />
      <div className="flex flex-wrap gap-1.5">
        <span className="te-label self-center mr-1">try</span>
        {REQUIREMENT_EXAMPLES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => p.onChange(s)}
            className="te-button"
            style={{ borderColor: `var(${p.accent})`, color: "var(--ink-dim)" }}
          >
            {s}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={p.loading || p.value.trim().length === 0}
          onClick={p.onSubmit}
          className="te-button te-button-primary"
        >
          <Wand2 size={12} />
          {p.loading ? "THINKING…" : "SUBMIT"}
        </button>
        <span className="te-label text-ink-mute">⌘+Enter · 1 of 200/day budget</span>
      </div>
    </div>
  );
}

function EmptyPanel({ msg }: { msg: string }): JSX.Element {
  return (
    <div className="p-4 te-label text-ink-mute leading-relaxed normal-case tracking-normal text-[12px]">
      {msg}
    </div>
  );
}

function ErrorPanel({ msg }: { msg: string }): JSX.Element {
  return (
    <div
      className="p-4 te-label leading-relaxed normal-case tracking-normal text-[12px]"
      style={{ color: "var(--accent-fintech)" }}
    >
      {msg}
    </div>
  );
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}
