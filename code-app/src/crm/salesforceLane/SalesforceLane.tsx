import type { CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../../shared/Card';
import { palette, spacing, typography, radius } from '../../shared/theme';
import type { SalesforceLaneViewModel } from './salesforceLaneViewModel';

interface Props {
  viewModel: SalesforceLaneViewModel;
}

export function SalesforceLane({ viewModel: vm }: Props) {
  return (
    <div style={containerStyle}>
      <Card accentColor={palette.info}>
        <CardHeader title={vm.title} subtitle={vm.subtitle} />
        <p style={safetyStyle}>{vm.safetyCopy}</p>

        <div style={readinessGridStyle}>
          {vm.readinessRows.map((r) => (
            <div key={r.key} style={readinessRowStyle}>
              <div style={readinessIndicatorStyle(r.status)} />
              <div style={readinessInfoStyle}>
                <span style={readinessLabelStyle}>{r.label}</span>
                <span style={readinessDetailStyle}>{r.detail}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Sync Preview Operations" subtitle="What would happen — preview only" />
        <div style={bucketGridStyle}>
          {vm.syncBuckets.map((b) => (
            <div key={b.operation} style={bucketCellStyle}>
              <span style={bucketCountStyle(b.operation)}>{b.count}</span>
              <span style={bucketLabelStyle}>{b.label}</span>
            </div>
          ))}
        </div>
        {vm.matchConflictCount > 0 && (
          <div style={conflictBannerStyle}>
            <span style={conflictTextStyle}>{vm.matchConflictCount} match conflict{vm.matchConflictCount !== 1 ? 's' : ''} require review</span>
          </div>
        )}
        <CardFooter>
          <span>Next step: {vm.nextSafeStep}</span>
          <span>Live Salesforce writes disabled.</span>
        </CardFooter>
      </Card>
    </div>
  );
}

function readinessIndicatorStyle(status: string): CSSProperties {
  const color = status === 'ready' ? palette.clear : status === 'not_ready' ? palette.atRisk : palette.neutral;
  return { width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0, marginTop: 4 };
}

function bucketCountStyle(operation: string): CSSProperties {
  const color = operation === 'blocked' ? palette.blocked : operation === 'would_create' ? palette.info : palette.text;
  return { fontSize: typography.size.xl, fontWeight: typography.weight.bold, color };
}

const containerStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: spacing.lg };
const readinessGridStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: spacing.sm };
const readinessRowStyle: CSSProperties = { display: 'flex', gap: spacing.sm, alignItems: 'flex-start' };
const readinessInfoStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 1 };
const readinessLabelStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text, fontWeight: typography.weight.semibold };
const readinessDetailStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textMuted };
const bucketGridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: spacing.md };
const bucketCellStyle: CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: spacing.sm, background: palette.surfaceAlt, borderRadius: radius.md, textAlign: 'center' };
const bucketLabelStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textMuted, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label };
const conflictBannerStyle: CSSProperties = { padding: `${spacing.sm} ${spacing.md}`, background: palette.atRiskBg, borderRadius: radius.sm };
const conflictTextStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.atRiskFg, fontWeight: typography.weight.semibold };
const safetyStyle: CSSProperties = { margin: 0, fontSize: typography.size.xs, color: palette.textSubtle, fontStyle: 'italic' };
