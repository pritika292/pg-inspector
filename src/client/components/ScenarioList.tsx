import { useEffect, useState } from "react";
import clsx from "clsx";
import { apiGet } from "../lib/api.js";
import type { ScenarioListEntry } from "../lib/types.js";

interface Props {
  activeSlug: string | undefined;
  onSelect: (entry: ScenarioListEntry) => void;
}

export function ScenarioList({ activeSlug, onSelect }: Props): JSX.Element {
  const [entries, setEntries] = useState<ScenarioListEntry[] | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    apiGet<ScenarioListEntry[]>("/api/scenarios")
      .then((data) => {
        if (!cancelled) setEntries(data);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <aside className="te-panel border-r overflow-y-auto h-full flex flex-col">
      <div className="px-3 py-2 border-b te-hairline">
        <span className="te-label">scenarios</span>
      </div>

      {!entries && !error && (
        <div className="p-3 space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 te-panel te-shimmer" />
          ))}
        </div>
      )}
      {error && (
        <div className="p-3 te-label text-accent-fintech">could not load scenarios; try again</div>
      )}

      <ul className="divide-y te-divider">
        {entries?.map((s) => {
          const isActive = activeSlug === s.slug;
          return (
            <li key={s.slug}>
              <button
                type="button"
                onClick={() => onSelect(s)}
                className={clsx(
                  "w-full text-left px-3 py-3 transition-colors te-fade-in",
                  "hover:bg-[var(--surface-elevated)]",
                  isActive && "bg-[var(--surface-elevated)]",
                )}
                style={isActive ? { borderLeft: `2px solid var(${s.accentVar})` } : undefined}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] uppercase tracking-widest text-ink">
                    {s.name}
                  </span>
                  <span
                    aria-hidden
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ background: `var(${s.accentVar})` }}
                  />
                </div>
                <p className="mt-1.5 text-[12px] leading-snug text-ink-dim">{s.tagline}</p>
                <div className="mt-2 flex gap-3 text-[10px] te-mono uppercase tracking-widest text-ink-mute tabular">
                  <span>{s.tableCount} tables</span>
                  <span>{s.rowCount.toLocaleString()} rows</span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
