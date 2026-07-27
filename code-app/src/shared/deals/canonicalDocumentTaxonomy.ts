import type { AnnualReviewDocumentType } from '../annualReview/annualReviewTypes';
import type { PortfolioLoanDocumentType } from '../portfolioBoarding/portfolioLoanBoardingTypes';

/**
 * Final LOS Completion arc — Workstream B. Canonical borrower-document taxonomy.
 *
 * This codebase has SIX independently-declared document vocabularies (see
 * docs/final-completion/FINAL_REMAINING_GAP_LEDGER.md §5 for the full inventory): the Document
 * Requirements panel (`documentRequirementDerivation.ts`, exact-normalized-string match), the Stage
 * Map gate engine (`loanWorkflowStages.ts` / `loanWorkflowRequirementEngine.ts`, substring
 * `.includes()` match), the retired pilot list (dead), Portfolio Boarding's 43-key
 * `PortfolioLoanDocumentType`, Annual Review's 13-key `AnnualReviewDocumentType`, and the unrouted
 * Product/Process template registry. A prior investigation (this arc, Workstream B research pass)
 * confirmed a genuine cross-system spelling drift: Annual Review's `'annual_financial_statements'`
 * and Portfolio Boarding's `'financial_statements'` are meant to be the same real-world document but
 * cannot be recognized as such by a plain string-equality check.
 *
 * SCOPE, deliberately narrow: this module introduces ONE canonical, additive borrower-document
 * taxonomy and maps the two TYPED-ENUM vocabularies (Annual Review, Portfolio Boarding) onto it — the
 * two consumers a prior investigation confirmed are pure, IO-free, static catalogs with no live gate
 * behavior to accidentally change. It deliberately does NOT touch:
 *   - `loanWorkflowRules.ts` / `loanWorkflowRequirementEngine.ts`'s substring-match document gates
 *     (these gate real stage-advance writes; a canonical-key cutover here is a separately-reviewed
 *     change, not something to fold in silently — see the FINAL_REMAINING_GAP_LEDGER's discipline on
 *     this exact point).
 *   - `documentRequirementReconciliation.ts` / `documentRequirementBlockerMerge.ts` (the Document
 *     Requirements panel's exact-match reconciliation) — also live and gating, same reasoning.
 *   - `closingDocumentTemplateRegistry.ts` — a genuinely different universe (internal closing
 *     artifacts, not borrower-supplied documents).
 *   - `documentChecklistPilotConfig.ts` — confirmed dead/retired, nothing to wire.
 *   - `productProcessTemplateRegistry.ts` — confirmed unrouted (`intentionallyUnrouted.ts`) and
 *     non-gating; no urgency to wire it.
 *
 * SCOPING CALL, disclosed rather than silently applied: Portfolio Boarding's 43 keys mix
 * borrower-collectible documents with lender-internal/governance/servicing artifacts (approval
 * memos, board approvals, participation agreements, servicing notes, site visits, correspondence)
 * and legal collateral-perfection instruments (security agreements, UCC filings, mortgages,
 * assignments of rents, lease agreements). Those are a different universe by design — forcing them
 * into a "borrower document" bucket would misrepresent internal governance/legal artifacts as things
 * to request from a customer. `canonicalDocumentKeyForPortfolioBoardingType` returns `undefined` for
 * all of them, on purpose, never fabricating a canonical mapping that doesn't exist.
 *
 * FIDELITY-LOSS DISCLOSURE: five of the 20 canonical keys below are themselves a deliberate
 * compression of multiple genuinely distinct documents (see each key's own comment). This is an
 * honest tradeoff for a 20-key taxonomy, not a hidden one — a lossless taxonomy spanning everything
 * in scope today would run closer to 28-30 keys.
 *
 * POLICY CONVENTION (not a derived fact): Annual Review and Portfolio Boarding each carry a single,
 * undifferentiated `tax_returns` key, while the origination-side Document Requirements panel
 * already splits business vs. personal tax returns into two distinct rules. There is no reliable way
 * to derive which one a bare `tax_returns` value means. This module adopts the convention that an
 * undifferentiated `tax_returns` value means the BUSINESS'S tax returns (`business_tax_returns`) —
 * a defensible default, not an assured fact — because both source systems are lender/portfolio-side
 * systems of record that track the business's own financial picture as their primary subject.
 */

