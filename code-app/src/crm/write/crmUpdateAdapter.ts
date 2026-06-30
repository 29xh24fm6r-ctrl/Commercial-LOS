/**
 * Governed CRM field-update adapter (Phase 6).
 *
 * Lets an authorized banker EDIT a field on an existing CRM company (Type, NAICS,
 * industry descriptor, …) through the same governed discipline as creates, plus:
 *   - DEFAULT-OFF / fail-closed: updates are disabled unless CRM live persistence
 *     is enabled AND an authorized operator is present.
 *   - ALLOW-LIST: only an explicit set of safe columns may be updated.
 *   - SENSITIVE-FIELD rejection: tax id / ssn / tin / ein are never written here.
 *   - Per-field VALUE validation (Type ∈ party-type enum, NAICS = 6-digit).
 *   - Audit (cr664_crmauditentries) on every write, with correlation id.
 *
 * Isolated from the create adapter's shared deps/outcome so existing write tests
 * are untouched.
 */

import { newCorrelationId } from '../../shared/governance/correlationId';
import { CRM_LIVE_PERSISTENCE_ENABLED } from '../crmFeatureFlags';
import { isValidPartyType } from '../crmPartyTypes';
import { isNaicsCode6 } from '../naics/naicsSectorMap';

/** Columns an authorized operator may update through this governed path. */
export const CRM_UPDATABLE_ORG_FIELDS = [
  'cr664_displayname',
  'cr664_legalname',
  'cr664_dbaname',
  'cr664_organizationtype',
  'cr664_industry',
  'cr664_naicscode',
  'cr664_website',
  'cr664_status',
  'cr664_notes',
] as const;
export type CrmUpdatableOrgField = (typeof CRM_UPDATABLE_ORG_FIELDS)[number];

const UPDATABLE_SET: ReadonlySet<string> = new Set(CRM_UPDATABLE_ORG_FIELDS);

/** Never accept a raw sensitive identifier through a field update. */
const FORBIDDEN_SENSITIVE_KEY = /tax\s*id|ssn|tin|ein/i;

export interface CrmUpdateActor {
  readonly actorEmail?: string;
  readonly actorSystemUserId?: string;
  readonly authorized: boolean;
}

export interface UpdateOrgFieldInput extends CrmUpdateActor {
  readonly organizationId: string;
  readonly field: string;
  readonly value: string;
  /** Defaults to CRM_LIVE_PERSISTENCE_ENABLED (false) — fail-closed. */
  readonly enabled?: boolean;
}

export type CrmUpdateOutcome =
  | { kind: 'success'; correlationId: string; auditId: string | undefined }
  | { kind: 'disabled'; reason: string }
  | { kind: 'unauthorized'; reason: string }
  | { kind: 'disallowed-field'; reason: string }
  | { kind: 'invalid-input'; reason: string }
  | { kind: 'update-failed'; error: string; correlationId: string }
  | { kind: 'audit-failed'; auditError: string | undefined; correlationId: string };

export interface CrmUpdateResult {
  readonly success: boolean;
  readonly error?: string;
}

export interface CrmUpdateDeps {
  readonly updateOrganization: (id: string, fields: Record<string, unknown>) => Promise<CrmUpdateResult>;
  readonly emitAudit: (payload: Record<string, unknown>) => Promise<{ success: boolean; id?: string; error?: string }>;
}

function trimmed(v: string | undefined): string {
  return (v ?? '').trim();
}

/** Per-field value validation for the known structured fields. */
function validateValue(field: string, value: string): string | null {
  if (field === 'cr664_organizationtype' && value.length > 0 && !isValidPartyType(value)) {
    return `"${value}" is not an allowed party Type.`;
  }
  if (field === 'cr664_naicscode' && value.length > 0 && !isNaicsCode6(value)) {
    return 'NAICS code must be a 6-digit value.';
  }
  return null;
}

