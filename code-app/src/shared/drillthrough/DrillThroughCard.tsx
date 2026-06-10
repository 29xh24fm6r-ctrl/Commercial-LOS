import { type CSSProperties, type ReactNode } from 'react';
import { palette, radius, spacing, typography } from '../theme';
import { DrillThroughPanel } from './DrillThroughPanel';
import {
  drillThroughAccessibleName,
  resolveDrillThroughAction,
  type DrillThroughTarget,
} from './drillThroughTypes';

/**
 * Phase 144A — clickable drill-through card / tile / row primitive.
 *
 * Wraps a summary "face" (title, status, value/summary) in a NATIVE
 * `<details>`/`<summary>` disclosure so it is keyboard-reachable and activated by
 * Enter/Space WITHOUT any custom click handler, `<button>`, or `<form>`. When
 * opened it reveals the read-only {@link DrillThroughPanel}: full detail, a safe
 * link to an EXISTING authorized route, or an honest unavailable state. No dead
 * summary cards: every face resolves to one of those three. No write, no live
 * call, no navigation side effect, no fabricated data.
 */
interface Props {
  target: DrillThroughTarget;
  /** Optional custom face content; defaults to title + status + summary. */
  children?: ReactNode;
  /** Visual variant — a dense KPI tile, a queue row, or a full card. */
  variant?: 'card' | 'tile' | 'row';
}

export function DrillThroughCard({ target, children, variant = 'card' }: Props) {
  const action = resolveDrillThroughAction(target);
  const accessibleName = drillThroughAccessibleName(target);
  const regionId = `drillthrough-${target.id}`;
  const headingId = `${regionId}-heading`;

  return (
    <details style={shellStyle(variant)}>
      <summary
        style={summaryStyle}
        aria-label={accessibleName}
        aria-controls={regionId}
      >
        {children ?? (
          <span style={faceStyle}>
            <span style={faceTitleStyle}>{target.title}</span>
            {target.statusLabel && <span style={faceStatusStyle}>{target.statusLabel}</span>}
            <span style={faceSummaryStyle}>{target.summary}</span>
          </span>
        )}
        <span style={hintStyle} aria-hidden="true">
          {action.kind === 'unavailable' ? 'Details unavailable' : action.kind === 'route' ? 'Open record ▸' : 'View details ▸'}
        </span>
      </summary>
      <div id={regionId} role="region" aria-labelledby={headingId}>
        <DrillThroughPanel target={target} headingId={headingId} />
      </div>
    </details>
  );
}

/**
 * Pure derivation helper (no state, no side effect) returning the display props a
 * consumer needs to render its own drill-through affordance: the resolved action,
 * the accessible name, and stable region/heading ids. Named as a hook for the
 * documented component contract; it triggers no navigation and no write.
 */
export function useDrillThroughPanel(target: DrillThroughTarget) {
  const regionId = `drillthrough-${target.id}`;
  return {
    action: resolveDrillThroughAction(target),
    accessibleName: drillThroughAccessibleName(target),
    regionId,
    headingId: `${regionId}-heading`,
    readOnly: target.readOnly,
  } as const;
}

function shellStyle(variant: Props['variant']): CSSProperties {
  return {
    border: `1px solid ${palette.border}`,
    borderRadius: radius.md,
    padding: variant === 'tile' ? spacing.sm : spacing.xs,
    background: variant === 'tile' ? palette.deckTile : palette.surface,
    marginBottom: variant === 'row' ? spacing.xs : spacing.sm,
  };
}

const summaryStyle: CSSProperties = {
  display: 'flex',
  gap: spacing.sm,
  alignItems: 'center',
  justifyContent: 'space-between',
  cursor: 'pointer',
  flexWrap: 'wrap',
};
const faceStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 };
const faceTitleStyle: CSSProperties = { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: palette.text };
const faceStatusStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textMuted, fontWeight: typography.weight.semibold };
const faceSummaryStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle };
const hintStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.link, fontWeight: typography.weight.semibold, flexShrink: 0 };
