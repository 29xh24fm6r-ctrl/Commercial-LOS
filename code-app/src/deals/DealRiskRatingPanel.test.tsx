// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DealRiskRatingPanel } from './DealRiskRatingPanel';

describe('DealRiskRatingPanel', () => {
  it('shows honest "would not satisfy the gate" states before anything is entered', () => {
    render(<DealRiskRatingPanel dealId="deal-1" ratedBy="M. Paller" />);
    expect(screen.getByText(/No risk rating has been assigned to this deal/i)).toBeInTheDocument();
    expect(screen.getByText(/No underwriting recommendation has been recorded/i)).toBeInTheDocument();
  });

  it('assigning a rating value with status "assigned" satisfies the default readiness policy', async () => {
    const user = userEvent.setup();
    const { container } = render(<DealRiskRatingPanel dealId="deal-1" ratedBy="M. Paller" />);

    await user.type(container.querySelector('[data-risk-rating-field="value"]') as HTMLInputElement, 'BB');
    await user.selectOptions(container.querySelector('[data-risk-rating-field="status"]') as HTMLSelectElement, 'assigned');

    const line = container.querySelector('[data-risk-rating-readiness="rating-readiness"]');
    expect(line?.textContent).toMatch(/Would satisfy the gate/i);
  });

  it('a draft-status rating never satisfies the gate, even with a value entered', async () => {
    const user = userEvent.setup();
    const { container } = render(<DealRiskRatingPanel dealId="deal-1" ratedBy="M. Paller" />);
    await user.type(container.querySelector('[data-risk-rating-field="value"]') as HTMLInputElement, 'BB');
    // status stays at its default 'draft'
    const line = container.querySelector('[data-risk-rating-readiness="rating-readiness"]');
    expect(line?.textContent).toMatch(/Would NOT satisfy the gate/i);
  });

  it('a DECLINE recommendation never satisfies the forward gate and is flagged as requiring the non-forward path', async () => {
    const user = userEvent.setup();
    const { container } = render(<DealRiskRatingPanel dealId="deal-1" ratedBy="M. Paller" />);
    await user.selectOptions(container.querySelector('[data-risk-rating-field="decision"]') as HTMLSelectElement, 'decline');
    await user.selectOptions(container.querySelector('[data-risk-rating-field="recommendation-status"]') as HTMLSelectElement, 'recorded');
    const line = container.querySelector('[data-risk-rating-readiness="recommendation-readiness"]');
    expect(line?.textContent).toMatch(/Would NOT satisfy the gate/i);
    expect(line?.textContent).toMatch(/route via the Decline path/i);
  });

  it('an approved recommendation with a recorded status satisfies the forward gate', async () => {
    const user = userEvent.setup();
    const { container } = render(<DealRiskRatingPanel dealId="deal-1" ratedBy="M. Paller" />);
    await user.selectOptions(container.querySelector('[data-risk-rating-field="decision"]') as HTMLSelectElement, 'approve');
    await user.selectOptions(container.querySelector('[data-risk-rating-field="recommendation-status"]') as HTMLSelectElement, 'recorded');
    const line = container.querySelector('[data-risk-rating-readiness="recommendation-readiness"]');
    expect(line?.textContent).toMatch(/Would satisfy the gate/i);
  });

  it('says plainly that entries are not yet saved to the deal', () => {
    render(<DealRiskRatingPanel dealId="deal-1" ratedBy="M. Paller" />);
    expect(screen.getByRole('note')).toHaveTextContent(/not yet saved/i);
  });
});
