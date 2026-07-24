// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DealRiskRatingPanel } from './DealRiskRatingPanel';
import type { DealDetail } from './dealQueries';
import {
  serializeRiskRatingFormState,
  serializeUnderwritingRecommendationFormState,
  type RiskRatingFormState,
  type UnderwritingRecommendationFormState,
} from '../workflow/underwritingDeepFacts';

vi.mock('../generated/services/Cr664_loandealsService', () => ({
  Cr664_loandealsService: { update: vi.fn(), get: vi.fn() },
}));

import { Cr664_loandealsService } from '../generated/services/Cr664_loandealsService';

vi.mock('../generated/services/Cr664_auditeventsService', () => ({
  Cr664_auditeventsService: { create: vi.fn() },
}));

import { Cr664_auditeventsService } from '../generated/services/Cr664_auditeventsService';

vi.mock('./newDealAuditActorResolver', () => ({
  createActorChangedByResolver: () => async () => ({
    ok: true,
    changedByBind: '/cr664_users(00000000-0000-0000-0000-000000000001)',
  }),
}));

const dealUpdate = vi.mocked(Cr664_loandealsService.update);
const auditCreate = vi.mocked(Cr664_auditeventsService.create);

function baseDeal(overrides: Partial<DealDetail> = {}): DealDetail {
  return {
    id: 'deal-1',
    name: 'Acme Working Capital',
    clientName: 'Acme Corp',
    stage: 'Underwriting',
    status: 'Open',
    amount: 500_000,
    bankerName: 'M. Paller',
    targetCloseDate: '2026-08-01T00:00:00Z',
    productType: 'RLOC',
    loanStructure: 'Senior Secured',
    customerType: 'C&I',
    industry: 'Manufacturing',
    guarantorStructure: 'One PG',
    pricingType: 'Floating',
    spreadIndex: 'SOFR',
    spreadMargin: 275,
    collateralSummary: 'A/R and Inventory',
    createdOn: '2026-07-01T00:00:00Z',
    stageEntryDate: '2026-07-20T00:00:00Z',
    isClosed: false,
    ...overrides,
  };
}

beforeEach(() => {
  dealUpdate.mockReset();
  auditCreate.mockReset();
  auditCreate.mockResolvedValue({ success: true, data: { cr664_auditeventid: 'audit-1' } } as never);
});

