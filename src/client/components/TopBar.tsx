import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

const THEME_KEY = "pg-inspector:theme";

function readTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "dark";
  return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
}

function applyTheme(theme: "light" | "dark"): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function TopBar({
  activeScenarioName,
  onAboutClick,
  onHomeClick,
}: {
  activeScenarioName?: string;
  onAboutClick?: () => void;
  onHomeClick?: () => void;
}): JSX.Element {
  const [theme, setTheme] = useState<"light" | "dark">(readTheme);

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  return (
    <header className="te-panel border-b flex items-center justify-between px-4 py-2.5">
      <div className="flex items-center gap-3 min-w-0">
        {onHomeClick ? (
          <button
            type="button"
            onClick={onHomeClick}
            className="te-label text-ink hover:text-ink-dim"
            aria-label="home"
          >
            pg-inspector
          </button>
        ) : (
          <span className="te-label text-ink">pg-inspector</span>
        )}
        <span className="text-ink-mute">/</span>
        <span className="font-mono text-[11px] uppercase tracking-widest text-ink-dim truncate">
          {activeScenarioName ?? "select a scenario"}
        </span>
      </div>
      <div className="flex gap-1.5">
        {onAboutClick && (
          <button type="button" onClick={onAboutClick} className="te-button">
            ABOUT
          </button>
        )}
        <button
          type="button"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="te-button"
          aria-label="toggle theme"
        >
          {theme === "dark" ? <Sun size={12} /> : <Moon size={12} />}
          {theme === "dark" ? "LIGHT" : "DARK"}
        </button>
      </div>
    </header>
  );
}
