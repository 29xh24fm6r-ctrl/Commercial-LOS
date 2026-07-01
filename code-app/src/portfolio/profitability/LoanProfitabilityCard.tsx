import type { CSSProperties } from 'react';
import { palette, radius, severityPalette, shadow, spacing, typography } from '../../shared/theme';
import { formatCurrency, formatPercent } from '../../shared/formatters';
import type { LoanProfitability, ProfitabilityStatus } from './loanProfitability';

/**
 * Phase PE-4 — per-loan profitability card.
 *
 * Read-only view over a `LoanProfitability` result: net interest income,
 * contribution margin, ROE, and RAROC, with an as-of period and an
 * assumptions note. Honest absence: when inputs are insufficient (no real
 * earning balance / rate) it shows a "not available" state rather than a
 * manufactured number.
 */

interface Props {
  readonly profitability?: LoanProfitability;
  readonly loanLabel?: string;
  /** Short note describing the assumption set behind the numbers (as-of, source). */
  readonly assumptionsNote?: string;
}

const MONEY = { abbreviate: true, empty: '—' } as const;

const STATUS: Record<ProfitabilityStatus, { label: string; tone: 'clear' | 'info' | 'atRisk' | 'blocked' | 'neutral' }> = {
  above_target: { label: 'Above target', tone: 'clear' },
  near_target: { label: 'Near target', tone: 'info' },
  below_target: { label: 'Below target', tone: 'atRisk' },
  negative_contribution: { label: 'Negative contribution', tone: 'blocked' },
  unrated: { label: 'Unrated', tone: 'neutral' },
  insufficient_inputs: { label: 'Inputs not available', tone: 'neutral' },
};

export function LoanProfitabilityCard({ profitability, loanLabel, assumptionsNote }: Props) {
  if (!profitability || !profitability.sufficientInputs) {
    return (
      <section style={styles.wrap} aria-label="Loan profitability" data-loan-profitability="unavailable">
        <header style={styles.head}>
          <h4 style={styles.title}>Profitability</h4>
          {loanLabel && <span style={styles.loanLabel}>{loanLabel}</span>}
        </header>
        <p style={styles.guidance}>
          Profitability inputs not available. Enter the average earning balance, loan rate, and the
          assumption set (cost of funds, capital allocation, tax) to view net interest income, contribution
          margin, ROE, and RAROC for this loan.
        </p>
      </section>
    );
  }

  const p = profitability;
  const status = STATUS[p.status];

  return (
    <section style={styles.wrap} aria-label="Loan profitability" data-loan-profitability={p.status}>
      <header style={styles.head}>
        <h4 style={styles.title}>Profitability</h4>
        <div style={styles.headMeta}>
          {p.period && <span style={styles.period} data-profitability-period>As of {p.period}</span>}
          <span
            style={{ ...styles.statusChip, background: severityPalette[status.tone].bg, color: severityPalette[status.tone].fg }}
            data-profitability-status={p.status}
          >
            {status.label}
          </span>
        </div>
      </header>

      <div style={styles.tiles}>
        <Metric label="Net interest income" value={formatCurrency(p.netInterestIncome, MONEY)} />
        <Metric label="Contribution margin" value={formatCurrency(p.contributionMargin, MONEY)} sub={p.contributionMarginPercent !== undefined ? `${formatPercent(p.contributionMarginPercent, { maximumFractionDigits: 1 })} of revenue` : undefined} />
        <Metric label="ROE" value={p.roe !== undefined ? formatPercent(p.roe, { maximumFractionDigits: 1 }) : '—'} accent />
        <Metric label="RAROC" value={p.raroc !== undefined ? formatPercent(p.raroc, { maximumFractionDigits: 1 }) : '—'} accent />
      </div>

      <dl style={styles.detailGrid}>
        <Detail label="Interest income" value={formatCurrency(p.interestIncome, MONEY)} />
        <Detail label="Fee income" value={formatCurrency(p.totalFeeIncome, MONEY)} />
        <Detail label="Funding cost" value={formatCurrency(p.fundingCost, MONEY)} />
        <Detail label="Allocated costs" value={formatCurrency(p.totalAllocatedCosts, MONEY)} />
        <Detail label="Credit provision" value={formatCurrency(p.creditProvision, MONEY)} />
        <Detail label="Allocated capital" value={formatCurrency(p.allocatedCapital, MONEY)} />
      </dl>

      <p style={styles.assumptions} data-profitability-assumptions>
        {assumptionsNote ??
          `Cost of funds ${formatPercent(p.costOfFundsRate, { maximumFractionDigits: 2 })}; capital ${formatCurrency(p.allocatedCapital, MONEY)}. Read-only; traceable to inputs.`}
      </p>
    </section>
  );
}

function Metric({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div style={styles.metric} data-profitability-metric={label}>
      <span style={styles.metricLabel}>{label}</span>
      <span style={{ ...styles.metricValue, color: accent ? palette.primary : palette.text }}>{value}</span>
      {sub && <span style={styles.metricSub}>{sub}</span>}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.detailRow}>
      <dt style={styles.detailLabel}>{label}</dt>
      <dd style={styles.detailValue}>{value}</dd>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: spacing.sm, background: palette.surface, border: `1px solid ${palette.panelBorder}`, borderRadius: radius.md, boxShadow: shadow.card, padding: `${spacing.md} ${spacing.lg}` },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.sm, flexWrap: 'wrap' },
  headMeta: { display: 'flex', gap: spacing.sm, alignItems: 'center' },
  title: { margin: 0, fontSize: typography.size.md, fontWeight: typography.weight.bold, color: palette.text },
  loanLabel: { fontSize: typography.size.xs, color: palette.textSubtle, fontFamily: typography.mono },
  period: { fontSize: typography.size.xs, color: palette.textSubtle, letterSpacing: typography.letterSpacing.label },
  statusChip: { padding: `2px ${spacing.sm}`, borderRadius: radius.pill, fontSize: typography.size.xs, fontWeight: typography.weight.bold, letterSpacing: typography.letterSpacing.label },
  guidance: { margin: 0, color: palette.textMuted, fontSize: typography.size.sm, lineHeight: typography.lineHeight.snug },
  tiles: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: spacing.sm },
  metric: { display: 'flex', flexDirection: 'column', gap: 2, background: palette.surfaceAlt, border: `1px solid ${palette.divider}`, borderRadius: radius.sm, padding: `${spacing.sm} ${spacing.md}` },
  metricLabel: { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.bold },
  metricValue: { fontSize: typography.size.lg, fontWeight: typography.weight.bold, fontFamily: typography.mono },
  metricSub: { fontSize: typography.size.xs, color: palette.textMuted },
  detailGrid: { margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: spacing.xs },
  detailRow: { display: 'flex', justifyContent: 'space-between', gap: spacing.sm, padding: `2px 0`, borderBottom: `1px solid ${palette.divider}` },
  detailLabel: { margin: 0, fontSize: typography.size.xs, color: palette.textSubtle },
  detailValue: { margin: 0, fontSize: typography.size.sm, color: palette.text, fontFamily: typography.mono },
  assumptions: { margin: 0, fontSize: typography.size.xs, color: palette.textSubtle, fontStyle: 'italic' },
};
