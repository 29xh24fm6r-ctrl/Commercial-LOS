import { defineConfig } from 'vitest/config';

/**
 * Launch Phase 4 — dedicated config for `npm run verify:launch-evidence`.
 *
 * Runs ONLY the launch-evidence verifier (scripts/launchEvidenceVerify.spec.ts), which is
 * intentionally excluded from the default suite (src/** glob). This verifier is EXPECTED to
 * exit non-zero until the operator re-captures authentic evidence, so it must never sit in
 * the green CI gate (`npm run verify`).
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/launchEvidenceVerify.spec.ts'],
  },
});
