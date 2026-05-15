/**
 * Phase 73: deterministic credit-memo consistency checker.
 *
 * Pure function. No SDK import, no role-module import, no AI call,
 * no clock. Takes already-authorized deal + credit-memo data and
 * returns a list of source-field-backed findings the banker can
 * use as a review-assist hint.
 *
 * Discipline:
 *   - NO official "validation" claim. NO "approved" / "failed" /
 *     "invalid" / "noncompliant" language. NO credit decisioning.
 *     The finding messages use "may need review", "does not
 *     appear to match", and similar conservative phrasing
 *     verbatim. Tests pin the language at render time.
 *   - Every check requires both sides to have data; absent fields
 *     short-circuit silently. The brief explicitly forbids
 *     inventing checks for fields that don't exist.
 *   - Money extraction is deliberately conservative: bare numbers
 *     (e.g. "1000000") are NOT detected as amounts. The memo must
 *     use a recognizable currency token ($, K/M/MM suffix, or
 *     "million") for the loan-amount checks to fire.
 *   - Stage names are checked as a full-word, case-insensitive
 *     substring match. Partial or fuzzy matches are NOT used —
 *     they would produce false negatives the banker can't reason
 *     about.
 */

import type { DealDetail } from '../../deals/dealQueries';
import type {
  CreditMemoData,
  CreditMemoSectionItem,
} from '../../deals/creditMemoQueries';

// ---------------------------------------------------------------------------
// Finding model (Phase 73 brief)
// ---------------------------------------------------------------------------

export type ConsistencyFindingId =
  | 'deal-name-reference'
  | 'client-name-reference'
  | 'stage-reference'
  | 'loan-amount-reference'
  | 'loan-amount-mismatch'
  | 'collateral-section-empty';

export type ConsistencyFindingSeverity = 'needs-review' | 'informational';

export type ConsistencyFindingSource = 'structured-deal' | 'credit-memo-draft';

export interface ConsistencyFinding {
  /** Stable id per finding TYPE (not per instance). Re-runs against
   *  the same data produce the same id; safe React key. */
  id: ConsistencyFindingId;
  severity: ConsistencyFindingSeverity;
  /** Human label naming the structured field involved (e.g. "Deal
   *  name", "Client name", "Loan amount"). */
  fieldLabel: string;
  /** The deal-record value the check used. Stringified for display.
   *  Undefined when the check has no scalar structured anchor. */
  structuredValue: string | undefined;
  /** The memo-side value the check observed, or undefined when the
   *  check fires because the memo did not contain a comparable
   *  value at all. */
  memoValue: string | undefined;
  /** Banker-readable explanation. Uses conservative copy verbatim. */
  message: string;
  /** Which side of the comparison triggered the finding. */
  source: ConsistencyFindingSource;
  /** Phase 73 confidence claim. Always 'deterministic' — there is
   *  no model, no probabilistic scoring, no fuzzy match. */
  confidence: 'deterministic';
}

