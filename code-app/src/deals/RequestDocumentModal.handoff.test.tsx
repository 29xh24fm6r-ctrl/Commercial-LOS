// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DealDocument } from './dealDocumentQueries';
import type { RequestDocumentOutcome } from './documentActions';
import type { PrepareDocumentRequestHandoffOutcome } from './prepareDocumentRequestHandoff';

/**
 * Phase 63: HANDOFF-mode tests for RequestDocumentModal.
 *
 * The modal reads EMAIL_MODE at module load time (a Vite build-time
 * constant). To exercise the HANDOFF UI we replace that module here.
 * Because module-level mocks are hoisted by vitest, this file holds
 * ONLY HANDOFF-mode tests; the DRY_RUN / LIVE / no-email tests live
 * in RequestDocumentModal.test.tsx.
 */

vi.mock('./emailDelivery/emailMode', () => ({
  EMAIL_MODE: 'HANDOFF' as const,
}));

import { RequestDocumentModal } from './RequestDocumentModal';

const sampleDoc: DealDocument = {
  id: 'doc-1',
  name: 'Personal Financial Statement',
  dueDate: '2026-05-30T00:00:00Z',
  requestDate: undefined,
  receivedDate: undefined,
  reviewer: undefined,
  uploaded: false,
  modifiedOn: undefined,
  status: 'outstanding',
};

const successRequest: RequestDocumentOutcome = { kind: 'success' };
const successHandoff = (
  method: 'mailto' | 'clipboard',
): PrepareDocumentRequestHandoffOutcome => ({
  kind: 'success',
  mode: 'HANDOFF',
  method,
  maskedRecipient: 'b***@e***.com',
});

beforeEach(() => {
  // navigator.clipboard is read-only in jsdom — define a configurable
  // stub so individual tests can replace its writeText if needed.
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
  });
  // window.location.href is read-only in jsdom; stub by overriding
  // window.location to a settable mock.
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { href: '' },
    writable: true,
  });
});

