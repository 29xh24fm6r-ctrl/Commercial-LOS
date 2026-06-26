import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBanker } from './BankerContext';
import { loadBankerWorkQueueData, type BankerWorkQueueData } from './workQueueQueries';
import { Badge } from '../shared/Badge';
import { palette, radius, shadow, spacing, typography } from '../shared/theme';
import {
  deriveLoanWorkbench,
  rowsForSection,
  WORKBENCH_SECTIONS,
  type WorkbenchSectionKey,
  type WorkbenchRow,
} from './loanWorkbenchModel';

/**
 * Phase 258 — Loan Workflow lending workbench.
 *
 * A clear lending workbench (not a status board): four sections (My Active
 * Deals, Recently Created, Closing Soon, Needs Attention) over a deal table
 * showing name, borrower, stage, status, amount, owner, next action, and last
 * activity. Opening a deal routes to its Loan Workflow Command Center
 * (/deals/:id). All values come from the banker's authorized data — no
 * fabricated rows.
 */

interface Props {
  /** Injected for tests; defaults to the live banker work-queue read. */
  loadData?: (bankerId: string) => Promise<BankerWorkQueueData>;
  /** Injected for tests; defaults to react-router navigation to the deal. */
  onOpenDeal?: (dealId: string) => void;
  /** Test override for "now". */
  now?: Date;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: BankerWorkQueueData }
  | { kind: 'failed'; message: string };

