import { type CSSProperties, type ReactNode } from 'react';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';
import type { ProductProfitabilityAvailabilitySummary } from './productProfitabilityAvailabilityModel';

interface Props {
  summary?: ProductProfitabilityAvailabilitySummary;
}

/**
 * Phase 142S — Product profitability / ROE availability panel (read-only).
 *
 * Shows ONLY whether the required source data appears available for FUTURE
 * profitability / ROE / yield / margin / fee-income / risk-adjusted-return
 * modeling. It is an availability model only: there is NO calculate-ROE /
 * calculate-profitability / recommend-pricing / optimize-portfolio / approve /
 * deny / vote affordance, NO form, NO mutation control, NO fetch, NO sample data,
 * and NO profitability / ROE / yield / margin / fee figures. Nothing is calculated.
 */
export function ProductProfitabilityAvailabilityPanel({ summary }: Props) {
  if (!summary) {
    return (
      <Card>
        <CardHeader title="Product Profitability / ROE Availability" subtitle="Read-only availability model — availability model only" />
        <div style={emptyStyle}>Profitability availability data is unavailable. Nothing is shown until authorized deal data is provided.</div>
        <CardFooter>
          <span>Availability model only — no metric is calculated and no external system is changed.</span>
        </CardFooter>
      </Card>
    );
  }

  const s = summary;
  return (
    <Card>
      <CardHeader title="Product Profitability / ROE Availability" subtitle="Read-only availability model — availability model only" />

      <div style={pillRowStyle}>
        <span style={pillStyle}>Availability model only</span>
      </div>

      <div style={bannerStyle}>
        Profitability, ROE, yield, margin, fee income, and risk-adjusted return are not calculated here. This panel only shows whether the required source data appears available for future modeling.
      </div>

      <dl style={metaStyle}>
        <Row label="Deal" value={s.dealName} />
        <Row label="Client" value={s.clientName} />
        <Row label="Product type" value={s.productType} />
        <Row label="Loan structure" value={s.loanStructure} />
        <Row label="Pricing type" value={s.pricingType} />
        <Row label="Availability status" value={s.availabilityLabel} />
        <Row label="Available sources" value={String(s.availableSourceCount)} />
        <Row label="Missing sources" value={String(s.missingSourceCount)} />
      </dl>

      {s.missingSourceLabels.length > 0 && (
        <Section title="Missing source data">
          <ul style={ulStyle}>
            {s.missingSourceLabels.map((l) => (
              <li key={l} style={warnItemStyle}>{l}</li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Future metric readiness (not calculated)">
        <ul style={ulStyle}>
          {Object.entries(s.futureMetricReadiness).map(([metric, readiness]) => (
            <li key={metric} style={itemStyle}>{metricLabel(metric)}: {String(readiness).replace(/_/g, ' ')}</li>
          ))}
        </ul>
      </Section>

      {s.blockedMetricLabels.length > 0 && (
        <Section title="Blocked metrics (no source data)">
          <span style={itemStyle}>{s.blockedMetricLabels.join(', ')}</span>
        </Section>
      )}

      {s.warnings.length > 0 && (
        <Section title="Warnings">
          <ul style={ulStyle}>
            {s.warnings.map((w) => (
              <li key={w} style={warnItemStyle}>{w}</li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Next read-only review step">
        <span style={itemStyle}>{s.nextReadOnlyReviewStep}</span>
      </Section>

      <div style={safetyStyle}>
        Read-only: {String(s.readOnly)} · Profitability metric produced: {String(s.profitabilityCalculated)} · ROE metric produced: {String(s.roeCalculated)} · Yield metric produced: {String(s.yieldCalculated)} · Margin metric produced: {String(s.marginCalculated)} · Fee income metric produced: {String(s.feeIncomeCalculated)} · External system changed: {String(s.externalSystemChanged)}
      </div>

      <CardFooter>
        <span>Read-only availability model — no profitability, ROE, yield, margin, or fee metric is calculated, and no external system is changed.</span>
      </CardFooter>
    </Card>
  );
}

function metricLabel(metric: string): string {
  switch (metric) {
    case 'roe': return 'ROE';
    case 'feeIncome': return 'Fee income';
    case 'riskAdjustedReturn': return 'Risk-adjusted return';
    default: return metric.charAt(0).toUpperCase() + metric.slice(1);
  }
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={rowStyle}>
      <dt style={dtStyle}>{label}</dt>
      <dd style={ddStyle}>{value}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={sectionStyle}>
      <span style={sectionTitleStyle}>{title}</span>
      {children}
    </div>
  );
}

const pillRowStyle: CSSProperties = { display: 'flex', gap: spacing.xs };
const pillStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textMuted, background: palette.neutralBg, padding: `2px ${spacing.xs}`, borderRadius: 999, fontWeight: typography.weight.semibold };
const bannerStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.atRiskFg, background: palette.atRiskBg, padding: spacing.sm, borderRadius: 4 };
const safetyStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, marginTop: spacing.sm };
const emptyStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic', padding: spacing.sm };
const metaStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, margin: 0 };
const rowStyle: CSSProperties = { display: 'flex', gap: spacing.md };
const dtStyle: CSSProperties = { minWidth: 170, fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const ddStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.text };
const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, marginTop: spacing.sm };
const sectionTitleStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const ulStyle: CSSProperties = { margin: 0, paddingLeft: spacing.lg, display: 'flex', flexDirection: 'column', gap: 2 };
const itemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text };
const warnItemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.atRiskFg };
