import { useEffect, useMemo, useRef, useState } from 'react';
import {
  prepareSummaryOutlookHandoff,
  type SummaryOutlookHandoffInput,
} from './summaryOutlookHandoff';
import { palette, radius, spacing, typography } from '../theme';

/**
 * Phase 101: reusable inline component that renders the "Open in
 * Outlook" + "Copy email" handoff pair for one summary surface.
 *
 * Used by:
 *   - Phase 98 morning-catch-up cards (banker + manager)
 *   - Phase 99 per-deal Activity Timeline
 *   - Phase 100 per-client Relationship Memory rows
 *
 * Posture (unchanged from Phase 63/67):
 *   - "Open in Outlook" sets `window.location.href` to the mailto
 *     URL. The OS hands the URL to the user's default mail client
 *     (Outlook on a typical bank workstation). The app never sends.
 *   - "Copy email" writes the Phase 63 clipboard payload
 *     ("To: …\nSubject: …\n\n<body>") via
 *     `navigator.clipboard.writeText`.
 *   - Recipient is optional and empty by default. The brief
 *     explicitly forbids inferring the recipient from client name
 *     or any deal field; bankers type it in their Outlook client.
 *   - Failure paths surface `role="alert"` tags rather than
 *     silently dropping the click.
 *
 * What this is NOT:
 *   - Not a connector call. No Office 365 Outlook connector is
 *     registered or invoked.
 *   - Not a Graph caller. No MSAL, no token, no Graph API.
 *   - Not a Dataverse write. No audit row, no timeline event.
 *   - Not a delivery surface. The component does not know whether
 *     the banker pastes / edits / sends.
 */

export interface SummaryOutlookHandoffButtonsProps {
  /** Subject + body forwarded to `prepareSummaryOutlookHandoff`.
   *  Recipient is omitted here — the brief explicitly mandates
   *  empty-by-default with no inference. */
  subject: string;
  body: string;
  /** Aria label suffix appended to each button's `aria-label`. The
   *  caller passes a banker-safe identifier (deal name / client
   *  name / "morning catch-up") so screen readers can disambiguate
   *  when multiple surfaces render the buttons simultaneously. */
  ariaContext: string;
}

type HandoffState =
  | { kind: 'idle' }
  | { kind: 'mailto-launched' }
  | { kind: 'copied' }
  | { kind: 'copy-failed' };

export function SummaryOutlookHandoffButtons({
  subject,
  body,
  ariaContext,
}: SummaryOutlookHandoffButtonsProps) {
  const [state, setState] = useState<HandoffState>({ kind: 'idle' });
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  const payload = useMemo(() => {
    const input: SummaryOutlookHandoffInput = { subject, body };
    return prepareSummaryOutlookHandoff(input);
  }, [subject, body]);

  function scheduleIdle() {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      setState({ kind: 'idle' });
    }, 4000);
  }

  function handleOpenInOutlook() {
    try {
      // Phase 63 pattern: set window.location.href so the OS hands
      // the mailto: URL to the default mail client. Same idiom as
      // BorrowerSafeStatusPacketModal / RequestDocumentModal.
      window.location.href = payload.mailtoUrl;
    } catch {
      // If the assignment fails the banker can still use Copy email.
    }
    setState({ kind: 'mailto-launched' });
    scheduleIdle();
  }

  async function handleCopyEmail() {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload.clipboardText);
        setState({ kind: 'copied' });
        scheduleIdle();
        return;
      }
      setState({ kind: 'copy-failed' });
    } catch {
      setState({ kind: 'copy-failed' });
    }
  }

  return (
    <div style={styles.row} aria-label="Outlook handoff actions">
      <button
        type="button"
        onClick={handleOpenInOutlook}
        style={styles.button}
        aria-label={`Open in Outlook for ${ariaContext}`}
      >
        Open in Outlook
      </button>
      <button
        type="button"
        onClick={handleCopyEmail}
        style={styles.button}
        aria-label={`Copy email for ${ariaContext}`}
      >
        Copy email
      </button>
      {state.kind === 'mailto-launched' && (
        <span style={styles.successTag} role="status">
          Outlook opened locally. You send from Outlook.
        </span>
      )}
      {state.kind === 'copied' && (
        <span style={styles.successTag} role="status">
          Copied to clipboard. Paste into Outlook. You send from Outlook.
        </span>
      )}
      {state.kind === 'copy-failed' && (
        <span style={styles.failTag} role="alert">
          Clipboard unavailable. Select and copy manually.
        </span>
      )}
      <p style={styles.disclaimer}>
        Local handoff only. The app does not send email. You send
        from Outlook. No Office 365 connector call. No Graph. No
        Dataverse write. No audit row. No timeline event.
      </p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  row: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  button: {
    background: palette.surfaceAlt,
    color: palette.text,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    cursor: 'pointer',
    fontFamily: typography.family,
  },
  successTag: {
    fontSize: typography.size.xs,
    color: palette.clearFg,
    fontStyle: 'italic',
  },
  failTag: {
    fontSize: typography.size.xs,
    color: palette.blockedFg,
    fontStyle: 'italic',
  },
  disclaimer: {
    margin: 0,
    flex: '1 0 100%',
    fontSize: typography.size.xs,
    color: palette.textMuted,
    lineHeight: typography.lineHeight.snug,
  },
};
