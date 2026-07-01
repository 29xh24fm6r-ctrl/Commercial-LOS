import type { CSSProperties } from 'react';
import { palette, radius, severityPalette, shadow, spacing, typography } from '../../shared/theme';
import { formatCurrency } from '../../shared/formatters';
import type { MigrationReconciliation, ReconciliationDelta } from './bookReconciliation';

/**
 * Phase PE-2 — Migration reconciliation / book tie-out panel.
 *
 * Read-only surface over the pure `deriveMigrationReconciliation` result: a hero
 * tie-out tile ("342 / 342 loans · $X / $X · TIED" or the signed delta), the
 * per-segment breakdown, and the two orphan lists. It also blocks a "migration
 * complete" assertion until the batch actually ties.
 *
 * Honest absence: with no reconciliation recorded yet, it renders guidance
 * (record controls + provision the entity) rather than a fabricated "0 / 0 TIED".
 */

interface Props {
  /** The tie-out result. Omit until an operator has recorded controls for a batch. */
  readonly reconciliation?: MigrationReconciliation;
  /** Human label for the batch (defaults to the batch id). */
  readonly batchLabel?: string;
}

const MONEY = { abbreviate: true, empty: '$0' } as const;

/** Compact one-line tie-out summary for a tile/badge. */
export function formatTieOutSummary(r: MigrationReconciliation): string {
  const loans = `${r.count.boarded} / ${r.count.control} loans`;
  const dollars = `${formatCurrency(r.outstanding.boarded, MONEY)} / ${formatCurrency(r.outstanding.control, MONEY)}`;
  const verdict = r.status === 'tied' ? 'TIED' : 'OUT OF BALANCE';
  return `${loans} · ${dollars} · ${verdict}`;
}

function signed(n: number): string {
  return n > 0 ? `+${n.toLocaleString()}` : n.toLocaleString();
}

function signedMoney(n: number): string {
  const base = formatCurrency(Math.abs(n), MONEY);
  return n > 0 ? `+${base}` : n < 0 ? `−${base}` : base;
}

