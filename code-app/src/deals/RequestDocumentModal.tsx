import { useEffect, useRef, useState } from 'react';
import type { DealDocument } from './dealDocumentQueries';
import type { RequestDocumentOutcome } from './documentActions';
import type { SendDocumentRequestEmailOutcome } from './sendDocumentRequestEmail';
import { EMAIL_MODE } from './emailDelivery/emailMode';
import { Badge } from '../shared/Badge';
import { palette, radius, spacing, typography } from '../shared/theme';

/**
 * Phase 22 (request) + Phase 61 (Outlook send).
 *
 * Backwards-compatible: when `onSendEmail` is not provided, the modal
 * behaves exactly as Phase 22 — note-only in-app request, no email
 * section, no mode badge, no send outcome. When `onSendEmail` IS
 * provided, the modal grows:
 *   - A Mode badge surfacing the build-time DRY_RUN / LIVE setting
 *   - A "Send email" toggle (default ON)
 *   - Recipient + subject fields the banker types into
 *   - Sequenced submission: the request is recorded FIRST; the send
 *     is attempted only if the request succeeded
 *   - A combined outcome view that shows both outcomes honestly
 */

interface RequestDocumentModalProps {
  doc: DealDocument;
  onConfirm: (note: string) => Promise<RequestDocumentOutcome>;
  onClose: () => void;
  /** Phase 61. When provided, the modal sequences the send after the
   *  request and renders both outcomes. */
  onSendEmail?: (input: {
    recipient: string;
    subject: string;
    body: string;
  }) => Promise<SendDocumentRequestEmailOutcome>;
}

type ModalState =
  | { kind: 'editing' }
  | { kind: 'submitting'; phase: 'request' | 'send' }
  | {
      kind: 'outcome';
      requestOutcome: RequestDocumentOutcome;
      sendOutcome: SendDocumentRequestEmailOutcome | undefined;
    };

