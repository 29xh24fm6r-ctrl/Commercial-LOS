import type { CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../../shared/Card';
import { palette, spacing, typography } from '../../shared/theme';
import type { CrmSyncPreviewCockpitViewModel, SyncPreviewEntityRow } from './crmSyncPreviewCockpitViewModel';

interface Props {
  viewModel: CrmSyncPreviewCockpitViewModel;
}

export function CrmSyncPreviewCockpit({ viewModel: vm }: Props) {
  return (
    <div style={containerStyle}>
      <Card>
        <CardHeader title={vm.title} subtitle={vm.subtitle} />
        <p style={safetyStyle}>{vm.safetyCopy}</p>
        <div style={kpiRowStyle}>
          <Kpi label="Would Create" value={vm.wouldCreateCount} />
          <Kpi label="Would Update" value={vm.wouldUpdateCount} />
          <Kpi label="Would Link" value={vm.wouldLinkCount} />
          <Kpi label="Would Skip" value={vm.wouldSkipCount} />
          <Kpi label="Blocked" value={vm.blockedCount} />
        </div>
      </Card>

      <Card>
        <CardHeader title="Preview Entities" />
        {vm.entities.length === 0 && <p style={emptyStyle}>No sync preview entities.</p>}
        {vm.entities.map((e, i) => (
          <EntityRow key={i} entity={e} />
        ))}
        <CardFooter>
          <span>Preview only. No CRM records created, updated, or linked.</span>
        </CardFooter>
      </Card>
    </div>
  );
}

function EntityRow({ entity }: { entity: SyncPreviewEntityRow }) {
  return (
    <div style={entityRowStyle}>
      <div style={entityInfoStyle}>
        <span style={entityLabelStyle}>{entity.label}</span>
        <span style={entityMetaStyle}>{entity.provider} · {entity.entityKind}</span>
      </div>
      <div style={entityStatusStyle}>
        <span style={opBadgeStyle(entity.operation)}>{entity.operation.replace('_', ' ')}</span>
        {entity.blockerReason && <span style={blockerStyle}>{entity.blockerReason}</span>}
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div style={kpiCellStyle}>
      <span style={kpiLabelStyle}>{label}</span>
      <span style={kpiValueStyle}>{value}</span>
    </div>
  );
}

function opBadgeStyle(op: string): CSSProperties {
  const isBlocked = op === 'blocked';
  return {
    fontSize: typography.size.xs,
    color: isBlocked ? palette.blockedFg : palette.textMuted,
    background: isBlocked ? palette.blockedBg : palette.surfaceAlt,
    padding: '1px 6px',
    borderRadius: '3px',
    fontWeight: typography.weight.semibold,
    textTransform: 'uppercase',
  };
}

const containerStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: spacing.lg };
const kpiRowStyle: CSSProperties = { display: 'flex', gap: spacing.xl, flexWrap: 'wrap' };
const kpiCellStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 80 };
const kpiLabelStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const kpiValueStyle: CSSProperties = { fontSize: typography.size.lg, color: palette.text, fontWeight: typography.weight.bold };
const entityRowStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: `${spacing.xs} 0`, borderBottom: `1px solid ${palette.divider}` };
const entityInfoStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2 };
const entityLabelStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text, fontWeight: typography.weight.semibold };
const entityMetaStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textMuted };
const entityStatusStyle: CSSProperties = { display: 'flex', gap: spacing.xs, alignItems: 'center', flexShrink: 0 };
const blockerStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.blocked };
const emptyStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic' };
const safetyStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic' };
