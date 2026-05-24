import { useEffect, useState } from "react";
import clsx from "clsx";
import { ArrowRight, Play, Sparkles, X } from "lucide-react";
import { TableView } from "./TableView.js";
import { PlanTree } from "./PlanTree.js";
import { apiGet, apiPost, apiPostStream, ApiError } from "../lib/api.js";
import type {
  ExplainResult,
  NlToSqlResult,
  RunResult,
  ScenarioListEntry,
  ScenarioSchema,
} from "../lib/types.js";

interface Props {
  scenario: ScenarioListEntry;
}

type WriteMode = "sql" | "ask";
type OutTab = "results" | "plan";

interface State {
  mode: WriteMode;
  sql: string;
  ask: string;
  running: boolean;
  out: OutTab;
  runResult?: RunResult;
  runError?: string;
  plan?: ExplainResult;
  planError?: string;
  // AI plan reading + DDL recommendation (single streamed prose).
  aiText: string;
  aiStreaming: boolean;
  aiAttempted: boolean;
  // Whether the user has acknowledged the new AI reading for the current
  // plan. Drives the pulse on the READING button — pulses while false,
  // settles once the drawer has been opened.
  aiAcknowledged: boolean;
  // Whether the side drawer over the OUTPUT pane is visible.
  aiOpen: boolean;
  // ASK errors split by kind so the UI can soften CANNOT_ANSWER into a
  // "try a different question" hint instead of a red error log (#114).
  askErrorKind?: "cannot_answer" | "failed";
  askErrorMessage?: string;
  // AI repair flow for failed SQL (#114). repairing is true while the
  // call is in flight; repair holds the latest suggestion.
  repairing: boolean;
  repair?: RepairResult;
}

interface RepairResult {
  sql?: string;
  why?: string;
  error?: string;
}

