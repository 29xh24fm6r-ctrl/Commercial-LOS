import type { CSSProperties } from 'react';
import { palette, radius, severityPalette, shadow, spacing, typography } from '../../shared/theme';
import type { CreditAdminQueue, ExceptionSeverity } from './creditAdminExceptions';
import { derivePortfolioExceptionSummary } from './creditAdminExceptions';

/**
 * Phase PE-6 — credit-admin exception queue panel.
 *
 * Read-only rollup over per-loan `CreditAdminQueue`s: open / overdue / due-soon
 * totals, the severity split, and the highest-frequency exception types (the
 * FDIC roadmap #2 focus). Honest absence with no queues.
 */

interface Props {
  readonly queues?: readonly CreditAdminQueue[];
}

const SEV_TONE: Record<ExceptionSeverity, 'blocked' | 'atRisk' | 'info'> = {
  high: 'blocked',
  medium: 'atRisk',
  low: 'info',
};

export function ExceptionQueuePanel({ queues }: Props) {
  const s = derivePortfolioExceptionSummary(queues ?? []);

  if (s.totalOpen === 0) {
    return (
      <section style={styles.wrap} aria-label="Credit-admin exceptions" data-exception-queue="empty">
        <header style={styles.head}>
          <h3 style={styles.title}>Credit-admin exceptions</h3>
        </header>
        <p style={styles.guidance}>
          No open exceptions. As loans are checked for completeness, missing required documents (financials,
          insurance, UCC, appraisal, flood, tax returns) and core-data gaps surface here with SLA aging.
        </p>
      </section>
    );
  }

  return (
    <section style={styles.wrap} aria-label="Credit-admin exceptions" data-exception-queue="ready">
      <header style={styles.head}>
        <h3 style={styles.title}>Credit-admin exceptions</h3>
        <span style={styles.meta} data-exception-total>{s.totalOpen} open</span>
      </header>

      <div style={styles.heroRow}>
        <Hero label="Overdue" value={String(s.overdue)} tone={s.overdue > 0 ? 'blocked' : 'clear'} />
        <Hero label="Due soon" value={String(s.dueSoon)} tone={s.dueSoon > 0 ? 'atRisk' : 'clear'} />
        {s.bySeverity.map((b) => (
          <Hero key={b.severity} label={`${cap(b.severity)} severity`} value={String(b.count)} tone={b.count > 0 ? SEV_TONE[b.severity] : 'clear'} />
        ))}
      </div>

      <div style={styles.section} data-exception-by-type>
        <div style={styles.sectionTitle}>Highest-frequency exceptions</div>
        <ul style={styles.list}>
          {s.byType.slice(0, 8).map((t) => (
            <li key={t.type} style={styles.row} data-exception-type={t.type}>
              <span style={styles.rowLabel}>{t.type}</span>
              <span style={styles.rowCount}>{t.count}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Hero({ label, value, tone }: { label: string; value: string; tone: 'clear' | 'blocked' | 'atRisk' | 'info' }) {
  return (
    <div style={styles.hero} data-exception-hero={label}>
      <span style={styles.heroLabel}>{label}</span>
      <span style={{ ...styles.heroValue, color: value === '0' || tone === 'clear' ? palette.text : severityPalette[tone].bar }}>{value}</span>
    </div>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: spacing.sm, background: palette.surface, border: `1px solid ${palette.panelBorder}`, borderRadius: radius.md, boxShadow: shadow.card, padding: `${spacing.md} ${spacing.lg}` },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.sm },
  title: { margin: 0, fontSize: typography.size.lg, fontWeight: typography.weight.bold, color: palette.text },
  meta: { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold },
  guidance: { margin: 0, color: palette.textMuted, fontSize: typography.size.sm, lineHeight: typography.lineHeight.snug },
  heroRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: spacing.sm },
  hero: { display: 'flex', flexDirection: 'column', gap: 2, background: palette.surfaceAlt, border: `1px solid ${palette.divider}`, borderRadius: radius.sm, padding: `${spacing.sm} ${spacing.md}` },
  heroLabel: { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.bold },
  heroValue: { fontSize: typography.size.xl, fontWeight: typography.weight.bold, fontFamily: typography.mono },
  section: { display: 'flex', flexDirection: 'column', gap: spacing.xs, paddingTop: spacing.sm, borderTop: `1px solid ${palette.divider}` },
  sectionTitle: { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.bold },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: spacing.xs },
  row: { display: 'flex', justifyContent: 'space-between', gap: spacing.sm, padding: `2px 0`, borderBottom: `1px solid ${palette.divider}` },
  rowLabel: { fontSize: typography.size.sm, color: palette.text },
  rowCount: { fontSize: typography.size.sm, color: palette.text, fontFamily: typography.mono, fontWeight: typography.weight.bold },
};
