/**
 * Phase PE-8 — Independent loan review workspace.
 *
 * A PURE, deterministic engine for a risk-based independent review: it selects a
 * review sample whose coverage rises with grade / exposure / exceptions, reports
 * coverage analytics by segment and officer, validates the rating (agree /
 * challenge with rationale), and enforces reviewer independence (a reviewer may
 * not review a loan they originated).
 *
 * Discipline: pure, deterministic (no random — sampling is a stable stride), no
 * IO. A rating challenge with no rationale is rejected, not recorded.
 */

export interface LoanReviewCandidate {
  readonly loanId: string;
  readonly exposure?: number;
  readonly obligorGrade?: number;
  readonly exceptionCount?: number;
  readonly segment?: string;
  readonly originatingBanker?: string;
  readonly lastReviewedDate?: string;
}

export interface ReviewScopeParams {
  /** Exposure at or above which a loan is always reviewed. Default 5,000,000. */
  readonly largeExposureThreshold?: number;
  /** Obligor grade at or above which a loan is always reviewed. Default 5 (criticized). */
  readonly criticizedGrade?: number;
  /** Exception count at or above which a loan is always reviewed. Default 3. */
  readonly exceptionThreshold?: number;
  /** Baseline sampled coverage of the remaining (pass) pool, percent. Default 20. */
  readonly passSamplePct?: number;
}

export type ReviewReason = 'criticized' | 'large_exposure' | 'exceptions' | 'sampled';

export interface SelectedReview {
  readonly loanId: string;
  readonly exposure: number;
  readonly obligorGrade: number | undefined;
  readonly segment?: string;
  readonly originatingBanker?: string;
  readonly reasons: readonly ReviewReason[];
  readonly mandatory: boolean;
  readonly reviewScore: number;
}

export interface CoverageStat {
  readonly key: string;
  readonly total: number;
  readonly selected: number;
  readonly coveragePct: number;
  readonly exposureTotal: number;
  readonly exposureSelected: number;
  readonly exposureCoveragePct: number;
}

export interface LoanReviewScope {
  readonly selected: readonly SelectedReview[];
  readonly overall: CoverageStat;
  readonly bySegment: readonly CoverageStat[];
  readonly byOfficer: readonly CoverageStat[];
}

function num(n: number | undefined | null): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}
function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
}

/** Risk weight used to prioritize the selected reviews (higher = review first). */
function reviewScore(c: LoanReviewCandidate, largeThreshold: number): number {
  const gradeWeight = num(c.obligorGrade) * 10;
  const exposureWeight = Math.min(50, (num(c.exposure) / largeThreshold) * 25);
  const exceptionWeight = num(c.exceptionCount) * 5;
  return Math.round(gradeWeight + exposureWeight + exceptionWeight);
}

/** Select a risk-based review sample with deterministic pass-pool striding. */
export function deriveLoanReviewScope(
  candidates: readonly LoanReviewCandidate[],
  params: ReviewScopeParams = {},
): LoanReviewScope {
  const largeThreshold = params.largeExposureThreshold ?? 5_000_000;
  const criticizedGrade = params.criticizedGrade ?? 5;
  const exceptionThreshold = params.exceptionThreshold ?? 3;
  const passSamplePct = params.passSamplePct ?? 20;

  // Stable order for deterministic sampling.
  const ordered = [...candidates].sort((a, b) => a.loanId.localeCompare(b.loanId));

  const passPool: LoanReviewCandidate[] = [];
  const selected: SelectedReview[] = [];

  for (const c of ordered) {
    const reasons: ReviewReason[] = [];
    if (num(c.obligorGrade) >= criticizedGrade) reasons.push('criticized');
    if (num(c.exposure) >= largeThreshold) reasons.push('large_exposure');
    if (num(c.exceptionCount) >= exceptionThreshold) reasons.push('exceptions');

    if (reasons.length > 0) {
      selected.push(toSelected(c, reasons, true, largeThreshold));
    } else {
      passPool.push(c);
    }
  }

  // Deterministic stride over the pass pool to approximate the sample percent.
  if (passSamplePct > 0 && passPool.length > 0) {
    const stride = Math.max(1, Math.round(100 / passSamplePct));
    for (let i = 0; i < passPool.length; i += stride) {
      selected.push(toSelected(passPool[i], ['sampled'], false, largeThreshold));
    }
  }

  selected.sort((a, b) => b.reviewScore - a.reviewScore || a.loanId.localeCompare(b.loanId));

  const selectedIds = new Set(selected.map((s) => s.loanId));
  return {
    selected,
    overall: coverageStat('overall', candidates, selectedIds),
    bySegment: groupCoverage(candidates, selectedIds, (c) => c.segment ?? 'Unassigned'),
    byOfficer: groupCoverage(candidates, selectedIds, (c) => c.originatingBanker ?? 'Unassigned'),
  };
}

