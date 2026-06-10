import type { CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../../shared/Card';
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

export function CrmBankerWorkingSurface({ input }: Props) {
  return (
    <Card>
      <CardHeader title="CRM Intelligence" subtitle="Salesforce / nCino readiness — read-only" />
      <div style={gridStyle}>
        <MetricCell label="Relationship" value={input.relationshipOverview ?? 'Not available'} />
        <MetricCell label="Salesforce" value={input.salesforceReadiness} />
        <MetricCell label="nCino" value={input.ncinoReadiness} />
        <MetricCell label="Match Status" value={input.entityMatchStatus} />
        <MetricCell label="SoT Gaps" value={String(input.sourceOfTruthGaps)} highlight={input.sourceOfTruthGaps > 0} />
        <MetricCell label="Sync Blocked" value={String(input.syncPreviewBlockers)} highlight={input.syncPreviewBlockers > 0} />
      </div>
      <div style={nextStepStyle}>
        <span style={nextLabelStyle}>Next step:</span>
        <span style={nextValueStyle}>{input.nextSafeBankerStep}</span>
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
