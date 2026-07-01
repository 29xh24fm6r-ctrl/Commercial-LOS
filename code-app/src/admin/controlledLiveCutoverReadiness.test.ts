// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  deriveControlledLiveCutoverReadiness,
  deriveLiveSchemaVerified,
  CUTOVER_DOMAIN_KEYS,
  CUTOVER_OPERATOR_SMOKE_RECORDED,
} from './controlledLiveCutoverReadiness';

describe('Phase 245 — controlled live cutover readiness ledger', () => {
  it('covers exactly the three PASS domains', () => {
    expect([...CUTOVER_DOMAIN_KEYS]).toEqual(['crmWriteback', 'portfolioBoarding', 'stageAdvancement']);
    const vm = deriveControlledLiveCutoverReadiness();
    expect(vm.domains.map((d) => d.key)).toEqual(['crmWriteback', 'portfolioBoarding', 'stageAdvancement']);
  });

  it('Completion Phase A: prereqs + adapter proven, but flags reset to safe-off + evidence insufficient → NOT live', () => {
    const vm = deriveControlledLiveCutoverReadiness();
    for (const d of vm.domains) {
      // Technical readiness, governed adapter, and recorded smoke metadata remain true.
      expect(d.technicalPrerequisitesPass, d.key).toBe(true);
      expect(d.governedAdapterProven, d.key).toBe(true);
      expect(d.operatorSmokeRecorded, d.key).toBe(true);
      // Completion Phase A — the cutover-domain gate flags are reset to their safe default (off).
      expect(d.gateFlagOn, d.key).toBe(false);
      // The domain does NOT resolve enabled (flag off AND evidence insufficient).
      expect(d.enabled, d.key).toBe(false);
      expect(d.rollbackControl.length, d.key).toBeGreaterThan(0);
    }
    // Live-schema verification is an independent dimension (still verified for CRM/portfolio),
    // but cutover cannot complete without `enabled`, which the evidence gate now withholds.
    const byKey = new Map(vm.domains.map((d) => [d.key, d]));
    expect(byKey.get('crmWriteback')?.liveSchemaVerified).toBe(true);
    expect(byKey.get('crmWriteback')?.cutoverComplete).toBe(false);
    expect(byKey.get('portfolioBoarding')?.liveSchemaVerified).toBe(true);
    expect(byKey.get('portfolioBoarding')?.cutoverComplete).toBe(false);
    expect(byKey.get('stageAdvancement')?.liveSchemaVerified).toBe(false);
    expect(byKey.get('stageAdvancement')?.cutoverComplete).toBe(false);
  });

  it('Launch Phase 5: evidence insufficient → no cutover complete, deployment withheld, not launched (1/6)', () => {
    const vm = deriveControlledLiveCutoverReadiness();
    expect(vm.cutoverCompleteCount).toBe(0);
    expect(vm.deploymentAllowed).toBe(false);
    expect(vm.fullLaunchAchieved).toBe(false);
    expect(vm.enabledCount).toBe(1);
  });

  it('derives live-schema verification from the bridge: CRM + portfolio verified (full schema), stage not a schema dimension', () => {
    const lsv = deriveLiveSchemaVerified();
    expect(lsv.crmWriteback).toBe(true);
    expect(lsv.portfolioBoarding).toBe(true);
    expect(lsv.stageAdvancement).toBe(false);
    // Phase 256B: operator smoke is now recorded for all three (GO final-launch artifacts).
    expect(Object.values(CUTOVER_OPERATOR_SMOKE_RECORDED).every((v) => v === true)).toBe(true);
  });

  it('the source is read-only and never hardcodes deployment-allowed or launch-achieved true', () => {
    const src = readFileSync(resolve(__dirname, 'controlledLiveCutoverReadiness.ts'), 'utf8');
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/deploymentAllowed\s*[:=]\s*true/);
    expect(src).not.toMatch(/fullLaunchAchieved\s*[:=]\s*true/);
    expect(src).toMatch(/fullLaunchAchieved:\s*verification\.fullLaunchReady/);
  });
});