export type CanonicalDocumentKey =
  | 'loan_application'
  | 'term_sheet'
  | 'commitment_letter'
  /** Compresses the promissory note AND the loan agreement contract (Portfolio Boarding tracks
   *  these as two/three separate keys: `note`, `loan_agreement`, `business_loan_agreement`). */
  | 'loan_agreement'
  | 'business_financial_statements'
  | 'interim_financial_statements'
  | 'business_tax_returns'
  | 'personal_tax_returns'
  | 'personal_financial_statement'
  | 'guarantor_financials'
  | 'debt_schedule'
  | 'borrowing_base_certificate'
  /** Compresses AR aging, AP aging, and inventory report — three schedules with different
   *  cadences/owners in real underwriting, tracked separately upstream. */
  | 'borrowing_base_support_schedules'
  /** Compresses entity formation documents, the secretary's certificate, and the borrowing
   *  resolution — three distinct corporate-governance instruments. */
  | 'ownership_entity_documents'
  /** Compresses appraisal, title policy, environmental report, flood determination, and rent
   *  roll — five different third-party vendor deliverables with different staleness policies. */
  | 'real_estate_collateral_evidence'
  | 'equipment_collateral_documentation'
  | 'insurance_evidence'
  | 'guaranty'
  /** Compresses SBA Form 1919, SBA Form 912, and Portfolio Boarding's `sba_authorization` /
   *  `sba_guarantee` — four distinct SBA forms/instruments. */
  | 'sba_program_documents'
  | 'covenant_compliance_certificate';

export interface CanonicalDocumentDefinition {
  readonly key: CanonicalDocumentKey;
  readonly label: string;
  readonly legacyAliases: {
    readonly annualReview: readonly AnnualReviewDocumentType[];
    readonly portfolioBoarding: readonly PortfolioLoanDocumentType[];
  };
}

export const CANONICAL_DOCUMENT_TAXONOMY: readonly CanonicalDocumentDefinition[] = [
  { key: 'loan_application', label: 'Loan Application', legacyAliases: { annualReview: [], portfolioBoarding: [] } },
  { key: 'term_sheet', label: 'Signed Term Sheet', legacyAliases: { annualReview: [], portfolioBoarding: [] } },
  { key: 'commitment_letter', label: 'Commitment Letter', legacyAliases: { annualReview: [], portfolioBoarding: ['commitment_letter'] } },
  { key: 'loan_agreement', label: 'Loan Agreement (incl. Promissory Note)', legacyAliases: { annualReview: [], portfolioBoarding: ['note', 'loan_agreement', 'business_loan_agreement'] } },
  { key: 'business_financial_statements', label: 'Business Financial Statements', legacyAliases: { annualReview: ['annual_financial_statements'], portfolioBoarding: ['financial_statements'] } },
  { key: 'interim_financial_statements', label: 'Interim Financial Statements', legacyAliases: { annualReview: ['interim_financial_statements'], portfolioBoarding: ['interim_financials'] } },
  { key: 'business_tax_returns', label: 'Business Tax Returns', legacyAliases: { annualReview: ['tax_returns'], portfolioBoarding: ['tax_returns'] } },
  { key: 'personal_tax_returns', label: 'Personal Tax Returns', legacyAliases: { annualReview: [], portfolioBoarding: [] } },
  { key: 'personal_financial_statement', label: 'Personal Financial Statement', legacyAliases: { annualReview: ['personal_financial_statement'], portfolioBoarding: [] } },
  { key: 'guarantor_financials', label: 'Guarantor Financials (ongoing reporting)', legacyAliases: { annualReview: ['guarantor_financials'], portfolioBoarding: [] } },
  { key: 'debt_schedule', label: 'Debt Schedule', legacyAliases: { annualReview: [], portfolioBoarding: [] } },
  { key: 'borrowing_base_certificate', label: 'Borrowing Base Certificate', legacyAliases: { annualReview: ['borrowing_base_certificate'], portfolioBoarding: ['borrowing_base_certificate'] } },
  { key: 'borrowing_base_support_schedules', label: 'AR/AP Aging & Inventory Reports', legacyAliases: { annualReview: ['ar_aging', 'ap_aging', 'inventory_report'], portfolioBoarding: ['ar_aging', 'ap_aging', 'inventory_report'] } },
  { key: 'ownership_entity_documents', label: 'Ownership / Entity Documents', legacyAliases: { annualReview: [], portfolioBoarding: ['entity_formation', 'secretary_certificate', 'borrowing_resolution'] } },
  { key: 'real_estate_collateral_evidence', label: 'Real Estate Collateral Evidence', legacyAliases: { annualReview: ['rent_roll'], portfolioBoarding: ['appraisal', 'title_policy', 'environmental_report', 'flood_determination', 'rent_roll'] } },
  { key: 'equipment_collateral_documentation', label: 'Equipment List & Invoices', legacyAliases: { annualReview: [], portfolioBoarding: [] } },
  { key: 'insurance_evidence', label: 'Insurance Evidence', legacyAliases: { annualReview: ['insurance_evidence'], portfolioBoarding: ['insurance_evidence'] } },
  { key: 'guaranty', label: 'Guaranty', legacyAliases: { annualReview: [], portfolioBoarding: ['guaranty'] } },
  { key: 'sba_program_documents', label: 'SBA Program Documents', legacyAliases: { annualReview: [], portfolioBoarding: ['sba_authorization', 'sba_guarantee'] } },
  { key: 'covenant_compliance_certificate', label: 'Covenant Compliance Certificate', legacyAliases: { annualReview: ['covenant_compliance_certificate'], portfolioBoarding: ['covenant_compliance_certificate'] } },
];

