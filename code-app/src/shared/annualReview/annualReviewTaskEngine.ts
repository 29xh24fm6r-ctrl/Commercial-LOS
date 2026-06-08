/**
 * Phase 141A — Annual Review task / tickler / escalation engine.
 *
 * PURE derivation of the operational tasks an annual-review cycle implies.
 * It writes NOTHING (no task persistence adapter exists in 141A) and never
 * fabricates a completed task.
 */

import type {
  AnnualReviewLoanSnapshot,
  AnnualReviewCycle,
  AnnualReviewCollectionTask,
} from './annualReviewTypes';
import { deriveAnnualReviewCollectionPlan } from './deriveAnnualReviewCollectionPlan';

export interface AnnualReviewTaskInput {
  loans: readonly AnnualReviewLoanSnapshot[];
  cycle: AnnualReviewCycle;
  asOfDate?: string | Date;
}

export function deriveAnnualReviewTasks(
  input: AnnualReviewTaskInput,
): readonly AnnualReviewCollectionTask[] {
  const tasks: AnnualReviewCollectionTask[] = [];

  for (const loan of input.loans) {
    const plan = deriveAnnualReviewCollectionPlan({
      loans: [loan],
      cycle: input.cycle,
      asOfDate: input.asOfDate,
    });
    const requirements = plan.requirementsByLoan[0]?.requirements ?? [];
    if (requirements.length === 0) continue; // out of scope

    const owner = loan.servicingOwner ?? loan.portfolioManager;
    const loanId = loan.boardedLoanId;
    const idBase = loan.loanNumber ?? loan.boardedLoanId ?? 'loan';
    const missingIds = requirements.filter((r) => r.status === 'missing').map((r) => r.requirementId);
    const receivedIds = requirements
      .filter((r) => r.status === 'received' || r.status === 'reviewed')
      .map((r) => r.requirementId);
    const isWatch =
      loan.watchlistFlag === true ||
      (loan.criticizedClassifiedStatus ?? '').trim().length > 0;
    const hasPastDue = plan.pastDue.length > 0;

    const push = (
      taskType: AnnualReviewCollectionTask['taskType'],
      severity: AnnualReviewCollectionTask['severity'],
      escalationLevel: AnnualReviewCollectionTask['escalationLevel'],
      relatedRequirementIds: readonly string[],
      blocker?: string,
    ): void => {
      tasks.push({
        taskId: `${idBase}::${taskType}`,
        loanId,
        borrowerName: loan.borrowerName,
        taskType,
        owner,
        dueDate: loan.annualReviewDueDate ?? input.cycle.cycleEndDate,
        severity,
        status: 'open',
        blocker,
        relatedRequirementIds,
        escalationLevel,
      });
    };

    if (missingIds.length > 0) {
      push('request_financials', hasPastDue ? 'high' : 'medium', 'owner', missingIds);
    }
    if (hasPastDue) {
      push('follow_up_borrower', 'high', 'owner', plan.pastDue.map((i) => i.requirement.requirementId));
      push('escalate_past_due', 'high', 'manager', plan.pastDue.map((i) => i.requirement.requirementId));
    }
    if (receivedIds.length > 0) {
      push('review_received_financials', 'medium', 'owner', receivedIds);
    }
    if (loan.hasCovenants === true && loan.covenantStatus !== 'in_compliance' && loan.covenantStatus !== 'waived') {
      push('test_covenants', loan.covenantStatus === 'breach' ? 'high' : 'medium', loan.covenantStatus === 'breach' ? 'manager' : 'owner', []);
    }
    if (loan.collateralRequiresInsurance === true && loan.insuranceStatus !== 'current') {
      push('review_insurance', 'high', 'owner', []);
    }
    if (isWatch) {
      push('update_risk_rating', 'medium', 'portfolio_manager', []);
      push('manager_review', 'medium', 'manager', []);
    }
    if ((loan.criticizedClassifiedStatus ?? '').trim().length > 0) {
      push('board_review', 'high', 'board', []);
    }
    // Memo only when there is nothing missing and nothing past due.
    if (missingIds.length === 0 && !hasPastDue) {
      push('complete_review_memo', 'low', 'owner', []);
    }
  }

  return tasks;
}
