// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { EmailLiveSmokeTestOutcome } from './emailLiveSmokeTest';

/**
 * Phase 109 — operator-facing Outlook LIVE email diagnostics card.
 *
 * These tests pin the operator-safety + isolation contract:
 *   - the smoke test is ONLY triggered by an explicit operator
 *     click — never on render, never automatically;
 *   - missing recipient blocks the send (button disabled, helper
 *     not invoked);
 *   - the card surfaces conservative "Outlook accepted" wording;
 *   - the card calls the runEmailLiveSmokeTest helper exactly
 *     once per click;
 *   - every outcome kind renders with operator-readable copy.
 *
 * The helper itself (runEmailLiveSmokeTest) is unit-tested in
 * ./emailLiveSmokeTest.test.ts.
 */

vi.mock('./emailLiveSmokeTest', () => ({
  runEmailLiveSmokeTest: vi.fn(),
  // Pass through the constants the production module exports —
  // the diagnostics card doesn't read them directly but importers
  // that pull in the module will see them.
  EMAIL_LIVE_SMOKE_TEST_SUBJECT: 'OGB LOS Outlook smoke test',
  EMAIL_LIVE_SMOKE_TEST_BODY: '<<smoke body>>',
}));

// Avoid loading the @microsoft/power-apps SDK transitively
// (emailLiveSmokeTest imports outlookEmailAdapters which imports
// the connector). The mock above replaces the module entirely.
vi.mock('../generated/services/Office365OutlookService', () => ({
  Office365OutlookService: { SendEmailV2: vi.fn() },
}));

import { EmailLiveDiagnostics } from './EmailLiveDiagnostics';
import { runEmailLiveSmokeTest } from './emailLiveSmokeTest';

const runSmokeMock = vi.mocked(runEmailLiveSmokeTest);

beforeEach(() => {
  runSmokeMock.mockReset();
});

describe('Phase 109 — diagnostics card renders posture + warning without running anything', () => {
  it('does NOT invoke the smoke-test helper on render', () => {
    render(<EmailLiveDiagnostics />);
    expect(runSmokeMock).not.toHaveBeenCalled();
  });

  it('renders the current EMAIL_MODE as a mode badge', () => {
    render(<EmailLiveDiagnostics />);
    // Test env defaults to DRY_RUN.
    expect(screen.getByText(/Mode: DRY_RUN/i)).toBeInTheDocument();
  });

  it('shows code-availability for both governed send paths', () => {
    render(<EmailLiveDiagnostics />);
    expect(
      screen.getByText(/Document-request email LIVE path/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Borrower-update email LIVE path/i),
    ).toBeInTheDocument();
  });

  it('shows that Phase 101 summary handoffs remain copy-to-clipboard regardless of mode', () => {
    render(<EmailLiveDiagnostics />);
    expect(
      screen.getByText(/Phase 101 summary handoffs/i),
    ).toBeInTheDocument();
    // The detail line explicitly pins copy-to-clipboard regardless of EMAIL_MODE.
    expect(
      screen.getByText(/copy-to-clipboard regardless of EMAIL_MODE/i),
    ).toBeInTheDocument();
  });

  it('renders the "Outlook accepted is connector acceptance, not borrower delivery confirmation" warning', () => {
    render(<EmailLiveDiagnostics />);
    expect(
      screen.getByText(
        /"Outlook accepted" is connector acceptance, not borrower delivery confirmation\./,
      ),
    ).toBeInTheDocument();
  });

  it('renders the operator-only smoke-test badge', () => {
    render(<EmailLiveDiagnostics />);
    expect(screen.getByText(/Operator-only · explicit/i)).toBeInTheDocument();
  });
});

describe('Phase 109 — smoke test is operator-triggered only (no auto-fire)', () => {
  it('Run button is disabled until the operator types a recipient', async () => {
    render(<EmailLiveDiagnostics />);
    const user = userEvent.setup();
    const runBtn = screen.getByRole('button', { name: /run outlook live smoke test/i });
    expect(runBtn).toBeDisabled();

    await user.type(
      screen.getByLabelText(/test recipient email/i),
      'ops@bank.example.com',
    );
    expect(runBtn).not.toBeDisabled();
  });

  it('clicking the disabled Run button (no recipient) does NOT invoke the helper', async () => {
    render(<EmailLiveDiagnostics />);
    const user = userEvent.setup();
    const runBtn = screen.getByRole('button', { name: /run outlook live smoke test/i });
    expect(runBtn).toBeDisabled();
    await user.click(runBtn);
    expect(runSmokeMock).not.toHaveBeenCalled();
  });

  it('clicking Run with a valid recipient invokes runEmailLiveSmokeTest exactly once', async () => {
    runSmokeMock.mockResolvedValue({ kind: 'accepted', mode: 'LIVE' });
    render(<EmailLiveDiagnostics />);
    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText(/test recipient email/i),
      'ops@bank.example.com',
    );
    await user.click(
      screen.getByRole('button', { name: /run outlook live smoke test/i }),
    );
    await waitFor(() => {
      expect(runSmokeMock).toHaveBeenCalledTimes(1);
    });
    expect(runSmokeMock).toHaveBeenCalledWith({
      recipient: 'ops@bank.example.com',
    });
  });

  it('the Run button label switches to "Running smoke test…" while the helper is in flight', async () => {
    let resolveRun!: (o: EmailLiveSmokeTestOutcome) => void;
    runSmokeMock.mockReturnValue(
      new Promise<EmailLiveSmokeTestOutcome>((r) => {
        resolveRun = r;
      }),
    );
    render(<EmailLiveDiagnostics />);
    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText(/test recipient email/i),
      'ops@bank.example.com',
    );
    await user.click(
      screen.getByRole('button', { name: /run outlook live smoke test/i }),
    );
    expect(
      screen.getByRole('button', { name: /run outlook live smoke test/i }),
    ).toHaveTextContent(/Running smoke test…/);
    resolveRun({ kind: 'accepted', mode: 'LIVE' });
  });
});

