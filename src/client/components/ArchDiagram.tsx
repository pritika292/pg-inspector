// Hand-positioned SVG diagram of the pg-inspector request flow (#123).
// React Flow would be overkill for one static diagram on the About page;
// plain SVG keeps the bundle small and tracks the dark theme for free.

export function ArchDiagram(): JSX.Element {
  return (
    <svg
      viewBox="0 0 540 320"
      className="block w-full h-auto"
      role="img"
      aria-label="pg-inspector flow: browser sends SQL or natural-language to Express; AST validator + read-only role + safe runner gate the query; Postgres returns rows; Azure OpenAI generates SQL via Managed Identity."
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <marker
          id="arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 z" className="fill-ink-mute" />
        </marker>
      </defs>

      {/* Browser */}
      <Box x={10} y={130} w={120} h={50} label="browser" subLabel="React + react-flow" />

      {/* Express on :3014 */}
      <Box x={200} y={130} w={140} h={50} label="Express :3014" subLabel="route + cache" accent />

      {/* The three safety layers, stacked */}
      <Box x={380} y={10} w={150} h={50} label="layer 1" subLabel="pg role inspector_ro" />
      <Box x={380} y={80} w={150} h={50} label="layer 2" subLabel="AST validator (pgsql-ast)" />
      <Box x={380} y={150} w={150} h={50} label="layer 3" subLabel="BEGIN READ ONLY + LIMIT" />

      {/* Postgres */}
      <Box x={380} y={230} w={150} h={50} label="Postgres 16" subLabel="5 scenario schemas" />

      {/* OpenAI side */}
      <Box x={10} y={10} w={120} h={50} label="Azure OpenAI" subLabel="gpt-4.1-mini" dashed />
      <Box x={10} y={240} w={120} h={50} label="Managed Identity" subLabel="no API keys" dashed />

      {/* Edges */}
      <Edge from={[130, 155]} to={[200, 155]} both />

      {/* express -> 3 layers + postgres */}
      <Edge from={[340, 145]} to={[380, 35]} />
      <Edge from={[340, 150]} to={[380, 105]} />
      <Edge from={[340, 155]} to={[380, 175]} />
      <Edge from={[340, 170]} to={[380, 255]} />

      {/* express <- openai */}
      <Edge from={[70, 60]} to={[200, 140]} dashed />
      {/* express -> managed identity */}
      <Edge from={[70, 240]} to={[200, 170]} dashed />

      {/* Caption */}
      <text x={270} y={310} textAnchor="middle" className="fill-ink-mute font-mono" fontSize={10}>
        ── solid: query path · - - dashed: AI + auth side-flows
      </text>
    </svg>
  );
}

function Box({
  x,
  y,
  w,
  h,
  label,
  subLabel,
  accent = false,
  dashed = false,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  subLabel?: string;
  accent?: boolean;
  dashed?: boolean;
}): JSX.Element {
  const stroke = accent
    ? "stroke-[var(--accent-fintech)]"
    : dashed
      ? "stroke-seam"
      : "stroke-ink-mute";
  const dashAttr = dashed ? "4 3" : undefined;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={3}
        ry={3}
        className={`fill-transparent ${stroke}`}
        strokeWidth={1}
        strokeDasharray={dashAttr}
      />
      <text
        x={x + w / 2}
        y={subLabel === undefined ? y + h / 2 + 4 : y + h / 2 - 1}
        textAnchor="middle"
        className={accent ? "fill-[var(--accent-fintech)] font-mono" : "fill-ink font-mono"}
        fontSize={11}
      >
        {label}
      </text>
      {subLabel !== undefined && (
        <text
          x={x + w / 2}
          y={y + h / 2 + 12}
          textAnchor="middle"
          className="fill-ink-mute font-mono"
          fontSize={9}
        >
          {subLabel}
        </text>
      )}
    </g>
  );
}

function Edge({
  from,
  to,
  dashed = false,
  both = false,
}: {
  from: [number, number];
  to: [number, number];
  dashed?: boolean;
  both?: boolean;
}): JSX.Element {
  const dashAttr = dashed ? "4 3" : undefined;
  return (
    <line
      x1={from[0]}
      y1={from[1]}
      x2={to[0]}
      y2={to[1]}
      className="stroke-ink-mute"
      strokeWidth={1}
      strokeDasharray={dashAttr}
      markerEnd="url(#arrow)"
      markerStart={both ? "url(#arrow)" : undefined}
    />
  );
}
