import { describe, expect, it } from 'vitest';
import {
  ACTIVATION_DOMAIN_IDS,
  deriveFullActivationLaunchCertification,
} from './fullActivationLaunchCertificationModel';

describe('full activation launch certification', () => {
  it('reports five evidence-certified internal domains enabled', () => {
    const vm = deriveFullActivationLaunchCertification();
    expect(vm.domains.map((domain) => domain.id)).toEqual(ACTIVATION_DOMAIN_IDS);
    expect(vm.enabledCount).toBe(5);
    expect(vm.fullLaunchAchieved).toBe(false);

    for (const domain of vm.domains) {
      if (domain.id === 'borrower-communication-send') {
        expect(domain.status).toBe('blocked');
        expect(domain.blockers.length).toBeGreaterThan(0);
      } else {
        expect(domain.status, domain.id).toBe('enabled');
        expect(domain.flagEnabled, domain.id).toBe(true);
        expect(domain.blockers, domain.id).toEqual([]);
        expect(domain.unblockActions, domain.id).toEqual([]);
      }
    }
  });

  it('does not mistake an armed borrower gate for accepted send evidence', () => {
    const borrower = deriveFullActivationLaunchCertification().domains.find(
      (domain) => domain.id === 'borrower-communication-send',
    )!;
    expect(borrower.flagEnabled).toBe(true);
    expect(borrower.status).toBe('blocked');
    expect(borrower.blockers.join(' ')).toMatch(/receipt|recipient|approver|evidence/i);
  });
});
