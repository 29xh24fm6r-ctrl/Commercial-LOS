import type { CSSProperties } from 'react';
import { palette, radius, severityPalette, shadow, spacing, typography } from '../../shared/theme';
import { formatCurrency, formatPercent } from '../../shared/formatters';
import type { RegulatoryClassificationSnapshot } from './regulatoryClassification';
import type { RegulatoryClassification } from '../riskRating/dualRiskRating';

/**
 * Phase 264 (P3) — regulatory classification pooling panel.
 *
 * Read-only, portfolio-level display over a `RegulatoryClassificationSnapshot`:
 * the five CECL-style pools (Pass / Special Mention / Substandard / Doubtful /
 * Loss), each with loan count, exposure, share of portfolio, weighted-average
 * PD/LGD, and an illustrative allowance estimate, plus a portfolio-level
 * summary line. This is a complement to the per-loan
 * `PortfolioClassificationPanel` (distribution counts only) — this panel adds
 * exposure weighting and the allowance estimate.
 *
 * NOT a certified CECL / ALLL calculation — see regulatoryClassification.ts
 * for the full disclaimer. The banner below restates it for anyone viewing
 * this panel without reading the engine source.
 */

interface Props {
  readonly snapshot: RegulatoryClassificationSnapshot;
}

const TONE: Record<RegulatoryClassification, 'clear' | 'info' | 'atRisk' | 'blocked'> = {
  Pass: 'clear',
  'Special Mention': 'info',
  Substandard: 'atRisk',
  Doubtful: 'blocked',
  Loss: 'blocked',
};

const MONEY = { abbreviate: true, empty: '—' } as const;

