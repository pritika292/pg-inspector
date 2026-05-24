import { TopBar } from "../components/TopBar.js";
import { ArchDiagram } from "../components/ArchDiagram.js";

// Real-author contact set, mirrors ContactStrip.tsx + the family-wide
// 5-link spec from controlroom#83.
const LINKEDIN = "https://linkedin.com/in/pritika-priyadarshini";
const EMAIL = "pritikaapriyadarshini@gmail.com";
const GITHUB = "https://github.com/pritika292";
const PORTFOLIO = "https://pritika.studio";
const RESUME = "https://pritika.studio/pritika_resume.pdf";

interface TechRow {
  name: string;
  why: string;
}

const TECH: TechRow[] = [
  { name: "Express 5 + TypeScript", why: "thin router, strict types end-to-end" },
  { name: "React 18 + Vite", why: "fast HMR + small build for the visualizer + toolbox shell" },
  { name: "react-flow", why: "schema graph with custom table nodes + soft-reference edges" },
  { name: "Postgres 16", why: "five scenario schemas, separate read-only role for SQL surface" },
  { name: "pgsql-ast-parser", why: "AST-level SELECT-only validator before any query hits the DB" },
  { name: "Azure OpenAI (gpt-4.1-mini)", why: "nl-to-SQL + plan reading; 200-call daily budget" },
  { name: "Managed Identity", why: "no API keys anywhere; az login fallback for local dev" },
  { name: "Redis", why: "schema introspection cache + per-IP rate buckets" },
  { name: "Caddy", why: "Let's Encrypt + reverse proxy at pg.pritika.studio" },
];

