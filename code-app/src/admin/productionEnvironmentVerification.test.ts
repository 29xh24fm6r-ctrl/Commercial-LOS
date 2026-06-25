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
  it('Phase 256B FULL LIVE: all six domains are certified, gate-flagged, and enabled', () => {
    const vm = deriveProductionEnvironmentVerification();
    expect(vm.enabledCount).toBe(6);
    expect(vm.allCertified).toBe(true);
    expect(vm.fullLaunchReady).toBe(true);

    const newDeal = vm.domains.find((d) => d.key === 'newDealCreate')!;
    expect(newDeal.certified).toBe(true);
    expect(newDeal.gateFlagOn).toBe(true);
    expect(newDeal.enabled).toBe(true);
    expect(newDeal.missingSteps).toEqual([]);

    for (const d of vm.domains.filter((x) => x.key !== 'newDealCreate')) {
      expect(d.certified, d.key).toBe(true);
      expect(d.gateFlagOn, d.key).toBe(true);
      expect(d.enabled, d.key).toBe(true);
      expect(d.missingSteps.length, d.key).toBe(0);
    }

    // Phase 256B: the committed certification constant now ships all six true toggles,
    // each backed by a GO final-launch smoke artifact (no fake success).
    expect(PRODUCTION_ENVIRONMENT_CERTIFICATION.newDealCreate).toBe(true);
    expect(
      Object.entries(PRODUCTION_ENVIRONMENT_CERTIFICATION)
        .filter(([, v]) => v === true)
        .map(([k]) => k),
    ).toEqual(['newDealCreate', 'crmWriteback', 'documentChecklist', 'borrowerSend', 'stageAdvancement', 'portfolioBoarding']);
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

    // both certified and flag on → enabled
    const both = deriveProductionEnvironmentVerification({ certification: { crmWriteback: true }, gateFlags: { crmWriteback: true } });
    const crm2 = both.domains.find((d) => d.key === 'crmWriteback')!;
    expect(crm2.enabled).toBe(true);
    expect(crm2.missingSteps).toEqual([]);
  });

  it('all six resolve enabled and full launch is ready only when every domain is certified + flagged', () => {
    const vm = deriveProductionEnvironmentVerification({ certification: ALL_TRUE, gateFlags: ALL_TRUE });
    expect(vm.enabledCount).toBe(6);
    expect(vm.allCertified).toBe(true);
    expect(vm.fullLaunchReady).toBe(true);
    expect(vm.domains.every((d) => d.enabled)).toBe(true);
  });

  it('a single missing certification keeps only that domain disabled', () => {
    const missingBorrower: DomainEnvironmentCertification = { ...ALL_TRUE, borrowerSend: false };
    const vm = deriveProductionEnvironmentVerification({ certification: missingBorrower, gateFlags: ALL_TRUE });
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
