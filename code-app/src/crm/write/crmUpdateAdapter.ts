/**
 * Governed CRM field-update adapter (Phase 6).
 *
 * Lets an authorized banker EDIT a field on an existing CRM company (Type, NAICS,
 * industry descriptor, Tax-ID-on-file flag, …) through the same governed
 * discipline as the live create path:
 *   - IDENTITY-GATED like creates (F3, D1): an authorized operator with a resolved
 *     Dataverse identity is required — NOT the automated CRM_LIVE_PERSISTENCE flag.
 *     The `enabled` seam is retained (default on) for a forced fail-closed path.
 *   - ALLOW-LIST: only an explicit set of safe columns may be updated.
 *   - SENSITIVE-FIELD rejection: a tax id / ssn / tin / ein VALUE is never written
 *     here; the ONLY tax field allowed is the Boolean `cr664_taxidpresent`
 *     (is-on-file flag) — the number itself is never stored.
 *   - Per-field VALUE validation (Type ∈ party-type enum, NAICS = 6-digit,
 *     boolean flags ∈ true/false).
 *   - Audit (cr664_crmauditentries) on every write, with correlation id.
 *
 * Isolated from the create adapter's shared deps/outcome so existing write tests
 * are untouched.
 */

import { newCorrelationId } from '../../shared/governance/correlationId';
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
  // Boolean "tax identifier on file" flag. The sensitive VALUE is never stored;
  // this is only the is-on-file marker (see the sensitive-field exemption below).
  'cr664_taxidpresent',
] as const;
export type CrmUpdatableOrgField = (typeof CRM_UPDATABLE_ORG_FIELDS)[number];

const UPDATABLE_SET: ReadonlySet<string> = new Set(CRM_UPDATABLE_ORG_FIELDS);

/** Fields whose Dataverse type is Boolean — the string edit value is coerced to a boolean. */
const BOOLEAN_ORG_FIELDS: ReadonlySet<string> = new Set(['cr664_taxidpresent']);

/** Never accept a raw sensitive identifier through a field update. */
const FORBIDDEN_SENSITIVE_KEY = /tax\s*id|ssn|tin|ein/i;
/**
 * The is-on-file BOOLEAN flag matches the sensitive regex by name but is safe (it
 * stores no identifier value), so it is explicitly exempt from the sensitive-key
 * rejection. Any actual tax-id VALUE field (a string) is still blocked.
 */
const SENSITIVE_KEY_EXEMPT: ReadonlySet<string> = new Set(['cr664_taxidpresent']);

export interface CrmUpdateActor {
  readonly actorEmail?: string;
  readonly actorSystemUserId?: string;
  readonly authorized: boolean;
}

export interface UpdateOrgFieldInput extends CrmUpdateActor {
  readonly organizationId: string;
  readonly field: string;
  readonly value: string;
  /** Defaults to true — CRM edits ride the identity gate like creates. Pass false to force fail-closed. */
  readonly enabled?: boolean;
}

export type CrmUpdateOutcome =
  | { kind: 'success'; correlationId: string; auditId: string | undefined }
  | { kind: 'disabled'; reason: string }
  | { kind: 'unauthorized'; reason: string }
  | { kind: 'disallowed-field'; reason: string }
  | { kind: 'invalid-input'; reason: string }
  | { kind: 'update-failed'; error: string; correlationId: string }
  | { kind: 'readback-mismatch'; correlationId: string }
  | { kind: 'audit-failed'; auditError: string | undefined; correlationId: string };

export interface CrmUpdateResult {
  readonly success: boolean;
  readonly error?: string;
}

export interface CrmUpdateReadback {
  readonly success: boolean;
  readonly data?: Record<string, unknown>;
  readonly error?: string;
}

export interface CrmUpdateDeps {
  readonly updateOrganization: (id: string, fields: Record<string, unknown>) => Promise<CrmUpdateResult>;
  /**
   * Optional readback of the updated record. When injected, the written field MUST read
   * back and match before the edit is reported successful (the same verify discipline the
   * create path uses); a missing/mismatched readback fails closed as `readback-mismatch`.
   */
  readonly readOrganization?: (id: string) => Promise<CrmUpdateReadback>;
  readonly emitAudit: (payload: Record<string, unknown>) => Promise<{ success: boolean; id?: string; error?: string }>;
}

function trimmed(v: string | undefined): string {
  return (v ?? '').trim();
}

