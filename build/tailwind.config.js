import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  // Fast-glob inside Tailwind resolves relative paths from CWD, not from the
  // config file. Using an absolute path keeps the scan working regardless of
  // where the build is invoked from. Without this, the live CSS shipped with
  // no utility classes after we moved configs into build/.
  content: [path.join(repoRoot, "src/client/**/*.{ts,tsx,html}")],
  theme: { extend: {} },
  plugins: [],
};