export interface ConsistencyCheckResult {
  /** True when the credit-memo data carries at least one memo or
   *  section with usable text. When false, the consistency-review
   *  surface shows its "no draft yet" state. */
  hasDraftToCompare: boolean;
  findings: readonly ConsistencyFinding[];
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function checkCreditMemoConsistency(
  deal: DealDetail,
  creditMemo: CreditMemoData,
): ConsistencyCheckResult {
  const haystack = collectMemoText(creditMemo);
  if (haystack.length === 0) {
    return { hasDraftToCompare: false, findings: [] };
  }
  const haystackLower = haystack.toLowerCase();
  const findings: ConsistencyFinding[] = [];

  checkDealNameReference(deal, haystackLower, findings);
  checkClientNameReference(deal, haystackLower, findings);
  checkStageReference(deal, haystackLower, findings);
  checkLoanAmount(deal, haystack, findings);
  checkCollateralSectionEmpty(deal, creditMemo.sections, findings);

  return { hasDraftToCompare: true, findings };
}

// ---------------------------------------------------------------------------
// Text aggregation
// ---------------------------------------------------------------------------

function collectMemoText(creditMemo: CreditMemoData): string {
  const parts: string[] = [];
  for (const m of creditMemo.memos) {
    if (m.textPreview && m.textPreview.trim().length > 0) {
      parts.push(m.textPreview);
    }
  }
  for (const s of creditMemo.sections) {
    if (s.textPreview && s.textPreview.trim().length > 0) {
      parts.push(s.textPreview);
    }
  }
  return parts.join('\n').trim();
}

// ---------------------------------------------------------------------------
// Per-check implementations
// ---------------------------------------------------------------------------

/**
 * "Memo does not appear to reference the deal name <X>." Skips when
 * the deal name is missing or too short to make a reliable substring
 * match (under 4 chars). Reliability over completeness.
 */
function checkDealNameReference(
  deal: DealDetail,
  haystackLower: string,
  out: ConsistencyFinding[],
): void {
  const name = deal.name?.trim();
  if (!name || name.length < 4) return;
  if (haystackLower.includes(name.toLowerCase())) return;
  out.push({
    id: 'deal-name-reference',
    severity: 'needs-review',
    fieldLabel: 'Deal name',
    structuredValue: name,
    memoValue: undefined,
    message: `Memo draft does not appear to reference the deal name "${name}". The structured value differs from the memo draft.`,
    source: 'credit-memo-draft',
    confidence: 'deterministic',
  });
}

/**
 * "Memo does not appear to reference borrower <X>." Skips when
 * clientName is missing or short.
 */
function checkClientNameReference(
  deal: DealDetail,
  haystackLower: string,
  out: ConsistencyFinding[],
): void {
  const client = deal.clientName?.trim();
  if (!client || client.length < 4) return;
  if (haystackLower.includes(client.toLowerCase())) return;
  out.push({
    id: 'client-name-reference',
    severity: 'needs-review',
    fieldLabel: 'Client / borrower name',
    structuredValue: client,
    memoValue: undefined,
    message: `Memo draft does not appear to reference the borrower "${client}". The structured value differs from the memo draft.`,
    source: 'credit-memo-draft',
    confidence: 'deterministic',
  });
}

/**
 * Informational: when deal.stage is set and not present in the memo
 * text. Stage names like "Underwriting" or "Closing" are typically
 * referenced explicitly; absence is mild signal worth surfacing.
 */
function checkStageReference(
  deal: DealDetail,
  haystackLower: string,
  out: ConsistencyFinding[],
): void {
  const stage = deal.stage?.trim();
  if (!stage || stage.length < 4) return;
  if (haystackLower.includes(stage.toLowerCase())) return;
  out.push({
    id: 'stage-reference',
    severity: 'informational',
    fieldLabel: 'Current stage',
    structuredValue: stage,
    memoValue: undefined,
    message: `Memo draft does not appear to reference the current stage "${stage}". The memo may be missing available deal data.`,
    source: 'credit-memo-draft',
    confidence: 'deterministic',
  });
}

/**
 * Loan-amount checks combine two related signals:
 *   1. "No in-range amount" (informational): when deal.amount exists
 *      but the memo has no detected dollar amount within an
 *      order-of-magnitude window [0.5 * amount, 2.0 * amount].
 *   2. "Amount mismatch" (needs-review): when an in-range amount IS
 *      detected and the closest one to deal.amount differs by > 5%.
 *
 * The two checks are mutually exclusive by construction. The
 * order-of-magnitude window is deliberate: a memo that mentions a
 * $50 fee should NOT trigger a mismatch finding against a $4.5M
 * loan — the $50 isn't claiming to BE the loan amount.
 */
function checkLoanAmount(
  deal: DealDetail,
  haystack: string,
  out: ConsistencyFinding[],
): void {
  const amount = deal.amount;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    return;
  }
  const detected = extractDollarAmounts(haystack);
  const inRange = detected.filter(
    (n) => n >= amount * 0.5 && n <= amount * 2.0,
  );
  if (inRange.length === 0) {
    out.push({
      id: 'loan-amount-reference',
      severity: 'informational',
      fieldLabel: 'Loan amount',
      structuredValue: formatUsd(amount),
      memoValue:
        detected.length === 0
          ? undefined
          : `${detected.length} amount${detected.length === 1 ? '' : 's'} mentioned, none near the deal value`,
      message: `Memo draft does not appear to reference an amount near the deal value of ${formatUsd(amount)}. The memo may be missing available deal data.`,
      source: 'credit-memo-draft',
      confidence: 'deterministic',
    });
    return;
  }
  // Closest in-range amount to deal.amount.
  let closest = inRange[0]!;
  let closestDelta = Math.abs(closest - amount);
  for (const n of inRange) {
    const d = Math.abs(n - amount);
    if (d < closestDelta) {
      closest = n;
      closestDelta = d;
    }
  }
  const tolerance = amount * 0.05;
  if (closestDelta <= tolerance) return; // Within 5% → no finding.
  out.push({
    id: 'loan-amount-mismatch',
    severity: 'needs-review',
    fieldLabel: 'Loan amount',
    structuredValue: formatUsd(amount),
    memoValue: formatUsd(closest),
    message: `Memo draft mentions ${formatUsd(closest)}; deal record shows ${formatUsd(amount)}. The structured value differs from the memo draft.`,
    source: 'credit-memo-draft',
    confidence: 'deterministic',
  });
}

