// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DealDetail } from './dealQueries';
import type { VerifiedProfilePatch } from './write/updateDealProfile';

/**
 * Factory mission PR B — regression coverage for the credit-memo stale-read fix. Before this
 * wrapper existed, saving a risk rating or underwriting recommendation wrote a real,
 * readback-verified value but never told DealDataProvider, so `deal.riskRatingInputsJson` /
 * `deal.underwritingRecommendationInputsJson` stayed stale in the same session until a full
 * reload -- meaning the credit memo (which derives both facts straight off the `deal` object) could
 * disagree with what a banker was just told was saved. Note the deliberate field-name translation:
 * `VerifiedProfilePatch` names these `riskRatingInputs` / `underwritingRecommendationInputs`, while
 * `DealDetail` names them `riskRatingInputsJson` / `underwritingRecommendationInputsJson`.
 */

const applyVerifiedDealPatchMock = vi.fn();
const useDealDataMock = vi.fn();

vi.mock('./DealRiskRatingPanel', () => ({
  DealRiskRatingPanel: (props: {
    deal: DealDetail;
    ratedBy?: string;
    authorized: boolean;
    actorEmail: string | undefined;
    actorSystemUserId: string | undefined;
    onSaved?: (verified: VerifiedProfilePatch) => void;
  }) => (
    <div data-testid="base-panel" data-deal-id={props.deal.id} data-authorized={String(props.authorized)}>
      <button type="button" onClick={() => props.onSaved?.({ riskRatingInputs: '{"ratingValue":"BB"}' })}>
        simulate rating save
      </button>
      <button
        type="button"
        onClick={() => props.onSaved?.({ underwritingRecommendationInputs: '{"decision":"approve"}' })}
      >
        simulate recommendation save
      </button>
      <button type="button" onClick={() => props.onSaved?.({})}>
        simulate save with neither field
      </button>
    </div>
  ),
}));

vi.mock('./DealDataProvider', () => ({
  useDealData: () => useDealDataMock(),
}));

import { DealRiskRatingPanelConnected } from './DealRiskRatingPanelConnected';

function baseDeal(overrides: Partial<DealDetail> = {}): DealDetail {
  return { id: 'd-1', name: 'Deal', clientName: undefined, stage: 'UNDERWRITING', status: 'Open', ...overrides } as DealDetail;
}

beforeEach(() => {
  applyVerifiedDealPatchMock.mockReset();
  useDealDataMock.mockReset();
  useDealDataMock.mockReturnValue({ applyVerifiedDealPatch: applyVerifiedDealPatchMock });
});

describe('DealRiskRatingPanelConnected', () => {
  it('forwards deal/authorized unchanged to the base panel', () => {
    render(
      <DealRiskRatingPanelConnected deal={baseDeal()} authorized={true} actorEmail="banker@bank.test" actorSystemUserId="sys-1" />,
    );
    const el = screen.getByTestId('base-panel');
    expect(el.getAttribute('data-deal-id')).toBe('d-1');
    expect(el.getAttribute('data-authorized')).toBe('true');
  });

  it('applies a risk-rating save under the DealDetail field name (riskRatingInputs -> riskRatingInputsJson)', async () => {
    const user = userEvent.setup();
    render(
      <DealRiskRatingPanelConnected deal={baseDeal()} authorized={true} actorEmail="banker@bank.test" actorSystemUserId="sys-1" />,
    );
    await user.click(screen.getByRole('button', { name: 'simulate rating save' }));
    expect(applyVerifiedDealPatchMock).toHaveBeenCalledWith({ riskRatingInputsJson: '{"ratingValue":"BB"}' });
  });

  it('applies a recommendation save under the DealDetail field name (underwritingRecommendationInputs -> underwritingRecommendationInputsJson)', async () => {
    const user = userEvent.setup();
    render(
      <DealRiskRatingPanelConnected deal={baseDeal()} authorized={true} actorEmail="banker@bank.test" actorSystemUserId="sys-1" />,
    );
    await user.click(screen.getByRole('button', { name: 'simulate recommendation save' }));
    expect(applyVerifiedDealPatchMock).toHaveBeenCalledWith({
      underwritingRecommendationInputsJson: '{"decision":"approve"}',
    });
  });

  it('does not call applyVerifiedDealPatch when the verified patch has neither field', async () => {
    const user = userEvent.setup();
    render(
      <DealRiskRatingPanelConnected deal={baseDeal()} authorized={true} actorEmail="banker@bank.test" actorSystemUserId="sys-1" />,
    );
    await user.click(screen.getByRole('button', { name: 'simulate save with neither field' }));
    expect(applyVerifiedDealPatchMock).not.toHaveBeenCalled();
  });
});
