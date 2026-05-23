import { useEffect, useMemo, useState } from "react";
import ReactFlow, { Background, Controls, MiniMap, type Edge, type Node } from "reactflow";
import dagre from "@dagrejs/dagre";
import "reactflow/dist/style.css";
import { apiGet } from "../lib/api.js";
import type { ScenarioListEntry, ScenarioSchema } from "../lib/types.js";
import { TableNode, type TableNodeData } from "./TableNode.js";

interface Props {
  scenario: ScenarioListEntry;
  onTableClick: (schemaName: string, tableName: string) => void;
}

const nodeTypes = { table: TableNode };

interface LayoutNode {
  id: string;
  width: number;
  height: number;
}

interface LayoutEdge {
  source: string;
  target: string;
}

const NODE_W = 260;
const NODE_H_BASE = 60;
const PER_COL_H = 14;
const SCHEMA_PAD = 24;

function laidOut(nodes: LayoutNode[], edges: LayoutEdge[]): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 32, ranksep: 80, marginx: 30, marginy: 30 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of nodes) g.setNode(n.id, { width: n.width, height: n.height });
  for (const e of edges) g.setEdge(e.source, e.target);
  dagre.layout(g);
  const out = new Map<string, { x: number; y: number }>();
  for (const n of nodes) {
    const layout = g.node(n.id);
    out.set(n.id, { x: layout.x - n.width / 2, y: layout.y - n.height / 2 });
  }
  return out;
}

export function Visualizer({ scenario, onTableClick }: Props): JSX.Element {
  const [schema, setSchema] = useState<ScenarioSchema | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setSchema(undefined);
    setError(undefined);
    apiGet<ScenarioSchema>(`/api/scenarios/${scenario.slug}`)
      .then((data) => {
        if (!cancelled) setSchema(data);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [scenario.slug]);

  const { nodes, edges } = useMemo(() => {
    if (!schema) return { nodes: [], edges: [] };

    const layoutNodes: LayoutNode[] = [];
    const layoutEdges: LayoutEdge[] = [];

    // One node per table for layout pass.
    for (const sch of schema.schemas) {
      for (const t of sch.tables) {
        const colCount = Math.min(t.columns.length, 8);
        layoutNodes.push({
          id: `${sch.name}.${t.name}`,
          width: NODE_W,
          height: NODE_H_BASE + colCount * PER_COL_H,
        });
      }
    }
    for (const fk of schema.fks) {
      if (fk.kind === "cross_scenario_soft") continue; // styled separately
      layoutEdges.push({
        source: `${fk.from.schema}.${fk.from.table}`,
        target: `${fk.to.schema}.${fk.to.table}`,
      });
    }

    const positions = laidOut(layoutNodes, layoutEdges);

    // Compute per-schema bounding boxes so we can render group shells.
    const schemaBounds = new Map<string, { x: number; y: number; w: number; h: number }>();
    for (const sch of schema.schemas) {
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const t of sch.tables) {
        const id = `${sch.name}.${t.name}`;
        const p = positions.get(id);
        if (!p) continue;
        const colCount = Math.min(t.columns.length, 8);
        const w = NODE_W;
        const h = NODE_H_BASE + colCount * PER_COL_H;
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x + w);
        maxY = Math.max(maxY, p.y + h);
      }
      if (isFinite(minX)) {
        schemaBounds.set(sch.name, {
          x: minX - SCHEMA_PAD,
          y: minY - SCHEMA_PAD - 16,
          w: maxX - minX + SCHEMA_PAD * 2,
          h: maxY - minY + SCHEMA_PAD * 2 + 16,
        });
      }
    }

    const rfNodes: Node[] = [];

    // Schema group shells first so they paint behind tables.
    for (const sch of schema.schemas) {
      const b = schemaBounds.get(sch.name);
      if (!b) continue;
      rfNodes.push({
        id: `group:${sch.name}`,
        type: "default",
        position: { x: b.x, y: b.y },
        data: { label: sch.name },
        draggable: false,
        selectable: false,
        style: {
          width: b.w,
          height: b.h,
          background: "transparent",
          border: `1px solid var(--seam)`,
          borderRadius: 2,
          padding: 0,
          fontFamily: "JetBrains Mono",
          fontSize: 10,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--ink-mute)",
          textAlign: "left",
          zIndex: 0,
        } as React.CSSProperties,
      });
    }

    // Table nodes.
    for (const sch of schema.schemas) {
      for (const t of sch.tables) {
        const id = `${sch.name}.${t.name}`;
        const p = positions.get(id);
        if (!p) continue;
        const nodeData: TableNodeData = {
          schemaName: sch.name,
          table: t,
          accentVar: scenario.accentVar,
          onClick: onTableClick,
        };
        rfNodes.push({
          id,
          type: "table",
          position: { x: p.x, y: p.y },
          data: nodeData as unknown as Record<string, unknown>,
          draggable: true,
          zIndex: 1,
        });
      }
    }

    const rfEdges: Edge[] = schema.fks.map((fk, i) => {
      const source = `${fk.from.schema}.${fk.from.table}`;
      const target = `${fk.to.schema}.${fk.to.table}`;
      const isSoft = fk.kind === "cross_scenario_soft";
      const isCrossSchema = fk.kind === "cross_schema_same_scenario";
      return {
        id: `e:${i}`,
        source,
        target,
        animated: false,
        style: {
          stroke: isSoft
            ? `var(${scenario.accentVar})`
            : isCrossSchema
              ? "var(--ink-dim)"
              : "var(--ink-mute)",
          strokeWidth: isSoft ? 1.2 : isCrossSchema ? 1.5 : 1,
          strokeDasharray: isSoft ? "4 4" : undefined,
        },
        label: isSoft ? "soft" : undefined,
        labelStyle: {
          fontFamily: "JetBrains Mono",
          fontSize: 9,
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          fill: `var(${scenario.accentVar})`,
        },
        labelBgStyle: { fill: "var(--surface)" },
      } satisfies Edge;
    });

    return { nodes: rfNodes, edges: rfEdges };
  }, [schema, scenario.accentVar, onTableClick]);

  return (
    <div className="te-panel border-l border-r h-full relative te-fade-in">
      {!schema && !error && (
        <div className="absolute inset-0 grid place-items-center te-label">loading schema…</div>
      )}
      {error && (
        <div className="absolute inset-0 grid place-items-center te-label text-accent-fintech">
          {error}
        </div>
      )}
      {schema && (
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.2}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} color="var(--seam)" />
          <Controls showInteractive={false} />
          <MiniMap
            pannable
            zoomable
            nodeStrokeColor={() => "var(--ink-mute)"}
            nodeColor={() => "var(--surface-elevated)"}
            maskColor="rgba(0,0,0,0.4)"
            style={{ background: "var(--surface)" }}
          />
        </ReactFlow>
      )}
    </div>
  );
}
