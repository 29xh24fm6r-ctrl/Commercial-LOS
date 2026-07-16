/**
 * Factory Arc Phase 4 — Platform Operations Workspace.
 *
 * "Current deployment commit" did not exist anywhere in this repo before this
 * file: no generated version file, no CI artifact, no env var wiring. The only
 * prior "commit" references were hand-authored strings inside static evidence
 * docs (e.g. `ENVIRONMENT_EVIDENCE_COMMIT` in fullProductionLaunchEvidence.ts) —
 * manually transcribed, not read from git.
 *
 * This reads a REAL commit: vite.config.ts / vitest.config.ts run
 * `git rev-parse --short HEAD` at build/test-run time and inject it via
 * `define` as `__PLATFORM_DEPLOYMENT_COMMIT__`. When git is unavailable (e.g. a
 * tarball build with no .git directory), the build falls back to the literal
 * string `'unknown'`, which this module reports as `null` — never a fabricated
 * commit id.
 */
export function getDeploymentCommit(): string | null {
  const raw = typeof __PLATFORM_DEPLOYMENT_COMMIT__ === 'string' ? __PLATFORM_DEPLOYMENT_COMMIT__ : '';
  return raw.length > 0 && raw !== 'unknown' ? raw : null;
}
