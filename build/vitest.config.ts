import { defineConfig } from "vitest/config";

// Per-project config (server vs client envs) lives in vitest.workspace.ts.
// This file only carries settings shared across both projects.
export default defineConfig({
  test: {
    testTimeout: 10_000,
  },
});
