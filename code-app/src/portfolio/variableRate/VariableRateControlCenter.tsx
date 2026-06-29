import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { palette, radius, shadow, spacing, typography } from '../../shared/theme';
import { Badge } from '../../shared/Badge';
import { formatPercent, formatDate } from '../../shared/formatters';
import { loadBoardedLoans } from '../../portfolioBoarding/boardedLoansList';
import {
  RATE_INDEX_TYPES,
  buildRateIndexBook,
  type RateIndexType,
  type RateIndexValue,
} from './rateIndexModel';
import {
  deriveVariableRateRows,
  deriveRateAlerts,
  type VariableRateLoanInput,
  type VariableRateRow,
} from './variableRateModel';

/**
 * Phase 262 (E/F/G) — Variable Rate Control Center.
 *
 * Lists every variable / adjustable loan with its index, spread, current note
 * rate, fully-indexed rate, floor/ceiling status, next reset, and the rate
 * actions required. There is no live rate feed, so the operator enters the
 * current index values (Prime / SOFR / 5-Year Treasury / Other) with an
 * effective date + source — those drive the fully-indexed-rate computation. No
 * fabricated rates. Renders a useful empty state when there are no variable
 * loans yet.
 */

interface Props {
  /** Injected for tests; defaults to the live boarded-loan read mapped to inputs. */
  readonly loadLoans?: () => Promise<readonly VariableRateLoanInput[]>;
  readonly now?: Date;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; loans: readonly VariableRateLoanInput[] }
  | { kind: 'failed'; message: string };

interface IndexEntry {
  value: string;
  effectiveDate: string;
  source: string;
}

async function liveLoadLoans(): Promise<readonly VariableRateLoanInput[]> {
  const rows = await loadBoardedLoans();
  return rows.map((r) => ({
    loanNumber: r.loanNumber ?? r.id,
    borrower: r.borrower,
    interestRateType: r.interestRateType,
    index: r.index,
    spread: r.spread,
    currentNoteRate: undefined, // not a persisted column yet
    floor: r.floor,
    ceiling: r.ceiling,
    nextRateChangeDate: undefined, // not a persisted column yet
  }));
}

