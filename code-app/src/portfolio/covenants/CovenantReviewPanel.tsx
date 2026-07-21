import type { CSSProperties } from 'react';
import { palette, radius, severityPalette, shadow, spacing, typography } from '../../shared/theme';

/**
 * Phase PE-9 — covenant + review-cadence queue panel.
 *
 * Read-only over the review queue (from deriveReviewQueue) with the aggregate
 * covenant posture: overdue / due-soon reviews and open covenant breaches.
 * Honest absence when nothing is due and no breaches exist.
 */

interface ReviewQueueLike {
  readonly entries: readonly { readonly loanId: string; readonly grade: number | undefined; readonly cadenceMonths: number; readonly nextReviewDate: string | undefined; readonly status: 'current' | 'due_soon' | 'overdue' }[];
  readonly overdue: number;
  readonly dueSoon: number;
}

interface Props {
  readonly reviewQueue?: ReviewQueueLike;
  /**
   * `undefined`/omitted means the covenant-test feed (DSCR/leverage/liquidity/
   * TNW/current-ratio breach detection over real financials) isn't wired to a
   * live source yet — rendered as "Not available", distinct from a genuine,
   * checked zero. Pass an explicit number (including 0) once the feed is live.
   */
  readonly covenantBreachCount?: number;
  readonly covenantAtRiskCount?: number;
}

const STATUS_TONE: Record<'current' | 'due_soon' | 'overdue', 'clear' | 'atRisk' | 'blocked'> = {
  current: 'clear',
  due_soon: 'atRisk',
  overdue: 'blocked',
};

export function CovenantReviewPanel({ reviewQueue, covenantBreachCount, covenantAtRiskCount }: Props) {
  const entries = reviewQueue?.entries ?? [];
  const breachKnown = typeof covenantBreachCount === 'number';
  const atRiskKnown = typeof covenantAtRiskCount === 'number';
  const hasContent = entries.length > 0 || (breachKnown && covenantBreachCount! > 0) || (atRiskKnown && covenantAtRiskCount! > 0);

  if (!hasContent) {
    return (
      <section style={styles.wrap} aria-label="Covenants & reviews" data-covenant-review="empty">
        <header style={styles.head}>
          <h3 style={styles.title}>Covenants & reviews</h3>
        </header>
        <p style={styles.guidance}>
          No reviews due{breachKnown && atRiskKnown ? ' and no covenant breaches' : ''}. Review cadence tightens with the loan grade; covenant
          tests (DSCR, leverage, liquidity, TNW, current ratio) surface breaches and trend-to-breach here.
          {!(breachKnown && atRiskKnown) && ' Covenant breach/trend-to-breach detection is not connected to a live data source yet — this is not a confirmed-clean result for that part.'}
        </p>
      </section>
    );
  }

  return (
    <section style={styles.wrap} aria-label="Covenants & reviews" data-covenant-review="ready">
      <header style={styles.head}>
        <h3 style={styles.title}>Covenants & reviews</h3>
        <span style={styles.meta} data-review-queue-count>{entries.length} in queue</span>
      </header>

      <div style={styles.heroRow}>
        <Hero label="Reviews overdue" value={String(reviewQueue?.overdue ?? 0)} tone={(reviewQueue?.overdue ?? 0) > 0 ? 'blocked' : 'clear'} />
        <Hero label="Reviews due soon" value={String(reviewQueue?.dueSoon ?? 0)} tone={(reviewQueue?.dueSoon ?? 0) > 0 ? 'atRisk' : 'clear'} />
        <Hero label="Covenant breaches" value={breachKnown ? String(covenantBreachCount) : 'Not available'} tone={breachKnown && covenantBreachCount! > 0 ? 'blocked' : 'clear'} />
        <Hero label="Trend to breach" value={atRiskKnown ? String(covenantAtRiskCount) : 'Not available'} tone={atRiskKnown && covenantAtRiskCount! > 0 ? 'atRisk' : 'clear'} />
      </div>

      {entries.length > 0 && (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Loan</th>
              <th style={styles.th}>Grade</th>
              <th style={styles.th}>Cadence</th>
              <th style={styles.th}>Next review</th>
              <th style={styles.th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {entries.slice(0, 50).map((e) => (
              <tr key={e.loanId} style={styles.tr} data-review-entry={e.loanId} data-review-status={e.status}>
                <td style={styles.td}>{e.loanId}</td>
                <td style={styles.td}>{e.grade ?? '—'}</td>
                <td style={styles.td}>{e.cadenceMonths}mo</td>
                <td style={styles.td}>{e.nextReviewDate ?? 'None on file'}</td>
                <td style={{ ...styles.td, color: severityPalette[STATUS_TONE[e.status]].bar }}>{e.status.replace('_', ' ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function Hero({ label, value, tone }: { label: string; value: string; tone: 'clear' | 'atRisk' | 'blocked' }) {
  return (
    <div style={styles.hero} data-covenant-hero={label}>
      <span style={styles.heroLabel}>{label}</span>
      <span style={{ ...styles.heroValue, color: value === '0' || tone === 'clear' ? palette.text : severityPalette[tone].bar }}>{value}</span>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: spacing.sm, background: palette.surface, border: `1px solid ${palette.panelBorder}`, borderRadius: radius.md, boxShadow: shadow.card, padding: `${spacing.md} ${spacing.lg}` },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.sm },
  title: { margin: 0, fontSize: typography.size.lg, fontWeight: typography.weight.bold, color: palette.text },
  meta: { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold },
  guidance: { margin: 0, color: palette.textMuted, fontSize: typography.size.sm, lineHeight: typography.lineHeight.snug },
  heroRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: spacing.sm },
  hero: { display: 'flex', flexDirection: 'column', gap: 2, background: palette.surfaceAlt, border: `1px solid ${palette.divider}`, borderRadius: radius.sm, padding: `${spacing.sm} ${spacing.md}` },
  heroLabel: { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.bold },
  heroValue: { fontSize: typography.size.xl, fontWeight: typography.weight.bold, fontFamily: typography.mono },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: typography.size.sm },
  th: { textAlign: 'left', padding: `${spacing.xs} ${spacing.sm}`, color: palette.textSubtle, textTransform: 'uppercase', fontSize: typography.size.xs, letterSpacing: typography.letterSpacing.label, borderBottom: `1px solid ${palette.divider}` },
  tr: { borderBottom: `1px solid ${palette.divider}` },
  td: { padding: `${spacing.xs} ${spacing.sm}`, color: palette.text },
};
