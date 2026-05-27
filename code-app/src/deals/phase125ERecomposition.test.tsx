// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DealDetail, DealLoadResult } from './dealQueries';
import type { DealData } from './DealDataProvider';

/**
 * Phase 125E — Full deal cockpit recomposition tests.
 *
 * The Phase 125D KPI deck + workstream panel + severity meter
 * passed but the page still read as a stacked-card workspace.
 * Phase 125E recomposes the visual hierarchy:
 *
 *   1. Command Hero (navy band, identity slots, single status
 *      chip) — no longer carries the metric strip.
 *   2. KPI Deck — 6 LARGE tonal tiles + completeness ring.
 *   3. Attention Console — big severity meter + missing-data
 *      checklist + signal rows. NOT a thin text panel.
 *   4. Stage Map — large connected node rail (44/52px nodes).
 *   5. Action Console — priority meter + suggestion rows.
 *   6. Workstream Progress — 4 horizontal mini bars.
 *   7. ... right-rail widgets (Tasks / Documents / Comm /
 *      Memo / Teams) with icon-led widget headers.
 *   8. Deal Summary — demoted to the BOTTOM of the left column
 *      as a compact reference table; no longer dominant.
 *
 * This test file pins the visual structure / hierarchy / icon
 * presence / governance invariants. Per-component internals
 * (priority stripes, severity glyphs, etc.) stay in their own
 * test files.
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

// Stub every detail card so this file only exercises the
// cockpit shell + the new Phase 125E zones (the actual cards
// have their own test files).
vi.mock('./DealAutopilotPanel', () => ({
  DealAutopilotPanel: () => (
    <div data-testid="stub-action-console">ActionConsole</div>
  ),
}));
vi.mock('./RelationshipContext', () => ({ RelationshipContext: () => null }));
vi.mock('./DealBlockers', () => ({
  DealBlockers: () => <div data-testid="stub-attention-console">AttentionConsole</div>,
}));
vi.mock('./DealStageProgressionCard', () => ({
  DealStageProgressionCard: () => <div data-testid="stub-stage-map">StageMap</div>,
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
vi.mock('./DealSummary', () => ({
  DealSummary: () => <div data-testid="stub-deal-summary">DealSummary</div>,
}));
vi.mock('./DealWorkstreamPanel', () => ({
  DealWorkstreamPanel: () => <div data-testid="stub-workstream">Workstream</div>,
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

function offsetOf(label: string): number {
  const el = screen.getByRole('region', { name: new RegExp(label, 'i') });
  return el.compareDocumentPosition(document.body) & Node.DOCUMENT_POSITION_PRECEDING
    ? (el.getBoundingClientRect().top * -1)
    : indexInDocument(el);
}

function indexInDocument(el: Element): number {
  let pos = 0;
  let cursor: Node | null = document.body;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  while ((cursor = walker.nextNode())) {
    if (cursor === el) return pos;
    pos += 1;
  }
  return -1;
}

describe('Phase 125E — Cockpit recomposition (visual hierarchy)', () => {
  it('renders the command hero, the metric deck region, and the two cockpit columns in order', async () => {
    render(
      <MemoryRouter>
        <BankerDealWorkspace dealId="d-sparse" />
      </MemoryRouter>,
    );
    // Hero
    const hero = await screen.findByLabelText(/Deal command hero/i);
    expect(hero).toBeInTheDocument();
    // Metric deck
    const deck = screen.getByRole('region', { name: /Deal metric deck/i });
    expect(deck).toBeInTheDocument();
    // Cockpit grid (left + right columns).
    expect(
      screen.getByRole('region', { name: /Deal intelligence and detail/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: /Attention and work surfaces/i }),
    ).toBeInTheDocument();
  });

  it('renders the Attention Console BEFORE the Deal Summary in the left column (summary is demoted to bottom)', async () => {
    render(
      <MemoryRouter>
        <BankerDealWorkspace dealId="d-sparse" />
      </MemoryRouter>,
    );
    await screen.findByLabelText(/Deal command hero/i);
    const attention = offsetOf('Deal intelligence and detail');
    // Find Attention Console + Deal Summary inside the doc.
    const attentionStub = screen.getByTestId('stub-attention-console');
    const summaryStub = screen.getByTestId('stub-deal-summary');
    expect(attentionStub).toBeInTheDocument();
    expect(summaryStub).toBeInTheDocument();
    // Attention console must appear BEFORE the summary.
    const order = attentionStub.compareDocumentPosition(summaryStub);
    expect(order & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(attention).toBeGreaterThan(-1);
  });

  it('renders the Stage Map and Action Console between Attention Console and Deal Summary', async () => {
    render(
      <MemoryRouter>
        <BankerDealWorkspace dealId="d-sparse" />
      </MemoryRouter>,
    );
    await screen.findByLabelText(/Deal command hero/i);
    const attention = screen.getByTestId('stub-attention-console');
    const stage = screen.getByTestId('stub-stage-map');
    const action = screen.getByTestId('stub-action-console');
    const summary = screen.getByTestId('stub-deal-summary');
    // Document order: Attention → Stage → Action → Summary.
    expect(
      attention.compareDocumentPosition(stage) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      stage.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      action.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('does NOT render any forbidden Phase-110 communication-lane vocabulary in the recomposed shell', async () => {
    render(
      <MemoryRouter>
        <BankerDealWorkspace dealId="d-sparse" />
      </MemoryRouter>,
    );
    await screen.findByLabelText(/Deal command hero/i);
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/\bdelivered\b/i);
    expect(text).not.toMatch(/\bemail\s+(sent|delivered)\b/i);
    expect(text).not.toMatch(/\bborrower\s+(?:was|has\s+been)\s+notified\b/i);
  });

  it('does NOT introduce fake AI / approval-odds / predictive / ranking / deal-score language in the recomposed shell', async () => {
    render(
      <MemoryRouter>
        <BankerDealWorkspace dealId="d-sparse" />
      </MemoryRouter>,
    );
    await screen.findByLabelText(/Deal command hero/i);
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

describe('Phase 125E — Source-file static pins for the recomposition', () => {
  const READ = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');

  it('BankerDealWorkspace renders DealSummary AFTER ActivityTimeline (summary demoted to bottom)', () => {
    const src = READ('BankerDealWorkspace.tsx');
    const summaryIdx = src.indexOf('<DealSummary');
    const activityIdx = src.indexOf('<ActivityTimeline');
    expect(summaryIdx).toBeGreaterThan(-1);
    expect(activityIdx).toBeGreaterThan(-1);
    expect(summaryIdx).toBeGreaterThan(activityIdx);
  });

  it('BankerDealWorkspace renders DealBlockers BEFORE DealStageProgressionCard (Attention before Stage Map)', () => {
    const src = READ('BankerDealWorkspace.tsx');
    const blockersIdx = src.indexOf('<DealBlockers');
    const stageIdx = src.indexOf('<DealStageProgressionCard');
    expect(blockersIdx).toBeGreaterThan(-1);
    expect(stageIdx).toBeGreaterThan(-1);
    expect(blockersIdx).toBeLessThan(stageIdx);
  });

  it('BankerDealWorkspace cockpit shell does NOT import Office365OutlookService (Phase 110 lock)', () => {
    const src = READ('BankerDealWorkspace.tsx');
    expect(src).not.toMatch(
      /from\s+['"][^'"]*Office365OutlookService['"]/,
    );
  });

  it('BankerDealWorkspace cockpit shell does NOT call SendEmailV2 anywhere', () => {
    const src = READ('BankerDealWorkspace.tsx');
    expect(src).not.toMatch(/SendEmailV2\s*\(/);
  });

  it('DealMetricDeck has no email-send / governed-write imports', () => {
    const src = READ('DealMetricDeck.tsx');
    expect(src).not.toMatch(/Office365OutlookService/);
    expect(src).not.toMatch(/SendEmailV2/);
    expect(src).not.toMatch(/sendBorrowerUpdateEmail/);
    expect(src).not.toMatch(/sendDocumentRequestEmail/);
  });

  it('DealHeader command hero has no email-send / governed-write imports', () => {
    const src = READ('DealHeader.tsx');
    expect(src).not.toMatch(/Office365OutlookService/);
    expect(src).not.toMatch(/SendEmailV2/);
    expect(src).not.toMatch(/sendBorrowerUpdateEmail/);
    expect(src).not.toMatch(/sendDocumentRequestEmail/);
  });
});

describe('Phase 125E — Cockpit primitives static pins', () => {
  const READ = (rel: string) =>
    readFileSync(resolve(__dirname, '..', 'shared', rel), 'utf8');

  it('cockpitIcons exports the named inline-SVG glyphs the cockpit uses', () => {
    const src = READ('cockpitIcons.tsx');
    // Spot-check a few of the named exports.
    for (const name of [
      'DollarIcon',
      'AlertIcon',
      'ChecklistIcon',
      'DocumentsIcon',
      'MailIcon',
      'CalendarIcon',
      'ActivityIcon',
      'StageIcon',
      'BankerIcon',
      'ClientIcon',
      'SparkleIcon',
      'MemoIcon',
      'TeamsIcon',
    ]) {
      expect(src).toMatch(new RegExp(`export function ${name}\\b`));
    }
  });

  it('cockpitPrimitives exports LargeMetricTile and WidgetHeader', () => {
    const src = READ('cockpitPrimitives.tsx');
    expect(src).toMatch(/export function LargeMetricTile/);
    expect(src).toMatch(/export function WidgetHeader/);
  });
});
