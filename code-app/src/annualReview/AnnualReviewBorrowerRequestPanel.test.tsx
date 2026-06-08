// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AnnualReviewBorrowerRequestPanel } from './AnnualReviewBorrowerRequestPanel';
import { createEmptyCrmMaster, type CrmMaster } from '../shared/crm/crmTypes';
import type { AnnualReviewLoanSnapshot, AnnualReviewCycle } from '../shared/annualReview/annualReviewTypes';

const CYCLE: AnnualReviewCycle = { cycleId: 'CY1', reviewYear: 2026, asOfDate: '2026-06-08', status: 'in_progress' };
const LOAN: AnnualReviewLoanSnapshot = { boardedLoanId: 'LOAN-1', loanNumber: 'LN1', borrowerName: 'Synthetic Borrower', loanStatus: 'active', annualReviewDueDate: '2026-09-30' };

function viableMaster(opts: { doNotContact?: boolean; noAuth?: boolean } = {}): CrmMaster {
  return {
    ...createEmptyCrmMaster(),
    organizations: [{ orgId: 'ORG1', legalName: 'Synthetic Org', orgType: 'customer', status: 'active' }],
    people: [{ personId: 'P1', fullName: 'Synthetic Contact', orgId: 'ORG1', personType: 'customer_contact', status: 'active', doNotContact: opts.doNotContact }],
    contactPoints: [{ contactPointId: 'CP1', ownerType: 'person', ownerId: 'P1', channel: 'email', value: 'present', isPrimary: true, verified: true }],
    relationships: [{ relationshipId: 'R1', fromEntityType: 'organization', fromEntityId: 'ORG1', toEntityType: 'person', toEntityId: 'P1', relationshipType: 'borrower', loanId: 'LOAN-1' }],
    roleAssignments: [{ roleId: 'RA1', personId: 'P1', orgId: 'ORG1', role: 'borrower_contact', active: true }],
    contactAuthorizations: opts.noAuth ? [] : [{ authId: 'A1', personId: 'P1', authType: 'financial_disclosure' }],
  };
}

function renderPanel(master: CrmMaster) {
  return render(<AnnualReviewBorrowerRequestPanel annualReviewId="AR1" loan={LOAN} cycle={CYCLE} master={master} asOfDate="2026-06-08" />);
}

describe('Phase 141M — borrower request panel', () => {
  it('renders the ready-for-human-approval state with a masked contact', () => {
    renderPanel(viableMaster());
    expect(screen.getAllByText(/pending human approval/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('•••@•••')).toBeInTheDocument();
    expect(screen.getByText(/Human approval required/i)).toBeInTheDocument();
  });

  it('renders the blocked no-recipient state', () => {
    renderPanel(createEmptyCrmMaster());
    expect(screen.getAllByText(/blocked/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/No borrower organization linked in CRM/i).length).toBeGreaterThanOrEqual(1);
  });

  it('renders the do-not-contact blocker', () => {
    renderPanel(viableMaster({ doNotContact: true }));
    expect(screen.getAllByText(/marked do-not-contact/i).length).toBeGreaterThanOrEqual(1);
  });

  it('renders the missing-authorization blocker', () => {
    renderPanel(viableMaster({ noAuth: true }));
    expect(screen.getAllByText(/No recipient is authorized/i).length).toBeGreaterThanOrEqual(1);
  });

  it('never exposes a raw contact value', () => {
    const { container } = renderPanel(viableMaster());
    expect(container.textContent ?? '').not.toContain('present');
  });

  it('has no send / email / SMS / upload-link affordance', () => {
    const { container } = renderPanel(viableMaster());
    // No buttons at all — the panel is read-only.
    expect(container.querySelectorAll('button').length).toBe(0);
    // No mailto / tel links.
    expect(container.querySelectorAll('a[href^="mailto:"]').length).toBe(0);
    expect(container.querySelectorAll('a[href^="tel:"]').length).toBe(0);
    const text = (container.textContent ?? '').toLowerCase();
    expect(text).not.toContain('approve and send');
  });
});
