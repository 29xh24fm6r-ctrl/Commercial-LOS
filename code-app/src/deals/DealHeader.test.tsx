// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import type { DealDetail } from './dealQueries';

/**
 * Phase 125E — DealHeader command-hero tests.
 *
 * The Phase 125E command hero is no longer responsible for the
 * Loan amount / Target close metric strip — those values now live
 * in the DealMetricDeck below the hero. The hero focuses on deal
 * identity (eyebrow + name + client / banker / stage slots) and
 * a single Status chip.
 *
 * Pins:
 *   - the hero header renders the deal name as an <h1>;
 *   - eyebrow lockup reads "Commercial Lending Cockpit";
 *   - status chip renders "Status · <name>" when present and
 *     "Status · Not set" when missing — honest absence;
 *   - identity slots (Client / Banker / Stage) render the value or
 *     a "Not set" / "Not assigned" italic state when missing;
 *   - the rendered DOM does NOT carry the Phase-110-forbidden
 *     communication vocabulary;
 *   - the source file does NOT import any email-lane action /
 *     Office365OutlookService binding (Phase 110 lock).
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
    clientName: 'TEST — Borrower Phase 121',
    bankerName: 'Matthew Paller',
    stage: 'Underwriting',
    status: 'Active',
    amount: 2_500_000,
    targetCloseDate: '2026-06-03',
    stageEntryDate: '2026-05-20',
    createdOn: '2026-05-20',
    industry: undefined,
    customerType: undefined,
    productType: undefined,
    loanStructure: undefined,
    guarantorStructure: undefined,
    pricingType: undefined,
    spreadIndex: undefined,
    spreadMargin: undefined,
    collateralSummary: undefined,
    isClosed: false,
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
    refresh: vi.fn(),
  } as unknown as ReturnType<typeof useDealData>);
}

describe('Phase 125E — DealHeader command hero band', () => {
  it('renders the deal name as an <h1>', () => {
    setUp(deal());
    render(<DealHeader />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toBeInTheDocument();
    expect(heading.textContent).toBe('TEST — Deal Phase 121');
  });

  it('renders the eyebrow lockup "Commercial Lending Cockpit"', () => {
    setUp(deal());
    render(<DealHeader />);
    expect(
      screen.getByText(/Commercial Lending Cockpit/i),
    ).toBeInTheDocument();
  });

  it('renders the status chip "Status · <name>" when status is present', () => {
    setUp(deal({ status: 'Active' }));
    render(<DealHeader />);
    expect(screen.getByText(/Status · Active/i)).toBeInTheDocument();
  });

  it('renders honest "Status · Not set" chip when status is missing', () => {
    setUp(deal({ status: undefined }));
    render(<DealHeader />);
    expect(screen.getByText(/Status · Not set/i)).toBeInTheDocument();
  });

  it('renders the Client / Banker / Stage identity slots with values when present', () => {
    setUp(deal());
    render(<DealHeader />);
    expect(screen.getByText('Client')).toBeInTheDocument();
    expect(screen.getByText('TEST — Borrower Phase 121')).toBeInTheDocument();
    expect(screen.getByText('Banker')).toBeInTheDocument();
    expect(screen.getByText('Matthew Paller')).toBeInTheDocument();
    expect(screen.getByText('Stage')).toBeInTheDocument();
    expect(screen.getByText('Underwriting')).toBeInTheDocument();
  });

  it('renders italic "Not set" / "Not assigned" in identity slots when fields are missing (honest absence)', () => {
    setUp(
      deal({
        clientName: undefined,
        bankerName: undefined,
        stage: undefined,
      }),
    );
    render(<DealHeader />);
    // Client → Not set, Banker → Not assigned, Stage → Not set.
    expect(screen.getAllByText('Not set').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Not assigned')).toBeInTheDocument();
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

describe('Phase 125E — DealHeader.tsx static-source pins', () => {
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
