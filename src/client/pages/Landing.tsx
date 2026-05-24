import { useEffect, useState } from "react";
import { ArrowRight, Database, Sparkles, Wand2, ShieldCheck, KeyRound, Code } from "lucide-react";
import { apiGet } from "../lib/api.js";
import type { ScenarioListEntry } from "../lib/types.js";

interface Props {
  onTryIt: () => void;
  onAbout: () => void;
}

const FEATURES = [
  {
    icon: Database,
    title: "VISUALIZE",
    body: "Click a scenario, see its multi-schema layout drawn as an ER diagram with FK and soft-reference edges. Click any table node to inspect rows.",
  },
  {
    icon: Sparkles,
    title: "QUERY",
    body: "Write SQL safely (read-only role + AST validator + 1s timeout). Or ask in English and let gpt-4.1-mini draft a SELECT against the chosen scenario's schema.",
  },
  {
    icon: Wand2,
    title: "ADVISE",
    body: "Describe a requirement. The AI drafts the SQL, runs EXPLAIN against it, and suggests DDL changes (indexes, column adds) to make the plan faster.",
  },
];

export function Landing({ onTryIt, onAbout }: Props): JSX.Element {
  const [scenarios, setScenarios] = useState<ScenarioListEntry[] | undefined>(undefined);

  useEffect(() => {
    apiGet<ScenarioListEntry[]>("/api/scenarios")
      .then(setScenarios)
      .catch(() => setScenarios([]));
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-[var(--surface)] text-ink overflow-x-hidden">
      <header className="te-panel border-b flex items-center justify-between px-4 py-2.5">
        <span className="te-label text-ink">pg-inspector</span>
        <div className="flex gap-1.5">
          <button type="button" onClick={onAbout} className="te-button">
            ABOUT
          </button>
          <a
            href="https://github.com/pritika292/pg-inspector"
            target="_blank"
            rel="noopener"
            className="te-button flex items-center gap-1.5"
            aria-label="GitHub repo"
          >
            <Code size={12} />
            CODE
          </a>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="max-w-4xl mx-auto px-6 pt-16 pb-12 text-center">
          <p className="te-label">data sandbox · public read-only</p>
          <h1 className="mt-4 font-mono text-3xl md:text-4xl uppercase tracking-widest text-ink leading-tight">
            five industry schemas,
            <br />
            one Postgres playground
          </h1>
          <p className="mt-5 max-w-2xl mx-auto text-[15px] leading-relaxed text-ink-dim">
            Visualize multi-schema layouts, write SQL safely against ~75K seeded rows, generate
            queries from English, read EXPLAIN plans, get schema-improvement suggestions. AI runs on
            Azure OpenAI via Managed Identity. No API keys anywhere.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={onTryIt}
              className="te-button te-button-primary !px-5 !py-2.5"
            >
              TRY IT
              <ArrowRight size={12} />
            </button>
            <span className="te-label text-ink-mute">no signup · ~10 seconds to first query</span>
          </div>
        </section>

        {/* Features */}
        <section className="max-w-5xl mx-auto px-6 py-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className="te-panel p-5">
                  <div className="flex items-center gap-2">
                    <Icon size={14} className="text-ink-dim" />
                    <span className="te-label text-ink">{f.title}</span>
                  </div>
                  <p className="mt-3 text-[13px] leading-relaxed text-ink-dim">{f.body}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Scenarios */}
        <section className="max-w-5xl mx-auto px-6 py-8">
          <div className="flex items-baseline justify-between">
            <span className="te-label">five scenarios</span>
            <span className="te-label text-ink-mute">3–5 sub-schemas each · ~75K rows total</span>
          </div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
            {(scenarios ?? []).map((s) => (
              <div
                key={s.slug}
                className="te-panel p-3"
                style={{ borderLeftWidth: 2, borderLeftColor: `var(${s.accentVar})` }}
              >
                <div className="flex items-center justify-between">
                  <span className="te-mono text-[11px] uppercase tracking-widest text-ink">
                    {s.name}
                  </span>
                  <span
                    aria-hidden
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ background: `var(${s.accentVar})` }}
                  />
                </div>
                <p className="mt-1.5 text-[12px] leading-snug text-ink-dim min-h-[40px]">
                  {s.tagline}
                </p>
                <div className="mt-2 text-[10px] te-mono uppercase tracking-widest text-ink-mute tabular">
                  {s.industryAnalog}
                </div>
              </div>
            ))}
            {!scenarios && (
              <div className="te-panel p-3 col-span-5 te-label text-ink-mute">
                loading scenarios…
              </div>
            )}
          </div>
        </section>

        {/* Credibility band */}
        <section className="max-w-5xl mx-auto px-6 py-10">
          <div className="te-panel p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-start gap-3">
              <ShieldCheck size={16} className="text-ink-dim shrink-0 mt-0.5" />
              <div>
                <div className="te-label text-ink">three SQL safety layers</div>
                <p className="mt-1 text-[12px] leading-relaxed text-ink-dim">
                  Read-only Postgres role · AST validator · per-query transaction with search_path
                  and statement_timeout scoped to the chosen scenario.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <KeyRound size={16} className="text-ink-dim shrink-0 mt-0.5" />
              <div>
                <div className="te-label text-ink">no AI API keys</div>
                <p className="mt-1 text-[12px] leading-relaxed text-ink-dim">
                  Azure OpenAI authentication uses the VM's Managed Identity. Zero secret bytes in
                  the repo, in CI, or in any env file.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Database size={16} className="text-ink-dim shrink-0 mt-0.5" />
              <div>
                <div className="te-label text-ink">honest modeling</div>
                <p className="mt-1 text-[12px] leading-relaxed text-ink-dim">
                  Intra-scenario FKs are real Postgres foreign keys. Cross-scenario references are
                  soft (informational comments, not enforced); the visualizer shows that honestly
                  with dashed edges.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Second TRY */}
        <section className="max-w-3xl mx-auto px-6 py-12 text-center">
          <h2 className="font-mono text-lg uppercase tracking-widest text-ink">ready?</h2>
          <p className="mt-3 text-[14px] leading-relaxed text-ink-dim">
            Pick a scenario, click a seed-question chip, watch the plan tree highlight the slowest
            node, then ask the AI to suggest an index that would help.
          </p>
          <div className="mt-6">
            <button
              type="button"
              onClick={onTryIt}
              className="te-button te-button-primary !px-5 !py-2.5"
            >
              TRY IT
              <ArrowRight size={12} />
            </button>
          </div>
        </section>
      </main>

      <footer className="te-panel border-t px-6 py-4 flex items-center justify-between text-ink-mute">
        <span className="te-label">demo by pritika priyadarshini</span>
        <div className="flex gap-4 te-label">
          <button type="button" onClick={onAbout} className="hover:text-ink-dim">
            about
          </button>
          <a
            href="https://github.com/pritika292/pg-inspector"
            target="_blank"
            rel="noopener"
            className="hover:text-ink-dim"
          >
            github
          </a>
        </div>
      </footer>
    </div>
  );
}
