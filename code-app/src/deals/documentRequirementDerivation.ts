/**
 * Document requirement derivation — the source of truth for which documents
 * a deal requires, replacing the old hardcoded 3-name pilot list
 * (DOCUMENT_CHECKLIST_PILOT_APPROVED_NAMES). Pure and IO-free: given the
 * deal's already-authorized attributes, returns the set of document
 * requirements that currently apply.
 *
 * Requirements are keyed off deal type (customerType/loanStructure), product
 * (productType — including SBA-vs-conventional, see below), borrower
 * (industry — the only structured borrower attribute on DealDetail today),
 * guarantors (guarantorStructure), collateral (collateralSummary), and stage
 * (the canonical stage code, via recognizeCanonicalStage).
 *
 * Factory Arc Phase 7 asks this derivation to "ultimately include" deal type,
 * product, loan purpose, borrower legal structure, guarantor count/ownership%,
 * collateral types, construction status, SBA vs conventional, stage, and
 * exception rules. Status per factor, checked against the real DealDetail
 * shape (dealQueries.ts) and reference-data option sets before adding
 * anything, per this codebase's no-fake-data discipline:
 *   - deal type / product / collateral / stage: already used (see RULES below).
 *   - SBA vs conventional: NOW used — `productType` is a real, admin-managed
 *     reference-lookup field (AdminDealReferenceValues.tsx) whose live values
 *     already include "SBA 7(a)" / "SBA504" / "SBARefinance"
 *     (Cr664_dealtask1sModel.ts's option set, productProcessRegistry.ts) — a
 *     substring match on it is a real signal, not an invented one.
 *   - exception rules: NOW supported — `exceptions` (below) lets a caller
 *     exempt specific rule keys for a deal. The derivation itself has no
 *     concept of WHY (that belongs to whatever governed surface eventually
 *     collects the exception + its audit trail — out of scope here, this is
 *     just the mechanism).
 *   - "Purpose" (loanPurpose), borrower legal structure, guarantor count, and
 *     guarantor ownership % have NO dedicated DealDetail field today (verified
 *     against dealQueries.ts's DealDetail interface) — inventing a rule
 *     against data that doesn't exist would be exactly the "no fake data"
 *     violation this codebase's tests exist to catch. These four are declared
 *     on the input type below as explicitly optional and UNUSED by any rule
 *     yet, so the derivation is forward-compatible the moment a real field
 *     lands, without a breaking signature change. This mirrors the same
 *     documented-gap convention loanWorkflowRequirementEngine.ts uses for
 *     name-substring matching.
 *   - construction status has no rule either, for the same reason: no
 *     "construction" value exists anywhere in this repo's real product/
 *     loan-structure reference data (checked before writing this).
 *
 * v1 rule set. Like the retired pilot's approved-name list, this is a
 * starting lending rule set intended for lending-owner review before being
 * treated as final — see docs/operator-evidence/ for the sign-off precedent
 * this mirrors (checklistSignoffEvidence.ts). Extending the table (a new
 * rule) never requires touching the lifecycle/action/UI code.
 */

import { recognizeCanonicalStage } from '../workflow/stageOrderingContract';
import type { DocumentRequirementReviewLevel } from './documentRequirementLifecycle';

export interface DocumentRequirementDerivationInput {
  readonly productType: string | undefined;
  readonly loanStructure: string | undefined;
  readonly customerType: string | undefined;
  readonly guarantorStructure: string | undefined;
  readonly collateralSummary: string | undefined;
  readonly industry: string | undefined;
  /** The deal's current stage, as stored (code or ratified name); resolved via recognizeCanonicalStage. */
  readonly stage: string | undefined;
  /**
   * Rule keys (RequiredDocumentDefinition.key) to exempt for this deal — the
   * Phase 7 "exception rules" mechanism. A banker/admin surface that collects
   * a reason + audit trail for an exception is out of scope here; this is
   * only the derivation-layer plumbing that honors one once supplied.
   */
  readonly exceptions?: readonly string[];
  /**
   * Not yet sourced from any real DealDetail field (dealQueries.ts) — no rule
   * reads this today. Declared now so the derivation signature is
   * forward-compatible once a real "loan purpose" field exists; see the
   * header comment for why this isn't inferred from other text fields.
   */
  readonly loanPurpose?: string;
  /** Not yet sourced from any real DealDetail field — no rule reads this today. See header comment. */
  readonly borrowerLegalStructure?: string;
  /** Not yet sourced from any real DealDetail field — no rule reads this today. See header comment. */
  readonly guarantorCount?: number;
  /** Not yet sourced from any real DealDetail field — no rule reads this today. See header comment. */
  readonly maxGuarantorOwnershipPercent?: number;
}

