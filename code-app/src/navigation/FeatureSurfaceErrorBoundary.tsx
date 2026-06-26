import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorState } from '../shared/ErrorState';

interface Props {
  /** Surface label, surfaced in the fallback message. */
  label: string;
  children: ReactNode;
}

interface State {
  readonly error: Error | null;
}

/**
 * Fail-soft boundary for a read-only preview surface. A preview is best-effort: if
 * the underlying subsystem component throws while rendering without its full live
 * data context, the boundary shows an honest "preview unavailable" state instead of
 * crashing the whole app. It never masks a write failure — these surfaces never write.
 */
export class FeatureSurfaceErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface to the console for diagnosis; no telemetry side-effects here.
    console.warn(`[feature-surface] "${this.props.label}" preview failed to render`, error, info);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <ErrorState
          title={`${this.props.label} — preview unavailable`}
          detail="This read-only preview could not render without its live data context."
          hint="Open the subsystem from its workspace, where its data provider is in scope."
        />
      );
    }
    return this.props.children;
  }
}
