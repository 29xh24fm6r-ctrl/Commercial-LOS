/**
 * Document requirement derivation — the source of truth for which documents
 * a deal requires, replacing the old hardcoded 3-name pilot list
 * (DOCUMENT_CHECKLIST_PILOT_APPROVED_NAMES). Pure and IO-free: given the
 * deal's already-authorized attributes, returns the set of document
 * requirements that currently apply.
 *
 * Requirements are keyed off deal type (customerType/loanStructure), product
 * (productType), borrower (industry — the only structured borrower attribute
 * on DealDetail today), guarantors (guarantorStructure), collateral
 * (collateralSummary), and stage (the canonical stage code, via
 * recognizeCanonicalStage). "Purpose" has no dedicated DealDetail field yet;
 * until one exists, purpose-driven rules infer from productType/loanStructure
 * text — this is documented explicitly rather than silently assumed, the same
 * honesty convention the rest of this codebase uses for name-substring
 * matching (see loanWorkflowRequirementEngine.ts).
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
];

function stageSequence(stage: string | undefined): number | undefined {
  return recognizeCanonicalStage(stage)?.sequence;
}

/**
 * Derive the currently-applicable required documents for a deal. Deterministic
 * (same input -> same output), no IO, no invented documents beyond this rule
 * table. A rule with an unresolved `minStageSequence` gate (stage not
 * canonical / not yet seeded) is excluded rather than guessed active — fail
 * closed, matching this codebase's stage-ordering convention.
 */
export function deriveRequiredDocuments(
  input: DocumentRequirementDerivationInput,
): readonly RequiredDocumentDefinition[] {
  const currentSequence = stageSequence(input.stage);
  const results: RequiredDocumentDefinition[] = [];
  const seen = new Set<string>();
  for (const rule of RULES) {
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
