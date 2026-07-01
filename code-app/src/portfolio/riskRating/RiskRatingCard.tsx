import type { CSSProperties } from 'react';
import { palette, radius, severityPalette, shadow, spacing, typography } from '../../shared/theme';
import { formatPercent } from '../../shared/formatters';
import type { DualRatingRecord, RegulatoryClassification } from './dualRiskRating';

/**
 * Phase PE-5 — per-loan dual risk rating card.
 *
 * Read-only view over a `DualRatingRecord`: obligor grade + PD, facility band +
 * LGD, blended loan grade, regulatory classification, migration (up/down vs the
 * prior effective-dated rating), the captured drivers, and any override
 * justification. Honest absence when no rating exists.
 */

interface Props {
  readonly rating?: DualRatingRecord;
  readonly loanLabel?: string;
}

const CLASSIFICATION_TONE: Record<RegulatoryClassification, 'clear' | 'info' | 'atRisk' | 'blocked'> = {
  Pass: 'clear',
  'Special Mention': 'info',
  Substandard: 'atRisk',
  Doubtful: 'blocked',
  Loss: 'blocked',
};

function pd(n: number): string {
  return formatPercent(n * 100, { maximumFractionDigits: 2 });
}

export function RiskRatingCard({ rating, loanLabel }: Props) {
  if (!rating) {
    return (
      <section style={styles.wrap} aria-label="Risk rating" data-risk-rating="unavailable">
        <header style={styles.head}>
          <h4 style={styles.title}>Risk rating</h4>
          {loanLabel && <span style={styles.loanLabel}>{loanLabel}</span>}
        </header>
        <p style={styles.guidance}>
          No dual risk rating yet. Assign an obligor grade (1–8) and capture the facility (collateral, lien,
          structure) to derive the blended grade, PD/LGD, and regulatory classification.
        </p>
      </section>
    );
  }

  const r = rating;
  const tone = CLASSIFICATION_TONE[r.classification];

  return (
    <section style={styles.wrap} aria-label="Risk rating" data-risk-rating={r.classification}>
      <header style={styles.head}>
        <h4 style={styles.title}>Risk rating</h4>
        <div style={styles.headMeta}>
          <span style={styles.effective}>As of {r.effectiveDate}</span>
          <span
            style={{ ...styles.classChip, background: severityPalette[tone].bg, color: severityPalette[tone].fg }}
            data-risk-classification={r.classification}
          >
            {r.classification}
          </span>
        </div>
      </header>

      <div style={styles.gradeRow}>
        <Grade label="Obligor" value={String(r.obligorGrade)} sub={`${r.obligorLabel} · PD ${pd(r.pd)}`} />
        <Grade label="Facility" value={r.facilityLabel} sub={`LGD ${formatPercent(r.lgd * 100, { maximumFractionDigits: 0 })}`} />
        <Grade label="Blended" value={String(r.blendedGrade)} accent sub={r.overridden ? 'Overridden' : undefined} />
      </div>

      {r.migration && r.migration.direction !== 'affirmed' && (
        <div
          style={{ ...styles.migration, color: r.migration.direction === 'downgrade' ? severityPalette.blocked.bar : severityPalette.clear.bar }}
          data-risk-migration={r.migration.direction}
        >
          {r.migration.direction === 'downgrade' ? '▼' : '▲'} {r.migration.direction} {r.migration.notches} notch
          {r.migration.notches === 1 ? '' : 'es'} ({r.migration.fromGrade} → {r.migration.toGrade})
          {r.migration.classificationChanged && `, ${r.migration.fromClassification} → ${r.migration.toClassification}`}
        </div>
      )}

      {r.drivers.length > 0 && (
        <div style={styles.drivers} data-risk-drivers>
          {r.drivers.map((d) => (
            <span key={d} style={styles.driverChip}>{d}</span>
          ))}
        </div>
      )}

      {r.overridden && r.overrideJustification && (
        <p style={styles.override} data-risk-override>
          <strong>Override:</strong> {r.overrideJustification}
        </p>
      )}
    </section>
  );
}

function Grade({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div style={styles.grade} data-risk-grade={label}>
      <span style={styles.gradeLabel}>{label}</span>
      <span style={{ ...styles.gradeValue, color: accent ? palette.primary : palette.text }}>{value}</span>
      {sub && <span style={styles.gradeSub}>{sub}</span>}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: spacing.sm, background: palette.surface, border: `1px solid ${palette.panelBorder}`, borderRadius: radius.md, boxShadow: shadow.card, padding: `${spacing.md} ${spacing.lg}` },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.sm, flexWrap: 'wrap' },
  headMeta: { display: 'flex', gap: spacing.sm, alignItems: 'center' },
  title: { margin: 0, fontSize: typography.size.md, fontWeight: typography.weight.bold, color: palette.text },
  loanLabel: { fontSize: typography.size.xs, color: palette.textSubtle, fontFamily: typography.mono },
  effective: { fontSize: typography.size.xs, color: palette.textSubtle, letterSpacing: typography.letterSpacing.label },
  classChip: { padding: `2px ${spacing.sm}`, borderRadius: radius.pill, fontSize: typography.size.xs, fontWeight: typography.weight.bold, letterSpacing: typography.letterSpacing.label },
  guidance: { margin: 0, color: palette.textMuted, fontSize: typography.size.sm, lineHeight: typography.lineHeight.snug },
  gradeRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: spacing.sm },
  grade: { display: 'flex', flexDirection: 'column', gap: 2, background: palette.surfaceAlt, border: `1px solid ${palette.divider}`, borderRadius: radius.sm, padding: `${spacing.sm} ${spacing.md}` },
  gradeLabel: { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.bold },
  gradeValue: { fontSize: typography.size.lg, fontWeight: typography.weight.bold },
  gradeSub: { fontSize: typography.size.xs, color: palette.textMuted },
  migration: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold },
  drivers: { display: 'flex', flexWrap: 'wrap', gap: spacing.xs },
  driverChip: { padding: `2px ${spacing.sm}`, background: palette.surfaceAlt, border: `1px solid ${palette.border}`, borderRadius: radius.sm, fontSize: typography.size.xs, color: palette.text },
  override: { margin: 0, fontSize: typography.size.xs, color: palette.textMuted, fontStyle: 'italic' },
};
