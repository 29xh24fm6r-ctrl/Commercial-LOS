import type { CSSProperties } from 'react';
import { palette, radius, severityPalette, shadow, spacing, typography } from '../../shared/theme';
import { derivePortfolioClassification, type DualRatingRecord, type RegulatoryClassification } from './dualRiskRating';

/**
 * Phase PE-5 — portfolio regulatory-classification distribution.
 *
 * Read-only rollup over per-loan `DualRatingRecord`s: the Pass / Special
 * Mention / Substandard / Doubtful / Loss distribution, plus the criticized
 * (grade ≥ 5) and classified (grade ≥ 6) totals examiners key off. Honest
 * absence with no ratings.
 */

interface Props {
  readonly ratings?: readonly DualRatingRecord[];
}

const TONE: Record<RegulatoryClassification, 'clear' | 'info' | 'atRisk' | 'blocked'> = {
  Pass: 'clear',
  'Special Mention': 'info',
  Substandard: 'atRisk',
  Doubtful: 'blocked',
  Loss: 'blocked',
};

export function PortfolioClassificationPanel({ ratings }: Props) {
  const d = derivePortfolioClassification(ratings ?? []);

  if (d.total === 0) {
    return (
      <section style={styles.wrap} aria-label="Regulatory classification" data-portfolio-classification="empty">
        <header style={styles.head}>
          <h3 style={styles.title}>Regulatory classification</h3>
        </header>
        <p style={styles.guidance}>
          No rated loans yet. As loans carry a dual risk rating, this panel shows the Pass / Special Mention /
          Substandard / Doubtful / Loss distribution and the criticized and classified totals.
        </p>
      </section>
    );
  }

  const max = Math.max(1, ...d.distribution.map((b) => b.count));

  return (
    <section style={styles.wrap} aria-label="Regulatory classification" data-portfolio-classification="ready">
      <header style={styles.head}>
        <h3 style={styles.title}>Regulatory classification</h3>
        <span style={styles.meta} data-classification-total>{d.total} rated</span>
      </header>

      <div style={styles.heroRow}>
        <Hero label="Criticized (≥5)" value={String(d.criticizedCount)} tone={d.criticizedCount > 0 ? 'atRisk' : 'clear'} />
        <Hero label="Classified (≥6)" value={String(d.classifiedCount)} tone={d.classifiedCount > 0 ? 'blocked' : 'clear'} />
      </div>

      <div style={styles.dist}>
        {d.distribution.map((b) => (
          <div key={b.classification} style={styles.distRow} data-classification-bucket={b.classification}>
            <span style={styles.distLabel}>{b.classification}</span>
            <span style={styles.distBarTrack}>
              <span style={{ ...styles.distBar, width: `${(b.count / max) * 100}%`, background: severityPalette[TONE[b.classification]].bar }} />
            </span>
            <span style={styles.distCount}>{b.count}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Hero({ label, value, tone }: { label: string; value: string; tone: 'clear' | 'atRisk' | 'blocked' }) {
  return (
    <div style={styles.hero} data-classification-hero={label}>
      <span style={styles.heroLabel}>{label}</span>
      <span style={{ ...styles.heroValue, color: value === '0' ? palette.text : severityPalette[tone].bar }}>{value}</span>
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
  dist: { display: 'flex', flexDirection: 'column', gap: spacing.xs, paddingTop: spacing.sm, borderTop: `1px solid ${palette.divider}` },
  distRow: { display: 'grid', gridTemplateColumns: '140px 1fr 40px', gap: spacing.sm, alignItems: 'center' },
  distLabel: { fontSize: typography.size.xs, color: palette.text },
  distBarTrack: { background: palette.surfaceAlt, borderRadius: radius.pill, height: 10, overflow: 'hidden' },
  distBar: { display: 'block', height: '100%', borderRadius: radius.pill },
  distCount: { fontSize: typography.size.sm, color: palette.text, fontFamily: typography.mono, textAlign: 'right' },
};
