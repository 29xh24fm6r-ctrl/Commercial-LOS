/**
 * Phase 261 (C) — Existing-portfolio bulk-import column registry + template.
 *
 * Maps spreadsheet columns to the governed `ExistingLoanInput` shape used by the
 * Phase 259 `boardExistingLoan` adapter. Scalar columns map 1:1 to a loan field;
 * child columns map a single cell to a named child record (semicolon-separated
 * for multiples). Only `loanNumber` + `borrowerLegalName` are hard-required (the
 * governed adapter's contract); every other column is optional and simply
 * omitted when blank, so a partial book still imports cleanly. The template
 * lists every recommended column so the bank can fill in as much as it has.
 */

import type { ExistingLoanChildKey } from './existingLoanEntryAdapter';

export type ImportColumnType = 'text' | 'number' | 'date' | 'boolean';

/** A scalar column that maps to one loan-level field. */
export interface ScalarImportColumn {
  /** Canonical key — the ExistingLoanInput field this column fills. */
  readonly key: ScalarColumnKey;
  /** Human header shown in the template + mapping UI. */
  readonly header: string;
  /** Lowercased header aliases recognised during auto-mapping. */
  readonly aliases: readonly string[];
  readonly type: ImportColumnType;
  readonly required: boolean;
}

/** A column that maps to a named child-record collection. */
export interface ChildImportColumn {
  readonly child: ExistingLoanChildKey;
  readonly header: string;
  readonly aliases: readonly string[];
}

export type ScalarColumnKey =
  | 'loanNumber'
  | 'borrowerLegalName'
  | 'borrowerDba'
  | 'relationshipName'
  | 'loanStatus'
  | 'legacySystemId'
  | 'originalCommitmentAmount'
  | 'currentOutstandingPrincipal'
  | 'availableBalance'
  | 'interestRateType'
  | 'paymentFrequency'
  | 'amortizationMonths'
  | 'termMonths'
  | 'bookingDate'
  | 'maturityDate'
  | 'currentRiskRating'
  | 'nextReviewDate'
  | 'accrualStatus'
  | 'pastDueDays'
  | 'watchlistFlag'
  | 'index'
  | 'spread'
  | 'floor'
  | 'ceiling';

export const SCALAR_IMPORT_COLUMNS: readonly ScalarImportColumn[] = Object.freeze([
  { key: 'loanNumber', header: 'Loan Number', aliases: ['loan number', 'loan #', 'loan no', 'note number', 'loannumber'], type: 'text', required: true },
  { key: 'borrowerLegalName', header: 'Borrower Legal Name', aliases: ['borrower legal name', 'borrower', 'borrower name', 'legal name', 'obligor'], type: 'text', required: true },
  { key: 'borrowerDba', header: 'DBA', aliases: ['dba', 'd/b/a', 'doing business as', 'borrower dba'], type: 'text', required: false },
  { key: 'relationshipName', header: 'Assigned Owner / Relationship', aliases: ['assigned owner', 'owner', 'relationship name', 'relationship', 'officer', 'lender', 'relationship manager', 'crm company name', 'crm company'], type: 'text', required: false },
  { key: 'loanStatus', header: 'Current Loan Status', aliases: ['current loan status', 'loan status', 'status'], type: 'text', required: false },
  { key: 'legacySystemId', header: 'Legacy / Core Loan ID', aliases: ['legacy loan id', 'core loan id', 'legacy/core loan id', 'legacy id', 'core id', 'legacy system id'], type: 'text', required: false },
  { key: 'originalCommitmentAmount', header: 'Original Commitment Amount', aliases: ['original commitment amount', 'original commitment', 'commitment amount', 'commitment', 'original amount', 'note amount'], type: 'number', required: false },
  { key: 'currentOutstandingPrincipal', header: 'Current Outstanding Principal', aliases: ['current outstanding principal', 'outstanding principal', 'current balance', 'principal balance', 'outstanding', 'balance'], type: 'number', required: false },
  { key: 'availableBalance', header: 'Available Balance', aliases: ['available balance', 'available', 'undrawn', 'availability'], type: 'number', required: false },
  { key: 'interestRateType', header: 'Interest Rate Type', aliases: ['interest rate type', 'rate type', 'interest type'], type: 'text', required: false },
  { key: 'index', header: 'Index', aliases: ['index', 'rate index', 'reference index', 'base index'], type: 'text', required: false },
  { key: 'spread', header: 'Spread', aliases: ['spread', 'margin', 'spread/margin', 'spread (bps)', 'rate spread'], type: 'number', required: false },
  { key: 'floor', header: 'Floor Rate', aliases: ['floor rate', 'floor', 'rate floor'], type: 'number', required: false },
  { key: 'ceiling', header: 'Ceiling Rate', aliases: ['ceiling rate', 'ceiling', 'rate ceiling', 'cap', 'rate cap'], type: 'number', required: false },
  { key: 'paymentFrequency', header: 'Payment Frequency', aliases: ['payment frequency', 'pmt frequency', 'frequency'], type: 'text', required: false },
  { key: 'amortizationMonths', header: 'Amortization Months', aliases: ['amortization months', 'amortization', 'amort months', 'amort'], type: 'number', required: false },
  { key: 'termMonths', header: 'Term Months', aliases: ['term months', 'term', 'term (months)'], type: 'number', required: false },
  { key: 'bookingDate', header: 'Booking Date', aliases: ['booking date', 'book date', 'origination date', 'note date', 'open date'], type: 'date', required: false },
  { key: 'maturityDate', header: 'Maturity Date', aliases: ['maturity date', 'maturity', 'maturity dt'], type: 'date', required: false },
  { key: 'currentRiskRating', header: 'Current Risk Rating', aliases: ['current risk rating', 'risk rating', 'rating', 'risk grade', 'grade'], type: 'text', required: false },
  { key: 'nextReviewDate', header: 'Next Review Date', aliases: ['next review date', 'review date', 'next review'], type: 'date', required: false },
  { key: 'accrualStatus', header: 'Accrual Status', aliases: ['accrual status', 'accrual', 'accrual/nonaccrual'], type: 'text', required: false },
  { key: 'pastDueDays', header: 'Past Due Days', aliases: ['past due days', 'days past due', 'dpd', 'past due'], type: 'number', required: false },
  { key: 'watchlistFlag', header: 'Watchlist Flag', aliases: ['watchlist flag', 'watchlist', 'watch list', 'on watchlist'], type: 'boolean', required: false },
]);

