// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Phase 105: the modal transitively imports sendBorrowerUpdateEmail
// (for its input/outcome types), which imports the Office 365
// Outlook connector service. Stub the boundary so the real
// @microsoft/power-apps SDK is not loaded by these UI tests.
vi.mock('../generated/services/Office365OutlookService', () => ({
  Office365OutlookService: { SendEmailV2: vi.fn() },
}));
// Also mock the audit / timeline services in case the action is
// imported by anything in the modal's transitive graph — keep the
// boundary clean.
vi.mock('../generated/services/Cr664_auditeventsService', () => ({
  Cr664_auditeventsService: { create: vi.fn() },
}));
vi.mock('../generated/services/Cr664_dealtimelineeventsService', () => ({
  Cr664_dealtimelineeventsService: { create: vi.fn() },
}));

import type { DealDetail } from './dealQueries';
import type { DealDocument } from './dealDocumentQueries';
import { DraftBorrowerUpdateModal } from './DraftBorrowerUpdateModal';
import type {
  SendBorrowerUpdateEmailInput,
  SendBorrowerUpdateEmailOutcome,
} from './sendBorrowerUpdateEmail';

const baseDeal: DealDetail = {
  id: 'deal-77',
  name: 'Acme Tooling 2026 Working Capital',
  clientName: 'Acme Tooling',
  stage: 'Underwriting',
  status: 'Active',
  amount: 4_500_000,
  bankerName: 'M. Paller',
  targetCloseDate: '2026-06-30T00:00:00Z',
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

const sampleDocs: DealDocument[] = [
  {
    id: 'doc-1',
    name: 'Personal Financial Statement',
    dueDate: '2026-05-30T00:00:00Z',
    requestDate: undefined,
    receivedDate: undefined,
    reviewer: undefined,
    uploaded: false,
    modifiedOn: undefined,
    status: 'outstanding',
  },
  {
    id: 'doc-2',
    name: '2024 Business Tax Return',
    dueDate: '2026-06-01T00:00:00Z',
    requestDate: undefined,
    receivedDate: undefined,
    reviewer: undefined,
    uploaded: false,
    modifiedOn: undefined,
    status: 'outstanding',
  },
];

function defaultProps(
  overrides: Partial<React.ComponentProps<typeof DraftBorrowerUpdateModal>> = {},
): React.ComponentProps<typeof DraftBorrowerUpdateModal> {
  return {
    deal: baseDeal,
    outstandingDocuments: sampleDocs,
    openTasks: [],
    bankerName: 'M. Paller',
    dealId: 'deal-77',
    systemUserId: 'sys-user-1',
    writeDisabledReason: undefined,
    onSendEmail: undefined,
    onClose: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

describe('DraftBorrowerUpdateModal — guardrails and structure', () => {
  it('renders the Phase 105 mode banner reflecting EMAIL_MODE', () => {
    render(<DraftBorrowerUpdateModal {...defaultProps()} />);
    // Default test EMAIL_MODE is DRY_RUN, so the banner should say so.
    expect(screen.getByText(/Mode: DRY_RUN\./)).toBeInTheDocument();
    expect(screen.getByText(/nothing leaves the client/i)).toBeInTheDocument();
  });

  it('renders all four template options in the selector', () => {
    render(<DraftBorrowerUpdateModal {...defaultProps()} />);
    const select = screen.getByLabelText(/^template$/i) as HTMLSelectElement;
    const optionLabels = Array.from(select.options).map((o) => o.textContent);
    expect(optionLabels).toEqual([
      'General Status Update',
      'Missing Documents Reminder',
      'Underwriting Update',
      'Closing Progress Update',
    ]);
  });

  it('shows the borrower (client) name in the To field and the deal name', () => {
    render(<DraftBorrowerUpdateModal {...defaultProps()} />);
    expect(screen.getAllByText(/Acme Tooling/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Acme Tooling 2026 Working Capital/).length).toBeGreaterThan(0);
  });
});

describe('DraftBorrowerUpdateModal — template-driven generation', () => {
  it('switching to Missing Documents Reminder rewrites the body to include outstanding doc names', async () => {
    render(<DraftBorrowerUpdateModal {...defaultProps()} />);
    const user = userEvent.setup();
    const select = screen.getByLabelText(/^template$/i);
    await user.selectOptions(select, 'missing-documents');

    const body = screen.getByLabelText(/^body$/i) as HTMLTextAreaElement;
    expect(body.value).toContain('Personal Financial Statement');
    expect(body.value).toContain('2024 Business Tax Return');
  });

  it('subject contains the deal name regardless of selected template', async () => {
    render(<DraftBorrowerUpdateModal {...defaultProps()} />);
    const user = userEvent.setup();
    const select = screen.getByLabelText(/^template$/i);
    const subject = screen.getByLabelText(/^subject$/i) as HTMLInputElement;

    for (const t of [
      'general-status',
      'missing-documents',
      'underwriting-update',
      'closing-progress',
    ]) {
      await user.selectOptions(select, t);
      expect(subject.value).toContain('Acme Tooling 2026 Working Capital');
    }
  });
});

describe('DraftBorrowerUpdateModal — Copy gating and behavior', () => {
  it('Copy is disabled until the banker enters a non-empty note/reason', async () => {
    render(<DraftBorrowerUpdateModal {...defaultProps()} />);
    const user = userEvent.setup();
    const copyBtn = screen.getByRole('button', { name: /copy draft to clipboard/i });
    expect(copyBtn).toBeDisabled();

    await user.type(
      screen.getByLabelText(/banker note \/ reason for this update/i),
      'Routine weekly update',
    );
    expect(copyBtn).not.toBeDisabled();
  });

  it('Copy works WITHOUT a recipient — Phase 23 contract preserved', async () => {
    render(<DraftBorrowerUpdateModal {...defaultProps()} />);
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    await user.type(
      screen.getByLabelText(/banker note \/ reason for this update/i),
      'Weekly check-in',
    );
    // Recipient is intentionally left blank.
    await user.click(screen.getByRole('button', { name: /copy draft to clipboard/i }));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/Copied to clipboard/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Nothing was logged to this deal/i),
    ).toBeInTheDocument();
  });

  it('blocks Copy if the banker edits commitment language into the body that the deal cannot back up', async () => {
    render(<DraftBorrowerUpdateModal {...defaultProps()} />);
    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText(/banker note \/ reason for this update/i),
      'Test',
    );
    const body = screen.getByLabelText(/^body$/i) as HTMLTextAreaElement;
    await user.click(body);
    await user.type(body, '\nYou are approved and cleared to close.');

    const guard = screen.getByRole('alert');
    expect(within(guard).getByText(/Borrower-safe language check flagged issues/i)).toBeInTheDocument();
    expect(within(guard).getAllByText(/approved/i).length).toBeGreaterThan(0);
    expect(within(guard).getAllByText(/cleared to close/i).length).toBeGreaterThan(0);

    expect(screen.getByRole('button', { name: /copy draft to clipboard/i })).toBeDisabled();
  });
});

