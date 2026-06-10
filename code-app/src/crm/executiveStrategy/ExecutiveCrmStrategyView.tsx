import type { CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../../shared/Card';
import { palette, spacing, typography } from '../../shared/theme';
import type { ExecutiveCrmStrategyViewModel, ExecutiveCrmStrategySectionRow } from './executiveCrmStrategyViewModel';

interface Props {
  viewModel: ExecutiveCrmStrategyViewModel;
}

export function ExecutiveCrmStrategyView({ viewModel: vm }: Props) {
  return (
    <div style={containerStyle}>
      <Card>
        <CardHeader title={vm.title} subtitle={vm.subtitle} />
        <p style={safetyStyle}>{vm.safetyCopy}</p>
      </Card>

      <Card>
        <CardHeader title="Strategy Sections" />
        {vm.sections.map((s) => (
          <SectionRow key={s.key} section={s} />
        ))}
        <CardFooter>
          <span>Read-only. No fake revenue, ROE, or profitability.</span>
          <span>Next step: {vm.nextExecutiveReviewStep}</span>
        </CardFooter>
      </Card>
    </div>
  );
}

function SectionRow({ section }: { section: ExecutiveCrmStrategySectionRow }) {
  return (
    <div style={sectionRowStyle}>
      <div style={sectionInfoStyle}>
        <span style={sectionLabelStyle}>{section.label}</span>
        <span style={sectionDescStyle}>{section.description}</span>
      </div>
      <span style={statusBadge(section.status)}>
        {section.status === 'available' ? 'Available' : section.status === 'partial' ? 'Partial' : 'Not available'}
      </span>
    </div>
  );
}

function statusBadge(status: string): CSSProperties {
  const isAvailable = status === 'available';
  const isPartial = status === 'partial';
  return {
    fontSize: typography.size.xs,
    color: isAvailable ? palette.clearFg : isPartial ? palette.atRiskFg : palette.textSubtle,
    background: isAvailable ? palette.clearBg : isPartial ? palette.atRiskBg : palette.surfaceAlt,
    padding: '1px 6px',
    borderRadius: '3px',
    fontWeight: typography.weight.semibold,
    flexShrink: 0,
  };
}

const containerStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: spacing.lg };
const sectionRowStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: `${spacing.xs} 0`, borderBottom: `1px solid ${palette.divider}` };
const sectionInfoStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 };
const sectionLabelStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text, fontWeight: typography.weight.semibold };
const sectionDescStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textMuted };
const safetyStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic' };
