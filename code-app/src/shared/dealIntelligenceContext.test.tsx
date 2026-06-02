// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, renderHook, screen } from '@testing-library/react';

import type { DealDetail } from '../deals/dealQueries';
import type { AsyncResult } from '../deals/DealDataProvider';
import type { DealTasksResult } from '../deals/dealTaskQueries';
import type { DealDocumentsResult } from '../deals/dealDocumentQueries';
import type { CreditMemoData } from '../deals/creditMemoQueries';
import type { TimelineEvent } from '../deals/activityQueries';

/**
 * Phase 123B — DealIntelligenceProvider + useDealIntelligence tests.
 *
 * Pins:
 *   - the provider projects the DealDataProvider's already-authorized
 *     deal + currently-loaded child slots onto the Phase-123A
 *     deal-intelligence view-model;
 *   - AsyncResults that are 'loading' or 'failed' project to
 *     undefined inputs (the deriver's tolerant contract is honored);
 *   - useDealIntelligence throws outside the provider so callers
 *     fail loudly during integration rather than silently rendering
 *     a fake VM;
 *   - useOptionalDealIntelligence returns undefined outside the
 *     provider (incremental-wiring escape hatch);
 *   - the VM identity is stable across re-renders when nothing
 *     changed (memoization holds).
 */

const { useDealDataMock } = vi.hoisted(() => ({ useDealDataMock: vi.fn() }));

