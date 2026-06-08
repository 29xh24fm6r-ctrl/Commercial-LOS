import { describe, it, expect } from 'vitest';
import {
  createEmptyCrmMaster,
  type CrmMaster,
  type CrmOrganization,
  type CrmPerson,
  type CrmContactPoint,
  type CrmRelationship,
  type CrmContactAuthorization,
  type CrmRoleAssignment,
} from './crmTypes';
import { deriveCrmContactReadiness, resolveCrmContactSubject } from './deriveCrmReadiness';
import { deriveCrmRelationshipNetworkSnapshot } from './deriveCrmRelationshipNetworkSnapshot';
import { deriveCrmContactTasks } from './deriveCrmContactTasks';
import { resolveBorrowerRequestRecipient } from './resolveBorrowerRequestRecipient';
import { resolveAnnualReviewContactReadiness, resolveBoardedLoanCrmLink } from './crmIntegrationSeams';

const NOW = '2026-06-08';

// --- builders (synthetic test values only) ---------------------------------
function org(over: Partial<CrmOrganization> = {}): CrmOrganization {
  return { orgId: 'ORG1', legalName: 'Synthetic Org', orgType: 'customer', status: 'active', ...over };
}
function person(over: Partial<CrmPerson> = {}): CrmPerson {
  return { personId: 'P1', fullName: 'Synthetic Person', orgId: 'ORG1', personType: 'customer_contact', status: 'active', ...over };
}
function email(over: Partial<CrmContactPoint> = {}): CrmContactPoint {
  return { contactPointId: 'CP1', ownerType: 'person', ownerId: 'P1', channel: 'email', value: 'redacted-test-value', isPrimary: true, verified: true, ...over };
}
function uploadAuth(over: Partial<CrmContactAuthorization> = {}): CrmContactAuthorization {
  return { authId: 'A1', personId: 'P1', authType: 'document_upload', grantedDate: '2026-01-01', ...over };
}
function borrowerRel(over: Partial<CrmRelationship> = {}): CrmRelationship {
  return { relationshipId: 'R1', fromEntityType: 'organization', fromEntityId: 'ORG1', toEntityType: 'organization', toEntityId: 'BANK', relationshipType: 'borrower', loanId: 'LOAN1', active: true, ...over };
}
function masterWith(parts: Partial<CrmMaster>): CrmMaster {
  return { ...createEmptyCrmMaster(), ...parts };
}

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------

