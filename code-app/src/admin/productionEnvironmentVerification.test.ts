// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  ACTIVATION_DOMAIN_KEYS,
  deriveProductionEnvironmentVerification,
  ENVIRONMENT_VERIFICATION_STEPS,
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

describe('production environment verification', () => {
  it('resolves five internal domains enabled and leaves borrower send evidence-gated', () => {
    const vm = deriveProductionEnvironmentVerification();
    expect(vm.enabledCount).toBe(5);
    expect(vm.fullLaunchReady).toBe(false);
    expect(vm.allCertified).toBe(true);
    for (const domain of vm.domains) {
      expect(domain.enabled, domain.key).toBe(domain.key !== 'borrowerSend');
    }
    const borrower = vm.domains.find((domain) => domain.key === 'borrowerSend')!;
    expect(borrower.gateFlagOn).toBe(true);
    expect(borrower.evidenceHigh).toBe(false);
    expect(borrower.evidenceIssues.join(' ')).toMatch(/deliveryReceiptId|approvedRecipient|approverUpn/);
  });

  it('requires certification, gate, and high-confidence evidence together', () => {
    const off = deriveProductionEnvironmentVerification({
      certification: { crmWriteback: false },
      gateFlags: { crmWriteback: true },
      evidenceHigh: { crmWriteback: true },
    });
    expect(off.domains.find((domain) => domain.key === 'crmWriteback')?.enabled).toBe(false);

    const all = deriveProductionEnvironmentVerification({
      certification: ALL_TRUE,
      gateFlags: ALL_TRUE,
      evidenceHigh: ALL_TRUE,
    });
    expect(all.enabledCount).toBe(6);
    expect(all.fullLaunchReady).toBe(true);
  });

  it('retains explicit verification steps for every domain', () => {
    for (const key of ACTIVATION_DOMAIN_KEYS) {
      expect(ENVIRONMENT_VERIFICATION_STEPS[key].length, key).toBeGreaterThan(0);
    }
  });
});
