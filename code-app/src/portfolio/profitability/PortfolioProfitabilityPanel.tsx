import type { CSSProperties } from 'react';
import { palette, radius, severityPalette, shadow, spacing, typography } from '../../shared/theme';
import { formatCurrency, formatPercent } from '../../shared/formatters';
import type { LoanProfitability } from './loanProfitability';
import { derivePortfolioProfitability } from './profitabilityRollups';

/**
 * Phase PE-4 — portfolio profitability panel.
 *
 * Read-only distribution over per-loan `LoanProfitability` results: the
 * capital-weighted ROE, the ROE distribution across the book, and the loans
 * dragging it (negative contribution or below-threshold ROE). Honest absence:
 * with no rated loans it shows guidance rather than an empty chart of zeros.
 */

interface Props {
  /** Per-loan profitability results. Omit / empty until real inputs are supplied. */
  readonly loans?: readonly LoanProfitability[];
  readonly lowRoeThreshold?: number;
}

const MONEY = { abbreviate: true, empty: '—' } as const;

export function PortfolioProfitabilityPanel({ loans, lowRoeThreshold }: Props) {
  const p = derivePortfolioProfitability(loans ?? [], { lowRoeThreshold });
  const hasRated = p.ratedLoanCount > 0;

  if (!hasRated) {
    return (
      <section style={styles.wrap} aria-label="Portfolio profitability" data-portfolio-profitability="empty">
        <header style={styles.head}>
          <h3 style={styles.title}>Portfolio profitability</h3>
        </header>
        <p style={styles.guidance}>
          No rated loans yet. Once loans carry a real earning balance, loan rate, and assumption set, this
          panel shows the capital-weighted ROE, the ROE distribution, and the loans dragging the book.
        </p>
      </section>
    );
  }

  const maxBucket = Math.max(1, ...p.distribution.map((b) => b.count));

  return (
    <section style={styles.wrap} aria-label="Portfolio profitability" data-portfolio-profitability="ready">
      <header style={styles.head}>
        <h3 style={styles.title}>Portfolio profitability</h3>
        <span style={styles.meta} data-portfolio-profitability-count>
          {p.ratedLoanCount} of {p.loanCount} rated
        </span>
      </header>

      <div style={styles.heroRow}>
        <Hero label="Weighted-avg ROE" value={p.weightedAvgRoe !== undefined ? formatPercent(p.weightedAvgRoe, { maximumFractionDigits: 1 }) : '—'} />
        <Hero label="Contribution margin" value={formatCurrency(p.contributionMargin, MONEY)} />
        <Hero label="Allocated capital" value={formatCurrency(p.allocatedCapital, MONEY)} />
        <Hero label="Negative contribution" value={String(p.negativeContributionCount)} tone={p.negativeContributionCount > 0 ? 'blocked' : 'clear'} />
      </div>

      <div style={styles.section} data-profitability-distribution>
        <div style={styles.sectionTitle}>ROE distribution</div>
        <div style={styles.dist}>
          {p.distribution.map((b) => (
            <div key={b.label} style={styles.distRow} data-profitability-bucket={b.label}>
              <span style={styles.distLabel}>{b.label}</span>
              <span style={styles.distBarTrack}>
                <span style={{ ...styles.distBar, width: `${(b.count / maxBucket) * 100}%`, background: b.label === 'Negative' ? severityPalette.blocked.bar : palette.primary }} />
              </span>
              <span style={styles.distCount}>{b.count}</span>
            </div>
          ))}
        </div>
      </div>

      {p.lowRoeOutliers.length > 0 && (
        <div style={styles.section} data-profitability-outliers>
          <div style={styles.sectionTitle}>ROE outliers — dragging the book</div>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Loan</th>
                <th style={styles.th}>Product</th>
                <th style={styles.thNum}>ROE</th>
                <th style={styles.thNum}>Contribution</th>
              </tr>
            </thead>
            <tbody>
              {p.lowRoeOutliers.map((o, i) => (
                <tr key={o.loanId ?? i} style={styles.tr} data-profitability-outlier={o.loanId ?? String(i)}>
                  <td style={styles.td}>{o.loanId ?? '—'}</td>
                  <td style={styles.td}>{o.productType ?? '—'}</td>
                  <td style={{ ...styles.tdNum, color: severityPalette.blocked.bar }}>
                    {o.roe !== undefined ? formatPercent(o.roe, { maximumFractionDigits: 1 }) : '—'}
                  </td>
                  <td style={styles.tdNum}>{formatCurrency(o.contributionMargin, MONEY)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Hero({ label, value, tone }: { label: string; value: string; tone?: 'clear' | 'blocked' }) {
  return (
    <div style={styles.hero} data-profitability-hero={label}>
      <span style={styles.heroLabel}>{label}</span>
      <span style={{ ...styles.heroValue, color: tone === 'blocked' ? severityPalette.blocked.bar : palette.text }}>{value}</span>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: spacing.sm, background: palette.surface, border: `1px solid ${palette.panelBorder}`, borderRadius: radius.md, boxShadow: shadow.card, padding: `${spacing.md} ${spacing.lg}` },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.sm },
  title: { margin: 0, fontSize: typography.size.lg, fontWeight: typography.weight.bold, color: palette.text },
  meta: { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold },
  guidance: { margin: 0, color: palette.textMuted, fontSize: typography.size.sm, lineHeight: typography.lineHeight.snug },
  heroRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: spacing.sm },
  hero: { display: 'flex', flexDirection: 'column', gap: 2, background: palette.surfaceAlt, border: `1px solid ${palette.divider}`, borderRadius: radius.sm, padding: `${spacing.sm} ${spacing.md}` },
  heroLabel: { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.bold },
  heroValue: { fontSize: typography.size.xl, fontWeight: typography.weight.bold, fontFamily: typography.mono },
  section: { display: 'flex', flexDirection: 'column', gap: spacing.xs, paddingTop: spacing.sm, borderTop: `1px solid ${palette.divider}` },
  sectionTitle: { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.bold },
  dist: { display: 'flex', flexDirection: 'column', gap: spacing.xs },
  distRow: { display: 'grid', gridTemplateColumns: '80px 1fr 40px', gap: spacing.sm, alignItems: 'center' },
  distLabel: { fontSize: typography.size.xs, color: palette.text },
  distBarTrack: { background: palette.surfaceAlt, borderRadius: radius.pill, height: 10, overflow: 'hidden' },
  distBar: { display: 'block', height: '100%', borderRadius: radius.pill },
  distCount: { fontSize: typography.size.sm, color: palette.text, fontFamily: typography.mono, textAlign: 'right' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: typography.size.sm },
  th: { textAlign: 'left', padding: `${spacing.xs} ${spacing.sm}`, color: palette.textSubtle, textTransform: 'uppercase', fontSize: typography.size.xs, letterSpacing: typography.letterSpacing.label, borderBottom: `1px solid ${palette.divider}` },
  thNum: { textAlign: 'right', padding: `${spacing.xs} ${spacing.sm}`, color: palette.textSubtle, textTransform: 'uppercase', fontSize: typography.size.xs, letterSpacing: typography.letterSpacing.label, borderBottom: `1px solid ${palette.divider}` },
  tr: { borderBottom: `1px solid ${palette.divider}` },
  td: { padding: `${spacing.xs} ${spacing.sm}`, color: palette.text },
  tdNum: { padding: `${spacing.xs} ${spacing.sm}`, color: palette.text, textAlign: 'right', fontFamily: typography.mono },
};