describe('RequestDocumentModal — Phase 63 HANDOFF mode UI', () => {
  it('renders Mode: HANDOFF badge and the Open in Outlook + Copy email buttons', () => {
    render(
      <RequestDocumentModal
        doc={sampleDoc}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
        onPrepareHandoff={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('status', { name: /email delivery mode: handoff/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /open in outlook/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /copy email/i }),
    ).toBeInTheDocument();
  });

  it('does NOT render the "Send email through Outlook" toggle in HANDOFF mode', () => {
    render(
      <RequestDocumentModal
        doc={sampleDoc}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
        onPrepareHandoff={vi.fn()}
        // Even though onSendEmail is provided, HANDOFF mode wins — no
        // toggle should appear.
        onSendEmail={vi.fn()}
      />,
    );
    expect(
      screen.queryByLabelText(/send email through outlook/i),
    ).toBeNull();
  });

  it('does NOT claim email was sent or delivered anywhere on screen', () => {
    render(
      <RequestDocumentModal
        doc={sampleDoc}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
        onPrepareHandoff={vi.fn()}
      />,
    );
    // The handoff modal must never claim a send happened. The only
    // mentions of "send" should be the conservative "you send from
    // your own Outlook client" / "the app did not send" framing.
    const everyText = document.body.textContent ?? '';
    expect(everyText).not.toMatch(/\bemail (sent|delivered)\b/i);
    expect(everyText).not.toMatch(/\bsent\s+(an?\s+)?email\b/i);
  });
});

describe('RequestDocumentModal — Phase 63 HANDOFF mailto path', () => {
  it('Open in Outlook builds an RFC 6068 mailto URL with encoded subject + body', async () => {
    const onPrepareHandoff = vi.fn();
    render(
      <RequestDocumentModal
        doc={sampleDoc}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
        onPrepareHandoff={onPrepareHandoff}
      />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/request note/i), 'please upload');
    await user.type(
      screen.getByLabelText(/send to/i),
      'borrower@example.com',
    );
    const trigger = screen.getByRole('button', { name: /open in outlook/i });
    expect(trigger.getAttribute('data-mailto-href')).toBe(
      'mailto:borrower%40example.com?subject=Document%20request%3A%20Personal%20Financial%20Statement&body=please%20upload',
    );
  });

  it('clicking Open in Outlook marks the handoff method as mailto and updates the button label', async () => {
    render(
      <RequestDocumentModal
        doc={sampleDoc}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
        onPrepareHandoff={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/request note/i), 'please upload');
    await user.type(
      screen.getByLabelText(/send to/i),
      'borrower@example.com',
    );
    expect(
      screen.getByRole('button', { name: /^record request$/i }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /open in outlook/i }));
    expect(
      screen.getByRole('button', { name: /^record request & handoff$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/outlook handoff launched/i),
    ).toBeInTheDocument();
  });

  it('records the handoff after a successful request: invokes onPrepareHandoff with method=mailto', async () => {
    const onConfirm = vi.fn().mockResolvedValue(successRequest);
    const onPrepareHandoff = vi.fn().mockResolvedValue(successHandoff('mailto'));
    render(
      <RequestDocumentModal
        doc={sampleDoc}
        onConfirm={onConfirm}
        onClose={vi.fn()}
        onPrepareHandoff={onPrepareHandoff}
      />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/request note/i), 'please upload');
    await user.type(
      screen.getByLabelText(/send to/i),
      'borrower@example.com',
    );
    await user.click(screen.getByRole('button', { name: /open in outlook/i }));
    await user.click(
      screen.getByRole('button', { name: /^record request & handoff$/i }),
    );

    await screen.findByText(/outlook handoff recorded/i);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onPrepareHandoff).toHaveBeenCalledTimes(1);
    expect(onPrepareHandoff).toHaveBeenCalledWith({
      recipient: 'borrower@example.com',
      subject: `Document request: ${sampleDoc.name}`,
      body: 'please upload',
      method: 'mailto',
    });
    // Outcome panel surfaces the masked recipient, NOT the unmasked one.
    expect(screen.getByText(/b\*\*\*@e\*\*\*\.com/i)).toBeInTheDocument();
    expect(screen.queryByText(/borrower@example\.com/)).toBeNull();
  });
});

