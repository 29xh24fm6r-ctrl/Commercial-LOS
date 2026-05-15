import { useEffect, useRef, useState } from 'react';
import type { DealDocument } from './dealDocumentQueries';
import type { MarkDocumentReviewedOutcome } from './documentActions';
import { Badge } from '../shared/Badge';
import { palette, radius, spacing, typography } from '../shared/theme';

interface ReviewDocumentModalProps {
  doc: DealDocument;
  /** Banker's display name; written to cr664_reviewer. Shown in
   *  the modal's summary so the banker confirms whose identity
   *  will be stamped. */
  reviewerName: string;
  onConfirm: (note: string) => Promise<MarkDocumentReviewedOutcome>;
  onClose: () => void;
}

type ModalState =
  | { kind: 'editing' }
  | { kind: 'submitting' }
  | { kind: 'outcome'; outcome: MarkDocumentReviewedOutcome };

/**
 * Phase 55: banker-side "Mark Document Reviewed" governed flow.
 *
 * What this is:
 *   - A metadata-only governed write. The banker confirms they have
 *     reviewed a received document; cr664_reviewer is populated with
 *     the banker's display name, and the row moves Received →
 *     Reviewed. The Phase 54 pending-review signal clears
 *     automatically.
 *
 * What this is NOT:
 *   - It is NOT approval. The modal copy uses "Mark reviewed" and
 *     "Document reviewed" — never "approved", "cleared", "accepted",
 *     "validated", "underwritten", "decisioned", or "compliant".
 *   - It is NOT a content judgment. The note flows to the audit
 *     trail; the action makes no claim about the document content.
 */
export function ReviewDocumentModal({
  doc,
  reviewerName,
  onConfirm,
  onClose,
}: ReviewDocumentModalProps) {
  const [note, setNote] = useState('');
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
  const canSubmit = state.kind === 'editing' && trimmedNote.length > 0;
  const inProgress = state.kind === 'submitting';

  async function handleConfirm() {
    if (!canSubmit) return;
    setState({ kind: 'submitting' });
    try {
      const outcome = await onConfirm(trimmedNote);
      setState({ kind: 'outcome', outcome });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setState({ kind: 'outcome', outcome: { kind: 'unknown', message } });
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-document-title"
      style={styles.overlay}
    >
      <div style={styles.card}>
        <header style={styles.header}>
          <div>
            <div style={styles.eyebrow}>Deal Workspace · Documents</div>
            <h2 id="review-document-title" style={styles.title}>
              Mark Document Reviewed
            </h2>
          </div>
        </header>

        <section style={styles.summarySection}>
          <div style={styles.summaryHeaderRow}>
            <span style={styles.docName}>{doc.name}</span>
            <Badge variant="info" appearance="outline">Received</Badge>
          </div>
          <dl style={styles.facts}>
            <Fact label="Received" value={formatDate(doc.receivedDate) ?? 'Not recorded'} />
            <Fact label="Reviewer" value={reviewerName} />
            <Fact label="Current status" value="Received" />
          </dl>
        </section>

        {state.kind === 'outcome' ? (
          <OutcomeBlock outcome={state.outcome} />
        ) : (
          <section style={styles.noteSection}>
            <label htmlFor="review-document-note" style={styles.label}>
              Review note <span style={styles.required}>required</span>
            </label>
            <textarea
              id="review-document-note"
              ref={textareaRef}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={inProgress}
              placeholder="Describe what was reviewed and any context worth recording. The note is copied to the audit event and the deal activity timeline."
              rows={4}
              aria-required="true"
              aria-describedby="review-document-note-help"
              style={{ ...styles.textarea, opacity: inProgress ? 0.6 : 1 }}
            />
            <p id="review-document-note-help" style={styles.helperLine}>
              Stamps your name on cr664_reviewer. This records that you
              reviewed the document — it does not approve, accept, or
              validate the contents. The note flows to the audit trail
              and deal activity timeline.
            </p>
          </section>
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
                {inProgress ? 'Recording…' : 'Mark reviewed'}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}

function OutcomeBlock({ outcome }: { outcome: MarkDocumentReviewedOutcome }) {
  // Phase 74: outcome blocks announce to assistive tech.
  switch (outcome.kind) {
    case 'success':
      return (
        <div
          role="status"
          style={{ ...styles.outcomeBox, background: palette.clearBg, borderColor: palette.clear }}
        >
          <div style={{ ...styles.outcomeTitle, color: palette.clearFg }}>Recorded</div>
          <p style={styles.outcomeDetail}>
            Document reviewed; audit and timeline events recorded.
          </p>
        </div>
      );
    case 'review-failed':
      return (
        <div
          role="alert"
          style={{ ...styles.outcomeBox, background: palette.atRiskBg, borderColor: palette.atRisk }}
        >
          <div style={{ ...styles.outcomeTitle, color: palette.atRiskFg }}>
            Could not record review
          </div>
          <p style={styles.outcomeDetail}>
            The document is unchanged. A Failed audit event was recorded best-effort.
            Refresh and try again.
          </p>
          <p style={styles.outcomeDetailMono}>{outcome.docError}</p>
        </div>
      );
    case 'governance-partial':
      return (
        <div
          role="alert"
          style={{ ...styles.outcomeBox, background: palette.blockedBg, borderColor: palette.blocked }}
        >
          <div style={{ ...styles.outcomeTitle, color: palette.blockedFg }}>
            Critical: governance write failed
          </div>
          <p style={styles.outcomeDetail}>
            The reviewer was recorded on the checklist row, but one or both
            governance writes failed. The review is not fully governed.
          </p>
          {outcome.auditError && (
            <p style={styles.outcomeDetailMono}>Audit: {outcome.auditError}</p>
          )}
          {outcome.timelineError && (
            <p style={styles.outcomeDetailMono}>Timeline: {outcome.timelineError}</p>
          )}
          <p style={styles.outcomeDetail}>
            Action: capture this message and ask the AuditEvent / TimelineEvent owner
            to investigate. Do not retry — the document review is already recorded.
          </p>
        </div>
      );
    case 'unknown':
      return (
        <div
          role="alert"
          style={{ ...styles.outcomeBox, background: palette.atRiskBg, borderColor: palette.atRisk }}
        >
          <div style={{ ...styles.outcomeTitle, color: palette.atRiskFg }}>
            Unexpected error
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
  header: { display: 'flex', flexDirection: 'column', gap: 2 },
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
