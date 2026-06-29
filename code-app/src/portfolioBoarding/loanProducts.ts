/**
 * Phase 262 (C) — commercial loan product / loan-type catalog.
 *
 * Used by the existing-portfolio-loan form's product dropdown and available for
 * CSV validation. Plain string labels (no Dataverse product table yet); the
 * label is captured on the loan.
 */

export const LOAN_PRODUCTS: readonly string[] = Object.freeze([
  'Commercial Real Estate',
  'Owner-Occupied CRE',
  'Investor CRE',
  'Construction',
  'SBA 7(a)',
  'SBA 504',
  'C&I Term Loan',
  'C&I Revolving Line of Credit',
  'Working Capital Line',
  'Equipment Loan',
  'Agricultural Loan',
  'Bridge Loan',
  'Letter of Credit',
  'Participation Purchased',
  'Participation Sold',
  'Other',
]);

export const INTEREST_RATE_TYPES: readonly string[] = Object.freeze(['Fixed', 'Variable', 'Adjustable']);

export const RATE_INDEX_OPTIONS: readonly string[] = Object.freeze(['Prime', 'SOFR', '5-Year Treasury', 'Other']);
