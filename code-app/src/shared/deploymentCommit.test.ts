// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { getDeploymentCommit } from './deploymentCommit';

/**
 * Factory Arc Phase 4 — the build-time deployment commit is real (git rev-parse
 * at build/test-run time via vite.config.ts / vitest.config.ts's `define`), not
 * fabricated. This repo's test run always has a real .git directory, so the
 * commit should resolve to a short hex sha, never the literal fallback string.
 */
describe('getDeploymentCommit', () => {
  it('resolves a real short git commit sha under `vitest run` (not the unknown fallback)', () => {
    const commit = getDeploymentCommit();
    expect(commit).not.toBeNull();
    expect(commit).toMatch(/^[0-9a-f]{7,40}$/);
  });
});