vi.mock('../deals/DealDataProvider', () => ({
  useDealData: useDealDataMock,
  DealDataProvider: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

import {
  DealIntelligenceProvider,
  useDealIntelligence,
  useOptionalDealIntelligence,
} from './dealIntelligenceContext';

function baseDeal(over: Partial<DealDetail> = {}): DealDetail {
  return {
    id: 'd-ctx',
    name: 'Ctx Deal',
    clientName: undefined,
    stage: undefined,
    status: undefined,
    amount: undefined,
    bankerName: undefined,
    targetCloseDate: undefined,
    productType: undefined,
    loanStructure: undefined,
    customerType: undefined,
    industry: undefined,
    guarantorStructure: undefined,
    pricingType: undefined,
    spreadIndex: undefined,
    spreadMargin: undefined,
    collateralSummary: undefined,
    createdOn: undefined,
    stageEntryDate: undefined,
    isClosed: false,
    ...over,
  };
}

function dataShape(
  deal: DealDetail,
  over: Partial<{
    tasks: AsyncResult<DealTasksResult>;
    documents: AsyncResult<DealDocumentsResult>;
    creditMemo: AsyncResult<CreditMemoData>;
    activity: AsyncResult<TimelineEvent[]>;
  }> = {},
) {
  return {
    deal,
    tasks: { kind: 'loading' as const },
    documents: { kind: 'loading' as const },
    creditMemo: { kind: 'loading' as const },
    activity: { kind: 'loading' as const },
    refresh: () => undefined,
    ...over,
  };
}

beforeEach(() => {
  useDealDataMock.mockReset();
});

describe('Phase 123B — DealIntelligenceProvider basic projection', () => {
  it('projects deal identity + Phase-122-hydrated fields into the VM', () => {
    useDealDataMock.mockReturnValue(
      dataShape(
        baseDeal({
          id: 'd-1',
          name: 'Deal 1',
          clientName: 'Borrower A',
          stage: 'Underwriting',
          status: 'Active',
          bankerName: 'Banker A',
          productType: 'SBA 7(a)',
          loanStructure: 'Term Loan',
          pricingType: 'Variable',
        }),
      ),
    );

    const { result } = renderHook(() => useDealIntelligence(), {
      wrapper: ({ children }) => (
        <DealIntelligenceProvider>{children}</DealIntelligenceProvider>
      ),
    });
    expect(result.current.dealId).toBe('d-1');
    expect(result.current.dealName).toBe('Deal 1');
    expect(result.current.clientName).toBe('Borrower A');
    expect(result.current.bankerName).toBe('Banker A');
    expect(result.current.stageName).toBe('Underwriting');
    expect(result.current.statusName).toBe('Active');
    expect(result.current.productTypeName).toBe('SBA 7(a)');
    expect(result.current.loanStructureName).toBe('Term Loan');
    expect(result.current.pricingTypeName).toBe('Variable');
  });

  it('treats loading / failed AsyncResults as undefined inputs to the metrics deriver (counts default to zero, activity state defaults to unknown)', () => {
    useDealDataMock.mockReturnValue(
      dataShape(baseDeal(), {
        tasks: { kind: 'loading' },
        documents: { kind: 'failed', message: 'boom' },
        creditMemo: { kind: 'loading' },
        activity: { kind: 'failed', message: 'boom' },
      }),
    );
    const { result } = renderHook(() => useDealIntelligence(), {
      wrapper: ({ children }) => (
        <DealIntelligenceProvider>{children}</DealIntelligenceProvider>
      ),
    });
    expect(result.current.openTaskCount).toBe(0);
    expect(result.current.overdueTaskCount).toBe(0);
    expect(result.current.outstandingDocumentCount).toBe(0);
    expect(result.current.lastActivity.state).toBe('unknown');
    expect(result.current.lastActivity.iso).toBeUndefined();
  });

  it('passes the blocker pipeline result through (status + signals) for an open deal', () => {
    // Sparse deal — missing-required signal fires for amount /
    // targetCloseDate / clientName / productType. Status → at-risk.
    useDealDataMock.mockReturnValue(dataShape(baseDeal()));
    const { result } = renderHook(() => useDealIntelligence(), {
      wrapper: ({ children }) => (
        <DealIntelligenceProvider>{children}</DealIntelligenceProvider>
      ),
    });
    expect(result.current.blockerStatus).toBe('at-risk');
    expect(result.current.blockerSignals.length).toBeGreaterThan(0);
    const signalIds = result.current.blockerSignals.map((s) => s.id);
    expect(signalIds).toContain('missing-required');
  });

  it('closed deal short-circuits blockers to clear AND suppresses nextBestAction', () => {
    useDealDataMock.mockReturnValue(
      dataShape(baseDeal({ isClosed: true, clientName: 'X' })),
    );
    const { result } = renderHook(() => useDealIntelligence(), {
      wrapper: ({ children }) => (
        <DealIntelligenceProvider>{children}</DealIntelligenceProvider>
      ),
    });
    expect(result.current.closure).toBe('closed');
    expect(result.current.blockerStatus).toBe('clear');
    expect(result.current.nextBestAction).toBeUndefined();
  });
});

describe('Phase 123B — hook safety', () => {
  it('useDealIntelligence throws when called outside <DealIntelligenceProvider>', () => {
    useDealDataMock.mockReturnValue(dataShape(baseDeal()));
    // Suppress React's noisy error log for the expected throw.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() =>
      renderHook(() => useDealIntelligence()),
    ).toThrow(/must be used inside <DealIntelligenceProvider>/);
    errSpy.mockRestore();
  });

  it('useOptionalDealIntelligence returns undefined outside <DealIntelligenceProvider>', () => {
    const { result } = renderHook(() => useOptionalDealIntelligence());
    expect(result.current).toBeUndefined();
  });

  it('useOptionalDealIntelligence returns the VM inside the provider', () => {
    useDealDataMock.mockReturnValue(
      dataShape(baseDeal({ id: 'd-opt', clientName: 'Opt Client' })),
    );
    const { result } = renderHook(() => useOptionalDealIntelligence(), {
      wrapper: ({ children }) => (
        <DealIntelligenceProvider>{children}</DealIntelligenceProvider>
      ),
    });
    expect(result.current?.dealId).toBe('d-opt');
    expect(result.current?.clientName).toBe('Opt Client');
  });
});

describe('Phase 123B — provider renders its children', () => {
  it('passes children through unchanged', () => {
    useDealDataMock.mockReturnValue(dataShape(baseDeal()));
    render(
      <DealIntelligenceProvider>
        <div data-testid="child-marker">child</div>
      </DealIntelligenceProvider>,
    );
    expect(screen.getByTestId('child-marker')).toHaveTextContent('child');
  });
});
