import { describe, it, expect } from 'vitest';
import { createEmptyCrmMaster, type CrmMaster } from '../shared/crm/crmTypes';
import { createDisabledCrmLiveDataverseAdapter } from '../crm/crmLiveDataverseAdapter';
import { deriveAnnualReviewBorrowerRequestWorkflow } from './deriveAnnualReviewBorrowerRequestWorkflow';
import type { AnnualReviewLoanSnapshot, AnnualReviewCycle } from '../shared/annualReview/annualReviewTypes';

/**
 * Phase 141M — integration with the CRM adapter (Part 8).
 *
 * The workflow accepts CRM records already loaded by the caller (disabled / fake
 * / future live adapter). A disabled CRM adapter does not crash the workflow; it
 * simply yields an honest no-recipient state. The workflow never writes to CRM.
 */

const CYCLE: AnnualReviewCycle = { cycleId: 'CY1', reviewYear: 2026, asOfDate: '2026-06-08', status: 'in_progress' };
const LOAN: AnnualReviewLoanSnapshot = { boardedLoanId: 'LOAN-1', borrowerName: 'Synthetic Borrower', loanStatus: 'active' };

function viableMaster(): CrmMaster {
  return {
    ...createEmptyCrmMaster(),
    organizations: [{ orgId: 'ORG1', legalName: 'Synthetic Org', orgType: 'customer', status: 'active' }],
    people: [{ personId: 'P1', fullName: 'Synthetic Contact', orgId: 'ORG1', personType: 'customer_contact', status: 'active' }],
    contactPoints: [{ contactPointId: 'CP1', ownerType: 'person', ownerId: 'P1', channel: 'email', value: 'present', isPrimary: true, verified: true }],
    relationships: [{ relationshipId: 'R1', fromEntityType: 'organization', fromEntityId: 'ORG1', toEntityType: 'person', toEntityId: 'P1', relationshipType: 'borrower', loanId: 'LOAN-1' }],
    contactAuthorizations: [{ authId: 'A1', personId: 'P1', authType: 'financial_disclosure' }],
  };
}

describe('Phase 141M — CRM adapter integration', () => {
  it('the workflow works with provided CRM records', () => {
    const wf = deriveAnnualReviewBorrowerRequestWorkflow({ annualReviewId: 'AR1', loan: LOAN, cycle: CYCLE, master: viableMaster(), asOfDate: '2026-06-08' });
    expect(wf.status).toBe('pending_human_approval');
  });

  it('a disabled CRM adapter does not crash the workflow (honest no-recipient state)', async () => {
    const adapter = createDisabledCrmLiveDataverseAdapter();
    // A disabled adapter cannot read a master; the caller falls back to empty.
    const read = await adapter.searchOrganizations();
    expect(read.ok).toBe(false);
    const master = createEmptyCrmMaster();
    const wf = deriveAnnualReviewBorrowerRequestWorkflow({ annualReviewId: 'AR1', loan: LOAN, cycle: CYCLE, master, asOfDate: '2026-06-08' });
    expect(wf.status).toBe('blocked');
    expect(wf.recipientDecision.decision).toBe('blocked_no_recipient');
  });

  it('the workflow performs no CRM write (no adapter dependency, pure derivation)', () => {
    const before = JSON.stringify(viableMaster());
    const master = viableMaster();
    deriveAnnualReviewBorrowerRequestWorkflow({ annualReviewId: 'AR1', loan: LOAN, cycle: CYCLE, master, asOfDate: '2026-06-08' });
    expect(JSON.stringify(master)).toBe(before);
  });
});
