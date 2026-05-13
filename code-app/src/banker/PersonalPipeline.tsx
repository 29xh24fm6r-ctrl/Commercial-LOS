import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBanker } from './BankerContext';
import { loadBankerPipeline, type PipelineDeal } from './dealQueries';
import { LoadingState } from '../shared/LoadingState';
import { ErrorState } from '../shared/ErrorState';
import { Card, CardHeader } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { palette, radius, spacing, typography } from '../shared/theme';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; deals: PipelineDeal[] }
  | { kind: 'failed'; message: string };

const ALL = '__all__';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function PersonalPipeline() {
  const { bankerId } = useBanker();
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [stageFilter, setStageFilter] = useState<string>(ALL);
  const [statusFilter, setStatusFilter] = useState<string>(ALL);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    loadBankerPipeline(bankerId)
      .then((deals) => {
        if (!cancelled) setState({ kind: 'ready', deals });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setState({ kind: 'failed', message });
      });
    return () => {
      cancelled = true;
    };
  }, [bankerId]);

  const derived = useMemo(() => {
    if (state.kind !== 'ready') {
      return { stageOptions: [] as string[], statusOptions: [] as string[], visibleDeals: [] as PipelineDeal[], counts: emptyCounts() };
    }
    const stages = uniqueSorted(state.deals.map((d) => d.stage));
    const statuses = uniqueSorted(state.deals.map((d) => d.status));
    const visible = state.deals.filter(
      (d) =>
        (stageFilter === ALL || d.stage === stageFilter) &&
        (statusFilter === ALL || d.status === statusFilter),
    );
    return { stageOptions: stages, statusOptions: statuses, visibleDeals: visible, counts: countSignals(state.deals) };
  }, [state, stageFilter, statusFilter]);

  if (state.kind === 'loading') return <LoadingState message="Loading your pipeline…" />;
  if (state.kind === 'failed') {
    return (
      <ErrorState
        title="Could not load pipeline"
        detail={state.message}
        hint="Refresh to retry."
      />
    );
  }

  const total = state.deals.length;
  const visibleCount = derived.visibleDeals.length;
  const filtersActive = stageFilter !== ALL || statusFilter !== ALL;

  if (total === 0) {
    return (
      <Card>
        <CardHeader
          title="Personal Pipeline"
          subtitle="No active deals assigned to you."
        />
        <p style={styles.empty}>
          When deals are assigned to you, they'll show up here.
        </p>
      </Card>
    );
  }

  const subtitle = filtersActive
    ? `${visibleCount} of ${total} deal${total === 1 ? '' : 's'} shown`
    : `${total} active deal${total === 1 ? '' : 's'}${derived.counts.closingThisMonth > 0 ? ` · ${derived.counts.closingThisMonth} closing this month` : ''}${derived.counts.pastTargetClose > 0 ? ` · ${derived.counts.pastTargetClose} past target close` : ''}`;

  return (
    <Card>
      <CardHeader title="Personal Pipeline" subtitle={subtitle} />

      {(derived.stageOptions.length > 1 || derived.statusOptions.length > 1) && (
        <div style={styles.filters} role="group" aria-label="Pipeline filters">
          {derived.stageOptions.length > 1 && (
            <FilterField
              label="Stage"
              value={stageFilter}
              onChange={setStageFilter}
              options={derived.stageOptions}
              allLabel="All stages"
            />
          )}
          {derived.statusOptions.length > 1 && (
            <FilterField
              label="Status"
              value={statusFilter}
              onChange={setStatusFilter}
              options={derived.statusOptions}
              allLabel="All statuses"
            />
          )}
        </div>
      )}

      {visibleCount === 0 ? (
        <p style={styles.empty}>No deals match the current filters.</p>
      ) : (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th className="cc-th">Deal</th>
                <th className="cc-th">Client</th>
                <th className="cc-th">Stage</th>
                <th className="cc-th">Status</th>
                <th className="cc-th" style={{ textAlign: 'right' }}>Amount</th>
                <th className="cc-th">Target close</th>
                <th className="cc-th">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {derived.visibleDeals.map((d) => (
                <DealRow key={d.id} deal={d} onOpen={() => navigate(`/deals/${d.id}`)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function DealRow({ deal, onOpen }: { deal: PipelineDeal; onOpen: () => void }) {
  const isPastClose = isOverdueDate(deal.targetCloseDate);
  return (
    <tr
      className="cc-row-hover"
      style={styles.row}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      tabIndex={0}
      role="link"
      aria-label={`Open deal ${deal.name}`}
    >
      <td className="cc-td">
        <span style={styles.dealName}>{deal.name}</span>
      </td>
      <td className="cc-td">{deal.clientName ?? '—'}</td>
      <td className="cc-td">
        {deal.stage ? <Badge variant="neutral">{deal.stage}</Badge> : '—'}
      </td>
      <td className="cc-td">
        {deal.status ? <Badge variant="neutral" appearance="outline">{deal.status}</Badge> : '—'}
      </td>
      <td className="cc-td cc-td-num">{formatCurrency(deal.amount)}</td>
      <td className="cc-td">
        {isPastClose ? (
          <span style={styles.overdue}>{formatDate(deal.targetCloseDate)}</span>
        ) : (
          formatDate(deal.targetCloseDate)
        )}
      </td>
      <td className="cc-td" style={{ color: palette.textMuted }}>
        {formatRelative(deal.lastActivityOn)}
      </td>
    </tr>
  );
}

function FilterField({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  allLabel: string;
}) {
  return (
    <label style={styles.filterLabel}>
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={styles.select}
      >
        <option value={ALL}>{allLabel}</option>
        {options.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </label>
  );
}

function uniqueSorted(values: Array<string | undefined>): string[] {
  const set = new Set<string>();
  for (const v of values) if (v) set.add(v);
  return [...set].sort((a, b) => a.localeCompare(b));
}

function emptyCounts() {
  return { closingThisMonth: 0, pastTargetClose: 0 };
}

function countSignals(deals: PipelineDeal[]): { closingThisMonth: number; pastTargetClose: number } {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
  let closingThisMonth = 0;
  let pastTargetClose = 0;
  for (const d of deals) {
    if (!d.targetCloseDate) continue;
    const t = new Date(d.targetCloseDate).getTime();
    if (Number.isNaN(t)) continue;
    if (t >= monthStart && t < monthEnd) closingThisMonth++;
    if (t < now.getTime()) pastTargetClose++;
  }
  return { closingThisMonth, pastTargetClose };
}

function isOverdueDate(iso: string | undefined): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < Date.now();
}

function formatCurrency(amount: number | undefined): string {
  if (amount == null) return '—';
  return amount.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

function formatDate(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatRelative(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const days = Math.floor((Date.now() - d.getTime()) / MS_PER_DAY);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

const styles: Record<string, React.CSSProperties> = {
  empty: {
    margin: 0,
    color: palette.textMuted,
    fontSize: typography.size.sm,
    fontStyle: 'italic',
  },
  filters: { display: 'flex', gap: spacing.md, flexWrap: 'wrap', alignItems: 'flex-end' },
  filterLabel: {
    display: 'flex',
    flexDirection: 'column',
    fontSize: typography.size.xs,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase',
    color: palette.textSubtle,
    gap: 4,
    fontWeight: typography.weight.semibold,
  },
  select: {
    padding: '0.4rem 0.6rem',
    fontSize: typography.size.sm,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    background: palette.surface,
    minWidth: 170,
    color: palette.text,
    fontFamily: typography.family,
  },
  tableWrap: {
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    overflow: 'auto',
    background: palette.surface,
  },
  table: { width: '100%', borderCollapse: 'collapse' },
  row: { cursor: 'pointer' },
  dealName: {
    fontWeight: typography.weight.semibold,
    color: palette.text,
  },
  overdue: {
    color: palette.atRiskFg,
    fontWeight: typography.weight.semibold,
  },
};
