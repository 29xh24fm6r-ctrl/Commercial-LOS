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
      { label: 'Source-of-truth posture', value: 'LOS is authoritative for borrower identity; external CRM is reference only' },
      { label: 'Missing data', value: 'No external relationship records loaded (external connection disabled)' },
      { label: 'Data source', value: 'Authorized banker workspace context — no external lookup performed' },
      { label: 'Next safe step', value: 'Review relationship ownership and source-of-truth map' },
    ],
  },
  salesforce: {
    rows: [
      { label: 'External CRM connection', value: 'Disabled. No live connection to any external CRM platform.' },
      { label: 'Posture', value: 'Preview-only. Read-only intelligence from local workspace context.' },
      { label: 'What would be required', value: 'Secure transport, connector configuration, auth configuration, read scope documentation, operator approval' },
      { label: 'Writes', value: 'All external CRM writes are disabled by default' },
      { label: 'Next safe step', value: 'Review connector readiness prerequisites in the CRM Command Center' },
    ],
  },
  ncino: {
    rows: [
      { label: 'Lending workflow sync', value: 'Disabled. No live sync to any external lending workflow platform.' },
      { label: 'Why disabled', value: 'Secure transport not configured. Auth not configured. Operator approval required before enablement.' },
      { label: 'Posture', value: 'Preview-only. No loan boarding, booking, or approval actions from this surface.' },
      { label: 'Writes', value: 'All lending workflow writes are disabled by default' },
      { label: 'Next safe step', value: 'Review lending workflow readiness and document checklist mapping' },
    ],
  },
  'match-status': {
    rows: [
      { label: 'Entity matching', value: 'Awaiting human review. No auto-link performed.' },
      { label: 'Confidence', value: 'No external records available for comparison (external connection disabled)' },
      { label: 'Matching mode', value: 'Review-only. Matching operates on authorized labels only.' },
      { label: 'Auto-link', value: 'Disabled. No automatic record linking without explicit human confirmation.' },
      { label: 'Next safe step', value: 'Review match candidates when external read-only pull is enabled' },
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
    { id: 'salesforce', label: 'CRM', value: input.salesforceReadiness, highlight: false, meaning: 'External CRM platform readiness posture' },
    { id: 'ncino', label: 'Lending Workflow', value: input.ncinoReadiness, highlight: false, meaning: 'External lending workflow platform readiness' },
    { id: 'match-status', label: 'Match Status', value: input.entityMatchStatus, highlight: false, meaning: 'Entity matching confidence against external records' },
    { id: 'sot-gaps', label: 'SoT Gaps', value: String(input.sourceOfTruthGaps), highlight: input.sourceOfTruthGaps > 0, meaning: 'Source-of-truth ownership gaps requiring review' },
    { id: 'sync-blocked', label: 'Sync Blocked', value: String(input.syncPreviewBlockers), highlight: input.syncPreviewBlockers > 0, meaning: 'Sync preview operations blocked by policy or conflict' },
  ];

  return (
    <Card>
      <CardHeader title="CRM Intelligence" subtitle="CRM readiness — read-only" />
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
        <span>Preview-only CRM intelligence. Live writes disabled. No sync or push actions.</span>
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
