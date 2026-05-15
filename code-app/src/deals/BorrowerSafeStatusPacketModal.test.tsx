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
  // window.location.href is read-only in jsdom; provide a settable
  // mock so the Phase 67 Open-in-Outlook tests can inspect the URL.
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { href: '' },
    writable: true,
  });
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
      screen.getByText(/Prepared for banker review/i),
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
    // must respect Phase 45 + Phase 66 + Phase 67 conservative-copy
    // rules. "send" appears in instructional phrases ("the banker
    // sends from Outlook", "the app does not send") but never claims
    // a send happened.
    const everyText = document.body.textContent ?? '';
    expect(everyText).not.toMatch(/\bemail (sent|delivered)\b/i);
    expect(everyText).not.toMatch(/\bsent\s+(an?\s+)?email\b/i);
    expect(everyText).not.toMatch(/\bportal\b/i);
    expect(everyText).not.toMatch(/\bsecure message\b/i);
    expect(everyText).not.toMatch(/\bupload(ed)?\b/i);
    expect(everyText).not.toMatch(/\bapproved\b/i);
    expect(everyText).not.toMatch(/\baccepted\b/i);
    expect(everyText).not.toMatch(/\bcleared\b/i);
  });
});

// ---------------------------------------------------------------------------
// Phase 67 — Outlook handoff integration
// ---------------------------------------------------------------------------

