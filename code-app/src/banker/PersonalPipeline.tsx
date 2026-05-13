import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBanker } from './BankerContext';
import { loadBankerPipeline, type PipelineDeal } from './dealQueries';
import { LoadingState } from '../shared/LoadingState';
import { ErrorState } from '../shared/ErrorState';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; deals: PipelineDeal[] }
  | { kind: 'failed'; message: string };

const ALL = '__all__';

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

  const { stageOptions, statusOptions, visibleDeals } = useMemo(() => {
    if (state.kind !== 'ready') {
      return { stageOptions: [], statusOptions: [], visibleDeals: [] };
    }
    const stages = uniqueSorted(state.deals.map((d) => d.stage));
    const statuses = uniqueSorted(state.deals.map((d) => d.status));
    const visible = state.deals.filter(
      (d) =>
        (stageFilter === ALL || d.stage === stageFilter) &&
        (statusFilter === ALL || d.status === statusFilter),
    );
    return { stageOptions: stages, statusOptions: statuses, visibleDeals: visible };
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
  const visibleCount = visibleDeals.length;
  const filtersActive = stageFilter !== ALL || statusFilter !== ALL;

  if (total === 0) {
    return (
      <section style={styles.section} aria-labelledby="pipeline-heading">
        <header style={styles.header}>
          <h2 id="pipeline-heading" style={styles.heading}>
            Personal Pipeline
          </h2>
          <p style={styles.subtitle}>No active deals assigned to you.</p>
        </header>
        <p style={styles.empty}>
          When deals are assigned to you, they'll show up here.
        </p>
      </section>
    );
  }

  return (
    <section style={styles.section} aria-labelledby="pipeline-heading">
      <header style={styles.header}>
        <h2 id="pipeline-heading" style={styles.heading}>
          Personal Pipeline
        </h2>
        <p style={styles.subtitle}>
          {filtersActive
            ? `${visibleCount} of ${total} deal${total === 1 ? '' : 's'}`
            : `${total} active deal${total === 1 ? '' : 's'}`}
        </p>
      </header>

      {(stageOptions.length > 1 || statusOptions.length > 1) && (
        <div style={styles.filters} role="group" aria-label="Pipeline filters">
          {stageOptions.length > 1 && (
            <label style={styles.filterLabel}>
              Stage
              <select
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value)}
                style={styles.select}
              >
                <option value={ALL}>All stages</option>
                {stageOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          )}
          {statusOptions.length > 1 && (
            <label style={styles.filterLabel}>
              Status
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={styles.select}
              >
                <option value={ALL}>All statuses</option>
                {statusOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
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
                <th style={styles.th}>Deal</th>
                <th style={styles.th}>Client</th>
                <th style={styles.th}>Stage</th>
                <th style={styles.th}>Status</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Amount</th>
                <th style={styles.th}>Target close</th>
                <th style={styles.th}>Last activity</th>
              </tr>
            </thead>
            <tbody>
              {visibleDeals.map((d) => (
                <tr
                  key={d.id}
                  style={styles.row}
                  onClick={() => navigate(`/deals/${d.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      navigate(`/deals/${d.id}`);
                    }
                  }}
                  tabIndex={0}
                  role="link"
                  aria-label={`Open deal ${d.name}`}
                >
                  <td style={styles.td}>{d.name}</td>
                  <td style={styles.td}>{d.clientName ?? '—'}</td>
                  <td style={styles.td}>{d.stage ?? '—'}</td>
                  <td style={styles.td}>{d.status ?? '—'}</td>
                  <td style={{ ...styles.td, textAlign: 'right' }}>
                    {formatCurrency(d.amount)}
                  </td>
                  <td style={styles.td}>{formatDate(d.targetCloseDate)}</td>
                  <td style={styles.td}>{formatRelative(d.lastActivityOn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function uniqueSorted(values: Array<string | undefined>): string[] {
  const set = new Set<string>();
  for (const v of values) if (v) set.add(v);
  return [...set].sort((a, b) => a.localeCompare(b));
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
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

const styles: Record<string, React.CSSProperties> = {
  section: { padding: 0 },
  header: { marginBottom: '1rem' },
  heading: { margin: 0, fontSize: '1.15rem', fontWeight: 600 },
  subtitle: { margin: '0.25rem 0 0', color: '#666', fontSize: '0.9rem' },
  filters: { display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' },
  filterLabel: {
    display: 'flex',
    flexDirection: 'column',
    fontSize: '0.8rem',
    color: '#555',
    gap: '0.25rem',
  },
  select: {
    padding: '0.4rem 0.6rem',
    fontSize: '0.9rem',
    border: '1px solid #d0d0d0',
    borderRadius: 4,
    background: '#fff',
    minWidth: 160,
  },
  empty: { color: '#888', fontStyle: 'italic' },
  tableWrap: {
    background: '#fff',
    border: '1px solid #e5e5e5',
    borderRadius: 6,
    overflow: 'auto',
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.92rem' },
  th: {
    textAlign: 'left',
    padding: '0.65rem 0.85rem',
    background: '#f6f6f8',
    borderBottom: '1px solid #e5e5e5',
    fontWeight: 600,
    color: '#444',
    whiteSpace: 'nowrap',
  },
  row: { cursor: 'pointer', borderTop: '1px solid #f0f0f0' },
  td: { padding: '0.65rem 0.85rem', whiteSpace: 'nowrap', verticalAlign: 'middle' },
};
