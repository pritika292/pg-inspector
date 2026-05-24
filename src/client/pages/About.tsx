import { TopBar } from "../components/TopBar.js";

export function About({ onBack }: { onBack: () => void }): JSX.Element {
  return (
    <div className="h-screen flex flex-col bg-[var(--surface)] text-ink">
      <TopBar activeScenarioName="about" />
      <main className="flex-1 overflow-auto">
        <article className="max-w-2xl mx-auto px-6 py-10 space-y-8">
          <header>
            <p className="te-label">about</p>
            <h1 className="mt-2 font-mono text-2xl uppercase tracking-widest text-ink">
              pg-inspector
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-dim">
              A data-engineering sandbox. Five named-industry scenarios, each a multi-schema
              Postgres database with realistic seeded data. Explore the schema visually, write SQL
              or generate it from English, see query plans, and get schema-improvement suggestions.
            </p>
          </header>

          <section className="space-y-3">
            <h2 className="te-label-md">how the SQL stays safe</h2>
            <p className="text-[14px] leading-relaxed text-ink-dim">
              Three layers, defense in depth. (1) A dedicated read-only Postgres role (
              <code className="te-mono text-ink">inspector_ro</code>) with no
              INSERT/UPDATE/DELETE/CREATE/etc. on any scenario schema. (2) An AST validator (
              <code className="te-mono text-ink">pgsql-ast-parser</code>) that rejects anything that
              isn't exactly one SELECT. (3) Per-query guards wrapped in a BEGIN READ ONLY
              transaction: <code className="te-mono text-ink">SET LOCAL search_path</code> scoped to
              the chosen scenario's schemas,{" "}
              <code className="te-mono text-ink">SET LOCAL statement_timeout='1000ms'</code>, and a
              server-side
              <code className="te-mono text-ink"> LIMIT 500</code> wrap so even unbounded queries
              can't dump the table.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="te-label-md">the soft-reference idea</h2>
            <p className="text-[14px] leading-relaxed text-ink-dim">
              Inside each scenario, schemas reference each other with real Postgres foreign keys
              (rendered as solid edges in the visualizer). Across scenarios, references are "soft":
              informational columns with a{" "}
              <code className="te-mono text-ink">COMMENT ON COLUMN</code> declaring the target, no
              enforced FK. Real companies have data that crosses team boundaries without unified
              ownership; the visualizer shows that honestly with dashed edges between scenario
              boxes.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="te-label-md">the AI side</h2>
            <p className="text-[14px] leading-relaxed text-ink-dim">
              <code className="te-mono text-ink">gpt-4.1-mini</code> on Azure OpenAI Service.
              Authentication is via Managed Identity. The VM's System-Assigned identity has
              "Cognitive Services User" on the AI resource, so the runtime never holds an API key.
              Local development uses the same path via{" "}
              <code className="te-mono text-ink">DefaultAzureCredential</code>'s{" "}
              <code className="te-mono text-ink">az login</code> fallback. There's a daily 200-call
              budget bucket; once exceeded, endpoints return 429 until UTC midnight.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="te-label-md">honest limits</h2>
            <ul className="text-[14px] leading-relaxed text-ink-dim list-disc pl-5 space-y-2">
              <li>
                The data is seeded with <code className="te-mono text-ink">@faker-js/faker</code>:
                believable enough at a glance, but it's not real production data and the
                distributions are only approximately realistic.
              </li>
              <li>
                The AST validator is best-effort. The runtime role is the load-bearing defense; if a
                future Postgres bug let a SELECT escape the role's permissions, the exposure is "the
                same public data already on this page".
              </li>
              <li>
                Schema introspection assumes a small graph (~30 tables / scenario). It does not
                paginate. Hitting a 10K-table schema would slow the / endpoint.
              </li>
            </ul>
          </section>

          <div>
            <button type="button" onClick={onBack} className="te-button te-button-primary">
              ← BACK
            </button>
          </div>
        </article>
      </main>
    </div>
  );
}
