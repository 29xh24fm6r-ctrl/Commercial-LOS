/**
 * Phase 141M — CRM recipient resolution for the annual review borrower request.
 *
 * PURE. Decides who the authorized borrower-side request recipient is, enforcing
 * contact authorization, do-not-contact, restricted-use, and contact-point
 * availability. It never invents a contact value, only ever exposes a MASKED
 * value, and `safeForSend` is structurally always false.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - No IO. No fetch. CRM records are passed in (already loaded by the caller).
 *   - Never fabricates a contact value; masks the selected value.
 *   - Do-not-contact blocks; missing / expired authorization blocks; restricted
 *     use blocks. `safeForSend` is always false.
 */

import type {
  CrmMaster,
  CrmPerson,
  CrmContactPoint,
  CrmContactAuthorization,
} from '../shared/crm/crmTypes';
import type {
  AnnualReviewBorrowerRequestRecipientDecision,
  AnnualReviewBorrowerRecipientCandidate,
  AnnualReviewRecipientContactPointView,
  AnnualReviewRecipientDecisionStatus,
  AnnualReviewRecipientConfidence,
  AnnualReviewBorrowerRequestBlocker,
} from './annualReviewBorrowerRequestTypes';

export type AnnualReviewRequestPurpose =
  | 'financial_request'
  | 'upload_link'
  | 'general_notice';

export interface AnnualReviewRecipientResolutionInput {
  master: CrmMaster;
  /** Resolve the borrower org via a relationship carrying this loanId. */
  loanId?: string;
  /** Or resolve directly from a known borrower organization. */
  borrowerOrgId?: string;
  purpose?: AnnualReviewRequestPurpose;
  /** From the workflow feature flag. When false → disabled_not_configured. */
  enabled?: boolean;
  asOfDate?: string | Date;
}

// The borrower-side request roles, in preference order. Only `borrower_contact`
// exists in the current CRM role model; the others are forward-compatible names
// matched as strings if a future role model carries them.
export const PREFERRED_REQUEST_ROLE_PRIORITY: readonly string[] = Object.freeze([
  'annual_review_financial_request_contact',
  'borrower_financial_request_contact',
  'upload_link_contact',
  'covenant_request_contact',
  'primary_borrower_contact',
  'borrower_contact',
]);

/** Mask a contact value: presence + channel only, never any raw character. */
export function maskContactValue(
  value: string | undefined,
  channel: string,
): string | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  if (channel === 'email') return '•••@•••';
  if (channel === 'phone') return '•••-•••-••••';
  return '••••';
}

function blocker(code: string, message: string, remediation?: string): AnnualReviewBorrowerRequestBlocker {
  return { code, message, remediation };
}

function resolveNowMs(asOf?: string | Date): number {
  if (asOf instanceof Date) return asOf.getTime();
  if (typeof asOf === 'string') {
    const ms = Date.parse(asOf);
    if (!Number.isNaN(ms)) return ms;
  }
  return Date.now();
}

function resolveBorrowerOrgId(input: AnnualReviewRecipientResolutionInput): string | undefined {
  if (input.borrowerOrgId) return input.borrowerOrgId;
  if (input.loanId) {
    const rel = input.master.relationships.find(
      (r) => r.loanId === input.loanId && r.relationshipType === 'borrower',
    );
    if (rel) return rel.fromEntityType === 'organization' ? rel.fromEntityId : rel.toEntityId;
  }
  return undefined;
}

function authActive(a: CrmContactAuthorization, nowMs: number): boolean {
  if (a.revoked === true) return false;
  if (a.expirationDate) {
    const e = Date.parse(a.expirationDate);
    if (!Number.isNaN(e) && e < nowMs) return false;
  }
  return true;
}

function rolesForPerson(master: CrmMaster, personId: string): string[] {
  return master.roleAssignments
    .filter((ra) => ra.personId === personId && ra.active !== false)
    .map((ra) => ra.role as string);
}

function contactViews(points: readonly CrmContactPoint[]): AnnualReviewRecipientContactPointView[] {
  return points.map((c) => {
    const usable = (c.value ?? '').trim().length > 0 && c.doNotUse !== true;
    return {
      contactPointId: c.contactPointId,
      channel: c.channel,
      masked: maskContactValue(c.value, c.channel) ?? '(no value on file)',
      verified: c.verified,
      preferred: c.isPrimary,
      usable,
    };
  });
}

