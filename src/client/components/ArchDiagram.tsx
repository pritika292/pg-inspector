// Dense distributed-systems topology for the pg-inspector About page.
// Plain SVG. Boxes grouped by tier with a VM "subgraph" frame so the
// picture reads as real infrastructure, not a marketing flowchart.
//
// Box helper auto-wraps long sub-labels at the " · " separator and
// stretches the rect to fit additional lines. Each box can carry a
// `tone` prop that tints the stroke + label using pg-inspector's
// scenario palette (social-violet, enterprise-sky, infra-amber,
// ecommerce-emerald, fintech-cyan) so the tier rhythm reads at a glance.

type Tone = "accent" | "edge" | "safety" | "ai" | "data" | "secrets" | "control" | "neutral";

const TONE: Record<Tone, { stroke: string; label: string }> = {
  // pg-inspector's primary accent is fintech-cyan; reuse for Express.
  accent: {
    stroke: "stroke-[var(--accent-fintech)]",
    label: "fill-[var(--accent-fintech)]",
  },
  edge: {
    stroke: "stroke-[var(--accent-social)]",
    label: "fill-[var(--accent-social)]",
  },
  safety: {
    stroke: "stroke-[var(--accent-enterprise)]",
    label: "fill-[var(--accent-enterprise)]",
  },
  ai: {
    stroke: "stroke-[var(--accent-infra)]",
    label: "fill-[var(--accent-infra)]",
  },
  data: {
    stroke: "stroke-[var(--accent-ecommerce)]",
    label: "fill-[var(--accent-ecommerce)]",
  },
  secrets: {
    stroke: "stroke-[var(--accent-social)]",
    label: "fill-[var(--accent-social)]",
  },
  control: {
    stroke: "stroke-[var(--accent-enterprise)]",
    label: "fill-[var(--accent-enterprise)]",
  },
  neutral: { stroke: "stroke-ink-mute", label: "fill-ink" },
};

const SUB_FONT_SIZE = 11;

