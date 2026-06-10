/**
 * Phase 142M — Credit committee package review queue deriver.
 *
 * PURE, READ-ONLY. Summarizes which credit committee packages are ready for
 * HUMAN review, what evidence is present/missing, and what blocks readiness. It
 * does NOT vote, approve, deny, recommend, decide, or mutate any state. It uses
 * only the explicit input provided — it never invents readiness, committee
 * support, evidence, or approvals, and it is honest when data is unavailable.
 */

export type CreditCommitteeReadinessStatus =
  | 'ready_for_review'
  | 'blocked'
  | 'needs_evidence'
  | 'not_generated'
  | 'unknown';

export interface CreditCommitteeReadinessInput {
  /** Whether the canonical memo's committee_readiness section carries decision support. */
  hasDecisionSupport?: boolean;
  remainingBlockers?: readonly string[];
  decisionSupportCount?: number;
  highConfidenceSupportCount?: number;
  evidenceCount?: number;
  missingEvidenceLabels?: readonly string[];
}

export interface CreditCommitteePackageInput {
  dealId: string;
  dealName?: string;
  clientName?: string;
  bankerName?: string;
  stage?: string;
  status?: string;
  memoId?: string;
  memoGeneratedAt?: string;
  committeeReadiness?: CreditCommitteeReadinessInput;
  blockers?: readonly string[];
  evidenceCount?: number;
  sourceCount?: number;
  missingEvidenceLabels?: readonly string[];
  decisionSupportCount?: number;
  highConfidenceSupportCount?: number;
  packageGeneratedAt?: string;
  lastReviewedAt?: string;
}

export interface CreditCommitteePackageRow {
  dealId: string;
  dealName: string;
  clientName: string;
  bankerName: string;
  readinessStatus: CreditCommitteeReadinessStatus;
  readinessLabel: string;
  remainingBlockerCount: number;
  evidenceCount?: number;
  missingEvidenceCount: number;
  missingEvidenceLabels: readonly string[];
  decisionSupportCount?: number;
  highConfidenceSupportCount?: number;
  stalePackage: boolean;
  /** A human-review next step. Never an approve / vote / deny verb. */
  nextHumanReviewStep: string;
  honestWarnings: readonly string[];
}

export interface CreditCommitteePackageQueueTotals {
  total: number;
  readyForReview: number;
  blocked: number;
  needsEvidence: number;
  notGeneratedOrUnknown: number;
}

export interface CreditCommitteePackageQueueResult {
  /** False when no input was supplied — the surface renders an honest unavailable state. */
  available: boolean;
  rows: readonly CreditCommitteePackageRow[];
  totals: CreditCommitteePackageQueueTotals;
  warnings: readonly string[];
}

export interface DeriveCreditCommitteePackageQueueInput {
  packages?: readonly CreditCommitteePackageInput[];
  /** Injected clock for stale detection (ISO). */
  asOfDate?: string;
}

const STATUS_LABELS: Record<CreditCommitteeReadinessStatus, string> = {
  ready_for_review: 'Ready for human committee review',
  blocked: 'Blocked — readiness blockers remain',
  needs_evidence: 'Needs evidence',
  not_generated: 'Committee package not generated',
  unknown: 'Readiness unknown',
};

const NEXT_STEPS: Record<CreditCommitteeReadinessStatus, string> = {
  ready_for_review: 'Schedule the package for human committee review.',
  blocked: 'Resolve the remaining readiness blockers before human review.',
  needs_evidence: 'Collect the missing evidence before human review.',
  not_generated: 'Generate the committee package before human review.',
  unknown: 'Confirm the committee readiness inputs before human review.',
};

