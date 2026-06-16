/**
 * Phase 179A -- New deal duplicate detection + merge PREPARATION only.
 *
 * Detection is allowed (warn). Merge execution is NOT: merge is disabled by
 * default and, even when "prepared", produces a non-destructive REVIEW object
 * only -- never a delete, patch, overwrite, or "merged" status. Pure: no IO,
 * no service import. The orchestrator may run detection before create as a
 * warning; detection never blocks create unless policy explicitly says an exact
 * duplicate blocks.
 */

import type { DuplicateOutcome } from './dealOriginationOutcomes';
import {
  isDuplicateDetectionEnabled,
  isDuplicateMergeApplyEnabled,
  type DealOriginationFeatureFlagConfig,
} from './dealOriginationFeatureFlags';

const MODULE = 'duplicate-detection';

export interface ExistingDealSignal {
  readonly dealId: string;
  readonly dealName?: string;
  readonly clientName?: string;
  readonly bankerId?: string;
  readonly amount?: number;
  readonly createdDateMs?: number;
  readonly borrowerContact?: string;
  readonly externalCrmId?: string;
}

export interface DuplicateDetectionInput {
  readonly config?: DealOriginationFeatureFlagConfig;
  readonly candidateDealName: string;
  readonly candidateClientName?: string;
  readonly candidateBankerId?: string;
  readonly candidateAmount?: number;
  readonly candidateCreatedDateMs?: number;
  readonly candidateBorrowerContact?: string;
  readonly candidateExternalCrmId?: string;
  readonly existing: readonly ExistingDealSignal[];
  /** Policy: does an exact duplicate block create? Default false (warn only). */
  readonly exactDuplicateBlocks?: boolean;
  /** Window (ms) for the same-banker+amount+close-date signal. */
  readonly createdWindowMs?: number;
  /** Test-only detection-gate override. Production never sets it (uses config). */
  readonly detectionEnabledOverride?: boolean;
}

function norm(s: string | undefined): string {
  return (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Detect duplicates by: exact deal name, normalized client name, same banker +
 * amount + close created-date window, same borrower contact, same external CRM
 * id. Returns a typed outcome with a non-destructive candidate id list. Never
 * writes.
 */
export function detectNewDealDuplicates(input: DuplicateDetectionInput): DuplicateOutcome {
  const detectionEnabled = input.detectionEnabledOverride ?? isDuplicateDetectionEnabled(input.config);
  if (!detectionEnabled) {
    return { module: MODULE, kind: 'not_checked', detail: 'Duplicate detection gate is off.' };
  }
  const name = norm(input.candidateDealName);
  const client = norm(input.candidateClientName);
  const contact = norm(input.candidateBorrowerContact);
  const crmId = norm(input.candidateExternalCrmId);
  const windowMs = input.createdWindowMs ?? 1000 * 60 * 60 * 24 * 3;

  const exact: string[] = [];
  const possible: string[] = [];
  for (const e of input.existing) {
    if (name.length > 0 && norm(e.dealName) === name) {
      exact.push(e.dealId);
      continue;
    }
    if (crmId.length > 0 && norm(e.externalCrmId) === crmId) {
      exact.push(e.dealId);
      continue;
    }
    let signals = 0;
    if (client.length > 0 && norm(e.clientName) === client) signals += 1;
    if (contact.length > 0 && norm(e.borrowerContact) === contact) signals += 1;
    if (
      input.candidateBankerId &&
      e.bankerId === input.candidateBankerId &&
      input.candidateAmount !== undefined &&
      e.amount === input.candidateAmount &&
      input.candidateCreatedDateMs !== undefined &&
      e.createdDateMs !== undefined &&
      Math.abs(input.candidateCreatedDateMs - e.createdDateMs) <= windowMs
    ) {
      signals += 1;
    }
    if (signals > 0) possible.push(e.dealId);
  }

  if (exact.length > 0) {
    return {
      module: MODULE,
      kind: 'exact_duplicate_found',
      detail: input.exactDuplicateBlocks
        ? 'Exact duplicate found; policy blocks create.'
        : 'Exact duplicate found; warning only (policy allows continue).',
      candidates: exact,
    };
  }
  if (possible.length > 0) {
    return { module: MODULE, kind: 'possible_duplicate_found', detail: 'Possible duplicate(s) found; warning only.', candidates: possible };
  }
  return { module: MODULE, kind: 'no_duplicate_found' };
}

/** True only when policy + an exact duplicate together block create. */
export function exactDuplicateBlocksCreate(outcome: DuplicateOutcome, exactDuplicateBlocks: boolean | undefined): boolean {
  return outcome.kind === 'exact_duplicate_found' && exactDuplicateBlocks === true;
}

export interface DuplicateMergeReview {
  readonly applied: false;
  readonly survivingDealId: string;
  readonly duplicateDealIds: readonly string[];
  readonly note: string;
}

/**
 * Prepare a NON-DESTRUCTIVE merge review. Merge apply is disabled by default;
 * this never deletes, patches, or overwrites and never returns a "merged"
 * status. It returns either a prepared review (not applied), a disabled state,
 * or a policy-blocked state.
 */
export function prepareNewDealDuplicateMerge(
  outcome: DuplicateOutcome,
  survivingDealId: string,
  config?: DealOriginationFeatureFlagConfig,
): DuplicateOutcome {
  if (isDuplicateMergeApplyEnabled(config)) {
    // Even if a future gate flips on, this module only PREPARES; apply lives in
    // a separate, explicitly-approved phase.
    return { module: MODULE, kind: 'merge_blocked_by_policy', detail: 'Merge apply is not implemented in this arc (prepare-only).' };
  }
  if (outcome.kind !== 'exact_duplicate_found' && outcome.kind !== 'possible_duplicate_found') {
    return { module: MODULE, kind: 'merge_disabled', detail: 'No duplicate to prepare a merge for.' };
  }
  return {
    module: MODULE,
    kind: 'merge_prepared_not_applied',
    detail: `Non-destructive merge review prepared (surviving deal ${survivingDealId}); no change applied.`,
    candidates: outcome.candidates,
  };
}
