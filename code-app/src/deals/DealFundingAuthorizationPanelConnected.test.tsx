// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DealDetail } from './dealQueries';

/**
 * Factory Arc Phase 12 — DealFundingAuthorizationPanelConnected is a thin wiring layer: it must
 * forward every prop to the base panel unchanged, and turn `onFundingConfirmed` into a
 * `refresh('after-funding-confirmed')` call so DealDataProvider's `fundingAuthorization` fact stays
 * current for the Stage Map / Attention Console / Metric Deck / credit-memo blocker surfaces. Both
 * dependencies are mocked so this test exercises only the wrapper's own wiring, not the base
 * panel's disbursement flow (already covered by DealFundingAuthorizationPanel.test.tsx) or
 * DealDataProvider's own loaders.
 */

const refreshMock = vi.fn();

vi.mock('./DealFundingAuthorizationPanel', () => ({
  DealFundingAuthorizationPanel: (props: {
    deal: DealDetail;
    authorized: boolean;
    actorEmail: string | undefined;
    onFundingConfirmed?: () => void;
  }) => (
    <div data-testid="base-panel" data-deal-id={props.deal.id} data-authorized={String(props.authorized)} data-actor-email={props.actorEmail ?? ''}>
      <button type="button" onClick={() => props.onFundingConfirmed?.()}>
        simulate confirm
      </button>
    </div>
  ),
}));

vi.mock('./DealDataProvider', () => ({
  useDealData: () => ({ refresh: refreshMock }),
}));

import { DealFundingAuthorizationPanelConnected } from './DealFundingAuthorizationPanelConnected';

function baseDeal(overrides: Partial<DealDetail> = {}): DealDetail {
  return { id: 'd-1', name: 'Deal', clientName: undefined, stage: 'CLOSING_FUNDING', status: 'Open', ...overrides } as DealDetail;
}

describe('DealFundingAuthorizationPanelConnected', () => {
  it('forwards deal/authorized/actorEmail unchanged to the base panel', () => {
    render(<DealFundingAuthorizationPanelConnected deal={baseDeal()} authorized={true} actorEmail="banker@bank.test" />);
    const el = screen.getByTestId('base-panel');
    expect(el.getAttribute('data-deal-id')).toBe('d-1');
    expect(el.getAttribute('data-authorized')).toBe('true');
    expect(el.getAttribute('data-actor-email')).toBe('banker@bank.test');
  });

  it('turns onFundingConfirmed into refresh("after-funding-confirmed")', async () => {
    const user = userEvent.setup();
    render(<DealFundingAuthorizationPanelConnected deal={baseDeal()} authorized={true} actorEmail="banker@bank.test" />);
    expect(refreshMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'simulate confirm' }));
    expect(refreshMock).toHaveBeenCalledWith('after-funding-confirmed');
  });
});