function wrapSub(sub: string, w: number): string[] {
  const charBudget = Math.floor((w - 16) / (SUB_FONT_SIZE * 0.55));
  if (sub.length <= charBudget) return [sub];
  const tokens = sub.split(" · ");
  if (tokens.length === 1) return [sub];
  const lines: string[] = [];
  let cur = "";
  for (const t of tokens) {
    const next = cur ? `${cur} · ${t}` : t;
    if (next.length <= charBudget) {
      cur = next;
    } else {
      if (cur) lines.push(cur);
      cur = t;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

export function ArchDiagram(): JSX.Element {
  return (
    <svg
      viewBox="0 0 1200 760"
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
      <Box x={20} y={50} w={200} h={56} label="browser" sub="React · react-flow · dagre" />
      <Box
        x={20}
        y={130}
        w={200}
        h={56}
        label="controlroom"
        sub="POST /api/ai-usage/:slug"
        dashed
      />
      <Box x={20} y={210} w={200} h={56} label="GitHub Actions" sub="OIDC token exchange" dashed />

      {/* VM subgraph */}
      <VmFrame x={280} y={20} w={620} h={720} label="Azure VM · B2as_v2 · northcentralus" />

      {/* Edge: Caddy */}
      <GroupLabel x={420} y={62} label="EDGE" />
      <Box x={310} y={80} w={220} h={56} label="Caddy" sub="TLS · pg.pritika.studio" tone="edge" />

      {/* Express tier */}
      <GroupLabel x={420} y={170} label="APP · pg-inspector :3014" />
      <Box
        x={310}
        y={190}
        w={220}
        h={62}
        label="Express 5 · Node 20"
        sub="helmet · rate-limit · zod"
        tone="accent"
      />

      {/* Three SQL safety layers */}
      <GroupLabel x={420} y={280} label="SQL SAFETY · DEFENSE IN DEPTH" />
      <Box
        x={310}
        y={300}
        w={220}
        h={56}
        label="Layer 1 · Postgres role"
        sub="inspector_ro · SELECT only"
        tone="safety"
      />
      <Box
        x={310}
        y={370}
        w={220}
        h={56}
        label="Layer 2 · AST validator"
        sub="pgsql-ast-parser · 1 SELECT"
        tone="safety"
      />
      <Box
        x={310}
        y={440}
        w={220}
        h={56}
        label="Layer 3 · safe runner"
        sub="BEGIN READ ONLY · 1s timeout · LIMIT 501"
        tone="safety"
      />

      {/* AI client */}
      <GroupLabel x={420} y={520} label="AI CLIENT" />
      <Box
        x={310}
        y={540}
        w={220}
        h={56}
        label="openai SDK"
        sub="chat + stream · daily budget 200"
        tone="ai"
      />
      <Box
        x={310}
        y={610}
        w={220}
        h={44}
        label="aiUsageEmit"
        sub="fire-and-forget POST"
        tone="ai"
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
        sub="5 scenarios · 21 sub-schemas · ~75K rows"
        tone="data"
      />
      <Box
        x={620}
        y={170}
        w={260}
        h={56}
        label="Redis 7 · DB 13"
        sub="schema cache 5m · rate buckets"
        tone="data"
      />
      <GroupLabel x={730} y={250} label="POOLS · SEPARATED BY ROLE" />
      <Box
        x={620}
        y={270}
        w={260}
        h={50}
        label="admin pool"
        sub="boot-only: migrate · seed"
        tone="data"
        dashed
      />
      <Box
        x={620}
        y={330}
        w={260}
        h={50}
        label="runtime pool"
        sub="inspector_ro · all HTTP traffic"
        tone="data"
      />

      {/* AI subsystem */}
      <GroupLabel x={730} y={410} label="AZURE OPENAI" />
      <Box
        x={620}
        y={430}
        w={260}
        h={56}
        label="gpt-4.1-mini deployment"
        sub="pritika-ai · north central"
        tone="ai"
      />

      {/* Secrets + deploy */}
      <GroupLabel x={730} y={510} label="SECRETS · DEPLOY" />
      <Box
        x={620}
        y={530}
        w={260}
        h={50}
        label="Managed Identity"
        sub="VM system-assigned"
        tone="secrets"
        dashed
      />
      <Box
        x={620}
        y={590}
        w={260}
        h={50}
        label="Azure Key Vault"
        sub="Postgres creds · boot only"
        tone="secrets"
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
        sub="ci · deploy · OIDC"
        tone="control"
        dashed
      />
      <Box
        x={920}
        y={120}
        w={260}
        h={56}
        label="Azure Entra ID"
        sub="federated identity credential"
        tone="control"
        dashed
      />
      <Box
        x={920}
        y={190}
        w={260}
        h={56}
        label="Azure RBAC"
        sub="Cognitive Services User on pritika-ai"
        tone="control"
        dashed
      />
      <Box
        x={920}
        y={260}
        w={260}
        h={56}
        label="az vm run-command"
        sub="git pull · compose up"
        tone="control"
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
      <Edge from={[750, 320]} to={[750, 150]} dashed />
      <Edge from={[750, 330]} to={[750, 150]} />

      {/* Express -> Redis */}
      <Edge from={[530, 220]} to={[620, 198]} />

      {/* AI client -> Azure OpenAI */}
      <Edge from={[530, 568]} to={[620, 458]} />
      <Edge from={[530, 596]} to={[620, 555]} dashed />
      <Edge from={[750, 580]} to={[750, 590]} dashed />

      {/* aiUsageEmit -> controlroom */}
      <Edge from={[310, 632]} to={[120, 186]} dashed />

      {/* Deploy: GitHub -> OIDC -> RBAC -> run-command -> Express */}
      <Edge from={[920, 78]} to={[920, 148]} dashed />
      <Edge from={[920, 148]} to={[920, 218]} dashed />
      <Edge from={[920, 218]} to={[920, 288]} dashed />
      <Edge from={[920, 288]} to={[530, 240]} dashed />

      {/* Caption */}
      <text x={600} y={742} textAnchor="middle" className="fill-ink-mute font-mono" fontSize={13}>
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
  sub,
  tone = "neutral",
  dashed = false,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  sub?: string;
  tone?: Tone;
  dashed?: boolean;
}): JSX.Element {
  const subLines = sub ? wrapSub(sub, w) : [];
  const extraHeight = Math.max(0, (subLines.length - 1) * 12);
  const rectH = h + extraHeight;
  const palette = TONE[tone];
  const isAccent = tone === "accent";
  const strokeClass = dashed && tone === "neutral" ? "stroke-seam" : palette.stroke;
  const dashAttr = dashed ? "6 4" : undefined;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={rectH}
        rx={6}
        ry={6}
        className={`fill-transparent ${strokeClass}`}
        strokeWidth={isAccent ? 1.75 : 1.5}
        strokeDasharray={dashAttr}
      />
      <text
        x={x + w / 2}
        y={sub ? y + h / 2 - 4 : y + h / 2 + 5}
        textAnchor="middle"
        className={`${palette.label} font-mono`}
        fontSize={isAccent ? 16 : 14}
        fontWeight={isAccent ? 600 : 500}
      >
        {label}
      </text>
      {subLines.map((line, i) => (
        <text
          key={i}
          x={x + w / 2}
          y={y + h / 2 + 14 + i * 12}
          textAnchor="middle"
          className="fill-ink-mute font-mono"
          fontSize={SUB_FONT_SIZE}
        >
          {line}
        </text>
      ))}
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