describe('RequestDocumentModal — Phase 63 HANDOFF clipboard path', () => {
  it('Copy email writes the four-section composition to the clipboard', async () => {
    render(
      <RequestDocumentModal
        doc={sampleDoc}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
        onPrepareHandoff={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    // userEvent.setup() replaces navigator.clipboard with its own
    // jsdom Clipboard stub. Install the spy AFTER setup so the
    // modal's handleCopyClipboard sees our vi.fn() at click time.
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    await user.type(screen.getByLabelText(/request note/i), 'please upload');
    await user.type(
      screen.getByLabelText(/send to/i),
      'borrower@example.com',
    );
    await user.click(screen.getByRole('button', { name: /^copy email$/i }));

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(
      'To: borrower@example.com\n' +
        `Subject: Document request: ${sampleDoc.name}\n\n` +
        'please upload',
    );
  });

  it('records the handoff with method=clipboard after copying', async () => {
    const onConfirm = vi.fn().mockResolvedValue(successRequest);
    const onPrepareHandoff = vi
      .fn()
      .mockResolvedValue(successHandoff('clipboard'));
    render(
      <RequestDocumentModal
        doc={sampleDoc}
        onConfirm={onConfirm}
        onClose={vi.fn()}
        onPrepareHandoff={onPrepareHandoff}
      />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/request note/i), 'please upload');
    await user.type(
      screen.getByLabelText(/send to/i),
      'borrower@example.com',
    );
    await user.click(screen.getByRole('button', { name: /^copy email$/i }));
    await user.click(
      screen.getByRole('button', { name: /^record request & handoff$/i }),
    );

    await screen.findByText(/outlook handoff recorded/i);
    expect(onPrepareHandoff).toHaveBeenCalledWith({
      recipient: 'borrower@example.com',
      subject: `Document request: ${sampleDoc.name}`,
      body: 'please upload',
      method: 'clipboard',
    });
  });
});

describe('RequestDocumentModal — Phase 63 HANDOFF guardrails', () => {
  it('does NOT call onPrepareHandoff when the request itself fails', async () => {
    const onConfirm = vi.fn().mockResolvedValue({
      kind: 'doc-failed',
      docError: 'update failed',
    } satisfies RequestDocumentOutcome);
    const onPrepareHandoff = vi.fn();
    render(
      <RequestDocumentModal
        doc={sampleDoc}
        onConfirm={onConfirm}
        onClose={vi.fn()}
        onPrepareHandoff={onPrepareHandoff}
      />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/request note/i), 'please upload');
    await user.type(
      screen.getByLabelText(/send to/i),
      'borrower@example.com',
    );
    await user.click(screen.getByRole('button', { name: /open in outlook/i }));
    await user.click(
      screen.getByRole('button', { name: /^record request & handoff$/i }),
    );

    await screen.findByText(/could not record request/i);
    expect(onPrepareHandoff).not.toHaveBeenCalled();
  });

  it('shows the handoff-failed branch when the action rejects a malformed recipient', async () => {
    const onConfirm = vi.fn().mockResolvedValue(successRequest);
    const onPrepareHandoff = vi.fn().mockResolvedValue({
      kind: 'handoff-failed',
      reason: 'Recipient does not look like an email address: bogus',
      method: 'mailto',
    } satisfies PrepareDocumentRequestHandoffOutcome);
    render(
      <RequestDocumentModal
        doc={sampleDoc}
        onConfirm={onConfirm}
        onClose={vi.fn()}
        onPrepareHandoff={onPrepareHandoff}
      />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/request note/i), 'please upload');
    await user.type(
      screen.getByLabelText(/send to/i),
      'borrower@example.com',
    );
    await user.click(screen.getByRole('button', { name: /open in outlook/i }));
    await user.click(
      screen.getByRole('button', { name: /^record request & handoff$/i }),
    );

    await screen.findByText(/could not record outlook handoff/i);
    expect(
      screen.getByText(/recipient does not look like an email address/i),
    ).toBeInTheDocument();
  });

  it('shows the governance-partial critical panel when handoff governance fails', async () => {
    const onConfirm = vi.fn().mockResolvedValue(successRequest);
    const onPrepareHandoff = vi.fn().mockResolvedValue({
      kind: 'governance-partial',
      mode: 'HANDOFF',
      method: 'mailto',
      maskedRecipient: 'b***@e***.com',
      auditError: undefined,
      timelineError: 'tl 500',
    } satisfies PrepareDocumentRequestHandoffOutcome);
    render(
      <RequestDocumentModal
        doc={sampleDoc}
        onConfirm={onConfirm}
        onClose={vi.fn()}
        onPrepareHandoff={onPrepareHandoff}
      />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/request note/i), 'please upload');
    await user.type(
      screen.getByLabelText(/send to/i),
      'borrower@example.com',
    );
    await user.click(screen.getByRole('button', { name: /open in outlook/i }));
    await user.click(
      screen.getByRole('button', { name: /^record request & handoff$/i }),
    );

    await screen.findByText(/critical: handoff governance write failed/i);
    expect(screen.getByText(/tl 500/i)).toBeInTheDocument();
    expect(screen.getByText(/do.*not.*retry/i)).toBeInTheDocument();
  });

  it('button stays labeled "Record request" until a handoff method is chosen', async () => {
    render(
      <RequestDocumentModal
        doc={sampleDoc}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
        onPrepareHandoff={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/request note/i), 'please upload');
    await user.type(
      screen.getByLabelText(/send to/i),
      'borrower@example.com',
    );
    // No mailto-open and no copy yet — primary button label stays
    // generic. The audit row only gets a handoff method if the
    // banker explicitly chose one.
    expect(
      screen.getByRole('button', { name: /^record request$/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^record request & handoff$/i }),
    ).toBeNull();
  });
});
