import { useState } from "react";
import { Send, Sparkles } from "lucide-react";

interface Props {
  scenarioName: string;
  pending: boolean;
  accentVar: string;
  // Called with the question; parent runs /nl-to-sql + populates editor.
  onSubmit: (question: string) => void;
  // Last error / CANNOT_ANSWER message from a previous attempt, if any.
  lastError?: string;
}

const SUGGESTIONS = [
  "top 10 by score this month",
  "rows added in the last 24 hours",
  "p95 latency by service",
  "open items grouped by status",
];

export function AskPanel({
  scenarioName,
  pending,
  accentVar,
  onSubmit,
  lastError,
}: Props): JSX.Element {
  const [text, setText] = useState("");

  const submit = (): void => {
    const q = text.trim();
    if (!q || pending) return;
    onSubmit(q);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-3 py-2 border-b te-hairline flex items-center justify-between te-label">
        <span>ask in english · {scenarioName}</span>
        <span className="text-ink-mute">{pending ? "generating SQL…" : `${text.length}/500`}</span>
      </div>

      <div className="p-3 flex flex-col gap-3">
        <p className="text-[12px] leading-relaxed text-ink-dim">
          Describe what you want in plain English. The model drafts a Postgres SELECT against the{" "}
          <span className="te-mono">{scenarioName}</span> schema and drops it into the editor above
          — review, then click RUN.
        </p>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 500))}
          rows={3}
          spellCheck
          placeholder={`e.g. "${SUGGESTIONS[0]}"`}
          className="te-panel p-2.5 te-mono text-[12px] leading-relaxed text-ink bg-transparent resize-y outline-none focus:border-[var(--ink-dim)]"
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
            disabled={pending || text.trim().length === 0}
            onClick={submit}
            className="te-button te-button-primary"
          >
            <Send size={12} />
            SEND
          </button>
          <span className="te-label text-ink-mute">⌘+Enter</span>
          <span className="ml-auto te-label flex items-center gap-1 text-ink-mute">
            <Sparkles size={10} />
            gpt-4.1-mini
          </span>
        </div>

        {lastError && (
          <p className="te-label" style={{ color: "var(--accent-fintech)" }}>
            {lastError}
          </p>
        )}
      </div>
    </div>
  );
}