/** Tolerant field compare for readback verification (text stays string; booleans coerce). */
function fieldMatches(got: unknown, expected: string | boolean): boolean {
  if (typeof expected === 'boolean') return Boolean(got) === expected;
  return String(got ?? '').trim() === expected.trim();
}

/** Per-field value validation for the known structured fields. */
function validateValue(field: string, value: string): string | null {
  if (field === 'cr664_organizationtype' && value.length > 0 && !isValidPartyType(value)) {
    return `"${value}" is not an allowed party Type.`;
  }
  if (field === 'cr664_naicscode' && value.length > 0 && !isNaicsCode6(value)) {
    return 'NAICS code must be a 6-digit value.';
  }
  if (BOOLEAN_ORG_FIELDS.has(field) && value.length > 0 && value !== 'true' && value !== 'false') {
    return 'This on-file flag must be true or false.';
  }
  return null;
}

export async function updateOrganizationField(input: UpdateOrgFieldInput, deps: CrmUpdateDeps): Promise<CrmUpdateOutcome> {
  // F3/D1 — edits ride the identity gate (the authorization check below), not the
  // automated CRM_LIVE_PERSISTENCE flag. `enabled` defaults on; a caller can still
  // force the fail-closed path with enabled:false.
  const enabled = input.enabled ?? true;
  if (enabled !== true) {
    return { kind: 'disabled', reason: 'CRM field edits are disabled for this caller.' };
  }
  if (input.authorized !== true || trimmed(input.actorSystemUserId).length === 0 || trimmed(input.actorEmail).length === 0) {
    return { kind: 'unauthorized', reason: 'An authorized operator with a resolved Dataverse identity is required.' };
  }
  const field = trimmed(input.field);
  if (!UPDATABLE_SET.has(field)) {
    return { kind: 'disallowed-field', reason: `"${field}" is not an updatable CRM field.` };
  }
  if (FORBIDDEN_SENSITIVE_KEY.test(field) && !SENSITIVE_KEY_EXEMPT.has(field)) {
    return { kind: 'disallowed-field', reason: 'Sensitive identifiers cannot be updated through this path.' };
  }
  const orgId = trimmed(input.organizationId);
  if (orgId.length === 0) return { kind: 'invalid-input', reason: 'An organization id is required.' };
  const value = trimmed(input.value);
  const valueError = validateValue(field, value);
  if (valueError) return { kind: 'invalid-input', reason: valueError };

  const correlationId = newCorrelationId('crm');
  // Boolean fields (the tax-id-on-file flag) coerce their string edit value to a real boolean.
  const writeValue: string | boolean = BOOLEAN_ORG_FIELDS.has(field) ? value === 'true' : value;
  const updateResult = await deps.updateOrganization(orgId, { [field]: writeValue }).catch((e: unknown) => ({
    success: false,
    error: e instanceof Error ? e.message : String(e),
  }));
  if (!updateResult.success) {
    return { kind: 'update-failed', error: updateResult.error ?? 'unknown error', correlationId };
  }

  // Readback verification (when a reader is injected): the written value must read back and
  // match before we claim success — the same discipline the create path uses.
  if (deps.readOrganization) {
    const readback: CrmUpdateReadback = await deps
      .readOrganization(orgId)
      .catch((e: unknown) => ({ success: false, error: e instanceof Error ? e.message : String(e) }));
    if (!readback.success || !fieldMatches(readback.data?.[field], writeValue)) {
      return { kind: 'readback-mismatch', correlationId };
    }
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
    case 'readback-mismatch':
      return 'The change could not be verified after saving — reload to confirm the value.';
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
      // The SDK returns an IOperationResult object — read its `success`/`error`, never
      // `Boolean(result)` (which is always true for a non-null object and would report a
      // Dataverse-rejected update as saved).
      const result = await update(id, fields as Parameters<typeof update>[1]);
      return { success: result.success, error: result.error?.message };
    },
    readOrganization: async (id) => {
      const mod = await import('../../generated/services/Cr664_crmorganizationsService');
      const result = await mod.Cr664_crmorganizationsService.get(id);
      return {
        success: result.success,
        data: (result.data as unknown as Record<string, unknown> | undefined) ?? undefined,
        error: result.error?.message,
      };
    },
    emitAudit: async (payload) => {
      const mod = await import('../../generated/services/Cr664_crmauditentriesService');
      const create = mod.Cr664_crmauditentriesService.create;
      const result = await create(payload as Parameters<typeof create>[0]);
      return { success: result.success, id: result.data?.cr664_crmauditentryid, error: result.error?.message };
    },
  };
}
