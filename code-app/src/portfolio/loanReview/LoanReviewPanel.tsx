import type { CSSProperties } from 'react';
import { palette, radius, shadow, spacing, typography } from '../../shared/theme';
import { formatCurrency } from '../../shared/formatters';
import type { LoanReviewScope, ReviewReason } from './loanReview';

/**
 * Phase PE-8 — independent loan review workspace panel.
 *
 * Read-only over a `LoanReviewScope`: the risk-based sample, overall coverage
 * (count + exposure), and the selected loans with their selection reasons.
 * Honest absence when nothing is scoped.
 */

interface Props {
  readonly scope?: LoanReviewScope;
}

const MONEY = { abbreviate: true, empty: '—' } as const;

const REASON_LABEL: Record<ReviewReason, string> = {
  criticized: 'Criticized',
  large_exposure: 'Large exposure',
  exceptions: 'Exceptions',
  sampled: 'Sampled',
};

export function LoanReviewPanel({ scope }: Props) {
  if (!scope || scope.selected.length === 0) {
    return (
      <section style={styles.wrap} aria-label="Independent loan review" data-loan-review="empty">
        <header style={styles.head}>
          <h3 style={styles.title}>Independent loan review</h3>
        </header>
        <p style={styles.guidance}>
          No loans scoped for review. Coverage is risk-based — criticized grades, large exposures, and
          exception-heavy credits are always selected, plus a sample of the pass book.
        </p>
      </section>
    );
  }

  const s = scope;

  return (
    <section style={styles.wrap} aria-label="Independent loan review" data-loan-review="ready">
      <header style={styles.head}>
        <h3 style={styles.title}>Independent loan review</h3>
        <span style={styles.meta} data-review-count>{s.selected.length} scoped</span>
      </header>

      <div style={styles.heroRow}>
        <Hero label="Coverage (count)" value={`${s.overall.coveragePct}%`} sub={`${s.overall.selected} / ${s.overall.total}`} />
        <Hero label="Coverage (exposure)" value={`${s.overall.exposureCoveragePct}%`} sub={`${formatCurrency(s.overall.exposureSelected, MONEY)} / ${formatCurrency(s.overall.exposureTotal, MONEY)}`} />
      </div>

      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Loan</th>
            <th style={styles.th}>Grade</th>
            <th style={styles.thNum}>Exposure</th>
            <th style={styles.th}>Reason</th>
          </tr>
        </thead>
        <tbody>
          {s.selected.slice(0, 50).map((r) => (
            <tr key={r.loanId} style={styles.tr} data-review-loan={r.loanId} data-review-mandatory={r.mandatory ? 'true' : 'false'}>
              <td style={styles.td}>{r.loanId}</td>
              <td style={styles.td}>{r.obligorGrade ?? '—'}</td>
              <td style={styles.tdNum}>{formatCurrency(r.exposure, MONEY)}</td>
              <td style={styles.td}>{r.reasons.map((x) => REASON_LABEL[x]).join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Hero({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={styles.hero} data-review-hero={label}>
      <span style={styles.heroLabel}>{label}</span>
      <span style={styles.heroValue}>{value}</span>
      {sub && <span style={styles.heroSub}>{sub}</span>}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: spacing.sm, background: palette.surface, border: `1px solid ${palette.panelBorder}`, borderRadius: radius.md, boxShadow: shadow.card, padding: `${spacing.md} ${spacing.lg}` },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.sm },
  title: { margin: 0, fontSize: typography.size.lg, fontWeight: typography.weight.bold, color: palette.text },
  meta: { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold },
  guidance: { margin: 0, color: palette.textMuted, fontSize: typography.size.sm, lineHeight: typography.lineHeight.snug },
  heroRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: spacing.sm },
  hero: { display: 'flex', flexDirection: 'column', gap: 2, background: palette.surfaceAlt, border: `1px solid ${palette.divider}`, borderRadius: radius.sm, padding: `${spacing.sm} ${spacing.md}` },
  heroLabel: { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.bold },
  heroValue: { fontSize: typography.size.xl, fontWeight: typography.weight.bold, fontFamily: typography.mono, color: palette.text },
  heroSub: { fontSize: typography.size.xs, color: palette.textMuted, fontFamily: typography.mono },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: typography.size.sm },
  th: { textAlign: 'left', padding: `${spacing.xs} ${spacing.sm}`, color: palette.textSubtle, textTransform: 'uppercase', fontSize: typography.size.xs, letterSpacing: typography.letterSpacing.label, borderBottom: `1px solid ${palette.divider}` },
  thNum: { textAlign: 'right', padding: `${spacing.xs} ${spacing.sm}`, color: palette.textSubtle, textTransform: 'uppercase', fontSize: typography.size.xs, letterSpacing: typography.letterSpacing.label, borderBottom: `1px solid ${palette.divider}` },
  tr: { borderBottom: `1px solid ${palette.divider}` },
  td: { padding: `${spacing.xs} ${spacing.sm}`, color: palette.text },
  tdNum: { padding: `${spacing.xs} ${spacing.sm}`, color: palette.text, textAlign: 'right', fontFamily: typography.mono },
};