const emptyState = (): State => ({
  // Default to ASK — first-time visitors get the most impressive flow
  // (English → SQL) without flipping any toggle (#110).
  mode: "ask",
  sql: "",
  ask: "",
  running: false,
  out: "results",
  aiText: "",
  aiStreaming: false,
  aiAttempted: false,
  aiAcknowledged: false,
  aiOpen: false,
  repairing: false,
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

  // Auto-stream the AI plan reading the first time the user opens the
  // AI drawer for the current plan. Lazy on purpose — saves budget for
  // users who only want raw rows.
  useEffect(() => {
    if (!state.aiOpen) return;
    if (!state.plan) return;
    if (state.aiAttempted) return;
    if (state.aiStreaming) return;
    void streamPlanReading();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.aiOpen, state.plan, state.aiAttempted, state.aiStreaming]);

  // Close the drawer when the user navigates to a different scenario,
  // or when a new query starts (handled in runSqlAndExplain).

  // Close on Escape while the drawer is open.
  useEffect(() => {
    if (!state.aiOpen) return;
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") setState((s) => ({ ...s, aiOpen: false }));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.aiOpen]);

  // ─── actions ────────────────────────────────────────────────────────

  async function runSqlAndExplain(sqlToRun: string): Promise<void> {
    setState((s) => ({
      ...s,
      running: true,
      runError: undefined,
      planError: undefined,
      out: "results",
      aiText: "",
      aiAttempted: false,
      aiAcknowledged: false,
      aiOpen: false,
      // Stale repair from a previous failed query is no longer relevant.
      repair: undefined,
      repairing: false,
    }));
    const [runOutcome, explainOutcome] = await Promise.allSettled([
      apiPost<RunResult>("/api/query/run", { scenarioSlug: scenario.slug, sql: sqlToRun }),
      apiPost<{ plan: ExplainResult }>("/api/query/explain", {
        scenarioSlug: scenario.slug,
        sql: sqlToRun,
      }),
    ]);

    setState((s) => {
      const next: State = { ...s, running: false };
      if (runOutcome.status === "fulfilled") next.runResult = runOutcome.value;
      else next.runError = errorMessage(runOutcome.reason);
      if (explainOutcome.status === "fulfilled") next.plan = explainOutcome.value.plan;
      else next.planError = errorMessage(explainOutcome.reason);
      return next;
    });
  }

  async function handleRun(): Promise<void> {
    if (state.mode === "sql") {
      if (!state.sql.trim()) return;
      await runSqlAndExplain(state.sql);
      return;
    }
    // ASK mode: convert to SQL, write into the SQL state, then run.
    const question = state.ask.trim();
    if (!question) return;
    setState((s) => ({
      ...s,
      running: true,
      askErrorKind: undefined,
      askErrorMessage: undefined,
    }));
    try {
      const result = await apiPost<NlToSqlResult>("/api/query/nl-to-sql", {
        scenarioSlug: scenario.slug,
        question,
      });
      if (result.sql) {
        setState((s) => ({
          ...s,
          sql: result.sql!,
          askErrorKind: undefined,
          askErrorMessage: undefined,
        }));
        await runSqlAndExplain(result.sql);
      } else {
        // Split CANNOT_ANSWER (the schema can't support this question — a
        // soft outcome) from genuine request failures (rate limit, network,
        // etc.) so the UI can render each appropriately (#114).
        const kind = result.error === "CANNOT_ANSWER" ? "cannot_answer" : "failed";
        setState((s) => ({
          ...s,
          running: false,
          askErrorKind: kind,
          askErrorMessage: result.reason,
        }));
      }
    } catch (err) {
      setState((s) => ({
        ...s,
        running: false,
        askErrorKind: "failed",
        askErrorMessage: errorMessage(err),
      }));
    }
  }

  async function repairSql(): Promise<void> {
    const sqlToFix = state.sql.trim();
    const errorText = state.runError;
    if (!sqlToFix || !errorText) return;
    setState((s) => ({ ...s, repairing: true, repair: undefined }));
    try {
      const result = await apiPost<RepairResult>("/api/query/repair", {
        scenarioSlug: scenario.slug,
        sql: sqlToFix,
        error: errorText,
      });
      setState((s) => ({ ...s, repairing: false, repair: result }));
    } catch (err) {
      setState((s) => ({
        ...s,
        repairing: false,
        repair: { error: "request_failed", why: errorMessage(err) },
      }));
    }
  }

  function applyRepair(): void {
    if (!state.repair?.sql) return;
    setState((s) => ({ ...s, sql: s.repair!.sql!, repair: undefined, runError: undefined }));
  }

  async function streamPlanReading(): Promise<void> {
    if (!state.plan) return;
    setState((s) => ({ ...s, aiText: "", aiStreaming: true, aiAttempted: true }));
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
    } catch (err) {
      setState((s) => ({ ...s, aiText: errorMessage(err) }));
    } finally {
      setState((s) => ({ ...s, aiStreaming: false }));
    }
  }

  // ─── render ─────────────────────────────────────────────────────────

  const accent = scenario.accentVar;
  const canRun =
    !state.running &&
    (state.mode === "sql" ? state.sql.trim().length > 0 : state.ask.trim().length > 0);

  return (
    <div className="te-panel !rounded-none border-t h-[400px] shrink-0 flex">
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

        {state.mode === "sql" ? (
          <WriteSql
            sql={state.sql}
            onChange={(sql) => setState((s) => ({ ...s, sql }))}
            seedQuestions={schema?.seedQuestions ?? []}
            running={state.running}
            canRun={canRun}
            onRun={handleRun}
            accent={accent}
          />
        ) : (
          <WriteAsk
            ask={state.ask}
            onChange={(ask) => setState((s) => ({ ...s, ask }))}
            seedQuestions={schema?.seedQuestions ?? []}
            running={state.running}
            canRun={canRun}
            onRun={handleRun}
            errorKind={state.askErrorKind}
            errorMessage={state.askErrorMessage}
            accent={accent}
          />
        )}
      </div>

      {/* visual joiner */}
      <div
        className="hidden md:flex flex-col items-center justify-center px-1 border-r te-hairline"
        style={{ background: "var(--surface)" }}
        aria-hidden
      >
        <ArrowRight size={12} className="text-ink-mute" />
      </div>

      {/* ──── OUTPUT pane ──── */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        <div className="px-3 py-2 border-b te-hairline flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="te-label">output</span>
            <OutTabs
              tab={state.out}
              accent={accent}
              onChange={(t) => setState((s) => ({ ...s, out: t }))}
            />
          </div>
          {state.plan && (
            <button
              type="button"
              onClick={() => setState((s) => ({ ...s, aiOpen: true, aiAcknowledged: true }))}
              className={clsx(
                "te-button flex items-center gap-1.5",
                !state.aiAcknowledged && "te-pulse",
              )}
              style={{
                borderColor: `var(${accent})`,
                color: "var(--ink)",
                ["--pulse-color" as never]: `var(${accent})`,
              }}
              title="AI plain-English reading + concrete DDL recommendation"
            >
              <Sparkles size={12} />
              READING &amp; FIX
            </button>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-hidden">
          {state.out === "results" &&
            (state.runResult ? (
              <TableView result={state.runResult} />
            ) : state.runError ? (
              <FailedSqlPanel
                error={state.runError}
                repair={state.repair}
                repairing={state.repairing}
                onFixWithAi={repairSql}
                onApplyRepair={applyRepair}
                onDismissRepair={() => setState((s) => ({ ...s, repair: undefined }))}
              />
            ) : state.running ? (
              <EmptyPanel msg="Running…" />
            ) : (
              <OutputIntro />
            ))}
          {state.out === "plan" && (
            <PlanView plan={state.plan} planError={state.planError} running={state.running} />
          )}
        </div>

        {state.aiOpen && (
          <AiDrawer
            aiText={state.aiText}
            aiStreaming={state.aiStreaming}
            aiAttempted={state.aiAttempted}
            accent={accent}
            onClose={() => setState((s) => ({ ...s, aiOpen: false }))}
            onRegenerate={streamPlanReading}
          />
        )}
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
    { id: "ask", label: "ASK" },
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
  accent,
  onChange,
}: {
  tab: OutTab;
  accent: string;
  onChange: (t: OutTab) => void;
}): JSX.Element {
  const items: { id: OutTab; label: string }[] = [
    { id: "results", label: "RESULTS" },
    { id: "plan", label: "PLAN" },
  ];
  return (
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
  );
}

function WriteSql(p: {
  sql: string;
  onChange: (s: string) => void;
  seedQuestions: { label: string; sql: string; why: string }[];
  running: boolean;
  canRun: boolean;
  onRun: () => void;
  accent: string;
}): JSX.Element {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="relative flex-1 min-h-0">
        <textarea
          value={p.sql}
          onChange={(e) => p.onChange(e.target.value)}
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
          <ChipStrip
            label="examples"
            items={p.seedQuestions.map((q) => ({
              text: q.label,
              value: q.sql,
              fullText: q.label,
              help: q.why,
            }))}
            onPick={p.onChange}
            accent={p.accent}
          />
        )}
        <RunRow running={p.running} canRun={p.canRun} onRun={p.onRun} />
      </div>
    </div>
  );
}

function WriteAsk(p: {
  ask: string;
  onChange: (s: string) => void;
  seedQuestions: { label: string; sql: string; why: string }[];
  running: boolean;
  canRun: boolean;
  onRun: () => void;
  errorKind?: "cannot_answer" | "failed";
  errorMessage?: string;
  accent: string;
}): JSX.Element {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="relative flex-1 min-h-0">
        <textarea
          value={p.ask}
          onChange={(e) => p.onChange(e.target.value.slice(0, 500))}
          spellCheck
          placeholder='Ask in plain English. e.g. "Top 10 posts by score this month"'
          className="absolute inset-0 w-full h-full p-3 text-[14px] leading-relaxed text-ink bg-transparent resize-none outline-none placeholder:text-ink-mute"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && p.canRun) p.onRun();
          }}
        />
      </div>
      <div className="border-t te-hairline">
        {p.seedQuestions.length > 0 && (
          <ChipStrip
            label="examples"
            items={p.seedQuestions.map((q) => ({
              text: q.label.toLowerCase(),
              value: q.label,
              fullText: q.label,
              help: q.why,
            }))}
            onPick={p.onChange}
            accent={p.accent}
          />
        )}
        <RunRow
          running={p.running}
          canRun={p.canRun}
          onRun={p.onRun}
          rightSlot={
            <span className="ml-auto te-label flex items-center gap-1 text-ink-mute">
              <Sparkles size={10} /> gpt-4.1-mini
            </span>
          }
        />
        {p.errorKind === "cannot_answer" && (
          <div
            className="mx-3 mb-2 px-3 py-2 rounded-md text-[13px] leading-relaxed text-ink-dim"
            style={{
              background: "color-mix(in oklab, var(--ink-mute) 12%, transparent)",
              border: "1px solid var(--seam)",
            }}
            role="status"
          >
            This question can&apos;t be answered from the data in this scenario. Try a different one
            — the example chips above are all known to work.
            {p.errorMessage && (
              <span className="block mt-1 text-[12px] text-ink-mute">
                model said: {p.errorMessage}
              </span>
            )}
          </div>
        )}
        {p.errorKind === "failed" && (
          <p className="px-3 pb-2 te-label" style={{ color: "var(--accent-fintech)" }}>
            {p.errorMessage ?? "request failed"}
          </p>
        )}
      </div>
    </div>
  );
}

