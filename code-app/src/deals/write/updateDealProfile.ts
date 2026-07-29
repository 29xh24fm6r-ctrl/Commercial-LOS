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
 *   - amount               (currency)      → cr664_amount
 *   - targetCloseDate      (date)          → cr664_targetclosedate
 *   - collateralSummary    (text)          → cr664_collateralsummary
 *   - customerType         (choice enum)   → cr664_customertype
 *   - industry             (choice enum)   → cr664_industry
 *   - guarantorStructure   (choice enum)   → cr664_guarantorstructure
 *   - amortizationMonths   (integer)       → cr664_amortizationmonths
 *   - loanPurpose          (text, <=200)   → cr664_loanpurpose
 *   - loanTermMonths       (integer)       → cr664_loantermmonths
 *   - ownershipStructure   (text, <=100)   → cr664_ownershipstructure
 *   - riskRatingInputs                (text, <=1048576) → cr664_riskratinginputs
 *   - underwritingRecommendationInputs (text, <=1048576) → cr664_underwritingrecommendationinputs
 *
 * Loan amount (cr664_amount) is a mandatory Intake exit criterion, so it is edited here through
 * the same governed authorize→validate→update→readback→audit discipline (the live-smoke gap: no
 * supported UI path to populate it). Deliberately still OUT of scope: stage, status, banker, and
 * the Client lookup (Phase 2 projects the verified CRM client). productType / loanStructure
 * / pricingType are reference LOOKUPS, editable via DEAL_REFERENCE_LOOKUPS below.
 *
 * Remediation 2026-07-22 (Workstream E) added amortizationMonths — cr664_amortizationmonths
 * already exists live on cr664_loandeals but had no read/write path anywhere in the app. No
 * schema change; the field spec just never covered it.
 *
 * Factory Arc Phase 3 added loanPurpose / loanTermMonths / ownershipStructure — the three
 * PR105-migration columns (see scripts/schema-migrations/pr105-loan-structure/columns.mjs and
 * docs/factory-arc/PR114_LOAN_DEAL_SDK_REGENERATION_ESCALATION.md). These are plain
 * String/Integer columns, not option sets, so they are written/read by raw column name below
 * rather than through a generated enum import — the generated Cr664_loandealsModel.ts does not
 * declare them yet (pending the operator-run `pac code` regeneration Phase 2 escalated), but
 * Cr664_loandealsService.update/get pass the update body and retrieved row through as untyped
 * Record<string, unknown>, so a real live column round-trips correctly today without waiting on
 * codegen. If the columns turn out not to exist live, the write fails honestly via the existing
 * write-failed outcome — nothing here assumes success. Deliberately NOT added to
 * PROFILE_COMPLETENESS_FIELDS in this phase — that catalog documents itself as requiring a
 * separate, deliberate reviewer decision per field; extend it in its own reviewed change once
 * these three have live signal for how bankers actually use them.
 *
 * Factory Arc Phase 4 added globalCashFlowInputs — cr664_financialspreadinputs, a Memo (JSON)
 * column specced in scripts/schema-migrations/pr105-loan-structure/columns.mjs. Same technique as
 * Factory Arc Phase 3: written/read by raw column name (not a generated enum import) since
 * Cr664_loandealsModel.ts does not declare it yet, pending the operator-run `pac code`
 * regeneration (docs/factory-arc/PR114_LOAN_DEAL_SDK_REGENERATION_ESCALATION.md); the update/get
 * calls already pass bodies/rows through as untyped Record<string, unknown>, so the real live
 * column round-trips correctly today. The JSON payload itself is
 * GlobalCashFlowPanel.tsx's serialized GlobalCashFlowFormState (see globalCashFlow.ts); this
 * adapter only sees an opaque string, bounded by the column's real 1,048,576-char Memo ceiling.
 *
 * Factory Arc Phase 5 added riskRatingInputs / underwritingRecommendationInputs — the two PR106
 * Memo (JSON) columns (scripts/schema-migrations/pr106-risk-rating/columns.mjs), same raw-column-
 * name technique as Phase 3/4. Persisting these records does NOT flip either fact's
 * `tracked: false` status in the CREDIT_APPROVAL requirement registry (workflow/
 * underwritingDeepFacts.ts) — that stays a separate, explicitly-reviewed decision.
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
import {
  deriveRiskRatingRecordFromDeal,
  evaluateRiskRatingReadiness,
  parseRiskRatingFormState,
  parseUnderwritingRecommendationFormState,
} from '../../workflow/underwritingDeepFacts';

