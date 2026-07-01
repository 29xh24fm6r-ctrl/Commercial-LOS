import type { CSSProperties } from 'react';
import { palette, radius, severityPalette, shadow, spacing, typography } from '../../shared/theme';
import { formatCurrency } from '../../shared/formatters';
import type { WatchlistBoard, WatchlistEntry } from './watchlist';

/**
 * Phase PE-7 — problem-credit / watchlist board.
 *
 * Read-only over a `WatchlistBoard`: criticized / classified totals, exposure,
 * overdue action plans, the classification groups (worst-first), and the aged
 * entries. Honest absence when the watchlist is clear.
 */

interface Props {
  readonly board?: WatchlistBoard;
}

const MONEY = { abbreviate: true, empty: '—' } as const;

const TONE: Record<WatchlistEntry['classification'], 'info' | 'atRisk' | 'blocked'> = {
  Pass: 'info', // never on the watchlist, but part of the classification union
  Watch: 'info',
  'Special Mention': 'info',
  Substandard: 'atRisk',
  Doubtful: 'blocked',
  Loss: 'blocked',
};

export function WatchlistBoardPanel({ board }: Props) {
  if (!board || board.entries.length === 0) {
    return (
      <section style={styles.wrap} aria-label="Watchlist" data-watchlist="empty">
        <header style={styles.head}>
          <h3 style={styles.title}>Watchlist</h3>
        </header>
        <p style={styles.guidance}>
          No criticized or classified credits. As loans are downgraded (Special Mention and worse) or flagged
          for watch, they appear here grouped by classification with action plans and aging.
        </p>
      </section>
    );
  }

  const b = board;

  return (
    <section style={styles.wrap} aria-label="Watchlist" data-watchlist="ready">
      <header style={styles.head}>
        <h3 style={styles.title}>Watchlist</h3>
        <span style={styles.meta} data-watchlist-count>{b.criticizedCount} criticized · {b.classifiedCount} classified</span>
      </header>

      <div style={styles.heroRow}>
        <Hero label="Exposure" value={formatCurrency(b.totalExposure, MONEY)} />
        <Hero label="Classified" value={String(b.classifiedCount)} tone={b.classifiedCount > 0 ? 'blocked' : 'clear'} />
        <Hero label="Action plans overdue" value={String(b.actionPlansOverdue)} tone={b.actionPlansOverdue > 0 ? 'atRisk' : 'clear'} />
      </div>

      <div style={styles.groups} data-watchlist-groups>
        {b.groups.map((g) => (
          <span key={g.classification} style={{ ...styles.groupChip, borderColor: severityPalette[TONE[g.classification]].bar }} data-watchlist-group={g.classification}>
            {g.classification}: {g.count} · {formatCurrency(g.exposure, MONEY)}
          </span>
        ))}
      </div>

      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Loan</th>
            <th style={styles.th}>Borrower</th>
            <th style={styles.th}>Classification</th>
            <th style={styles.thNum}>Exposure</th>
            <th style={styles.thNum}>Aged</th>
            <th style={styles.th}>Action plan</th>
          </tr>
        </thead>
        <tbody>
          {b.entries.slice(0, 50).map((e) => (
            <tr key={e.loanId} style={styles.tr} data-watchlist-entry={e.loanId}>
              <td style={styles.td}>{e.loanId}</td>
              <td style={styles.td}>{e.borrower ?? '—'}</td>
              <td style={styles.td}>
                <span style={{ ...styles.classChip, background: severityPalette[TONE[e.classification]].bg, color: severityPalette[TONE[e.classification]].fg }}>
                  {e.classification}
                </span>
              </td>
              <td style={styles.tdNum}>{formatCurrency(e.exposure, MONEY)}</td>
              <td style={styles.tdNum}>{e.agedDays !== undefined ? `${e.agedDays}d` : '—'}</td>
              <td style={{ ...styles.td, color: e.actionPlanOverdue ? severityPalette.blocked.bar : palette.text }}>
                {e.actionPlan ? `${cap(e.actionPlan.status)}${e.actionPlanOverdue ? ' · overdue' : ''}` : 'None'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Hero({ label, value, tone }: { label: string; value: string; tone?: 'clear' | 'blocked' | 'atRisk' }) {
  return (
    <div style={styles.hero} data-watchlist-hero={label}>
      <span style={styles.heroLabel}>{label}</span>
      <span style={{ ...styles.heroValue, color: !tone || tone === 'clear' || value === '0' ? palette.text : severityPalette[tone].bar }}>{value}</span>
    </div>
  );
}

function cap(s: string): string {
  return s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
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
  groups: { display: 'flex', flexWrap: 'wrap', gap: spacing.xs, paddingTop: spacing.sm, borderTop: `1px solid ${palette.divider}` },
  groupChip: { padding: `2px ${spacing.sm}`, border: '1px solid', borderRadius: radius.pill, fontSize: typography.size.xs, fontWeight: typography.weight.semibold, color: palette.text },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: typography.size.sm },
  th: { textAlign: 'left', padding: `${spacing.xs} ${spacing.sm}`, color: palette.textSubtle, textTransform: 'uppercase', fontSize: typography.size.xs, letterSpacing: typography.letterSpacing.label, borderBottom: `1px solid ${palette.divider}` },
  thNum: { textAlign: 'right', padding: `${spacing.xs} ${spacing.sm}`, color: palette.textSubtle, textTransform: 'uppercase', fontSize: typography.size.xs, letterSpacing: typography.letterSpacing.label, borderBottom: `1px solid ${palette.divider}` },
  tr: { borderBottom: `1px solid ${palette.divider}` },
  td: { padding: `${spacing.xs} ${spacing.sm}`, color: palette.text },
  tdNum: { padding: `${spacing.xs} ${spacing.sm}`, color: palette.text, textAlign: 'right', fontFamily: typography.mono },
  classChip: { padding: `1px ${spacing.sm}`, borderRadius: radius.pill, fontSize: typography.size.xs, fontWeight: typography.weight.bold },
};