interface CandidateEval {
  candidate: AnnualReviewBorrowerRecipientCandidate;
  person: CrmPerson;
  hasUsableContact: boolean;
  authorizedForPurpose: boolean;
  doNotContact: boolean;
  restrictedMismatch: boolean;
  bestContact?: CrmContactPoint;
  viable: boolean;
}

function evaluateCandidate(
  input: AnnualReviewRecipientResolutionInput,
  person: CrmPerson,
  nowMs: number,
  purpose: AnnualReviewRequestPurpose,
): CandidateEval {
  const { master } = input;
  const points = master.contactPoints.filter(
    (c) => c.ownerType === 'person' && c.ownerId === person.personId,
  );
  const authorizations = master.contactAuthorizations.filter((a) => a.personId === person.personId);
  const active = authorizations.filter((a) => authActive(a, nowMs));
  const authorizationFlags = {
    financialRequests: active.some((a) => a.authType === 'financial_disclosure'),
    uploadLinks: active.some((a) => a.authType === 'document_upload'),
    loanNotices: active.some((a) => a.authType === 'general' || a.authType === 'account_servicing'),
  };

  const commPref = master.communicationPreferences.find(
    (p) => p.ownerType === 'person' && p.ownerId === person.personId,
  );
  const doNotContact = person.doNotContact === true || commPref?.doNotContact === true;
  const prohibitedMethods: string[] = [];
  if (commPref?.doNotEmail === true) prohibitedMethods.push('email');
  if (commPref?.doNotCall === true) prohibitedMethods.push('phone');

  const usablePoints = points.filter((c) => (c.value ?? '').trim().length > 0 && c.doNotUse !== true);
  const hasUsableContact = usablePoints.length > 0;
  const restrictedMismatch = usablePoints.some(
    (c) => (c as unknown as Record<string, unknown>).restrictedUse === true,
  );

  const authorizedForPurpose =
    purpose === 'financial_request'
      ? authorizationFlags.financialRequests
      : purpose === 'upload_link'
        ? authorizationFlags.uploadLinks
        : authorizationFlags.loanNotices;

  // Prefer a verified + preferred email, then any usable point.
  const bestContact =
    usablePoints.find((c) => c.channel === 'email' && c.isPrimary === true && c.verified === true) ??
    usablePoints.find((c) => c.channel === 'email' && c.isPrimary === true) ??
    usablePoints.find((c) => c.channel === 'email') ??
    usablePoints[0];

  const roleTypes = rolesForPerson(master, person.personId);
  const hasPreferredRole = roleTypes.some((r) => PREFERRED_REQUEST_ROLE_PRIORITY.includes(r));
  const viable = hasUsableContact && authorizedForPurpose && !doNotContact && !restrictedMismatch;

  const cBlockers: AnnualReviewBorrowerRequestBlocker[] = [];
  if (!hasUsableContact) cBlockers.push(blocker('missing_contact_point', 'No usable contact point on file.', 'Verify a contact point in CRM.'));
  if (!authorizedForPurpose) cBlockers.push(blocker('missing_authorization', 'Not authorized for this request purpose.', 'Collect the required CRM authorization.'));
  if (doNotContact) cBlockers.push(blocker('do_not_contact', 'Do-not-contact is set.', 'Choose a different recipient or clear do-not-contact.'));
  if (restrictedMismatch) cBlockers.push(blocker('restricted_use', 'Contact is restricted for this purpose.', 'Choose a contact authorized for this use.'));

  const warnings: string[] = [];
  if (bestContact && prohibitedMethods.includes(bestContact.channel)) {
    warnings.push(`Preferred contact channel ${bestContact.channel} is marked prohibited.`);
  }

  const confidence: AnnualReviewRecipientConfidence = viable
    ? hasPreferredRole
      ? 'high'
      : 'medium'
    : 'low';

  const candidate: AnnualReviewBorrowerRecipientCandidate = {
    candidateId: person.personId,
    personId: person.personId,
    organizationId: person.orgId,
    displayName: person.fullName,
    roleTypes,
    contactPoints: contactViews(points),
    authorizationFlags,
    communicationPreferences: {
      doNotContact,
      restrictedUse: restrictedMismatch,
      prohibitedMethods,
      preferredChannel: commPref?.preferredChannel,
    },
    source: 'crm',
    confidence,
    blockers: cBlockers,
    warnings,
  };

  return {
    candidate,
    person,
    hasUsableContact,
    authorizedForPurpose,
    doNotContact,
    restrictedMismatch,
    bestContact,
    viable,
  };
}

