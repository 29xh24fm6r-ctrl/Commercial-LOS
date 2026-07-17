import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'

// Factory Arc Phase 4 — Platform Operations Workspace needs a real "current
// deployment commit" per capability. No such tracking existed anywhere in the
// repo before this (see src/shared/deploymentCommit.ts's doc comment). Read the
// actual commit at build time; never fabricate a placeholder when git is
// unavailable (e.g. a tarball build with no .git directory).
function resolveBuildCommit(): string {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: __dirname }).toString().trim()
  } catch {
    return 'unknown'
  }
}

export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 3000 },
  preview: { port: 3000 },
  define: {
    __PLATFORM_DEPLOYMENT_COMMIT__: JSON.stringify(resolveBuildCommit()),
  },
})

