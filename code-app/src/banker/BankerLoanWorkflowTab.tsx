import type { CSSProperties } from 'react';
import { useBanker } from './BankerContext';
import { BankerLoanWorkflowWorkbench } from './BankerLoanWorkflowWorkbench';
import { ExistingPortfolioLoansPanel } from '../portfolioBoarding/ExistingPortfolioLoansPanel';
import { spacing } from '../shared/theme';

/**
 * Phase 257 / 258 / 259 — Banker Loan Workflow destination.
 *
 * Renders the lending workbench (deal sections + table → command center) and,
 * below it, the Existing Portfolio Loans panel so a banker/operator can board
 * a loan already in the bank's portfolio (manual existing-loan entry) and see
 * boarded loans in the portfolio/servicing context.
 */
export function BankerLoanWorkflowTab() {
  const { systemUserId, email, writeDisabledReason } = useBanker();
  return (
    <div data-banker-loan-workflow="panel" style={styles.stack}>
      <BankerLoanWorkflowWorkbench />
      <ExistingPortfolioLoansPanel
        actorEmail={email}
        actorSystemUserId={systemUserId}
        writeDisabledReason={writeDisabledReason}
      />
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  stack: { display: 'flex', flexDirection: 'column', gap: spacing.xl },
};
