import { describe, it, expect } from 'vitest';
import { createEmptyCrmMaster, type CrmMaster } from '../shared/crm/crmTypes';
import { resolveBorrowerRequestRecipient } from '../shared/crm/resolveBorrowerRequestRecipient';
import {
  resolveAnnualReviewContactReadiness,
  resolveBoardedLoanCrmLink,
} from '../shared/crm/crmIntegrationSeams';
import { resolveCrmPersistenceAdapter } from './resolveCrmPersistenceAdapter';
import { deriveCrmFeatureFlagState } from './crmFeatureFlags';

/**
 * Phase 141L — CRM persistence integration seams.
 *
 * The annual-review and portfolio-boarding bridges keep working with no CRM
 * adapter (records are passed in as provided data). Persisted CRM records can be
 * fed into the recipient resolver; do-not-contact still blocks readiness. No
 * outreach is sent and no route is enabled.
 */

const LOAN = 'LOAN-1';

function masterWithBorrower(doNotContact = false): CrmMaster {
  return {
    ...createEmptyCrmMaster(),
    organizations: [{ orgId: 'ORG1', legalName: 'Synthetic Org', orgType: 'customer', status: 'active' }],
    people: [
      { personId: 'P1', fullName: 'Synthetic Contact', orgId: 'ORG1', personType: 'customer_contact', status: 'active', doNotContact },
    ],
    contactPoints: [
      { contactPointId: 'CP1', ownerType: 'person', ownerId: 'P1', channel: 'email', value: 'present', isPrimary: true },
    ],
    relationships: [
      { relationshipId: 'R1', fromEntityType: 'organization', fromEntityId: 'ORG1', toEntityType: 'person', toEntityId: 'P1', relationshipType: 'borrower', loanId: LOAN },
    ],
    contactAuthorizations: [
      { authId: 'A1', personId: 'P1', authType: 'document_upload' },
    ],
  };
}

describe('Phase 141L — annual review / portfolio boarding still work with no CRM adapter', () => {
  it('the annual-review contact-readiness seam resolves from a master alone', () => {
    const r = resolveAnnualReviewContactReadiness(masterWithBorrower(), LOAN, '2026-06-08');
    expect(r.recipient.outreachReady).toBe(true);
    expect(r.recipient.uploadLinkReady).toBe(true);
    expect(r.annualReviewContactReady).toBe(true);
  });

  it('the boarded-loan CRM link is honest (false) when absent', () => {
    const link = resolveBoardedLoanCrmLink(createEmptyCrmMaster(), LOAN);
    expect(link.linked).toBe(false);
  });
});

describe('Phase 141L — persisted CRM records feed the recipient resolver; do-not-contact blocks readiness', () => {
  it('a borrower request resolves a recipient from CRM records (no value exposed)', () => {
    const r = resolveBorrowerRequestRecipient({ master: masterWithBorrower(), loanId: LOAN, asOfDate: '2026-06-08' });
    expect(r.recipientPersonId).toBe('P1');
    expect(r.primaryContactPresent).toBe(true);
    expect(r.outreachReady).toBe(true);
    // The raw contact value is never exposed on the recipient.
    expect(JSON.stringify(r)).not.toContain('present');
  });

  it('do-not-contact still blocks outreach readiness', () => {
    const r = resolveBorrowerRequestRecipient({ master: masterWithBorrower(true), loanId: LOAN, asOfDate: '2026-06-08' });
    expect(r.outreachReady).toBe(false);
    expect(r.uploadLinkReady).toBe(false);
  });
});

describe('Phase 141L — the resolver does not enable any route when wiring the adapter', () => {
  it('even a fully-live resolution leaves the route disabled', () => {
    const flags = deriveCrmFeatureFlagState({ livePersistenceEnabled: true, routeEnabled: true });
    expect(flags.CRM_ROUTE_ENABLED).toBe(false);
    const r = resolveCrmPersistenceAdapter({
      flags,
      verified: { tablesFound: 10, columnsFound: 147, relationshipsFound: 28, conflicts: 0 },
      isAuthorizedOperator: true,
      transport: {
        createRecord: async () => ({ ok: true, id: 'x' }),
        updateRecord: async () => ({ ok: true }),
        readRecord: async () => ({ ok: true, record: {} }),
        searchRecords: async () => ({ ok: true, records: [] }),
      },
    });
    expect(r.live).toBe(true);
    expect(flags.CRM_ROUTE_ENABLED).toBe(false);
  });
});
