import { useEffect, useState } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { apiGet } from "../lib/api.js";
import type { TablePage } from "../lib/types.js";

interface Props {
  scenarioSlug: string;
  schemaName: string;
  tableName: string;
  /** CSS var name like "--accent-social". Tints the header. */
  accentVar: string;
  onClose: () => void;
}

const PAGE_SIZE = 50;

export function TableDataView({
  scenarioSlug,
  schemaName,
  tableName,
  accentVar,
  onClose,
}: Props): JSX.Element {
  const [page, setPage] = useState<TablePage | undefined>(undefined);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setPage(undefined);
    apiGet<TablePage>(
      `/api/scenarios/${scenarioSlug}/tables/${tableName}?limit=${PAGE_SIZE}&offset=${offset}`,
    )
      .then((data) => {
        if (!cancelled) setPage(data);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [scenarioSlug, schemaName, tableName, offset]);

  const total = page?.totalRowCount ?? 0;
  const showing = page?.rows.length ?? 0;
  const last = Math.min(offset + showing, total);

  return (
    <aside className="te-panel flex flex-col h-full te-fade-in min-w-0 overflow-hidden">
      <div
        className="px-3 py-2 te-header-tint flex items-center justify-between"
        style={{ ["--header-tint" as never]: `var(${accentVar})` }}
      >
        <div className="min-w-0">
          <div className="te-label">table</div>
          <div className="te-mono text-[14px] uppercase tracking-widest text-ink truncate">
            {schemaName}.{tableName}
          </div>
        </div>
        <button type="button" onClick={onClose} className="te-button" aria-label="close drawer">
          <X size={12} />
          CLOSE
        </button>
      </div>

      <div className="px-3 py-2 border-b te-hairline flex items-center justify-between gap-3">
        <span className="te-label tabular">
          {total > 0
            ? `${(offset + 1).toLocaleString()}–${last.toLocaleString()} of ${total.toLocaleString()}`
            : "no rows"}
        </span>
        <div className="flex gap-1.5">
          <button
            type="button"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            className="te-button"
            aria-label="previous page"
          >
            <ChevronLeft size={12} />
          </button>
          <button
            type="button"
            disabled={!page?.page.hasMore && last >= total}
            onClick={() => setOffset(offset + PAGE_SIZE)}
            className="te-button"
            aria-label="next page"
          >
            <ChevronRight size={12} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {!page && !error && <div className="p-3 te-label">loading rows…</div>}
        {error && <div className="p-3 te-label text-accent-fintech">{error}</div>}
        {page && page.rows.length === 0 && (
          <div className="p-3 te-label">no rows in this range</div>
        )}
        {page && page.rows.length > 0 && (
          <table className="w-full text-[12.5px] te-mono">
            <thead className="sticky top-0 bg-[var(--surface-elevated)] z-10 border-b te-hairline">
              <tr>
                {page.columns.map((c) => (
                  <th
                    key={c}
                    className="text-left px-2.5 py-1.5 te-label text-ink-dim whitespace-nowrap"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {page.rows.map((row, i) => (
                <tr key={i} className="border-b te-hairline">
                  {page.columns.map((c) => (
                    <td
                      key={c}
                      className="px-2.5 py-1 align-top text-ink-dim whitespace-nowrap max-w-[260px] truncate tabular"
                      title={formatCell(row[c])}
                    >
                      {formatCell(row[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </aside>
  );
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return "·";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "bigint") return v.toString();
  if (v instanceof Date) return v.toISOString();
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
