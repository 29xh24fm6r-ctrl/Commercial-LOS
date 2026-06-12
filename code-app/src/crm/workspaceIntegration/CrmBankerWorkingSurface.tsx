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

function metricTarget(id: string, label: string, value: string, nextStep: string) {
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
          { label: 'Source', value: 'Derived from local preview input / current banker workspace context' },
          { label: 'Next safe review step', value: nextStep },
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
      <div style={gridStyle}>
        {targets.map((t) => (
          <DrillThroughCard key={t.id} target={metricTarget(t.id, t.label, t.value, nextStep)} variant="tile" unstyled>
            <div style={cellStyle}>
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

const gridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: spacing.md };
const cellStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: spacing.xs, padding: `${spacing.md} ${spacing.lg}`, background: palette.surfaceAlt, borderRadius: radius.md, border: `1px solid ${palette.border}`, cursor: 'pointer', minHeight: 80 };
const cellLabelStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.bold };
const cellValueStyle: CSSProperties = { fontSize: typography.size.md, color: palette.text, fontWeight: typography.weight.bold };
const cellValueHighlightStyle: CSSProperties = { fontSize: typography.size.md, color: palette.atRisk, fontWeight: typography.weight.bold };
const cellMeaningStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textMuted, lineHeight: typography.lineHeight.snug };
const nextStepStyle: CSSProperties = { display: 'flex', gap: spacing.sm, alignItems: 'baseline', marginTop: spacing.sm };
const nextLabelStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, fontWeight: typography.weight.semibold, textTransform: 'uppercase' };
const nextValueStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text };
const linkStyle: CSSProperties = { display: 'inline-block', marginTop: spacing.sm, padding: `${spacing.sm} ${spacing.lg}`, fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: palette.primaryFg, background: palette.primary, borderRadius: radius.sm, textDecoration: 'none' };