export function MigrationReconciliationPanel({ reconciliation, batchLabel }: Props) {
  if (!reconciliation) {
    return (
      <section style={styles.wrap} aria-label="Book tie-out" data-migration-reconciliation="empty">
        <header style={styles.head}>
          <h3 style={styles.title}>Book tie-out</h3>
        </header>
        <p style={styles.guidance}>
          No migration control recorded yet. Enter the source-system loan count and aggregate outstanding
          for a batch to reconcile the boarded book. A migration is not complete until it ties.
        </p>
        <p style={styles.subtle}>
          Requires the <code>cr664_portfoliomigrationcontrol</code> entity and the additive{' '}
          <code>cr664_migrationbatchid</code> column to be provisioned.
        </p>
      </section>
    );
  }

  const r = reconciliation;
  const tied = r.status === 'tied';
  const tone = tied ? 'clear' : 'blocked';

  return (
    <section style={styles.wrap} aria-label="Book tie-out" data-migration-reconciliation={r.status}>
      <header style={styles.head}>
        <h3 style={styles.title}>Book tie-out</h3>
        <span style={styles.batch} data-migration-batch>{batchLabel ?? r.batchId}</span>
      </header>

      <div
        style={{ ...styles.hero, borderColor: severityPalette[tone].bar }}
        data-migration-tieout-tile
      >
        <span
          style={{ ...styles.verdict, background: severityPalette[tone].bg, color: severityPalette[tone].fg }}
          data-migration-verdict={r.status}
        >
          {tied ? 'TIED' : 'OUT OF BALANCE'}
        </span>
        <div style={styles.heroSummary} data-migration-summary>
          {formatTieOutSummary(r)}
        </div>
      </div>

      <div style={styles.deltaRow}>
        <DeltaCard label="Loan count" delta={r.count} format={(n) => n.toLocaleString()} formatDelta={signed} />
        <DeltaCard
          label="Outstanding principal"
          delta={r.outstanding}
          format={(n) => formatCurrency(n, MONEY)}
          formatDelta={signedMoney}
        />
      </div>

      {r.segments.length > 0 && (
        <div style={styles.section} data-migration-segments>
          <div style={styles.sectionTitle}>By segment</div>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Segment</th>
                <th style={styles.thNum}>Count (boarded / control)</th>
                <th style={styles.thNum}>Δ</th>
                <th style={styles.thNum}>Outstanding (boarded / control)</th>
                <th style={styles.thNum}>Δ</th>
              </tr>
            </thead>
            <tbody>
              {r.segments.map((s) => (
                <tr key={s.segment} data-migration-segment={s.segment} data-segment-status={s.status}>
                  <td style={styles.td}>{s.segment}</td>
                  <td style={styles.tdNum}>{s.count.boarded} / {s.count.control}</td>
                  <td style={{ ...styles.tdNum, color: s.count.delta === 0 ? palette.textMuted : severityPalette.blocked.bar }}>
                    {signed(s.count.delta)}
                  </td>
                  <td style={styles.tdNum}>
                    {formatCurrency(s.outstanding.boarded, MONEY)} / {formatCurrency(s.outstanding.control, MONEY)}
                  </td>
                  <td style={{ ...styles.tdNum, color: s.outstanding.delta === 0 ? palette.textMuted : severityPalette.blocked.bar }}>
                    {signedMoney(s.outstanding.delta)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(r.boardedNotInControl.length > 0 || r.inControlNotBoarded.length > 0) && (
        <div style={styles.section} data-migration-orphans>
          {r.inControlNotBoarded.length > 0 && (
            <OrphanList
              testId="in-control-not-boarded"
              label={`Still owed — in control, not yet boarded (${r.inControlNotBoarded.length})`}
              items={r.inControlNotBoarded}
            />
          )}
          {r.boardedNotInControl.length > 0 && (
            <OrphanList
              testId="boarded-not-in-control"
              label={`Over-boarded — boarded, not in control (${r.boardedNotInControl.length})`}
              items={r.boardedNotInControl}
            />
          )}
        </div>
      )}

      <div
        style={{ ...styles.gate, background: tied ? palette.clearBg : palette.atRiskBg }}
        role="note"
        data-migration-complete-allowed={tied ? 'true' : 'false'}
      >
        {tied
          ? 'Reconciled — this batch ties and may be marked migration-complete.'
          : 'Blocked — resolve the deltas above before this batch can be marked migration-complete.'}
      </div>
    </section>
  );
}

function DeltaCard({
  label,
  delta,
  format,
  formatDelta,
}: {
  label: string;
  delta: ReconciliationDelta;
  format: (n: number) => string;
  formatDelta: (n: number) => string;
}) {
  const off = delta.delta !== 0;
  return (
    <div style={styles.deltaCard} data-migration-delta={label}>
      <span style={styles.deltaLabel}>{label}</span>
      <span style={styles.deltaValue}>
        {format(delta.boarded)} <span style={styles.deltaVs}>/ {format(delta.control)}</span>
      </span>
      <span style={{ ...styles.deltaChip, color: off ? severityPalette.blocked.bar : palette.textMuted }}>
        Δ {formatDelta(delta.delta)}
      </span>
    </div>
  );
}

function OrphanList({ testId, label, items }: { testId: string; label: string; items: readonly string[] }) {
  return (
    <div style={styles.orphanGroup} data-migration-orphan-list={testId}>
      <div style={styles.orphanLabel}>{label}</div>
      <div style={styles.orphanChips}>
        {items.map((it) => (
          <span key={it} style={styles.orphanChip} data-orphan-item={it}>{it}</span>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: spacing.sm, background: palette.surface, border: `1px solid ${palette.panelBorder}`, borderRadius: radius.md, boxShadow: shadow.card, padding: `${spacing.md} ${spacing.lg}` },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.sm },
  title: { margin: 0, fontSize: typography.size.lg, fontWeight: typography.weight.bold, color: palette.text },
  batch: { fontSize: typography.size.xs, color: palette.textSubtle, fontFamily: typography.mono, letterSpacing: typography.letterSpacing.label },
  guidance: { margin: 0, color: palette.text, fontSize: typography.size.sm, lineHeight: typography.lineHeight.snug },
  subtle: { margin: 0, color: palette.textMuted, fontSize: typography.size.xs },
  hero: { display: 'flex', alignItems: 'center', gap: spacing.md, border: '2px solid', borderRadius: radius.md, padding: `${spacing.sm} ${spacing.md}`, flexWrap: 'wrap' },
  verdict: { padding: `2px ${spacing.sm}`, borderRadius: radius.pill, fontSize: typography.size.xs, fontWeight: typography.weight.bold, letterSpacing: typography.letterSpacing.label },
  heroSummary: { fontSize: typography.size.md, fontWeight: typography.weight.semibold, color: palette.text, fontFamily: typography.mono },
  deltaRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: spacing.sm },
  deltaCard: { display: 'flex', flexDirection: 'column', gap: 2, background: palette.surfaceAlt, border: `1px solid ${palette.divider}`, borderRadius: radius.sm, padding: `${spacing.sm} ${spacing.md}` },
  deltaLabel: { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.bold },
  deltaValue: { fontSize: typography.size.md, fontWeight: typography.weight.bold, color: palette.text, fontFamily: typography.mono },
  deltaVs: { color: palette.textMuted, fontWeight: typography.weight.semibold },
  deltaChip: { fontSize: typography.size.xs, fontWeight: typography.weight.bold, fontFamily: typography.mono },
  section: { display: 'flex', flexDirection: 'column', gap: spacing.xs, paddingTop: spacing.sm, borderTop: `1px solid ${palette.divider}` },
  sectionTitle: { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.bold },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: typography.size.sm },
  th: { textAlign: 'left', padding: `${spacing.xs} ${spacing.sm}`, color: palette.textSubtle, textTransform: 'uppercase', fontSize: typography.size.xs, letterSpacing: typography.letterSpacing.label, borderBottom: `1px solid ${palette.divider}` },
  thNum: { textAlign: 'right', padding: `${spacing.xs} ${spacing.sm}`, color: palette.textSubtle, textTransform: 'uppercase', fontSize: typography.size.xs, letterSpacing: typography.letterSpacing.label, borderBottom: `1px solid ${palette.divider}` },
  td: { padding: `${spacing.xs} ${spacing.sm}`, color: palette.text, borderBottom: `1px solid ${palette.divider}` },
  tdNum: { padding: `${spacing.xs} ${spacing.sm}`, color: palette.text, borderBottom: `1px solid ${palette.divider}`, textAlign: 'right', fontFamily: typography.mono },
  orphanGroup: { display: 'flex', flexDirection: 'column', gap: spacing.xs },
  orphanLabel: { fontSize: typography.size.xs, color: palette.textSubtle, fontWeight: typography.weight.semibold },
  orphanChips: { display: 'flex', flexWrap: 'wrap', gap: spacing.xs },
  orphanChip: { padding: `2px ${spacing.sm}`, background: palette.surfaceAlt, border: `1px solid ${palette.border}`, borderRadius: radius.sm, fontSize: typography.size.xs, fontFamily: typography.mono, color: palette.text },
  gate: { borderRadius: radius.sm, padding: `${spacing.sm} ${spacing.md}`, fontSize: typography.size.sm, color: palette.text },
};
