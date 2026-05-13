import { useEffect, useRef, useState } from 'react';
import type { DataQualityFlagRow } from './adminDiagnosticsQueries';
import type { ResolveOutcome } from './dataQualityActions';
import { Badge } from '../shared/Badge';
import { palette, radius, spacing, typography, type SeverityKey } from '../shared/theme';
import { formatDate } from './adminCardChrome';

interface ResolveFlagModalProps {
  flag: DataQualityFlagRow;
  /** Resolves with the action outcome. Modal stays mounted to render
   *  outcome UI (success/failure). Parent dismisses on Close. */
  onConfirm: (note: string) => Promise<ResolveOutcome>;
  onClose: () => void;
}

type ModalState =
  | { kind: 'editing' }
  | { kind: 'submitting' }
  | { kind: 'outcome'; outcome: ResolveOutcome };

export function ResolveFlagModal({ flag, onConfirm, onClose }: ResolveFlagModalProps) {
  const [note, setNote] = useState('');
  const [state, setState] = useState<ModalState>({ kind: 'editing' });
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus the textarea on open. Trap escape to close (only when not
  // submitting — prevent cancel mid-write).
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
      aria-labelledby="resolve-flag-title"
      style={styles.overlay}
    >
      <div style={styles.card}>
        <header style={styles.header}>
          <div>
            <div style={styles.eyebrow}>Admin · Remediation</div>
            <h2 id="resolve-flag-title" style={styles.title}>
              Resolve Data Quality Flag
            </h2>
          </div>
        </header>

        <section style={styles.summarySection}>
          <div style={styles.summaryHeaderRow}>
            <span style={styles.flagName}>{flag.flagName}</span>
            {flag.flagType && (
              <Badge variant={severityFromType(flag.flagType)}>{flag.flagType}</Badge>
            )}
          </div>
          {flag.flagDescription && <p style={styles.description}>{flag.flagDescription}</p>}
          <dl style={styles.facts}>
            <Fact label="Source table" value={flag.sourceTable} />
            <Fact label="Source record" value={flag.sourceRecordId} />
            <Fact label="Flagged" value={formatDate(flag.flaggedDate)} />
            <Fact label="Current status" value={flag.resolutionStatus ?? 'Open'} />
          </dl>
        </section>

        {state.kind === 'outcome' ? (
          <OutcomeBlock outcome={state.outcome} />
        ) : (
          <section style={styles.noteSection}>
            <label htmlFor="resolution-note" style={styles.label}>
              Resolution note <span style={styles.required}>required</span>
            </label>
            <textarea
              id="resolution-note"
              ref={textareaRef}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={inProgress}
              placeholder="Describe what was investigated, what was fixed, and how the issue is resolved."
              rows={4}
              style={{
                ...styles.textarea,
                opacity: inProgress ? 0.6 : 1,
              }}
            />
            <p style={styles.helperLine}>
              The note will be saved on the flag and copied to the audit event.
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
                {inProgress ? 'Resolving…' : 'Resolve flag'}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}

function OutcomeBlock({ outcome }: { outcome: ResolveOutcome }) {
  switch (outcome.kind) {
    case 'success':
      return (
        <div style={{ ...styles.outcomeBox, background: palette.clearBg, borderColor: palette.clear }}>
          <div style={{ ...styles.outcomeTitle, color: palette.clearFg }}>Resolved</div>
          <p style={styles.outcomeDetail}>
            Flag updated and audit event recorded
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
            The flag was marked Resolved on the record, but the audit-event write
            failed. The resolution is not fully governed.
          </p>
          <p style={styles.outcomeDetailMono}>{outcome.auditError}</p>
          <p style={styles.outcomeDetail}>
            Action: capture this message, then ask the AuditEvent owner to investigate.
            Do not retry the resolution — the flag is already updated.
          </p>
        </div>
      );
    case 'flag-failed':
      return (
        <div style={{ ...styles.outcomeBox, background: palette.atRiskBg, borderColor: palette.atRisk }}>
          <div style={{ ...styles.outcomeTitle, color: palette.atRiskFg }}>
            Could not resolve flag
          </div>
          <p style={styles.outcomeDetail}>
            The flag is unchanged. A Failed audit event was recorded (best effort).
            Refresh and try again.
          </p>
          <p style={styles.outcomeDetailMono}>{outcome.flagError}</p>
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

function Fact({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div style={styles.fact}>
      <dt style={styles.dt}>{label}</dt>
      <dd style={styles.dd}>{value ?? '—'}</dd>
    </div>
  );
}

function severityFromType(t: string | undefined): SeverityKey {
  if (!t) return 'atRisk';
  const lower = t.toLowerCase();
  if (lower.includes('critical') || lower.includes('blocking')) return 'blocked';
  if (lower.includes('warning') || lower.includes('stale')) return 'atRisk';
  return 'neutral';
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
  },
  flagName: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: palette.text,
  },
  description: {
    margin: 0,
    fontSize: typography.size.md,
    color: palette.text,
    lineHeight: typography.lineHeight.snug,
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
  dd: {
    margin: 0,
    fontSize: typography.size.sm,
    color: palette.text,
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
  helperLine: {
    margin: 0,
    fontSize: typography.size.xs,
    color: palette.textSubtle,
  },
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