export const CHILD_IMPORT_COLUMNS: readonly ChildImportColumn[] = Object.freeze([
  { child: 'collateral', header: 'Collateral Type/Value', aliases: ['collateral type/value', 'collateral', 'collateral type', 'collateral description'] },
  { child: 'guarantors', header: 'Guarantor Name', aliases: ['guarantor name', 'guarantor', 'guarantors', 'crm guarantor name', 'crm guarantor'] },
  { child: 'covenants', header: 'Covenant Names', aliases: ['covenant names', 'covenant', 'covenants'] },
  { child: 'insurance', header: 'Insurance Expiration', aliases: ['insurance expiration', 'insurance', 'insurance exp'] },
  { child: 'reviews', header: 'Review Notes', aliases: ['review notes', 'review note', 'reviews'] },
]);

/**
 * Phase 262 — informational columns captured for validation/warnings but not
 * persisted to dedicated Dataverse columns (no schema change). Used to enforce
 * payment-61 reset terms and to round out the template the bank fills in.
 */
export type InformationalKey =
  | 'loanProduct'
  | 'assignedLoanOfficer'
  | 'assignedPortfolioManager'
  | 'branchNumber'
  | 'loanPurpose'
  | 'currentNoteRate'
  | 'firstResetDate'
  | 'firstResetPaymentNumber'
  | 'resetFrequency'
  | 'nextRateChangeDate'
  | 'payment61Reset'
  | 'crmPrimaryContact'
  | 'guarantorEmail'
  | 'guarantorPhone';

export interface InformationalColumn {
  readonly key: InformationalKey;
  readonly header: string;
  readonly aliases: readonly string[];
}

