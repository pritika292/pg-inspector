import { useState } from "react";
import { Copy, Check, Send, Wand2 } from "lucide-react";
import { PlanTree } from "./PlanTree.js";
import type { AdviseResult } from "../lib/types.js";

interface Props {
  scenarioName: string;
  accentVar: string;
  advise: AdviseResult | undefined;
  loading: boolean;
  onSubmit: (requirement: string) => void;
}

const SUGGESTIONS = [
  "show top 5 SKUs by GMV this month",
  "find users who haven't logged in for 30 days",
  "p95 latency by tier, last hour",
  "incidents that took longer than 10 minutes to resolve",
];

export function AdvisePanel({
  scenarioName,
  accentVar,
  advise,
  loading,
  onSubmit,
}: Props): JSX.Element {
  const [text, setText] = useState("");

  const submit = (): void => {
    const req = text.trim();
    if (!req || loading) return;
    onSubmit(req);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-3 py-2 border-b te-hairline flex items-center justify-between te-label">
        <span>advise · sql + ddl suggestions · {scenarioName}</span>
        <span className="text-ink-mute">{loading ? "thinking…" : `${text.length}/500`}</span>
      </div>

      <div className="flex-1 overflow-auto">
        {/* Input panel: always present, never blocks the user from iterating. */}
        <div className="p-3 border-b te-hairline space-y-3">
          <p className="text-[12px] leading-relaxed text-ink-dim">
            Describe a requirement. The AI drafts SQL, runs EXPLAIN against it, and suggests DDL
            changes (indexes, column adds) to make it faster. Nothing is auto-applied.
          </p>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 500))}
            rows={3}
            spellCheck
            placeholder={`e.g. "${SUGGESTIONS[0]}"`}
            className="w-full te-panel p-2.5 te-mono text-[12px] leading-relaxed text-ink bg-transparent resize-y outline-none focus:border-[var(--ink-dim)]"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
            }}
          />

          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setText(s)}
                className="te-button"
                style={{ borderColor: `var(${accentVar})`, color: "var(--ink-dim)" }}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={loading || text.trim().length === 0}
              onClick={submit}
              className="te-button te-button-primary"
            >
              <Send size={12} />
              SEND
            </button>
            <span className="te-label text-ink-mute">⌘+Enter</span>
            <span className="ml-auto te-label flex items-center gap-1 text-ink-mute">
              <Wand2 size={10} />
              counts as 1 of 200/day budget
            </span>
          </div>
        </div>

        {/* Results pane: loading shimmer, error, or actual advice. */}
        {!advise && !loading && (
          <div className="p-4 te-label">
            results will appear here. describe what you need above.
          </div>
        )}
        {loading && (
          <div className="p-4 space-y-2">
            <div className="h-4 te-panel w-3/4" />
            <div className="h-4 te-panel w-1/2" />
            <div className="h-20 te-panel w-full" />
          </div>
        )}
        {advise && (advise.error ?? advise.reason) && (
          <div className="p-4 te-label" style={{ color: "var(--accent-fintech)" }}>
            {advise.error ?? "error"}: {advise.reason ?? "(no reason)"}
          </div>
        )}
        {advise?.sql && (
          <section className="p-4 space-y-4">
            <div>
              <div className="te-label mb-1">generated sql</div>
              <CopyBlock text={advise.sql} />
            </div>
            {advise.plan && (
              <div>
                <div className="te-label mb-1">plan</div>
                <div className="te-panel max-h-[300px] overflow-auto">
                  <PlanTree plan={advise.plan} />
                </div>
              </div>
            )}
            {advise.suggestedDdl && advise.suggestedDdl.length > 0 && (
              <div>
                <div className="te-label mb-1">suggested ddl · not auto-applied</div>
                <ul className="space-y-2">
                  {advise.suggestedDdl.map((ddl, i) => (
                    <li key={i}>
                      <CopyBlock text={ddl} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {advise.why && (
              <div>
                <div className="te-label mb-1">why</div>
                <p className="text-[13px] leading-relaxed text-ink whitespace-pre-wrap">
                  {advise.why}
                </p>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function CopyBlock({ text }: { text: string }): JSX.Element {
  const [copied, setCopied] = useState(false);
  return (
    <div className="te-panel relative group">
      <pre className="te-mono text-[11px] leading-relaxed text-ink p-3 pr-10 whitespace-pre-wrap break-words">
        {text}
      </pre>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            // ignore
          }
        }}
        className="absolute top-1.5 right-1.5 te-button"
        aria-label="copy"
      >
        {copied ? <Check size={11} /> : <Copy size={11} />}
      </button>
    </div>
  );
}
