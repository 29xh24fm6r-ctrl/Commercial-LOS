import { describe, it, expect } from 'vitest';
import { createEmptyCrmMaster, type CrmMaster } from '../shared/crm/crmTypes';
import { deriveAnnualReviewBorrowerRequestWorkflow } from './deriveAnnualReviewBorrowerRequestWorkflow';
import { deriveAnnualReviewRequestFeatureFlagState } from './annualReviewRequestFeatureFlags';
import type { AnnualReviewLoanSnapshot, AnnualReviewCycle } from '../shared/annualReview/annualReviewTypes';

/**
 * Phase 141M — workflow state deriver pins.
 */

const CYCLE: AnnualReviewCycle = { cycleId: 'CY1', reviewYear: 2026, asOfDate: '2026-06-08', status: 'in_progress' };
const LOAN: AnnualReviewLoanSnapshot = { boardedLoanId: 'LOAN-1', loanNumber: 'LN1', borrowerName: 'Synthetic Borrower', loanStatus: 'active', annualReviewDueDate: '2026-09-30' };

function viableMaster(doNotContact = false): CrmMaster {
  return {
    ...createEmptyCrmMaster(),
    organizations: [{ orgId: 'ORG1', legalName: 'Synthetic Org', orgType: 'customer', status: 'active' }],
    people: [{ personId: 'P1', fullName: 'Synthetic Contact', orgId: 'ORG1', personType: 'customer_contact', status: 'active', doNotContact }],
    contactPoints: [{ contactPointId: 'CP1', ownerType: 'person', ownerId: 'P1', channel: 'email', value: 'present', isPrimary: true, verified: true }],
    relationships: [{ relationshipId: 'R1', fromEntityType: 'organization', fromEntityId: 'ORG1', toEntityType: 'person', toEntityId: 'P1', relationshipType: 'borrower', loanId: 'LOAN-1' }],
    roleAssignments: [{ roleId: 'RA1', personId: 'P1', orgId: 'ORG1', role: 'borrower_contact', active: true }],
    contactAuthorizations: [{ authId: 'A1', personId: 'P1', authType: 'financial_disclosure' }],
  };
}

function workflow(master: CrmMaster, over = {}) {
  return deriveAnnualReviewBorrowerRequestWorkflow({
    annualReviewId: 'AR1',
    loan: LOAN,
    cycle: CYCLE,
    master,
    asOfDate: '2026-06-08',
    ...over,
  });
}

describe('Phase 141M — workflow state', () => {
  it('a disabled flag blocks the workflow', () => {
    const wf = workflow(viableMaster(), { flags: deriveAnnualReviewRequestFeatureFlagState({ workflowEnabled: false }) });
    expect(wf.status).toBe('disabled_not_configured');
    expect(wf.enabled).toBe(false);
  });

  it('no CRM records blocks the workflow (blocked_no_recipient)', () => {
    const wf = workflow(createEmptyCrmMaster());
    expect(wf.status).toBe('blocked');
    expect(wf.recipientDecision.decision).toBe('blocked_no_recipient');
  });

  it('a ready recipient produces pending_human_approval with a draft', () => {
    const wf = workflow(viableMaster());
    expect(wf.status).toBe('pending_human_approval');
    expect(wf.approvalState).toBe('pending_human_approval');
    expect(wf.draft).toBeDefined();
    expect(wf.package).toBeDefined();
  });

  it('a blocked recipient produces a blocker', () => {
    const wf = workflow(viableMaster(true));
    expect(wf.status).toBe('blocked');
    expect(wf.blockers.length).toBeGreaterThan(0);
  });

  it('never produces a sent state and keeps send / upload-link disabled', () => {
    const wf = workflow(viableMaster());
    expect(wf.sendEnabled).toBe(false);
    expect(wf.uploadLinkEnabled).toBe(false);
    expect(JSON.stringify(wf)).not.toMatch(/"sent"|approved_and_sent/);
  });

  it('reports an honest next best action', () => {
    expect(workflow(createEmptyCrmMaster()).nextBestAction.code).toBe('add_authorized_crm_recipient');
    expect(workflow(viableMaster()).nextBestAction.code).toBe('review_draft');
    expect(workflow(viableMaster(true)).nextBestAction.code).toBe('choose_different_recipient');
  });
});