/** The editable scalar / option-set profile fields this phase governs. */
export type DealProfileField =
  | 'amount'
  | 'targetCloseDate'
  | 'collateralSummary'
  | 'customerType'
  | 'industry'
  | 'guarantorStructure'
  | 'amortizationMonths'
  | 'loanPurpose'
  | 'loanTermMonths'
  | 'ownershipStructure'
  | 'globalCashFlowInputs'
  | 'riskRatingInputs'
  | 'underwritingRecommendationInputs'
  | 'crmIndustryProjectionInputs';

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

type FieldKind = 'text' | 'date' | 'choice' | 'number' | 'integer';

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
  /** Hard character ceiling for 'text' fields (matches the live column's max length). Undefined = no cap. */
  readonly maxLength?: number;
}

/** The ONLY fields this adapter may write. Anything else is rejected. */
export const DEAL_PROFILE_FIELD_SPECS: Readonly<Record<DealProfileField, FieldSpec>> = {
  amount: { kind: 'number', writeKey: 'cr664_amount', readKey: 'cr664_amount', label: 'Loan amount' },
  targetCloseDate: { kind: 'date', writeKey: 'cr664_targetclosedate', readKey: 'cr664_targetclosedate', label: 'Target close date' },
  collateralSummary: { kind: 'text', writeKey: 'cr664_collateralsummary', readKey: 'cr664_collateralsummary', label: 'Collateral' },
  customerType: { kind: 'choice', writeKey: 'cr664_customertype', readKey: 'cr664_customertype', options: Cr664_loandealscr664_customertype, label: 'Customer type' },
  industry: { kind: 'choice', writeKey: 'cr664_industry', readKey: 'cr664_industry', options: Cr664_loandealscr664_industry, label: 'Industry' },
  guarantorStructure: { kind: 'choice', writeKey: 'cr664_guarantorstructure', readKey: 'cr664_guarantorstructure', options: Cr664_loandealscr664_guarantorstructure, label: 'Guarantor structure' },
  amortizationMonths: { kind: 'integer', writeKey: 'cr664_amortizationmonths', readKey: 'cr664_amortizationmonths', label: 'Amortization (months)' },
  loanPurpose: { kind: 'text', writeKey: 'cr664_loanpurpose', readKey: 'cr664_loanpurpose', label: 'Loan Purpose', maxLength: 200 },
  loanTermMonths: { kind: 'integer', writeKey: 'cr664_loantermmonths', readKey: 'cr664_loantermmonths', label: 'Loan Term (months)' },
  ownershipStructure: { kind: 'text', writeKey: 'cr664_ownershipstructure', readKey: 'cr664_ownershipstructure', label: 'Ownership Structure', maxLength: 100 },
  globalCashFlowInputs: { kind: 'text', writeKey: 'cr664_financialspreadinputs', readKey: 'cr664_financialspreadinputs', label: 'Global Cash Flow inputs', maxLength: 1_048_576 },
  riskRatingInputs: { kind: 'text', writeKey: 'cr664_riskratinginputs', readKey: 'cr664_riskratinginputs', label: 'Risk Rating inputs', maxLength: 1_048_576 },
  underwritingRecommendationInputs: { kind: 'text', writeKey: 'cr664_underwritingrecommendationinputs', readKey: 'cr664_underwritingrecommendationinputs', label: 'Underwriting Recommendation inputs', maxLength: 1_048_576 },
  crmIndustryProjectionInputs: { kind: 'text', writeKey: 'cr664_crmindustryprojection', readKey: 'cr664_crmindustryprojection', label: 'CRM Industry Projection', maxLength: 1_048_576 },
};

/**
 * Fields that MUST NEVER be writable through this adapter (defense in depth). Stage/status are
 * moved only through the governed stage-advance write; banker/client are lookups set by their own
 * governed link flows. (Loan amount is now an approved, governed profile edit — see the specs.)
 */
