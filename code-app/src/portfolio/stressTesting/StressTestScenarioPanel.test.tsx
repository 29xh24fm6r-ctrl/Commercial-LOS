// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StressTestScenarioPanel } from './StressTestScenarioPanel';
import type { StressTestLoanInput } from './stressTesting';

/**
 * Phase 264 (P3) — Stress Test (What-If) panel: scenario-input form driving
 * the pure `deriveStressTestSnapshot` engine directly, with an honest empty
 * state and no false "saved"/Dataverse-write copy.
 */

const LOANS: readonly StressTestLoanInput[] = [
  {
    loanId: 'L1',
    borrowerName: 'Acme LLC',
    exposure: 100,
    interestRateType: 'Variable',
    currentSpreadPct: 2.5,
    collateralValue: 125,
  },
  {
    loanId: 'L2',
    borrowerName: 'Beta Holdings',
    exposure: 300,
    interestRateType: 'Fixed',
    currentSpreadPct: undefined,
    collateralValue: undefined,
  },
];

describe('StressTestScenarioPanel', () => {
  it('renders the honest empty state when there are no boarded loans, without a populated-looking table', () => {
    render(<StressTestScenarioPanel loans={[]} />);
    expect(screen.getByText(/no boarded loans available to stress test/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /run scenario/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('running a scenario against a real loan fixture renders the summary and ranked loan list with correct numbers', async () => {
    const user = userEvent.setup();
    render(<StressTestScenarioPanel loans={LOANS} />);

    const rateInput = screen.getByLabelText(/interest rate shock/i);
    const collateralInput = screen.getByLabelText(/collateral value shock/i);
    await user.clear(rateInput);
    await user.type(rateInput, '200');
    await user.clear(collateralInput);
    await user.type(collateralInput, '-20');

    await user.click(screen.getByRole('button', { name: /run scenario/i }));

    // Total exposure = 100 + 300 = 400.
    expect(screen.getByText('$400')).toBeInTheDocument();

    // L1: coverage 1.25 -> 1.0, strongly_secured -> well_secured, worsened -> high.
    const highRow = screen.getByText('Acme LLC').closest('tr');
    expect(highRow).not.toBeNull();
    expect(highRow).toHaveTextContent('$100');
    expect(highRow).toHaveTextContent('High');
    expect(highRow).toHaveTextContent('Strongly secured → Well secured');

    // L2: fixed rate, no collateral -> low sensitivity.
    const lowRow = screen.getByText('Beta Holdings').closest('tr');
    expect(lowRow).not.toBeNull();
    expect(lowRow).toHaveTextContent('$300');
    expect(lowRow).toHaveTextContent('Low');
    expect(lowRow).toHaveTextContent('Not computable');
  });

  it('never renders any false Dataverse-write confirmation copy', async () => {
    const user = userEvent.setup();
    render(<StressTestScenarioPanel loans={LOANS} />);
    await user.click(screen.getByRole('button', { name: /run scenario/i }));

    expect(screen.queryByText(/^saved$/i)).not.toBeInTheDocument();
    expect(screen.getByText(/no dataverse call/i)).toBeInTheDocument();
    expect(screen.getByText(/no persistence/i)).toBeInTheDocument();
  });
});
