import { useEffect, useMemo, useRef, useState } from 'react';
import type { DealDetail } from './dealQueries';
import type { DealDocument } from './dealDocumentQueries';
import type { DealTask } from './dealTaskQueries';
import {
  TEMPLATE_OPTIONS,
  buildBorrowerUpdateDraft,
  findProhibitedTerms,
  type BorrowerUpdateTemplate,
  type ProhibitedTermHit,
} from './borrowerUpdateDraft';
import { isLikelyValidEmail } from './emailDelivery/outlookEmailAdapters';
import { EMAIL_MODE } from './emailDelivery/emailMode';
import type {
  SendBorrowerUpdateEmailInput,
  SendBorrowerUpdateEmailOutcome,
} from './sendBorrowerUpdateEmail';
import { Badge } from '../shared/Badge';
import { palette, radius, spacing, typography } from '../shared/theme';

/**
 * Phase 23 / 105: borrower update modal.
 *
 *   Phase 23 (original): local-only draft. Generate from a template,
 *   edit, Copy to clipboard, paste into the banker's own mail client.
 *   No Dataverse write.
 *
 *   Phase 105 (this file): adds an optional LIVE Send path that calls
 *   the new sendBorrowerUpdateEmail governed write. The Copy path is
 *   preserved unchanged — bankers can still operate fully offline.
 *   When the banker types a recipient and clicks Send, the action
 *   layer emits ONE audit row + ONE BorrowerUpdateSent timeline row
 *   (the schema designer reserved 788190014 for exactly this moment;
 *   see ../deals/borrowerUpdateDraft.ts header).
 *
 *   No attachments. No Cc / Bcc / From override / ReplyTo /
 *   Sensitivity. The recipient is typed by hand (cr664_borrowers has
 *   no email column). The banker note is REQUIRED for both Copy and
 *   Send so the audit row carries a banker-supplied reason verbatim.
 */

export interface DraftBorrowerUpdateModalProps {
  deal: DealDetail;
  outstandingDocuments: DealDocument[];
  openTasks: DealTask[];
  bankerName: string | undefined;
  /** Phase 105: when provided, the modal shows a Send button. The
   *  parent passes a callback that invokes sendBorrowerUpdateEmail
   *  (banker workspace) — keeping the modal free of Dataverse SDK
   *  imports and easy to test. When undefined (e.g. older callers
   *  not yet updated), the modal renders Copy-only behavior. */
  onSendEmail?: (input: SendBorrowerUpdateEmailInput) => Promise<SendBorrowerUpdateEmailOutcome>;
  /** Phase 105: dealId is passed through to the send action. */
  dealId: string;
  /** Phase 105: systemUserId is required for the audit/timeline
   *  ChangedBy/EventBy lookups. When undefined (write-disabled banker
   *  state) the Send button is disabled with an explanatory message. */
  systemUserId: string | undefined;
  writeDisabledReason: string | undefined;
  onClose: () => void;
}

type CopyState = 'idle' | 'copied' | 'failed';
type SendState =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'done'; outcome: SendBorrowerUpdateEmailOutcome };

