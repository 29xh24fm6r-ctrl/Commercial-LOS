/**
 * Phase 141B-H — CRM readiness engine.
 *
 * PURE, fail-closed contact/outreach/upload-link readiness for a CRM subject.
 * Missing contact means missing; do-not-contact blocks outreach; a missing or
 * expired document-upload authorization blocks the upload-link readiness.
 */

import type {
  CrmContactPoint,
  CrmCommunicationPreference,
  CrmContactAuthorization,
  CrmEntityType,
  CrmMaster,
} from './crmTypes';

export interface CrmContactSubject {
  ownerType: CrmEntityType;
  ownerId: string;
  contactPoints: readonly CrmContactPoint[];
  personDoNotContact?: boolean;
  communicationPreference?: CrmCommunicationPreference;
  authorizations: readonly CrmContactAuthorization[];
}

export interface CrmContactReadinessInput {
  subject: CrmContactSubject;
  asOfDate?: string | Date;
}

export interface CrmContactReadinessResult {
  hasAnyContactPoint: boolean;
  emailReady: boolean;
  phoneReady: boolean;
  contactReady: boolean;
  doNotContact: boolean;
  outreachReady: boolean;
  uploadLinkReady: boolean;
  blockers: readonly string[];
  warnings: readonly string[];
}

function present(value: string | undefined): boolean {
  return value !== undefined && value.trim().length > 0;
}

function usable(c: CrmContactPoint): boolean {
  return present(c.value) && c.doNotUse !== true;
}

function resolveNowMs(asOf?: string | Date): number {
  if (asOf instanceof Date) return asOf.getTime();
  if (typeof asOf === 'string') {
    const ms = Date.parse(asOf);
    if (!Number.isNaN(ms)) return ms;
  }
  return Date.now();
}

function hasValidUploadAuthorization(
  authorizations: readonly CrmContactAuthorization[],
  nowMs: number,
): boolean {
  return authorizations.some((a) => {
    if (a.authType !== 'document_upload') return false;
    if (a.revoked === true) return false;
    if (a.expirationDate) {
      const exp = Date.parse(a.expirationDate);
      if (!Number.isNaN(exp) && exp < nowMs) return false;
    }
    return true;
  });
}

export function deriveCrmContactReadiness(
  input: CrmContactReadinessInput,
): CrmContactReadinessResult {
  const { subject } = input;
  const nowMs = resolveNowMs(input.asOfDate);
  const blockers: string[] = [];
  const warnings: string[] = [];

  const points = subject.contactPoints;
  const hasAnyContactPoint = points.length > 0;
  const emailReady = points.some((c) => c.channel === 'email' && usable(c));
  const phoneReady = points.some((c) => c.channel === 'phone' && usable(c));
  const contactReady = points.some((c) => usable(c));

  if (!contactReady) blockers.push('No usable contact point (missing contact).');

  const doNotContact =
    subject.personDoNotContact === true ||
    subject.communicationPreference?.doNotContact === true;
  if (doNotContact) blockers.push('Do-not-contact is set; outreach is blocked.');

  const outreachReady = contactReady && !doNotContact;

  const hasUploadAuth = hasValidUploadAuthorization(subject.authorizations, nowMs);
  if (!hasUploadAuth) {
    blockers.push('Missing or expired document-upload authorization; upload link is blocked.');
  }
  const uploadLinkReady = outreachReady && hasUploadAuth;

  if (outreachReady && !emailReady && subject.communicationPreference?.preferredChannel === 'email') {
    warnings.push('Preferred channel is email but no usable email is on file.');
  }

  return {
    hasAnyContactPoint,
    emailReady,
    phoneReady,
    contactReady,
    doNotContact,
    outreachReady,
    uploadLinkReady,
    blockers,
    warnings,
  };
}

/** Resolve a contact subject for an entity from the CRM master. */
export function resolveCrmContactSubject(
  master: CrmMaster,
  ownerType: CrmEntityType,
  ownerId: string,
): CrmContactSubject {
  const contactPoints = master.contactPoints.filter(
    (c) => c.ownerType === ownerType && c.ownerId === ownerId,
  );
  const communicationPreference = master.communicationPreferences.find(
    (p) => p.ownerType === ownerType && p.ownerId === ownerId,
  );
  const authorizations = master.contactAuthorizations.filter((a) =>
    ownerType === 'person' ? a.personId === ownerId : a.orgId === ownerId,
  );
  const personDoNotContact =
    ownerType === 'person'
      ? master.people.find((p) => p.personId === ownerId)?.doNotContact
      : undefined;

  return {
    ownerType,
    ownerId,
    contactPoints,
    personDoNotContact,
    communicationPreference,
    authorizations,
  };
}
