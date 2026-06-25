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

  it('Phase 256B: prereqs + adapter proven, operator smoke recorded, gates flipped LIVE', () => {
    const vm = deriveControlledLiveCutoverReadiness();
    for (const d of vm.domains) {
      expect(d.technicalPrerequisitesPass, d.key).toBe(true);
      expect(d.governedAdapterProven, d.key).toBe(true);
      // Operator smoke is recorded for all three (GO final-launch smoke artifacts).
      expect(d.operatorSmokeRecorded, d.key).toBe(true);
      expect(d.gateFlagOn, d.key).toBe(true);
      expect(d.enabled, d.key).toBe(true);
      expect(d.rollbackControl.length, d.key).toBeGreaterThan(0);
    }
    // Phase 253C/255B: CRM and portfolio live schemas are verified (full schema + SDK hydrate).
    // Stage advancement has no measured-schema bridge dimension (liveSchemaVerified stays false),
    // so it is not schema-gated — its cutover completes on the sink/ordering contract + recorded
    // smoke + live gate. All three cutovers are now COMPLETE.
    const byKey = new Map(vm.domains.map((d) => [d.key, d]));
    expect(byKey.get('crmWriteback')?.liveSchemaVerified).toBe(true);
    expect(byKey.get('crmWriteback')?.cutoverComplete).toBe(true);
    expect(byKey.get('portfolioBoarding')?.liveSchemaVerified).toBe(true);
    expect(byKey.get('portfolioBoarding')?.cutoverComplete).toBe(true);
    expect(byKey.get('stageAdvancement')?.liveSchemaVerified).toBe(false);
    expect(byKey.get('stageAdvancement')?.cutoverComplete).toBe(true);
  });

  it('Phase 256B: full launch achieved, all six enabled, all three cutovers complete, deployment allowed', () => {
    const vm = deriveControlledLiveCutoverReadiness();
    expect(vm.cutoverCompleteCount).toBe(3);
    expect(vm.deploymentAllowed).toBe(true);
    expect(vm.fullLaunchAchieved).toBe(true);
    expect(vm.enabledCount).toBe(6);
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
