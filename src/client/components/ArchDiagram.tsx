// Dense distributed-systems topology for the pg-inspector About page.
// Plain SVG. Boxes grouped by tier with a VM "subgraph" frame so the
// picture reads as real infrastructure, not a marketing flowchart.

export function ArchDiagram(): JSX.Element {
  return (
    <svg
      viewBox="0 0 1200 720"
      className="block w-full h-auto"
      role="img"
      aria-label="pg-inspector architecture: browser hits Caddy on an Azure VM, Express runs SQL through a three-layer safety pipeline against a Postgres role with SELECT-only grants, schema cache lives in Redis, AI calls flow through Managed Identity to Azure OpenAI without API keys, and per-call token usage is reported to controlroom."
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

      {/* External (left) */}
      <GroupLabel x={100} y={32} label="EXTERNAL" />
      <Box x={20} y={50} w={200} h={56} label="browser" subLabel="React · react-flow · dagre" />
      <Box
        x={20}
        y={130}
        w={200}
        h={56}
        label="controlroom"
        subLabel="POST /api/ai-usage/:slug"
        dashed
      />
      <Box
        x={20}
        y={210}
        w={200}
        h={56}
        label="GitHub Actions"
        subLabel="OIDC token exchange"
        dashed
      />

      {/* VM subgraph */}
      <VmFrame x={280} y={20} w={620} h={680} label="Azure VM · B2as_v2 · northcentralus" />

      {/* Edge: Caddy */}
      <GroupLabel x={420} y={62} label="EDGE" />
      <Box x={310} y={80} w={220} h={56} label="Caddy" subLabel="TLS · pg.pritika.studio" />

      {/* Express tier */}
      <GroupLabel x={420} y={170} label="APP · pg-inspector :3014" />
      <Box
        x={310}
        y={190}
        w={220}
        h={62}
        label="Express 5 · Node 20"
        subLabel="helmet · rate-limit · zod"
        accent
      />

      {/* Three SQL safety layers */}
      <GroupLabel x={420} y={280} label="SQL SAFETY · DEFENSE IN DEPTH" />
      <Box
        x={310}
        y={300}
        w={220}
        h={56}
        label="Layer 1 · Postgres role"
        subLabel="inspector_ro · SELECT only"
      />
      <Box
        x={310}
        y={370}
        w={220}
        h={56}
        label="Layer 2 · AST validator"
        subLabel="pgsql-ast-parser · 1 SELECT"
      />
      <Box
        x={310}
        y={440}
        w={220}
        h={56}
        label="Layer 3 · safe runner"
        subLabel="BEGIN READ ONLY · 1s timeout · LIMIT 501"
      />

      {/* AI client */}
      <GroupLabel x={420} y={520} label="AI CLIENT" />
      <Box
        x={310}
        y={540}
        w={220}
        h={56}
        label="openai SDK"
        subLabel="chat + stream · daily budget 200"
      />
      <Box
        x={310}
        y={610}
        w={220}
        h={44}
        label="aiUsageEmit"
        subLabel="fire-and-forget POST"
        dashed
      />

      {/* Data plane */}
      <GroupLabel x={730} y={62} label="DATA PLANE · pritika network" />
      <Box
        x={620}
        y={80}
        w={260}
        h={70}
        label="Postgres 16"
        subLabel="5 scenarios · 21 sub-schemas · ~75K rows"
      />
      <Box
        x={620}
        y={170}
        w={260}
        h={56}
        label="Redis 7 · DB 13"
        subLabel="schema cache 5m · rate buckets"
      />
      <GroupLabel x={730} y={250} label="POOLS · SEPARATED BY ROLE" />
      <Box
        x={620}
        y={270}
        w={260}
        h={50}
        label="admin pool"
        subLabel="boot-only: migrate · seed"
        dashed
      />
      <Box
        x={620}
        y={330}
        w={260}
        h={50}
        label="runtime pool"
        subLabel="inspector_ro · all HTTP traffic"
      />

      {/* AI subsystem */}
      <GroupLabel x={730} y={410} label="AZURE OPENAI" />
      <Box
        x={620}
        y={430}
        w={260}
        h={56}
        label="gpt-4.1-mini deployment"
        subLabel="pritika-ai · north central"
      />

      {/* Secrets + deploy */}
      <GroupLabel x={730} y={510} label="SECRETS · DEPLOY" />
      <Box
        x={620}
        y={530}
        w={260}
        h={50}
        label="Managed Identity"
        subLabel="VM system-assigned"
        dashed
      />
      <Box
        x={620}
        y={590}
        w={260}
        h={50}
        label="Azure Key Vault"
        subLabel="Postgres creds · boot only"
        dashed
      />

      {/* Right edge: control plane */}
      <GroupLabel x={1020} y={32} label="CONTROL PLANE" />
      <Box
        x={920}
        y={50}
        w={260}
        h={56}
        label="GitHub · pritika292/pg-inspector"
        subLabel="ci · deploy · OIDC"
        dashed
      />
      <Box
        x={920}
        y={120}
        w={260}
        h={56}
        label="Azure Entra ID"
        subLabel="federated identity credential"
        dashed
      />
      <Box
        x={920}
        y={190}
        w={260}
        h={56}
        label="Azure RBAC"
        subLabel="Cognitive Services User on pritika-ai"
        dashed
      />
      <Box
        x={920}
        y={260}
        w={260}
        h={56}
        label="az vm run-command"
        subLabel="git pull · compose up"
        dashed
      />

      {/* Edges */}
      {/* External -> Caddy / Express */}
      <Edge from={[220, 78]} to={[310, 110]} both />
      <Edge from={[420, 138]} to={[420, 190]} />

      {/* Express -> safety layers (sequential pipeline) */}
      <Edge from={[420, 252]} to={[420, 300]} />
      <Edge from={[420, 356]} to={[420, 370]} />
      <Edge from={[420, 426]} to={[420, 440]} />

      {/* Layer 3 -> Postgres (runtime pool) */}
      <Edge from={[530, 468]} to={[620, 355]} />
      {/* admin pool -> Postgres (boot only) */}
      <Edge from={[750, 320]} to={[750, 150]} dashed />
      {/* runtime pool -> Postgres */}
      <Edge from={[750, 330]} to={[750, 150]} />

      {/* Express -> Redis */}
      <Edge from={[530, 220]} to={[620, 198]} />

      {/* AI client -> Azure OpenAI */}
      <Edge from={[530, 568]} to={[620, 458]} />
      {/* AI client uses MI */}
      <Edge from={[530, 596]} to={[620, 555]} dashed />
      {/* MI -> Key Vault (boot) */}
      <Edge from={[750, 580]} to={[750, 590]} dashed />

      {/* aiUsageEmit -> controlroom */}
      <Edge from={[310, 632]} to={[120, 186]} dashed />

      {/* Deploy: GitHub -> OIDC -> RBAC -> run-command -> Express */}
      <Edge from={[920, 78]} to={[920, 148]} dashed />
      <Edge from={[920, 148]} to={[920, 218]} dashed />
      <Edge from={[920, 218]} to={[920, 288]} dashed />
      <Edge from={[920, 288]} to={[530, 240]} dashed />

      {/* Caption */}
      <text x={600} y={702} textAnchor="middle" className="fill-ink-mute font-mono" fontSize={13}>
        ── solid: query / hot path - - dashed: auth · async telemetry · deploy
      </text>
    </svg>
  );
}

