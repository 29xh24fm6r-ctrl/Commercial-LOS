import { useEffect, useMemo, useState } from 'react';
import type { DealDetail } from './dealQueries';
import type { DealDocumentsResult } from './dealDocumentQueries';
import { buildBorrowerSafeStatusPacket } from './borrowerSafeStatusPacket';
import {
  buildHandoffClipboardText,
  buildMailtoUrl,
} from './emailDelivery/emailHandoff';
import { Badge } from '../shared/Badge';
import { palette, radius, spacing, typography } from '../shared/theme';

/**
 * Phase 66: borrower-safe status packet modal. Local preview + Copy.
 * Phase 67: integrated with the Phase 63 Outlook handoff pattern —
 * the modal renders an "Open in Outlook" mailto: button and a "Copy
 * email" clipboard button alongside the local preview. The app still
 * does NOT send email and still does NOT write to Dataverse — the
 * banker drafts in-app and sends from their own Outlook client.
 *
 * The modal is intentionally simpler than the Phase 23 Draft Borrower
 * Update modal:
 *   - no template picker — the packet is a structured snapshot, not
 *     a narrative;
 *   - no required reason note — there's no write, no audit row, so
 *     there is nowhere for the note to go;
 *   - no commitment-language guard — the packet contents are entirely
 *     deterministic and the static-source tests pin that forbidden
 *     phrases never appear in the template; the banker CAN edit the
 *     preview before copying, but edits are their responsibility.
 *
 * Recipient handling (Phase 67):
 *   - cr664_borrowers has no email column (Phase 64 audit) and
 *     DealDetail does not surface a verified borrower email. The
 *     modal renders an empty recipient field. The banker can type
 *     a recipient if they have one OR leave it blank and choose in
 *     Outlook after launch. We DO NOT infer email from the free-text
 *     clientName field; we DO NOT hardcode a fallback.
 *   - The full recipient (when typed) appears ONLY in the compose
 *     surface and the mailto URL / clipboard text. It is never
 *     surfaced elsewhere (no audit row, no timeline, no Dataverse
 *     write of any kind).
 */

interface BorrowerSafeStatusPacketModalProps {
  deal: DealDetail;
  documents: DealDocumentsResult;
  bankerName: string | undefined;
  onClose: () => void;
}

// Phase 67: the modal tracks the last action the banker took so the
// outcome panel reflects it accurately. Both branches are local-only
// — neither writes to Dataverse.
type ActionState =
  | { kind: 'idle' }
  | { kind: 'copied' }
  | { kind: 'copy-failed' }
  | { kind: 'mailto-launched' };