describe('BorrowerSafeStatusPacketModal — Phase 67 handoff surfaces', () => {
  it('renders the Recipient (optional) input pre-filled empty', () => {
    render(
      <BorrowerSafeStatusPacketModal
        deal={sampleDeal}
        documents={sampleDocs}
        bankerName="M. Paller"
        onClose={vi.fn()}
      />,
    );
    const recipient = screen.getByLabelText(
      /Recipient \(optional\)/i,
    ) as HTMLInputElement;
    expect(recipient).toBeInTheDocument();
    expect(recipient.value).toBe('');
    // The helper line MUST tell the banker the field is optional and
    // that no verified borrower email exists on this deal.
    expect(
      screen.getByText(
        /Leave blank and choose in Outlook if you do not have a verified borrower email/i,
      ),
    ).toBeInTheDocument();
  });

  it('renders BOTH handoff actions: "Open in Outlook" and "Copy email"', () => {
    render(
      <BorrowerSafeStatusPacketModal
        deal={sampleDeal}
        documents={sampleDocs}
        bankerName="M. Paller"
        onClose={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('button', {
        name: /open borrower-safe email in outlook/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /copy borrower-safe email/i }),
    ).toBeInTheDocument();
  });

  it('Open in Outlook builds an RFC 6068 mailto URL with empty recipient when no email typed', async () => {
    render(
      <BorrowerSafeStatusPacketModal
        deal={sampleDeal}
        documents={sampleDocs}
        bankerName="M. Paller"
        onClose={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', {
        name: /open borrower-safe email in outlook/i,
      }),
    );
    // window.location.href is set with a mailto: URL that has an
    // EMPTY recipient (the banker fills it in Outlook).
    const url = window.location.href;
    expect(url).toMatch(/^mailto:\?/);
    // Encoded subject + body must be present.
    expect(url).toContain('subject=Status%20update%20%E2%80%94%20Acme%20Working%20Capital');
    expect(url).toContain('body=');
    // The mailto recipient slot — the bit between "mailto:" and "?" —
    // is empty. The client name appears in the BODY greeting, which
    // is the Phase 66 template, NOT in the recipient slot. We
    // never infer a recipient from clientName.
    const recipientSlot = url.slice('mailto:'.length, url.indexOf('?'));
    expect(recipientSlot).toBe('');
    // Outcome panel acknowledges the launch without claiming a send.
    expect(
      await screen.findByText(/outlook handoff launched/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/the app did not send/i)).toBeInTheDocument();
  });

  it('Open in Outlook honors a banker-typed recipient verbatim (encoded)', async () => {
    render(
      <BorrowerSafeStatusPacketModal
        deal={sampleDeal}
        documents={sampleDocs}
        bankerName="M. Paller"
        onClose={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText(/Recipient \(optional\)/i),
      'borrower@example.com',
    );
    await user.click(
      screen.getByRole('button', {
        name: /open borrower-safe email in outlook/i,
      }),
    );
    const url = window.location.href;
    expect(url).toMatch(/^mailto:borrower%40example\.com\?/);
  });

  it('Copy email writes the Phase 63 four-line format with EMPTY To: when no recipient', async () => {
    render(
      <BorrowerSafeStatusPacketModal
        deal={sampleDeal}
        documents={sampleDocs}
        bankerName="M. Paller"
        onClose={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    // userEvent.setup() installs its own Clipboard; install a spy
    // AFTER setup so the modal sees our vi.fn() at click time.
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    await user.click(
      screen.getByRole('button', { name: /copy borrower-safe email/i }),
    );
    expect(writeText).toHaveBeenCalledTimes(1);
    const payload = writeText.mock.calls[0]![0] as string;
    expect(payload).toMatch(
      /^To: \nSubject: Status update — Acme Working Capital\n\n/,
    );
    expect(payload).toContain('Items requested (1):');
    expect(payload).toContain('Personal Financial Statement');
    expect(payload).toContain('Items received (0):');
    expect(payload).toContain('Items under bank review (0):');
    expect(payload).toContain('Next requested actions:');
    // The outcome panel acknowledges the copy without claiming a send.
    expect(
      await screen.findByText(/email content copied to clipboard/i),
    ).toBeInTheDocument();
  });

  it('Copy email honors a banker-typed recipient on the To: line', async () => {
    render(
      <BorrowerSafeStatusPacketModal
        deal={sampleDeal}
        documents={sampleDocs}
        bankerName="M. Paller"
        onClose={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    await user.type(
      screen.getByLabelText(/Recipient \(optional\)/i),
      'borrower@example.com',
    );
    await user.click(
      screen.getByRole('button', { name: /copy borrower-safe email/i }),
    );
    const payload = writeText.mock.calls[0]![0] as string;
    expect(payload).toMatch(/^To: borrower@example\.com\n/);
  });

  it('handoff buttons disable until subject + body are non-empty', async () => {
    render(
      <BorrowerSafeStatusPacketModal
        deal={sampleDeal}
        documents={sampleDocs}
        bankerName="M. Paller"
        onClose={vi.fn()}
      />,
    );
    // Subject + body are pre-populated by the generator, so buttons
    // start enabled.
    expect(
      screen.getByRole('button', {
        name: /open borrower-safe email in outlook/i,
      }),
    ).not.toBeDisabled();
    // Clearing the body disables both handoff buttons.
    const user = userEvent.setup();
    const body = screen.getByLabelText(/borrower-safe summary/i);
    await user.clear(body);
    expect(
      screen.getByRole('button', {
        name: /open borrower-safe email in outlook/i,
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /copy borrower-safe email/i }),
    ).toBeDisabled();
  });

  it('mailto URL never contains internal deal data (collateral, margin, stage)', async () => {
    const internal: DealDetail = {
      ...sampleDeal,
      collateralSummary: 'SECRET COLLATERAL: equipment lien',
      spreadMargin: 99999,
      stage: 'SECRET-STAGE-Underwriting',
    };
    render(
      <BorrowerSafeStatusPacketModal
        deal={internal}
        documents={sampleDocs}
        bankerName="M. Paller"
        onClose={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', {
        name: /open borrower-safe email in outlook/i,
      }),
    );
    const url = window.location.href;
    expect(url).not.toContain('SECRET');
    expect(url).not.toContain('99999');
    expect(url).not.toContain('collateral');
    expect(url).not.toContain('margin');
  });
});