// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RelationshipNoteDraftModal } from './RelationshipNoteDraftModal';

/**
 * Phase 78 — RelationshipNoteDraftModal rendering tests.
 *
 * Pins:
 *   - modal semantics (role=dialog, aria-modal, aria-labelledby);
 *   - local-only banner renders verbatim;
 *   - Copy button is disabled until the required Note is non-empty;
 *   - clicking Copy calls navigator.clipboard.writeText with the
 *     formatted preview;
 *   - copy-success outcome announced via role="status";
 *   - copy-failed outcome announced via role="alert" + does NOT
 *     claim the draft was saved;
 *   - Escape closes the modal;
 *   - rendered DOM does not contain affirmative persistence /
 *     sync / AI / official-record claims.
 *
 * The shared formatter is exercised independently in
 * relationshipNoteDraft.test.ts.
 */

describe('RelationshipNoteDraftModal — Phase 78', () => {
  // userEvent.setup() installs its own Clipboard. Spies are installed
  // AFTER setup so the modal sees our vi.fn() at click time
  // (matches the Phase 66 BorrowerSafeStatusPacketModal test pattern).
  function installClipboardSuccess(): ReturnType<typeof vi.fn> {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    return writeText;
  }

  function installClipboardFailure(): void {
    const writeText = vi.fn().mockRejectedValue(new Error('blocked'));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
  }

  it('renders with proper modal semantics', () => {
    render(
      <RelationshipNoteDraftModal
        clientName="Acme Manufacturing"
        bankerName="M. Paller"
        deals={[{ dealName: 'Acme RLOC', stage: 'Underwriting' }]}
        onClose={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const titleId = dialog.getAttribute('aria-labelledby');
    expect(titleId).toBeTruthy();
    expect(document.getElementById(titleId!)?.textContent).toMatch(
      /Draft relationship note/i,
    );
  });

  it('renders the local-only banner verbatim and the local-draft badge', () => {
    render(
      <RelationshipNoteDraftModal
        clientName="Acme"
        bankerName="M. Paller"
        deals={[]}
        onClose={vi.fn()}
      />,
    );
    // "Local draft. Not saved to the system." appears in BOTH the
    // banner (as the headline) AND inside the preview pane (as the
    // footer of the generated draft). Both occurrences are
    // intentional.
    expect(
      screen.getAllByText(/Local draft\. Not saved to the system\./i).length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Local draft only/i)).toBeInTheDocument();
    expect(
      screen.getByText(/does not store this note/i),
    ).toBeInTheDocument();
  });

  it('disables Copy until the required note is non-empty', async () => {
    render(
      <RelationshipNoteDraftModal
        clientName="Acme"
        bankerName="M. Paller"
        deals={[]}
        onClose={vi.fn()}
      />,
    );
    const copyBtn = screen.getByRole('button', {
      name: /Copy relationship note to clipboard/i,
    });
    expect(copyBtn).toBeDisabled();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^Note\b/i), 'Discussed Q2 results.');
    expect(copyBtn).not.toBeDisabled();
  });

  it('clicking Copy writes the formatted preview to the clipboard and announces success via role="status"', async () => {
    render(
      <RelationshipNoteDraftModal
        clientName="Acme"
        bankerName="M. Paller"
        deals={[{ dealName: 'Acme RLOC', stage: 'Underwriting' }]}
        onClose={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    // Install the spy AFTER userEvent.setup() so the modal sees our
    // vi.fn() at click time (userEvent.setup installs its own
    // Clipboard which would otherwise displace the spy).
    const writeText = installClipboardSuccess();

    await user.type(screen.getByLabelText(/^Note\b/i), 'Discussed Q2 results.');
    await user.click(
      screen.getByRole('button', { name: /Copy relationship note to clipboard/i }),
    );

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    const copiedText = writeText.mock.calls[0]![0] as string;
    expect(copiedText).toContain('Relationship note — Acme');
    expect(copiedText).toContain('Discussed Q2 results.');
    expect(copiedText).toContain(
      'Local draft. Not saved to the system. Paste into the appropriate system of record.',
    );
    // The success outcome appears as role=status.
    const statusEl = await screen.findByText(/Draft copied to clipboard/i);
    expect(statusEl.closest('[role="status"]')).not.toBeNull();
    expect(
      screen.getByText(/did not store the note/i),
    ).toBeInTheDocument();
  });

  it('clipboard-blocked outcome renders via role="alert" and does NOT claim the draft was saved', async () => {
    render(
      <RelationshipNoteDraftModal
        clientName="Acme"
        bankerName="M. Paller"
        deals={[]}
        onClose={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    installClipboardFailure();
    await user.type(screen.getByLabelText(/^Note\b/i), 'note text');
    await user.click(
      screen.getByRole('button', { name: /Copy relationship note to clipboard/i }),
    );
    const alertEl = await screen.findByRole('alert');
    expect(alertEl.textContent).toMatch(/Could not access clipboard/i);
    expect(alertEl.textContent).toMatch(/copy it manually/i);
    // The alert must not claim the draft was saved or recorded.
    expect(alertEl.textContent).not.toMatch(
      /\b(was|has been)\s+(saved|recorded|logged|persisted)\b/i,
    );
  });

  it('Escape calls onClose', async () => {
    const onClose = vi.fn();
    render(
      <RelationshipNoteDraftModal
        clientName="Acme"
        bankerName="M. Paller"
        deals={[]}
        onClose={onClose}
      />,
    );
    const user = userEvent.setup();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('rendered DOM does not contain affirmative persistence / sync / AI / official-record claims', () => {
    const { container } = render(
      <RelationshipNoteDraftModal
        clientName="Acme"
        bankerName="M. Paller"
        deals={[{ dealName: 'Acme RLOC', stage: 'Underwriting' }]}
        onClose={vi.fn()}
      />,
    );
    const text = container.textContent ?? '';
    // Affirmative claims forbidden.
    expect(text).not.toMatch(/\b(is|was|has been|will be)\s+saved\b/i);
    expect(text).not.toMatch(/\b(is|was|has been|will be)\s+logged\b/i);
    expect(text).not.toMatch(/\b(is|was|has been|will be)\s+recorded\b/i);
    expect(text).not.toMatch(/\b(is|was|has been|will be)\s+persisted\b/i);
    expect(text).not.toMatch(/\b(is|was|has been|will be)\s+synced\b/i);
    expect(text).not.toMatch(/\bAI[ -]?generated\b/i);
    expect(text).not.toMatch(/\bofficial\s+record\b/i);
    expect(text).not.toMatch(/\brelationship\s+memory\s+updated\b/i);
    // The disclaimer's legitimate "Not saved to the system" passes
    // because the regexes only match affirmative-tense forms.
  });

  it('renders the preview block with the LOCAL_DRAFT_FOOTER copy inside', () => {
    render(
      <RelationshipNoteDraftModal
        clientName="Acme"
        bankerName="M. Paller"
        deals={[]}
        onClose={vi.fn()}
      />,
    );
    const previewEl = screen.getByLabelText(/Relationship note preview/i);
    expect(previewEl.textContent).toMatch(
      /Local draft\. Not saved to the system\. Paste into the appropriate system of record\./,
    );
  });
});
