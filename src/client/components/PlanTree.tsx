import { useMemo } from "react";
import type { ExplainResult } from "../lib/types.js";

interface Props {
  plan: ExplainResult;
}

interface PlanNode {
  "Node Type"?: string;
  "Relation Name"?: string;
  "Index Name"?: string;
  "Actual Total Time"?: number;
  "Actual Rows"?: number;
  "Plan Rows"?: number;
  "Total Cost"?: number;
  "Startup Cost"?: number;
  Filter?: string;
  "Hash Cond"?: string;
  "Index Cond"?: string;
  "Join Type"?: string;
  Plans?: PlanNode[];
}

// Returns the node with the max Actual Total Time across the tree — that's
// the bottleneck the visualizer highlights.
function findBottleneckRef(n: PlanNode): PlanNode {
  let worst = n;
  for (const c of n.Plans ?? []) {
    const w = findBottleneckRef(c);
    if ((w["Actual Total Time"] ?? 0) > (worst["Actual Total Time"] ?? 0)) worst = w;
  }
  return worst;
}

export function PlanTree({ plan }: Props): JSX.Element {
  const root = plan[0]?.Plan as PlanNode | undefined;
  const bottleneck = useMemo(() => (root ? findBottleneckRef(root) : undefined), [root]);

  if (!root) {
    return <div className="p-3 te-label">no plan</div>;
  }

  const planningTime = plan[0]?.["Planning Time"];
  const execTime = plan[0]?.["Execution Time"];

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-3 py-2 border-b te-hairline flex items-center justify-between te-label">
        <span>plan</span>
        <span className="tabular text-ink-mute">
          {planningTime != null && <span>plan {planningTime.toFixed(2)}ms · </span>}
          {execTime != null && <span>exec {execTime.toFixed(2)}ms</span>}
        </span>
      </div>
      <div className="flex-1 overflow-auto p-3">
        <Node node={root} bottleneck={bottleneck} depth={0} />
      </div>
    </div>
  );
}

interface NodeProps {
  node: PlanNode;
  bottleneck?: PlanNode;
  depth: number;
}

function Node({ node, bottleneck, depth }: NodeProps): JSX.Element {
  const isBottleneck = node === bottleneck;
  const actual = node["Actual Total Time"];
  const actualRows = node["Actual Rows"];
  const planRows = node["Plan Rows"];
  const rowOff = actualRows && planRows ? actualRows / Math.max(planRows, 1) : 1;
  const badRows = rowOff > 10 || rowOff < 0.1;

  return (
    <div style={{ marginLeft: depth === 0 ? 0 : 16 }} className="my-1.5">
      <div
        className="te-panel rounded-sm p-2"
        style={
          isBottleneck ? { borderColor: "var(--accent-fintech)", borderWidth: 1.5 } : undefined
        }
      >
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <span className="te-mono text-[12px] uppercase tracking-wider text-ink">
            {node["Node Type"] ?? "?"}
            {node["Join Type"] && <span className="text-ink-mute"> · {node["Join Type"]}</span>}
            {node["Relation Name"] && (
              <span className="text-ink-dim normal-case tracking-normal">
                {" "}
                · {node["Relation Name"]}
              </span>
            )}
            {node["Index Name"] && (
              <span className="text-ink-dim normal-case tracking-normal">
                {" "}
                · {node["Index Name"]}
              </span>
            )}
          </span>
          {actual != null && (
            <span className="te-mono text-[10px] tabular text-ink-mute">
              {actual.toFixed(2)} ms
            </span>
          )}
        </div>
        <div className="mt-1 te-mono text-[10px] flex flex-wrap gap-2 text-ink-mute tabular">
          {actualRows != null && <span>actual {actualRows.toLocaleString()}</span>}
          {planRows != null && (
            <span className={badRows ? "text-[color:var(--accent-fintech)]" : ""}>
              est {planRows.toLocaleString()}
              {badRows && ` (${rowOff.toFixed(1)}×)`}
            </span>
          )}
        </div>
        {node["Filter"] && (
          <div className="mt-1 te-mono text-[10px] text-ink-mute truncate" title={node["Filter"]}>
            filter: {node["Filter"]}
          </div>
        )}
        {(node["Index Cond"] || node["Hash Cond"]) && (
          <div className="mt-1 te-mono text-[10px] text-ink-mute truncate">
            cond: {node["Index Cond"] ?? node["Hash Cond"]}
          </div>
        )}
        {isBottleneck && (
          <div className="mt-1 te-label" style={{ color: "var(--accent-fintech)" }}>
            slowest node
          </div>
        )}
      </div>
      {node.Plans?.map((child, i) => (
        <Node key={i} node={child} bottleneck={bottleneck} depth={depth + 1} />
      ))}
    </div>
  );
}
