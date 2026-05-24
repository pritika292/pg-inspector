import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: [path.join(repoRoot, "src/client/**/*.{ts,tsx,html}")],
  theme: {
    extend: {
      fontFamily: {
        // Hand-tuned stack; see index.css for the @font-face declarations.
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      colors: {
        ink: "var(--ink)",
        "ink-dim": "var(--ink-dim)",
        "ink-mute": "var(--ink-mute)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-elevated)",
        seam: "var(--seam)",
        "accent-social": "var(--accent-social)",
        "accent-enterprise": "var(--accent-enterprise)",
        "accent-infra": "var(--accent-infra)",
        "accent-ecommerce": "var(--accent-ecommerce)",
        "accent-fintech": "var(--accent-fintech)",
      },
      letterSpacing: {
        widest: "0.18em",
      },
      fontSize: {
        // One-notch bump (was 10 / 12) to lift legibility across labels
        // app-wide without an audit of every component (#113).
        "te-label": ["0.75rem", { lineHeight: "1.2", letterSpacing: "0.18em" }],
        "te-label-md": ["0.875rem", { lineHeight: "1.2", letterSpacing: "0.16em" }],
      },
    },
  },
  plugins: [],
};