export const INFORMATIONAL_IMPORT_COLUMNS: readonly InformationalColumn[] = Object.freeze([
  { key: 'loanProduct', header: 'Loan Product', aliases: ['loan product', 'product', 'loan type'] },
  { key: 'assignedLoanOfficer', header: 'Assigned Loan Officer', aliases: ['assigned loan officer', 'loan officer'] },
  { key: 'assignedPortfolioManager', header: 'Assigned Portfolio Manager', aliases: ['assigned portfolio manager', 'portfolio manager'] },
  { key: 'branchNumber', header: 'Branch Number', aliases: ['branch number', 'branch', 'branch #', 'branch no'] },
  { key: 'loanPurpose', header: 'Loan Purpose', aliases: ['loan purpose', 'purpose'] },
  { key: 'currentNoteRate', header: 'Current Note Rate', aliases: ['current note rate', 'note rate', 'current rate'] },
  { key: 'firstResetDate', header: 'First Reset Date', aliases: ['first reset date', 'first rate reset date'] },
  { key: 'firstResetPaymentNumber', header: 'First Reset Payment Number', aliases: ['first reset payment number', 'first reset payment', 'reset payment number'] },
  { key: 'resetFrequency', header: 'Reset Frequency', aliases: ['reset frequency', 'rate reset frequency'] },
  { key: 'nextRateChangeDate', header: 'Next Rate Change Date', aliases: ['next rate change date', 'next reset date', 'next rate change'] },
  { key: 'payment61Reset', header: 'Payment 61 Reset', aliases: ['payment 61 reset', 'payment-61 reset', 'payment 61', 'p61 reset'] },
  { key: 'crmPrimaryContact', header: 'CRM Primary Contact', aliases: ['crm primary contact', 'primary contact', 'crm contact'] },
  { key: 'guarantorEmail', header: 'Guarantor Email', aliases: ['guarantor email'] },
  { key: 'guarantorPhone', header: 'Guarantor Phone', aliases: ['guarantor phone'] },
]);

/** Every header in template order. */
export function templateHeaders(): string[] {
  return [
    ...SCALAR_IMPORT_COLUMNS.map((c) => c.header),
    ...CHILD_IMPORT_COLUMNS.map((c) => c.header),
    ...INFORMATIONAL_IMPORT_COLUMNS.map((c) => c.header),
  ];
}

/** A single CSV value, quoted when it contains a comma/quote/newline. */
export function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * A downloadable CSV template: the header row plus one illustrative example
 * row (clearly a sample) so the bank sees the expected shape. Consumers can
 * delete the sample row before filling in real loans.
 */
export function buildImportTemplateCsv(): string {
  const headers = templateHeaders();
  const sample: Record<string, string> = {
    'Loan Number': 'SAMPLE-1001',
    'Borrower Legal Name': 'Sample Borrower LLC',
    'DBA': 'Sample Co',
    'Assigned Owner / Relationship': 'Jane Banker',
    'Current Loan Status': 'Current',
    'Legacy / Core Loan ID': 'CORE-55501',
    'Original Commitment Amount': '500000',
    'Current Outstanding Principal': '412345.67',
    'Available Balance': '0',
    'Interest Rate Type': 'Variable',
    'Index': 'Prime',
    'Spread': '1.5',
    'Floor Rate': '4',
    'Ceiling Rate': '9',
    'Payment Frequency': 'Monthly',
    'Amortization Months': '240',
    'Term Months': '60',
    'Booking Date': '2022-03-15',
    'Maturity Date': '2027-03-15',
    'Current Risk Rating': '4',
    'Next Review Date': '2026-03-15',
    'Accrual Status': 'Accrual',
    'Past Due Days': '0',
    'Watchlist Flag': 'No',
    'Collateral Type/Value': 'CRE - 123 Main St; value 650000',
    'Guarantor Name': 'Jane Doe; John Doe',
    'Covenant Names': 'DSCR min 1.25; Min liquidity 100k',
    'Insurance Expiration': 'Hazard - 2026-09-01',
    'Review Notes': 'Annual review completed 2025-03',
    'Loan Product': 'Owner-Occupied CRE',
    'Assigned Loan Officer': 'Jane Banker',
    'Assigned Portfolio Manager': 'Pat Manager',
    'Branch Number': '001',
    'Loan Purpose': 'Refinance owner-occupied building',
    'Current Note Rate': '6.5',
    'First Reset Date': '2027-03-15',
    'First Reset Payment Number': '61',
    'Reset Frequency': 'Every 60 months',
    'Next Rate Change Date': '2027-03-15',
    'Payment 61 Reset': 'Yes',
    'CRM Primary Contact': 'Jane Doe',
    'Guarantor Email': 'jane@example.com',
    'Guarantor Phone': '555-0100',
  };
  const headerLine = headers.map(csvCell).join(',');
  const sampleLine = headers.map((h) => csvCell(sample[h] ?? '')).join(',');
  return `${headerLine}\n${sampleLine}\n`;
}
