import { type CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';
import type { ExecutiveProductStrategyDashboardState } from './executiveStrategyTypes';

interface Props {
  state: ExecutiveProductStrategyDashboardState;
  /** Internal surface URL. When omitted, the card renders a caveated no-link state. */
  to?: string;
}

/**
 * Phase 142I — Product strategy navigation card (read-only).
 *
 * A reusable, read-only navigation card for executive surfaces. It links (via an
 * internal anchor) to the executive-gated product-strategy surface when a target
 * is provided; otherwise it renders a caveated, link-less state. There is NO
 * Start / Apply / Enable / Execute action wording, NO fetch, and NO write.
 */
export function ProductStrategyNavigationCard({ state, to }: Props) {
  const nextPhase = state.roadmap[0];
  return (
    <Card>
      <CardHeader title="Product Strategy Command Center" subtitle="Read-only competitive platform strategy" />

      <dl style={metaStyle}>
        <Row label="Platform convergence" value={`${state.competitiveCoveragePct}%`} />
        <Row label="Differentiators" value={String(state.differentiators.length)} />
        <Row label="Gaps (governed)" value={String(state.gaps.length)} />
        <Row label="Next roadmap phase" value={nextPhase ? `${nextPhase.phaseId} — ${nextPhase.title}` : '—'} />
      </dl>

      {to ? (
        <a href={to} style={linkStyle} aria-label="View product strategy command center">
          View product strategy →
        </a>
      ) : (
        <span style={caveatStyle}>Product strategy surface is not available in this context.</span>
      )}

      <CardFooter>
        <span>Read-only strategy navigation — no configuration, integration, or write action is available from this card.</span>
      </CardFooter>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={rowStyle}>
      <dt style={dtStyle}>{label}</dt>
      <dd style={ddStyle}>{value}</dd>
    </div>
  );
}

const metaStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, margin: 0 };
const rowStyle: CSSProperties = { display: 'flex', gap: spacing.md };
const dtStyle: CSSProperties = { minWidth: 170, fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const ddStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.text };
const linkStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.link, fontWeight: typography.weight.semibold, textDecoration: 'none' };
const caveatStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic' };
