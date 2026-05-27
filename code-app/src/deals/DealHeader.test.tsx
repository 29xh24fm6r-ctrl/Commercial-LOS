// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import type { DealDetail } from './dealQueries';

/**
 * Phase 125 — DealHeader cockpit hero band tests.
 *
 * Pins:
 *   - the hero header renders the deal name as an <h1>;
 *   - the loan-amount hero block surfaces a formatted amount when
 *     present, and an honest "Not set" italic state when missing
 *     (never a silent "—" or fabricated value);
 *   - the eyebrow row renders "Deal · Commercial Lending" + the
 *     stage chip + the status chip when both are present;
 *   - target-close, client, banker each surface "Not set" when
 *     missing — honest absence, never fabricated;
 *   - the rendered DOM does NOT carry the Phase-110-forbidden
 *     communication vocabulary;
 *   - the source file does NOT import any email-lane action /
 *     Office365OutlookService binding (Phase 110 communication
 *     lock invariant).
 */

vi.mock('./DealDataProvider', () => ({
  useDealData: vi.fn(),
}));

import { useDealData } from './DealDataProvider';
import { DealHeader } from './DealHeader';

const useDealDataMock = vi.mocked(useDealData);

function deal(overrides: Partial<DealDetail> = {}): DealDetail {
  return {
    id: 'd1',
    name: 'TEST — Deal Phase 121',
    clientId: 'c1',
    clientName: 'TEST — Borrower Phase 121',
    bankerId: 'b1',
    bankerName: 'Matthew Paller',
    teamId: undefined,
    teamName: undefined,
    stage: 'Underwriting',
    status: 'Active',
    amount: 2_500_000,
    targetCloseDate: '2026-06-03',
    actualCloseDate: undefined,
    closedFlag: false,
    isTerminalStatus: false,
    isInflightStatus: true,
    stageEntryDate: '2026-05-20',
    createdOn: '2026-05-20',
    modifiedOn: '2026-05-26',
    industry: undefined,
    customerType: undefined,
    productType: undefined,
    loanStructure: undefined,
    guarantorStructure: undefined,
    pricingType: undefined,
    spreadIndex: undefined,
    spreadMargin: undefined,
    collateralSummary: undefined,
    ...overrides,
  } as DealDetail;
}

function setUp(d: DealDetail) {
  useDealDataMock.mockReturnValue({
    deal: d,
    tasks: { kind: 'loading' },
    documents: { kind: 'loading' },
    creditMemo: { kind: 'loading' },
    activity: { kind: 'loading' },
    reloadTasks: vi.fn(),
    reloadDocuments: vi.fn(),
    reloadCreditMemo: vi.fn(),
    reloadActivity: vi.fn(),
  } as unknown as ReturnType<typeof useDealData>);
}

describe('Phase 125 — DealHeader cockpit hero band', () => {
  it('renders the deal name as an <h1>', () => {
    setUp(deal());
    render(<DealHeader />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toBeInTheDocument();
    expect(heading.textContent).toBe('TEST — Deal Phase 121');
  });

  it('renders the eyebrow lockup "Commercial Lending Deal"', () => {
    setUp(deal());
    render(<DealHeader />);
    expect(screen.getByText(/Commercial Lending Deal/i)).toBeInTheDocument();
  });

  it('renders the stage chip and status chip when both are present (Phase 125B markup: "Stage · <name>" / "Status · <name>")', () => {
    setUp(deal({ stage: 'Underwriting', status: 'Active' }));
    render(<DealHeader />);
    expect(screen.getByText(/Stage · Underwriting/i)).toBeInTheDocument();
    expect(screen.getByText(/Status · Active/i)).toBeInTheDocument();
  });

  it('renders honest "Stage · Not set" / "Status · Not set" chips when those fields are missing', () => {
    setUp(deal({ stage: undefined, status: undefined }));
    render(<DealHeader />);
    expect(screen.getByText(/Stage · Not set/i)).toBeInTheDocument();
    expect(screen.getByText(/Status · Not set/i)).toBeInTheDocument();
  });

  it('renders the formatted loan amount when the deal has an amount', () => {
    setUp(deal({ amount: 2_500_000 }));
    render(<DealHeader />);
    expect(screen.getByText('Loan amount')).toBeInTheDocument();
    // Currency formatting is locale-dependent; pin the dollar sign + magnitude.
    expect(screen.getByText(/\$2,500,000/)).toBeInTheDocument();
  });

  it('surfaces an honest "Not set" amount when the deal has no amount (no fabricated $0)', () => {
    setUp(deal({ amount: undefined }));
    render(<DealHeader />);

    // The amount hero block still renders its label, but the value
    // is the italic "Not set" copy — never $0.
    expect(screen.getByText('Loan amount')).toBeInTheDocument();
    expect(screen.getByText('Not set')).toBeInTheDocument();
    expect(screen.queryByText(/^\$0$/)).toBeNull();
  });

  it('surfaces "Not set" for missing client / banker / target close (honest absence)', () => {
    setUp(
      deal({
        clientName: undefined,
        bankerName: undefined,
        targetCloseDate: undefined,
      }),
    );
    render(<DealHeader />);

    // All three Fact rows render "Not set" instead of an empty
    // dash filler.
    const notSetMatches = screen.getAllByText('Not set');
    expect(notSetMatches.length).toBeGreaterThanOrEqual(3);
  });

  it('does NOT render the forbidden Phase-110 communication-lane vocabulary', () => {
    setUp(deal());
    render(<DealHeader />);
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/\bdelivered\b/i);
    expect(text).not.toMatch(/\bemail\s+(sent|delivered)\b/i);
    expect(text).not.toMatch(/\bborrower\s+(?:was|has\s+been)\s+notified\b/i);
  });
});

describe('Phase 125 — DealHeader.tsx static-source pins', () => {
  const SRC = readFileSync(resolve(__dirname, 'DealHeader.tsx'), 'utf8');

  it('does NOT import Office365OutlookService (Phase 110 lock)', () => {
    expect(SRC).not.toMatch(/from\s+['"][^'"]*Office365OutlookService['"]/);
  });

  it('does NOT call SendEmailV2 (Phase 110 single-callsite invariant)', () => {
    expect(SRC).not.toMatch(/SendEmailV2\s*\(/);
  });

  it('does NOT import any sendXEmail action (the header does not send mail)', () => {
    expect(SRC).not.toMatch(/from\s+['"][^'"]*sendDocumentRequestEmail['"]/);
    expect(SRC).not.toMatch(/from\s+['"][^'"]*sendBorrowerUpdateEmail['"]/);
  });
});
