// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DealDetail } from './dealQueries';
import type { DealDocumentsResult } from './dealDocumentQueries';
import { BorrowerSafeStatusPacketModal } from './BorrowerSafeStatusPacketModal';

const sampleDeal: DealDetail = {
  id: 'deal-77',
  name: 'Acme Working Capital',
  clientName: 'Acme Manufacturing, LLC',
  stage: 'Underwriting',
  status: 'Active',
  amount: 4_500_000,
  bankerName: 'M. Paller',
  targetCloseDate: '2026-09-30T00:00:00Z',
  productType: 'RLOC',
  loanStructure: 'Senior Secured',
  customerType: 'C&I',
  industry: 'Manufacturing',
  guarantorStructure: 'Two personal',
  pricingType: 'Floating',
  spreadIndex: 'SOFR',
  spreadMargin: 275,
  collateralSummary: 'A/R, inventory',
  createdOn: '2026-01-15T00:00:00Z',
  stageEntryDate: '2026-05-01T00:00:00Z',
  isClosed: false,
};

const sampleDocs: DealDocumentsResult = {
  outstanding: [
    {
      id: 'd-1',
      name: 'Personal Financial Statement',
      dueDate: '2026-06-15T00:00:00Z',
      requestDate: '2026-05-12T00:00:00Z',
      receivedDate: undefined,
      reviewer: undefined,
      uploaded: false,
      modifiedOn: undefined,
      status: 'outstanding',
    },
  ],
  received: [],
  reviewed: [],
};

beforeEach(() => {
  // The modal uses navigator.clipboard.writeText. jsdom + userEvent
  // install their own clipboard; spy via Object.defineProperty after
  // userEvent.setup() in the relevant tests. For setup-only tests
  // (render assertions) we don't need to touch the clipboard.
});

describe('BorrowerSafeStatusPacketModal — Phase 66 local preview', () => {
  it('renders the local-preview-only banner and no "sent" claim', () => {
    render(
      <BorrowerSafeStatusPacketModal
        deal={sampleDeal}
        documents={sampleDocs}
        bankerName="M. Paller"
        onClose={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('heading', { name: /borrower-safe status packet/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Local preview only — nothing is saved to this deal/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/the app does not send this/i),
    ).toBeInTheDocument();
  });

  it('renders the deal header facts (deal name, borrower, item counts)', () => {
    render(
      <BorrowerSafeStatusPacketModal
        deal={sampleDeal}
        documents={sampleDocs}
        bankerName="M. Paller"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('Acme Working Capital')).toBeInTheDocument();
    expect(screen.getByText('Acme Manufacturing, LLC')).toBeInTheDocument();
    // Three count facts.
    expect(screen.getByText('Items requested')).toBeInTheDocument();
    expect(screen.getByText('Items received')).toBeInTheDocument();
    expect(screen.getByText('Items under bank review')).toBeInTheDocument();
  });

  it('subject field defaults to "Status update — <deal name>"', () => {
    render(
      <BorrowerSafeStatusPacketModal
        deal={sampleDeal}
        documents={sampleDocs}
        bankerName="M. Paller"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/^Subject$/i)).toHaveValue(
      'Status update — Acme Working Capital',
    );
  });

  it('body textarea contains the borrower-safe sections', () => {
    render(
      <BorrowerSafeStatusPacketModal
        deal={sampleDeal}
        documents={sampleDocs}
        bankerName="M. Paller"
        onClose={vi.fn()}
      />,
    );
    const body = screen.getByLabelText(/borrower-safe summary/i) as HTMLTextAreaElement;
    expect(body.value).toContain('Items requested (1):');
    expect(body.value).toContain('Personal Financial Statement');
    expect(body.value).toContain('Items received (0):');
    expect(body.value).toContain('Items under bank review (0):');
    expect(body.value).toContain('Next requested actions:');
    expect(body.value).toContain('Thank you,\nM. Paller');
  });

  it('Copy button copies "Subject: …\\n\\n<body>" via navigator.clipboard.writeText', async () => {
    render(
      <BorrowerSafeStatusPacketModal
        deal={sampleDeal}
        documents={sampleDocs}
        bankerName="M. Paller"
        onClose={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    // userEvent.setup() installs its own Clipboard. Install a spy
    // AFTER setup so the modal sees our vi.fn() at click time.
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    await user.click(
      screen.getByRole('button', {
        name: /copy borrower-safe status packet/i,
      }),
    );
    expect(writeText).toHaveBeenCalledTimes(1);
    const payload = writeText.mock.calls[0]![0] as string;
    expect(payload).toMatch(
      /^Subject: Status update — Acme Working Capital\n\n/,
    );
    expect(payload).toContain('Items requested (1):');
    expect(payload).toContain('Personal Financial Statement');
    // After a successful copy, the button label flips and the
    // outcome panel appears.
    expect(await screen.findByText(/^copied to clipboard$/i)).toBeInTheDocument();
  });

  it('Esc closes the modal', async () => {
    const onClose = vi.fn();
    render(
      <BorrowerSafeStatusPacketModal
        deal={sampleDeal}
        documents={sampleDocs}
        bankerName="M. Paller"
        onClose={onClose}
      />,
    );
    const user = userEvent.setup();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does NOT render any "send" / "delivered" / "portal" claim anywhere on screen', () => {
    render(
      <BorrowerSafeStatusPacketModal
        deal={sampleDeal}
        documents={sampleDocs}
        bankerName="M. Paller"
        onClose={vi.fn()}
      />,
    );
    // The modal's own UI text (banner + helper line + button + footer)
    // must respect Phase 45 conservative-copy rules. We allow the
    // word "send" in instructional phrases ("send it through your own
    // mail client", "send manually") but NEVER claim a send happened.
    const everyText = document.body.textContent ?? '';
    expect(everyText).not.toMatch(/\bemail (sent|delivered)\b/i);
    expect(everyText).not.toMatch(/\bsent\s+(an?\s+)?email\b/i);
    expect(everyText).not.toMatch(/\bportal\b/i);
    expect(everyText).not.toMatch(/\bsecure message\b/i);
  });
});
