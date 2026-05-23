import { Zap } from "lucide-react";
import type { RunResult } from "../lib/types.js";

interface Props {
  result: RunResult;
}

export function TableView({ result }: Props): JSX.Element {
  const fast = result.elapsedMs < 5;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-3 py-2 border-b te-hairline flex items-center justify-between te-label">
        <span className="tabular">
          {result.rowCount.toLocaleString()} rows
          {result.truncated && " (truncated at 500)"}
        </span>
        <span className="flex items-center gap-1 tabular text-ink-mute">
          {fast && (
            <span
              className="flex items-center gap-0.5"
              style={{ color: "var(--accent-ecommerce)" }}
            >
              <Zap size={9} />
            </span>
          )}
          {result.elapsedMs} ms
        </span>
      </div>
      {result.rowCount === 0 ? (
        <div className="p-3 te-label">no rows returned</div>
      ) : (
        <div className="flex-1 overflow-auto min-h-0">
          <table className="w-full text-[11px] te-mono">
            <thead className="sticky top-0 bg-[var(--surface-elevated)] z-10 border-b te-hairline">
              <tr>
                {result.columns.map((c) => (
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
              {result.rows.map((row, i) => (
                <tr key={i} className="border-b te-hairline">
                  {result.columns.map((c) => (
                    <td
                      key={c}
                      className="px-2.5 py-1 align-top text-ink-dim whitespace-nowrap max-w-[280px] truncate tabular"
                      title={formatCell(row[c])}
                    >
                      {formatCell(row[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "bigint") return v.toString();
  if (v instanceof Date) return v.toISOString();
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
