import type { CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../../shared/Card';
import { DrillThroughCard } from '../../shared/drillthrough/DrillThroughCard';
import { buildDrillThroughTarget } from '../../shared/drillthrough/drillThroughTypes';
import { palette, spacing, typography, radius } from '../../shared/theme';

export interface CrmBankerSurfaceInput {
  relationshipOverview: string | undefined;
  salesforceReadiness: string;
  ncinoReadiness: string;
  entityMatchStatus: string;
  sourceOfTruthGaps: number;
  syncPreviewBlockers: number;
  nextSafeBankerStep: string;
  crmCommandCenterHref: string | undefined;
}

interface Props {
  input: CrmBankerSurfaceInput;
}

const DETAIL_CONTENT: Record<string, { rows: { label: string; value: string }[] }> = {
  relationship: {
    rows: [
      { label: 'Status', value: 'Relationship context derived from authorized banker workspace data' },
      { label: 'Source-of-truth posture', value: 'LOS is authoritative for borrower identity; OGB CRM is the internal relationship system of reference' },
      { label: 'Missing data', value: 'No relationship records linked yet (honest internal empty state)' },
      { label: 'Data source', value: 'Authorized banker workspace context — internal OGB CRM, no external lookup' },
      { label: 'Next safe step', value: 'Review relationship ownership and source-of-truth map' },
    ],
  },
  salesforce: {
    rows: [
      { label: 'OGB CRM', value: 'Active. Internal relationship intelligence from authorized LOS workspace context.' },
      { label: 'Posture', value: 'Internal, read-only. Writeback gated (no records created, updated, or linked).' },
      { label: 'What writeback would require', value: 'Writeback policy enablement, persistence adapter, runtime schema gate, and operator approval' },
      { label: 'Writes', value: 'Writeback gated — disabled by default' },
      { label: 'Next safe step', value: 'Review OGB CRM source-of-truth and relationship matching' },
    ],
  },
  ncino: {
    rows: [
      { label: 'Lending workflow', value: 'Active. Internal OGB lending workflow readiness from authorized LOS context.' },
      { label: 'Writeback', value: 'Gated. No stage, task, or workflow write occurs from this surface.' },
      { label: 'Posture', value: 'Internal, read-only. No loan boarding, booking, or approval actions from this surface.' },
      { label: 'Writes', value: 'Workflow writes gated — disabled by default' },
      { label: 'Next safe step', value: 'Review lending workflow readiness, routing, and document checklist mapping' },
    ],
  },
  'match-status': {
    rows: [
      { label: 'Entity matching', value: 'Awaiting human review. No auto-link performed.' },
      { label: 'Confidence', value: 'Source-of-truth review on internal records (no records linked yet)' },
      { label: 'Matching mode', value: 'Review-only. Matching operates on authorized labels only.' },
      { label: 'Auto-link', value: 'Disabled. No automatic record linking without explicit human confirmation.' },
      { label: 'Next safe step', value: 'Review match candidates as internal records are linked' },
    ],
  },
  'sot-gaps': {
    rows: [
      { label: 'Source-of-truth gaps', value: 'Number of CRM domains where ownership is unresolved or disabled' },
      { label: 'Impact', value: 'Gaps mean the system cannot determine which platform is authoritative for those domains' },
      { label: 'Resolution path', value: 'Review the source-of-truth map and confirm ownership per domain' },
      { label: 'Current state', value: 'All domains default to LOS-authoritative with external sources as reference only' },
      { label: 'Next safe step', value: 'Review source-of-truth ownership map in CRM Command Center' },
    ],
  },
  'sync-blocked': {
    rows: [
      { label: 'Sync blocked', value: 'Number of sync preview operations blocked by policy or conflict' },
      { label: 'Blocking reason', value: 'Writeback policy gate not ready, or entity match conflict requires human review' },
      { label: 'Resolution path', value: 'Resolve match conflicts and verify writeback policy prerequisites' },
      { label: 'Current state', value: 'All sync operations are preview-only. No records have been synced.' },
      { label: 'Next safe step', value: 'Review sync preview blockers and resolve conflicts before dry-run validation' },
    ],
  },
};

function metricTarget(id: string, label: string, value: string, _nextStep: string) {
  const content = DETAIL_CONTENT[id];
  return buildDrillThroughTarget({
    id: `banker-crm-${id}`,
    title: label,
    surface: 'crm_relationship_intelligence',
    entityKind: 'metric',
    summary: value,
    detailSections: [
      {
        title: label,
        rows: [
          { label: 'Current status', value },
          ...(content?.rows ?? []),
          { label: 'Source', value: 'Authorized banker workspace context' },
        ],
      },
    ],
  });
}

export function CrmBankerWorkingSurface({ input }: Props) {
  const nextStep = input.nextSafeBankerStep;

  const targets = [
    { id: 'relationship', label: 'Relationship', value: input.relationshipOverview ?? 'Not available', highlight: false, meaning: 'Relationship context from authorized workspace data' },
    { id: 'salesforce', label: 'CRM', value: input.salesforceReadiness, highlight: false, meaning: 'Internal OGB CRM readiness posture' },
    { id: 'ncino', label: 'Lending Workflow', value: input.ncinoReadiness, highlight: false, meaning: 'Internal OGB lending workflow readiness' },
    { id: 'match-status', label: 'Match Status', value: input.entityMatchStatus, highlight: false, meaning: 'Source-of-truth matching on internal records' },
    { id: 'sot-gaps', label: 'SoT Gaps', value: String(input.sourceOfTruthGaps), highlight: input.sourceOfTruthGaps > 0, meaning: 'Source-of-truth ownership gaps requiring review' },
    { id: 'sync-blocked', label: 'Sync Blocked', value: String(input.syncPreviewBlockers), highlight: input.syncPreviewBlockers > 0, meaning: 'Sync preview operations blocked by policy or conflict' },
  ];

  return (
    <Card>
      <CardHeader title="CRM Intelligence" subtitle="OGB CRM active — internal relationship intelligence (read-only)" />
      <div style={gridStyle} data-crm-grid="command">
        {targets.map((t) => (
          <DrillThroughCard key={t.id} target={metricTarget(t.id, t.label, t.value, nextStep)} variant="tile">
            <div style={cellStyle} data-crm-cell="fill">
              <span style={cellLabelStyle}>{t.label}</span>
              <span style={t.highlight ? cellValueHighlightStyle : cellValueStyle}>{t.value}</span>
              <span style={cellMeaningStyle}>{t.meaning}</span>
            </div>
          </DrillThroughCard>
        ))}
      </div>
      <div style={nextStepStyle}>
        <span style={nextLabelStyle}>Next step:</span>
        <span style={nextValueStyle}>{nextStep}</span>
      </div>
      {input.crmCommandCenterHref && (
        <a href={input.crmCommandCenterHref} style={linkStyle}>Open CRM Command Center</a>
      )}
      <CardFooter>
        <span>OGB CRM active — internal relationship intelligence. Writeback gated. No sync or push actions.</span>
      </CardFooter>
    </Card>
  );
}

const gridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: spacing.sm };
const cellStyle: CSSProperties = { display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: spacing.xs, padding: `${spacing.md} ${spacing.lg}`, background: palette.surface, borderRadius: radius.sm, border: `1px solid ${palette.border}`, cursor: 'pointer', height: '100%', boxSizing: 'border-box' };
const cellLabelStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.bold };
const cellValueStyle: CSSProperties = { fontSize: typography.size.md, color: palette.text, fontWeight: typography.weight.bold };
const cellValueHighlightStyle: CSSProperties = { fontSize: typography.size.md, color: palette.atRisk, fontWeight: typography.weight.bold };
const cellMeaningStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textMuted, lineHeight: typography.lineHeight.snug };
const nextStepStyle: CSSProperties = { display: 'flex', gap: spacing.sm, alignItems: 'baseline', marginTop: spacing.sm };
const nextLabelStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, fontWeight: typography.weight.semibold, textTransform: 'uppercase' };
const nextValueStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text };
const linkStyle: CSSProperties = { display: 'inline-block', marginTop: spacing.sm, padding: `${spacing.sm} ${spacing.lg}`, fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: palette.primaryFg, background: palette.primary, borderRadius: radius.sm, textDecoration: 'none' };
