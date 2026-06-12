import { useState, type CSSProperties, type FormEvent } from 'react';
import type { LogActivityOutcome } from './logActivityActions';
import { palette, radius, spacing, typography } from '../shared/theme';

export interface LogActivityDealOption {
  id: string;
  name: string;
}

export interface LogActivityModalProps {
  deals: readonly LogActivityDealOption[];
  writeDisabledReason: string | undefined;
  onConfirm: (dealId: string, note: string) => Promise<LogActivityOutcome>;
  onClose: () => void;
}

export function LogActivityModal({
  deals,
  writeDisabledReason,
  onConfirm,
  onClose,
}: LogActivityModalProps) {
  const [dealId, setDealId] = useState(deals[0]?.id ?? '');
  const [note, setNote] = useState('');
  const [outcome, setOutcome] = useState<LogActivityOutcome | null>(null);
  const [saving, setSaving] = useState(false);

  const canSave =
    !writeDisabledReason &&
    deals.length > 0 &&
    dealId.trim().length > 0 &&
    note.trim().length > 0 &&
    !saving;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setOutcome(null);
    try {
      setOutcome(await onConfirm(dealId, note.trim()));
    } catch (err: unknown) {
      setOutcome({
        kind: 'unknown',
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  }

  const blocker =
    writeDisabledReason ??
    (deals.length === 0
      ? 'No active banker-authorized deal is available. Select an active deal before logging activity.'
      : undefined);

  return (
    <div style={styles.overlay} role="dialog" aria-modal="true" aria-label="Log activity">
      <div style={styles.modal}>
        <h2 style={styles.title}>Log Activity</h2>
        {blocker && (
          <p style={styles.blocker} role="alert">
            {blocker}
          </p>
        )}
        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>
            Deal
            <select
              value={dealId}
              onChange={(event) => setDealId(event.target.value)}
              style={styles.input}
              disabled={saving || !!writeDisabledReason || deals.length === 0}
            >
              {deals.map((deal) => (
                <option key={deal.id} value={deal.id}>
                  {deal.name}
                </option>
              ))}
            </select>
          </label>
          <label style={styles.label}>
            Activity note
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              style={styles.textarea}
              disabled={saving || !!writeDisabledReason || deals.length === 0}
            />
          </label>
          {outcome && <OutcomeMessage outcome={outcome} />}
          <div style={styles.actions}>
            <button type="button" onClick={onClose} style={styles.secondaryButton} disabled={saving}>
              Close
            </button>
            <button type="submit" style={styles.primaryButton} disabled={!canSave}>
              {saving ? 'Logging...' : 'Log Activity'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function OutcomeMessage({ outcome }: { outcome: LogActivityOutcome }) {
  if (outcome.kind === 'success') {
    return (
      <p style={styles.success} role="status">
        Activity logged successfully.
      </p>
    );
  }
  if (outcome.kind === 'governance-partial') {
    return (
      <p style={styles.warning} role="status">
        Activity logged, but audit evidence is incomplete. Admin review is required.
      </p>
    );
  }
  const message =
    outcome.kind === 'activity-failed' ? outcome.activityError : outcome.message;
  return (
    <p style={styles.error} role="alert">
      {message}
    </p>
  );
}

const styles: Record<string, CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.38)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: spacing.lg,
  },
  modal: {
    width: 'min(520px, 100%)',
    background: palette.surface,
    border: `1px solid ${palette.panelBorder}`,
    borderRadius: radius.md,
    padding: spacing.xl,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
  },
  title: {
    margin: 0,
    color: palette.text,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
    color: palette.textMuted,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
  input: {
    padding: `${spacing.sm} ${spacing.md}`,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    background: palette.surface,
    color: palette.text,
    font: 'inherit',
  },
  textarea: {
    minHeight: 120,
    resize: 'vertical',
    padding: `${spacing.sm} ${spacing.md}`,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    background: palette.surface,
    color: palette.text,
    font: 'inherit',
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  primaryButton: {
    background: palette.primary,
    color: palette.primaryFg,
    border: 'none',
    borderRadius: radius.sm,
    padding: `${spacing.sm} ${spacing.lg}`,
    font: 'inherit',
    fontWeight: typography.weight.semibold,
    cursor: 'pointer',
  },
  secondaryButton: {
    background: 'transparent',
    color: palette.text,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    padding: `${spacing.sm} ${spacing.lg}`,
    font: 'inherit',
    cursor: 'pointer',
  },
  blocker: {
    margin: 0,
    color: palette.blocked,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.snug,
  },
  success: {
    margin: 0,
    color: palette.clear,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
  warning: {
    margin: 0,
    color: palette.atRiskFg,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
  error: {
    margin: 0,
    color: palette.blocked,
    fontSize: typography.size.sm,
  },
};
