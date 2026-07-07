import { describe, it, expect } from 'vitest';
import {
  isDealLinkableOrgType,
  DEAL_LINKABLE_ORG_TYPES,
} from './orgClientBridgeEligibility';

/**
 * Only Borrower / Client companies warrant a deal-linkable canonical client
 * mirror. Vendors, referral sources, advisors, prospects, and blank types must
 * NOT be treated as deal-linkable (no fabrication of borrower relationships).
 */
describe('isDealLinkableOrgType', () => {
  it('accepts the Borrower / Client party types', () => {
    expect(DEAL_LINKABLE_ORG_TYPES).toEqual(['Borrower', 'Client']);
    expect(isDealLinkableOrgType('Borrower')).toBe(true);
    expect(isDealLinkableOrgType('Client')).toBe(true);
  });

  it('is case- and whitespace-insensitive', () => {
    expect(isDealLinkableOrgType('  borrower ')).toBe(true);
    expect(isDealLinkableOrgType('CLIENT')).toBe(true);
  });

  it('rejects non-borrowing party types and blanks', () => {
    for (const t of ['Vendor', 'Referral Source', 'Professional/Advisor', 'Prospect', 'Guarantor', '', '   ']) {
      expect(isDealLinkableOrgType(t)).toBe(false);
    }
    expect(isDealLinkableOrgType(null)).toBe(false);
    expect(isDealLinkableOrgType(undefined)).toBe(false);
  });
});
