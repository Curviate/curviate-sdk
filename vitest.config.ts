import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    setupFiles: ["test/setup.ts"],
    // RAM GUARDRAIL (capped 2026-06-06, tightened 2026-08-04 after a second
    // host-crash traced to it): vitest defaults to one fork PER CPU CORE, which
    // exhausted memory on the development host and took the machine down twice.
    // Override via VITEST_MAX_WORKERS. NEVER raise above a value re-measured
    // safe on the host you are running on.
    pool: "forks",
    maxWorkers: Number(process.env["VITEST_MAX_WORKERS"] ?? 2),
    minWorkers: 1,
    poolOptions: {
      forks: {
        maxForks: Number(process.env["VITEST_MAX_WORKERS"] ?? 2),
        minForks: 1,
      },
    },
  },
});
