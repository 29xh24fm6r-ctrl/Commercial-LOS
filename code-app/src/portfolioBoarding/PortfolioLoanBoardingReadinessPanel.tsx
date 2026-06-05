import type { CSSProperties } from 'react';
import type { PortfolioLoanBoardingSnapshot } from '../shared/portfolioBoarding/portfolioLoanBoardingSnapshot';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';

interface Props {
  snapshot: PortfolioLoanBoardingSnapshot;
}

export function PortfolioLoanBoardingReadinessPanel({ snapshot }: Props) {
  return (
    <Card>
      <CardHeader title="Readiness" subtitle="FDIC · Board · Portfolio Monitoring" />
      <div style={readinessGridStyle}>
        <ReadinessItem label="FDIC Ready" ready={snapshot.fdicReady} />
        <ReadinessItem label="Board Ready" ready={snapshot.boardReady} />
        <ReadinessItem label="Portfolio Monitoring" ready={snapshot.portfolioMonitoringReady} />
      </div>
      {snapshot.topBlockers.length > 0 && (
        <div style={blockersStyle}>
          <span style={blockersLabelStyle}>Top blockers:</span>
          <ul style={blockerListStyle}>
            {snapshot.topBlockers.map((b, i) => (
              <li key={i} style={blockerItemStyle}>{b}</li>
            ))}
          </ul>
        </div>
      )}
      {snapshot.topBlockers.length === 0 && (
        <p style={noneStyle}>No blockers identified.</p>
      )}
      <CardFooter>
        <span>Readiness is fail-closed. Missing or stale items block readiness.</span>
      </CardFooter>
    </Card>
  );
}

function ReadinessItem({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div style={readinessItemStyle}>
      <span style={readinessLabelStyle}>{label}</span>
      <span style={ready ? readyBadgeStyle : notReadyBadgeStyle}>
        {ready ? 'Ready' : 'Not ready'}
      </span>
    </div>
  );
}

const readinessGridStyle: CSSProperties = { display: 'flex', gap: spacing.xl, flexWrap: 'wrap' };
const readinessItemStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 120 };
const readinessLabelStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const readyBadgeStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.clearFg, background: palette.clearBg, padding: `2px ${spacing.sm}`, borderRadius: '4px', fontWeight: typography.weight.semibold, textAlign: 'center' };
const notReadyBadgeStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.blockedFg, background: palette.blockedBg, padding: `2px ${spacing.sm}`, borderRadius: '4px', fontWeight: typography.weight.semibold, textAlign: 'center' };
const blockersStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: spacing.xs };
const blockersLabelStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, fontWeight: typography.weight.semibold, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label };
const blockerListStyle: CSSProperties = { margin: 0, paddingLeft: spacing.lg, display: 'flex', flexDirection: 'column', gap: 2 };
const blockerItemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text };
const noneStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic' };
