import { describe, it, expect } from 'vitest';
import { createEmptyCrmMaster, type CrmMaster } from '../shared/crm/crmTypes';
import {
  resolveAnnualReviewBorrowerRequestRecipients,
  type AnnualReviewRecipientResolutionInput,
} from './resolveAnnualReviewBorrowerRequestRecipients';

/**
 * Phase 141M — CRM recipient resolution for the annual review borrower request.
 */

const AS_OF = '2026-06-08';
const LOAN = 'LOAN-1';

interface Opts {
  doNotContact?: boolean;
  restrictedUse?: boolean;
  withRole?: boolean;
  financialAuth?: boolean;
  authExpiry?: string;
  withContact?: boolean;
  secondViable?: boolean;
}

function master(opts: Opts = {}): CrmMaster {
  const people = [
    { personId: 'P1', fullName: 'Synthetic Contact', orgId: 'ORG1', personType: 'customer_contact' as const, status: 'active' as const, doNotContact: opts.doNotContact },
  ];
  const roleAssignments = opts.withRole
    ? [{ roleId: 'RA1', personId: 'P1', orgId: 'ORG1', role: 'borrower_contact' as const, active: true }]
    : [];
  const contactPoints = opts.withContact === false
    ? []
    : [{ contactPointId: 'CP1', ownerType: 'person' as const, ownerId: 'P1', channel: 'email' as const, value: 'present', isPrimary: true, verified: true, ...(opts.restrictedUse ? { restrictedUse: true } : {}) }];
  const contactAuthorizations = opts.financialAuth
    ? [{ authId: 'A1', personId: 'P1', authType: 'financial_disclosure' as const, ...(opts.authExpiry ? { expirationDate: opts.authExpiry } : {}) }]
    : [];

  if (opts.secondViable) {
    people.push({ personId: 'P2', fullName: 'Synthetic Contact Two', orgId: 'ORG1', personType: 'customer_contact', status: 'active', doNotContact: undefined });
    contactPoints.push({ contactPointId: 'CP2', ownerType: 'person', ownerId: 'P2', channel: 'email', value: 'present', isPrimary: true, verified: true });
    contactAuthorizations.push({ authId: 'A2', personId: 'P2', authType: 'financial_disclosure' });
  }

  return {
    ...createEmptyCrmMaster(),
    organizations: [{ orgId: 'ORG1', legalName: 'Synthetic Org', orgType: 'customer', status: 'active' }],
    people,
    contactPoints: contactPoints as CrmMaster['contactPoints'],
    relationships: [{ relationshipId: 'R1', fromEntityType: 'organization', fromEntityId: 'ORG1', toEntityType: 'person', toEntityId: 'P1', relationshipType: 'borrower', loanId: LOAN }],
    roleAssignments,
    contactAuthorizations,
  };
}

function resolve(opts: Opts, over: Partial<AnnualReviewRecipientResolutionInput> = {}) {
  return resolveAnnualReviewBorrowerRequestRecipients({
    master: master(opts),
    loanId: LOAN,
    purpose: 'financial_request',
    enabled: true,
    asOfDate: AS_OF,
    ...over,
  });
}

describe('Phase 141M — recipient resolution', () => {
  it('picks the authorized borrower-side financial request contact', () => {
    const r = resolve({ withRole: true, financialAuth: true });
    expect(r.decision).toBe('ready_for_human_approval');
    expect(r.selectedRecipientId).toBe('P1');
    expect(r.confidence).toBe('high');
    expect(r.safeForDraft).toBe(true);
  });

  it('falls back to a primary borrower contact only when authorized', () => {
    const authorized = resolve({ withRole: false, financialAuth: true });
    expect(authorized.decision).toBe('ready_for_human_approval');
    expect(authorized.confidence).toBe('medium');

    const unauthorized = resolve({ withRole: false, financialAuth: false });
    expect(unauthorized.decision).toBe('blocked_no_authorized_contact');
  });

  it('blocks do-not-contact', () => {
    const r = resolve({ financialAuth: true, doNotContact: true });
    expect(r.decision).toBe('blocked_do_not_contact');
    expect(r.safeForDraft).toBe(false);
  });

  it('blocks restricted-use mismatch', () => {
    const r = resolve({ financialAuth: true, restrictedUse: true });
    expect(r.decision).toBe('blocked_restricted_use');
  });

  it('blocks missing authorization', () => {
    const r = resolve({ financialAuth: false });
    expect(r.decision).toBe('blocked_no_authorized_contact');
  });

  it('blocks a missing contact point', () => {
    const r = resolve({ financialAuth: true, withContact: false });
    expect(r.decision).toBe('blocked_missing_contact_point');
  });

  it('blocks an expired authorization', () => {
    const r = resolve({ financialAuth: true, authExpiry: '2020-01-01' });
    expect(r.decision).toBe('blocked_no_authorized_contact');
  });

  it('requires human selection for multiple authorized recipients', () => {
    const r = resolve({ withRole: true, financialAuth: true, secondViable: true });
    expect(r.decision).toBe('needs_human_selection');
    expect(r.requiresHumanSelection).toBe(true);
    expect(r.safeForDraft).toBe(false);
  });

  it('masks the selected contact value (never the raw value)', () => {
    const r = resolve({ withRole: true, financialAuth: true });
    expect(r.selectedContactValueMasked).toBe('•••@•••');
    expect(JSON.stringify(r)).not.toContain('present');
  });

  it('never invents a contact value when none is on file', () => {
    const r = resolve({ financialAuth: true, withContact: false });
    expect(r.selectedContactValueMasked).toBeUndefined();
    expect(JSON.stringify(r)).not.toMatch(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  });

  it('safeForSend is always false', () => {
    for (const opts of [{ withRole: true, financialAuth: true }, { financialAuth: false }, { financialAuth: true, doNotContact: true }]) {
      expect(resolve(opts).safeForSend).toBe(false);
    }
    expect(resolve({}, { enabled: false }).safeForSend).toBe(false);
  });

  it('a disabled workflow returns disabled_not_configured', () => {
    const r = resolve({ withRole: true, financialAuth: true }, { enabled: false });
    expect(r.decision).toBe('disabled_not_configured');
  });

  it('no borrower org linked → blocked_no_recipient', () => {
    const r = resolveAnnualReviewBorrowerRequestRecipients({ master: createEmptyCrmMaster(), loanId: LOAN, enabled: true, asOfDate: AS_OF });
    expect(r.decision).toBe('blocked_no_recipient');
  });
});
