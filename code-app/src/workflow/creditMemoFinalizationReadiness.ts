import type { CreditMemoData, CreditMemoSummary } from '../deals/creditMemoQueries';

/**
 * Final LOS Completion arc (Workstream 146-B) — closes the
 * CREDIT_APPROVAL:memo_finalized untracked() gap in
 * loanWorkflowRequirementRegistry.ts. Until now the credit memo's own
 * cr664_status (draft/final/stale) — already persisted by every memo save —
 * was never consulted by the workflow requirement engine, so a deal could
 * exit Credit Approval with nothing but a draft memo on file.
 *
 * Deliberately reuses the EXISTING cr664_creditmemo1 rows (via
 * creditMemoQueries.ts's CreditMemoData, already loaded by DealDataProvider
 * as `creditMemo` for the shallow/legacy gate) rather than introducing a new
 * durable-record table or a new WorkflowRequirementFacts field — the fact
 * this evaluator needs (which memo is current, and its status) is already
 * present in data the engine loads today.
 *
 * "Current" memo = highest cr664_version, matching the convention
 * creditMemoQueries.ts / creditMemoActions.ts already use (NOT the
 * append-only supersedes-chain pattern the six Workstream C-J durable
 * records use — credit memos are versioned by a plain numeric field).
 */

export interface CreditMemoFinalizationFact {
  readonly met: boolean;
  /** Policy-safe reason when not met (empty when met). */
  readonly reason: string;
}

export interface CreditMemoFinalizationReadiness {
  readonly memoFinalized: CreditMemoFinalizationFact;
  readonly currentMemo: CreditMemoSummary | undefined;
}

/**
 * The current (highest-version) memo for a deal, or undefined when no memo
 * has ever been drafted. Exported so finalizeCreditMemoAction.ts can reuse
 * the exact same "current" resolution the readiness gate uses — the action
 * and the gate must never disagree about which row is current.
 */
export function currentCreditMemo(creditMemo: CreditMemoData | undefined): CreditMemoSummary | undefined {
  const memos = creditMemo?.memos ?? [];
  if (memos.length === 0) return undefined;
  // Already ordered by the query (`cr664_version desc`), but re-sort
  // defensively so this never depends on caller ordering.
  return [...memos].sort((a, b) => b.version - a.version)[0];
}

export function evaluateCreditMemoFinalizationReadiness(
  creditMemo: CreditMemoData | undefined,
): CreditMemoFinalizationReadiness {
  const current = currentCreditMemo(creditMemo);
  if (!current) {
    return {
      memoFinalized: { met: false, reason: 'No credit memo has been drafted for this deal yet.' },
      currentMemo: undefined,
    };
  }
  if (current.statusKey === 'final') {
    return { memoFinalized: { met: true, reason: '' }, currentMemo: current };
  }
  const stateWord = current.statusKey === 'stale' ? 'stale' : 'a draft';
  return {
    memoFinalized: {
      met: false,
      reason: `The current credit memo (v${current.version}) is still ${stateWord}, not finalized.`,
    },
    currentMemo: current,
  };
}
