/**
 * Governed Deal Profile completion write.
 *
 * The Deal Cockpit flags missing profile fields but had no governed way for a
 * banker to fill them in. This adapter updates ONLY approved cr664_loandeal
 * profile fields, verifies persistence by readback, and audits the change —
 * following the same discipline as every other governed write in the app:
 *
 *   authorize (fail-closed) → validate → update → readback → audit → outcome.
 *
 * Scope (the fields already tracked by PROFILE_COMPLETENESS_FIELDS that are
 * backed by a real schema type this phase can safely write):
 *   - targetCloseDate      (date)          → cr664_targetclosedate
 *   - collateralSummary    (text)          → cr664_collateralsummary
 *   - customerType         (choice enum)   → cr664_customertype
 *   - industry             (choice enum)   → cr664_industry
 *   - guarantorStructure   (choice enum)   → cr664_guarantorstructure
 *
 * Deliberately OUT of scope: amount, stage, status, banker, and the Client
 * lookup (Phase 2 projects the verified CRM client). productType / loanStructure
 * / pricingType are reference LOOKUPS with no registered datasource or reference
 * list yet, so they are not editable here — the modal shows them read-only
 * rather than fabricate a dropdown.
 *
 * It creates nothing (no borrowers, no CRM records), changes no stage/status,
 * writes no amount/client, and fabricates no default values. Pure over injected
 * deps (SDK-free static graph); a live factory wires the generated services +
 * the existing audit actor resolver.
 */

import {
  Cr664_loandealscr664_customertype,
  Cr664_loandealscr664_industry,
  Cr664_loandealscr664_guarantorstructure,
} from '../../generated/models/Cr664_loandealsModel';
import { newCorrelationId } from '../../shared/governance/correlationId';
import {
  DEAL_REFERENCE_LOOKUPS,
  type DealReferenceLookupField,
  type DealReferenceLookupConfig,
} from './dealReferenceOptions';

/** The editable scalar / option-set profile fields this phase governs. */
export type DealProfileField =
  | 'targetCloseDate'
  | 'collateralSummary'
  | 'customerType'
  | 'industry'
  | 'guarantorStructure';

/** A scalar patch value: a string to set, or `null` to clear. */
export type DealProfilePatch = Partial<Record<DealProfileField, string | null>>;

/** A chosen reference row (its id + display name, from the loaded list). */
export interface DealReferenceSelection {
  readonly id: string;
  readonly name: string;
}

/** A reference patch: a chosen row to set, or `null` to clear the lookup. */
export type DealReferencePatch = Partial<Record<DealReferenceLookupField, DealReferenceSelection | null>>;

export interface UpdateDealProfileInput {
  readonly dealId: string;
  readonly actorEmail?: string;
  readonly actorSystemUserId?: string;
  readonly authorized: boolean;
  readonly patch: DealProfilePatch;
  /**
   * Optional reference-lookup selections (Product Type / Loan Structure /
   * Pricing Type). Each chosen id MUST come from `allowedReferenceIds` (the
   * ids the caller loaded from the real reference list) — arbitrary GUIDs are
   * rejected.
   */
  readonly referencePatch?: DealReferencePatch;
  /** The reference-row ids the caller actually loaded, for allow-list checks. */
  readonly allowedReferenceIds?: readonly string[];
}

type FieldKind = 'text' | 'date' | 'choice';

interface FieldSpec {
  readonly kind: FieldKind;
  /** Key written into the update body. */
  readonly writeKey: string;
  /** Key read back off the retrieved row to verify persistence. */
  readonly readKey: string;
  /** Choice option-set label→value map (choice fields only). */
  readonly options?: Readonly<Record<number, string>>;
  /** Human label for validation copy. */
  readonly label: string;
}

/** The ONLY fields this adapter may write. Anything else is rejected. */
export const DEAL_PROFILE_FIELD_SPECS: Readonly<Record<DealProfileField, FieldSpec>> = {
  targetCloseDate: { kind: 'date', writeKey: 'cr664_targetclosedate', readKey: 'cr664_targetclosedate', label: 'Target close date' },
  collateralSummary: { kind: 'text', writeKey: 'cr664_collateralsummary', readKey: 'cr664_collateralsummary', label: 'Collateral' },
  customerType: { kind: 'choice', writeKey: 'cr664_customertype', readKey: 'cr664_customertype', options: Cr664_loandealscr664_customertype, label: 'Customer type' },
  industry: { kind: 'choice', writeKey: 'cr664_industry', readKey: 'cr664_industry', options: Cr664_loandealscr664_industry, label: 'Industry' },
  guarantorStructure: { kind: 'choice', writeKey: 'cr664_guarantorstructure', readKey: 'cr664_guarantorstructure', options: Cr664_loandealscr664_guarantorstructure, label: 'Guarantor structure' },
};

