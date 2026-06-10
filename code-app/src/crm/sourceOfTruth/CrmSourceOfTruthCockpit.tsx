import type { CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../../shared/Card';
import { palette, spacing, typography } from '../../shared/theme';
import { deriveCrmSourceOfTruthCockpitViewModel } from './crmSourceOfTruthCockpitViewModel';

export function CrmSourceOfTruthCockpit() {
  const vm = deriveCrmSourceOfTruthCockpitViewModel();

  return (
    <div style={containerStyle}>
      <Card>
        <CardHeader title={vm.title} subtitle={vm.subtitle} />
        <p style={safetyStyle}>{vm.safetyCopy}</p>
        <div style={kpiRowStyle}>
          <span style={kpiStyle}>Total: {vm.totalDomains}</span>
          <span style={kpiStyle}>Active: {vm.activeDomains}</span>
          <span style={kpiStyle}>Disabled: {vm.disabledDomains}</span>
          <span style={kpiStyle}>Conflicts: {vm.conflictDomains}</span>
        </div>
      </Card>

      <Card>
        <CardHeader title="Domain Map" />
        {vm.domains.map((d) => (
          <div key={d.domain} style={domainRowStyle}>
            <div style={domainInfoStyle}>
              <span style={domainNameStyle}>{d.domain}</span>
              <span style={domainMetaStyle}>
                LOS: {d.losOwner} · SF: {d.salesforceOwner} · nCino: {d.ncinoOwner}
              </span>
            </div>
            <div style={domainStatusStyle}>
              <span style={statusBadgeStyle(d.activationStatus)}>{d.activationStatus}</span>
              {d.blocker && <span style={blockerStyle}>{d.blocker}</span>}
            </div>
          </div>
        ))}
        <CardFooter>
          <span>Read-only source-of-truth view. No edits. No owner mutation.</span>
        </CardFooter>
      </Card>
    </div>
  );
}

function statusBadgeStyle(status: string): CSSProperties {
  const isDisabled = status === 'disabled_by_default';
  return {
    fontSize: typography.size.xs,
    color: isDisabled ? palette.textSubtle : palette.primaryFg,
    background: isDisabled ? palette.surfaceAlt : palette.primaryBg,
    padding: '1px 6px',
    borderRadius: '3px',
    fontWeight: typography.weight.semibold,
  };
}

const containerStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: spacing.lg };
const kpiRowStyle: CSSProperties = { display: 'flex', gap: spacing.lg, flexWrap: 'wrap' };
const kpiStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.textMuted, fontWeight: typography.weight.semibold };
const domainRowStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: `${spacing.xs} 0`, borderBottom: `1px solid ${palette.divider}` };
const domainInfoStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 };
const domainNameStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text, fontWeight: typography.weight.semibold };
const domainMetaStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textMuted };
const domainStatusStyle: CSSProperties = { display: 'flex', gap: spacing.xs, alignItems: 'center', flexShrink: 0 };
const blockerStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.atRisk };
const safetyStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic' };
