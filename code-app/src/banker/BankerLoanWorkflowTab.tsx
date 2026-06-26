import { BankerLoanWorkflowWorkbench } from './BankerLoanWorkflowWorkbench';

/**
 * Phase 257 / 258 — Banker Loan Workflow destination.
 *
 * The "Loan Workflow" sidebar/tab destination renders the lending workbench:
 * My Active Deals, Recently Created, Closing Soon, and Needs Attention over a
 * deal table (name, borrower, stage, status, amount, owner, next action, last
 * activity). Opening a deal routes to its Loan Workflow Command Center.
 */
export function BankerLoanWorkflowTab() {
  return (
    <div data-banker-loan-workflow="panel">
      <BankerLoanWorkflowWorkbench />
    </div>
  );
}
