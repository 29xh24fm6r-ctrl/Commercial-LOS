import type { CSSProperties } from 'react';
import { useBanker } from './BankerContext';
import { BankerLoanWorkflowWorkbench } from './BankerLoanWorkflowWorkbench';
import { ExistingPortfolioLoansPanel } from '../portfolioBoarding/ExistingPortfolioLoansPanel';
import { ErrorBoundary } from '../shared/ErrorBoundary';
import { spacing } from '../shared/theme';

/**
 * Phase 257–260 — Banker Loan Workflow destination.
 *
 * The elite lending workbench (command header, work-queue cards, deal table →
 * command center) plus the Existing Portfolio Loans section so a banker can
 * board a loan already in the bank's portfolio and see boarded loans in the
 * servicing context.
 */
const EXISTING_LOANS_ANCHOR = 'existing-portfolio-loans';

function scrollToExistingLoans() {
  try {
    document.getElementById(EXISTING_LOANS_ANCHOR)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch {
    // scrollIntoView is a no-op in non-DOM/test environments.
  }
}

export function BankerLoanWorkflowTab({ onNewDeal }: { onNewDeal?: () => void }) {
  const { systemUserId, email, writeDisabledReason } = useBanker();
  return (
    <div data-banker-loan-workflow="panel" style={styles.stack}>
      {/* Secondary protection: each section is isolated so a failure in one
          never blanks the whole Loan Workflow tab. */}
      <ErrorBoundary surface="Loan Workflow" navKey="loan-workflow-workbench">
        <BankerLoanWorkflowWorkbench onNewDeal={onNewDeal} onAddExistingLoan={scrollToExistingLoans} />
      </ErrorBoundary>
      <div id={EXISTING_LOANS_ANCHOR}>
        <ErrorBoundary surface="Existing Portfolio Loans" navKey="loan-workflow-existing">
          <ExistingPortfolioLoansPanel
            actorEmail={email}
            actorSystemUserId={systemUserId}
            writeDisabledReason={writeDisabledReason}
          />
        </ErrorBoundary>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  stack: { display: 'flex', flexDirection: 'column', gap: spacing.xl },
};