function disabledDecision(): AnnualReviewBorrowerRequestRecipientDecision {
  return {
    decision: 'disabled_not_configured',
    confidence: 'low',
    blockers: [blocker('disabled', 'The borrower request workflow is not enabled.')],
    warnings: [],
    requiresHumanSelection: false,
    safeForDraft: false,
    safeForSend: false,
    candidates: [],
  };
}

function bareDecision(
  decision: AnnualReviewRecipientDecisionStatus,
  blockers: readonly AnnualReviewBorrowerRequestBlocker[],
  candidates: readonly AnnualReviewBorrowerRecipientCandidate[],
): AnnualReviewBorrowerRequestRecipientDecision {
  return {
    decision,
    confidence: 'low',
    blockers,
    warnings: [],
    requiresHumanSelection: false,
    safeForDraft: false,
    safeForSend: false,
    candidates,
  };
}

export function resolveAnnualReviewBorrowerRequestRecipients(
  input: AnnualReviewRecipientResolutionInput,
): AnnualReviewBorrowerRequestRecipientDecision {
  if (input.enabled === false) return disabledDecision();

  const purpose = input.purpose ?? 'financial_request';
  const nowMs = resolveNowMs(input.asOfDate);

  const orgId = resolveBorrowerOrgId(input);
  if (!orgId) {
    return bareDecision('blocked_no_recipient', [blocker('no_recipient', 'No borrower organization linked in CRM.', 'Link the borrower org/loan relationship in CRM.')], []);
  }

  // Candidate people: active people in the borrower org plus anyone holding a
  // preferred borrower-side request role for the org.
  const people = input.master.people.filter((p) => {
    if (p.status !== 'active') return false;
    if (p.orgId === orgId && (p.personType === 'customer_contact' || p.personType === 'guarantor' || p.personType === 'other')) {
      return true;
    }
    const roles = rolesForPerson(input.master, p.personId);
    return p.orgId === orgId && roles.some((r) => PREFERRED_REQUEST_ROLE_PRIORITY.includes(r));
  });

  if (people.length === 0) {
    return bareDecision('blocked_no_recipient', [blocker('no_recipient', 'No borrower contact person in CRM (missing contact).', 'Add an authorized borrower contact in CRM.')], []);
  }

  const evals = people.map((p) => evaluateCandidate(input, p, nowMs, purpose));
  const candidates = evals.map((e) => e.candidate);
  const viable = evals.filter((e) => e.viable);

  // Multiple equivalent authorized recipients → human picks one.
  if (viable.length > 1) {
    return {
      decision: 'needs_human_selection',
      confidence: 'medium',
      blockers: [],
      warnings: [`${viable.length} authorized recipients found; a human must select one.`],
      requiresHumanSelection: true,
      safeForDraft: false,
      safeForSend: false,
      candidates,
    };
  }

  if (viable.length === 1) {
    const chosen = viable[0];
    const contact = chosen.bestContact;
    return {
      selectedRecipientId: chosen.person.personId,
      selectedDisplayName: chosen.person.fullName,
      selectedContactPointId: contact?.contactPointId,
      selectedContactValueMasked: contact ? maskContactValue(contact.value, contact.channel) : undefined,
      decision: 'ready_for_human_approval',
      confidence: chosen.candidate.confidence,
      blockers: [],
      warnings: chosen.candidate.warnings,
      requiresHumanSelection: false,
      // A human can review the draft, but nothing is ever sent.
      safeForDraft: true,
      safeForSend: false,
      candidates,
    };
  }

  // No viable candidate — surface the single most informative blocker.
  const authedWithContact = evals.filter((e) => e.authorizedForPurpose && e.hasUsableContact);
  if (authedWithContact.some((e) => e.doNotContact)) {
    return bareDecision('blocked_do_not_contact', [blocker('do_not_contact', 'The authorized recipient is marked do-not-contact.', 'Choose a different recipient or clear do-not-contact.')], candidates);
  }
  if (authedWithContact.some((e) => e.restrictedMismatch)) {
    return bareDecision('blocked_restricted_use', [blocker('restricted_use', 'The authorized contact is restricted for this purpose.', 'Choose a contact authorized for this use.')], candidates);
  }
  if (evals.some((e) => e.hasUsableContact)) {
    return bareDecision('blocked_no_authorized_contact', [blocker('no_authorized_contact', 'No recipient is authorized for this request purpose.', 'Collect the required CRM authorization.')], candidates);
  }
  return bareDecision('blocked_missing_contact_point', [blocker('missing_contact_point', 'No usable contact point on any candidate.', 'Verify a contact point in CRM.')], candidates);
}
