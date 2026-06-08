/**
 * Phase 141B-H — CRM borrower request recipient resolver.
 *
 * PURE, fail-closed resolution of who a borrower financial request would go to,
 * honoring do-not-contact and document-upload authorization. It NEVER exposes
 * the raw email/phone value — only whether a usable primary contact is present —
 * and it sends nothing.
 */

import type { CrmMaster, CrmContactChannel, CrmPerson } from './crmTypes';
import {
  resolveCrmContactSubject,
  deriveCrmContactReadiness,
  type CrmContactReadinessResult,
} from './deriveCrmReadiness';

export interface BorrowerRequestRecipientInput {
  master: CrmMaster;
  /** Resolve the borrower org via a relationship carrying this loanId. */
  loanId?: string;
  /** Or resolve directly from a known borrower organization. */
  borrowerOrgId?: string;
  asOfDate?: string | Date;
}

export interface BorrowerRequestRecipient {
  recipientPersonId?: string;
  recipientName?: string;
  recipientOrgId?: string;
  channel?: CrmContactChannel;
  /** Whether a usable primary contact point exists — never the value itself. */
  primaryContactPresent: boolean;
  readiness?: CrmContactReadinessResult;
  outreachReady: boolean;
  uploadLinkReady: boolean;
  blockers: readonly string[];
}

function resolveBorrowerOrgId(input: BorrowerRequestRecipientInput): string | undefined {
  if (input.borrowerOrgId) return input.borrowerOrgId;
  if (input.loanId) {
    const rel = input.master.relationships.find(
      (r) => r.loanId === input.loanId && r.relationshipType === 'borrower',
    );
    if (rel) return rel.fromEntityType === 'organization' ? rel.fromEntityId : rel.toEntityId;
  }
  return undefined;
}

function pickBorrowerContact(master: CrmMaster, orgId: string): CrmPerson | undefined {
  const candidates = master.people.filter(
    (p) => p.orgId === orgId && p.personType === 'customer_contact' && p.status === 'active',
  );
  // Prefer the person who holds an explicit borrower_contact role.
  const withRole = candidates.find((p) =>
    master.roleAssignments.some(
      (ra) => ra.personId === p.personId && ra.role === 'borrower_contact' && ra.active !== false,
    ),
  );
  return withRole ?? candidates[0];
}

export function resolveBorrowerRequestRecipient(
  input: BorrowerRequestRecipientInput,
): BorrowerRequestRecipient {
  const blockers: string[] = [];
  const orgId = resolveBorrowerOrgId(input);
  if (!orgId) {
    return {
      primaryContactPresent: false,
      outreachReady: false,
      uploadLinkReady: false,
      blockers: ['No borrower organization linked in CRM.'],
    };
  }

  const person = pickBorrowerContact(input.master, orgId);
  if (!person) {
    return {
      recipientOrgId: orgId,
      primaryContactPresent: false,
      outreachReady: false,
      uploadLinkReady: false,
      blockers: ['No borrower contact person in CRM (missing contact).'],
    };
  }

  const subject = resolveCrmContactSubject(input.master, 'person', person.personId);
  const readiness = deriveCrmContactReadiness({ subject, asOfDate: input.asOfDate });
  blockers.push(...readiness.blockers);

  const primaryEmail = subject.contactPoints.find(
    (c) => c.channel === 'email' && c.isPrimary === true && (c.value ?? '').trim().length > 0 && c.doNotUse !== true,
  );
  const anyUsable = subject.contactPoints.find(
    (c) => (c.value ?? '').trim().length > 0 && c.doNotUse !== true,
  );
  const channel = (primaryEmail ?? anyUsable)?.channel;

  return {
    recipientPersonId: person.personId,
    recipientName: person.fullName,
    recipientOrgId: orgId,
    channel,
    primaryContactPresent: anyUsable !== undefined,
    readiness,
    outreachReady: readiness.outreachReady,
    uploadLinkReady: readiness.uploadLinkReady,
    blockers,
  };
}