export function DraftBorrowerUpdateModal({
  deal,
  outstandingDocuments,
  openTasks,
  bankerName,
  onSendEmail,
  dealId,
  systemUserId,
  writeDisabledReason,
  onClose,
}: DraftBorrowerUpdateModalProps) {
  const [template, setTemplate] = useState<BorrowerUpdateTemplate>('general-status');
  const initial = useMemo(
    () =>
      buildBorrowerUpdateDraft(template, {
        deal,
        outstandingDocuments,
        openTasks,
        bankerName,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [template],
  );
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [reason, setReason] = useState('');
  const [recipient, setRecipient] = useState('');
  const [copy, setCopy] = useState<CopyState>('idle');
  const [send, setSend] = useState<SendState>({ kind: 'idle' });
  const noteRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setSubject(initial.subject);
    setBody(initial.body);
    setCopy('idle');
    setSend({ kind: 'idle' });
  }, [initial]);

  useEffect(() => {
    noteRef.current?.focus();
  }, []);

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

  const prohibitedHits: ProhibitedTermHit[] = useMemo(
    () => findProhibitedTerms(`${subject}\n${body}`, deal),
    [subject, body, deal],
  );

  const reasonOk = reason.trim().length > 0;
  const safetyOk = prohibitedHits.length === 0;
  const recipientOk = isLikelyValidEmail(recipient);
  const subjectOk = subject.trim().length > 0;
  const bodyOk = body.trim().length > 0;

  // Copy gating preserves the Phase 23 contract: banker note + body +
  // safety check. Recipient is NOT required to Copy (the banker may
  // be using Copy precisely because they want to paste into a mail
  // client that already has the recipient picked).
  const canCopy = reasonOk && safetyOk && bodyOk;

  // Send gating adds the recipient + systemUserId + onSendEmail
  // availability requirements.
  const canSend =
    canCopy &&
    subjectOk &&
    recipientOk &&
    systemUserId !== undefined &&
    onSendEmail !== undefined &&
    send.kind !== 'sending';

  async function handleCopy() {
    if (!canCopy) return;
    const payload = `Subject: ${subject}\n\n${body}`;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload);
        setCopy('copied');
        return;
      }
      setCopy('failed');
    } catch {
      setCopy('failed');
    }
  }

  async function handleSend() {
    if (!canSend || !onSendEmail || systemUserId === undefined) return;
    setSend({ kind: 'sending' });
    try {
      const outcome = await onSendEmail({
        dealId,
        systemUserId,
        recipient: recipient.trim(),
        subject,
        body,
        bankerNote: reason,
        template,
      });
      setSend({ kind: 'done', outcome });
    } catch (err: unknown) {
      setSend({
        kind: 'done',
        outcome: {
          kind: 'unknown',
          message: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="draft-borrower-update-title"
      style={styles.overlay}
    >
      <div style={styles.card}>
        <header style={styles.header}>
          <div>
            <div style={styles.eyebrow}>Deal Workspace · Borrower Communication</div>
            <h2 id="draft-borrower-update-title" style={styles.title}>
              Borrower Update
            </h2>
          </div>
          <ModeBadge />
        </header>

        <p style={styles.modeBanner} role="status">
          {EMAIL_MODE === 'LIVE' ? (
            <>
              <strong>Mode: LIVE.</strong> Clicking Send will hand the
              message to Outlook through the registered connector. The
              app reports <em>Outlook accepted</em> — meaning the
              connector took the request for handoff. Acceptance is
              not proof that the recipient received the message. Copy
              remains available for an offline workflow.
            </>
          ) : (
            <>
              <strong>Mode: DRY_RUN.</strong> Send is wired end-to-end
              (audit + BorrowerUpdateSent timeline + outcome union) but
              the adapter synthesizes acceptance locally — nothing
              leaves the client. Copy works exactly as before.
            </>
          )}
        </p>

        <section style={styles.toSection}>
          <Fact label="Borrower (client)" value={deal.clientName ?? '— (no borrower name on record)'} />
          <Fact label="Deal" value={deal.name} />
          <Fact label="Stage" value={deal.stage ?? '—'} />
        </section>

        <section style={styles.fieldBlock}>
          <label style={styles.label} htmlFor="draft-recipient">
            Recipient email{' '}
            <span style={styles.optionalForCopy}>required for Send · optional for Copy</span>
          </label>
          <input
            id="draft-recipient"
            type="email"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="borrower@example.com"
            style={styles.input}
            autoComplete="off"
            spellCheck={false}
          />
          <p style={styles.helperLine}>
            Borrower email is not stored on the deal — type it from the
            relationship record or prior correspondence.
          </p>
        </section>

        <section style={styles.fieldBlock}>
          <label style={styles.label} htmlFor="draft-template-select">
            Template
          </label>
          <select
            id="draft-template-select"
            value={template}
            onChange={(e) => setTemplate(e.target.value as BorrowerUpdateTemplate)}
            style={styles.select}
          >
            {TEMPLATE_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
          <p style={styles.helperLine}>
            {TEMPLATE_OPTIONS.find((o) => o.key === template)?.description}
          </p>
        </section>

        <section style={styles.fieldBlock}>
          <label style={styles.label} htmlFor="draft-subject">
            Subject
          </label>
          <input
            id="draft-subject"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            style={styles.input}
          />
        </section>

        <section style={styles.fieldBlock}>
          <label style={styles.label} htmlFor="draft-body">
            Body
          </label>
          <textarea
            id="draft-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={14}
            style={styles.textareaBody}
          />
        </section>

        {prohibitedHits.length > 0 && (
          <div style={styles.guardBox} role="alert">
            <div style={styles.guardTitle}>Borrower-safe language check flagged issues</div>
            <ul style={styles.guardList}>
              {prohibitedHits.map((h) => (
                <li key={h.term}>
                  <strong>{h.term}</strong> — {h.reason}
                </li>
              ))}
            </ul>
            <p style={styles.guardDetail}>
              Remove or soften these terms before copying or sending.
              Commitment language is not permitted unless the deal
              stage/status explicitly supports it.
            </p>
          </div>
        )}

        <section style={styles.fieldBlock}>
          <label style={styles.label} htmlFor="draft-reason">
            Banker note / reason for this update{' '}
            <span style={styles.required}>required</span>
          </label>
          <textarea
            id="draft-reason"
            ref={noteRef}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Why are you sending this update? (Internal only — not part of the borrower-facing message.)"
            style={styles.textareaReason}
          />
        </section>

        {copy === 'copied' && (
          <div style={{ ...styles.outcomeBox, background: palette.clearBg, borderColor: palette.clear }}>
            <div style={{ ...styles.outcomeTitle, color: palette.clearFg }}>
              Copied to clipboard
            </div>
            <p style={styles.outcomeDetail}>
              The draft was copied. Paste it into your mail client to
              send manually. Nothing was logged to this deal's activity
              ledger.
            </p>
          </div>
        )}
        {copy === 'failed' && (
          <div style={{ ...styles.outcomeBox, background: palette.atRiskBg, borderColor: palette.atRisk }}>
            <div style={{ ...styles.outcomeTitle, color: palette.atRiskFg }}>
              Could not access clipboard
            </div>
            <p style={styles.outcomeDetail}>
              Select the body text manually and copy it (Ctrl+C /
              Cmd+C). The browser clipboard API was unavailable.
            </p>
          </div>
        )}

        <SendOutcomePanel send={send} />

        {writeDisabledReason && systemUserId === undefined && (
          <div style={{ ...styles.outcomeBox, background: palette.neutralBg, borderColor: palette.divider }}>
            <div style={{ ...styles.outcomeTitle, color: palette.text }}>
              Send is disabled
            </div>
            <p style={styles.outcomeDetail}>{writeDisabledReason}</p>
          </div>
        )}

        <footer style={styles.footer}>
          <button type="button" onClick={onClose} style={styles.secondaryButton}>
            Close
          </button>
          <button
            type="button"
            onClick={handleCopy}
            disabled={!canCopy}
            style={canCopy ? styles.secondaryActionButton : styles.secondaryActionButtonDisabled}
            aria-label="Copy draft to clipboard"
          >
            Copy draft
          </button>
          {onSendEmail !== undefined && (
            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend}
              style={canSend ? styles.primaryButton : styles.primaryButtonDisabled}
              aria-label="Send borrower update through Outlook"
            >
              {send.kind === 'sending' ? 'Sending…' : 'Send'}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

function ModeBadge() {
  // LIVE is the only mode that performs an actual network send today.
  // DRY_RUN is tinted neutral so the banker cannot mistake it for a
  // real send. Mirrors the RequestDocumentModal mode-badge shape.
  const isLive = EMAIL_MODE === 'LIVE';
  return (
    <Badge
      variant={isLive ? 'clear' : 'neutral'}
      appearance="outline"
      aria-label={`Email delivery mode: ${EMAIL_MODE}`}
    >
      Mode: {EMAIL_MODE}
    </Badge>
  );
}

function SendOutcomePanel({ send }: { send: SendState }) {
  if (send.kind !== 'done') return null;
  const o = send.outcome;
  if (o.kind === 'success') {
    return (
      <div style={{ ...styles.outcomeBox, background: palette.clearBg, borderColor: palette.clear }}>
        <div style={{ ...styles.outcomeTitle, color: palette.clearFg }}>
          {o.mode === 'LIVE'
            ? `Outlook accepted borrower update to ${o.maskedRecipient}`
            : `DRY_RUN: borrower update prepared for ${o.maskedRecipient}`}
        </div>
        <p style={styles.outcomeDetail}>
          {o.mode === 'LIVE'
            ? 'The connector accepted the request for handoff. The audit row carries the full recipient; the timeline row shows the masked form. This is acceptance — not a delivery confirmation.'
            : 'Nothing left the client. The audit + BorrowerUpdateSent timeline rows were emitted so the workflow is exercised end-to-end. To send for real, flip VITE_EMAIL_MODE=LIVE.'}
        </p>
      </div>
    );
  }
  if (o.kind === 'send-failed') {
    const tone = o.transient ? palette.atRisk : palette.blocked;
    const fg = o.transient ? palette.atRiskFg : palette.blockedFg;
    const bg = o.transient ? palette.atRiskBg : palette.blockedBg;
    return (
      <div style={{ ...styles.outcomeBox, background: bg, borderColor: tone }}>
        <div style={{ ...styles.outcomeTitle, color: fg }}>
          {o.transient ? 'Outlook send failed — transient' : 'Outlook send failed — permanent'}
        </div>
        <p style={styles.outcomeDetail}>{o.sendError}</p>
        <p style={styles.outcomeDetail}>
          {o.transient
            ? 'You may retry. The failure is captured on the audit ledger.'
            : 'Do not retry as-is. Review the recipient address and template, or fall back to Copy + paste in your mail client.'}
        </p>
      </div>
    );
  }
  if (o.kind === 'governance-partial') {
    return (
      <div style={{ ...styles.outcomeBox, background: palette.atRiskBg, borderColor: palette.atRisk }}>
        <div style={{ ...styles.outcomeTitle, color: palette.atRiskFg }}>
          CRITICAL — partial governance write
        </div>
        <p style={styles.outcomeDetail}>
          Outlook accepted the borrower update to {o.maskedRecipient},
          but the audit and/or timeline row could not be persisted.{' '}
          <strong>Do not retry — the message may already be on its way.</strong>
        </p>
        {o.auditError && (
          <p style={styles.outcomeDetail}>Audit row error: {o.auditError}</p>
        )}
        {o.timelineError && (
          <p style={styles.outcomeDetail}>Timeline row error: {o.timelineError}</p>
        )}
      </div>
    );
  }
  return (
    <div style={{ ...styles.outcomeBox, background: palette.atRiskBg, borderColor: palette.atRisk }}>
      <div style={{ ...styles.outcomeTitle, color: palette.atRiskFg }}>
        Could not send
      </div>
      <p style={styles.outcomeDetail}>{o.message}</p>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div style={styles.fact}>
      <dt style={styles.dt}>{label}</dt>
      <dd style={styles.dd}>{value ?? '—'}</dd>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(20, 26, 42, 0.45)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: spacing.lg,
    zIndex: 100,
    fontFamily: typography.family,
    overflowY: 'auto',
  },
  card: {
    background: palette.surface,
    border: `1px solid ${palette.border}`,
    borderRadius: 8,
    boxShadow: '0 12px 32px rgba(20, 26, 42, 0.18)',
    width: '100%',
    maxWidth: 720,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
    padding: `${spacing.xl} ${spacing.xl}`,
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
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
  modeBanner: {
    margin: 0,
    padding: `${spacing.xs} ${spacing.md}`,
    background: palette.neutralBg,
    color: palette.neutralFg,
    fontSize: typography.size.sm,
    border: `1px solid ${palette.divider}`,
    borderRadius: radius.sm,
    lineHeight: typography.lineHeight.snug,
  },
  toSection: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: `${spacing.xs} ${spacing.md}`,
    margin: 0,
    padding: `${spacing.sm} 0`,
    borderTop: `1px solid ${palette.divider}`,
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
  dd: { margin: 0, fontSize: typography.size.sm, color: palette.text, wordBreak: 'break-word' },
  fieldBlock: { display: 'flex', flexDirection: 'column', gap: spacing.xxs },
  label: {
    fontSize: typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
    color: palette.textSubtle,
    fontWeight: typography.weight.semibold,
  },
  required: {
    marginLeft: spacing.xxs,
    color: palette.atRiskFg,
    textTransform: 'none',
    letterSpacing: 0,
    fontWeight: typography.weight.regular,
  },
  optionalForCopy: {
    marginLeft: spacing.xxs,
    color: palette.textSubtle,
    textTransform: 'none',
    letterSpacing: 0,
    fontWeight: typography.weight.regular,
    fontSize: typography.size.xs,
  },
  helperLine: { margin: 0, fontSize: typography.size.xs, color: palette.textSubtle },
  select: {
    fontFamily: typography.family,
    fontSize: typography.size.base,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.sm}`,
    background: palette.surface,
    color: palette.text,
  },
  input: {
    fontFamily: typography.family,
    fontSize: typography.size.base,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.sm}`,
    background: palette.surface,
    color: palette.text,
  },
  textareaBody: {
    fontFamily: typography.mono,
    fontSize: typography.size.sm,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.sm}`,
    color: palette.text,
    background: palette.surfaceAlt,
    resize: 'vertical',
    minHeight: 240,
    lineHeight: typography.lineHeight.snug,
  },
  textareaReason: {
    fontFamily: typography.family,
    fontSize: typography.size.base,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.sm}`,
    color: palette.text,
    background: palette.surface,
    resize: 'vertical',
    minHeight: 70,
    lineHeight: typography.lineHeight.snug,
  },
  guardBox: {
    border: `1px solid ${palette.atRisk}`,
    borderRadius: radius.sm,
    background: palette.atRiskBg,
    padding: spacing.md,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
  },
  guardTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: palette.atRiskFg,
  },
  guardList: {
    margin: 0,
    paddingLeft: spacing.md,
    fontSize: typography.size.sm,
    color: palette.text,
    lineHeight: typography.lineHeight.snug,
  },
  guardDetail: { margin: 0, fontSize: typography.size.sm, color: palette.text },
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
    flexWrap: 'wrap',
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
  secondaryActionButton: {
    background: palette.surface,
    color: palette.primary,
    border: `1px solid ${palette.primary}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    cursor: 'pointer',
    fontFamily: typography.family,
  },
  secondaryActionButtonDisabled: {
    background: palette.surface,
    color: palette.borderStrong,
    border: `1px solid ${palette.borderStrong}`,
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
};
