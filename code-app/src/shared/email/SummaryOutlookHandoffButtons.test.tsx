// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SummaryOutlookHandoffButtons } from './SummaryOutlookHandoffButtons';

/**
 * Phase 101 — <SummaryOutlookHandoffButtons /> tests.
 *
 * Pins:
 *   - renders "Open in Outlook" + "Copy email" buttons + the
 *     verbatim local-handoff disclaimer (every brief-mandated
 *     phrase);
 *   - aria labels include the caller-supplied ariaContext;
 *   - clicking Open in Outlook sets window.location.href to a
 *     mailto: URL containing the encoded subject + body;
 *   - clicking Copy email writes the Phase 63 clipboard payload
 *     (To/Subject/blank line/body) via navigator.clipboard.writeText;
 *   - success states surface as role="status" with the verbatim
 *     Phase 101 copy ("Outlook opened locally. You send from
 *     Outlook." + "Copied to clipboard. Paste into Outlook. You
 *     send from Outlook.");
 *   - clipboard failure surfaces as role="alert" with "Clipboard
 *     unavailable. Select and copy manually.";
 *   - rendered DOM never positively claims sent / delivered /
 *     synced / notified / Outlook connected / email delivered /
 *     connector-backed / automated email / Graph connected;
 *   - the buttons can be rendered without recipient — the mailto
 *     URL still works (no infer / hardcoded recipient).
 */

beforeEach(() => {
  // window.location.href is read-only in jsdom; provide a settable
  // mock so we can inspect the mailto URL after the click. Matches
  // the Phase 63 pattern used in BorrowerSafeStatusPacketModal.test.tsx.
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { href: '' },
    writable: true,
  });
});

