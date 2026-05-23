import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

export default {
  plugins: {
    // Point tailwind explicitly at the config in this folder. PostCSS resolves
    // the tailwindcss plugin from the project's node_modules.
    tailwindcss: { config: path.join(here, "tailwind.config.js") },
    autoprefixer: {},
  },
};