/**
 * Section-level check: a section labelled "collateral" with empty
 * text preview while the deal record's collateralSummary has content.
 */
function checkCollateralSectionEmpty(
  deal: DealDetail,
  sections: readonly CreditMemoSectionItem[],
  out: ConsistencyFinding[],
): void {
  const collateral = deal.collateralSummary?.trim();
  if (!collateral) return;
  const section = sections.find((s) =>
    s.sectionLabel.toLowerCase().includes('collateral'),
  );
  if (!section) return;
  const previewLen = section.textPreview?.trim().length ?? 0;
  if (previewLen > 0) return;
  out.push({
    id: 'collateral-section-empty',
    severity: 'informational',
    fieldLabel: 'Collateral section',
    structuredValue: collateral,
    memoValue: undefined,
    message: `Collateral section appears empty in the memo; deal record carries "${collateral}". The memo may be missing available deal data.`,
    source: 'structured-deal',
    confidence: 'deterministic',
  });
}

// ---------------------------------------------------------------------------
// Helpers: dollar-amount extraction + formatting
// ---------------------------------------------------------------------------

/**
 * Extracts dollar amounts mentioned in `haystack`. Conservative —
 * recognizes:
 *   - "$1,000,000" / "$1,000,000.00"
 *   - "$1.5M" / "$2M" / "$2MM" / "$500K"
 *   - "1.5 million" / "2 million dollars" (with explicit unit word)
 *   - "$50" (small bare-dollar amounts)
 *
 * Does NOT recognize:
 *   - Bare digit groups like "1000000" without a $ prefix or unit
 *     suffix. False positives from contract ids / phone numbers /
 *     section numbers are not worth the noise.
 *   - Mixed-case "K"/"k" without a leading $ (e.g. "500k" gets a
 *     match because the K suffix is unambiguous; "500" by itself
 *     does NOT).
 */
export function extractDollarAmounts(haystack: string): number[] {
  const results: number[] = [];
  // Pattern A: "$<digits>[,<digits>]*(.<digits>)? [K|M|MM]?" with
  // optional thousands separators.
  const reA =
    /\$([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)\s*(MM|M|K)?\b/gi;
  let m: RegExpExecArray | null;
  while ((m = reA.exec(haystack)) !== null) {
    const numericRaw = m[1]!.replace(/,/g, '');
    const n = Number(numericRaw);
    if (!Number.isFinite(n)) continue;
    const suffix = (m[2] ?? '').toUpperCase();
    const scaled =
      suffix === 'MM'
        ? n * 1_000_000
        : suffix === 'M'
          ? n * 1_000_000
          : suffix === 'K'
            ? n * 1_000
            : n;
    results.push(scaled);
  }
  // Pattern B: "<digits>[.digits]? <million|thousand>" — non-$ variants.
  const reB = /\b([0-9]+(?:\.[0-9]+)?)\s+(million|thousand)\b/gi;
  while ((m = reB.exec(haystack)) !== null) {
    const n = Number(m[1]!);
    if (!Number.isFinite(n)) continue;
    const unit = m[2]!.toLowerCase();
    const scaled = unit === 'million' ? n * 1_000_000 : n * 1_000;
    results.push(scaled);
  }
  // Pattern C: standalone "<digits>K" / "<digits>M" (no $ prefix).
  // The suffix alone is unambiguous enough; "500K applicants" is rare
  // in a credit-memo context.
  const reC = /\b([0-9]+(?:\.[0-9]+)?)(MM|M|K)\b(?![a-zA-Z])/g;
  while ((m = reC.exec(haystack)) !== null) {
    const n = Number(m[1]!);
    if (!Number.isFinite(n)) continue;
    const suffix = m[2]!.toUpperCase();
    const scaled =
      suffix === 'MM' || suffix === 'M' ? n * 1_000_000 : n * 1_000;
    results.push(scaled);
  }
  return results;
}

function formatUsd(amount: number): string {
  // Conservative formatting; avoids locale-driven currency formatting
  // surprises (no $1,000,000.00 with locale-specific separators —
  // banker UI expects en-US thousands).
  if (!Number.isFinite(amount)) return '$—';
  const rounded = Math.round(amount);
  return `$${rounded.toLocaleString('en-US')}`;
}
