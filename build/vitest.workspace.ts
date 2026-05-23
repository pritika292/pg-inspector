import { defineWorkspace } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineWorkspace([
  {
    test: {
      name: "server",
      include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
      environment: "node",
      pool: "forks",
      // Integration tests share a single Postgres + Redis instance; running
      // them in parallel forks would race on schema setup.
      poolOptions: { forks: { singleFork: true } },
      testTimeout: 10_000,
    },
  },
  {
    plugins: [react()],
    test: {
      name: "client",
      include: ["tests/client/**/*.test.{ts,tsx}"],
      environment: "jsdom",
      setupFiles: ["./tests/client/setup.ts"],
    },
  },
]);
