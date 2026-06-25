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

  it('reports cutover PREPARED but NOT complete: prereqs + adapter proven, smoke + gate pending', () => {
    const vm = deriveControlledLiveCutoverReadiness();
    for (const d of vm.domains) {
      expect(d.technicalPrerequisitesPass, d.key).toBe(true);
      expect(d.governedAdapterProven, d.key).toBe(true);
      // Operator smoke is NOT recorded for any → none is complete (even CRM, whose schema is now verified).
      expect(d.operatorSmokeRecorded, d.key).toBe(false);
      expect(d.gateFlagOn, d.key).toBe(false);
      expect(d.enabled, d.key).toBe(false);
      expect(d.cutoverComplete, d.key).toBe(false);
      expect(d.remainingEvidence.length, d.key).toBeGreaterThan(0);
      expect(d.rollbackControl.length, d.key).toBeGreaterThan(0);
    }
    // Phase 253C/255B: CRM and portfolio live schemas are now verified (full schema + SDK hydrate);
    // stage advancement has no measured-schema bridge dimension and stays false. Smoke still pending for all.
    const byKey = new Map(vm.domains.map((d) => [d.key, d]));
    expect(byKey.get('crmWriteback')?.liveSchemaVerified).toBe(true);
    expect(byKey.get('portfolioBoarding')?.liveSchemaVerified).toBe(true);
    expect(byKey.get('stageAdvancement')?.liveSchemaVerified).toBe(false);
  });

  it('does not claim launch or allow deployment', () => {
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
    // Operator smoke remains unrecorded for all (no fake activation).
    expect(Object.values(CUTOVER_OPERATOR_SMOKE_RECORDED).every((v) => v === false)).toBe(true);
  });

  it('the source is read-only and never hardcodes deployment-allowed or launch-achieved true', () => {
    const src = readFileSync(resolve(__dirname, 'controlledLiveCutoverReadiness.ts'), 'utf8');
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/deploymentAllowed\s*[:=]\s*true/);
    expect(src).not.toMatch(/fullLaunchAchieved\s*[:=]\s*true/);
    expect(src).toMatch(/fullLaunchAchieved:\s*verification\.fullLaunchReady/);
  });
});
