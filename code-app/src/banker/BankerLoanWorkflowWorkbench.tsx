import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBanker } from './BankerContext';
import { loadBankerWorkQueueData, type BankerWorkQueueData } from './workQueueQueries';
import { WORKSPACE_ROUTES } from '../bootstrap/workspaceRoutes';
import { Badge } from '../shared/Badge';
import { palette, radius, shadow, spacing, typography, type SeverityKey } from '../shared/theme';
import {
  deriveLoanWorkbench,
  rowsForSection,
  type WorkbenchModel,
  type WorkbenchRow,
} from './loanWorkbenchModel';

/**
 * Phase 260 — Loan Workflow (elite lending operating system).
 *
 * A premium loan workbench: a command header (New Deal / Add Existing Loan /
 * Open Portfolio + quick search), an executive work-queue card strip that
 * filters the table, and a rich deal table that opens the full deal command
 * center. The header / cards / table headers render synchronously so the
 * surface is never blank while data loads; empty states are polished and
 * actionable. No fabricated deals.
 */

interface Props {
  loadData?: (bankerId: string) => Promise<BankerWorkQueueData>;
  onOpenDeal?: (dealId: string) => void;
  /** Routes/focuses the New Deal create flow (header shortcut). */
  onNewDeal?: () => void;
  /** Scrolls to / opens the Existing Portfolio Loans section. */
  onAddExistingLoan?: () => void;
  now?: Date;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: BankerWorkQueueData }
  | { kind: 'failed'; message: string };

type QueueKey = 'active' | 'recent' | 'attention' | 'closing' | 'diligence' | 'boarding';

interface QueueSpec {
  readonly key: QueueKey;
  readonly label: string;
  readonly tone: SeverityKey;
}

const QUEUE: readonly QueueSpec[] = [
  { key: 'active', label: 'My Active Deals', tone: 'neutral' },
  { key: 'recent', label: 'Recently Created', tone: 'clear' },
  { key: 'attention', label: 'Needs Attention', tone: 'atRisk' },
  { key: 'closing', label: 'Closing Soon', tone: 'info' },
  { key: 'diligence', label: 'Due Diligence Pending', tone: 'neutral' },
  { key: 'boarding', label: 'Portfolio Boarding', tone: 'neutral' },
];

