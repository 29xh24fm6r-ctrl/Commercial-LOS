import type { CSSProperties } from 'react';
import { palette, radius, severityPalette, shadow, spacing, typography } from '../../shared/theme';
import type { EarlyWarningQueue, SignalPriority } from './earlyWarning';

/**
 * Phase PE-10 — early-warning work queue panel.
 *
 * Read-only "what needs me now" over an `EarlyWarningQueue`: critical / high
 * counts, and the prioritized per-loan alerts with their contributing signals,
 * owner, and SLA. Honest absence when the book is quiet.
 */

interface Props {
  readonly queue?: EarlyWarningQueue;
}

const TONE: Record<SignalPriority, 'blocked' | 'atRisk' | 'info' | 'neutral'> = {
  critical: 'blocked',
  high: 'atRisk',
  medium: 'info',
  low: 'neutral',
};

export function EarlyWarningPanel({ queue }: Props) {
  if (!queue || queue.alerts.length === 0) {
    return (
      <section style={styles.wrap} aria-label="Early warning" data-early-warning="empty">
        <header style={styles.head}>
          <h3 style={styles.title}>Early warning — work queue</h3>
        </header>
        <p style={styles.guidance}>
          Nothing needs attention right now. Past-due trends, covenant breaches, rating downgrades, stale
          financials, approaching maturities, and deposit stress surface here as prioritized alerts.
        </p>
      </section>
    );
  }

  const q = queue;

  return (
    <section style={styles.wrap} aria-label="Early warning" data-early-warning="ready">
      <header style={styles.head}>
        <h3 style={styles.title}>Early warning — work queue</h3>
        <span style={styles.meta} data-ew-count>{q.alerts.length} alerts</span>
      </header>

      <div style={styles.heroRow}>
        <Hero label="Critical" value={String(q.criticalCount)} tone={q.criticalCount > 0 ? 'blocked' : 'clear'} />
        <Hero label="High" value={String(q.highCount)} tone={q.highCount > 0 ? 'atRisk' : 'clear'} />
        <Hero label="Signals" value={String(q.signalCount)} />
      </div>

      <ul style={styles.list}>
        {q.alerts.slice(0, 40).map((a) => (
          <li key={a.loanId} style={{ ...styles.alert, borderLeftColor: severityPalette[TONE[a.priority]].bar }} data-ew-alert={a.loanId} data-ew-priority={a.priority}>
            <div style={styles.alertHead}>
              <span style={styles.alertLoan}>{a.loanId}{a.borrower ? ` · ${a.borrower}` : ''}</span>
              <span style={{ ...styles.priorityChip, background: severityPalette[TONE[a.priority]].bg, color: severityPalette[TONE[a.priority]].fg }}>
                {a.priority.toUpperCase()}
              </span>
            </div>
            <div style={styles.signals}>
              {a.signals.map((s) => (
                <span key={s.type} style={styles.signalChip} data-ew-signal={s.type}>{s.message}</span>
              ))}
            </div>
            <div style={styles.alertMeta}>
              {a.owner ? `Owner: ${a.owner} · ` : ''}Due {a.dueDate} (SLA {a.slaDays}d)
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Hero({ label, value, tone }: { label: string; value: string; tone?: 'clear' | 'blocked' | 'atRisk' }) {
  return (
    <div style={styles.hero} data-ew-hero={label}>
      <span style={styles.heroLabel}>{label}</span>
      <span style={{ ...styles.heroValue, color: !tone || tone === 'clear' || value === '0' ? palette.text : severityPalette[tone].bar }}>{value}</span>
    </div>
  );
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
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: spacing.xs, paddingTop: spacing.sm, borderTop: `1px solid ${palette.divider}` },
  alert: { display: 'flex', flexDirection: 'column', gap: 4, borderLeft: '3px solid', background: palette.surfaceAlt, borderRadius: radius.sm, padding: `${spacing.xs} ${spacing.md}` },
  alertHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  alertLoan: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: palette.text },
  priorityChip: { padding: `1px ${spacing.sm}`, borderRadius: radius.pill, fontSize: typography.size.xs, fontWeight: typography.weight.bold, letterSpacing: typography.letterSpacing.label },
  signals: { display: 'flex', flexWrap: 'wrap', gap: spacing.xs },
  signalChip: { padding: `1px ${spacing.sm}`, background: palette.surface, border: `1px solid ${palette.border}`, borderRadius: radius.sm, fontSize: typography.size.xs, color: palette.text },
  alertMeta: { fontSize: typography.size.xs, color: palette.textMuted },
};