/** Fields that MUST NEVER be writable through this adapter (defense in depth). */
export const DEAL_PROFILE_FORBIDDEN_COLUMNS = Object.freeze([
  'cr664_amount',
  'cr664_StageReference@odata.bind',
  'cr664_StatusReference@odata.bind',
  'cr664_AssignedBanker@odata.bind',
  'cr664_Client@odata.bind',
]);

export interface DealProfileWriteResult {
  readonly success: boolean;
  readonly error?: { readonly message?: string };
}

export interface DealProfileReadback {
  readonly success: boolean;
  readonly row?: Record<string, unknown>;
  readonly error?: { readonly message?: string };
}

export interface EmitDealProfileAuditInput {
  readonly dealId: string;
  readonly correlationId: string;
  readonly changedLabels: readonly string[];
  readonly actorEmail: string | undefined;
  readonly actorSystemUserId: string;
}

export interface UpdateDealProfileDeps {
  readonly updateDeal: (dealId: string, body: Record<string, unknown>) => Promise<DealProfileWriteResult>;
  readonly readDeal: (dealId: string) => Promise<DealProfileReadback>;
  readonly emitAudit: (input: EmitDealProfileAuditInput) => Promise<{ ok: boolean; id?: string; error?: string }>;
}

/** The verified, updated fields returned so the cockpit can reflect them. */
export interface VerifiedProfilePatch {
  readonly targetCloseDate?: string | undefined;
  readonly collateralSummary?: string | undefined;
  readonly customerType?: string | undefined;
  readonly industry?: string | undefined;
  readonly guarantorStructure?: string | undefined;
  readonly productType?: string | undefined;
  readonly loanStructure?: string | undefined;
  readonly pricingType?: string | undefined;
}

export type UpdateDealProfileOutcome =
  | { kind: 'updated'; dealId: string; correlationId: string; verified: VerifiedProfilePatch; changedLabels: readonly string[]; auditId: string | undefined }
  | { kind: 'unauthorized'; reason: string }
  | { kind: 'identity-unresolved'; reason: string }
  | { kind: 'invalid-input'; field: string; reason: string }
  | { kind: 'empty-patch'; reason: string }
  | { kind: 'write-failed'; error: string; correlationId: string }
  | { kind: 'readback-mismatch'; field: string; correlationId: string }
  | { kind: 'audit-failed'; auditError: string | undefined; correlationId: string; dealId: string };

function trimmed(v: string | undefined): string {
  return (v ?? '').trim();
}

/** Label → option-set integer for a choice field, or null when off-list. */
function choiceValue(options: Readonly<Record<number, string>>, label: string): number | null {
  for (const [k, v] of Object.entries(options)) {
    if (v === label) return Number(k);
  }
  return null;
}