export function BankerLoanWorkflowWorkbench({
  loadData = loadBankerWorkQueueData,
  onOpenDeal,
  now: nowOverride,
}: Props = {}) {
  const { bankerId, fullName } = useBanker();
  const navigate = useNavigate();
  const openDeal = onOpenDeal ?? ((id: string) => navigate(`/deals/${id}`));

  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [section, setSection] = useState<WorkbenchSectionKey>('active');

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    loadData(bankerId)
      .then((data) => {
        if (!cancelled) setState({ kind: 'ready', data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({ kind: 'failed', message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [loadData, bankerId]);

  const now = useMemo(() => nowOverride ?? new Date(), [nowOverride]);
  const model = useMemo(() => {
    if (state.kind !== 'ready') return undefined;
    return deriveLoanWorkbench(state.data.deals, state.data.tasks, fullName, now);
  }, [state, fullName, now]);

  const rows = model ? rowsForSection(model, section) : [];

  return (
    <section style={styles.wrap} aria-label="Loan Workflow" data-loan-workbench="workspace">
      <header style={styles.head}>
        <h2 style={styles.title}>Loan Workflow</h2>
        <p style={styles.subtitle}>
          Your lending workbench. Open a deal to manage its full loan workflow.
        </p>
      </header>

      {state.kind === 'loading' && <div style={styles.muted}>Loading your deals…</div>}
      {state.kind === 'failed' && (
        <div style={styles.failNote} role="alert" data-loan-workbench-failure>
          Your deals are not available right now. {state.message} Refresh to retry.
        </div>
      )}

      {state.kind === 'ready' && model && (
        <>
          <div style={styles.sectionCards} data-workbench-sections>
            {WORKBENCH_SECTIONS.map((spec) => {
              const active = spec.key === section;
              return (
                <button
                  key={spec.key}
                  type="button"
                  style={active ? styles.sectionCardActive : styles.sectionCard}
                  data-workbench-section={spec.key}
                  aria-pressed={active}
                  onClick={() => setSection(spec.key)}
                >
                  <span style={styles.sectionLabel}>{spec.label}</span>
                  <span style={styles.sectionValue}>{model.counts[spec.key]}</span>
                </button>
              );
            })}
          </div>

          {rows.length === 0 ? (
            <div style={styles.muted} data-workbench-empty>
              No deals in this view.
            </div>
          ) : (
            <DealTable rows={rows} onOpen={openDeal} now={now} />
          )}
        </>
      )}
    </section>
  );
}

function DealTable({
  rows,
  onOpen,
  now,
}: {
  rows: readonly WorkbenchRow[];
  onOpen: (id: string) => void;
  now: Date;
}) {
  return (
    <table style={styles.table} data-workbench-table>
      <thead>
        <tr>
          <th style={styles.th}>Deal</th>
          <th style={styles.th}>Borrower</th>
          <th style={styles.th}>Stage</th>
          <th style={styles.th}>Status</th>
          <th style={styles.th}>Amount</th>
          <th style={styles.th}>Owner</th>
          <th style={styles.th}>Next action</th>
          <th style={styles.th}>Last activity</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.id}
            style={styles.row}
            data-workbench-row={r.id}
            tabIndex={0}
            role="button"
            aria-label={`Open ${r.name}`}
            onClick={() => onOpen(r.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpen(r.id);
              }
            }}
          >
            <td style={styles.tdStrong}>{r.name}</td>
            <td style={styles.td}>{r.borrower ?? '—'}</td>
            <td style={styles.td}>{r.stage ?? 'Not set'}</td>
            <td style={styles.td}>
              {r.status ? (
                <Badge variant="neutral" appearance="outline">
                  {r.status}
                </Badge>
              ) : (
                '—'
              )}
            </td>
            <td style={styles.td}>{formatAmount(r.amount)}</td>
            <td style={styles.td}>{r.owner}</td>
            <td style={styles.td}>{r.nextAction}</td>
            <td style={styles.td}>{formatLastActivity(r.lastActivity, now)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function formatAmount(amount: number | undefined): string {
  if (amount === undefined || Number.isNaN(amount)) return 'Not set';
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount.toLocaleString()}`;
}

function formatLastActivity(iso: string | undefined, now: Date): string {
  if (!iso) return 'No activity yet';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 'No activity yet';
  const days = Math.floor((now.getTime() - t) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: spacing.lg, width: '100%' },
  head: { display: 'flex', flexDirection: 'column', gap: 2 },
  title: { margin: 0, fontSize: typography.size.xl, fontWeight: typography.weight.bold, color: palette.text, letterSpacing: typography.letterSpacing.heading },
  subtitle: { margin: 0, color: palette.textMuted, fontSize: typography.size.sm, lineHeight: typography.lineHeight.snug },
  muted: { color: palette.textMuted, fontSize: typography.size.sm, fontStyle: 'italic', padding: `${spacing.md} 0` },
  failNote: {
    background: palette.surfaceAlt,
    border: `1px solid ${palette.borderStrong}`,
    borderRadius: radius.sm,
    padding: `${spacing.sm} ${spacing.md}`,
    color: palette.text,
    fontSize: typography.size.sm,
  },
  sectionCards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: spacing.sm },
  sectionCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: `${spacing.md} ${spacing.lg}`,
    background: palette.surface,
    border: `1px solid ${palette.panelBorder}`,
    borderRadius: radius.md,
    boxShadow: shadow.card,
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: typography.family,
  },
  sectionCardActive: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: `${spacing.md} ${spacing.lg}`,
    background: palette.cobaltBg,
    border: `1px solid ${palette.cobalt}`,
    borderRadius: radius.md,
    boxShadow: shadow.card,
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: typography.family,
  },
  sectionLabel: { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold },
  sectionValue: { fontSize: typography.size.xxl, fontWeight: typography.weight.bold, color: palette.text, fontVariantNumeric: 'tabular-nums' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: typography.size.sm, background: palette.surface, border: `1px solid ${palette.panelBorder}`, borderRadius: radius.md, boxShadow: shadow.card },
  th: {
    textAlign: 'left',
    padding: `${spacing.sm} ${spacing.md}`,
    color: palette.textSubtle,
    textTransform: 'uppercase',
    fontSize: typography.size.xs,
    letterSpacing: typography.letterSpacing.label,
    borderBottom: `1px solid ${palette.divider}`,
  },
  row: { cursor: 'pointer', borderBottom: `1px solid ${palette.divider}` },
  td: { padding: `${spacing.sm} ${spacing.md}`, color: palette.text, borderBottom: `1px solid ${palette.divider}` },
  tdStrong: { padding: `${spacing.sm} ${spacing.md}`, color: palette.text, fontWeight: typography.weight.semibold, borderBottom: `1px solid ${palette.divider}` },
};
