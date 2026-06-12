/**
 * Phase 152 — Entity matching against live external records.
 * Read-only. No auto-link. No writes. No hidden matching against sensitive identifiers.
 */

import type { ExternalRecord } from './externalPlatformReadOnlyAdapter';

export type ExternalMatchStatus =
  | 'no_external_records'
  | 'possible_match'
  | 'strong_candidate'
  | 'conflict'
  | 'needs_human_review'
  | 'unavailable';

export type MatchConfidenceBand = 'low' | 'medium' | 'high' | 'unknown';

export interface ExternalMatchCandidate {
  externalRecordLabel: string;
  displayName: string | undefined;
  ownerLabel: string | undefined;
  confidenceBand: MatchConfidenceBand;
  matchReason: string;
}

export interface ExternalEntityMatchInput {
  losEntity: {
    dealName: string | undefined;
    clientName: string | undefined;
    borrowerLabel: string | undefined;
    bankerName: string | undefined;
  };
  externalRecords: readonly ExternalRecord[];
}

export interface ExternalEntityMatchResult {
  matchStatus: ExternalMatchStatus;
  confidenceBand: MatchConfidenceBand;
  candidateRows: readonly ExternalMatchCandidate[];
  conflicts: readonly string[];
  warnings: readonly string[];
  recommendedReviewStep: string;
  readOnly: true;
  autoLinked: false;
  liveWritePerformed: false;
  externalSystemChanged: false;
}

function normalize(s: string | undefined): string {
  return (s ?? '').trim().toLowerCase();
}

export function matchEntitiesAgainstLiveRecords(
  input: ExternalEntityMatchInput,
): ExternalEntityMatchResult {
  if (input.externalRecords.length === 0) {
    return {
      matchStatus: 'no_external_records',
      confidenceBand: 'unknown',
      candidateRows: [],
      conflicts: [],
      warnings: [],
      recommendedReviewStep: 'No external records available for matching.',
      readOnly: true,
      autoLinked: false,
      liveWritePerformed: false,
      externalSystemChanged: false,
    };
  }

  const losName = normalize(input.losEntity.clientName ?? input.losEntity.borrowerLabel ?? input.losEntity.dealName);
  const candidates: ExternalMatchCandidate[] = [];
  const conflicts: string[] = [];

  for (const rec of input.externalRecords) {
    const extName = normalize(rec.displayName);
    if (!extName || !losName) {
      candidates.push({
        externalRecordLabel: rec.externalRecordLabel,
        displayName: rec.displayName,
        ownerLabel: rec.ownerLabel,
        confidenceBand: 'low',
        matchReason: 'Insufficient data for confident matching',
      });
      continue;
    }

    if (extName === losName) {
      candidates.push({
        externalRecordLabel: rec.externalRecordLabel,
        displayName: rec.displayName,
        ownerLabel: rec.ownerLabel,
        confidenceBand: 'high',
        matchReason: 'Exact name match',
      });
    } else if (extName.includes(losName) || losName.includes(extName)) {
      candidates.push({
        externalRecordLabel: rec.externalRecordLabel,
        displayName: rec.displayName,
        ownerLabel: rec.ownerLabel,
        confidenceBand: 'medium',
        matchReason: 'Partial name match',
      });
    } else {
      conflicts.push(`Name mismatch: LOS "${input.losEntity.clientName ?? ''}" vs external "${rec.displayName ?? ''}"`);
    }
  }

  const hasCandidates = candidates.length > 0;
  const hasConflicts = conflicts.length > 0;
  const highConfidence = candidates.some((c) => c.confidenceBand === 'high');

  const matchStatus: ExternalMatchStatus = hasConflicts ? 'conflict'
    : highConfidence ? 'strong_candidate'
    : hasCandidates ? 'possible_match'
    : 'needs_human_review';

  const confidenceBand: MatchConfidenceBand = highConfidence ? 'high'
    : hasCandidates ? 'medium'
    : 'unknown';

  return {
    matchStatus,
    confidenceBand,
    candidateRows: candidates,
    conflicts,
    warnings: [],
    recommendedReviewStep: hasConflicts
      ? 'Resolve conflicts before proceeding with external record linking.'
      : 'Review match candidates and confirm correct external record.',
    readOnly: true,
    autoLinked: false,
    liveWritePerformed: false,
    externalSystemChanged: false,
  };
}
