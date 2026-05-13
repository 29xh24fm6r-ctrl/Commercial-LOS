// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DealDetail } from './dealQueries';
import type { DealDocumentsResult } from './dealDocumentQueries';
import type { DealTasksResult } from './dealTaskQueries';
import { CreditMemoDraftModal } from './CreditMemoDraftModal';

const baseDeal: DealDetail = {
  id: 'deal-77',
  name: 'Acme Tooling 2026 Working Capital',
  clientName: 'Acme Tooling',
  stage: 'Underwriting',
  status: 'Active',
  amount: 4_500_000,
  bankerName: 'M. Paller',
  targetCloseDate: '2026-06-30T00:00:00Z',
  productType: 'Revolving Line of Credit',
  loanStructure: 'Senior Secured',
  customerType: 'C&I',
  industry: 'Manufacturing',
  guarantorStructure: 'Two personal guarantors, joint and several',
  pricingType: 'Floating',
  spreadIndex: 'SOFR',
  spreadMargin: 275,
  collateralSummary: 'A/R, inventory, and one piece of titled equipment.',
  createdOn: undefined,
  stageEntryDate: undefined,
  isClosed: false,
};

const noDocs: DealDocumentsResult = { outstanding: [], received: [], reviewed: [] };
const noTasks: DealTasksResult = { open: [], completed: [] };

beforeEach(() => {
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

describe('CreditMemoDraftModal — guardrails and structure', () => {
  it('renders the local-only banner with explicit "not saved, not final" framing and no-AI note', () => {
    render(
      <CreditMemoDraftModal
        deal={baseDeal}
        tasks={noTasks}
        documents={noDocs}
        existingMemos={undefined}
        onClose={vi.fn()}
      />,
    );
    // The phrase legitimately appears twice: once in the modal banner
    // and once in the generated memo body. Both are deliberate. We
    // just need at least one — scope to role=status to assert the
    // banner specifically.
    const banner = screen.getByRole('status');
    expect(banner.textContent).toMatch(
      /Draft preview — not saved, not final, banker review required/i,
    );
    expect(banner.textContent).toMatch(/No AI was used/i);
  });

  it('exposes NO Save / Finalize / Export / Submit / Send button', () => {
    render(
      <CreditMemoDraftModal
        deal={baseDeal}
        tasks={noTasks}
        documents={noDocs}
        existingMemos={undefined}
        onClose={vi.fn()}
      />,
    );
    const forbidden = /save|finalize|export|submit|send/i;
    const offending = screen
      .getAllByRole('button')
      .filter((b) => forbidden.test(b.textContent ?? ''));
    expect(offending).toEqual([]);
  });

  it('renders one checkbox per section in the suggested list', () => {
    render(
      <CreditMemoDraftModal
        deal={baseDeal}
        tasks={noTasks}
        documents={noDocs}
        existingMemos={undefined}
        onClose={vi.fn()}
      />,
    );
    const labels = [
      'Executive Summary',
      'Borrower / Relationship Overview',
      'Loan Request',
      'Collateral',
      'Guarantor Support',
      'Pricing / Structure',
      'Due Diligence / Documents',
      'Open Tasks / Conditions',
      'Risks / Blockers',
      'Recommended Next Steps',
    ];
    for (const l of labels) {
      const checkbox = screen.getByLabelText(l);
      expect(checkbox).toBeInstanceOf(HTMLInputElement);
      expect((checkbox as HTMLInputElement).type).toBe('checkbox');
      expect((checkbox as HTMLInputElement).checked).toBe(true);
    }
  });
});

describe('CreditMemoDraftModal — section toggling rewrites the body', () => {
  it('unchecking Collateral removes the Collateral section heading from the body', async () => {
    render(
      <CreditMemoDraftModal
        deal={baseDeal}
        tasks={noTasks}
        documents={noDocs}
        existingMemos={undefined}
        onClose={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    const body = screen.getByLabelText(/^memo body$/i) as HTMLTextAreaElement;
    expect(body.value).toContain('## Collateral');

    await user.click(screen.getByLabelText('Collateral'));
    expect(body.value).not.toContain('## Collateral');
    // Other sections still present.
    expect(body.value).toContain('## Executive Summary');
  });
});

describe('CreditMemoDraftModal — missing information panel', () => {
  it('surfaces no missing fields for a fully populated deal', () => {
    render(
      <CreditMemoDraftModal
        deal={baseDeal}
        tasks={noTasks}
        documents={noDocs}
        existingMemos={undefined}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/None detected for selected sections/i)).toBeInTheDocument();
  });

  it('lists missing fields when the deal is sparse', () => {
    const sparseDeal: DealDetail = {
      ...baseDeal,
      collateralSummary: undefined,
      guarantorStructure: undefined,
      amount: undefined,
      productType: undefined,
    };
    render(
      <CreditMemoDraftModal
        deal={sparseDeal}
        tasks={noTasks}
        documents={noDocs}
        existingMemos={undefined}
        onClose={vi.fn()}
      />,
    );
    // At least one of the missing fields should be visible in the panel.
    expect(screen.getByText(/Collateral — Collateral summary/)).toBeInTheDocument();
    expect(
      screen.getByText(/Guarantor Support — Guarantor structure/),
    ).toBeInTheDocument();
  });
});

describe('CreditMemoDraftModal — Copy behavior is local-only', () => {
  it('clicking Copy writes the body to the clipboard and shows the "Nothing has been saved" notice', async () => {
    render(
      <CreditMemoDraftModal
        deal={baseDeal}
        tasks={noTasks}
        documents={noDocs}
        existingMemos={undefined}
        onClose={vi.fn()}
      />,
    );
    // Override clipboard AFTER userEvent.setup() so it doesn't get
    // wrapped by userEvent's internal stub.
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    await user.click(screen.getByRole('button', { name: /copy draft to clipboard/i }));
    expect(writeText).toHaveBeenCalledTimes(1);
    const payload = writeText.mock.calls[0]![0] as string;
    expect(payload).toContain('# Credit Memo — DRAFT PREVIEW');
    expect(payload).toContain('Acme Tooling 2026 Working Capital');

    expect(
      await screen.findByText(/Nothing has been saved to Dataverse/i),
    ).toBeInTheDocument();
  });

  it('Copy is disabled when the body has been wiped to empty by the banker', async () => {
    render(
      <CreditMemoDraftModal
        deal={baseDeal}
        tasks={noTasks}
        documents={noDocs}
        existingMemos={undefined}
        onClose={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    const body = screen.getByLabelText(/^memo body$/i) as HTMLTextAreaElement;
    await user.clear(body);
    expect(screen.getByRole('button', { name: /copy draft to clipboard/i })).toBeDisabled();
  });
});
