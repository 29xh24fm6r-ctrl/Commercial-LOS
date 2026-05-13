import { useEffect, useRef, useState } from 'react';
import type { AlertRow } from './adminDiagnosticsQueries';
import type { AlertActionMode, AlertOutcome } from './alertActions';
import { Badge } from '../shared/Badge';
import { palette, radius, spacing, typography, type SeverityKey } from '../shared/theme';
import { formatDate } from './adminCardChrome';

interface ResolveAlertModalProps {
  alert: AlertRow;
  mode: AlertActionMode;
  /** Resolves with the action outcome. Modal stays mounted to render
   *  outcome UI (success / audit-failed / alert-failed / unknown).
   *  Parent dismisses on Close. */
  onConfirm: (note: string) => Promise<AlertOutcome>;
  onClose: () => void;
}

type ModalState =
  | { kind: 'editing' }
  | { kind: 'submitting' }
  | { kind: 'outcome'; outcome: AlertOutcome };

const COPY: Record<AlertActionMode, { title: string; verb: string; verbing: string; helper: string }> = {
  resolve: {
    title: 'Resolve Alert',
    verb: 'Resolve alert',
    verbing: 'Resolving…',
    helper:
      'Describe what was investigated and how the issue was addressed. Note is copied to the audit trail.',
  },
  dismiss: {
    title: 'Dismiss Alert',
    verb: 'Dismiss alert',
    verbing: 'Dismissing…',
    helper:
      'Describe why the alert is being closed without remediation (e.g. duplicate, false positive, out of scope). Note is copied to the audit trail.',
  },
};

export function ResolveAlertModal({ alert, mode, onConfirm, onClose }: ResolveAlertModalProps) {
  const [note, setNote] = useState('');
  const [state, setState] = useState<ModalState>({ kind: 'editing' });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const copy = COPY[mode];

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
      aria-labelledby="resolve-alert-title"
      style={styles.overlay}
    >
      <div style={styles.card}>
        <header style={styles.header}>
          <div>
            <div style={styles.eyebrow}>Admin · Remediation</div>
            <h2 id="resolve-alert-title" style={styles.title}>{copy.title}</h2>
          </div>
        </header>

        <section style={styles.summarySection}>
          <div style={styles.summaryHeaderRow}>
            <span style={styles.alertName}>{alert.alertName}</span>
            <div style={styles.summaryBadges}>
              {alert.severityKey && (
                <Badge variant={severityVariant(alert.severityKey)}>
                  {alert.severity ?? alert.severityKey}
                </Badge>
              )}
              {alert.alertStatus && (
                <Badge variant="neutral" appearance="outline">{alert.alertStatus}</Badge>
              )}
            </div>
          </div>
          <dl style={styles.facts}>
            <Fact label="Category" value={alert.alertCategory} />
            <Fact label="Owner" value={alert.assignedToName} />
            <Fact label="Created" value={formatDate(alert.createdDate)} />
            <Fact label="Due" value={formatDate(alert.dueDate)} />
            <Fact label="SLA due" value={formatDate(alert.slaDueDate)} />
            <Fact
              label="SLA breach"
              value={formatDate(alert.slaBreachDate)}
              emphasis={!!alert.slaBreachDate}
            />
          </dl>
        </section>

        {state.kind === 'outcome' ? (
          <OutcomeBlock outcome={state.outcome} mode={mode} />
        ) : (
          <section style={styles.noteSection}>
            <label htmlFor="alert-note" style={styles.label}>
              {mode === 'resolve' ? 'Resolution note' : 'Dismissal note'}{' '}
              <span style={styles.required}>required</span>
            </label>
            <textarea
              id="alert-note"
              ref={textareaRef}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={inProgress}
              placeholder={
                mode === 'resolve'
                  ? 'What was investigated and how the alert was addressed.'
                  : 'Why this alert is being closed without remediation.'
              }
              rows={4}
              style={{ ...styles.textarea, opacity: inProgress ? 0.6 : 1 }}
            />
            <p style={styles.helperLine}>{copy.helper}</p>
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
                {inProgress ? copy.verbing : copy.verb}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}

function OutcomeBlock({ outcome, mode }: { outcome: AlertOutcome; mode: AlertActionMode }) {
  const verb = mode === 'resolve' ? 'Resolved' : 'Dismissed';
  const verbLower = verb.toLowerCase();
  switch (outcome.kind) {
    case 'success':
      return (
        <div style={{ ...styles.outcomeBox, background: palette.clearBg, borderColor: palette.clear }}>
          <div style={{ ...styles.outcomeTitle, color: palette.clearFg }}>{verb}</div>
          <p style={styles.outcomeDetail}>
            Alert updated and audit event recorded
            {outcome.auditEventId ? ` (audit id ${outcome.auditEventId})` : ''}.
          </p>
        </div>
      );
    case 'audit-failed':
      return (
        <div style={{ ...styles.outcomeBox, background: palette.blockedBg, borderColor: palette.blocked }}>
          <div style={{ ...styles.outcomeTitle, color: palette.blockedFg }}>
            Critical: audit event failed
          </div>
          <p style={styles.outcomeDetail}>
            The alert was marked {verbLower} on the record, but the audit-event write
            failed. The remediation is not fully governed.
          </p>
          <p style={styles.outcomeDetailMono}>{outcome.auditError}</p>
          <p style={styles.outcomeDetail}>
            Action: capture this message, then ask the AuditEvent owner to investigate.
            Do not retry the remediation — the alert is already updated.
          </p>
        </div>
      );
    case 'alert-failed':
      return (
        <div style={{ ...styles.outcomeBox, background: palette.atRiskBg, borderColor: palette.atRisk }}>
          <div style={{ ...styles.outcomeTitle, color: palette.atRiskFg }}>
            Could not {mode} alert
          </div>
          <p style={styles.outcomeDetail}>
            The alert is unchanged. A Failed audit event was recorded (best effort).
            Refresh and try again.
          </p>
          <p style={styles.outcomeDetailMono}>{outcome.alertError}</p>
        </div>
      );
    case 'unknown':
      return (
        <div style={{ ...styles.outcomeBox, background: palette.atRiskBg, borderColor: palette.atRisk }}>
          <div style={{ ...styles.outcomeTitle, color: palette.atRiskFg }}>
            Unexpected error
          </div>
          <p style={styles.outcomeDetail}>{outcome.message}</p>
        </div>
      );
  }
}

function Fact({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string | undefined;
  emphasis?: boolean;
}) {
  return (
    <div style={styles.fact}>
      <dt style={styles.dt}>{label}</dt>
      <dd style={emphasis ? styles.ddEmphasis : styles.dd}>{value ?? '—'}</dd>
    </div>
  );
}

function severityVariant(k: 'Critical' | 'High' | 'Medium' | 'Low'): SeverityKey {
  if (k === 'Critical') return 'blocked';
  if (k === 'High') return 'atRisk';
  if (k === 'Medium') return 'neutral';
  return 'clear';
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
  summaryBadges: { display: 'flex', gap: spacing.xs, flexWrap: 'wrap' },
  alertName: {
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
  ddEmphasis: {
    margin: 0,
    fontSize: typography.size.sm,
    color: palette.blockedFg,
    fontWeight: typography.weight.semibold,
    wordBreak: 'break-word',
  },
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