export function RequestDocumentModal({
  doc,
  onConfirm,
  onClose,
  onSendEmail,
}: RequestDocumentModalProps) {
  const emailFeatureEnabled = !!onSendEmail;
  const [note, setNote] = useState('');
  const [sendEnabled, setSendEnabled] = useState(emailFeatureEnabled);
  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState(`Document request: ${doc.name}`);
  const [state, setState] = useState<ModalState>({ kind: 'editing' });
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && state.kind !== 'submitting') {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, state.kind]);

  const trimmedNote = note.trim();
  const trimmedRecipient = recipient.trim();
  const trimmedSubject = subject.trim();
  const willSend = emailFeatureEnabled && sendEnabled;
  const sendInputsValid =
    !willSend ||
    (trimmedRecipient.length > 0 && trimmedSubject.length > 0);
  const canSubmit =
    state.kind === 'editing' && trimmedNote.length > 0 && sendInputsValid;
  const inProgress = state.kind === 'submitting';
  const isReRequest = !!doc.requestDate;

  async function handleConfirm() {
    if (!canSubmit) return;
    setState({ kind: 'submitting', phase: 'request' });
    let requestOutcome: RequestDocumentOutcome;
    try {
      requestOutcome = await onConfirm(trimmedNote);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setState({
        kind: 'outcome',
        requestOutcome: { kind: 'unknown', message },
        sendOutcome: undefined,
      });
      return;
    }

    // Only attempt the send when the request itself recorded. A
    // failed request (doc-failed) means the upstream Dataverse row
    // was not updated — sending an email about a request that was
    // not recorded would be dishonest.
    const shouldAttemptSend =
      willSend && !!onSendEmail && requestOutcome.kind === 'success';

    if (!shouldAttemptSend) {
      setState({ kind: 'outcome', requestOutcome, sendOutcome: undefined });
      return;
    }

    setState({ kind: 'submitting', phase: 'send' });
    let sendOutcome: SendDocumentRequestEmailOutcome;
    try {
      sendOutcome = await onSendEmail({
        recipient: trimmedRecipient,
        subject: trimmedSubject,
        body: trimmedNote,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      sendOutcome = { kind: 'unknown', message };
    }
    setState({ kind: 'outcome', requestOutcome, sendOutcome });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="request-document-title"
      style={styles.overlay}
    >
      <div style={styles.card}>
        <header style={styles.header}>
          <div>
            <div style={styles.eyebrow}>Deal Workspace · Documents</div>
            <h2 id="request-document-title" style={styles.title}>
              {isReRequest ? 'Re-request Document' : 'Request Document'}
            </h2>
          </div>
          {emailFeatureEnabled && <ModeBadge />}
        </header>

        <section style={styles.summarySection}>
          <div style={styles.summaryHeaderRow}>
            <span style={styles.docName}>{doc.name}</span>
            <Badge variant="atRisk" appearance="outline">Outstanding</Badge>
          </div>
          <dl style={styles.facts}>
            <Fact label="Due date" value={formatDate(doc.dueDate)} />
            <Fact label="Last requested" value={formatDate(doc.requestDate) ?? 'Never'} />
            <Fact label="Current status" value="Outstanding" />
          </dl>
        </section>

        {state.kind === 'outcome' ? (
          <OutcomeBlock
            requestOutcome={state.requestOutcome}
            sendOutcome={state.sendOutcome}
          />
        ) : (
          <>
            <section style={styles.noteSection}>
              <label htmlFor="request-document-note" style={styles.label}>
                Request note <span style={styles.required}>required</span>
              </label>
              <textarea
                id="request-document-note"
                ref={textareaRef}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={inProgress}
                placeholder={
                  emailFeatureEnabled
                    ? 'Describe what is being requested and any context. This text is the email body AND the audit/timeline note for the request itself.'
                    : 'Describe what is being requested and any context. The note is copied to the audit event and the deal activity timeline.'
                }
                rows={4}
                style={{ ...styles.textarea, opacity: inProgress ? 0.6 : 1 }}
              />
              {!emailFeatureEnabled && (
                <p style={styles.helperLine}>
                  In-app request only. No borrower email is sent in this phase. The note is
                  recorded on the deal timeline and audit trail; cr664_DocumentChecklist
                  itself has no request-note column.
                </p>
              )}
            </section>

            {emailFeatureEnabled && (
              <section style={styles.emailSection}>
                <label style={styles.toggleRow}>
                  <input
                    type="checkbox"
                    checked={sendEnabled}
                    onChange={(e) => setSendEnabled(e.target.checked)}
                    disabled={inProgress}
                  />
                  <span style={styles.toggleLabel}>
                    Send email through Outlook
                  </span>
                </label>
                {sendEnabled && (
                  <>
                    <div style={styles.inputRow}>
                      <label htmlFor="email-recipient" style={styles.label}>
                        Send to <span style={styles.required}>required</span>
                      </label>
                      <input
                        id="email-recipient"
                        type="email"
                        value={recipient}
                        onChange={(e) => setRecipient(e.target.value)}
                        disabled={inProgress}
                        placeholder="borrower@example.com"
                        autoComplete="off"
                        style={styles.input}
                      />
                    </div>
                    <div style={styles.inputRow}>
                      <label htmlFor="email-subject" style={styles.label}>
                        Subject <span style={styles.required}>required</span>
                      </label>
                      <input
                        id="email-subject"
                        type="text"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        disabled={inProgress}
                        style={styles.input}
                      />
                    </div>
                    <p style={styles.helperLine}>
                      The body of the email is the request note above. The full
                      recipient address is recorded only on the audit event; the
                      timeline and outcome panel show a masked form. Mode is{' '}
                      <strong>{EMAIL_MODE}</strong>:
                      {EMAIL_MODE === 'DRY_RUN'
                        ? ' nothing leaves the client.'
                        : ' Outlook will attempt delivery.'}
                    </p>
                  </>
                )}
              </section>
            )}
          </>
        )}

        <footer style={styles.footer}>
          {state.kind === 'outcome' ? (
            <button type="button" onClick={onClose} style={styles.primaryButton}>
              Close
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={inProgress}
                style={inProgress ? styles.secondaryButtonDisabled : styles.secondaryButton}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!canSubmit}
                style={canSubmit ? styles.primaryButton : styles.primaryButtonDisabled}
              >
                {primaryButtonLabel({
                  state,
                  isReRequest,
                  willSend,
                })}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}

function primaryButtonLabel({
  state,
  isReRequest,
  willSend,
}: {
  state: ModalState;
  isReRequest: boolean;
  willSend: boolean;
}): string {
  if (state.kind === 'submitting') {
    return state.phase === 'request' ? 'Recording…' : 'Sending…';
  }
  if (willSend) {
    return isReRequest ? 'Record re-request & send' : 'Record request & send';
  }
  return isReRequest ? 'Record re-request' : 'Record request';
}

function ModeBadge() {
  const isLive = EMAIL_MODE === 'LIVE';
  return (
    <span
      role="status"
      aria-label={`Email delivery mode: ${EMAIL_MODE}`}
      style={{
        ...styles.modeBadge,
        background: isLive ? palette.clearBg : palette.surfaceAlt,
        color: isLive ? palette.clearFg : palette.textSubtle,
        borderColor: isLive ? palette.clear : palette.border,
      }}
    >
      Mode: {EMAIL_MODE}
    </span>
  );
}

function OutcomeBlock({
  requestOutcome,
  sendOutcome,
}: {
  requestOutcome: RequestDocumentOutcome;
  sendOutcome: SendDocumentRequestEmailOutcome | undefined;
}) {
  return (
    <div style={styles.outcomeStack}>
      <RequestOutcomeBlock outcome={requestOutcome} />
      {sendOutcome && <SendOutcomeBlock outcome={sendOutcome} />}
    </div>
  );
}

function RequestOutcomeBlock({ outcome }: { outcome: RequestDocumentOutcome }) {
  switch (outcome.kind) {
    case 'success':
      return (
        <div style={{ ...styles.outcomeBox, background: palette.clearBg, borderColor: palette.clear }}>
          <div style={{ ...styles.outcomeTitle, color: palette.clearFg }}>Request recorded</div>
          <p style={styles.outcomeDetail}>
            Document request stamped; audit and timeline events recorded.
          </p>
        </div>
      );
    case 'doc-failed':
      return (
        <div style={{ ...styles.outcomeBox, background: palette.atRiskBg, borderColor: palette.atRisk }}>
          <div style={{ ...styles.outcomeTitle, color: palette.atRiskFg }}>
            Could not record request
          </div>
          <p style={styles.outcomeDetail}>
            The document is unchanged. A Failed audit event was recorded best-effort.
            Refresh and try again. No email was attempted because the request itself did not record.
          </p>
          <p style={styles.outcomeDetailMono}>{outcome.docError}</p>
        </div>
      );
    case 'governance-partial':
      return (
        <div style={{ ...styles.outcomeBox, background: palette.blockedBg, borderColor: palette.blocked }}>
          <div style={{ ...styles.outcomeTitle, color: palette.blockedFg }}>
            Critical: governance write failed
          </div>
          <p style={styles.outcomeDetail}>
            The document request was recorded on the checklist row, but one or both
            governance writes failed. The request is not fully governed.
          </p>
          {outcome.auditError && (
            <p style={styles.outcomeDetailMono}>Audit: {outcome.auditError}</p>
          )}
          {outcome.timelineError && (
            <p style={styles.outcomeDetailMono}>Timeline: {outcome.timelineError}</p>
          )}
          <p style={styles.outcomeDetail}>
            Action: capture this message and ask the AuditEvent / TimelineEvent owner
            to investigate. Do not retry — the document request is already recorded.
          </p>
        </div>
      );
    case 'unknown':
      return (
        <div style={{ ...styles.outcomeBox, background: palette.atRiskBg, borderColor: palette.atRisk }}>
          <div style={{ ...styles.outcomeTitle, color: palette.atRiskFg }}>
            Unexpected error on request
          </div>
          <p style={styles.outcomeDetail}>{outcome.message}</p>
        </div>
      );
  }
}

function SendOutcomeBlock({ outcome }: { outcome: SendDocumentRequestEmailOutcome }) {
  switch (outcome.kind) {
    case 'success': {
      const isLive = outcome.mode === 'LIVE';
      return (
        <div style={{ ...styles.outcomeBox, background: palette.clearBg, borderColor: palette.clear }}>
          <div style={{ ...styles.outcomeTitle, color: palette.clearFg }}>
            {isLive ? 'Outlook accepted the message' : 'Send recorded (DRY_RUN)'}
          </div>
          <p style={styles.outcomeDetail}>
            Recipient: <strong>{outcome.maskedRecipient}</strong>. Mode:{' '}
            <strong>{outcome.mode}</strong>.{' '}
            {isLive
              ? 'Audit and timeline events recorded. The full address is on the audit row.'
              : 'No message left the client. The audit + timeline events record the simulated send honestly.'}
          </p>
          {outcome.providerMessageId && (
            <p style={styles.outcomeDetailMono}>Provider id: {outcome.providerMessageId}</p>
          )}
        </div>
      );
    }
    case 'send-failed':
      return (
        <div style={{ ...styles.outcomeBox, background: palette.atRiskBg, borderColor: palette.atRisk }}>
          <div style={{ ...styles.outcomeTitle, color: palette.atRiskFg }}>
            Outlook did not accept the message
          </div>
          <p style={styles.outcomeDetail}>
            The request itself remains recorded. The send was attempted in{' '}
            <strong>{outcome.mode}</strong> mode and failed
            {outcome.transient ? ' (transient — retry may help)' : ' (permanent — do not retry without resolving)'}.
          </p>
          <p style={styles.outcomeDetailMono}>{outcome.sendError}</p>
        </div>
      );
    case 'governance-partial':
      return (
        <div style={{ ...styles.outcomeBox, background: palette.blockedBg, borderColor: palette.blocked }}>
          <div style={{ ...styles.outcomeTitle, color: palette.blockedFg }}>
            Critical: send governance write failed
          </div>
          <p style={styles.outcomeDetail}>
            Outlook accepted the message (recipient: <strong>{outcome.maskedRecipient}</strong>), but
            one or both governance writes failed. The send is not fully governed; do NOT retry — the
            message has already gone out.
          </p>
          {outcome.auditError && (
            <p style={styles.outcomeDetailMono}>Audit: {outcome.auditError}</p>
          )}
          {outcome.timelineError && (
            <p style={styles.outcomeDetailMono}>Timeline: {outcome.timelineError}</p>
          )}
        </div>
      );
    case 'unknown':
      return (
        <div style={{ ...styles.outcomeBox, background: palette.atRiskBg, borderColor: palette.atRisk }}>
          <div style={{ ...styles.outcomeTitle, color: palette.atRiskFg }}>
            Unexpected error on send
          </div>
          <p style={styles.outcomeDetail}>{outcome.message}</p>
        </div>
      );
  }
}

function Fact({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div style={styles.fact}>
      <dt style={styles.dt}>{label}</dt>
      <dd style={styles.dd}>{value ?? '—'}</dd>
    </div>
  );
}

function formatDate(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
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
    maxWidth: 560,
    maxHeight: '90vh',
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
  modeBadge: {
    padding: `${spacing.xxs} ${spacing.sm}`,
    border: '1px solid',
    borderRadius: radius.sm,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
    whiteSpace: 'nowrap',
  },
  summarySection: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
    paddingBottom: spacing.md,
    borderBottom: `1px solid ${palette.divider}`,
  },
  summaryHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  docName: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: palette.text,
  },
  facts: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: `${spacing.xs} ${spacing.md}`,
    margin: 0,
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
  noteSection: { display: 'flex', flexDirection: 'column', gap: spacing.xs },
  emailSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTop: `1px solid ${palette.divider}`,
  },
  toggleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.xs,
    cursor: 'pointer',
    color: palette.text,
    fontSize: typography.size.md,
  },
  toggleLabel: { fontWeight: typography.weight.semibold },
  inputRow: { display: 'flex', flexDirection: 'column', gap: spacing.xxs },
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
  textarea: {
    fontFamily: typography.family,
    fontSize: typography.size.base,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.sm}`,
    color: palette.text,
    background: palette.surface,
    resize: 'vertical',
    minHeight: 80,
    lineHeight: typography.lineHeight.snug,
  },
  helperLine: { margin: 0, fontSize: typography.size.xs, color: palette.textSubtle },
  outcomeStack: { display: 'flex', flexDirection: 'column', gap: spacing.sm },
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
  outcomeDetailMono: {
    margin: 0,
    fontSize: typography.size.sm,
    color: palette.textMuted,
    fontFamily: typography.mono,
    background: palette.surfaceAlt,
    padding: `${spacing.xxs} ${spacing.xs}`,
    borderRadius: radius.sm,
    wordBreak: 'break-word',
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