describe('SummaryOutlookHandoffButtons — Phase 101', () => {
  it('renders both buttons with verbatim labels', () => {
    render(
      <SummaryOutlookHandoffButtons
        subject="Morning catch-up summary"
        body="hello"
        ariaContext="morning catch-up"
      />,
    );
    expect(
      screen.getByRole('button', {
        name: /Open in Outlook for morning catch-up/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Copy email for morning catch-up/i }),
    ).toBeInTheDocument();
  });

  it('renders the verbatim local-handoff disclaimer with every brief-mandated phrase', () => {
    render(
      <SummaryOutlookHandoffButtons
        subject="S"
        body="B"
        ariaContext="ctx"
      />,
    );
    expect(screen.getByText(/Local handoff only/i)).toBeInTheDocument();
    expect(
      screen.getByText(/The app does not send email/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/You send from Outlook/i)).toBeInTheDocument();
    expect(
      screen.getByText(/No Office 365 connector call/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/No Graph/i)).toBeInTheDocument();
    expect(screen.getByText(/No Dataverse write/i)).toBeInTheDocument();
    expect(screen.getByText(/No audit row/i)).toBeInTheDocument();
    expect(screen.getByText(/No timeline event/i)).toBeInTheDocument();
  });

  it('clicking Open in Outlook sets window.location.href to a mailto URL with encoded subject + body', async () => {
    const user = userEvent.setup();
    render(
      <SummaryOutlookHandoffButtons
        subject="Morning catch-up summary"
        body="line one\nline two"
        ariaContext="morning catch-up"
      />,
    );
    await user.click(
      screen.getByRole('button', {
        name: /Open in Outlook for morning catch-up/i,
      }),
    );
    const url = window.location.href;
    expect(url).toMatch(/^mailto:\?/);
    expect(url).toContain('subject=Morning%20catch-up%20summary');
    // %5Cn = backslash-n encoded (the body was a literal `\n` string
    // in the JSX prop — `userEvent.click` doesn't transform it).
    expect(url).toContain('body=line%20one');
  });

  it('shows the mailto-launched status after Open in Outlook click', async () => {
    const user = userEvent.setup();
    render(
      <SummaryOutlookHandoffButtons
        subject="S"
        body="B"
        ariaContext="ctx"
      />,
    );
    await user.click(
      screen.getByRole('button', { name: /Open in Outlook for ctx/i }),
    );
    expect(
      await screen.findByText(/Outlook opened locally\. You send from Outlook\./i),
    ).toBeInTheDocument();
    const tag = screen.getByText(
      /Outlook opened locally\. You send from Outlook\./i,
    );
    expect(tag.closest('[role="status"]')).not.toBeNull();
  });

  it('clicking Copy email writes the Phase 63 clipboard payload', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    render(
      <SummaryOutlookHandoffButtons
        subject="Morning catch-up summary"
        body="hello world"
        ariaContext="morning catch-up"
      />,
    );
    await user.click(
      screen.getByRole('button', {
        name: /Copy email for morning catch-up/i,
      }),
    );
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    expect(writeText.mock.calls[0]![0]).toBe(
      'To: \nSubject: Morning catch-up summary\n\nhello world',
    );
  });

  it('shows the copied status after Copy email click', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    render(
      <SummaryOutlookHandoffButtons
        subject="S"
        body="B"
        ariaContext="ctx"
      />,
    );
    await user.click(
      screen.getByRole('button', { name: /Copy email for ctx/i }),
    );
    const status = await screen.findByText(
      /Copied to clipboard\. Paste into Outlook\. You send from Outlook\./i,
    );
    expect(status.closest('[role="status"]')).not.toBeNull();
  });

  it('shows the failure alert when the clipboard is unavailable', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    });
    render(
      <SummaryOutlookHandoffButtons
        subject="S"
        body="B"
        ariaContext="ctx"
      />,
    );
    await user.click(
      screen.getByRole('button', { name: /Copy email for ctx/i }),
    );
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(
      /Clipboard unavailable\. Select and copy manually\./i,
    );
  });

  it('shows the failure alert when writeText rejects', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    render(
      <SummaryOutlookHandoffButtons
        subject="S"
        body="B"
        ariaContext="ctx"
      />,
    );
    await user.click(
      screen.getByRole('button', { name: /Copy email for ctx/i }),
    );
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Clipboard unavailable/i);
  });

  it('the rendered DOM never positively claims forbidden vocabulary', () => {
    render(
      <SummaryOutlookHandoffButtons
        subject="S"
        body="B"
        ariaContext="ctx"
      />,
    );
    // The disclaimer says "The app does not send email" — strip
    // that negation phrase before checking forbidden positive
    // claims. We also strip "No Office 365 connector call." and
    // other negation phrases.
    const text = document.body.textContent ?? '';
    const stripped = text
      .replace(/The app does not send email\.?/g, '')
      .replace(/No Office 365 connector call\.?/g, '')
      .replace(/No Graph\.?/g, '')
      .replace(/No Dataverse write\.?/g, '')
      .replace(/No audit row\.?/g, '')
      .replace(/No timeline event\.?/g, '');
    expect(stripped).not.toMatch(/\bsent\b/i);
    expect(stripped).not.toMatch(/\bdelivered\b/i);
    expect(stripped).not.toMatch(/\bsynced\b/i);
    expect(stripped).not.toMatch(/\bnotified\b/i);
    expect(stripped).not.toMatch(/Outlook\s+connected/i);
    expect(stripped).not.toMatch(/email\s+delivered/i);
    expect(stripped).not.toMatch(/connector[- ]?backed/i);
    expect(stripped).not.toMatch(/automated\s+email/i);
    expect(stripped).not.toMatch(/Graph\s+connected/i);
  });

  it('mailto URL has no recipient between mailto: and ? (recipient never inferred)', async () => {
    const user = userEvent.setup();
    render(
      <SummaryOutlookHandoffButtons
        subject="Relationship snapshot — Acme Manufacturing, LLC"
        body="snapshot body"
        ariaContext="Acme Manufacturing, LLC relationship snapshot"
      />,
    );
    await user.click(
      screen.getByRole('button', {
        name: /Open in Outlook for Acme Manufacturing, LLC relationship snapshot/i,
      }),
    );
    expect(window.location.href).toMatch(/^mailto:\?subject=/);
    // Specifically: no part of the body / ariaContext leaks into
    // the recipient slot. The recipient slot is empty.
    expect(window.location.href).not.toMatch(/mailto:[^?]/);
  });
});