function toSelected(c: LoanReviewCandidate, reasons: ReviewReason[], mandatory: boolean, largeThreshold: number): SelectedReview {
  return {
    loanId: c.loanId,
    exposure: num(c.exposure),
    obligorGrade: c.obligorGrade,
    segment: c.segment,
    originatingBanker: c.originatingBanker,
    reasons,
    mandatory,
    reviewScore: reviewScore(c, largeThreshold),
  };
}

function coverageStat(key: string, all: readonly LoanReviewCandidate[], selectedIds: ReadonlySet<string>): CoverageStat {
  const total = all.length;
  const selected = all.filter((c) => selectedIds.has(c.loanId)).length;
  const exposureTotal = all.reduce((s, c) => s + num(c.exposure), 0);
  const exposureSelected = all.filter((c) => selectedIds.has(c.loanId)).reduce((s, c) => s + num(c.exposure), 0);
  return {
    key,
    total,
    selected,
    coveragePct: pct(selected, total),
    exposureTotal,
    exposureSelected,
    exposureCoveragePct: pct(exposureSelected, exposureTotal),
  };
}

function groupCoverage(
  all: readonly LoanReviewCandidate[],
  selectedIds: ReadonlySet<string>,
  keyOf: (c: LoanReviewCandidate) => string,
): CoverageStat[] {
  const keys = [...new Set(all.map(keyOf))].sort();
  return keys.map((k) => coverageStat(k, all.filter((c) => keyOf(c) === k), selectedIds));
}

// ---------------------------------------------------------------------------
// Rating validation / challenge
// ---------------------------------------------------------------------------

export interface RatingChallengeInput {
  readonly loanId: string;
  readonly originalGrade: number;
  readonly reviewerGrade: number;
  readonly rationale?: string;
}

export type RatingChallengeOutcome =
  | { readonly kind: 'agree'; readonly grade: number }
  | { readonly kind: 'challenge'; readonly direction: 'upgrade' | 'downgrade'; readonly from: number; readonly to: number; readonly rationale: string }
  | { readonly kind: 'rejected'; readonly reason: string };

/** Validate the reviewer's grade against the original. A challenge needs a rationale. */
export function deriveRatingChallenge(input: RatingChallengeInput): RatingChallengeOutcome {
  if (input.reviewerGrade === input.originalGrade) {
    return { kind: 'agree', grade: input.originalGrade };
  }
  if ((input.rationale ?? '').trim().length === 0) {
    return { kind: 'rejected', reason: 'A rating challenge requires a written rationale.' };
  }
  // Lower grade number = better credit; a higher reviewer grade is a downgrade.
  const direction = input.reviewerGrade < input.originalGrade ? 'upgrade' : 'downgrade';
  return { kind: 'challenge', direction, from: input.originalGrade, to: input.reviewerGrade, rationale: input.rationale!.trim() };
}

/** Enforce independence: a reviewer may not review a loan they originated. */
export function assertReviewerIndependence(
  reviewerId: string | undefined,
  originatingBanker: string | undefined,
): { independent: boolean; reason?: string } {
  if (!reviewerId) return { independent: false, reason: 'No reviewer assigned.' };
  if (originatingBanker && reviewerId === originatingBanker) {
    return { independent: false, reason: 'Reviewer originated this loan — assign an independent reviewer.' };
  }
  return { independent: true };
}

// ---------------------------------------------------------------------------
// Finding lifecycle
// ---------------------------------------------------------------------------

export interface ReviewFinding {
  readonly id: string;
  readonly severity: 'high' | 'medium' | 'low';
  readonly status: 'open' | 'cleared';
  readonly note?: string;
}

export function deriveReviewFindingSummary(findings: readonly ReviewFinding[]): {
  open: number;
  cleared: number;
  openHigh: number;
} {
  return {
    open: findings.filter((f) => f.status === 'open').length,
    cleared: findings.filter((f) => f.status === 'cleared').length,
    openHigh: findings.filter((f) => f.status === 'open' && f.severity === 'high').length,
  };
}
