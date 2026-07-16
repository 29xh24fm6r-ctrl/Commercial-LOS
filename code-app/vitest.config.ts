import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'

// Mirrors vite.config.ts's real build-commit define (kept separate per this
// file's own header comment on why vite/vitest config aren't unified) so
// __PLATFORM_DEPLOYMENT_COMMIT__ resolves identically under `vitest run` and
// `vite build` — see src/shared/deploymentCommit.ts.
function resolveBuildCommit(): string {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: __dirname }).toString().trim()
  } catch {
    return 'unknown'
  }
}

/**
 * Kept separate from vite.config.ts. Project uses Vite 8 (rolldown);
 * Vitest 3 ships with its own bundled Vite, and the Plugin types
 * don't unify cleanly when test config sits alongside Vite config.
 * Separating them lets `tsc -b` keep the production build clean.
 *
 * Vitest auto-discovers this file when running `vitest`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const reactPlugin = react() as any;

export default defineConfig({
  plugins: [reactPlugin],
  define: {
    __PLATFORM_DEPLOYMENT_COMMIT__: JSON.stringify(resolveBuildCommit()),
  },
  test: {
    // Default to Node for fast action/logic tests; component tests
    // opt into jsdom via `// @vitest-environment jsdom` at the top
    // of the file (used by ResolveFlagModal.test.tsx).
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: ['src/setupTests.ts'],
    // Phase 66 stability bump. Several jsdom + userEvent.type tests
    // intermittently hit the Vitest 5s default ceiling under heavy
    // parallel-suite load (1011+ tests at Phase 66). Every flaking
    // test passes in well under 1s in isolation; the contention
    // happens when many workers run userEvent simulated-keystroke
    // loops at the same time. Bumping the default per-test timeout
    // to 15s is an env-resilience fix — it changes nothing about
    // what the tests verify. If a test legitimately needs longer
    // than 15s, pass `{ timeout: ... }` to `it()` and document why.
    testTimeout: 15_000,
  },
})
