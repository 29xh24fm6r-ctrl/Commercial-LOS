// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MigrationReconciliationPanel, formatTieOutSummary } from './BookReconciliationPanel';
import { deriveMigrationReconciliation, type MigrationControl, type ReconciliationLoan } from './bookReconciliation';

const BATCH = 'BATCH-2026-Q3';
function loan(n: string, o: number, extra: Partial<ReconciliationLoan> = {}): ReconciliationLoan {
  return { loanNumber: n, outstanding: o, migrationBatchId: BATCH, ...extra };
}
function control(over: Partial<MigrationControl> = {}): MigrationControl {
  return { batchId: BATCH, enteredLoanCount: 2, enteredAggregateOutstanding: 3_000_000, ...over };
}

describe('formatTieOutSummary', () => {
  it('renders "N / N loans · $X / $X · TIED" for a tied batch', () => {
    const r = deriveMigrationReconciliation(control(), [loan('L-1', 1_000_000), loan('L-2', 2_000_000)]);
    expect(formatTieOutSummary(r)).toBe('2 / 2 loans · $3.0M / $3.0M · TIED');
  });

  it('marks OUT OF BALANCE when it does not tie', () => {
    const r = deriveMigrationReconciliation(control(), [loan('L-1', 1_000_000)]);
    expect(formatTieOutSummary(r)).toContain('OUT OF BALANCE');
  });
});

describe('MigrationReconciliationPanel', () => {
  it('renders honest guidance (no fabricated 0/0 TIED) when no reconciliation is recorded', () => {
    render(<MigrationReconciliationPanel />);
    const panel = screen.getByLabelText('Book tie-out');
    expect(panel).toHaveAttribute('data-migration-reconciliation', 'empty');
    expect(within(panel).getByText(/No migration control recorded yet/i)).toBeInTheDocument();
  });

  it('shows a TIED verdict and allows migration-complete when the batch ties', () => {
    const r = deriveMigrationReconciliation(control(), [loan('L-1', 1_000_000), loan('L-2', 2_000_000)]);
    render(<MigrationReconciliationPanel reconciliation={r} />);
    const panel = screen.getByLabelText('Book tie-out');
    expect(panel).toHaveAttribute('data-migration-reconciliation', 'tied');
    expect(panel.querySelector('[data-migration-verdict="tied"]')).not.toBeNull();
    expect(panel.querySelector('[data-migration-complete-allowed="true"]')).not.toBeNull();
  });

  it('shows deltas, orphan lists, and blocks migration-complete when out of balance', () => {
    const ctrl = control({ enteredLoanCount: 2, enteredAggregateOutstanding: 3_000_000, expectedLoanNumbers: ['L-1', 'L-9'] });
    const r = deriveMigrationReconciliation(ctrl, [loan('L-1', 1_000_000), loan('L-5', 500_000)]);
    render(<MigrationReconciliationPanel reconciliation={r} />);
    const panel = screen.getByLabelText('Book tie-out');
    expect(panel).toHaveAttribute('data-migration-reconciliation', 'out_of_balance');
    expect(panel.querySelector('[data-migration-complete-allowed="false"]')).not.toBeNull();
    // Over-boarded L-5 and still-owed L-9 both surface.
    expect(panel.querySelector('[data-migration-orphan-list="boarded-not-in-control"] [data-orphan-item="L-5"]')).not.toBeNull();
    expect(panel.querySelector('[data-migration-orphan-list="in-control-not-boarded"] [data-orphan-item="L-9"]')).not.toBeNull();
  });

  it('renders the per-segment breakdown when the control carries subtotals', () => {
    const ctrl = control({
      enteredLoanCount: 2,
      enteredAggregateOutstanding: 3_000_000,
      segmentSubtotals: [{ segment: 'C&I', count: 1, outstanding: 1_000_000 }, { segment: 'CRE', count: 1, outstanding: 2_000_000 }],
    });
    const r = deriveMigrationReconciliation(ctrl, [loan('L-1', 1_000_000, { segment: 'C&I' }), loan('L-2', 2_000_000, { segment: 'CRE' })]);
    render(<MigrationReconciliationPanel reconciliation={r} />);
    const panel = screen.getByLabelText('Book tie-out');
    const segments = panel.querySelector('[data-migration-segments]')!;
    expect(segments).not.toBeNull();
    expect(within(segments as HTMLElement).getByText('C&I')).toBeInTheDocument();
    expect(within(segments as HTMLElement).getByText('CRE')).toBeInTheDocument();
  });
});
