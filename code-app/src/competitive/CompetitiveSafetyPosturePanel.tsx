import { type CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';
import type { CompetitiveSafetyPostureSummary } from './executiveStrategyTypes';

interface Props {
  safetyPosture: CompetitiveSafetyPostureSummary;
}

/**
 * Phase 142H — Competitive safety posture panel (read-only).
 *
 * Shows what is intentionally disabled or forbidden and why, with each item's
 * future-activation prerequisite. Read-only: NO toggles, NO enable controls, NO
 * "coming soon" overpromising. Every item carries a reason and a prerequisite.
 */
export function CompetitiveSafetyPosturePanel({ safetyPosture }: Props) {
  return (
    <Card>
      <CardHeader title="Safety posture" subtitle="What is intentionally disabled / forbidden, and why" />

      <div style={bannerStyle}>
        Read-only safety posture — these capabilities are intentionally disabled or forbidden for governance. There are no toggles and no enable controls; each item lists its future-activation prerequisite.
      </div>

      <div style={listStyle}>
        {safetyPosture.items.map((item) => (
          <div key={item.category} style={itemRowStyle}>
            <div style={itemHeadStyle}>
              <span style={catStyle}>{item.category}</span>
              <span style={item.status === 'forbidden' ? forbiddenChipStyle : disabledChipStyle}>{item.status.replace(/_/g, ' ')}</span>
            </div>
            <span style={reasonStyle}>{item.reason}</span>
            <span style={prereqStyle}>Future activation requires: {item.futureActivationPrerequisite}</span>
          </div>
        ))}
      </div>

      <CardFooter>
        <span>Intentionally governed — disabled by default and forbidden where noted. No capability is enabled from this surface.</span>
      </CardFooter>
    </Card>
  );
}

const bannerStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.atRiskFg, background: palette.atRiskBg, padding: spacing.sm, borderRadius: 4 };
const listStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: spacing.xs };
const itemRowStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, border: `1px solid ${palette.border}`, borderRadius: 4, padding: spacing.xs };
const itemHeadStyle: CSSProperties = { display: 'flex', gap: spacing.sm, alignItems: 'center' };
const catStyle: CSSProperties = { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: palette.text };
const forbiddenChipStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.blockedFg, fontWeight: typography.weight.semibold };
const disabledChipStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.atRiskFg, fontWeight: typography.weight.semibold };
const reasonStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text };
const prereqStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, fontStyle: 'italic' };