export interface RequiredDocumentDefinition {
  /** Stable identity for the rule, independent of the display name. */
  readonly key: string;
  /** The exact display / persisted name (cr664_documentname). */
  readonly documentName: string;
  /** Human-readable reason this document applies to this deal (audit/UI transparency). */
  readonly reason: string;
  /** Whether "received" alone satisfies review, or a completed review is required. */
  readonly reviewLevel: DocumentRequirementReviewLevel;
}

interface DocumentRequirementRule {
  readonly key: string;
  readonly documentName: string;
  readonly reason: string;
  readonly reviewLevel: DocumentRequirementReviewLevel;
  /** Minimum canonical stage sequence at which this requirement is active (undefined = always). */
  readonly minStageSequence?: number;
  readonly appliesWhen: (input: DocumentRequirementDerivationInput) => boolean;
}

function includesAny(value: string | undefined, needles: readonly string[]): boolean {
  const v = (value ?? '').toLowerCase();
  if (v.length === 0) return false;
  return needles.some((n) => v.includes(n));
}

const UNDERWRITING_SEQUENCE = 20;

/**
 * v1 lending rule set. Every rule names the deal attribute(s) it keys off, so
 * the "must derive from deal type/product/borrower/guarantors/collateral/
 * purpose/stage" requirement is auditable rule-by-rule, not just in aggregate.
 */
