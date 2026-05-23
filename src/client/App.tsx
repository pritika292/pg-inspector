import { useState } from "react";
import { TopBar } from "./components/TopBar.js";
import { ScenarioList } from "./components/ScenarioList.js";
import { Visualizer } from "./components/Visualizer.js";
import { TableDataView } from "./components/TableDataView.js";
import { Toolbox } from "./components/Toolbox.js";
import type { ScenarioListEntry } from "./lib/types.js";

interface OpenTable {
  schemaName: string;
  tableName: string;
}

export function App(): JSX.Element {
  const [scenario, setScenario] = useState<ScenarioListEntry | undefined>(undefined);
  const [openTable, setOpenTable] = useState<OpenTable | undefined>(undefined);

  const handleSelectScenario = (entry: ScenarioListEntry): void => {
    setScenario(entry);
    setOpenTable(undefined);
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
      <TopBar activeScenarioName={scenario?.name} />

      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 flex min-h-0">
          <div className="w-[260px] shrink-0">
            <ScenarioList activeSlug={scenario?.slug} onSelect={handleSelectScenario} />
          </div>

          <div className="flex-1 min-w-0">
            {scenario ? (
              <Visualizer scenario={scenario} onTableClick={handleTableClick} />
            ) : (
              <EmptyVisualizer />
            )}
          </div>

          {openTable && scenario && (
            <div className="w-[420px] shrink-0">
              <TableDataView
                scenarioSlug={scenario.slug}
                schemaName={openTable.schemaName}
                tableName={openTable.tableName}
                onClose={() => setOpenTable(undefined)}
              />
            </div>
          )}
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
      <p className="te-label">toolbox — wires up in next slice</p>
    </div>
  );
}