export function VariableRateControlCenter({ loadLoans = liveLoadLoans, now: nowOverride }: Props = {}) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [entries, setEntries] = useState<Record<RateIndexType, IndexEntry>>(() =>
    Object.fromEntries(RATE_INDEX_TYPES.map((t) => [t, { value: '', effectiveDate: '', source: '' }])) as Record<RateIndexType, IndexEntry>,
  );

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    loadLoans()
      .then((loans) => {
        if (!cancelled) setState({ kind: 'ready', loans });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({ kind: 'failed', message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [loadLoans]);

  const now = useMemo(() => nowOverride ?? new Date(), [nowOverride]);

  const book = useMemo(() => {
    const values: RateIndexValue[] = [];
    for (const t of RATE_INDEX_TYPES) {
      const e = entries[t];
      const v = Number(e.value);
      if (e.value.trim().length > 0 && !Number.isNaN(v)) {
        values.push({ indexType: t, value: v, effectiveDate: e.effectiveDate || new Date(now).toISOString().slice(0, 10), source: e.source || 'manual entry' });
      }
    }
    return buildRateIndexBook(values);
  }, [entries, now]);

  const rows = useMemo(
    () => (state.kind === 'ready' ? deriveVariableRateRows(state.loans, book, now) : []),
    [state, book, now],
  );
  const alerts = useMemo(() => deriveRateAlerts(rows), [rows]);

  function setEntry(t: RateIndexType, field: keyof IndexEntry, value: string) {
    setEntries((s) => ({ ...s, [t]: { ...s[t], [field]: value } }));
  }

  return (
    <section style={styles.wrap} aria-label="Variable Rate Control Center" data-variable-rate="control-center">
      <header style={styles.header}>
        <div>
          <h2 style={styles.title}>Variable Rate Control Center</h2>
          <p style={styles.subtitle}>
            Monitor every variable and adjustable loan. Enter today’s index values to compute fully-indexed
            rates and surface reset and rate actions.
          </p>
        </div>
        <Badge variant="info" appearance="outline">{rows.length} variable loan{rows.length === 1 ? '' : 's'}</Badge>
      </header>

      {/* Operator-entered current index values (no live feed; no fabricated rates) */}
      <div style={styles.indexPanel} data-variable-rate-index-panel>
        <div style={styles.indexPanelHead}>Current index values</div>
        <div style={styles.indexGrid}>
          {RATE_INDEX_TYPES.map((t) => (
            <div key={t} style={styles.indexCard} data-variable-rate-index={t}>
              <span style={styles.indexLabel}>{t}</span>
              <div style={styles.indexInputs}>
                <input
                  style={styles.indexInput}
                  type="number"
                  step="0.01"
                  placeholder="Rate %"
                  value={entries[t].value}
                  data-variable-rate-index-value={t}
                  onChange={(e) => setEntry(t, 'value', e.target.value)}
                />
                <input
                  style={styles.indexInput}
                  type="date"
                  value={entries[t].effectiveDate}
                  aria-label={`${t} effective date`}
                  data-variable-rate-index-date={t}
                  onChange={(e) => setEntry(t, 'effectiveDate', e.target.value)}
                />
                <input
                  style={styles.indexInput}
                  type="text"
                  placeholder="Source"
                  value={entries[t].source}
                  aria-label={`${t} source`}
                  data-variable-rate-index-source={t}
                  onChange={(e) => setEntry(t, 'source', e.target.value)}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div style={styles.alerts} data-variable-rate-alerts>
          <div style={styles.alertsHead}>Rate actions ({alerts.length})</div>
          <ul style={styles.alertList}>
            {alerts.slice(0, 50).map((a, i) => (
              <li key={`${a.loanNumber}-${a.type}-${i}`} style={styles.alertItem} data-variable-rate-alert={a.type}>
                <Badge variant={a.severity === 'critical' ? 'atRisk' : a.severity === 'warning' ? 'info' : 'neutral'} appearance="outline">
                  {a.loanNumber}
                </Badge>{' '}
                {a.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Loan table / states */}
      {state.kind === 'loading' && <div style={styles.muted}>Loading variable-rate loans…</div>}
      {state.kind === 'failed' && (
        <div style={styles.failNote} role="alert" data-variable-rate-failure>
          Variable-rate loans are not available right now. {state.message} Refresh to retry.
        </div>
      )}
      {state.kind === 'ready' && rows.length === 0 && (
        <div style={styles.empty} data-variable-rate-empty>
          <div style={styles.emptyMark} aria-hidden="true">◷</div>
          <div style={styles.emptyHeading}>No variable-rate loans yet</div>
          <p style={styles.emptyGuidance}>
            Loans boarded as Variable or Adjustable appear here. Board an existing loan with an interest
            rate type of Variable/Adjustable, or import a portfolio file with rate terms.
          </p>
        </div>
      )}
      {state.kind === 'ready' && rows.length > 0 && <RateTable rows={rows} />}
    </section>
  );
}

function RateTable({ rows }: { rows: readonly VariableRateRow[] }) {
  return (
    <table style={styles.table} data-variable-rate-table>
      <thead>
        <tr>
          <th style={styles.th}>Loan #</th>
          <th style={styles.th}>Borrower</th>
          <th style={styles.th}>Index</th>
          <th style={styles.th}>Index value</th>
          <th style={styles.th}>Spread</th>
          <th style={styles.th}>Note rate</th>
          <th style={styles.th}>Fully indexed</th>
          <th style={styles.th}>Diff</th>
          <th style={styles.th}>Floor/Ceiling</th>
          <th style={styles.th}>Next reset</th>
          <th style={styles.th}>Reset due</th>
          <th style={styles.th}>Action</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.loanNumber} style={styles.row} data-variable-rate-row={r.loanNumber}>
            <td style={styles.tdStrong}>{r.loanNumber}</td>
            <td style={styles.td}>{r.borrower ?? '—'}</td>
            <td style={styles.td}>{r.indexType ?? 'Not provided'}</td>
            <td style={styles.td}>{formatPercent(r.indexValue, { empty: '—' })}</td>
            <td style={styles.td}>{formatPercent(r.spread, { empty: '—' })}</td>
            <td style={styles.td}>{formatPercent(r.currentNoteRate, { empty: '—' })}</td>
            <td style={styles.tdStrong}>{formatPercent(r.fullyIndexedRate, { empty: '—' })}</td>
            <td style={styles.td}>{r.difference === undefined ? '—' : `${r.difference > 0 ? '+' : ''}${r.difference.toFixed(2)}%`}</td>
            <td style={styles.td}>{floorCeilingLabel(r)}</td>
            <td style={styles.td}>{formatDate(r.nextResetDate, { empty: '—' })}</td>
            <td style={styles.td}>{resetDueLabel(r)}</td>
            <td style={styles.td}>
              {r.rateActionRequired ? <Badge variant="atRisk" appearance="outline">Action</Badge> : <Badge variant="clear" appearance="outline">OK</Badge>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function floorCeilingLabel(r: VariableRateRow): string {
  switch (r.floorCeilingStatus) {
    case 'at-floor': return 'At floor';
    case 'at-ceiling': return 'At ceiling';
    case 'within': return 'Within';
    default: return '—';
  }
}
function resetDueLabel(r: VariableRateRow): string {
  if (r.resetDueDays === undefined) return '—';
  if (r.resetDueDays < 0) return `Overdue ${Math.abs(r.resetDueDays)}d`;
  return `${r.resetDueDays}d`;
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: spacing.lg, width: '100%' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.md, flexWrap: 'wrap' },
  title: { margin: 0, fontSize: typography.size.xl, fontWeight: typography.weight.bold, color: palette.text },
  subtitle: { margin: `${spacing.xs} 0 0`, color: palette.textMuted, fontSize: typography.size.sm, maxWidth: 720, lineHeight: typography.lineHeight.snug },
  indexPanel: { background: palette.surface, border: `1px solid ${palette.panelBorder}`, borderRadius: radius.md, boxShadow: shadow.card, padding: `${spacing.md} ${spacing.lg}`, display: 'flex', flexDirection: 'column', gap: spacing.sm },
  indexPanelHead: { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.bold },
  indexGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: spacing.sm },
  indexCard: { display: 'flex', flexDirection: 'column', gap: 4, padding: spacing.sm, background: palette.surfaceAlt, border: `1px solid ${palette.divider}`, borderRadius: radius.sm },
  indexLabel: { fontSize: typography.size.sm, fontWeight: typography.weight.bold, color: palette.text },
  indexInputs: { display: 'flex', gap: 4, flexWrap: 'wrap' },
  indexInput: { flex: 1, minWidth: 64, padding: `${spacing.xs} ${spacing.sm}`, border: `1px solid ${palette.border}`, borderRadius: radius.sm, fontSize: typography.size.sm, fontFamily: typography.family },
  alerts: { background: palette.surface, border: `1px solid ${palette.panelBorder}`, borderRadius: radius.md, padding: `${spacing.sm} ${spacing.lg}` },
  alertsHead: { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.bold, marginBottom: spacing.xs },
  alertList: { margin: 0, paddingLeft: spacing.lg, display: 'flex', flexDirection: 'column', gap: 4 },
  alertItem: { fontSize: typography.size.sm, color: palette.text, lineHeight: typography.lineHeight.snug },
  muted: { color: palette.textMuted, fontSize: typography.size.sm, fontStyle: 'italic', padding: `${spacing.md} 0` },
  failNote: { background: palette.surfaceAlt, border: `1px solid ${palette.borderStrong}`, borderRadius: radius.sm, padding: `${spacing.sm} ${spacing.md}`, color: palette.text, fontSize: typography.size.sm },
  empty: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: spacing.xs, textAlign: 'center', padding: `${spacing.xxl} ${spacing.xl}`, background: palette.surface, border: `1px dashed ${palette.border}`, borderRadius: radius.md },
  emptyMark: { fontSize: 34, color: palette.textSubtle },
  emptyHeading: { fontSize: typography.size.lg, fontWeight: typography.weight.bold, color: palette.text },
  emptyGuidance: { margin: 0, color: palette.textMuted, fontSize: typography.size.sm, maxWidth: 460, lineHeight: typography.lineHeight.snug },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: typography.size.sm, background: palette.surface, border: `1px solid ${palette.panelBorder}`, borderRadius: radius.md, boxShadow: shadow.card, overflow: 'hidden' },
  th: { textAlign: 'left', padding: `${spacing.sm} ${spacing.md}`, color: palette.textSubtle, textTransform: 'uppercase', fontSize: typography.size.xs, letterSpacing: typography.letterSpacing.label, borderBottom: `1px solid ${palette.divider}`, whiteSpace: 'nowrap' },
  row: { borderBottom: `1px solid ${palette.divider}` },
  td: { padding: `${spacing.sm} ${spacing.md}`, color: palette.text, borderBottom: `1px solid ${palette.divider}`, whiteSpace: 'nowrap' },
  tdStrong: { padding: `${spacing.sm} ${spacing.md}`, color: palette.text, fontWeight: typography.weight.semibold, borderBottom: `1px solid ${palette.divider}`, whiteSpace: 'nowrap' },
};
