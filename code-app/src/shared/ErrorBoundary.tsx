import { Component, type ReactNode } from 'react';
import { palette, radius, spacing, typography } from './theme';

/**
 * Phase 260 — render-error boundary.
 *
 * A render exception anywhere in a workspace tab would otherwise unmount the
 * whole subtree and leave a blank canvas (with the Power Apps shell still
 * visible). This boundary catches it and shows a friendly, branded fallback so
 * the user always sees something useful and can recover.
 */

interface Props {
  /** Short label for what failed, e.g. "Loan Workflow". */
  readonly surface: string;
  readonly children: ReactNode;
}

interface State {
  readonly error: Error | undefined;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: undefined };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override render() {
    if (this.state.error) {
      return (
        <div style={styles.wrap} role="alert" data-error-boundary={this.props.surface}>
          <div style={styles.title}>{this.props.surface} hit a problem</div>
          <p style={styles.body}>
            This view could not finish loading. Your work is safe — refresh the page to try again,
            or switch to another section and come back.
          </p>
          <button type="button" style={styles.button} onClick={() => this.setState({ error: undefined })}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    background: palette.surface,
    border: `1px solid ${palette.panelBorder}`,
    borderRadius: radius.lg,
    padding: `${spacing.xl} ${spacing.xxl}`,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
    alignItems: 'flex-start',
    margin: `${spacing.lg} 0`,
  },
  title: { fontSize: typography.size.lg, fontWeight: typography.weight.bold, color: palette.text },
  body: { margin: 0, color: palette.textMuted, fontSize: typography.size.sm, maxWidth: 560, lineHeight: typography.lineHeight.snug },
  button: {
    marginTop: spacing.xs,
    background: palette.primary,
    color: palette.surface,
    border: 'none',
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    fontFamily: typography.family,
    cursor: 'pointer',
  },
};
