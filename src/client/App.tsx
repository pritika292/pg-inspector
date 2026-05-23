// Scaffold placeholder. The full UI (left scenarios, right visualizer,
// bottom toolbox) lands across Epic 5.
export function App() {
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] opacity-60">pg-inspector</p>
        <h1 className="mt-3 font-mono text-xl text-slate-900 dark:text-slate-100">
          multi-scenario data sandbox
        </h1>
        <p className="mt-4 max-w-md text-sm opacity-50">
          Pick a scenario. Explore its schema. Write SQL or generate it from English. See query
          plans. Get schema-improvement suggestions.
        </p>
        <p className="mt-8 font-mono text-[10px] uppercase tracking-[0.2em] opacity-30">
          shell · ui lands across epic 5
        </p>
      </div>
    </main>
  );
}
