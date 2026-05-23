import { Handle, Position, type NodeProps } from "reactflow";
import { Key } from "lucide-react";
import type { Table } from "../lib/types.js";

export interface TableNodeData {
  schemaName: string;
  table: Table;
  accentVar: string;
  onClick: (schemaName: string, tableName: string) => void;
}

export function TableNode({ data }: NodeProps<TableNodeData>): JSX.Element {
  const { schemaName, table, accentVar, onClick } = data;

  // Hide handles visually but keep them present so react-flow edges connect.
  const handleStyle = {
    background: "transparent",
    border: "none",
    width: 1,
    height: 1,
  } as const;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick(schemaName, table.name)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onClick(schemaName, table.name);
      }}
      className="te-panel rounded-sm shadow-none min-w-[240px] cursor-pointer transition-transform"
      style={{
        outline: "none",
      }}
    >
      <Handle type="target" position={Position.Left} style={handleStyle} />
      <Handle type="source" position={Position.Right} style={handleStyle} />

      <div
        className="px-2.5 py-1.5 border-b te-hairline flex items-center justify-between"
        style={{ borderLeftWidth: "2px", borderLeftColor: `var(${accentVar})` }}
      >
        <span className="te-mono text-[10px] uppercase tracking-widest text-ink">{table.name}</span>
        <span className="te-mono text-[9px] uppercase tracking-widest text-ink-mute tabular">
          {table.rowCount.toLocaleString()}
        </span>
      </div>

      <ul className="text-[11px] leading-tight">
        {table.columns.slice(0, 8).map((c) => (
          <li
            key={c.name}
            className="px-2.5 py-0.5 flex items-center justify-between gap-2 border-b te-hairline last:border-b-0"
          >
            <span className="te-mono flex items-center gap-1 text-ink-dim">
              {c.isPrimaryKey && <Key size={9} className="text-ink" />}
              <span
                className={
                  c.isPrimaryKey ? "underline decoration-dotted underline-offset-2 text-ink" : ""
                }
              >
                {c.name}
              </span>
              {c.softRef && (
                <span
                  title={`soft ref → ${c.softRef.schema}.${c.softRef.table}.${c.softRef.column}`}
                  className="ml-1 text-[8px] uppercase text-ink-mute"
                >
                  ⇢
                </span>
              )}
            </span>
            <span className="te-mono text-[10px] text-ink-mute">{c.dataType}</span>
          </li>
        ))}
        {table.columns.length > 8 && (
          <li className="px-2.5 py-0.5 te-mono text-[9px] uppercase tracking-widest text-ink-mute">
            +{table.columns.length - 8} more
          </li>
        )}
      </ul>

      {table.indexes.length > 0 && (
        <div className="px-2.5 py-1 border-t te-hairline flex flex-wrap gap-1">
          {table.indexes.slice(0, 4).map((i) => (
            <span
              key={i.name}
              className="te-mono text-[9px] uppercase tracking-widest text-ink-mute"
              title={`${i.using} on (${i.columns.join(", ")})${i.isUnique ? " unique" : ""}${i.isPartial ? " partial" : ""}`}
            >
              {i.using === "brin" ? "BRIN" : i.isPartial ? "PRT" : i.isUnique ? "UNQ" : "IDX"}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