describe('Phase 141B-H — contact readiness is fail-closed', () => {
  it('no contact point → not contact-ready, not outreach-ready', () => {
    const r = deriveCrmContactReadiness({ subject: { ownerType: 'person', ownerId: 'P1', contactPoints: [], authorizations: [] }, asOfDate: NOW });
    expect(r.contactReady).toBe(false);
    expect(r.outreachReady).toBe(false);
    expect(r.blockers.some((b) => /missing contact/i.test(b))).toBe(true);
  });

  it('do-not-contact blocks outreach even with a usable contact point', () => {
    const r = deriveCrmContactReadiness({
      subject: { ownerType: 'person', ownerId: 'P1', contactPoints: [email()], personDoNotContact: true, authorizations: [uploadAuth()] },
      asOfDate: NOW,
    });
    expect(r.contactReady).toBe(true);
    expect(r.outreachReady).toBe(false);
    expect(r.uploadLinkReady).toBe(false);
    expect(r.blockers.some((b) => /Do-not-contact/i.test(b))).toBe(true);
  });

  it('missing document-upload authorization blocks upload-link readiness', () => {
    const r = deriveCrmContactReadiness({
      subject: { ownerType: 'person', ownerId: 'P1', contactPoints: [email()], authorizations: [] },
      asOfDate: NOW,
    });
    expect(r.outreachReady).toBe(true);
    expect(r.uploadLinkReady).toBe(false);
    expect(r.blockers.some((b) => /authorization/i.test(b))).toBe(true);
  });

  it('expired authorization blocks upload-link readiness', () => {
    const r = deriveCrmContactReadiness({
      subject: { ownerType: 'person', ownerId: 'P1', contactPoints: [email()], authorizations: [uploadAuth({ expirationDate: '2025-01-01' })] },
      asOfDate: NOW,
    });
    expect(r.uploadLinkReady).toBe(false);
  });

  it('usable contact + valid authorization + no do-not-contact → fully ready', () => {
    const r = deriveCrmContactReadiness({
      subject: { ownerType: 'person', ownerId: 'P1', contactPoints: [email()], authorizations: [uploadAuth()] },
      asOfDate: NOW,
    });
    expect(r.outreachReady).toBe(true);
    expect(r.uploadLinkReady).toBe(true);
    expect(r.blockers).toEqual([]);
  });

  it('resolveCrmContactSubject gathers points, prefs, and authorizations from the master', () => {
    const master = masterWith({ people: [person({ doNotContact: true })], contactPoints: [email()], contactAuthorizations: [uploadAuth()] });
    const subject = resolveCrmContactSubject(master, 'person', 'P1');
    expect(subject.contactPoints.length).toBe(1);
    expect(subject.personDoNotContact).toBe(true);
    expect(subject.authorizations.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Network snapshot
// ---------------------------------------------------------------------------

describe('Phase 141B-H — relationship network snapshot', () => {
  it('empty master → empty snapshot, no fake nodes', () => {
    const s = deriveCrmRelationshipNetworkSnapshot(createEmptyCrmMaster());
    expect(s.isEmpty).toBe(true);
    expect(s.nodes).toEqual([]);
    expect(s.totalOrganizations).toBe(0);
  });

  it('counts orgs/people/relationships and flags orgs missing contact', () => {
    const master = masterWith({ organizations: [org()], people: [person()], relationships: [borrowerRel()] });
    const s = deriveCrmRelationshipNetworkSnapshot(master);
    expect(s.totalOrganizations).toBe(1);
    expect(s.totalPeople).toBe(1);
    expect(s.totalRelationships).toBe(1);
    expect(s.orgsMissingContact).toBe(1); // no usable contact points present
  });
});

// ---------------------------------------------------------------------------
// Contact tasks
// ---------------------------------------------------------------------------

describe('Phase 141B-H — contact tasks (no writes)', () => {
  it('a borrower contact with no contact point yields an add_primary_contact task', () => {
    const master = masterWith({ organizations: [org()], people: [person()] });
    const tasks = deriveCrmContactTasks({ master, asOfDate: NOW });
    expect(tasks.some((t) => t.taskType === 'add_primary_contact')).toBe(true);
    expect(tasks.every((t) => t.status !== 'completed')).toBe(true);
  });

  it('a contactable borrower lacking upload authorization yields a collect_authorization task', () => {
    const master = masterWith({ organizations: [org()], people: [person()], contactPoints: [email()] });
    const tasks = deriveCrmContactTasks({ master, asOfDate: NOW });
    expect(tasks.some((t) => t.taskType === 'collect_authorization')).toBe(true);
  });

  it('a customer org with no relationship owner yields assign_relationship_owner', () => {
    const master = masterWith({ organizations: [org()] });
    const tasks = deriveCrmContactTasks({ master, asOfDate: NOW });
    expect(tasks.some((t) => t.taskType === 'assign_relationship_owner')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Recipient resolver + integration seams
// ---------------------------------------------------------------------------

describe('Phase 141B-H — borrower request recipient resolver', () => {
  function fullMaster(over: { person?: Partial<CrmPerson>; auth?: Partial<CrmContactAuthorization>; role?: boolean } = {}): CrmMaster {
    const roleAssignments: CrmRoleAssignment[] = over.role
      ? [{ roleId: 'RA1', personId: 'P1', orgId: 'ORG1', role: 'borrower_contact', active: true }]
      : [];
    return masterWith({
      organizations: [org()],
      people: [person(over.person)],
      contactPoints: [email()],
      contactAuthorizations: [uploadAuth(over.auth)],
      relationships: [borrowerRel()],
      roleAssignments,
    });
  }

  it('resolves the recipient and fully-ready outreach/upload by loanId', () => {
    const r = resolveBorrowerRequestRecipient({ master: fullMaster({ role: true }), loanId: 'LOAN1', asOfDate: NOW });
    expect(r.recipientPersonId).toBe('P1');
    expect(r.primaryContactPresent).toBe(true);
    expect(r.outreachReady).toBe(true);
    expect(r.uploadLinkReady).toBe(true);
    // The raw contact value is never surfaced on the recipient.
    expect(JSON.stringify(r)).not.toContain('redacted-test-value');
  });

  it('fails closed when no borrower org is linked', () => {
    const r = resolveBorrowerRequestRecipient({ master: createEmptyCrmMaster(), loanId: 'LOAN1' });
    expect(r.outreachReady).toBe(false);
    expect(r.blockers.some((b) => /No borrower organization/i.test(b))).toBe(true);
  });

  it('do-not-contact recipient blocks annual-review contact readiness', () => {
    const ar = resolveAnnualReviewContactReadiness(fullMaster({ person: { doNotContact: true } }), 'LOAN1', NOW);
    expect(ar.recipient.outreachReady).toBe(false);
    expect(ar.annualReviewContactReady).toBe(false);
  });

  it('boarded-loan CRM link resolves honestly (linked false when absent)', () => {
    expect(resolveBoardedLoanCrmLink(createEmptyCrmMaster(), 'LOAN1').linked).toBe(false);
    const link = resolveBoardedLoanCrmLink(masterWith({ organizations: [org()], relationships: [borrowerRel()] }), 'LOAN1');
    expect(link.linked).toBe(true);
    expect(link.borrowerOrgId).toBe('ORG1');
  });
});
