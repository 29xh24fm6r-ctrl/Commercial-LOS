import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

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
  test: {
    // Default to Node for fast action/logic tests; component tests
    // opt into jsdom via `// @vitest-environment jsdom` at the top
    // of the file (used by ResolveFlagModal.test.tsx).
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: ['src/setupTests.ts'],
  },
})
