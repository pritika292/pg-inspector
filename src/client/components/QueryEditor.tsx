import { Play, Search, Sparkles, Wand2 } from "lucide-react";
import type { SeedQuestion } from "../lib/types.js";

interface Props {
  sql: string;
  onSqlChange: (sql: string) => void;
  seedQuestions: SeedQuestion[];
  running: boolean;
  onRun: () => void;
  onExplain: () => void;
  onAsk: () => void;
  onAdvise: () => void;
  accentVar: string;
}

export function QueryEditor(p: Props): JSX.Element {
  const canRun = !p.running && p.sql.trim().length > 0;

  return (
    <div className="flex flex-col h-full min-w-0">
      <div className="px-3 py-2 border-b te-hairline flex items-center justify-between">
        <span className="te-label">query editor</span>
        <span className="te-label text-ink-mute">SELECT only · 1s timeout · 500 row cap</span>
      </div>

      <div className="relative flex-1 min-h-0">
        <textarea
          value={p.sql}
          onChange={(e) => p.onSqlChange(e.target.value)}
          spellCheck={false}
          placeholder="SELECT ..."
          className="absolute inset-0 w-full h-full p-3 te-mono text-[12px] leading-relaxed text-ink bg-transparent resize-none outline-none placeholder:text-ink-mute"
          style={{ tabSize: 2 }}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canRun) p.onRun();
          }}
        />
      </div>

      <div className="border-t te-hairline">
        <div className="px-3 py-1.5 flex flex-wrap gap-1.5 border-b te-hairline">
          {p.seedQuestions.map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => p.onSqlChange(q.sql)}
              className="te-button"
              title={q.why}
              style={{ borderColor: `var(${p.accentVar})`, color: "var(--ink-dim)" }}
            >
              {q.label}
            </button>
          ))}
        </div>
        <div className="px-3 py-1.5 flex gap-1.5">
          <button
            type="button"
            disabled={!canRun}
            onClick={p.onRun}
            className="te-button te-button-primary"
          >
            <Play size={12} />
            RUN
          </button>
          <button type="button" disabled={!canRun} onClick={p.onExplain} className="te-button">
            <Search size={12} />
            EXPLAIN
          </button>
          <button type="button" disabled={p.running} onClick={p.onAsk} className="te-button">
            <Sparkles size={12} />
            ASK IN ENGLISH
          </button>
          <button type="button" disabled={p.running} onClick={p.onAdvise} className="te-button">
            <Wand2 size={12} />
            ADVISE
          </button>
          <span className="ml-auto te-label text-ink-mute self-center">⌘+Enter to run</span>
        </div>
      </div>
    </div>
  );
}
