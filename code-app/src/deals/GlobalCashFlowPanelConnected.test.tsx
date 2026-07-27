// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DealDetail } from './dealQueries';
import type { VerifiedProfilePatch } from './write/updateDealProfile';

/**
 * Factory mission PR B — regression coverage for the credit-memo stale-read fix. Before this
 * wrapper existed, a Global Cash Flow save wrote a real, readback-verified value but never told
 * DealDataProvider, so `deal.financialSpreadInputsJson` stayed stale in the same session until a
 * full reload. This wrapper's only job is to translate a successful save's verified patch into
 * `applyVerifiedDealPatch({ financialSpreadInputsJson: ... })` -- note the deliberate field-name
 * translation, since `VerifiedProfilePatch` names this field `globalCashFlowInputs` while
 * `DealDetail` (and everything that reads the deal, e.g. the credit memo) names it
 * `financialSpreadInputsJson`.
 */

const applyVerifiedDealPatchMock = vi.fn();
const useDealDataMock = vi.fn();

vi.mock('./GlobalCashFlowPanel', () => ({
  GlobalCashFlowPanel: (props: {
    deal: DealDetail;
    authorized: boolean;
    actorEmail: string | undefined;
    actorSystemUserId: string | undefined;
    onSaved?: (verified: VerifiedProfilePatch) => void;
  }) => (
    <div data-testid="base-panel" data-deal-id={props.deal.id} data-authorized={String(props.authorized)}>
      <button type="button" onClick={() => props.onSaved?.({ globalCashFlowInputs: '{"netIncome":"100"}' })}>
        simulate save
      </button>
      <button type="button" onClick={() => props.onSaved?.({})}>
        simulate save with no globalCashFlowInputs field
      </button>
    </div>
  ),
}));

vi.mock('./DealDataProvider', () => ({
  useDealData: () => useDealDataMock(),
}));

import { GlobalCashFlowPanelConnected } from './GlobalCashFlowPanelConnected';

function baseDeal(overrides: Partial<DealDetail> = {}): DealDetail {
  return { id: 'd-1', name: 'Deal', clientName: undefined, stage: 'UNDERWRITING', status: 'Open', ...overrides } as DealDetail;
}

beforeEach(() => {
  applyVerifiedDealPatchMock.mockReset();
  useDealDataMock.mockReset();
  useDealDataMock.mockReturnValue({ applyVerifiedDealPatch: applyVerifiedDealPatchMock });
});

describe('GlobalCashFlowPanelConnected', () => {
  it('forwards deal/authorized unchanged to the base panel', () => {
    render(
      <GlobalCashFlowPanelConnected deal={baseDeal()} authorized={true} actorEmail="banker@bank.test" actorSystemUserId="sys-1" />,
    );
    const el = screen.getByTestId('base-panel');
    expect(el.getAttribute('data-deal-id')).toBe('d-1');
    expect(el.getAttribute('data-authorized')).toBe('true');
  });

  it('applies the verified patch under the DealDetail field name (globalCashFlowInputs -> financialSpreadInputsJson), not the write-layer name', async () => {
    const user = userEvent.setup();
    render(
      <GlobalCashFlowPanelConnected deal={baseDeal()} authorized={true} actorEmail="banker@bank.test" actorSystemUserId="sys-1" />,
    );
    expect(applyVerifiedDealPatchMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'simulate save' }));
    expect(applyVerifiedDealPatchMock).toHaveBeenCalledWith({ financialSpreadInputsJson: '{"netIncome":"100"}' });
  });

  it('does not call applyVerifiedDealPatch when the verified patch has no globalCashFlowInputs field', async () => {
    const user = userEvent.setup();
    render(
      <GlobalCashFlowPanelConnected deal={baseDeal()} authorized={true} actorEmail="banker@bank.test" actorSystemUserId="sys-1" />,
    );
    await user.click(screen.getByRole('button', { name: 'simulate save with no globalCashFlowInputs field' }));
    expect(applyVerifiedDealPatchMock).not.toHaveBeenCalled();
  });
});