function text(value: string | undefined, fallback: string): string {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function hasPackage(p: CreditCommitteePackageInput): boolean {
  return (
    p.memoId !== undefined ||
    p.memoGeneratedAt !== undefined ||
    p.packageGeneratedAt !== undefined ||
    p.committeeReadiness !== undefined
  );
}

function deriveRow(p: CreditCommitteePackageInput): CreditCommitteePackageRow {
  const cr = p.committeeReadiness;
  const blockers = cr?.remainingBlockers ?? p.blockers ?? [];
  const remainingBlockerCount = blockers.length;
  const missingEvidenceLabels = cr?.missingEvidenceLabels ?? p.missingEvidenceLabels ?? [];
  const missingEvidenceCount = missingEvidenceLabels.length;
  const evidenceCount = cr?.evidenceCount ?? p.evidenceCount ?? p.sourceCount;
  const decisionSupportCount = cr?.decisionSupportCount ?? p.decisionSupportCount;
  const highConfidenceSupportCount = cr?.highConfidenceSupportCount ?? p.highConfidenceSupportCount;
  const hasDecisionSupport = cr?.hasDecisionSupport === true || (decisionSupportCount ?? 0) > 0;

  let readinessStatus: CreditCommitteeReadinessStatus;
  if (!hasPackage(p)) {
    readinessStatus = 'not_generated';
  } else if (remainingBlockerCount > 0) {
    readinessStatus = 'blocked';
  } else if (evidenceCount === 0 || missingEvidenceCount > 0) {
    readinessStatus = 'needs_evidence';
  } else if (hasDecisionSupport) {
    readinessStatus = 'ready_for_review';
  } else {
    readinessStatus = 'unknown';
  }

  const stalePackage =
    p.packageGeneratedAt !== undefined &&
    p.lastReviewedAt !== undefined &&
    !Number.isNaN(Date.parse(p.packageGeneratedAt)) &&
    !Number.isNaN(Date.parse(p.lastReviewedAt)) &&
    Date.parse(p.packageGeneratedAt) < Date.parse(p.lastReviewedAt);

  const honestWarnings: string[] = [];
  if (hasPackage(p) && cr === undefined) honestWarnings.push('Committee readiness data unavailable for this package.');
  if (hasPackage(p) && evidenceCount === undefined) honestWarnings.push('Evidence count unavailable.');
  if (stalePackage) honestWarnings.push('Package may be stale — generated before the last review timestamp.');
  if (readinessStatus === 'unknown') honestWarnings.push('Required committee readiness fields are missing or ambiguous.');

  return {
    dealId: p.dealId,
    dealName: text(p.dealName, p.dealId),
    clientName: text(p.clientName, 'Unknown client'),
    bankerName: text(p.bankerName, 'Unassigned'),
    readinessStatus,
    readinessLabel: STATUS_LABELS[readinessStatus],
    remainingBlockerCount,
    evidenceCount,
    missingEvidenceCount,
    missingEvidenceLabels,
    decisionSupportCount,
    highConfidenceSupportCount,
    stalePackage,
    nextHumanReviewStep: NEXT_STEPS[readinessStatus],
    honestWarnings,
  };
}

export function deriveCreditCommitteePackageQueue(
  input: DeriveCreditCommitteePackageQueueInput | undefined,
): CreditCommitteePackageQueueResult {
  if (!input || input.packages === undefined) {
    return {
      available: false,
      rows: [],
      totals: { total: 0, readyForReview: 0, blocked: 0, needsEvidence: 0, notGeneratedOrUnknown: 0 },
      warnings: ['Credit committee package data is unavailable.'],
    };
  }

  const rows = input.packages.map(deriveRow);
  const totals: CreditCommitteePackageQueueTotals = {
    total: rows.length,
    readyForReview: rows.filter((r) => r.readinessStatus === 'ready_for_review').length,
    blocked: rows.filter((r) => r.readinessStatus === 'blocked').length,
    needsEvidence: rows.filter((r) => r.readinessStatus === 'needs_evidence').length,
    notGeneratedOrUnknown: rows.filter((r) => r.readinessStatus === 'not_generated' || r.readinessStatus === 'unknown').length,
  };

  return { available: true, rows, totals, warnings: [] };
}
