import type { ReactNode } from 'react';
import { Guilloche } from './Guilloche';

export interface EmptyStateProps {
  /** Short, confident title (sentence case). */
  title: string;
  /** One inviting sentence — active voice, what the user controls. */
  body?: string;
  /** The single call-to-action (usually a primary Button). */
  action?: ReactNode;
  /** Show the guilloché hero art (the on-brand signature). Default true. */
  art?: boolean;
}

/**
 * Intaglio EmptyState — ONE inviting, on-brand empty per view (never six gray
 * boxes). The guilloché hero + one sentence + one action. Copy is an invitation,
 * not a status report.
 */
export function EmptyState({ title, body, action, art = true }: EmptyStateProps) {
  return (
    <div className="ig-empty" role="status">
      {art && <Guilloche className="ig-empty__art" size={104} opacity={0.45} />}
      <h2 className="ig-empty__title">{title}</h2>
      {body && <p className="ig-empty__body">{body}</p>}
      {action && <div style={{ marginTop: '0.25rem' }}>{action}</div>}
    </div>
  );
}
