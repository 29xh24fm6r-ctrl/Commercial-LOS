// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  deriveFullProductionLaunchEvidence,
  PRODUCTION_LAUNCH_EVIDENCE,
  ENVIRONMENT_EVIDENCE_COMMIT,
} from './fullProductionLaunchEvidence';

describe('Phase 243 — full production launch evidence ledger', () => {
  it('records the verified commit and the recorded per-domain environment statuses', () => {
    const vm = deriveFullProductionLaunchEvidence();
    expect(vm.commit).toBe(ENVIRONMENT_EVIDENCE_COMMIT);
    const byKey = new Map(vm.domains.map((d) => [d.key, d]));
    expect(byKey.get('newDealCreate')?.environmentStatus).toBe('PASS');
    expect(byKey.get('crmWriteback')?.environmentStatus).toBe('BLOCKED');
    expect(byKey.get('documentChecklist')?.environmentStatus).toBe('UNKNOWN');
    expect(byKey.get('borrowerSend')?.environmentStatus).toBe('UNKNOWN');
    expect(byKey.get('stageAdvancement')?.environmentStatus).toBe('PASS');
    expect(byKey.get('portfolioBoarding')?.environmentStatus).toBe('BLOCKED');
  });

  it('does NOT claim full launch: only New Deal create is live (1/6), four domains blocking', () => {
    const vm = deriveFullProductionLaunchEvidence();
    expect(vm.fullLaunchAchieved).toBe(false);
    expect(vm.enabledCount).toBe(1);
    expect(vm.blockingDomains).toEqual([
      'crmWriteback',
      'documentChecklist',
      'borrowerSend',
      'portfolioBoarding',
    ]);
  });

  it('separates environment-PASS from live-enabled (PASS prerequisite is not activation)', () => {
    const vm = deriveFullProductionLaunchEvidence();
    const byKey = new Map(vm.domains.map((d) => [d.key, d]));
    // Stage advancement environment is PASS, but it is NOT yet live (smoke + gate pending).
    const stage = byKey.get('stageAdvancement')!;
    expect(stage.environmentStatus).toBe('PASS');
    expect(stage.enabled).toBe(false);
    expect(stage.missingOperatorActions.length).toBeGreaterThan(0);
    // Two domains have PASS environment evidence; only one is actually enabled.
    expect(vm.environmentPassCount).toBe(2);
    expect(vm.enabledCount).toBe(1);
  });

  it('no enabled domain lacks PASS environment evidence (fail-closed honesty)', () => {
    const vm = deriveFullProductionLaunchEvidence();
    for (const d of vm.domains) {
      if (d.enabled) expect(d.environmentStatus, d.key).toBe('PASS');
      // Certified + enabled state is sourced from the fail-closed verification.
      if (d.enabled) expect(d.certified, d.key).toBe(true);
    }
  });

  it('every non-PASS domain lists exact operator actions and stays disabled', () => {
    const vm = deriveFullProductionLaunchEvidence();
    for (const d of vm.domains.filter((x) => x.environmentStatus !== 'PASS')) {
      expect(d.missingOperatorActions.length, d.key).toBeGreaterThan(0);
      expect(d.enabled, d.key).toBe(false);
      expect(d.certified, d.key).toBe(false);
    }
  });

  it('every domain documents a one-line rollback control', () => {
    for (const d of Object.values(PRODUCTION_LAUNCH_EVIDENCE)) {
      expect(d.rollbackControl.length, d.key).toBeGreaterThan(0);
    }
  });

  it('the source is read-only and never hardcodes a launch-achieved override', () => {
    const src = readFileSync(resolve(__dirname, 'fullProductionLaunchEvidence.ts'), 'utf8');
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/\bcreateRecord\b|\bupdateRecord\b|\bdeleteRecord\b/i);
    expect(src).not.toMatch(/fullLaunchAchieved\s*[:=]\s*true/);
    // Launch status is derived from the verification, never a literal.
    expect(src).toMatch(/fullLaunchAchieved\s*=\s*verification\.fullLaunchReady/);
  });
});
