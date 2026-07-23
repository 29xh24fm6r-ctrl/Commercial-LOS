import { describe, it, expect } from 'vitest';
import { deriveFundingReadiness } from './fundingReadiness';
import type { FundingReadinessFacts } from './fundingAuthorizationTypes';

const CLEAR_FACTS: FundingReadinessFacts = {
  requiredDocumentsComplete: true,
  conditionsPrecedentResolved: true,
  exceptionsAllResolved: true,
  destinationVerified: true,
  approvalExpired: false,
  dealTerminalStatus: 'OPEN',
};

describe('deriveFundingReadiness', () => {
  it('is ready when every fact is clear', () => {
    expect(deriveFundingReadiness(CLEAR_FACTS)).toEqual({ ready: true, blockers: [] });
  });

  it('is ready when the deal is ON_HOLD (not itself a funding blocker)', () => {
    expect(deriveFundingReadiness({ ...CLEAR_FACTS, dealTerminalStatus: 'ON_HOLD' }).ready).toBe(true);
  });

  it('reports every independent blocker at once, not just the first one found', () => {
    const result = deriveFundingReadiness({
      requiredDocumentsComplete: false,
      conditionsPrecedentResolved: false,
      exceptionsAllResolved: false,
      destinationVerified: false,
      approvalExpired: true,
      dealTerminalStatus: 'DECLINED',
    });
    expect(result.ready).toBe(false);
    expect(result.blockers).toEqual([
      'required_documents_incomplete',
      'conditions_precedent_unresolved',
      'exceptions_unresolved',
      'destination_not_verified',
      'approval_expired',
      'deal_declined',
    ]);
  });

  it('distinguishes declined / withdrawn / boarded as three distinct blockers', () => {
    expect(deriveFundingReadiness({ ...CLEAR_FACTS, dealTerminalStatus: 'DECLINED' }).blockers).toEqual(['deal_declined']);
    expect(deriveFundingReadiness({ ...CLEAR_FACTS, dealTerminalStatus: 'WITHDRAWN' }).blockers).toEqual(['deal_withdrawn']);
    expect(deriveFundingReadiness({ ...CLEAR_FACTS, dealTerminalStatus: 'BOARDED' }).blockers).toEqual(['deal_already_boarded']);
  });

  it('a single unresolved fact blocks readiness even when everything else is clear', () => {
    expect(deriveFundingReadiness({ ...CLEAR_FACTS, exceptionsAllResolved: false }).ready).toBe(false);
  });
});