export function About({ onBack }: { onBack: () => void }): JSX.Element {
  return (
    <div className="h-screen flex flex-col bg-[var(--surface)] text-ink">
      <TopBar activeScenarioName="about" />
      <main className="flex-1 overflow-auto">
        <article className="max-w-screen-2xl mx-auto px-6 lg:px-8 xl:px-12 py-10">
          <header>
            <p className="te-label">about</p>
            <h1 className="mt-2 font-mono text-2xl uppercase tracking-widest text-ink">
              pg-inspector
            </h1>
          </header>

          {/* Full-width architecture diagram. Used to live inside the
              middle column and was too small to read. Now spans the page
              so labels and edges are legible at typical viewport widths. */}
          <section className="mt-10 te-panel p-6 lg:p-8">
            <p className="te-label">architecture</p>
            <div className="mt-4">
              <ArchDiagram />
            </div>
          </section>

          <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
            {/* Left: story */}
            <section className="space-y-6">
              <p className="te-label">story</p>
              <p className="text-[15px] leading-relaxed text-justify text-ink-dim">
                A data-engineering sandbox. Five named-industry scenarios, each a multi-schema
                Postgres database with realistic seeded data. Explore the schema visually, write SQL
                or generate it from English, see query plans, and get schema-improvement
                suggestions.
              </p>
              <section className="space-y-2">
                <h2 className="te-label-md">how the SQL stays safe</h2>
                <p className="text-[14px] leading-relaxed text-justify text-ink-dim">
                  Three layers, defense in depth. (1) A dedicated read-only Postgres role (
                  <code className="font-mono text-ink">inspector_ro</code>) with no
                  INSERT/UPDATE/DELETE/CREATE/etc. on any scenario schema. (2) An AST validator (
                  <code className="font-mono text-ink">pgsql-ast-parser</code>) that rejects
                  anything that isn&apos;t exactly one SELECT. (3) Per-query guards wrapped in a
                  BEGIN READ ONLY transaction:{" "}
                  <code className="font-mono text-ink">SET LOCAL search_path</code> scoped to the
                  chosen scenario&apos;s schemas,{" "}
                  <code className="font-mono text-ink">
                    SET LOCAL statement_timeout=&apos;1000ms&apos;
                  </code>
                  , and a server-side <code className="font-mono text-ink">LIMIT 500</code> wrap.
                </p>
              </section>
              <section className="space-y-2">
                <h2 className="te-label-md">the soft-reference idea</h2>
                <p className="text-[14px] leading-relaxed text-justify text-ink-dim">
                  Inside each scenario, schemas reference each other with real Postgres foreign keys
                  (rendered as solid edges in the visualizer). Across scenarios, references are
                  &ldquo;soft&rdquo;: informational columns with a{" "}
                  <code className="font-mono text-ink">COMMENT ON COLUMN</code> declaring the
                  target, no enforced FK. Real companies have data that crosses team boundaries
                  without unified ownership; the visualizer shows that honestly with dashed edges
                  between scenario boxes.
                </p>
              </section>
              <section className="space-y-2">
                <h2 className="te-label-md">the AI side</h2>
                <p className="text-[14px] leading-relaxed text-justify text-ink-dim">
                  <code className="font-mono text-ink">gpt-4.1-mini</code> on Azure OpenAI.
                  Authentication is via Managed Identity; the VM&apos;s System-Assigned identity has
                  Cognitive Services User on the AI resource so the runtime never holds an API key.
                  Local development uses the same path via{" "}
                  <code className="font-mono text-ink">DefaultAzureCredential</code>&apos;s{" "}
                  <code className="font-mono text-ink">az login</code> fallback. There&apos;s a
                  daily 200-call budget; once exceeded, endpoints return 429 until UTC midnight.
                </p>
              </section>
              <section className="space-y-2">
                <h2 className="te-label-md">honest limits</h2>
                <ul className="text-[14px] leading-relaxed text-ink-dim list-disc pl-5 space-y-1">
                  <li>
                    Data is seeded with <code className="font-mono text-ink">@faker-js/faker</code>:
                    believable at a glance, not real production data.
                  </li>
                  <li>
                    AST validator is best-effort; the runtime role is the load-bearing defense.
                  </li>
                  <li>Schema introspection assumes ~30 tables per scenario; does not paginate.</li>
                </ul>
              </section>
            </section>

            {/* Middle: tech list (diagram moved to its own full-width section above). */}
            <section className="space-y-6">
              <p className="te-label">tech</p>
              <dl className="space-y-3">
                {TECH.map((t) => (
                  <div key={t.name}>
                    <dt className="font-mono text-sm text-ink">{t.name}</dt>
                    <dd className="mt-0.5 text-sm text-ink-mute">{t.why}</dd>
                  </div>
                ))}
              </dl>
            </section>

            {/* Right: contact */}
            <section className="space-y-6">
              <p className="te-label">contact</p>
              <ul className="te-panel divide-y divide-seam">
                <ContactRow href={RESUME} label="Resume" value="pritika_resume.pdf" external />
                <ContactRow href={`mailto:${EMAIL}`} label="Email" value={EMAIL} />
                <ContactRow
                  href={LINKEDIN}
                  label="LinkedIn"
                  value="linkedin.com/in/pritika-priyadarshini"
                  external
                />
                <ContactRow href={GITHUB} label="GitHub" value="github.com/pritika292" external />
                <ContactRow href={PORTFOLIO} label="Portfolio" value="pritika.studio" external />
              </ul>
              <p className="text-sm text-ink-mute">
                5-YOE backend / distributed-systems engineer. Open to senior IC roles — US-remote
                preferred, on-site SF / NYC welcome.
              </p>
              <div>
                <button type="button" onClick={onBack} className="te-button te-button-primary">
                  ← BACK
                </button>
              </div>
            </section>
          </div>
        </article>
      </main>
    </div>
  );
}

function ContactRow({
  href,
  label,
  value,
  external = false,
}: {
  href: string;
  label: string;
  value: string;
  external?: boolean;
}): JSX.Element {
  return (
    <li>
      <a
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-surface-2 transition-colors"
      >
        <span className="te-label">{label}</span>
        <span className="font-mono text-sm text-ink truncate text-right">{value}</span>
      </a>
    </li>
  );
}
