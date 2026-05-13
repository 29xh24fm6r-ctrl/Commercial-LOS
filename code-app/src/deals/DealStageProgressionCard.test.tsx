// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { DealDetail } from './dealQueries';
import type { DealTasksResult } from './dealTaskQueries';
import type { DealDocumentsResult } from './dealDocumentQueries';
import type { CreditMemoData } from './creditMemoQueries';
import type { TimelineEvent } from './activityQueries';

// The real DealDataProvider transitively imports @microsoft/power-apps
// SDK service files that Vitest cannot resolve in jsdom. Stub the hook
// directly so the card can mount in isolation.
vi.mock('./DealDataProvider', () => ({
  useDealData: vi.fn(),
}));

import { useDealData, type DealData } from './DealDataProvider';
import { DealStageProgressionCard } from './DealStageProgressionCard';

const useDealDataMock = vi.mocked(useDealData);

const baseDeal: DealDetail = {
  id: 'deal-77',
  name: 'Acme Tooling 2026 Working Capital',
  clientName: 'Acme Tooling',
  stage: 'Underwriting',
  status: 'Active',
  amount: 4_500_000,
  bankerName: 'M. Paller',
  targetCloseDate: '2026-09-30T00:00:00Z',
  productType: 'RLOC',
  loanStructure: 'Senior Secured',
  customerType: 'C&I',
  industry: 'Manufacturing',
  guarantorStructure: 'Two personal guarantors',
  pricingType: 'Floating',
  spreadIndex: 'SOFR',
  spreadMargin: 275,
  collateralSummary: 'A/R, inventory, equipment.',
  createdOn: '2026-01-15T00:00:00Z',
  // 12 days before mid-May 2026 — under the stale-stage threshold
  // so the card renders clean and we exercise the schema-limitation
  // banner in isolation.
  stageEntryDate: '2026-05-01T00:00:00Z',
  isClosed: false,
};

function dealDataValue(): DealData {
  return {
    deal: baseDeal,
    tasks: { kind: 'ready', data: { open: [], completed: [] } satisfies DealTasksResult },
    documents: {
      kind: 'ready',
      data: { outstanding: [], received: [], reviewed: [] } satisfies DealDocumentsResult,
    },
    creditMemo: {
      kind: 'ready',
      data: {
        memos: [
          {
            id: 'memo-1',
            name: 'Memo v1',
            status: 'Draft',
            statusKey: 'draft',
            memoType: 'Banker draft',
            version: 1,
            generatedAt: '2026-05-10T00:00:00Z',
            modifiedOn: '2026-05-10T00:00:00Z',
            borrowerSafe: false,
            textPreview: undefined,
          },
        ],
        sections: [],
      } satisfies CreditMemoData,
    },
    activity: { kind: 'ready', data: [] satisfies TimelineEvent[] },
    refresh: () => undefined,
  };
}

function renderCard() {
  useDealDataMock.mockReturnValue(dealDataValue());
  return render(<DealStageProgressionCard />);
}

describe('DealStageProgressionCard — Phase 28 schema-limitation banner', () => {
  it('renders the schema-limitation banner ("Advance Stage is not yet available")', () => {
    renderCard();
    expect(
      screen.getByText(/Advance Stage is not yet available/i),
    ).toBeInTheDocument();
  });

  it('schema-limitation detail names the missing pieces a future phase needs to add', () => {
    renderCard();
    expect(screen.getByText(/stage-reference/i)).toBeInTheDocument();
    expect(screen.getByText(/ordering|sequence/i)).toBeInTheDocument();
  });

  it('exposes NO Advance Stage / Move Stage / Promote / Submit button anywhere', () => {
    renderCard();
    const forbidden = /advance|move stage|promote|submit/i;
    const offending = screen
      .queryAllByRole('button')
      .filter((b) => forbidden.test(b.textContent ?? ''));
    expect(offending).toEqual([]);
  });

  it('still renders the Phase 27 eligibility surface (current stage, badge, next-action guidance)', () => {
    renderCard();
    expect(screen.getByText(/Current stage:\s*Underwriting/)).toBeInTheDocument();
    expect(screen.getByText(/Next action guidance/i)).toBeInTheDocument();
  });
});
