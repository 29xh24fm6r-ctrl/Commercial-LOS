import type { CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../../shared/Card';
import { palette, spacing, typography, radius } from '../../shared/theme';
import type { NcinoLaneViewModel } from './ncinoLaneViewModel';

interface Props {
  viewModel: NcinoLaneViewModel;
}

export function NcinoLane({ viewModel: vm }: Props) {
  return (
    <div style={containerStyle}>
      <Card accentColor={palette.primary}>
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
        <CardHeader title="Workflow Intelligence" subtitle="Loan workflow and document readiness" />
        <div style={metricsRowStyle}>
          <div style={metricCellStyle}>
            <span style={metricValueStyle}>{vm.loanWorkflowPreviewCount}</span>
            <span style={metricLabelStyle}>Workflow preview items</span>
          </div>
          <div style={metricCellStyle}>
            <span style={vm.borrowerConflictCount > 0 ? metricValueWarningStyle : metricValueStyle}>{vm.borrowerConflictCount}</span>
            <span style={metricLabelStyle}>Borrower conflicts</span>
          </div>
        </div>
        {vm.borrowerConflictCount > 0 && (
          <div style={conflictBannerStyle}>
            <span style={conflictTextStyle}>{vm.borrowerConflictCount} borrower relationship conflict{vm.borrowerConflictCount !== 1 ? 's' : ''} require review</span>
          </div>
        )}
        <CardFooter>
          <span>Next step: {vm.nextSafeStep}</span>
          <span>Live nCino writes disabled. No loan boarding or approval actions.</span>
        </CardFooter>
      </Card>
    </div>
  );
}

function readinessIndicatorStyle(status: string): CSSProperties {
  const color = status === 'ready' ? palette.clear : status === 'not_ready' ? palette.atRisk : palette.neutral;
  return { width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0, marginTop: 4 };
}

const containerStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: spacing.lg };
const readinessGridStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: spacing.sm };
const readinessRowStyle: CSSProperties = { display: 'flex', gap: spacing.sm, alignItems: 'flex-start' };
const readinessInfoStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 1 };
const readinessLabelStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text, fontWeight: typography.weight.semibold };
const readinessDetailStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textMuted };
const metricsRowStyle: CSSProperties = { display: 'flex', gap: spacing.xl };
const metricCellStyle: CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: spacing.md, background: palette.surfaceAlt, borderRadius: radius.md, minWidth: 120, textAlign: 'center' };
const metricValueStyle: CSSProperties = { fontSize: typography.size.xl, fontWeight: typography.weight.bold, color: palette.text };
const metricValueWarningStyle: CSSProperties = { fontSize: typography.size.xl, fontWeight: typography.weight.bold, color: palette.atRisk };
const metricLabelStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textMuted, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label };
const conflictBannerStyle: CSSProperties = { padding: `${spacing.sm} ${spacing.md}`, background: palette.atRiskBg, borderRadius: radius.sm };
const conflictTextStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.atRiskFg, fontWeight: typography.weight.semibold };
const safetyStyle: CSSProperties = { margin: 0, fontSize: typography.size.xs, color: palette.textSubtle, fontStyle: 'italic' };
