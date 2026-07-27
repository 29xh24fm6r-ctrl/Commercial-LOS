// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DealDetail } from './dealQueries';
import type { ConditionVerificationRecord } from '../workflow/conditionVerificationTypes';

/**
 * Factory Arc Phase 12 — DealFundingAuthorizationPanelConnected is a thin wiring layer: it must
 * forward every prop to the base panel unchanged, and turn `onFundingConfirmed` into a
 * `refresh('after-funding-confirmed')` call so DealDataProvider's `fundingAuthorization` fact stays
 * current for the Stage Map / Attention Console / Metric Deck / credit-memo blocker surfaces. Both
 * dependencies are mocked so this test exercises only the wrapper's own wiring, not the base
 * panel's disbursement flow (already covered by DealFundingAuthorizationPanel.test.tsx) or
 * DealDataProvider's own loaders.
 *
 * Final LOS Completion arc (Workstream G) — also covers the `conditionsPrecedentMet` derivation:
 * the wrapper must compute it from context's `conditionVerifications` via
 * evaluateConditionVerificationReadiness, never fabricate `true` when the fact hasn't loaded.
 */

const refreshMock = vi.fn();
const useDealDataMock = vi.fn();

vi.mock('./DealFundingAuthorizationPanel', () => ({
  DealFundingAuthorizationPanel: (props: {
    deal: DealDetail;
    authorized: boolean;
    actorEmail: string | undefined;
    onFundingConfirmed?: () => void;
    conditionsPrecedentMet?: boolean;
  }) => (
    <div
      data-testid="base-panel"
      data-deal-id={props.deal.id}
      data-authorized={String(props.authorized)}
      data-actor-email={props.actorEmail ?? ''}
      data-conditions-precedent-met={String(props.conditionsPrecedentMet)}
    >
      <button type="button" onClick={() => props.onFundingConfirmed?.()}>
        simulate confirm
      </button>
    </div>
  ),
}));

vi.mock('./DealDataProvider', () => ({
  useDealData: () => useDealDataMock(),
}));

import { DealFundingAuthorizationPanelConnected } from './DealFundingAuthorizationPanelConnected';

function baseDeal(overrides: Partial<DealDetail> = {}): DealDetail {
  return { id: 'd-1', name: 'Deal', clientName: undefined, stage: 'CLOSING_FUNDING', status: 'Open', ...overrides } as DealDetail;
}

function clearedRecord(overrides: Partial<ConditionVerificationRecord> = {}): ConditionVerificationRecord {
  return {
    recordId: 'cv-1',
    dealId: 'd-1',
    conditionType: 'CONDITIONS_PRECEDENT',
    status: 'CLEARED',
    notes: 'Executed loan agreement and UCC-1 filed.',
    verifiedByActorEmail: 'closer@bank.test',
    verifiedAtIso: '2026-07-24T10:00:00.000Z',
    correlationId: 'cv-corr-1',
    supersedesRecordId: undefined,
    ...overrides,
  };
}

beforeEach(() => {
  refreshMock.mockReset();
  useDealDataMock.mockReset();
  useDealDataMock.mockReturnValue({ refresh: refreshMock, conditionVerifications: undefined });
});

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

  it('never fabricates conditionsPrecedentMet=true while conditionVerifications has not loaded', () => {
    useDealDataMock.mockReturnValue({ refresh: refreshMock, conditionVerifications: { kind: 'loading' } });
    render(<DealFundingAuthorizationPanelConnected deal={baseDeal()} authorized={true} actorEmail="banker@bank.test" />);
    expect(screen.getByTestId('base-panel').getAttribute('data-conditions-precedent-met')).toBe('false');
  });

  it('passes conditionsPrecedentMet=true once a CLEARED conditions-precedent record for this exact deal has loaded', () => {
    useDealDataMock.mockReturnValue({
      refresh: refreshMock,
      conditionVerifications: { kind: 'ready', data: [clearedRecord()] },
    });
    render(<DealFundingAuthorizationPanelConnected deal={baseDeal()} authorized={true} actorEmail="banker@bank.test" />);
    expect(screen.getByTestId('base-panel').getAttribute('data-conditions-precedent-met')).toBe('true');
  });

  it('does not fabricate true from a conditions-precedent record belonging to a DIFFERENT deal', () => {
    useDealDataMock.mockReturnValue({
      refresh: refreshMock,
      conditionVerifications: { kind: 'ready', data: [clearedRecord({ dealId: 'other-deal' })] },
    });
    render(<DealFundingAuthorizationPanelConnected deal={baseDeal()} authorized={true} actorEmail="banker@bank.test" />);
    expect(screen.getByTestId('base-panel').getAttribute('data-conditions-precedent-met')).toBe('false');
  });
});
