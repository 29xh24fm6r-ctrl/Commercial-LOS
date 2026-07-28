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

  it('reports all controlled internal cutover domains complete', () => {
    const vm = deriveControlledLiveCutoverReadiness();
    for (const d of vm.domains) {
      expect(d.technicalPrerequisitesPass, d.key).toBe(true);
      expect(d.governedAdapterProven, d.key).toBe(true);
      expect(d.operatorSmokeRecorded, d.key).toBe(true);
      expect(d.gateFlagOn, d.key).toBe(true);
      expect(d.enabled, d.key).toBe(true);
      expect(d.cutoverComplete, d.key).toBe(true);
      expect(d.remainingEvidence, d.key).toEqual([]);
      expect(d.rollbackControl.length, d.key).toBeGreaterThan(0);
    }
    const byKey = new Map(vm.domains.map((d) => [d.key, d]));
    expect(byKey.get('crmWriteback')?.liveSchemaVerified).toBe(true);
    expect(byKey.get('portfolioBoarding')?.liveSchemaVerified).toBe(true);
    expect(byKey.get('stageAdvancement')?.liveSchemaVerified).toBe(false);
  });

  it('Launch Phase 5: evidence insufficient → no cutover complete, deployment withheld, not launched (5/6)', () => {
    const vm = deriveControlledLiveCutoverReadiness();
    expect(vm.cutoverCompleteCount).toBe(3);
    expect(vm.deploymentAllowed).toBe(false);
    expect(vm.fullLaunchAchieved).toBe(false);
    expect(vm.enabledCount).toBe(5);
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
