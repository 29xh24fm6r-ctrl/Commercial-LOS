/**
 * final-seven-workstreams Workstream 5A — the PROPOSED, NOT YET LIVE shape for the three
 * schema-gated deal fields `BankerNewDealCreate.tsx` already documents as "not yet captured, needs
 * new Dataverse fields this environment does not have": loan purpose, loan term, ownership status.
 *
 * This module is PURE preparation:
 *   - `scripts/dataverse/create-deal-purpose-term-ownership-fields.ps1` proposes the exact
 *     Dataverse column/option-set specification (dry-run by default; NOT executed by this pass).
 *   - The constants and validators below mirror that proposed option-set numbering so the two
 *     stay in lockstep once the schema exists and the SDK is regenerated.
 *
 * NONE of this is wired to any live read or write path — `cr664_loanpurpose`, `cr664_loanterm`,
 * and `cr664_ownershipstatus` do not exist on the live `cr664_loandeal` table today. Do not import
 * this module into a component and render a form field against it; that would fabricate a
 * capability the schema does not yet back. Phase 5B (schema authorized + applied + SDK
 * regenerated) is the trigger to actually wire these into BankerNewDealCreate.tsx / Deal Profile /
 * underwriting summary — see docs/final-seven-workstreams/05_DEAL_SCHEMA_EXPANSION.md.
 */

export type LoanPurpose =
  | 'Acquisition'
  | 'Refinance'
  | 'WorkingCapital'
  | 'Expansion'
  | 'Equipment'
  | 'RealEstatePurchase'
  | 'Construction'
  | 'DebtConsolidation'
  | 'Other';

/** Mirrors the proposed option-set values in create-deal-purpose-term-ownership-fields.ps1 exactly. */
export const LOAN_PURPOSE_OPTIONS: ReadonlyArray<{ readonly value: LoanPurpose; readonly label: string; readonly optionSetValue: number }> = [
  { value: 'Acquisition', label: 'Acquisition', optionSetValue: 788190000 },
  { value: 'Refinance', label: 'Refinance', optionSetValue: 788190001 },
  { value: 'WorkingCapital', label: 'Working Capital', optionSetValue: 788190002 },
  { value: 'Expansion', label: 'Expansion', optionSetValue: 788190003 },
  { value: 'Equipment', label: 'Equipment', optionSetValue: 788190004 },
  { value: 'RealEstatePurchase', label: 'Real Estate Purchase', optionSetValue: 788190005 },
  { value: 'Construction', label: 'Construction', optionSetValue: 788190006 },
  { value: 'DebtConsolidation', label: 'Debt Consolidation', optionSetValue: 788190007 },
  { value: 'Other', label: 'Other', optionSetValue: 788190008 },
];

export type OwnershipStatus = 'OwnerOccupied' | 'Investment' | 'MixedUse' | 'NotApplicable' | 'Other';

/** Mirrors the proposed option-set values in create-deal-purpose-term-ownership-fields.ps1 exactly. */
export const OWNERSHIP_STATUS_OPTIONS: ReadonlyArray<{ readonly value: OwnershipStatus; readonly label: string; readonly optionSetValue: number }> = [
  { value: 'OwnerOccupied', label: 'Owner-Occupied', optionSetValue: 788190000 },
  { value: 'Investment', label: 'Investment', optionSetValue: 788190001 },
  { value: 'MixedUse', label: 'Mixed Use', optionSetValue: 788190002 },
  { value: 'NotApplicable', label: 'Not Applicable', optionSetValue: 788190003 },
  { value: 'Other', label: 'Other', optionSetValue: 788190004 },
];

/**
 * The proposed technical ceiling for loan term (months) — 480 (40 years), matching the
 * provisioning script's `$LoanTermMaxMonths` default. The REAL business maximum is a credit-policy
 * decision, not a technical one; confirm with credit policy before Phase 5B wires this in, and keep
 * this constant in lockstep with the provisioning script's default if either changes.
 */
export const PROPOSED_LOAN_TERM_MAX_MONTHS = 480;
export const LOAN_TERM_MIN_MONTHS = 1;

export function isValidLoanTermMonths(value: number): boolean {
  return Number.isInteger(value) && value >= LOAN_TERM_MIN_MONTHS && value <= PROPOSED_LOAN_TERM_MAX_MONTHS;
}

export function isValidLoanPurpose(value: string | undefined | null): value is LoanPurpose {
  return typeof value === 'string' && LOAN_PURPOSE_OPTIONS.some((o) => o.value === value);
}

export function isValidOwnershipStatus(value: string | undefined | null): value is OwnershipStatus {
  return typeof value === 'string' && OWNERSHIP_STATUS_OPTIONS.some((o) => o.value === value);
}