export function BorrowerSafeStatusPacketModal({
  deal,
  documents,
  bankerName,
  onClose,
}: BorrowerSafeStatusPacketModalProps) {
  const generatedAt = useMemo(() => new Date(), []);
  const initial = useMemo(
    () =>
      buildBorrowerSafeStatusPacket({
        deal,
        documents,
        bankerName,
        now: generatedAt,
      }),
    [deal, documents, bankerName, generatedAt],
  );
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [recipient, setRecipient] = useState('');
  const [action, setAction] = useState<ActionState>({ kind: 'idle' });

  useEffect(() => {
    setSubject(initial.subject);
    setBody(initial.body);
    setAction({ kind: 'idle' });
  }, [initial]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const trimmedSubject = subject.trim();
  const trimmedBody = body.trim();
  const trimmedRecipient = recipient.trim();
  // Phase 67: subject + body are required to produce a meaningful
  // handoff. Recipient is intentionally optional — the banker can
  // leave it blank and choose the recipient in Outlook after launch.
  const canHandoff = trimmedSubject.length > 0 && trimmedBody.length > 0;

  function handleOpenMailto() {
    if (!canHandoff) return;
    const url = buildMailtoUrl({
      recipient: trimmedRecipient,
      subject: trimmedSubject,
      body,
    });
    try {
      window.location.href = url;
    } catch {
      // If window.location.href fails the banker can still use Copy.
    }
    setAction({ kind: 'mailto-launched' });
  }

  async function handleCopy() {
    if (!canHandoff) return;
    const payload = buildHandoffClipboardText({
      recipient: trimmedRecipient,
      subject: trimmedSubject,
      body,
    });
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload);
        setAction({ kind: 'copied' });
        return;
      }
      setAction({ kind: 'copy-failed' });
    } catch {
      setAction({ kind: 'copy-failed' });
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="borrower-status-packet-title"
      style={styles.overlay}
    >
      <div style={styles.card}>
        <header style={styles.header}>
          <div>
            <div style={styles.eyebrow}>Deal Workspace · Borrower Communication</div>
            <h2 id="borrower-status-packet-title" style={styles.title}>
              Borrower-safe status packet
            </h2>
          </div>
          <Badge variant="neutral" appearance="outline">
            Local preview only
          </Badge>
        </header>

        <p style={styles.localOnlyBanner} role="status">
          <strong>Prepared for banker review — nothing is saved to this deal.</strong>{' '}
          The packet is a borrower-safe summary of outstanding, received, and
          under-review items. Open it in Outlook or copy the email text;
          the banker sends from Outlook. The app does not send this and does
          not record that you opened or copied it.
        </p>

        <section style={styles.toSection}>
          <Fact label="Deal" value={deal.name} />
          <Fact
            label="Borrower"
            value={deal.clientName ?? '— (no borrower contact on this deal)'}
          />
          <Fact label="Items requested" value={String(documents.outstanding.length)} />
          <Fact label="Items received" value={String(documents.received.length)} />
          <Fact
            label="Items under bank review"
            value={String(documents.reviewed.length)}
          />
        </section>

        <section style={styles.fieldBlock}>
          <label style={styles.label} htmlFor="status-packet-recipient">
            Recipient (optional)
          </label>
          <input
            id="status-packet-recipient"
            type="email"
            value={recipient}
            onChange={(e) => {
              setRecipient(e.target.value);
              setAction({ kind: 'idle' });
            }}
            placeholder=""
            autoComplete="off"
            style={styles.input}
          />
          <p style={styles.helperLine}>
            Recipient is optional. Leave blank and choose in Outlook if you do
            not have a verified borrower email — the borrower record on this
            deal carries a display name only. The recipient is never saved by
            this app; it appears only in your local Outlook compose surface
            (or in the copied email text).
          </p>
        </section>

        <section style={styles.fieldBlock}>
          <label style={styles.label} htmlFor="status-packet-subject">
            Subject
          </label>
          <input
            id="status-packet-subject"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            style={styles.input}
          />
        </section>

        <section style={styles.fieldBlock}>
          <label style={styles.label} htmlFor="status-packet-body">
            Borrower-safe summary
          </label>
          <textarea
            id="status-packet-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={20}
            style={styles.textareaBody}
          />
          <p style={styles.helperLine}>
            Edits are your responsibility. The template is borrower-safe by
            construction; reviewing your edits before sending is recommended.
          </p>
        </section>

        {action.kind === 'copied' && (
          <div
            role="status"
            style={{
              ...styles.outcomeBox,
              background: palette.clearBg,
              borderColor: palette.clear,
            }}
          >
            <div style={{ ...styles.outcomeTitle, color: palette.clearFg }}>
              Email content copied to clipboard
            </div>
            <p style={styles.outcomeDetail}>
              Paste the text into your Outlook compose window. The banker
              sends from Outlook; the app did not send and nothing was logged
              to this deal's activity ledger.
            </p>
          </div>
        )}
        {action.kind === 'mailto-launched' && (
          <div
            role="status"
            style={{
              ...styles.outcomeBox,
              background: palette.clearBg,
              borderColor: palette.clear,
            }}
          >
            <div style={{ ...styles.outcomeTitle, color: palette.clearFg }}>
              Outlook handoff launched
            </div>
            <p style={styles.outcomeDetail}>
              Your default mail client should open with the packet pre-filled.
              The banker sends from Outlook; the app did not send and nothing
              was logged to this deal's activity ledger.
            </p>
          </div>
        )}
        {action.kind === 'copy-failed' && (
          <div
            role="alert"
            style={{
              ...styles.outcomeBox,
              background: palette.atRiskBg,
              borderColor: palette.atRisk,
            }}
          >
            <div style={{ ...styles.outcomeTitle, color: palette.atRiskFg }}>
              Could not access clipboard
            </div>
            <p style={styles.outcomeDetail}>
              The browser blocked the clipboard write. Select the text in the
              preview above and copy it manually.
            </p>
          </div>
        )}

        <footer style={styles.footer}>
          <button type="button" onClick={onClose} style={styles.secondaryButton}>
            Close
          </button>
          <button
            type="button"
            onClick={handleCopy}
            disabled={!canHandoff}
            style={
              canHandoff ? styles.secondaryButton : styles.secondaryButtonDisabled
            }
            aria-label="Copy borrower-safe email"
          >
            {action.kind === 'copied' ? 'Copied ✓' : 'Copy email'}
          </button>
          <button
            type="button"
            onClick={handleOpenMailto}
            disabled={!canHandoff}
            style={
              canHandoff ? styles.primaryButton : styles.primaryButtonDisabled
            }
            aria-label="Open borrower-safe email in Outlook"
          >
            Open in Outlook
          </button>
        </footer>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.fact}>
      <dt style={styles.dt}>{label}</dt>
      <dd style={styles.dd}>{value}</dd>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(20, 26, 42, 0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    zIndex: 100,
    fontFamily: typography.family,
  },
  card: {
    background: palette.surface,
    border: `1px solid ${palette.border}`,
    borderRadius: 8,
    boxShadow: '0 12px 32px rgba(20, 26, 42, 0.18)',
    width: '100%',
    maxWidth: 720,
    maxHeight: '92vh',
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
    padding: `${spacing.xl} ${spacing.xl}`,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  eyebrow: {
    fontSize: typography.size.xs,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase',
    color: palette.primary,
    fontWeight: typography.weight.semibold,
  },
  title: {
    margin: 0,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.semibold,
    color: palette.text,
    letterSpacing: typography.letterSpacing.heading,
  },
  localOnlyBanner: {
    margin: 0,
    padding: spacing.sm,
    background: palette.surfaceAlt,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    fontSize: typography.size.sm,
    color: palette.text,
    lineHeight: typography.lineHeight.snug,
  },
  toSection: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: `${spacing.xs} ${spacing.md}`,
    margin: 0,
    paddingBottom: spacing.sm,
    borderBottom: `1px solid ${palette.divider}`,
  },
  fact: { display: 'flex', flexDirection: 'column', gap: 2 },
  dt: {
    fontSize: typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
    color: palette.textSubtle,
    fontWeight: typography.weight.semibold,
  },
  dd: {
    margin: 0,
    fontSize: typography.size.sm,
    color: palette.text,
    wordBreak: 'break-word',
  },
  fieldBlock: { display: 'flex', flexDirection: 'column', gap: spacing.xs },
  label: {
    fontSize: typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
    color: palette.textSubtle,
    fontWeight: typography.weight.semibold,
  },
  input: {
    fontFamily: typography.family,
    fontSize: typography.size.base,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.sm}`,
    color: palette.text,
    background: palette.surface,
    lineHeight: typography.lineHeight.snug,
  },
  textareaBody: {
    fontFamily: typography.mono,
    fontSize: typography.size.sm,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.sm}`,
    color: palette.text,
    background: palette.surface,
    resize: 'vertical',
    minHeight: 240,
    lineHeight: typography.lineHeight.snug,
    whiteSpace: 'pre-wrap',
  },
  helperLine: { margin: 0, fontSize: typography.size.xs, color: palette.textSubtle },
  outcomeBox: {
    border: '1px solid',
    borderRadius: radius.sm,
    padding: spacing.md,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
  },
  outcomeTitle: { fontSize: typography.size.lg, fontWeight: typography.weight.semibold },
  outcomeDetail: {
    margin: 0,
    fontSize: typography.size.md,
    color: palette.text,
    lineHeight: typography.lineHeight.snug,
  },
  footer: {
    display: 'flex',
    gap: spacing.sm,
    justifyContent: 'flex-end',
    paddingTop: spacing.sm,
    borderTop: `1px solid ${palette.divider}`,
  },
  primaryButton: {
    background: palette.primary,
    color: palette.textInverse,
    border: 'none',
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    cursor: 'pointer',
    fontFamily: typography.family,
  },
  primaryButtonDisabled: {
    background: palette.borderStrong,
    color: palette.textInverse,
    border: 'none',
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    cursor: 'not-allowed',
    fontFamily: typography.family,
  },
  secondaryButton: {
    background: palette.surface,
    color: palette.text,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
    fontSize: typography.size.md,
    fontWeight: typography.weight.medium,
    cursor: 'pointer',
    fontFamily: typography.family,
  },
  secondaryButtonDisabled: {
    background: palette.surfaceAlt,
    color: palette.textMuted,
    border: `1px solid ${palette.divider}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
    fontSize: typography.size.md,
    fontWeight: typography.weight.medium,
    cursor: 'not-allowed',
    fontFamily: typography.family,
  },
};
