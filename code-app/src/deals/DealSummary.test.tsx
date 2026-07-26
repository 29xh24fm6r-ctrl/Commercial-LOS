// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * N-25 remediation (Production Remediation Factory Arc Phase 8) — loan purpose, term, and
 * ownership structure already existed on DealDetail (Factory Arc Phase 3) but were never actually
 * rendered anywhere in the UI. This is the first test file for DealSummary.tsx; it pins that these
 * three facts (and the pre-existing ones) render honestly, including the "Not provided" fallback.
 */

vi.mock('./DealDataProvider', () => ({ useDealData: vi.fn() }));
vi.mock('../banker/BankerContext', () => ({ useOptionalBanker: vi.fn() }));

import { useDealData } from './DealDataProvider';
import { useOptionalBanker } from '../banker/BankerContext';
import { DealSummary } from './DealSummary';
import type { DealDetail } from './dealQueries';

const useDealDataMock = vi.mocked(useDealData);
const useBankerMock = vi.mocked(useOptionalBanker);

function baseDeal(over: Partial<DealDetail> = {}): DealDetail {
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
    ...over,
  };
}

beforeEach(() => {
  useBankerMock.mockReturnValue({
    bankerId: 'b1',
    fullName: 'Test Banker',
    email: 'b@x.com',
    systemUserId: 'sys-1',
    writeDisabledReason: undefined,
  } as never);
});

describe('DealSummary — loan purpose / term / ownership structure (N-25)', () => {
  it('renders all three when populated', () => {
    useDealDataMock.mockReturnValue({
      deal: baseDeal({ loanPurpose: 'Acquisition of commercial property', loanTermMonths: 60, ownershipStructure: 'LLC' }),
    } as never);
    render(<DealSummary />);
    expect(screen.getByText('Loan purpose')).toBeInTheDocument();
    expect(screen.getByText('Acquisition of commercial property')).toBeInTheDocument();
    expect(screen.getByText('Loan term')).toBeInTheDocument();
    expect(screen.getByText('60 months')).toBeInTheDocument();
    expect(screen.getByText('Ownership structure')).toBeInTheDocument();
    expect(screen.getByText('LLC')).toBeInTheDocument();
  });

  it('shows the honest "Not provided" fallback for each when absent — never fabricated', () => {
    useDealDataMock.mockReturnValue({
      deal: baseDeal({ loanPurpose: undefined, loanTermMonths: undefined, ownershipStructure: undefined }),
    } as never);
    render(<DealSummary />);
    const notProvided = screen.getAllByText('Not provided');
    // At least 3 (one per new fact) — other pre-existing facts are all populated in baseDeal().
    expect(notProvided.length).toBeGreaterThanOrEqual(3);
  });

  it('does not show a stray "0 months" when loanTermMonths is legitimately zero-like undefined', () => {
    useDealDataMock.mockReturnValue({ deal: baseDeal({ loanTermMonths: undefined }) } as never);
    render(<DealSummary />);
    expect(screen.queryByText(/0 months/)).toBeNull();
  });
});
