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
      { label: 'Status', value: 'Relationship context from your authorized workspace data' },
      { label: 'Relationship ownership', value: 'The bank holds borrower identity; the CRM is the relationship system of record' },
      { label: 'Records', value: 'No relationship records linked yet' },
      { label: 'Data source', value: 'Your authorized workspace context — the bank’s CRM' },
      { label: 'Next step', value: 'Review relationship ownership and matching' },
    ],
  },
  salesforce: {
    rows: [
      { label: 'CRM', value: 'Active. Relationship records from your authorized workspace.' },
      { label: 'Availability', value: 'Relationship records are available to view.' },
      { label: 'Next step', value: 'Review relationship records and matching' },
    ],
  },
  ncino: {
    rows: [
      { label: 'Loan workflow', value: 'Active. Loan workflow readiness from your authorized workspace.' },
      { label: 'Availability', value: 'Open a deal to manage its loan workflow.' },
      { label: 'Next step', value: 'Review loan workflow readiness, routing, and the document checklist' },
    ],
  },
  'match-status': {
    rows: [
      { label: 'Record matching', value: 'Awaiting human review. No automatic link performed.' },
      { label: 'Matching mode', value: 'Review-only. Matching operates on authorized labels only.' },
      { label: 'Auto-link', value: 'Off. No record is linked without explicit confirmation.' },
      { label: 'Next step', value: 'Review match candidates as records are linked' },
    ],
  },
  'sot-gaps': {
    rows: [
      { label: 'Ownership gaps', value: 'Number of relationship domains where ownership is unresolved' },
      { label: 'Impact', value: 'Gaps mean ownership for those domains is not yet confirmed' },
      { label: 'Resolution path', value: 'Confirm relationship ownership per domain' },
      { label: 'Next step', value: 'Review relationship ownership' },
    ],
  },
  'sync-blocked': {
    rows: [
      { label: 'Items needing review', value: 'Number of relationship matches that need a human review' },
      { label: 'Reason', value: 'A record match needs confirmation before it is linked' },
      { label: 'Resolution path', value: 'Resolve match conflicts and confirm the links' },
      { label: 'Next step', value: 'Review the items that need confirmation' },
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
    { id: 'relationship', label: 'Relationship', value: input.relationshipOverview ?? 'Not available', highlight: false, meaning: 'Relationship context from your authorized workspace data' },
    { id: 'salesforce', label: 'CRM', value: input.salesforceReadiness, highlight: false, meaning: 'Relationship records availability' },
    { id: 'ncino', label: 'Loan Workflow', value: input.ncinoReadiness, highlight: false, meaning: 'Loan workflow readiness' },
    { id: 'match-status', label: 'Match Status', value: input.entityMatchStatus, highlight: false, meaning: 'Relationship record matching' },
    { id: 'sot-gaps', label: 'Ownership Gaps', value: String(input.sourceOfTruthGaps), highlight: input.sourceOfTruthGaps > 0, meaning: 'Relationship ownership gaps to review' },
    { id: 'sync-blocked', label: 'Needs Review', value: String(input.syncPreviewBlockers), highlight: input.syncPreviewBlockers > 0, meaning: 'Relationship matches that need confirmation' },
  ];

  return (
    <Card>
      <CardHeader title="CRM Intelligence" subtitle="CRM is active — relationship records are available" />
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
        <span>CRM is active. Relationship records are available.</span>
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
