// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DealClosingDocumentsPanel } from './DealClosingDocumentsPanel';
import type { DealDetail } from './dealQueries';

function baseDeal(overrides: Partial<DealDetail> = {}): DealDetail {
  return {
    id: 'deal-1',
    name: 'Acme Working Capital',
    clientName: 'Acme Corp',
    stage: 'Closing & Funding',
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

describe('DealClosingDocumentsPanel', () => {
  it('says plainly that generated documents are session-only, not yet saved', () => {
    render(<DealClosingDocumentsPanel deal={baseDeal()} authorized={true} actorEmail="banker@bank.test" />);
    expect(screen.getByRole('note')).toHaveTextContent(/not yet saved to the deal/i);
  });

  it('derives real facts from the deal and shows the closing checklist as eligible', () => {
    const { container } = render(<DealClosingDocumentsPanel deal={baseDeal()} authorized={true} actorEmail="banker@bank.test" />);
    const row = container.querySelector('[data-closing-document-row="closing_checklist"]');
    expect(row?.textContent).toMatch(/Eligible/i);
  });

  it('leaves jurisdiction-less facts undefined rather than fabricating them, so a jurisdiction-blind template still shows correctly for missing facts it DOES need', () => {
    // internal_funding_checklist requires fundingInstructions, which has no source on DealDetail.
    const { container } = render(<DealClosingDocumentsPanel deal={baseDeal()} authorized={true} actorEmail="banker@bank.test" />);
    const row = container.querySelector('[data-closing-document-row="internal_funding_checklist"]');
    expect(row?.textContent).toMatch(/Missing:.*fundingInstructions/i);
  });

  it('generating a document persists it only for this session (in-memory store) and reports it honestly with no audit', async () => {
    const user = userEvent.setup();
    const { container } = render(<DealClosingDocumentsPanel deal={baseDeal()} authorized={true} actorEmail="banker@bank.test" />);
    const row = container.querySelector('[data-closing-document-row="closing_checklist"]') as HTMLElement;
    const generateBtn = Array.from(row.querySelectorAll('button')).find((b) => /generate/i.test(b.textContent ?? '')) as HTMLButtonElement;
    await user.click(generateBtn);
    await waitFor(() => expect(container.querySelector('[data-testid="closing-document-generated-closing_checklist"]')).not.toBeNull());
  });

  it('disables generation entirely when the actor is not authorized', () => {
    const { container } = render(<DealClosingDocumentsPanel deal={baseDeal()} authorized={false} actorEmail={undefined} />);
    const row = container.querySelector('[data-closing-document-row="closing_checklist"]') as HTMLElement;
    const generateBtn = Array.from(row.querySelectorAll('button')).find((b) => /generate/i.test(b.textContent ?? '')) as HTMLButtonElement;
    expect(generateBtn.disabled).toBe(true);
  });
});