/** Normalize a date to its calendar day for a format-tolerant readback compare. */
function dayKey(v: unknown): string | null {
  if (typeof v !== 'string' || v.trim().length === 0) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

const GUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Dataverse `_x_value` GUIDs come back lowercase, no braces; normalize both. */
function normalizeGuid(v: unknown): string {
  return typeof v === 'string' ? v.trim().replace(/[{}]/g, '').toLowerCase() : '';
}

interface PreparedReference {
  readonly field: DealReferenceLookupField;
  readonly cfg: DealReferenceLookupConfig;
  /** `/table(id)` to set, or null to clear. */
  readonly writeValue: string | null;
  /** The id to verify on readback, or null when cleared. */
  readonly readbackId: string | null;
  readonly displayValue: string | undefined;
}

/**
 * Validate + prepare one reference selection. The id MUST be GUID-shaped and
 * present in `allowedIds` (the ids loaded from the real reference list) — this
 * is what rejects arbitrary GUIDs. `null` clears the lookup.
 */
function prepareReference(
  field: DealReferenceLookupField,
  selection: DealReferenceSelection | null,
  allowedIds: ReadonlySet<string>,
): { ok: true; prepared: PreparedReference } | { ok: false; reason: string } {
  const cfg = DEAL_REFERENCE_LOOKUPS[field];
  if (selection === null) {
    return { ok: true, prepared: { field, cfg, writeValue: null, readbackId: null, displayValue: undefined } };
  }
  if (typeof selection !== 'object' || typeof selection.id !== 'string') {
    return { ok: false, reason: `${cfg.label} selection is malformed.` };
  }
  const id = selection.id.trim();
  if (!GUID_RE.test(id.replace(/[{}]/g, ''))) {
    return { ok: false, reason: `${cfg.label} selection is not a valid reference id.` };
  }
  if (!allowedIds.has(normalizeGuid(id))) {
    return {
      ok: false,
      reason: `The selected ${cfg.label} is not one of the loaded reference options.`,
    };
  }
  return {
    ok: true,
    prepared: {
      field,
      cfg,
      writeValue: `/${cfg.targetTable}(${id})`,
      readbackId: id,
      displayValue: (selection.name ?? '').trim() || undefined,
    },
  };
}

/** True when the readback row confirms the prepared reference persisted. */
function referenceReadbackConfirms(row: Record<string, unknown>, p: PreparedReference): boolean {
  const actual = row[p.cfg.readbackValueField];
  if (p.readbackId === null) {
    return actual === null || actual === undefined || actual === '';
  }
  return normalizeGuid(actual) === normalizeGuid(p.readbackId);
}

interface PreparedField {
  readonly field: DealProfileField;
  readonly spec: FieldSpec;
  /** Value written into the body (string, integer, or null to clear). */
  readonly writeValue: string | number | null;
  /** Verified-patch display value once readback confirms (undefined = cleared). */
  readonly displayValue: string | undefined;
}

/**
 * Validate + prepare one supplied patch field. Returns an `invalid-input`
 * outcome on any bad value, else the prepared write/display values.
 */
function prepareField(
  field: DealProfileField,
  raw: string | null,
): { ok: true; prepared: PreparedField } | { ok: false; reason: string } {
  const spec = DEAL_PROFILE_FIELD_SPECS[field];
  // null explicitly clears the field.
  if (raw === null) {
    return { ok: true, prepared: { field, spec, writeValue: null, displayValue: undefined } };
  }
  if (typeof raw !== 'string') {
    return { ok: false, reason: `${spec.label} must be a string or null.` };
  }
  const value = raw.trim();
  if (value.length === 0) {
    return { ok: false, reason: `${spec.label} must not be blank (use null to clear it).` };
  }
  switch (spec.kind) {
    case 'text':
      return { ok: true, prepared: { field, spec, writeValue: value, displayValue: value } };
    case 'date': {
      if (dayKey(value) === null) {
        return { ok: false, reason: `${spec.label} must be a valid date.` };
      }
      return { ok: true, prepared: { field, spec, writeValue: value, displayValue: value } };
    }
    case 'choice': {
      const num = choiceValue(spec.options!, value);
      if (num === null) {
        return { ok: false, reason: `"${value}" is not an allowed ${spec.label}.` };
      }
      return { ok: true, prepared: { field, spec, writeValue: num, displayValue: value } };
    }
  }
}

/** True when the readback row confirms the prepared field persisted. */
function readbackConfirms(row: Record<string, unknown>, p: PreparedField): boolean {
  const actual = row[p.spec.readKey];
  if (p.writeValue === null) {
    return actual === null || actual === undefined || actual === '';
  }
  switch (p.spec.kind) {
    case 'text':
      return typeof actual === 'string' && actual.trim() === p.writeValue;
    case 'date':
      return dayKey(actual) !== null && dayKey(actual) === dayKey(p.writeValue as string);
    case 'choice':
      return Number(actual) === p.writeValue;
  }
}

/**
 * Governed Deal Profile update. Pure given its injected deps.
 */
export async function updateDealProfile(
  input: UpdateDealProfileInput,
  deps: UpdateDealProfileDeps,
): Promise<UpdateDealProfileOutcome> {
  // 1. Fail-closed authorization.
  if (!input.authorized) {
    return { kind: 'unauthorized', reason: 'You are not authorized to update this deal.' };
  }
  const actorSystemUserId = trimmed(input.actorSystemUserId);
  if (actorSystemUserId.length === 0 || trimmed(input.actorEmail).length === 0) {
    return {
      kind: 'identity-unresolved',
      reason: 'No Dataverse identity is available for the signed-in user; nothing was saved.',
    };
  }

  // 2. Validate the deal id.
  const dealId = trimmed(input.dealId);
  if (dealId.length === 0) {
    return { kind: 'invalid-input', field: 'dealId', reason: 'No deal is in context; nothing was saved.' };
  }

  // 3. Reject unknown fields (defense in depth against untyped callers).
  const patch = input.patch ?? {};
  const allowed = new Set<string>(Object.keys(DEAL_PROFILE_FIELD_SPECS));
  const suppliedKeys = Object.keys(patch).filter((k) => patch[k as DealProfileField] !== undefined);
  const unknownKeys = suppliedKeys.filter((k) => !allowed.has(k));
  if (unknownKeys.length > 0) {
    return { kind: 'invalid-input', field: unknownKeys[0], reason: `Field "${unknownKeys[0]}" cannot be edited here.` };
  }

  // 3b. Reject unknown reference-lookup fields (only the three are allowed).
  const referencePatch = input.referencePatch ?? {};
  const allowedRefFields = new Set<string>(Object.keys(DEAL_REFERENCE_LOOKUPS));
  const suppliedRefKeys = Object.keys(referencePatch).filter(
    (k) => referencePatch[k as DealReferenceLookupField] !== undefined,
  );
  const unknownRefKeys = suppliedRefKeys.filter((k) => !allowedRefFields.has(k));
  if (unknownRefKeys.length > 0) {
    return { kind: 'invalid-input', field: unknownRefKeys[0], reason: `Reference field "${unknownRefKeys[0]}" cannot be edited here.` };
  }

  // 4. Reject an empty patch (no scalar AND no reference selections).
  if (suppliedKeys.length === 0 && suppliedRefKeys.length === 0) {
    return { kind: 'empty-patch', reason: 'No profile fields were provided to update.' };
  }

  // 5. Validate + prepare each supplied scalar field.
  const prepared: PreparedField[] = [];
  for (const key of suppliedKeys) {
    const field = key as DealProfileField;
    const result = prepareField(field, patch[field] as string | null);
    if (!result.ok) {
      return { kind: 'invalid-input', field, reason: result.reason };
    }
    prepared.push(result.prepared);
  }

  // 5b. Validate + prepare each reference selection against the loaded allow-list.
  const allowedIds = new Set<string>((input.allowedReferenceIds ?? []).map(normalizeGuid));
  const preparedRefs: PreparedReference[] = [];
  for (const key of suppliedRefKeys) {
    const field = key as DealReferenceLookupField;
    const result = prepareReference(field, referencePatch[field] as DealReferenceSelection | null, allowedIds);
    if (!result.ok) {
      return { kind: 'invalid-input', field, reason: result.reason };
    }
    preparedRefs.push(result.prepared);
  }

  const correlationId = newCorrelationId('dp');

  // 6. Build the allow-listed update body. Only approved write keys can appear.
  const body: Record<string, unknown> = {};
  for (const p of prepared) body[p.spec.writeKey] = p.writeValue;
  for (const p of preparedRefs) body[p.cfg.bindProperty] = p.writeValue;
  // Defense in depth: never write a forbidden column.
  for (const forbidden of DEAL_PROFILE_FORBIDDEN_COLUMNS) {
    if (forbidden in body) {
      return { kind: 'invalid-input', field: forbidden, reason: `Refusing to write protected field ${forbidden}.` };
    }
  }

  // 7. Update.
  let updated: DealProfileWriteResult;
  try {
    updated = await deps.updateDeal(dealId, body);
  } catch (err: unknown) {
    return { kind: 'write-failed', error: err instanceof Error ? err.message : String(err), correlationId };
  }
  if (!updated.success) {
    return { kind: 'write-failed', error: updated.error?.message ?? 'Deal update returned non-success.', correlationId };
  }

  // 8. Readback — the deal must now carry EXACTLY the values we wrote.
  let readback: DealProfileReadback;
  try {
    readback = await deps.readDeal(dealId);
  } catch (err: unknown) {
    return { kind: 'write-failed', error: err instanceof Error ? err.message : String(err), correlationId };
  }
  if (!readback.success || !readback.row) {
    const anyField = prepared[0]?.field ?? preparedRefs[0]?.field ?? 'dealId';
    return { kind: 'readback-mismatch', field: anyField, correlationId };
  }
  for (const p of prepared) {
    if (!readbackConfirms(readback.row, p)) {
      return { kind: 'readback-mismatch', field: p.field, correlationId };
    }
  }
  for (const p of preparedRefs) {
    if (!referenceReadbackConfirms(readback.row, p)) {
      return { kind: 'readback-mismatch', field: p.field, correlationId };
    }
  }

  const verified: VerifiedProfilePatch = {};
  const changedLabels: string[] = [];
  for (const p of prepared) {
    (verified as Record<string, string | undefined>)[p.field] = p.displayValue;
    changedLabels.push(p.spec.label);
  }
  for (const p of preparedRefs) {
    (verified as Record<string, string | undefined>)[p.field] = p.displayValue;
    changedLabels.push(p.cfg.label);
  }

  // 9. Audit the update (fail-closed cr664_ChangedBy resolution lives in the dep).
  let audit: { ok: boolean; id?: string; error?: string };
  try {
    audit = await deps.emitAudit({
      dealId,
      correlationId,
      changedLabels,
      actorEmail: input.actorEmail,
      actorSystemUserId,
    });
  } catch (err: unknown) {
    return { kind: 'audit-failed', auditError: err instanceof Error ? err.message : String(err), correlationId, dealId };
  }
  if (!audit.ok) {
    return { kind: 'audit-failed', auditError: audit.error, correlationId, dealId };
  }

  return { kind: 'updated', dealId, correlationId, verified, changedLabels, auditId: audit.id };
}
