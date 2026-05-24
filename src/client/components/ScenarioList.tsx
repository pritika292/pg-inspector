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
    <aside className="te-panel overflow-y-auto h-full flex flex-col">
      <div className="px-4 py-2.5 te-header-tint">
        <span className="te-label-md text-ink">scenarios</span>
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

      <ul className="p-2 flex flex-col gap-2">
        {entries?.map((s) => {
          const isActive = activeSlug === s.slug;
          return (
            <li key={s.slug}>
              <button
                type="button"
                onClick={() => onSelect(s)}
                className={clsx(
                  "te-panel w-full text-left px-4 py-3.5 te-fade-in",
                  "transition-all duration-150 hover:-translate-y-px hover:border-[var(--ink-mute)]",
                  isActive && "shadow-[0_0_0_1px_var(--ink-dim)_inset]",
                )}
                style={{
                  // Left accent stripe is always visible (subtle when
                  // inactive, full opacity when active) so the card reads
                  // as scenario-tinted regardless of hover state.
                  borderLeftWidth: 3,
                  borderLeftColor: `var(${s.accentVar})`,
                  opacity: isActive ? 1 : 0.92,
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[13px] font-semibold uppercase tracking-widest text-ink">
                    {s.name}
                  </span>
                  <span
                    aria-hidden
                    className="inline-block w-2.5 h-2.5 rounded-full"
                    style={{ background: `var(${s.accentVar})` }}
                  />
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-ink-dim">{s.tagline}</p>
                <div className="mt-2.5 flex gap-3 text-[11px] te-mono font-semibold uppercase tracking-widest text-ink-mute tabular">
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