export function RegulatoryClassificationPoolPanel({ snapshot }: Props) {
  if (snapshot.isEmpty) {
    return (
      <section
        style={styles.wrap}
        aria-label="Regulatory classification pooling"
        data-regulatory-classification-pool="empty"
      >
        <header style={styles.head}>
          <h3 style={styles.title}>Regulatory Classification (Illustrative)</h3>
        </header>
        <p style={styles.guidance}>
          No boarded loans available to classify. Once loans carry both an exposure amount and a dual
          risk rating, this panel pools them into Pass / Special Mention / Substandard / Doubtful / Loss
          and derives an illustrative allowance estimate.
        </p>
        {snapshot.excludedLoanCount > 0 && (
          <p style={styles.excluded} data-regulatory-classification-excluded>
            {snapshot.excludedLoanCount} loan{snapshot.excludedLoanCount === 1 ? '' : 's'} excluded for
            missing or non-positive exposure.
          </p>
        )}
      </section>
    );
  }

  return (
    <section
      style={styles.wrap}
      aria-label="Regulatory classification pooling"
      data-regulatory-classification-pool="ready"
    >
      <header style={styles.head}>
        <h3 style={styles.title}>Regulatory Classification (Illustrative)</h3>
        <span style={styles.meta}>Illustrative pooling — not a regulatory filing figure</span>
      </header>

      <p style={styles.disclaimer} data-regulatory-classification-disclaimer>
        Illustrative allowance estimate using this system&rsquo;s internal PD/LGD scale. NOT a certified
        CECL/ALLL calculation — no macro overlay, vintage/cohort loss history, or qualitative factors are
        applied.
      </p>

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Pool</th>
              <th style={styles.thNum}>Loans</th>
              <th style={styles.thNum}>Exposure</th>
              <th style={styles.thNum}>Share</th>
              <th style={styles.thNum}>Wtd. avg PD</th>
              <th style={styles.thNum}>Wtd. avg LGD</th>
              <th style={styles.thNum}>Est. allowance</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.pools.map((p) => {
              const tone = TONE[p.classification];
              return (
                <tr key={p.classification} style={styles.tr} data-classification-pool={p.classification}>
                  <td style={styles.td}>
                    <span
                      style={{ ...styles.classChip, background: severityPalette[tone].bg, color: severityPalette[tone].fg }}
                    >
                      {p.classification}
                    </span>
                  </td>
                  <td style={styles.tdNum}>{p.loanCount}</td>
                  <td style={styles.tdNum}>{formatCurrency(p.totalExposure, MONEY)}</td>
                  <td style={styles.tdNum}>{p.sharePctOfPortfolio}%</td>
                  <td style={styles.tdNum}>{formatPercent(p.weightedAveragePd * 100, { maximumFractionDigits: 2 })}</td>
                  <td style={styles.tdNum}>{formatPercent(p.weightedAverageLgd * 100, { maximumFractionDigits: 0 })}</td>
                  <td style={styles.tdNum}>{formatCurrency(p.estimatedAllowance, MONEY)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <footer style={styles.footer} data-regulatory-classification-summary>
        <span>Total exposure: {formatCurrency(snapshot.totalExposure, MONEY)}</span>
        <span>Total estimated allowance: {formatCurrency(snapshot.totalEstimatedAllowance, MONEY)}</span>
        <span>
          Allowance coverage ratio:{' '}
          {snapshot.allowanceCoverageRatio !== undefined
            ? formatPercent(snapshot.allowanceCoverageRatio, { maximumFractionDigits: 2 })
            : 'not available'}
        </span>
        <span>
          Criticized exposure: {formatCurrency(snapshot.criticizedExposure, MONEY)} ({snapshot.criticizedSharePct}%)
        </span>
        <span>
          Classified exposure: {formatCurrency(snapshot.classifiedExposure, MONEY)} ({snapshot.classifiedSharePct}%)
        </span>
        {snapshot.excludedLoanCount > 0 && (
          <span data-regulatory-classification-excluded>
            {snapshot.excludedLoanCount} loan{snapshot.excludedLoanCount === 1 ? '' : 's'} excluded for
            missing or non-positive exposure.
          </span>
        )}
      </footer>
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: spacing.sm, background: palette.surface, border: `1px solid ${palette.panelBorder}`, borderRadius: radius.md, boxShadow: shadow.card, padding: `${spacing.md} ${spacing.lg}` },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.sm, flexWrap: 'wrap' },
  title: { margin: 0, fontSize: typography.size.lg, fontWeight: typography.weight.bold, color: palette.text },
  meta: { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold },
  guidance: { margin: 0, color: palette.textMuted, fontSize: typography.size.sm, lineHeight: typography.lineHeight.snug },
  excluded: { margin: 0, color: severityPalette.atRisk.bar, fontSize: typography.size.xs },
  disclaimer: { margin: 0, color: palette.textMuted, fontSize: typography.size.xs, lineHeight: typography.lineHeight.snug, background: palette.surfaceAlt, border: `1px solid ${palette.divider}`, borderRadius: radius.sm, padding: `${spacing.xs} ${spacing.sm}` },
  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: typography.size.sm },
  th: { textAlign: 'left', padding: `${spacing.xs} ${spacing.sm}`, color: palette.textSubtle, textTransform: 'uppercase', fontSize: typography.size.xs, letterSpacing: typography.letterSpacing.label, borderBottom: `1px solid ${palette.divider}` },
  thNum: { textAlign: 'right', padding: `${spacing.xs} ${spacing.sm}`, color: palette.textSubtle, textTransform: 'uppercase', fontSize: typography.size.xs, letterSpacing: typography.letterSpacing.label, borderBottom: `1px solid ${palette.divider}` },
  tr: { borderBottom: `1px solid ${palette.divider}` },
  td: { padding: `${spacing.xs} ${spacing.sm}`, color: palette.text },
  tdNum: { padding: `${spacing.xs} ${spacing.sm}`, color: palette.text, textAlign: 'right', fontFamily: typography.mono },
  classChip: { padding: `2px ${spacing.sm}`, borderRadius: radius.pill, fontSize: typography.size.xs, fontWeight: typography.weight.bold, letterSpacing: typography.letterSpacing.label },
  footer: { display: 'flex', flexDirection: 'column', gap: 2, paddingTop: spacing.sm, borderTop: `1px solid ${palette.divider}`, fontSize: typography.size.xs, color: palette.textSubtle },
};
