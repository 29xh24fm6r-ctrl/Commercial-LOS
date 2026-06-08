import type { CSSProperties } from 'react';
import { palette, spacing, typography, radius } from '../shared/theme';
import type { PersistenceRequestState } from './usePortfolioLoanBoardingPersistence';

interface Props {
  enabled: boolean;
  state: PersistenceRequestState;
  onSave: () => void;
  saveLabel?: string;
}

/**
 * Phase 140M — save bar. Disabled when the adapter is disabled; shows honest
 * pending/success/failure states. Never silently autofills or fakes success.
 */
export function PortfolioLoanBoardingSaveBar({ enabled, state, onSave, saveLabel = 'Save boarded loan' }: Props) {
  const pending = state.kind === 'pending';
  return (
    <div style={barStyle}>
      <button
        type="button"
        onClick={onSave}
        disabled={!enabled || pending}
        aria-disabled={!enabled || pending}
        style={enabled ? buttonStyle : disabledButtonStyle}
      >
        {pending ? 'Saving…' : saveLabel}
      </button>
      {!enabled && (
        <span style={hintStyle}>Saving is disabled — live persistence is not enabled.</span>
      )}
      {state.kind === 'success' && (
        <span style={successStyle} role="status">
          Saved ({state.result.operation}).
        </span>
      )}
      {state.kind === 'failure' && (
        <span style={failureStyle} role="alert">
          Save failed: {state.message ?? state.errorCode ?? 'unknown error'}.
        </span>
      )}
    </div>
  );
}

const barStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' };
const buttonStyle: CSSProperties = {
  fontSize: typography.size.sm,
  fontWeight: typography.weight.semibold,
  color: palette.clearFg,
  background: palette.clearBg,
  border: `1px solid ${palette.border}`,
  borderRadius: radius.md,
  padding: `${spacing.xs} ${spacing.md}`,
  cursor: 'pointer',
};
const disabledButtonStyle: CSSProperties = {
  ...buttonStyle,
  color: palette.textSubtle,
  background: palette.surface,
  cursor: 'not-allowed',
};
const hintStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, fontStyle: 'italic' };
const successStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.clearFg };
const failureStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.blockedFg };