/**
 * Portfolio Boarding keys deliberately left unmapped (return `undefined` from
 * `canonicalDocumentKeyForPortfolioBoardingType`) — a different universe by design, not a gap. Listed
 * here explicitly (rather than left as an implicit "everything else") so a test can assert every one
 * of the 43 `PortfolioLoanDocumentType` values is accounted for, one way or the other.
 */
export const PORTFOLIO_BOARDING_OUT_OF_SCOPE: readonly PortfolioLoanDocumentType[] = [
  // Legal collateral-perfection / lease instruments — genuinely different instruments with
  // different execution/filing mechanics; merging them into `loan_agreement` would misrepresent them.
  'security_agreement',
  'mortgage_deed_of_trust',
  'assignment_of_rents',
  'ucc',
  'lease_agreement',
  // Lender-internal / governance / servicing / exam artifacts — not something a bank requests FROM
  // a borrower.
  'approval_memo',
  'credit_memo',
  'board_approval',
  'participation_agreement',
  'servicing_notes',
  'site_visit',
  'annual_review',
  'risk_rating_review',
  'examiner_requested_artifact',
  // Closing-execution artifacts — same universe as closingDocumentTemplateRegistry.ts, already
  // ruled out of scope there.
  'modification_documents',
  'renewal_documents',
  'payoff_documents',
  // Non-typed catch-alls — cannot be canonical keys by definition.
  'correspondence',
  'other',
];

/** Annual Review's own non-typed catch-all — same reasoning as Portfolio Boarding's `other`. */
export const ANNUAL_REVIEW_OUT_OF_SCOPE: readonly AnnualReviewDocumentType[] = ['other'];

function buildLookup<T extends string>(
  pick: (def: CanonicalDocumentDefinition) => readonly T[],
): ReadonlyMap<T, CanonicalDocumentKey> {
  const map = new Map<T, CanonicalDocumentKey>();
  for (const def of CANONICAL_DOCUMENT_TAXONOMY) {
    for (const alias of pick(def)) {
      map.set(alias, def.key);
    }
  }
  return map;
}

const ANNUAL_REVIEW_LOOKUP = buildLookup<AnnualReviewDocumentType>((d) => d.legacyAliases.annualReview);
const PORTFOLIO_BOARDING_LOOKUP = buildLookup<PortfolioLoanDocumentType>((d) => d.legacyAliases.portfolioBoarding);

/** Resolves an Annual Review document type to its canonical key, or `undefined` for `'other'`. */
export function canonicalDocumentKeyForAnnualReviewType(
  type: AnnualReviewDocumentType,
): CanonicalDocumentKey | undefined {
  return ANNUAL_REVIEW_LOOKUP.get(type);
}

/**
 * Resolves a Portfolio Boarding document type to its canonical key, or `undefined` when the type is
 * a lender-internal/legal-instrument/closing artifact deliberately out of scope (see
 * `PORTFOLIO_BOARDING_OUT_OF_SCOPE`) — never fabricates a canonical mapping that doesn't exist.
 */
export function canonicalDocumentKeyForPortfolioBoardingType(
  type: PortfolioLoanDocumentType,
): CanonicalDocumentKey | undefined {
  return PORTFOLIO_BOARDING_LOOKUP.get(type);
}

/** The label for a canonical key, for display. Throws only if the taxonomy itself is malformed
 *  (a programmer error, not a runtime/data condition) — every `CanonicalDocumentKey` is a compile-time
 *  literal, so a missing entry can only happen if this module's own array falls out of sync with the
 *  type. */
export function canonicalDocumentLabel(key: CanonicalDocumentKey): string {
  const found = CANONICAL_DOCUMENT_TAXONOMY.find((d) => d.key === key);
  if (!found) {
    throw new Error(`canonicalDocumentTaxonomy.ts is out of sync with CanonicalDocumentKey: missing "${key}".`);
  }
  return found.label;
}
