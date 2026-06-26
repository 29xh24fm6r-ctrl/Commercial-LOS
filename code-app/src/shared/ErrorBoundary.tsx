import { Component, type ErrorInfo, type ReactNode } from 'react';
import { palette, radius, spacing, typography } from './theme';

/**
 * Phase 260/261 — render-error boundary with operator diagnostics.
 *
 * A render exception anywhere in a workspace tab would otherwise unmount the
 * whole subtree and leave a blank canvas (with the Power Apps shell still
 * visible). This boundary catches it and shows a friendly, branded fallback so
 * the user always sees something useful and can recover.
 *
 * Phase 261: the boundary now captures structured diagnostics on every catch —
 * surface name, error message, component stack, a correlation id, and the
 * current tab/nav key — and logs them (console.error) so a production crash can
 * be diagnosed from the browser console. The fallback also shows the error
 * message + correlation id (read-only) so an operator can report exactly what
 * failed. This is secondary protection: the underlying throw is still fixed at
 * its source.
 */

interface Props {
  /** Short label for what failed, e.g. "Loan Workflow". */
  readonly surface: string;
  /** Current tab / nav key, included in diagnostics. */
  readonly navKey?: string;
  /** Optional sink for diagnostics (tests inject this; defaults to console). */
  readonly onDiagnostic?: (d: ErrorBoundaryDiagnostic) => void;
  readonly children: ReactNode;
}

export interface ErrorBoundaryDiagnostic {
  readonly surface: string;
  readonly navKey: string | undefined;
  readonly message: string;
  readonly stack: string | undefined;
  readonly componentStack: string | undefined;
  readonly correlationId: string;
}

interface State {
  readonly error: Error | undefined;
  readonly correlationId: string | undefined;
}

let counter = 0;
function nextCorrelationId(): string {
  counter += 1;
  // Avoid Date.now()/Math.random() so the id is deterministic per session run;
  // a monotonic counter is enough to correlate a fallback with its console log.
  return `eb-${counter.toString(36)}-${counter}`;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: undefined, correlationId: undefined };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    const correlationId = nextCorrelationId();
    this.setState({ correlationId });
    const diagnostic: ErrorBoundaryDiagnostic = {
      surface: this.props.surface,
      navKey: this.props.navKey,
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack ?? undefined,
      correlationId,
    };
    if (this.props.onDiagnostic) {
      this.props.onDiagnostic(diagnostic);
    } else {
      // Structured, greppable diagnostic line for the production console.
      // eslint-disable-next-line no-console
      console.error(
        `[ErrorBoundary] surface="${diagnostic.surface}" navKey="${diagnostic.navKey ?? ''}" ` +
          `correlationId="${diagnostic.correlationId}" message="${diagnostic.message}"`,
        { stack: diagnostic.stack, componentStack: diagnostic.componentStack },
      );
    }
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
          <button type="button" style={styles.button} onClick={() => this.setState({ error: undefined, correlationId: undefined })}>
            Try again
          </button>
          {this.state.correlationId && (
            <div style={styles.diag} data-error-boundary-diagnostic>
              <span data-error-boundary-correlation>Reference {this.state.correlationId}</span>
              {this.state.error.message && (
                <span data-error-boundary-message style={styles.diagMsg}>{this.state.error.message}</span>
              )}
            </div>
          )}
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
  diag: {
    marginTop: spacing.xs,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    fontSize: typography.size.xs,
    color: palette.textSubtle,
  },
  diagMsg: { fontFamily: 'monospace', color: palette.textMuted },
};
