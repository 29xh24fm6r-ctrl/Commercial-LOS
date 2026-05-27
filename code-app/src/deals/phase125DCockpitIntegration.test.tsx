// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DealDetail, DealLoadResult } from './dealQueries';
import type { DealData } from './DealDataProvider';

/**
 * Phase 125D — BankerDealWorkspace cockpit integration.
 *
 * Pins:
 *   - the workspace mounts and renders the Phase 125D
 *     "Deal metric deck" region for a sparse Phase 121 seed;
 *   - no Phase-110 communication-lane vocabulary leaks into
 *     the rendered cockpit shell;
 *   - no fake AI / approval-odds / predictive language is
 *     introduced anywhere in the cockpit shell;
 *   - the cockpit shell + the new Phase 125D files
 *     (DealMetricDeck, DealWorkstreamPanel, dealCockpitMetrics)
 *     do NOT carry the Phase 110 forbidden communication-lane
 *     imports or SDK service references (deriver is pure).
 *
 * Every child card is mocked as a sentinel so the test exercises
 * the cockpit shell + the new zones, not the per-card internals
 * (those have their own test files).
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
  useDealData: (): DealData => ({
    deal: sparseDeal(),
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

// Stub every child card so this file exercises only the
// cockpit shell + the new Phase 125D zones.
vi.mock('./DealHeader', () => ({
  DealHeader: () => <div data-testid="stub-deal-header">DealHeader</div>,
}));
vi.mock('./DealSummary', () => ({ DealSummary: () => null }));
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

function sparseDeal(): DealDetail {
  return {
    id: 'd-sparse',
    name: 'TEST — Deal Phase 121',
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
  };
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
  loadDealForBankerMock.mockResolvedValue({
    kind: 'ready',
    deal: sparseDeal(),
  } as DealLoadResult);
});

describe('Phase 125D — Cockpit integration (sparse seed + governance)', () => {
  it('renders the cockpit shell + metric deck zone without crashing for a sparse Phase 121 deal', async () => {
    render(
      <MemoryRouter>
        <BankerDealWorkspace dealId="d-sparse" />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole('region', { name: /Deal metric deck/i }),
    ).toBeInTheDocument();
  });

  it('does NOT render any forbidden Phase-110 communication-lane vocabulary in the cockpit shell', async () => {
    render(
      <MemoryRouter>
        <BankerDealWorkspace dealId="d-sparse" />
      </MemoryRouter>,
    );
    await screen.findByRole('region', { name: /Deal metric deck/i });
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/\bdelivered\b/i);
    expect(text).not.toMatch(/\bemail\s+(sent|delivered)\b/i);
    expect(text).not.toMatch(/\bborrower\s+(?:was|has\s+been)\s+notified\b/i);
  });

  it('does NOT introduce fake AI / predictive / approval-odds / ranking language in the cockpit shell', async () => {
    render(
      <MemoryRouter>
        <BankerDealWorkspace dealId="d-sparse" />
      </MemoryRouter>,
    );
    await screen.findByRole('region', { name: /Deal metric deck/i });
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/\bAI[- ]?generated\b/i);
    expect(text).not.toMatch(/\bapproval\s+probability\b/i);
    expect(text).not.toMatch(/\bapproval\s+odds\b/i);
    expect(text).not.toMatch(/\bborrower\s+sentiment\b/i);
    expect(text).not.toMatch(/\bpredicted\s+close\s+date\b/i);
    expect(text).not.toMatch(/\brisk\s+rating\b/i);
    expect(text).not.toMatch(/\bdeal\s+score\b/i);
  });
});

describe('Phase 125D — Source-file static pins', () => {
  const SRC_WORKSPACE = readFileSync(
    resolve(__dirname, 'BankerDealWorkspace.tsx'),
    'utf8',
  );
  const SRC_METRIC_DECK = readFileSync(
    resolve(__dirname, 'DealMetricDeck.tsx'),
    'utf8',
  );
  const SRC_WORKSTREAM = readFileSync(
    resolve(__dirname, 'DealWorkstreamPanel.tsx'),
    'utf8',
  );
  const SRC_METRICS = readFileSync(
    resolve(__dirname, 'dealCockpitMetrics.ts'),
    'utf8',
  );

  it('cockpit shell does NOT import Office365OutlookService (Phase 110 lock)', () => {
    expect(SRC_WORKSPACE).not.toMatch(
      /from\s+['"][^'"]*Office365OutlookService['"]/,
    );
  });

  it('cockpit shell does NOT call SendEmailV2 anywhere (Phase 110 single-callsite invariant)', () => {
    expect(SRC_WORKSPACE).not.toMatch(/SendEmailV2\s*\(/);
  });

  it('metric deck has no email-send / governed-write imports', () => {
    expect(SRC_METRIC_DECK).not.toMatch(/Office365OutlookService/);
    expect(SRC_METRIC_DECK).not.toMatch(/SendEmailV2/);
    expect(SRC_METRIC_DECK).not.toMatch(/sendBorrowerUpdateEmail/);
    expect(SRC_METRIC_DECK).not.toMatch(/sendDocumentRequestEmail/);
  });

  it('workstream panel has no email-send / governed-write imports', () => {
    expect(SRC_WORKSTREAM).not.toMatch(/Office365OutlookService/);
    expect(SRC_WORKSTREAM).not.toMatch(/SendEmailV2/);
    expect(SRC_WORKSTREAM).not.toMatch(/sendBorrowerUpdateEmail/);
    expect(SRC_WORKSTREAM).not.toMatch(/sendDocumentRequestEmail/);
  });

  it('deriveDealCockpitMetrics is a pure-function module — no SDK service imports, no governed writes', () => {
    expect(SRC_METRICS).not.toMatch(/Cr664_[A-Za-z0-9]+Service/);
    expect(SRC_METRICS).not.toMatch(/Office365/);
    expect(SRC_METRICS).not.toMatch(/SendEmailV2/);
  });
});