describe('Phase 109 — outcome rendering uses honest acceptance language', () => {
  it('renders "Connector accepted the smoke message" for the accepted outcome', async () => {
    runSmokeMock.mockResolvedValue({ kind: 'accepted', mode: 'LIVE' });
    render(<EmailLiveDiagnostics />);
    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText(/test recipient email/i),
      'ops@bank.example.com',
    );
    await user.click(
      screen.getByRole('button', { name: /run outlook live smoke test/i }),
    );
    expect(
      await screen.findByText(/Connector accepted the smoke message/i),
    ).toBeInTheDocument();
    // No claim of delivery anywhere in the rendered DOM.
    const everyText = document.body.textContent ?? '';
    expect(everyText).not.toMatch(/\bdelivered\b/i);
  });

  it('renders the invalid-input outcome with the reason', async () => {
    runSmokeMock.mockResolvedValue({
      kind: 'invalid-input',
      reason: 'Test recipient does not look like an email address.',
    });
    render(<EmailLiveDiagnostics />);
    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText(/test recipient email/i),
      'ops@bank.example.com',
    );
    await user.click(
      screen.getByRole('button', { name: /run outlook live smoke test/i }),
    );
    expect(
      await screen.findByText(/Invalid input — smoke test not run/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Test recipient does not look like an email address\./),
    ).toBeInTheDocument();
  });

  it('renders the transient-failure outcome with retry guidance', async () => {
    runSmokeMock.mockResolvedValue({
      kind: 'transient-failure',
      reason: '503 backend unavailable',
      mode: 'LIVE',
    });
    render(<EmailLiveDiagnostics />);
    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText(/test recipient email/i),
      'ops@bank.example.com',
    );
    await user.click(
      screen.getByRole('button', { name: /run outlook live smoke test/i }),
    );
    expect(
      await screen.findByText(/Transient failure \(mode: LIVE\)/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/You may retry\./)).toBeInTheDocument();
  });

  it('renders the permanent-failure outcome with do-not-retry guidance', async () => {
    runSmokeMock.mockResolvedValue({
      kind: 'permanent-failure',
      reason: '403 forbidden',
      mode: 'LIVE',
    });
    render(<EmailLiveDiagnostics />);
    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText(/test recipient email/i),
      'ops@bank.example.com',
    );
    await user.click(
      screen.getByRole('button', { name: /run outlook live smoke test/i }),
    );
    expect(
      await screen.findByText(/Permanent failure \(mode: LIVE\)/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Do not retry as-is\./)).toBeInTheDocument();
  });

  it('renders the unknown outcome with the error message', async () => {
    runSmokeMock.mockResolvedValue({
      kind: 'unknown',
      message: 'connector handshake failed',
    });
    render(<EmailLiveDiagnostics />);
    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText(/test recipient email/i),
      'ops@bank.example.com',
    );
    await user.click(
      screen.getByRole('button', { name: /run outlook live smoke test/i }),
    );
    expect(await screen.findByText(/Unknown error/i)).toBeInTheDocument();
    expect(
      screen.getByText(/connector handshake failed/),
    ).toBeInTheDocument();
  });

  it('rendered DOM never contains "delivered" / "email sent" / "borrower notified" claims, regardless of outcome', async () => {
    runSmokeMock.mockResolvedValue({ kind: 'accepted', mode: 'LIVE' });
    render(<EmailLiveDiagnostics />);
    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText(/test recipient email/i),
      'ops@bank.example.com',
    );
    await user.click(
      screen.getByRole('button', { name: /run outlook live smoke test/i }),
    );
    await screen.findByText(/Connector accepted the smoke message/i);
    const everyText = document.body.textContent ?? '';
    expect(everyText).not.toMatch(/\bdelivered\b/i);
    expect(everyText).not.toMatch(/\bemail\s+(sent|delivered)\b/i);
    expect(everyText).not.toMatch(/\bborrower\s+(?:was|has\s+been)\s+notified\b/i);
  });
});
