import type { CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../../shared/Card';
import { palette, spacing, typography } from '../../shared/theme';
import { deriveCrmCommandCenterViewModel } from './crmCommandCenterViewModel';

export function CrmCommandCenter() {
  const vm = deriveCrmCommandCenterViewModel();

  return (
    <div style={containerStyle}>
      <Card>
        <CardHeader title={vm.title} subtitle={vm.subtitle} />
        <p style={safetyStyle}>{vm.safetyCopy}</p>
        <div style={kpiRowStyle}>
          <Kpi label="Total Domains" value={vm.totalSourceOfTruthDomains} />
          <Kpi label="Activated" value={vm.activatedDomains} />
          <Kpi label="Disabled" value={vm.disabledDomains} />
          <Kpi label="Conflicts" value={vm.conflictDomains} />
        </div>
      </Card>

      <div style={lanesStyle}>
        <LaneCard lane={vm.salesforceLane} />
        <LaneCard lane={vm.ncinoLane} />
      </div>

      <Card>
        <CardHeader title="Summary" />
        <SummaryRow label="Source of Truth" value={vm.sourceOfTruthSummary} />
        <SummaryRow label="Entity Matching" value={vm.entityMatchingSummary} />
        <SummaryRow label="Sync Preview" value={vm.syncPreviewSummary} />
        <SummaryRow label="Writeback Posture" value={vm.writebackPosture} />
        <SummaryRow label="Relationship Timeline" value={vm.relationshipTimelineSummary} />
        <SummaryRow label="Next Safe Action" value={vm.nextSafeAction} />
        <CardFooter>
          <span>Read-only CRM intelligence. No live writes. No external calls.</span>
        </CardFooter>
      </Card>
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

function LaneCard({ lane }: { lane: { label: string; domainsOwned: number; domainsReadSource: number; connectorStatus: string; writebackStatus: string } }) {
  return (
    <Card>
      <CardHeader title={lane.label} subtitle={`Connector: ${lane.connectorStatus}`} />
      <SummaryRow label="Domains owned" value={String(lane.domainsOwned)} />
      <SummaryRow label="Read source" value={String(lane.domainsReadSource)} />
      <SummaryRow label="Writeback" value={lane.writebackStatus} />
    </Card>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={summaryRowStyle}>
      <span style={summaryLabelStyle}>{label}</span>
      <span style={summaryValueStyle}>{value}</span>
    </div>
  );
}

const containerStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: spacing.lg };
const kpiRowStyle: CSSProperties = { display: 'flex', gap: spacing.xl, flexWrap: 'wrap' };
const kpiCellStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 100 };
const kpiLabelStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const kpiValueStyle: CSSProperties = { fontSize: typography.size.xl, color: palette.text, fontWeight: typography.weight.bold };
const lanesStyle: CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.lg };
const summaryRowStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', padding: `${spacing.xs} 0`, borderBottom: `1px solid ${palette.divider}` };
const summaryLabelStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.textMuted, fontWeight: typography.weight.semibold };
const summaryValueStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text };
const safetyStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic', lineHeight: typography.lineHeight.snug };
