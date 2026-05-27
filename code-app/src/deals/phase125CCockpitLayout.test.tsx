// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { DealDetail, DealLoadResult } from './dealQueries';

/**
 * Phase 125C — Banker Deal Workspace cockpit layout invariants.
 *
 * Sister file `phase125CCockpitVisuals.test.tsx` covers the
 * SeverityGlyph / StageRail / DealBlockers / DealAutopilotPanel
 * component-level pins. This file pins the workspace-level layout
 * treatments:
 *
 *   - The right-column "Attention and work surfaces" region carries
 *     the Phase 125C cobalt liquid-glass gradient overlay (the
 *     "premium attention surface" treatment).
 *
 * Strategy mirrors BankerDealWorkspace.test.tsx: every child card
 * is mocked as a sentinel `<div data-testid="...">` so this test
 * exercises only the workspace's own layout chrome.
 */

const { useBankerMock } = vi.hoisted(() => ({ useBankerMock: vi.fn() }));
const { loadDealForBankerMock } = vi.hoisted(() => ({
  loadDealForBankerMock: vi.fn(),
}));

vi.mock('../banker/BankerContext', () => ({
  useBanker: useBankerMock,
  useOptionalBanker: () => undefined,
}));

vi.mock('./dealQueries', () => ({
  loadDealForBanker: loadDealForBankerMock,
  loadDealForManager: vi.fn(),
  loadDealForTeam: vi.fn(),
}));

vi.mock('./DealDataProvider', () => ({
  DealDataProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="deal-data-provider">{children}</div>
  ),
  useDealData: () => ({
    deal: baseDeal(),
    tasks: { kind: 'ready', data: { open: [], completed: [] } },
    documents: {
      kind: 'ready',
      data: { outstanding: [], received: [], reviewed: [] },
    },
    creditMemo: { kind: 'ready', data: { memos: [], sections: [] } },
    activity: { kind: 'ready', data: [] },
    refresh: () => undefined,
  }),
}));

vi.mock('./DealHeader', () => ({
  DealHeader: () => <div data-testid="stub-deal-header">DealHeader</div>,
}));
vi.mock('./DealSummary', () => ({ DealSummary: () => null }));
vi.mock('./DealMetricDeck', () => ({ DealMetricDeck: () => null }));
vi.mock('./DealWorkstreamPanel', () => ({ DealWorkstreamPanel: () => null }));
vi.mock('./DealAutopilotPanel', () => ({ DealAutopilotPanel: () => null }));
vi.mock('./RelationshipContext', () => ({ RelationshipContext: () => null }));
vi.mock('./DealBlockers', () => ({ DealBlockers: () => null }));
vi.mock('./DealStageProgressionCard', () => ({
  DealStageProgressionCard: () => null,
}));
vi.mock('./DealTasks', () => ({ DealTasks: () => null }));
vi.mock('./DealDocuments', () => ({ DealDocuments: () => null }));
vi.mock('./CreditMemo', () => ({ CreditMemo: () => null }));
vi.mock('./ActivityTimeline', () => ({ ActivityTimeline: () => null }));
vi.mock('./BorrowerCommunication', () => ({
  BorrowerCommunication: () => null,
}));
vi.mock('./TeamsChatHandoff', () => ({ TeamsChatHandoff: () => null }));
vi.mock('./TeamsDealSummaryHandoff', () => ({
  TeamsDealSummaryHandoff: () => null,
}));

import { BankerDealWorkspace } from './BankerDealWorkspace';

function baseDeal(): DealDetail {
  return {
    id: 'd-stage',
    name: 'Acme RLOC',
    clientName: 'Acme',
    stage: 'Underwriting',
    status: 'Active',
    amount: 4_500_000,
    bankerName: 'M. Paller',
    targetCloseDate: '2026-09-30T00:00:00Z',
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
    stageEntryDate: '2026-05-15T00:00:00Z',
    isClosed: false,
  };
}

function readyResult(): DealLoadResult {
  return { kind: 'ready', deal: baseDeal() };
}

beforeEach(() => {
  vi.clearAllMocks();
  useBankerMock.mockReturnValue({
    bankerId: 'banker-1',
    fullName: 'Matthew Paller',
    email: 'mpaller@oldglorybank.com',
    systemUserId: 'sys-1',
    writeDisabledReason: undefined,
  });
  loadDealForBankerMock.mockResolvedValue(readyResult());
});

describe('Phase 125C — BankerDealWorkspace right-column liquid-glass overlay', () => {
  it('renders the right-column attention region with the cobalt gradient overlay', async () => {
    render(
      <MemoryRouter>
        <BankerDealWorkspace dealId="d-stage" />
      </MemoryRouter>,
    );
    const right = await screen.findByRole('region', {
      name: /attention and work surfaces/i,
    });
    const style = right.getAttribute('style') ?? '';
    expect(style).toMatch(/linear-gradient/);
    expect(style).toMatch(/96, ?165, ?250/);
  });
});