export const DEAL_PROFILE_FORBIDDEN_COLUMNS = Object.freeze([
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

/**
 * Final LOS Completion arc — Workstream K. `riskRatingInputs` / `underwritingRecommendationInputs`
 * saves previously emitted an audit row but no timeline event — a genuine gap confirmed by direct
 * investigation (see docs/final-completion/FINAL_REMAINING_GAP_LEDGER.md §7). `field` distinguishes
 * which of the two changed, so the caller can title/subtype the event correctly; `updateDealProfile`
 * only invokes this dep for these two fields, never for the other, unrelated profile fields this
 * function also writes.
 */
export type DealProfileTimelineField = 'riskRatingInputs' | 'underwritingRecommendationInputs';

export interface EmitDealProfileTimelineInput {
  readonly dealId: string;
  readonly correlationId: string;
  readonly field: DealProfileTimelineField;
  readonly actorEmail: string | undefined;
  readonly actorSystemUserId: string;
}

export interface UpdateDealProfileDeps {
  readonly updateDeal: (dealId: string, body: Record<string, unknown>) => Promise<DealProfileWriteResult>;
  readonly readDeal: (dealId: string) => Promise<DealProfileReadback>;
  readonly emitAudit: (input: EmitDealProfileAuditInput) => Promise<{ ok: boolean; id?: string; error?: string }>;
  /**
   * Optional ONLY so hand-built test doubles predating Workstream K keep compiling without edits —
   * `updateDealProfile` calls it (when supplied) exclusively for the two Workstream K fields above;
   * an omitted dep is equivalent to "timeline emission unavailable," never fabricated as succeeded.
   */
  readonly emitTimeline?: (input: EmitDealProfileTimelineInput) => Promise<{ ok: boolean; id?: string; error?: string }>;
}

/** The verified, updated fields returned so the cockpit can reflect them. */
export interface VerifiedProfilePatch {
  /** Numeric so the cockpit's currency formatter + completeness check consume it directly. */
  readonly amount?: number | undefined;
  readonly targetCloseDate?: string | undefined;
  readonly collateralSummary?: string | undefined;
  readonly customerType?: string | undefined;
  readonly industry?: string | undefined;
  readonly guarantorStructure?: string | undefined;
  readonly productType?: string | undefined;
  readonly loanStructure?: string | undefined;
  readonly pricingType?: string | undefined;
  /** Numeric so callers can render it directly (months), same convention as `amount`. */
  readonly amortizationMonths?: number | undefined;
  readonly loanPurpose?: string | undefined;
  /** Numeric, same convention as `amortizationMonths`. */
  readonly loanTermMonths?: number | undefined;
  readonly ownershipStructure?: string | undefined;
  /** Opaque serialized GlobalCashFlowFormState JSON — see globalCashFlow.ts. */
  readonly globalCashFlowInputs?: string | undefined;
  /** Opaque serialized RiskRatingFormState JSON — see workflow/underwritingDeepFacts.ts. */
  readonly riskRatingInputs?: string | undefined;
  /** Opaque serialized UnderwritingRecommendationFormState JSON — see workflow/underwritingDeepFacts.ts. */
  readonly underwritingRecommendationInputs?: string | undefined;
  /** Opaque serialized CrmIndustryProjectionRecord JSON — see crmIndustryProjectionRecord.ts. */
  readonly crmIndustryProjectionInputs?: string | undefined;
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
      if (spec.maxLength !== undefined && value.length > spec.maxLength) {
        return { ok: false, reason: `${spec.label} must be ${spec.maxLength} characters or fewer.` };
      }
      return { ok: true, prepared: { field, spec, writeValue: value, displayValue: value } };
    case 'number': {
      // Accept a plain or lightly-formatted amount ("2500000", "2,500,000", "$2,500,000").
      const n = Number(value.replace(/[$,\s]/g, ''));
      if (!Number.isFinite(n) || n <= 0) {
        return { ok: false, reason: `${spec.label} must be a positive dollar amount.` };
      }
      if (n > 1e15) {
        return { ok: false, reason: `${spec.label} is implausibly large; check the value.` };
      }
      return { ok: true, prepared: { field, spec, writeValue: n, displayValue: String(n) } };
    }
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
    case 'integer': {
      // Whole months only; a 50-year (600-month) cap rejects nonsensical values without
      // fabricating a "real" business-rule ceiling this schema doesn't define.
      const n = Number(value.replace(/[,\s]/g, ''));
      if (!Number.isInteger(n) || n <= 0) {
        return { ok: false, reason: `${spec.label} must be a positive whole number of months.` };
      }
      if (n > 600) {
        return { ok: false, reason: `${spec.label} is implausibly large; check the value.` };
      }
      return { ok: true, prepared: { field, spec, writeValue: n, displayValue: String(n) } };
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
    case 'number': {
      // Currency readback: tolerate rounding to the cent.
      const got = Number(actual);
      return Number.isFinite(got) && Math.abs(got - (p.writeValue as number)) < 0.005;
    }
    case 'date':
      return dayKey(actual) !== null && dayKey(actual) === dayKey(p.writeValue as string);
    case 'choice':
      return Number(actual) === p.writeValue;
    case 'integer':
      return Number(actual) === p.writeValue;
  }
}

/**
 * Final deep facts may not cross the generic profile write boundary incomplete.
 * Drafts remain saveable so bankers can work incrementally; assigned/recorded
 * facts require rationale, actor, timestamp, and exact deal linkage.
 */
function validateDeepFactPayload(
  field: DealProfileField,
  value: string | null,
  dealId: string,
): string | undefined {
  if (value === null) return undefined;
  if (field === 'riskRatingInputs') {
    const form = parseRiskRatingFormState(value);
    if (form.status === 'draft') return undefined;
    const readiness = evaluateRiskRatingReadiness(
      deriveRiskRatingRecordFromDeal({ riskRatingInputsJson: value }),
      dealId,
    );
    return readiness.met ? undefined : readiness.reason;
  }
  if (field === 'underwritingRecommendationInputs') {
    const form = parseUnderwritingRecommendationFormState(value);
    if (form.status === 'draft') return undefined;
    if (form.rationale.trim().length === 0) return 'Underwriting recommendation has no rationale recorded.';
    if (form.underwriterActor.trim().length === 0) return 'Underwriting recommendation has no recorded underwriter.';
    if (form.recordedAtIso.trim().length === 0) return 'Underwriting recommendation has no recorded timestamp.';
    if (form.dealId !== dealId) return 'Underwriting recommendation record does not match this deal.';
  }
  return undefined;
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
    const deepFactReason = validateDeepFactPayload(
      field,
      patch[field] as string | null,
      dealId,
    );
    if (deepFactReason) {
      return { kind: 'invalid-input', field, reason: deepFactReason };
    }
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
    if (p.spec.kind === 'number' || p.spec.kind === 'integer') {
      // Project the numeric value so the cockpit's currency/count formatting reads it directly.
      (verified as Record<string, number | undefined>)[p.field] =
        p.writeValue === null ? undefined : (p.writeValue as number);
    } else {
      (verified as Record<string, string | undefined>)[p.field] = p.displayValue;
    }
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

  // 10. Final LOS Completion arc — Workstream K: risk rating / underwriting recommendation saves
  // now also emit a timeline event, closing a confirmed gap (the audit above already fires for
  // every profile field; only these two genuinely lacked ANY timeline signal). Best-effort and
  // never blocks the outcome — the write + audit above already succeeded and are the authoritative
  // record; a timeline emission failure here is not surfaced as a write failure, same as this
  // function already tolerates `emitTimeline` being entirely absent.
  const timelineFields: readonly DealProfileTimelineField[] = prepared
    .map((p) => p.field)
    .filter((f): f is DealProfileTimelineField => f === 'riskRatingInputs' || f === 'underwritingRecommendationInputs');
  if (deps.emitTimeline) {
    for (const field of timelineFields) {
      try {
        await deps.emitTimeline({ dealId, correlationId, field, actorEmail: input.actorEmail, actorSystemUserId });
      } catch {
        // Best-effort — see the comment above.
      }
    }
  }

  return { kind: 'updated', dealId, correlationId, verified, changedLabels, auditId: audit.id };
}
