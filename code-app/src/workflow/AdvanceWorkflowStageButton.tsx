import { useState } from 'react';
import { evaluateStageTransitionPolicy } from './stageTransitionPolicy';
import type { LoanWorkflowState } from './loanWorkflowTypes';
import { palette, radius, spacing, typography } from '../shared/theme';

export function AdvanceWorkflowStageButton({ workflow }: { workflow: LoanWorkflowState }) {
  const [message, setMessage] = useState<string | null>(null);
  const nextStage = workflow.nextPermittedStages[0];
  const policy = evaluateStageTransitionPolicy(workflow, nextStage?.id);
  const disabled = !policy.allowed;

  function handleClick() {
    if (!policy.allowed) {
      setMessage([policy.reason, ...policy.blockers].join(' '));
      return;
    }
    setMessage('Stage write dependency is not wired. No stage update or audit was attempted.');
  }

  return (
    <div style={styles.wrap}>
      <button
        type="button"
        disabled={disabled}
        onClick={handleClick}
        style={{ ...styles.button, ...(disabled ? styles.buttonDisabled : null) }}
        title={disabled && !policy.allowed ? policy.reason : undefined}
      >
        Advance stage
      </button>
      <span style={styles.status}>
        {message ?? (nextStage ? `Next approved stage: ${nextStage.label}` : 'No approved next stage.')}
      </span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: spacing.xs },
  button: {
    border: `1px solid ${palette.borderStrong}`,
    borderRadius: radius.sm,
    background: palette.primary,
    color: palette.primaryFg,
    padding: `${spacing.xs} ${spacing.sm}`,
    fontWeight: typography.weight.semibold,
    cursor: 'pointer',
  },
  buttonDisabled: {
    background: palette.surfaceAlt,
    color: palette.textSubtle,
    cursor: 'not-allowed',
  },
  status: { color: palette.textMuted, fontSize: typography.size.sm },
};