export async function updateOrganizationField(input: UpdateOrgFieldInput, deps: CrmUpdateDeps): Promise<CrmUpdateOutcome> {
  const enabled = input.enabled ?? CRM_LIVE_PERSISTENCE_ENABLED;
  if (enabled !== true) {
    return { kind: 'disabled', reason: 'CRM live persistence is disabled; field edits are off by default.' };
  }
  if (input.authorized !== true || trimmed(input.actorSystemUserId).length === 0 || trimmed(input.actorEmail).length === 0) {
    return { kind: 'unauthorized', reason: 'An authorized operator with a resolved Dataverse identity is required.' };
  }
  const field = trimmed(input.field);
  if (!UPDATABLE_SET.has(field)) {
    return { kind: 'disallowed-field', reason: `"${field}" is not an updatable CRM field.` };
  }
  if (FORBIDDEN_SENSITIVE_KEY.test(field)) {
    return { kind: 'disallowed-field', reason: 'Sensitive identifiers cannot be updated through this path.' };
  }
  const orgId = trimmed(input.organizationId);
  if (orgId.length === 0) return { kind: 'invalid-input', reason: 'An organization id is required.' };
  const value = trimmed(input.value);
  const valueError = validateValue(field, value);
  if (valueError) return { kind: 'invalid-input', reason: valueError };

  const correlationId = newCorrelationId('crm');
  const updateResult = await deps.updateOrganization(orgId, { [field]: value }).catch((e: unknown) => ({
    success: false,
    error: e instanceof Error ? e.message : String(e),
  }));
  if (!updateResult.success) {
    return { kind: 'update-failed', error: updateResult.error ?? 'unknown error', correlationId };
  }

  const audit = await deps
    .emitAudit({
      cr664_name: `crm-update-${field}`,
      cr664_actor: input.actorEmail,
      cr664_action: 'crm-update-organization-field',
      cr664_entitytype: 'organization',
      cr664_entityid: orgId,
      cr664_newvaluesummary: `${field} = ${value}`,
      cr664_timestamp: new Date().toISOString(),
      cr664_reason: `Governed CRM field update (ref ${correlationId}).`,
    })
    .catch((e: unknown) => ({ success: false, id: undefined, error: e instanceof Error ? e.message : String(e) }));
  if (!audit.success) {
    return { kind: 'audit-failed', auditError: audit.error, correlationId };
  }

  return { kind: 'success', correlationId, auditId: audit.id };
}

/** Human-readable reason for a non-success update outcome. */
export function describeUpdateFailure(o: Exclude<CrmUpdateOutcome, { kind: 'success' }>): string {
  switch (o.kind) {
    case 'disabled':
      return o.reason;
    case 'unauthorized':
      return o.reason;
    case 'disallowed-field':
      return o.reason;
    case 'invalid-input':
      return o.reason;
    case 'update-failed':
      return `The update failed. ${o.error}`;
    case 'audit-failed':
      return 'Saved, but its audit entry failed — an operator must reattempt the audit.';
  }
}

/**
 * Bridge a governed field update to the `InlineEdit` primitive's `onSave`
 * contract: returns `(field) => (next) => Promise<void>` that resolves on success
 * and REJECTS (so InlineEdit rolls back + shows an error toast) otherwise.
 */
export function makeOrgFieldSaver(args: {
  organizationId: string;
  actor: CrmUpdateActor;
  deps: CrmUpdateDeps;
  enabled?: boolean;
}) {
  return (field: CrmUpdatableOrgField) =>
    async (next: string): Promise<void> => {
      const outcome = await updateOrganizationField(
        { ...args.actor, organizationId: args.organizationId, field, value: next, enabled: args.enabled },
        args.deps,
      );
      if (outcome.kind !== 'success') throw new Error(describeUpdateFailure(outcome));
    };
}

/** Live deps via dynamic import of the generated services (SDK-free static graph). */
export function buildLiveCrmUpdateDeps(): CrmUpdateDeps {
  return {
    updateOrganization: async (id, fields) => {
      const mod = await import('../../generated/services/Cr664_crmorganizationsService');
      const update = mod.Cr664_crmorganizationsService.update;
      const result = await update(id, fields as Parameters<typeof update>[1]);
      return { success: Boolean(result), error: undefined };
    },
    emitAudit: async (payload) => {
      const mod = await import('../../generated/services/Cr664_crmauditentriesService');
      const create = mod.Cr664_crmauditentriesService.create;
      const result = await create(payload as Parameters<typeof create>[0]);
      const id = (result as { data?: { cr664_crmauditentryid?: string } })?.data?.cr664_crmauditentryid;
      return { success: Boolean(result), id };
    },
  };
}