const RULES: readonly DocumentRequirementRule[] = [
  {
    key: 'loan-application',
    documentName: 'Loan Application',
    reason: 'Required on every deal at intake.',
    reviewLevel: 'received',
    appliesWhen: () => true,
  },
  {
    key: 'signed-term-sheet',
    documentName: 'Signed Term Sheet',
    reason: 'Required on every deal once underwriting begins.',
    reviewLevel: 'received',
    minStageSequence: UNDERWRITING_SEQUENCE,
    appliesWhen: () => true,
  },
  {
    key: 'business-financial-statements',
    documentName: 'Business Financial Statements',
    reason: 'Required for the borrowing business once underwriting begins.',
    reviewLevel: 'reviewed',
    minStageSequence: UNDERWRITING_SEQUENCE,
    appliesWhen: () => true,
  },
  {
    key: 'business-tax-returns',
    documentName: 'Business Tax Returns',
    reason: 'Required for the borrowing business once underwriting begins.',
    reviewLevel: 'reviewed',
    minStageSequence: UNDERWRITING_SEQUENCE,
    appliesWhen: () => true,
  },
  {
    key: 'personal-financial-statement',
    documentName: 'Personal Financial Statement',
    reason: 'Guarantor structure indicates one or more personal/individual guarantors.',
    reviewLevel: 'reviewed',
    minStageSequence: UNDERWRITING_SEQUENCE,
    appliesWhen: (i) => includesAny(i.guarantorStructure, ['personal', 'individual']),
  },
  {
    key: 'personal-tax-returns',
    documentName: 'Personal Tax Returns',
    reason: 'Guarantor structure indicates one or more personal/individual guarantors.',
    reviewLevel: 'reviewed',
    minStageSequence: UNDERWRITING_SEQUENCE,
    appliesWhen: (i) => includesAny(i.guarantorStructure, ['personal', 'individual']),
  },
  {
    key: 'debt-schedule',
    documentName: 'Debt Schedule',
    reason: 'Product is a term-structured facility.',
    reviewLevel: 'reviewed',
    minStageSequence: UNDERWRITING_SEQUENCE,
    appliesWhen: (i) => includesAny(i.productType, ['term']) || includesAny(i.loanStructure, ['term']),
  },
  {
    key: 'borrowing-base-certificate',
    documentName: 'Borrowing Base Certificate',
    reason: 'Product is a revolving / line-of-credit facility.',
    reviewLevel: 'reviewed',
    minStageSequence: UNDERWRITING_SEQUENCE,
    appliesWhen: (i) => includesAny(i.productType, ['revolving', 'line of credit', 'loc']),
  },
  {
    key: 'appraisal-report',
    documentName: 'Appraisal Report',
    reason: 'Collateral includes real estate / property.',
    reviewLevel: 'reviewed',
    minStageSequence: UNDERWRITING_SEQUENCE,
    appliesWhen: (i) => includesAny(i.collateralSummary, ['real estate', 'property', 'building', 'land']),
  },
  {
    key: 'title-report',
    documentName: 'Title Report',
    reason: 'Collateral includes real estate / property.',
    reviewLevel: 'reviewed',
    minStageSequence: UNDERWRITING_SEQUENCE,
    appliesWhen: (i) => includesAny(i.collateralSummary, ['real estate', 'property', 'building', 'land']),
  },
  {
    key: 'equipment-list-and-invoices',
    documentName: 'Equipment List and Invoices',
    reason: 'Collateral includes equipment.',
    reviewLevel: 'reviewed',
    minStageSequence: UNDERWRITING_SEQUENCE,
    appliesWhen: (i) => includesAny(i.collateralSummary, ['equipment', 'machinery']),
  },
  {
    key: 'ownership-information',
    documentName: 'Ownership Information',
    reason: 'Required for the borrowing entity once underwriting begins.',
    reviewLevel: 'reviewed',
    minStageSequence: UNDERWRITING_SEQUENCE,
    appliesWhen: (i) => includesAny(i.customerType, ['c&i', 'commercial', 'industrial']),
  },
  {
    key: 'sba-borrower-information-form',
    documentName: 'SBA Form 1919 (Borrower Information Form)',
    reason: 'Product is an SBA-guaranteed facility.',
    reviewLevel: 'reviewed',
    minStageSequence: UNDERWRITING_SEQUENCE,
    appliesWhen: (i) => includesAny(i.productType, ['sba']),
  },
  {
    key: 'sba-statement-of-personal-history',
    documentName: 'SBA Form 912 (Statement of Personal History)',
    reason: 'Product is an SBA-guaranteed facility.',
    reviewLevel: 'reviewed',
    minStageSequence: UNDERWRITING_SEQUENCE,
    appliesWhen: (i) => includesAny(i.productType, ['sba']),
  },
];

function stageSequence(stage: string | undefined): number | undefined {
  return recognizeCanonicalStage(stage)?.sequence;
}

/**
 * Derive the currently-applicable required documents for a deal. Deterministic
 * (same input -> same output), no IO, no invented documents beyond this rule
 * table. A rule with an unresolved `minStageSequence` gate (stage not
 * canonical / not yet seeded) is excluded rather than guessed active — fail
 * closed, matching this codebase's stage-ordering convention. A rule key
 * listed in `input.exceptions` is skipped regardless of whether it would
 * otherwise apply — the Phase 7 exception mechanism.
 */
export function deriveRequiredDocuments(
  input: DocumentRequirementDerivationInput,
): readonly RequiredDocumentDefinition[] {
  const currentSequence = stageSequence(input.stage);
  const exceptions = new Set(input.exceptions ?? []);
  const results: RequiredDocumentDefinition[] = [];
  const seen = new Set<string>();
  for (const rule of RULES) {
    if (exceptions.has(rule.key)) continue;
    if (rule.minStageSequence !== undefined) {
      if (currentSequence === undefined || currentSequence < rule.minStageSequence) continue;
    }
    if (!rule.appliesWhen(input)) continue;
    const dedupeKey = rule.documentName.trim().toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    results.push({
      key: rule.key,
      documentName: rule.documentName,
      reason: rule.reason,
      reviewLevel: rule.reviewLevel,
    });
  }
  return results;
}