describe('DealRiskRatingPanel', () => {
  it('shows honest "would not satisfy the gate" states before anything is entered', () => {
    render(<DealRiskRatingPanel deal={baseDeal()} ratedBy="M. Paller" authorized={true} actorEmail="banker@bank.com" actorSystemUserId="sys-1" />);
    expect(screen.getByText(/No risk rating has been assigned to this deal/i)).toBeInTheDocument();
    expect(screen.getByText(/No underwriting recommendation has been recorded/i)).toBeInTheDocument();
  });

  it('assigning a rating value with status "assigned" satisfies the default readiness policy', async () => {
    const user = userEvent.setup();
    const { container } = render(<DealRiskRatingPanel deal={baseDeal()} ratedBy="M. Paller" authorized={true} actorEmail="banker@bank.com" actorSystemUserId="sys-1" />);

    await user.type(container.querySelector('[data-risk-rating-field="value"]') as HTMLInputElement, 'BB');
    await user.selectOptions(container.querySelector('[data-risk-rating-field="status"]') as HTMLSelectElement, 'assigned');

    const line = container.querySelector('[data-risk-rating-readiness="rating-readiness"]');
    expect(line?.textContent).toMatch(/Would satisfy the gate/i);
  });

  it('a draft-status rating never satisfies the gate, even with a value entered', async () => {
    const user = userEvent.setup();
    const { container } = render(<DealRiskRatingPanel deal={baseDeal()} ratedBy="M. Paller" authorized={true} actorEmail="banker@bank.com" actorSystemUserId="sys-1" />);
    await user.type(container.querySelector('[data-risk-rating-field="value"]') as HTMLInputElement, 'BB');
    // status stays at its default 'draft'
    const line = container.querySelector('[data-risk-rating-readiness="rating-readiness"]');
    expect(line?.textContent).toMatch(/Would NOT satisfy the gate/i);
  });

  it('a DECLINE recommendation never satisfies the forward gate and is flagged as requiring the non-forward path', async () => {
    const user = userEvent.setup();
    const { container } = render(<DealRiskRatingPanel deal={baseDeal()} ratedBy="M. Paller" authorized={true} actorEmail="banker@bank.com" actorSystemUserId="sys-1" />);
    await user.selectOptions(container.querySelector('[data-risk-rating-field="decision"]') as HTMLSelectElement, 'decline');
    await user.selectOptions(container.querySelector('[data-risk-rating-field="recommendation-status"]') as HTMLSelectElement, 'recorded');
    const line = container.querySelector('[data-risk-rating-readiness="recommendation-readiness"]');
    expect(line?.textContent).toMatch(/Would NOT satisfy the gate/i);
    expect(line?.textContent).toMatch(/route via the Decline path/i);
  });

  it('an approved recommendation with a recorded status satisfies the forward gate', async () => {
    const user = userEvent.setup();
    const { container } = render(<DealRiskRatingPanel deal={baseDeal()} ratedBy="M. Paller" authorized={true} actorEmail="banker@bank.com" actorSystemUserId="sys-1" />);
    await user.selectOptions(container.querySelector('[data-risk-rating-field="decision"]') as HTMLSelectElement, 'approve');
    await user.selectOptions(container.querySelector('[data-risk-rating-field="recommendation-status"]') as HTMLSelectElement, 'recorded');
    const line = container.querySelector('[data-risk-rating-readiness="recommendation-readiness"]');
    expect(line?.textContent).toMatch(/Would satisfy the gate/i);
  });

  describe('persistence (Factory Arc Phase 5)', () => {
    it('says entries save on click when authorized', () => {
      render(<DealRiskRatingPanel deal={baseDeal()} ratedBy="M. Paller" authorized={true} actorEmail="banker@bank.com" actorSystemUserId="sys-1" />);
      expect(screen.getByRole('note')).toHaveTextContent(/click save/i);
    });

    it('says plainly that entries cannot be saved when unauthorized', () => {
      render(<DealRiskRatingPanel deal={baseDeal()} ratedBy="M. Paller" authorized={false} actorEmail={undefined} actorSystemUserId={undefined} />);
      expect(screen.getByRole('note')).toHaveTextContent(/cannot be saved/i);
      expect(screen.getByText('Save Risk Rating')).toBeDisabled();
      expect(screen.getByText('Save Recommendation')).toBeDisabled();
    });

    it('restores a previously saved rating and recommendation from the deal on mount', () => {
      const rating: RiskRatingFormState = { ratingValue: 'BB', ratingScale: 'Internal 1-10', rationale: 'Stable cash flow', status: 'assigned' };
      const recommendation: UnderwritingRecommendationFormState = { decision: 'approve_with_conditions', rationale: 'Subject to covenant', status: 'recorded' };
      const deal = baseDeal({
        riskRatingInputsJson: serializeRiskRatingFormState(rating),
        underwritingRecommendationInputsJson: serializeUnderwritingRecommendationFormState(recommendation),
      });
      const { container } = render(<DealRiskRatingPanel deal={deal} ratedBy="M. Paller" authorized={true} actorEmail="banker@bank.com" actorSystemUserId="sys-1" />);

      expect((container.querySelector('[data-risk-rating-field="value"]') as HTMLInputElement).value).toBe('BB');
      expect((container.querySelector('[data-risk-rating-field="status"]') as HTMLSelectElement).value).toBe('assigned');
      expect((container.querySelector('[data-risk-rating-field="decision"]') as HTMLSelectElement).value).toBe('approve_with_conditions');
      expect((container.querySelector('[data-risk-rating-field="recommendation-status"]') as HTMLSelectElement).value).toBe('recorded');
    });

    it('a corrupt saved JSON value fails closed to the blank/draft defaults, not a crash', () => {
      const deal = baseDeal({ riskRatingInputsJson: '{not valid json', underwritingRecommendationInputsJson: '[1,2,3]' });
      const { container } = render(<DealRiskRatingPanel deal={deal} ratedBy="M. Paller" authorized={true} actorEmail="banker@bank.com" actorSystemUserId="sys-1" />);
      expect((container.querySelector('[data-risk-rating-field="value"]') as HTMLInputElement).value).toBe('');
      expect((container.querySelector('[data-risk-rating-field="decision"]') as HTMLSelectElement).value).toBe('approve');
    });

    it('saves the risk rating independently of the recommendation via the governed write path', async () => {
      dealUpdate.mockResolvedValue({ success: true, data: {} } as never);
      Cr664_loandealsService.get = vi.fn().mockImplementation(async () => {
        const lastCall = dealUpdate.mock.calls[dealUpdate.mock.calls.length - 1];
        const body = lastCall ? (lastCall[1] as Record<string, unknown>) : {};
        return { success: true, data: { ...body } };
      }) as never;

      const user = userEvent.setup();
      const { container } = render(<DealRiskRatingPanel deal={baseDeal()} ratedBy="M. Paller" authorized={true} actorEmail="banker@bank.com" actorSystemUserId="sys-1" />);

      await user.type(container.querySelector('[data-risk-rating-field="value"]') as HTMLInputElement, 'BB');
      await user.click(screen.getByText('Save Risk Rating'));

      await waitFor(() => expect(container.querySelector('[data-risk-rating-save-outcome="rating:updated"]')).not.toBeNull());
      expect(dealUpdate).toHaveBeenCalledTimes(1);
      const [dealId, body] = dealUpdate.mock.calls[0] as [string, Record<string, unknown>];
      expect(dealId).toBe('deal-1');
      const parsed = JSON.parse(body.cr664_riskratinginputs as string);
      expect(parsed.ratingValue).toBe('BB');
      // The recommendation column was never touched by this save.
      expect(body.cr664_underwritingrecommendationinputs).toBeUndefined();
    });

    it('does not attempt a save when unauthorized (buttons disabled, no write call)', async () => {
      const user = userEvent.setup();
      render(<DealRiskRatingPanel deal={baseDeal()} ratedBy="M. Paller" authorized={false} actorEmail={undefined} actorSystemUserId={undefined} />);
      await user.click(screen.getByText('Save Risk Rating'));
      await user.click(screen.getByText('Save Recommendation'));
      expect(dealUpdate).not.toHaveBeenCalled();
    });
  });
});