describe('DraftBorrowerUpdateModal — Phase 105 Send flow', () => {
  it('Send button does NOT render when onSendEmail prop is omitted (older caller)', () => {
    render(<DraftBorrowerUpdateModal {...defaultProps({ onSendEmail: undefined })} />);
    expect(
      screen.queryByRole('button', { name: /send borrower update through outlook/i }),
    ).toBeNull();
  });

  it('Send button renders when onSendEmail prop is provided', () => {
    const onSendEmail = vi.fn();
    render(<DraftBorrowerUpdateModal {...defaultProps({ onSendEmail })} />);
    expect(
      screen.getByRole('button', { name: /send borrower update through outlook/i }),
    ).toBeInTheDocument();
  });

  it('Send is disabled until recipient, banker note, subject, and body are all valid', async () => {
    const onSendEmail = vi.fn();
    render(<DraftBorrowerUpdateModal {...defaultProps({ onSendEmail })} />);
    const user = userEvent.setup();
    const sendBtn = screen.getByRole('button', {
      name: /send borrower update through outlook/i,
    });
    expect(sendBtn).toBeDisabled();

    await user.type(
      screen.getByLabelText(/banker note \/ reason for this update/i),
      'Routine',
    );
    // Still missing recipient.
    expect(sendBtn).toBeDisabled();

    await user.type(screen.getByLabelText(/recipient email/i), 'borrower@example.com');
    expect(sendBtn).not.toBeDisabled();
  });

  it('Send is disabled when recipient is malformed', async () => {
    const onSendEmail = vi.fn();
    render(<DraftBorrowerUpdateModal {...defaultProps({ onSendEmail })} />);
    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText(/banker note \/ reason for this update/i),
      'Routine',
    );
    await user.type(screen.getByLabelText(/recipient email/i), 'not-an-email');
    expect(
      screen.getByRole('button', { name: /send borrower update through outlook/i }),
    ).toBeDisabled();
  });

  it('Send is disabled when systemUserId is undefined (banker write-disabled state)', () => {
    const onSendEmail = vi.fn();
    render(
      <DraftBorrowerUpdateModal
        {...defaultProps({
          onSendEmail,
          systemUserId: undefined,
          writeDisabledReason: 'No matching cr664_users row for the signed-in Entra OID.',
        })}
      />,
    );
    expect(
      screen.getByRole('button', { name: /send borrower update through outlook/i }),
    ).toBeDisabled();
    expect(
      screen.getByText(/No matching cr664_users row for the signed-in Entra OID\./),
    ).toBeInTheDocument();
  });

  it('clicking Send invokes onSendEmail with the typed payload (NOT including attachments / Cc / Bcc)', async () => {
    const onSendEmail = vi.fn().mockResolvedValue({
      kind: 'success',
      mode: 'DRY_RUN',
      providerMessageId: undefined,
      maskedRecipient: 'b***@e***.com',
    } as SendBorrowerUpdateEmailOutcome);
    render(<DraftBorrowerUpdateModal {...defaultProps({ onSendEmail })} />);
    const user = userEvent.setup();

    await user.type(
      screen.getByLabelText(/banker note \/ reason for this update/i),
      'Borrower requested an update.',
    );
    await user.type(screen.getByLabelText(/recipient email/i), 'borrower@example.com');
    await user.click(
      screen.getByRole('button', { name: /send borrower update through outlook/i }),
    );

    expect(onSendEmail).toHaveBeenCalledTimes(1);
    const payload = onSendEmail.mock.calls[0]![0] as SendBorrowerUpdateEmailInput;
    expect(payload.dealId).toBe('deal-77');
    expect(payload.systemUserId).toBe('sys-user-1');
    expect(payload.recipient).toBe('borrower@example.com');
    expect(payload.bankerNote).toBe('Borrower requested an update.');
    expect(payload.template).toBe('general-status');
    expect(payload.subject.length).toBeGreaterThan(0);
    expect(payload.body.length).toBeGreaterThan(0);

    // The modal MUST NOT have invented additional fields on the action
    // input — keep the surface narrow.
    expect(Object.keys(payload).sort()).toEqual(
      ['bankerNote', 'body', 'dealId', 'recipient', 'subject', 'systemUserId', 'template'].sort(),
    );
  });

  it('renders the "Outlook accepted" success outcome (NOT "delivered" / "sent")', async () => {
    const onSendEmail = vi.fn().mockResolvedValue({
      kind: 'success',
      mode: 'LIVE',
      providerMessageId: undefined,
      maskedRecipient: 'b***@e***.com',
    } as SendBorrowerUpdateEmailOutcome);
    render(<DraftBorrowerUpdateModal {...defaultProps({ onSendEmail })} />);
    const user = userEvent.setup();

    await user.type(
      screen.getByLabelText(/banker note \/ reason for this update/i),
      'Borrower called.',
    );
    await user.type(screen.getByLabelText(/recipient email/i), 'borrower@example.com');
    await user.click(
      screen.getByRole('button', { name: /send borrower update through outlook/i }),
    );

    expect(
      await screen.findByText(/Outlook accepted borrower update to b\*\*\*@e\*\*\*\.com/),
    ).toBeInTheDocument();
    // Forbidden vocabulary stays off the screen.
    const body = document.body.textContent ?? '';
    expect(body).not.toMatch(/\bdelivered\b/i);
  });

  it('renders the transient send-failed outcome with retry guidance', async () => {
    const onSendEmail = vi.fn().mockResolvedValue({
      kind: 'send-failed',
      sendError: '503 backend unavailable',
      transient: true,
      mode: 'LIVE',
    } as SendBorrowerUpdateEmailOutcome);
    render(<DraftBorrowerUpdateModal {...defaultProps({ onSendEmail })} />);
    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText(/banker note \/ reason for this update/i),
      'Test',
    );
    await user.type(screen.getByLabelText(/recipient email/i), 'borrower@example.com');
    await user.click(
      screen.getByRole('button', { name: /send borrower update through outlook/i }),
    );
    expect(
      await screen.findByText(/Outlook send failed — transient/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/You may retry/i)).toBeInTheDocument();
  });

  it('renders the governance-partial outcome with CRITICAL do-not-retry copy', async () => {
    const onSendEmail = vi.fn().mockResolvedValue({
      kind: 'governance-partial',
      mode: 'LIVE',
      providerMessageId: undefined,
      maskedRecipient: 'b***@e***.com',
      auditError: 'audit 500',
      timelineError: undefined,
    } as SendBorrowerUpdateEmailOutcome);
    render(<DraftBorrowerUpdateModal {...defaultProps({ onSendEmail })} />);
    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText(/banker note \/ reason for this update/i),
      'Test',
    );
    await user.type(screen.getByLabelText(/recipient email/i), 'borrower@example.com');
    await user.click(
      screen.getByRole('button', { name: /send borrower update through outlook/i }),
    );
    expect(await screen.findByText(/CRITICAL/)).toBeInTheDocument();
    expect(
      screen.getByText(/Do not retry — the message may already be on its way\./),
    ).toBeInTheDocument();
  });

  it('Send button shows "Sending…" while the action is in flight', async () => {
    let resolveSend!: (o: SendBorrowerUpdateEmailOutcome) => void;
    const onSendEmail = vi.fn().mockReturnValue(
      new Promise<SendBorrowerUpdateEmailOutcome>((res) => {
        resolveSend = res;
      }),
    );
    render(<DraftBorrowerUpdateModal {...defaultProps({ onSendEmail })} />);
    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText(/banker note \/ reason for this update/i),
      'Test',
    );
    await user.type(screen.getByLabelText(/recipient email/i), 'borrower@example.com');
    await user.click(
      screen.getByRole('button', { name: /send borrower update through outlook/i }),
    );
    expect(
      screen.getByRole('button', { name: /send borrower update through outlook/i }),
    ).toHaveTextContent(/Sending…/);
    resolveSend({
      kind: 'success',
      mode: 'DRY_RUN',
      providerMessageId: undefined,
      maskedRecipient: 'b***@e***.com',
    });
  });
});
