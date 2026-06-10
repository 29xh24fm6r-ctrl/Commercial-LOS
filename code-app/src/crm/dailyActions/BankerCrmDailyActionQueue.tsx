import type { CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../../shared/Card';
import { palette, spacing, typography } from '../../shared/theme';
import type { BankerCrmDailyActionQueueViewModel, BankerCrmDailyAction } from './bankerCrmDailyActionQueue';

interface Props {
  viewModel: BankerCrmDailyActionQueueViewModel;
}

export function BankerCrmDailyActionQueue({ viewModel: vm }: Props) {
  return (
    <div style={containerStyle}>
      <Card>
        <CardHeader title={vm.title} subtitle={vm.subtitle} />
        <p style={safetyStyle}>{vm.safetyCopy}</p>
        <div style={kpiRowStyle}>
          <span style={kpiStyle}>Total: {vm.totalActions}</span>
          <span style={kpiStyle}>High: {vm.highSeverityCount}</span>
          <span style={kpiStyle}>Medium: {vm.mediumSeverityCount}</span>
          <span style={kpiStyle}>Low: {vm.lowSeverityCount}</span>
        </div>
      </Card>

      <Card>
        <CardHeader title="Action Queue" />
        {vm.actions.length === 0 && <p style={emptyStyle}>No CRM review actions.</p>}
        {vm.actions.map((a) => (
          <ActionRow key={a.actionId} action={a} />
        ))}
        <CardFooter>
          <span>Review tasks only. No CRM or Dataverse writes.</span>
        </CardFooter>
      </Card>
    </div>
  );
}

function ActionRow({ action }: { action: BankerCrmDailyAction }) {
  return (
    <div style={actionRowStyle}>
      <div style={actionInfoStyle}>
        <span style={actionLabelStyle}>{action.label}</span>
        <span style={actionDescStyle}>{action.description}</span>
        {action.dealName && <span style={actionDealStyle}>Deal: {action.dealName}</span>}
      </div>
      <span style={severityBadgeStyle(action.severity)}>{action.severity}</span>
    </div>
  );
}

function severityBadgeStyle(severity: string): CSSProperties {
  const color = severity === 'high' ? palette.blockedFg : severity === 'medium' ? palette.atRiskFg : palette.textMuted;
  const bg = severity === 'high' ? palette.blockedBg : severity === 'medium' ? palette.atRiskBg : palette.surfaceAlt;
  return { fontSize: typography.size.xs, color, background: bg, padding: '1px 6px', borderRadius: '3px', fontWeight: typography.weight.semibold, textTransform: 'uppercase' };
}

const containerStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: spacing.lg };
const kpiRowStyle: CSSProperties = { display: 'flex', gap: spacing.lg, flexWrap: 'wrap' };
const kpiStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.textMuted, fontWeight: typography.weight.semibold };
const actionRowStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: `${spacing.xs} 0`, borderBottom: `1px solid ${palette.divider}` };
const actionInfoStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 };
const actionLabelStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text, fontWeight: typography.weight.semibold };
const actionDescStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textMuted };
const actionDealStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.link };
const emptyStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic' };
const safetyStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic' };
