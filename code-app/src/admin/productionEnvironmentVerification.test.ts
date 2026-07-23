// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  deriveProductionEnvironmentVerification,
  PRODUCTION_ENVIRONMENT_CERTIFICATION,
  ENVIRONMENT_VERIFICATION_STEPS,
  ACTIVATION_DOMAIN_KEYS,
  type DomainEnvironmentCertification,
} from './productionEnvironmentVerification';

const ALL_TRUE: DomainEnvironmentCertification = {
  newDealCreate: true,
  crmWriteback: true,
  documentChecklist: true,
  borrowerSend: true,
  stageAdvancement: true,
  portfolioBoarding: true,
};

describe('Phase 241/242A/256B — production environment verification', () => {
  it('Launch Phase 5: certified + gate-flagged, but evidence-INSUFFICIENT → only New Deal create is enabled (1/6)', () => {
    // The committed final-launch evidence is integrity-insufficient (sentinel UPNs / no machine
    // proof), so the five evidence-gated domains do NOT resolve enabled even though their
    // certification toggles and gate flags are on. Only newDealCreate (pilot-certified, not
    // final-launch-smoke-gated) is enabled. Launch is honestly NOT achieved.
    const vm = deriveProductionEnvironmentVerification();
    expect(vm.enabledCount).toBe(1);
    expect(vm.allCertified).toBe(true); // operator toggles unchanged — evidence gates enabled
    expect(vm.fullLaunchReady).toBe(false);

    const newDeal = vm.domains.find((d) => d.key === 'newDealCreate')!;
    expect(newDeal.certified).toBe(true);
    expect(newDeal.gateFlagOn).toBe(true);
    expect(newDeal.evidenceHigh).toBe(true);
    expect(newDeal.enabled).toBe(true);

    for (const d of vm.domains.filter((x) => x.key !== 'newDealCreate')) {
      expect(d.certified, d.key).toBe(true);
      // WF-1A: stageAdvancement's gate (AUTO_STAGE_ADVANCE_ENABLED) is intentionally armed
      // for the "walk one deal" pilot; the other four live-write gates stay at safe default (off).
      expect(d.gateFlagOn, d.key).toBe(d.key === 'stageAdvancement');
      // CRM-K: crmWriteback carries an ATTRIBUTED, HIGH-confidence operator smoke
      // (mpaller@oldglorybank.com). Workstream K additionally re-captured a real
      // portfolioBoarding smoke (affectedRecordIds, non-synthetic clock) — it now
      // also grades HIGH, so both are evidence-sufficient; the remaining three stay
      // integrity-insufficient. Neither is enabled because its gate flag is off.
      const evidenceSufficient = d.key === 'crmWriteback' || d.key === 'portfolioBoarding';
      expect(d.evidenceHigh, d.key).toBe(evidenceSufficient);
      expect(d.evidenceInsufficient, d.key).toBe(!evidenceSufficient);
      // Still NOT enabled for ANY of these domains — either the gate flag is off (crm/others)
      // or the evidence is insufficient (enabledCount stays 1/6 above).
      expect(d.enabled, d.key).toBe(false);
      if (!evidenceSufficient) expect(d.evidenceIssues.length, d.key).toBeGreaterThan(0);
    }

    // The operator certification constant is unchanged (still all six true); the integrity
    // authority — not a flag — is what now withholds launch.
    expect(PRODUCTION_ENVIRONMENT_CERTIFICATION.newDealCreate).toBe(true);
    expect(
      Object.entries(PRODUCTION_ENVIRONMENT_CERTIFICATION)
        .filter(([, v]) => v === true)
        .map(([k]) => k),
    ).toEqual(['newDealCreate', 'crmWriteback', 'documentChecklist', 'borrowerSend', 'stageAdvancement', 'portfolioBoarding']);
  });

  it('POSITIVE FIXTURE: authentic (accepted/HIGH) evidence flips every domain enabled → full launch ready (6/6)', () => {
    // Prove the gate works BOTH ways: when the integrity authority reports HIGH for all six,
    // and certs + flags are on, full launch is ready. This is what the operator's authentic
    // evidence re-capture (Phase 7) will produce — green everywhere at once.
    const vm = deriveProductionEnvironmentVerification({ certification: ALL_TRUE, gateFlags: ALL_TRUE, evidenceHigh: ALL_TRUE });
    expect(vm.enabledCount).toBe(6);
    expect(vm.fullLaunchReady).toBe(true);
    expect(vm.domains.every((d) => d.enabled && d.evidenceHigh && !d.evidenceInsufficient)).toBe(true);
  });

  it('every domain has explicit external verification steps', () => {
    for (const key of ACTIVATION_DOMAIN_KEYS) {
      expect(ENVIRONMENT_VERIFICATION_STEPS[key].length, key).toBeGreaterThan(0);
    }
  });

  it('a domain resolves enabled ONLY when certified AND its gate flag is on', () => {
    // certified but gate flag off (injected) → not enabled (flip step remains)
    const certOnly = deriveProductionEnvironmentVerification({ certification: { crmWriteback: true }, gateFlags: { crmWriteback: false } });
    const crm = certOnly.domains.find((d) => d.key === 'crmWriteback')!;
    expect(crm.certified).toBe(true);
    expect(crm.gateFlagOn).toBe(false);
    expect(crm.enabled).toBe(false);
    expect(crm.missingSteps.join(' ')).toMatch(/Flip the .* feature gate/);

    // certified + flag on + evidence HIGH → enabled
    const both = deriveProductionEnvironmentVerification({ certification: { crmWriteback: true }, gateFlags: { crmWriteback: true }, evidenceHigh: { crmWriteback: true } });
    const crm2 = both.domains.find((d) => d.key === 'crmWriteback')!;
    expect(crm2.enabled).toBe(true);
    expect(crm2.missingSteps).toEqual([]);

    // certified + flag on but evidence INSUFFICIENT (injected) → still not enabled (gates down).
    // (crmWriteback's committed smoke is now attributed/HIGH, so insufficiency is injected here.)
    const noEvidence = deriveProductionEnvironmentVerification({ certification: { crmWriteback: true }, gateFlags: { crmWriteback: true }, evidenceHigh: { crmWriteback: false } });
    const crm3 = noEvidence.domains.find((d) => d.key === 'crmWriteback')!;
    expect(crm3.certified).toBe(true);
    expect(crm3.gateFlagOn).toBe(true);
    expect(crm3.enabled).toBe(false);
    expect(crm3.evidenceInsufficient).toBe(true);
  });

  it('a single missing certification keeps only that domain disabled (evidence HIGH for all)', () => {
    const missingBorrower: DomainEnvironmentCertification = { ...ALL_TRUE, borrowerSend: false };
    const vm = deriveProductionEnvironmentVerification({ certification: missingBorrower, gateFlags: ALL_TRUE, evidenceHigh: ALL_TRUE });
    expect(vm.enabledCount).toBe(5);
    expect(vm.fullLaunchReady).toBe(false);
    expect(vm.domains.find((d) => d.key === 'borrowerSend')?.enabled).toBe(false);
    expect(vm.domains.find((d) => d.key === 'newDealCreate')?.enabled).toBe(true);
  });

  it('the committed source certifies all six toggles (Phase 256B full launch) and never fakes via fetch', () => {
    const src = readFileSync(resolve(__dirname, 'productionEnvironmentVerification.ts'), 'utf8');
    const certBlock = src.slice(
      src.indexOf('export const PRODUCTION_ENVIRONMENT_CERTIFICATION'),
      src.indexOf('export const ENVIRONMENT_VERIFICATION_STEPS'),
    );
    expect(certBlock).toMatch(/newDealCreate:\s*true/);
    // All six toggles are true in the committed certification constant (Phase 256B).
    expect(certBlock.match(/:\s*true/g) ?? []).toHaveLength(6);
    expect(src).not.toMatch(/\bfetch\s*\(/);
  });
});