export function BankerLoanWorkflowWorkbench({
  loadData = loadBankerWorkQueueData,
  onOpenDeal,
  onNewDeal,
  onAddExistingLoan,
  now: nowOverride,
}: Props = {}) {
  const { bankerId, fullName } = useBanker();
  const navigate = useNavigate();
  const openDeal = onOpenDeal ?? ((id: string) => navigate(`/deals/${id}`));

  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [queue, setQueue] = useState<QueueKey>('active');
  const [query, setQuery] = useState('');

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

  const model: WorkbenchModel | undefined = useMemo(() => {
    if (state.kind !== 'ready') return undefined;
    return deriveLoanWorkbench(state.data.deals, state.data.tasks, fullName, now);
  }, [state, fullName, now]);

  const diligenceDealIds = useMemo(() => {
    if (state.kind !== 'ready') return new Set<string>();
    const ids = new Set<string>();
    for (const d of state.data.outstandingDocuments ?? []) ids.add(d.dealId);
    for (const d of state.data.pendingReviewDocuments ?? []) ids.add(d.dealId);
    return ids;
  }, [state]);

  const counts = useMemo(() => {
    const base = model?.counts ?? { active: 0, recent: 0, closing: 0, attention: 0 };
    const diligence = model ? model.rows.filter((r) => diligenceDealIds.has(r.id)).length : 0;
    return { ...base, diligence };
  }, [model, diligenceDealIds]);

  const visibleRows = useMemo(() => {
    if (!model) return [];
    let rows: readonly WorkbenchRow[];
    if (queue === 'diligence') rows = model.rows.filter((r) => diligenceDealIds.has(r.id));
    else if (queue === 'boarding') rows = model.rows;
    else rows = rowsForSection(model, queue);
    const q = query.trim().toLowerCase();
    if (q.length === 0) return rows;
    return rows.filter(
      (r) => r.name.toLowerCase().includes(q) || (r.borrower ?? '').toLowerCase().includes(q),
    );
  }, [model, queue, diligenceDealIds, query]);

  function handleQueue(key: QueueKey) {
    if (key === 'boarding') {
      onAddExistingLoan?.();
      return;
    }
    setQueue(key);
  }

  return (
    <section style={styles.wrap} aria-label="Loan Workflow" data-loan-workbench="workspace">
      {/* Command header */}
      <header style={styles.header} data-loan-header>
        <div style={styles.headerLeft}>
          <h1 style={styles.title}>Loan Workflow</h1>
          <p style={styles.subtitle}>Work active deals from intake through closing and portfolio boarding.</p>
        </div>
        <div style={styles.headerActions}>
          <button type="button" style={styles.primaryBtn} data-loan-action-new-deal onClick={() => onNewDeal?.()}>
            + New Deal
          </button>
          <button type="button" style={styles.secondaryBtn} data-loan-action-add-existing onClick={() => onAddExistingLoan?.()}>
            Add Existing Loan
          </button>
          <a href={WORKSPACE_ROUTES.manager} style={styles.linkBtn} data-loan-action-open-portfolio>
            Open Portfolio
          </a>
        </div>
      </header>

      {/* Quick search */}
      <div style={styles.commandBar}>
        <label style={styles.search} aria-label="Search deals">
          <span style={styles.searchIcon} aria-hidden="true">⌕</span>
          <input
            style={styles.searchInput}
            placeholder="Search by deal, borrower, or loan number…"
            value={query}
            data-loan-search
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>

      {/* Executive work-queue cards */}
      <div style={styles.queueRow} data-loan-queue>
        {QUEUE.map((q) => {
          const value = q.key === 'boarding' ? undefined : (counts as Record<string, number>)[q.key];
          const active = q.key === queue;
          return (
            <button
              key={q.key}
              type="button"
              style={active ? styles.queueCardActive : styles.queueCard}
              data-loan-queue-card={q.key}
              aria-pressed={active}
              onClick={() => handleQueue(q.key)}
            >
              <span style={styles.queueLabel}>{q.label}</span>
              {q.key === 'boarding' ? (
                <span style={styles.queueCta}>Board a loan →</span>
              ) : state.kind === 'loading' ? (
                <span style={styles.queueSkeleton} aria-hidden="true" />
              ) : (
                <span style={styles.queueValue}>{value ?? 0}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Main table */}
      <div style={styles.main} data-loan-main>
        {state.kind === 'loading' && <Skeleton />}
        {state.kind === 'failed' && (
          <EmptyState
            heading="Your deals are taking a moment"
            guidance="We couldn't load your pipeline just now. Refresh to try again — nothing is lost."
            ctaLabel="Create a New Deal"
            onCta={onNewDeal}
          />
        )}
        {state.kind === 'ready' && model && visibleRows.length === 0 && (
          <EmptyState
            heading={emptyHeadingFor(queue)}
            guidance={emptyGuidanceFor(queue)}
            ctaLabel={queue === 'recent' || queue === 'active' ? 'Create a New Deal' : undefined}
            onCta={queue === 'recent' || queue === 'active' ? onNewDeal : undefined}
          />
        )}
        {state.kind === 'ready' && model && visibleRows.length > 0 && (
          <DealTable rows={visibleRows} onOpen={openDeal} now={now} />
        )}
      </div>
    </section>
  );
}

function DealTable({ rows, onOpen, now }: { rows: readonly WorkbenchRow[]; onOpen: (id: string) => void; now: Date }) {
  return (
    <table style={styles.table} data-loan-table>
      <thead>
        <tr>
          <th style={styles.th}>Deal</th>
          <th style={styles.th}>Borrower</th>
          <th style={styles.th}>Amount</th>
          <th style={styles.th}>Stage</th>
          <th style={styles.th}>Status</th>
          <th style={styles.th}>Banker</th>
          <th style={styles.th}>Next action</th>
          <th style={styles.th}>Last activity</th>
          <th style={styles.thRight}></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.id}
            style={styles.row}
            data-loan-row={r.id}
            role="button"
            tabIndex={0}
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
            <td style={styles.td}>{formatAmount(r.amount)}</td>
            <td style={styles.td}>{r.stage ?? 'Intake'}</td>
            <td style={styles.td}>{r.status ? <Badge variant="neutral" appearance="outline">{r.status}</Badge> : '—'}</td>
            <td style={styles.td}>{r.owner}</td>
            <td style={styles.td}>{r.nextAction}</td>
            <td style={styles.td}>{formatLastActivity(r.lastActivity, now)}</td>
            <td style={styles.tdRight}><span style={styles.continueLink}>Continue workflow →</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EmptyState({ heading, guidance, ctaLabel, onCta }: { heading: string; guidance: string; ctaLabel?: string; onCta?: () => void }) {
  return (
    <div style={styles.empty} data-loan-empty>
      <div style={styles.emptyMark} aria-hidden="true">◫</div>
      <div style={styles.emptyHeading}>{heading}</div>
      <p style={styles.emptyGuidance}>{guidance}</p>
      {ctaLabel && onCta && (
        <button type="button" style={styles.emptyCta} data-loan-empty-cta onClick={onCta}>{ctaLabel}</button>
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div style={styles.skeletonWrap} aria-hidden="true" data-loan-skeleton>
      {[0, 1, 2, 3, 4].map((i) => <div key={i} style={styles.skeletonRow} />)}
    </div>
  );
}

function emptyHeadingFor(q: QueueKey): string {
  switch (q) {
    case 'recent': return 'No recently created deals';
    case 'attention': return 'Nothing needs attention';
    case 'closing': return 'No deals closing soon';
    case 'diligence': return 'No due diligence pending';
    default: return 'No active deals yet';
  }
}
function emptyGuidanceFor(q: QueueKey): string {
  switch (q) {
    case 'recent': return 'Create a New Deal to begin intake — it will appear here right after it’s created.';
    case 'attention': return 'No stale, overdue, or past-due deals right now. Nice work.';
    case 'closing': return 'No deals have a target close within 14 days.';
    case 'diligence': return 'No deals are waiting on outstanding or pending-review documents.';
    default: return 'Deals assigned to you appear here. Create a New Deal to begin intake.';
  }
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
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.lg, padding: `${spacing.lg} ${spacing.xl}`, background: palette.primaryBg, border: `1px solid ${palette.panelBorder}`, borderRadius: radius.lg, boxShadow: shadow.card, flexWrap: 'wrap' },
  headerLeft: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 },
  title: { margin: 0, fontSize: typography.size.display, fontWeight: typography.weight.bold, color: palette.text, letterSpacing: typography.letterSpacing.hero, lineHeight: 1.05 },
  subtitle: { margin: 0, color: palette.textMuted, fontSize: typography.size.md },
  headerActions: { display: 'flex', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  primaryBtn: { background: palette.cobalt, color: palette.cobaltFg, border: 'none', borderRadius: radius.sm, padding: `${spacing.xs} ${spacing.md}`, fontSize: typography.size.sm, fontWeight: typography.weight.bold, fontFamily: typography.family, cursor: 'pointer' },
  secondaryBtn: { background: palette.surface, color: palette.text, border: `1px solid ${palette.border}`, borderRadius: radius.sm, padding: `${spacing.xs} ${spacing.md}`, fontSize: typography.size.sm, fontWeight: typography.weight.semibold, fontFamily: typography.family, cursor: 'pointer' },
  linkBtn: { background: palette.surface, color: palette.cobalt, border: `1px solid ${palette.border}`, borderRadius: radius.sm, padding: `${spacing.xs} ${spacing.md}`, fontSize: typography.size.sm, fontWeight: typography.weight.semibold, fontFamily: typography.family, textDecoration: 'none', display: 'inline-block' },
  commandBar: { display: 'flex', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' },
  search: { display: 'inline-flex', alignItems: 'center', gap: spacing.xs, padding: `${spacing.xs} ${spacing.md}`, background: palette.surface, border: `1px solid ${palette.border}`, borderRadius: radius.pill, minWidth: 320, flex: 1, maxWidth: 520 },
  searchIcon: { color: palette.textSubtle, fontSize: typography.size.md },
  searchInput: { flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: typography.size.sm, color: palette.text, fontFamily: typography.family },
  queueRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: spacing.sm },
  queueCard: { display: 'flex', flexDirection: 'column', gap: 6, padding: `${spacing.md} ${spacing.lg}`, background: palette.surface, border: `1px solid ${palette.panelBorder}`, borderRadius: radius.md, boxShadow: shadow.card, textAlign: 'left', fontFamily: typography.family, cursor: 'pointer', minHeight: 84 },
  queueCardActive: { display: 'flex', flexDirection: 'column', gap: 6, padding: `${spacing.md} ${spacing.lg}`, background: palette.cobaltBg, border: `1px solid ${palette.cobalt}`, borderRadius: radius.md, boxShadow: shadow.card, textAlign: 'left', fontFamily: typography.family, cursor: 'pointer', minHeight: 84 },
  queueLabel: { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.bold },
  queueValue: { fontSize: typography.size.xxl, fontWeight: typography.weight.bold, color: palette.text, fontVariantNumeric: 'tabular-nums' },
  queueCta: { fontSize: typography.size.sm, color: palette.cobalt, fontWeight: typography.weight.semibold },
  queueSkeleton: { width: 40, height: 22, borderRadius: radius.sm, background: palette.surfaceAlt },
  main: { minHeight: 220 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: typography.size.sm, background: palette.surface, border: `1px solid ${palette.panelBorder}`, borderRadius: radius.md, boxShadow: shadow.card, overflow: 'hidden' },
  th: { textAlign: 'left', padding: `${spacing.sm} ${spacing.md}`, color: palette.textSubtle, textTransform: 'uppercase', fontSize: typography.size.xs, letterSpacing: typography.letterSpacing.label, borderBottom: `1px solid ${palette.divider}` },
  thRight: { padding: `${spacing.sm} ${spacing.md}`, borderBottom: `1px solid ${palette.divider}` },
  row: { cursor: 'pointer', borderBottom: `1px solid ${palette.divider}` },
  td: { padding: `${spacing.sm} ${spacing.md}`, color: palette.text, borderBottom: `1px solid ${palette.divider}` },
  tdStrong: { padding: `${spacing.sm} ${spacing.md}`, color: palette.text, fontWeight: typography.weight.semibold, borderBottom: `1px solid ${palette.divider}` },
  tdRight: { padding: `${spacing.sm} ${spacing.md}`, color: palette.text, borderBottom: `1px solid ${palette.divider}`, textAlign: 'right' },
  continueLink: { color: palette.cobalt, fontWeight: typography.weight.semibold, whiteSpace: 'nowrap' },
  empty: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: spacing.xs, textAlign: 'center', padding: `${spacing.xxl} ${spacing.xl}`, background: palette.surface, border: `1px dashed ${palette.border}`, borderRadius: radius.md },
  emptyMark: { fontSize: 34, color: palette.textSubtle },
  emptyHeading: { fontSize: typography.size.lg, fontWeight: typography.weight.bold, color: palette.text },
  emptyGuidance: { margin: 0, color: palette.textMuted, fontSize: typography.size.sm, maxWidth: 460, lineHeight: typography.lineHeight.snug },
  emptyCta: { marginTop: spacing.sm, background: palette.cobalt, color: palette.cobaltFg, border: 'none', borderRadius: radius.sm, padding: `${spacing.xs} ${spacing.lg}`, fontSize: typography.size.sm, fontWeight: typography.weight.bold, fontFamily: typography.family, cursor: 'pointer' },
  skeletonWrap: { display: 'flex', flexDirection: 'column', gap: spacing.xs },
  skeletonRow: { height: 44, borderRadius: radius.sm, background: palette.surfaceAlt, border: `1px solid ${palette.divider}` },
};
