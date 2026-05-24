// Hand-positioned SVG diagram of the pg-inspector request flow.
// Sized for full-width display on the About page so labels stay legible
// at typical viewport widths.

export function ArchDiagram(): JSX.Element {
  return (
    <svg
      viewBox="0 0 960 460"
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
      <Box x={20} y={180} w={200} h={70} label="browser" subLabel="React + react-flow" />

      {/* Express on :3014 (the centerpiece) */}
      <Box
        x={290}
        y={180}
        w={260}
        h={70}
        label="Express :3014"
        subLabel="route · cache · helmet"
        accent
      />

      {/* The three safety layers, stacked on the right of Express */}
      <Box x={620} y={20} w={320} h={60} label="layer 1" subLabel="pg role inspector_ro" />
      <Box x={620} y={100} w={320} h={60} label="layer 2" subLabel="AST validator (pgsql-ast)" />
      <Box x={620} y={180} w={320} h={60} label="layer 3" subLabel="BEGIN READ ONLY · LIMIT" />

      {/* Postgres */}
      <Box
        x={620}
        y={290}
        w={320}
        h={60}
        label="Postgres 16"
        subLabel="5 scenario schemas · ~75K rows"
      />

      {/* AI side */}
      <Box x={20} y={20} w={200} h={70} label="Azure OpenAI" subLabel="gpt-4.1-mini" dashed />
      <Box x={20} y={310} w={200} h={70} label="Managed Identity" subLabel="no API keys" dashed />

      {/* Edges */}
      {/* browser <-> express */}
      <Edge from={[220, 215]} to={[290, 215]} both />

      {/* express -> 3 layers */}
      <Edge from={[550, 205]} to={[620, 50]} />
      <Edge from={[550, 210]} to={[620, 130]} />
      <Edge from={[550, 215]} to={[620, 210]} />
      {/* express -> postgres */}
      <Edge from={[550, 240]} to={[620, 320]} />

      {/* express <- azure openai (dashed: AI side flow) */}
      <Edge from={[120, 90]} to={[290, 195]} dashed />
      {/* managed identity -> express */}
      <Edge from={[120, 310]} to={[290, 240]} dashed />

      {/* Caption */}
      <text x={480} y={445} textAnchor="middle" className="fill-ink-mute font-mono" fontSize={13}>
        ── solid: query path - - dashed: AI + auth side-flows
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
  const dashAttr = dashed ? "6 4" : undefined;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={6}
        ry={6}
        className={`fill-transparent ${stroke}`}
        strokeWidth={1.5}
        strokeDasharray={dashAttr}
      />
      <text
        x={x + w / 2}
        y={subLabel === undefined ? y + h / 2 + 6 : y + h / 2 - 4}
        textAnchor="middle"
        className={accent ? "fill-[var(--accent-fintech)] font-mono" : "fill-ink font-mono"}
        fontSize={accent ? 18 : 16}
        fontWeight={accent ? 600 : 500}
      >
        {label}
      </text>
      {subLabel !== undefined && (
        <text
          x={x + w / 2}
          y={y + h / 2 + 16}
          textAnchor="middle"
          className="fill-ink-mute font-mono"
          fontSize={12}
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
  const dashAttr = dashed ? "6 4" : undefined;
  return (
    <line
      x1={from[0]}
      y1={from[1]}
      x2={to[0]}
      y2={to[1]}
      className="stroke-ink-mute"
      strokeWidth={1.75}
      strokeDasharray={dashAttr}
      markerEnd="url(#arrow)"
      markerStart={both ? "url(#arrow)" : undefined}
    />
  );
}
