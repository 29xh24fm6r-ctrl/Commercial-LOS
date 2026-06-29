// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VariableRateControlCenter } from './VariableRateControlCenter';
import type { VariableRateLoanInput } from './variableRateModel';

/**
 * Phase 262 (E) — Variable Rate Control Center: empty + populated states, and
 * operator-entered index values drive the fully-indexed-rate computation.
 */

const NOW = new Date('2026-06-26T00:00:00Z');

function variableLoan(over: Partial<VariableRateLoanInput> = {}): VariableRateLoanInput {
  return {
    loanNumber: 'V-100', borrower: 'Riverside LLC', interestRateType: 'Variable',
    index: 'Prime', spread: 1.5, currentNoteRate: undefined, floor: null, ceiling: null,
    nextRateChangeDate: null, ...over,
  };
}

describe('VariableRateControlCenter', () => {
  it('renders a useful empty state when there are no variable loans', async () => {
    const { container } = render(<VariableRateControlCenter loadLoans={async () => []} now={NOW} />);
    await waitFor(() => expect(container.querySelector('[data-variable-rate-empty]')).not.toBeNull());
    expect(screen.getByText(/No variable-rate loans yet/i)).toBeInTheDocument();
    // The index-entry panel always renders (operator can prep values).
    expect(container.querySelector('[data-variable-rate-index-panel]')).not.toBeNull();
    for (const t of ['Prime', 'SOFR', '5-Year Treasury', 'Other']) {
      expect(container.querySelector(`[data-variable-rate-index="${t}"]`)).not.toBeNull();
    }
  });

  it('lists variable loans and computes fully-indexed rate from an entered index value', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <VariableRateControlCenter loadLoans={async () => [variableLoan({ spread: 1.5 })]} now={NOW} />,
    );
    await waitFor(() => expect(container.querySelector('[data-variable-rate-row="V-100"]')).not.toBeNull());

    // Before entering an index value, fully-indexed is blank.
    let row = container.querySelector('[data-variable-rate-row="V-100"]') as HTMLElement;
    // Enter Prime = 5.5 → fully-indexed = 5.5 + 1.5 = 7.00%.
    await user.type(container.querySelector('[data-variable-rate-index-value="Prime"]') as HTMLInputElement, '5.5');
    row = container.querySelector('[data-variable-rate-row="V-100"]') as HTMLElement;
    expect(within(row).getByText('7%')).toBeInTheDocument();
  });

  it('filters out fixed loans and surfaces a missing-index/spread alert', async () => {
    const { container } = render(
      <VariableRateControlCenter
        loadLoans={async () => [
          variableLoan({ loanNumber: 'V-1', spread: null }), // missing spread → alert
          variableLoan({ loanNumber: 'F-1', interestRateType: 'Fixed' }),
        ]}
        now={NOW}
      />,
    );
    await waitFor(() => expect(container.querySelector('[data-variable-rate-table]')).not.toBeNull());
    expect(container.querySelector('[data-variable-rate-row="V-1"]')).not.toBeNull();
    expect(container.querySelector('[data-variable-rate-row="F-1"]')).toBeNull();
    expect(container.querySelector('[data-variable-rate-alert="missing-index-spread"]')).not.toBeNull();
  });
});
