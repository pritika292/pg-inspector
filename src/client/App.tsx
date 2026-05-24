import { useEffect, useState } from "react";
import { TopBar } from "./components/TopBar.js";
import { ScenarioList } from "./components/ScenarioList.js";
import { Visualizer } from "./components/Visualizer.js";
import { TableDataView } from "./components/TableDataView.js";
import { Toolbox } from "./components/Toolbox.js";
import { About } from "./pages/About.js";
import { Landing } from "./pages/Landing.js";
import type { ScenarioListEntry } from "./lib/types.js";

interface OpenTable {
  schemaName: string;
  tableName: string;
}

function currentPath(): string {
  return typeof window === "undefined" ? "/" : window.location.pathname;
}

const ONBOARDED_KEY = "pg-inspector:onboarded:v1";

export function App(): JSX.Element {
  const [path, setPath] = useState<string>(currentPath);
  const [scenario, setScenario] = useState<ScenarioListEntry | undefined>(undefined);
  const [openTable, setOpenTable] = useState<OpenTable | undefined>(undefined);
  // Onboarding hint visibility, gated by localStorage so it only shows on
  // a user's first visit per browser.
  const [hintVisible, setHintVisible] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(ONBOARDED_KEY) !== "1";
  });
  const markOnboarded = (): void => {
    try {
      localStorage.setItem(ONBOARDED_KEY, "1");
    } catch {
      /* ignore */
    }
    setHintVisible(false);
  };

  useEffect(() => {
    const onPop = (): void => setPath(currentPath());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const go = (p: string): void => {
    if (typeof window !== "undefined") window.history.pushState({}, "", p);
    setPath(p);
    window.scrollTo({ top: 0 });
  };

  if (path === "/about") {
    return <About onBack={() => go("/")} />;
  }
  if (path === "/" || path === "") {
    return <Landing onTryIt={() => go("/app")} onAbout={() => go("/about")} />;
  }

  // /app: the working surface
  const handleSelectScenario = (entry: ScenarioListEntry): void => {
    setScenario(entry);
    setOpenTable(undefined);
    if (hintVisible) markOnboarded();
  };

  const handleTableClick = (schemaName: string, tableName: string): void => {
    setOpenTable((curr) =>
      curr && curr.schemaName === schemaName && curr.tableName === tableName
        ? undefined
        : { schemaName, tableName },
    );
  };

  return (
    <div className="h-screen flex flex-col bg-[var(--surface)] text-ink">
      <TopBar
        activeScenarioName={scenario?.name}
        onAboutClick={() => go("/about")}
        onHomeClick={() => go("/")}
      />

      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 flex min-h-0">
          <div className="w-[260px] shrink-0 hidden md:flex md:flex-col">
            {hintVisible && !scenario && (
              <div className="te-panel border-b px-3 py-2 te-label text-ink-dim">
                ← pick a scenario to begin
              </div>
            )}
            <div className="flex-1 min-h-0">
              <ScenarioList activeSlug={scenario?.slug} onSelect={handleSelectScenario} />
            </div>
          </div>

          <div className="flex-1 min-w-0 flex flex-col">
            {hintVisible && scenario && !openTable && (
              <div className="te-panel border-b px-3 py-1.5 te-label text-ink-dim flex items-center justify-between">
                <span>tip: click any table node to inspect its rows</span>
                <button type="button" onClick={markOnboarded} className="te-label hover:text-ink">
                  dismiss
                </button>
              </div>
            )}
            <div className="flex-1 min-h-0">
              {scenario ? (
                <Visualizer scenario={scenario} onTableClick={handleTableClick} />
              ) : (
                <EmptyVisualizer />
              )}
            </div>
          </div>

          {openTable && scenario && (
            <div className="w-[420px] shrink-0 hidden lg:block">
              <TableDataView
                scenarioSlug={scenario.slug}
                schemaName={openTable.schemaName}
                tableName={openTable.tableName}
                onClose={() => setOpenTable(undefined)}
              />
            </div>
          )}
        </div>

        {/* Mobile-only scenario chip strip; replaces the left pane below md */}
        <div className="md:hidden">
          <MobileScenarioStrip activeSlug={scenario?.slug} onSelect={handleSelectScenario} />
        </div>

        {scenario ? <Toolbox scenario={scenario} /> : <BottomToolboxPlaceholder />}
      </div>
    </div>
  );
}

function EmptyVisualizer(): JSX.Element {
  return (
    <div className="te-panel border-l border-r grid place-items-center h-full">
      <div className="text-center max-w-md px-6">
        <p className="te-label">visualizer</p>
        <p className="mt-2 font-mono text-[12px] uppercase tracking-widest text-ink">
          pick a scenario on the left
        </p>
        <p className="mt-3 text-[12px] text-ink-dim">
          Each scenario models a real industry's multi-schema layout. Click a table node to inspect
          its rows; use the toolbox below to write SQL, generate it from English, or get
          schema-improvement suggestions.
        </p>
      </div>
    </div>
  );
}

function BottomToolboxPlaceholder(): JSX.Element {
  return (
    <div className="te-panel border-t h-[240px] flex items-center justify-center shrink-0">
      <p className="te-label">toolbox: pick a scenario</p>
    </div>
  );
}

function MobileScenarioStrip({
  activeSlug,
  onSelect,
}: {
  activeSlug: string | undefined;
  onSelect: (entry: ScenarioListEntry) => void;
}): JSX.Element {
  const [entries, setEntries] = useState<ScenarioListEntry[] | undefined>(undefined);

  useEffect(() => {
    fetch("/api/scenarios")
      .then((r) => r.json() as Promise<ScenarioListEntry[]>)
      .then(setEntries)
      .catch(() => setEntries([]));
  }, []);

  return (
    <div className="te-panel border-t flex gap-1 overflow-x-auto px-2 py-1.5">
      {entries?.map((s) => {
        const isActive = activeSlug === s.slug;
        return (
          <button
            key={s.slug}
            type="button"
            onClick={() => onSelect(s)}
            className="te-button shrink-0"
            style={
              isActive ? { borderColor: `var(${s.accentVar})`, color: "var(--ink)" } : undefined
            }
          >
            {s.name}
          </button>
        );
      })}
    </div>
  );
}
