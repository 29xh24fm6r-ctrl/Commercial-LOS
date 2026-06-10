import type { CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../../shared/Card';
import { palette, spacing, typography, radius } from '../../shared/theme';

export interface CrmExecutiveSurfaceInput {
  crmCoverageStatus: string;
  salesforceActivationPosture: string;
  ncinoActivationPosture: string;
  relationshipIntelligenceGaps: number;
  productStrategyCrmReadiness: string;
  revenueDataAvailability: string;
  nextExecutiveStep: string;
  crmCommandCenterHref: string | undefined;
}

interface Props {
  input: CrmExecutiveSurfaceInput;
}

export function CrmExecutiveWorkingSurface({ input }: Props) {
  return (
    <Card>
      <CardHeader title="CRM Strategy Intelligence" subtitle="Coverage, readiness, and data availability — read-only" />
      <div style={gridStyle}>
        <MetricCell label="CRM Coverage" value={input.crmCoverageStatus} />
        <MetricCell label="Salesforce" value={input.salesforceActivationPosture} />
        <MetricCell label="nCino" value={input.ncinoActivationPosture} />
        <MetricCell label="Intelligence Gaps" value={String(input.relationshipIntelligenceGaps)} highlight={input.relationshipIntelligenceGaps > 0} />
        <MetricCell label="Product Strategy" value={input.productStrategyCrmReadiness} />
        <MetricCell label="Revenue Data" value={input.revenueDataAvailability} />
      </div>
      <div style={nextStepStyle}>
        <span style={nextLabelStyle}>Next step:</span>
        <span style={nextValueStyle}>{input.nextExecutiveStep}</span>
      </div>
      {input.crmCommandCenterHref && (
        <a href={input.crmCommandCenterHref} style={linkStyle}>Open CRM Command Center</a>
      )}
      <CardFooter>
        <span>Read-only executive CRM view. No fake revenue, ROE, or profitability. No credit decisioning. No write controls.</span>
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