function RunRow(p: {
  running: boolean;
  canRun: boolean;
  onRun: () => void;
  rightSlot?: React.ReactNode;
}): JSX.Element {
  return (
    <div className="px-3 py-1.5 flex items-center gap-1.5">
      <button
        type="button"
        disabled={!p.canRun}
        onClick={p.onRun}
        className="te-button te-button-primary"
      >
        <Play size={12} />
        {p.running ? "RUNNING…" : "RUN"}
      </button>
      <span className="te-label text-ink-mute">⌘+Enter</span>
      {p.rightSlot}
    </div>
  );
}

interface ChipItem {
  /** Visible text inside the chip — may be truncated by max-width. */
  text: string;
  /** Payload passed to onPick when the chip is clicked. */
  value: string;
  /** Full label (shown on hover when it differs from the visible text). */
  fullText?: string;
  /** Extra explanation rendered under fullText on hover. */
  help?: string;
}

function ChipStrip({
  label,
  items,
  onPick,
  accent,
}: {
  label: string;
  items: ChipItem[];
  onPick: (v: string) => void;
  accent: string;
}): JSX.Element {
  return (
    <div className="px-3 py-1.5 flex items-center gap-1.5 border-b te-hairline overflow-x-auto">
      <span className="te-label shrink-0 mr-1">{label}</span>
      {items.map((i) => {
        // Show the tooltip if either the chip text gets truncated (full
        // text differs from the visible text) or there's a meaningful
        // help string to surface. Skip empty tooltips so we don't paint
        // a floating box on hover with nothing in it.
        const fullText = i.fullText ?? i.text;
        const isTruncated = fullText !== i.text;
        const showTip = isTruncated || (i.help && i.help.trim().length > 0);
        return (
          <div key={i.text} className="te-tooltip-host shrink-0">
            <button
              type="button"
              onClick={() => onPick(i.value)}
              className="te-button max-w-[280px] truncate"
              style={{ borderColor: `var(${accent})`, color: "var(--ink-dim)" }}
            >
              {i.text}
            </button>
            {showTip && (
              <span className="te-tooltip">
                <span className="block text-ink">{fullText}</span>
                {i.help && i.help.trim().length > 0 && (
                  <span className="block mt-1 text-ink-dim font-normal">{i.help}</span>
                )}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PlanView(p: {
  plan: ExplainResult | undefined;
  planError: string | undefined;
  running: boolean;
}): JSX.Element {
  if (p.running && !p.plan) return <EmptyPanel msg="Running EXPLAIN…" />;
  if (p.planError) return <ErrorPanel msg={p.planError} />;
  if (!p.plan)
    return (
      <EmptyPanel msg="Hit RUN on a SELECT to see the execution plan. The READING & FIX button (top right) will then surface an AI-drafted recommendation." />
    );

  return (
    <div className="h-full overflow-auto">
      <div className="px-3 py-2 te-label flex items-center justify-between border-b te-hairline">
        <span>execution plan</span>
        <span className="text-ink-mute normal-case tracking-normal text-[11px]">
          postgres EXPLAIN ANALYZE
        </span>
      </div>
      <PlanTree plan={p.plan} />
    </div>
  );
}

function AiDrawer(p: {
  aiText: string;
  aiStreaming: boolean;
  aiAttempted: boolean;
  accent: string;
  onClose: () => void;
  onRegenerate: () => void;
}): JSX.Element {
  return (
    <div className="absolute inset-0 z-30 flex">
      {/* Backdrop — click to dismiss */}
      <button
        type="button"
        onClick={p.onClose}
        aria-label="close AI reading"
        className="absolute inset-0 bg-black/40 cursor-default"
      />
      {/* Sliding panel */}
      <div
        className="relative ml-auto w-full max-w-[460px] h-full te-panel border-l flex flex-col te-drawer-enter"
        style={{ borderLeftColor: `var(${p.accent})`, borderLeftWidth: 2 }}
        role="dialog"
        aria-label="AI reading and DDL recommendation"
      >
        <header className="px-4 py-2.5 border-b te-hairline flex items-center justify-between">
          <span className="te-label-md text-ink flex items-center gap-2">
            <Sparkles size={12} /> reading &amp; recommendation
          </span>
          <div className="flex items-center gap-1.5">
            {!p.aiStreaming && p.aiAttempted && (
              <button type="button" onClick={p.onRegenerate} className="te-button">
                REGENERATE
              </button>
            )}
            <button type="button" onClick={p.onClose} className="te-button" aria-label="close">
              <X size={12} />
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-auto p-4">
          {p.aiStreaming && !p.aiText && (
            <div className="space-y-2">
              <div className="h-3.5 te-panel w-3/4" />
              <div className="h-3.5 te-panel w-2/3" />
              <div className="h-3.5 te-panel w-1/2" />
              <div className="h-3.5 te-panel w-5/6" />
            </div>
          )}
          {p.aiText && (
            <pre className="te-mono text-[12.5px] leading-relaxed text-ink whitespace-pre-wrap break-words">
              {p.aiText}
              {p.aiStreaming && <span className="te-cursor">▍</span>}
            </pre>
          )}
          {!p.aiStreaming && p.aiAttempted && !p.aiText && (
            <div>
              <p className="te-label" style={{ color: "var(--accent-fintech)" }}>
                AI explanation unavailable.
              </p>
              <button type="button" onClick={p.onRegenerate} className="mt-2 te-button">
                REGENERATE
              </button>
            </div>
          )}
        </div>
        <footer className="px-4 py-2 border-t te-hairline te-label text-ink-mute flex items-center justify-between">
          <span>gpt-4.1-mini · 1 of 200/day</span>
          <span>esc to close</span>
        </footer>
      </div>
    </div>
  );
}

function FailedSqlPanel(p: {
  error: string;
  repair: RepairResult | undefined;
  repairing: boolean;
  onFixWithAi: () => void;
  onApplyRepair: () => void;
  onDismissRepair: () => void;
}): JSX.Element {
  return (
    <div className="h-full overflow-auto p-4">
      <p className="te-label" style={{ color: "var(--accent-fintech)" }}>
        your query didn&apos;t run
      </p>
      <pre className="mt-2 te-mono text-[12.5px] leading-relaxed text-ink whitespace-pre-wrap break-words">
        {p.error}
      </pre>

      {!p.repair && !p.repairing && (
        <button
          type="button"
          onClick={p.onFixWithAi}
          className="mt-3 te-button te-button-primary"
          title="Ask gpt-4.1-mini to explain the error and suggest a corrected SELECT"
        >
          <Sparkles size={12} />
          FIX WITH AI
        </button>
      )}
      {p.repairing && (
        <div className="mt-3 space-y-2">
          <div className="h-3.5 te-panel w-3/4" />
          <div className="h-3.5 te-panel w-2/3" />
          <div className="h-3.5 te-panel w-1/2" />
        </div>
      )}
      {p.repair && (
        <section
          className="mt-4 te-panel p-3"
          style={{ borderLeftWidth: 2, borderLeftColor: "var(--ink-dim)" }}
        >
          <div className="te-label flex items-center gap-2">
            <Sparkles size={11} /> ai suggestion
          </div>
          {p.repair.error === "CANNOT_ANSWER" ? (
            <p className="mt-2 text-[13px] leading-relaxed text-ink-dim">
              The AI couldn&apos;t turn this into a working SELECT against the scenario&apos;s
              schema. Try rephrasing or pick an example chip on the left.
              {p.repair.why && (
                <span className="block mt-1 text-[12px] text-ink-mute">
                  model said: {p.repair.why}
                </span>
              )}
            </p>
          ) : (
            <>
              {p.repair.why && (
                <p className="mt-2 text-[13px] leading-relaxed text-ink-dim">{p.repair.why}</p>
              )}
              {p.repair.sql && (
                <pre className="mt-2 te-panel p-2 te-mono text-[12px] leading-relaxed text-ink whitespace-pre-wrap break-words">
                  {p.repair.sql}
                </pre>
              )}
            </>
          )}
          <div className="mt-3 flex gap-1.5">
            {p.repair.sql && (
              <button
                type="button"
                onClick={p.onApplyRepair}
                className="te-button te-button-primary"
              >
                USE THIS
              </button>
            )}
            <button type="button" onClick={p.onDismissRepair} className="te-button">
              DISMISS
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function OutputIntro(): JSX.Element {
  return (
    <div className="h-full overflow-auto p-5">
      <p className="text-[13px] leading-relaxed text-ink-dim max-w-prose">
        Pick a mode on the left (SQL or ASK), click an example chip, then RUN. Results land here.
      </p>
      <ul className="mt-4 space-y-2.5 max-w-prose">
        <li className="flex items-start gap-3">
          <span className="te-mono text-[10px] uppercase tracking-widest text-ink shrink-0 mt-0.5 w-16">
            RESULTS
          </span>
          <span className="text-[13px] leading-relaxed text-ink-dim">
            Rows returned by the SELECT.
          </span>
        </li>
        <li className="flex items-start gap-3">
          <span className="te-mono text-[10px] uppercase tracking-widest text-ink shrink-0 mt-0.5 w-16">
            PLAN
          </span>
          <span className="text-[13px] leading-relaxed text-ink-dim">
            Postgres&apos; execution-plan tree. After RUN, a pulsing{" "}
            <span className="te-mono">READING &amp; FIX</span> button appears (top right) — click it
            to open a panel with the AI&apos;s plain-English reading and a concrete index / DDL
            recommendation.
          </span>
        </li>
      </ul>
      <p className="mt-5 te-label text-ink-mute">
        tip · every example chip is scenario-specific and known to run.
      </p>
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
