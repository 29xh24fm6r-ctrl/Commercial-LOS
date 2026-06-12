import type { CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../../shared/Card';
import { palette, spacing, typography, radius } from '../../shared/theme';

export interface CrmManagerSurfaceInput {
  teamCrmReadiness: string;
  bankerFollowUpWorkload: number;
  sourceOfTruthConflicts: number;
  salesforceReadinessByPipeline: string;
  ncinoReadinessByPipeline: string;
  syncPreviewBlockedCount: number;
  nextSafeManagerStep: string;
  crmCommandCenterHref: string | undefined;
}

interface Props {
  input: CrmManagerSurfaceInput;
}

export function CrmManagerWorkingSurface({ input }: Props) {
  return (
    <Card>
      <CardHeader title="Team CRM Intelligence" subtitle="Pipeline CRM readiness — read-only" />
      <div style={gridStyle}>
        <MetricCell label="Team Readiness" value={input.teamCrmReadiness} />
        <MetricCell label="Banker Follow-ups" value={String(input.bankerFollowUpWorkload)} highlight={input.bankerFollowUpWorkload > 0} />
        <MetricCell label="SoT Conflicts" value={String(input.sourceOfTruthConflicts)} highlight={input.sourceOfTruthConflicts > 0} />
        <MetricCell label="CRM" value={input.salesforceReadinessByPipeline} />
        <MetricCell label="Lending Workflow" value={input.ncinoReadinessByPipeline} />
        <MetricCell label="Sync Blocked" value={String(input.syncPreviewBlockedCount)} highlight={input.syncPreviewBlockedCount > 0} />
      </div>
      <div style={nextStepStyle}>
        <span style={nextLabelStyle}>Next step:</span>
        <span style={nextValueStyle}>{input.nextSafeManagerStep}</span>
      </div>
      {input.crmCommandCenterHref && (
        <a href={input.crmCommandCenterHref} style={linkStyle}>Open CRM Command Center</a>
      )}
      <CardFooter>
        <span>Read-only team CRM view. No assignment mutation. No CRM writes. No permission widening.</span>
      </CardFooter>
    </Card>
  );
}

function MetricCell({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={cellStyle}>
      <span style={cellLabelStyle}>{label}</span>
      <span style={highlight ? cellValueHighlightStyle : cellValueStyle}>{value}</span>
    </div>
  );
}

const gridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: spacing.sm };
const cellStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, padding: spacing.sm, background: palette.surfaceAlt, borderRadius: radius.sm };
const cellLabelStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const cellValueStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text, fontWeight: typography.weight.semibold };
const cellValueHighlightStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.atRisk, fontWeight: typography.weight.bold };
const nextStepStyle: CSSProperties = { display: 'flex', gap: spacing.sm, alignItems: 'baseline', marginTop: spacing.sm };
const nextLabelStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, fontWeight: typography.weight.semibold, textTransform: 'uppercase' };
const nextValueStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text };
const linkStyle: CSSProperties = { display: 'inline-block', marginTop: spacing.sm, padding: `${spacing.sm} ${spacing.lg}`, fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: palette.primaryFg, background: palette.primary, borderRadius: radius.sm, textDecoration: 'none' };
