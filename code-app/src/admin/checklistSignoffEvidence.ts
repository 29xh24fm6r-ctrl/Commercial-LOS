import { CHECKLIST_WRITE_ENABLED } from '../activation/checklistGenerationActivation';
import { DOCUMENT_CHECKLIST_GENERATION_ENABLED } from '../deals/dealOriginationFeatureFlags';

/**
 * Phase 249 — Document checklist lending-owner signoff evidence (READ-ONLY).
 *
 * The checklist generator modules + data source are present, but production use requires
 * a MANUAL lending-owner / Super-Admin signoff of the active rule-set. This module
 * provides the review checklist and a fail-closed signoff evidence model that stays
 * UNKNOWN until a complete, explicit signed artifact is recorded. It NEVER fabricates a
 * signoff and flips NO gate (CHECKLIST_WRITE_ENABLED / DOCUMENT_CHECKLIST_GENERATION_ENABLED
 * stay false here).
 */

/** The active checklist rule-set modules a lending owner reviews. */
export const ACTIVE_CHECKLIST_RULESET_MODULES = [
  'src/activation/checklistGenerationActivation.ts',
  'src/deals/newDealChecklistGenerationAdapter.ts',
  'src/deals/documentChecklistPilotViewModel.ts',
  'src/deals/documentChecklistUiEnableReadiness.ts',
] as const;

export interface ChecklistReviewCategory {
  readonly key: string;
  readonly label: string;
  readonly description: string;
}

/** The lending-owner review checklist (rule categories + coverage to confirm). */
export const CHECKLIST_REVIEW_CATEGORIES: readonly ChecklistReviewCategory[] = [
  { key: 'product-coverage', label: 'Product coverage', description: 'Every lending product in scope maps to the intended rule set (rules with empty products apply to all).' },
  { key: 'stage-coverage', label: 'Stage coverage', description: 'Every workflow stage that should generate items is covered (rules with empty stages apply to all).' },
  { key: 'determinism', label: 'Deterministic rules', description: 'Items derive only from product/stage rules — never model-generated, never fabricated; the preview equals the written items.' },
  { key: 'required-documents', label: 'Required-document completeness', description: 'The required documents per product/stage are present and labelled correctly.' },
  { key: 'duplicate-handling', label: 'Duplicate handling', description: 'Regenerating over an existing checklist is blocked unless an explicit override is supplied.' },
  { key: 'rollback', label: 'Rollback', description: 'A one-line disable (set DOCUMENT_CHECKLIST_GENERATION_ENABLED to false) is documented and understood.' },
];

/** A recorded lending-owner signoff. Every field is required for a valid signoff. */
export interface ChecklistRulesetSignoff {
  readonly approvedBy: string;
  readonly approverRole: string;
  readonly signedAtIso: string;
  readonly scope: string;
  readonly rulesetVersion: string;
  readonly rollback: string;
  readonly evidenceRef: string;
}

export const REQUIRED_SIGNOFF_FIELDS: readonly (keyof ChecklistRulesetSignoff)[] = [
  'approvedBy', 'approverRole', 'signedAtIso', 'scope', 'rulesetVersion', 'rollback', 'evidenceRef',
];

/**
 * OPERATOR-OWNED: the recorded signoff. `null` until a Super-Admin / lending owner records
 * a real signed artifact. NEVER set to a fabricated value to make the dashboard green.
 */
export const CHECKLIST_RULESET_SIGNOFF: ChecklistRulesetSignoff | null = null;

export type ChecklistSignoffStatus = 'SIGNED' | 'UNKNOWN';

export interface ChecklistSignoffValidation {
  readonly valid: boolean;
  readonly missing: readonly string[];
}

/** A signoff is valid only when every required field is present and non-empty. */
export function validateChecklistSignoff(signoff: ChecklistRulesetSignoff | null): ChecklistSignoffValidation {
  if (!signoff) return { valid: false, missing: ['no signoff recorded'] };
  const missing = REQUIRED_SIGNOFF_FIELDS.filter((f) => {
    const v = signoff[f];
    return typeof v !== 'string' || v.trim().length === 0;
  });
  return { valid: missing.length === 0, missing };
}

export interface ChecklistSignoffReadiness {
  readonly status: ChecklistSignoffStatus;
  readonly signed: boolean;
  readonly rulesetModules: readonly string[];
  readonly reviewCategories: readonly ChecklistReviewCategory[];
  readonly requiredSignoffFields: readonly string[];
  /** Live gate flags — both stay false here; this module never flips them. */
  readonly generationGateEnabled: boolean;
  readonly writeGateEnabled: boolean;
  /** The gate flip is a separate governed step; never performed by this evidence pack. */
  readonly gateFlipBlocked: boolean;
  readonly missingOperatorActions: readonly string[];
}

export function deriveChecklistSignoffReadiness(
  signoff: ChecklistRulesetSignoff | null = CHECKLIST_RULESET_SIGNOFF,
): ChecklistSignoffReadiness {
  const validation = validateChecklistSignoff(signoff);
  const signed = validation.valid;
  return {
    status: signed ? 'SIGNED' : 'UNKNOWN',
    signed,
    rulesetModules: ACTIVE_CHECKLIST_RULESET_MODULES,
    reviewCategories: CHECKLIST_REVIEW_CATEGORIES,
    requiredSignoffFields: REQUIRED_SIGNOFF_FIELDS as readonly string[],
    generationGateEnabled: Boolean(DOCUMENT_CHECKLIST_GENERATION_ENABLED),
    writeGateEnabled: Boolean(CHECKLIST_WRITE_ENABLED),
    // The gate stays controlled regardless of signoff — flipping is a separate governed action.
    gateFlipBlocked: true,
    missingOperatorActions: signed
      ? ['Signoff recorded. The DOCUMENT_CHECKLIST_GENERATION_ENABLED gate flip remains a separate governed step (not performed here).']
      : [
          'A Super-Admin / lending owner reviews the active rule-set modules against CHECKLIST_REVIEW_CATEGORIES and records a complete ChecklistRulesetSignoff (approver, role, signedAt, scope, ruleset version, rollback, evidence ref).',
          'Re-run scripts/activation/verify-checklist-rules.ps1; only after a recorded signoff may the governed DOCUMENT_CHECKLIST_GENERATION_ENABLED gate flip be considered.',
        ],
  };
}
