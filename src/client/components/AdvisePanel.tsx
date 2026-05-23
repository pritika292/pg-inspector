import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { PlanTree } from "./PlanTree.js";
import type { AdviseResult } from "../lib/types.js";

interface Props {
  advise: AdviseResult | undefined;
  loading: boolean;
}

export function AdvisePanel({ advise, loading }: Props): JSX.Element {
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-3 py-2 border-b te-hairline flex items-center justify-between te-label">
        <span>advise · sql + ddl suggestions</span>
        <span className="text-ink-mute">{loading ? "thinking…" : ""}</span>
      </div>

      <div className="flex-1 overflow-auto">
        {!advise && !loading && (
          <div className="p-4 te-label">
            click ADVISE with a requirement to get generated SQL, its plan, and DDL suggestions
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