function GroupLabel({ x, y, label }: { x: number; y: number; label: string }): JSX.Element {
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      className="fill-ink-mute font-mono uppercase"
      fontSize={11}
      letterSpacing={2}
    >
      {label}
    </text>
  );
}

function VmFrame({
  x,
  y,
  w,
  h,
  label,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}): JSX.Element {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={10}
        ry={10}
        className="fill-transparent stroke-seam"
        strokeWidth={1}
        strokeDasharray="2 3"
      />
      <text
        x={x + 14}
        y={y + 14}
        className="fill-ink-mute font-mono uppercase"
        fontSize={10}
        letterSpacing={2}
      >
        {label}
      </text>
    </g>
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
        y={subLabel === undefined ? y + h / 2 + 5 : y + h / 2 - 4}
        textAnchor="middle"
        className={accent ? "fill-[var(--accent-fintech)] font-mono" : "fill-ink font-mono"}
        fontSize={accent ? 16 : 14}
        fontWeight={accent ? 600 : 500}
      >
        {label}
      </text>
      {subLabel !== undefined && (
        <text
          x={x + w / 2}
          y={y + h / 2 + 14}
          textAnchor="middle"
          className="fill-ink-mute font-mono"
          fontSize={11}
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
      strokeWidth={1.5}
      strokeDasharray={dashAttr}
      markerEnd="url(#arrow)"
      markerStart={both ? "url(#arrow)" : undefined}
    />
  );
}
