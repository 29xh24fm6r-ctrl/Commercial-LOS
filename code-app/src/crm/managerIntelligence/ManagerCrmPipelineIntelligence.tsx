import type { CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../../shared/Card';
import { palette, spacing, typography } from '../../shared/theme';
import type { ManagerCrmPipelineIntelligenceViewModel } from './managerCrmPipelineIntelligence';

interface Props {
  viewModel: ManagerCrmPipelineIntelligenceViewModel;
}

export function ManagerCrmPipelineIntelligence({ viewModel: vm }: Props) {
  return (
    <div style={containerStyle}>
      <Card>
        <CardHeader title={vm.title} subtitle={vm.subtitle} />
        <p style={safetyStyle}>{vm.safetyCopy}</p>
        <div style={kpiGridStyle}>
          {vm.kpis.map((kpi) => (
            <div key={kpi.key} style={kpiCellStyle}>
              <span style={kpiLabelStyle}>{kpi.label}</span>
              <span style={kpiValueStyle}>{kpi.value}</span>
              <span style={kpiDescStyle}>{kpi.description}</span>
            </div>
          ))}
        </div>
        <CardFooter>
          <span>Read-only. No assignment mutation. No CRM write.</span>
          <span>Next step: {vm.nextSafeManagerReviewStep}</span>
        </CardFooter>
      </Card>
    </div>
  );
}

const containerStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: spacing.lg };
const kpiGridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: spacing.lg };
const kpiCellStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, padding: spacing.md, background: palette.surfaceAlt, borderRadius: '6px' };
const kpiLabelStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const kpiValueStyle: CSSProperties = { fontSize: typography.size.xl, color: palette.text, fontWeight: typography.weight.bold };
const kpiDescStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textMuted };
const safetyStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic' };
