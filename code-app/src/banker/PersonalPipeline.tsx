import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBanker } from './BankerContext';
import { loadBankerPipeline, type PipelineDeal } from './dealQueries';
import { LoadingState } from '../shared/LoadingState';
import { ErrorState } from '../shared/ErrorState';
import { Card, CardHeader } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { palette, radius, shadow, spacing, typography } from '../shared/theme';
import { CANONICAL_STAGES, recognizeCanonicalStage } from '../workflow/stageOrderingContract';
import { STALE_ACTIVITY_DAYS } from '../shared/analytics/bankerPersonalActivity';

/**
 * Remediation 2026-07-22 (Workstream B) — the board's lanes are now built from the same
 * canonical 7-stage vocabulary the deal cockpit's Stage Map already uses
 * (`stageOrderingContract.ts`), not the legacy 9-stage `stageCatalog.ts`. A new Intake deal was
 * disappearing into an unordered "custom lane" because no vocabulary-B stage is named "Intake" (or
 * "Credit Approval" / "Commitment" / "Closing & Funding") -- this was the confirmed root cause of
 * "a newly created deal doesn't show up on the board where I'd expect it."
 *
 * Returns the canonical sequence for a stage name (case-insensitive match against the canonical
 * code or ratified name). Unknown/legacy stages return a mid-range fallback so they sort after
 * known stages but before missing-stage rows. Missing / undefined stage returns +infinity so those
 * rows always group last as "Stage unknown" rather than silently landing inside a real section.
 */
function stageOrdinal(stageName: string | undefined): number {
  if (!stageName) return Number.POSITIVE_INFINITY;
  const trimmed = stageName.trim();
  if (!trimmed) return Number.POSITIVE_INFINITY;
  const recognized = recognizeCanonicalStage(trimmed);
  if (recognized) return recognized.sequence;
  return 9999;
}

const STAGE_UNKNOWN_LABEL = 'Stage unknown';

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
      return {
        stageOptions: [] as string[],
        statusOptions: [] as string[],
        visibleDeals: [] as PipelineDeal[],
        counts: emptyCounts(),
      };
    }
    const stages = uniqueSorted(state.deals.map((d) => d.stage));
    const statuses = uniqueSorted(state.deals.map((d) => d.status));
    const visible = state.deals.filter(
      (d) =>
        (stageFilter === ALL || d.stage === stageFilter) &&
        (statusFilter === ALL || d.status === statusFilter),
    );
    return {
      stageOptions: stages,
      statusOptions: statuses,
      visibleDeals: visible,
      counts: countSignals(state.deals),
    };
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

  const lanes = buildLanes(derived.visibleDeals);

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
        <div
          style={styles.kanbanBoard}
          role="group"
          aria-label="Pipeline stage board"
        >
          {lanes.map((lane) => (
            <section
              key={lane.key}
              style={styles.lane}
              aria-label={`Stage: ${lane.label}`}
            >
              <div style={styles.laneHeader}>
                <span style={styles.laneHeaderLabelGroup}>
                  <span style={styles.laneHeaderAccent} aria-hidden="true" />
                  <span style={styles.laneHeaderLabel}>{lane.label}</span>
                </span>
                <span style={styles.laneHeaderCount}>
                  {lane.deals.length} deal{lane.deals.length === 1 ? '' : 's'}
                </span>
              </div>
              {lane.amountSummary && (
                <div style={styles.laneHeaderAmount}>{lane.amountSummary}</div>
              )}
              <div style={styles.laneBody}>
                {lane.deals.length === 0 ? (
                  <div style={styles.laneEmpty}>No deals in this stage.</div>
                ) : (
                  lane.deals.map((d) => (
                    <DealCard
                      key={d.id}
                      deal={d}
                      onOpen={() => navigate(`/deals/${d.id}`)}
                    />
                  ))
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </Card>
  );
}

interface Lane {
  key: string;
  label: string;
  ordinal: number;
  deals: PipelineDeal[];
  amountSummary: string | null;
}

/**
 * Remediation 2026-07-22 (Workstream B) — canonical stage lanes.
 *
 * Lane set = (every non-terminal canonical stage: Intake … Closing & Funding) ∪ (every
 * unrecognized/legacy stage present in `deals`, in its own diagnostic lane). The Stage-unknown
 * lane only appears when at least one deal in the visible set has a missing or unparseable stage.
 * BOARDED (the one terminal canonical stage) is excluded because `loadBankerPipeline` already
 * filters out `cr664_isterminalstatus = true` at the loader level — surfacing a terminal lane here
 * would be misleading dead space.
 *
 * A deal is matched to a canonical lane via `recognizeCanonicalStage` (exact code OR ratified name,
 * case-insensitive) — the same recognizer the deal cockpit's Stage Map already uses, so a deal
 * never disappears because this screen speaks a different stage language than the cockpit does.
 * Anything that doesn't recognize (a genuinely legacy/custom value, e.g. an operator-entered
 * placeholder) still gets its own labeled diagnostic lane rather than being silently dropped.
 *
 * Empty canonical lanes ARE rendered (with an honest "No deals in this stage." empty state) —
 * that's the Kanban contract: the lane shape is determined by the canonical pipeline, not by what
 * happens to have a row today. The operator can see at a glance which stages are dry.
 */
function buildLanes(deals: readonly PipelineDeal[]): Lane[] {
  const canonicalStages = CANONICAL_STAGES.filter((s) => s.code !== 'BOARDED');
  const dealsByCanonicalCode = new Map<string, PipelineDeal[]>();
  const customLaneGroups = new Map<string, PipelineDeal[]>();
  const unknownDeals: PipelineDeal[] = [];

  for (const d of deals) {
    const stage = d.stage?.trim();
    if (!stage) {
      unknownDeals.push(d);
      continue;
    }
    const recognized = recognizeCanonicalStage(stage);
    if (recognized && recognized.code !== 'BOARDED') {
      const arr = dealsByCanonicalCode.get(recognized.code) ?? [];
      arr.push(d);
      dealsByCanonicalCode.set(recognized.code, arr);
      continue;
    }
    // Unrecognized (or a BOARDED deal that slipped through the terminal-status filter, which
    // should not happen but is still shown honestly rather than dropped) — its own diagnostic lane,
    // keyed by the exact stored text so distinct legacy values don't collapse together.
    const key = stage.toLowerCase();
    const arr = customLaneGroups.get(key) ?? [];
    arr.push(d);
    customLaneGroups.set(key, arr);
  }

  // Canonical non-terminal lanes from the same vocabulary the deal cockpit Stage Map uses.
  const canonicalLanes: Lane[] = canonicalStages.map((s) => {
    const laneDeals = dealsByCanonicalCode.get(s.code) ?? [];
    return {
      key: s.code.toLowerCase(),
      label: s.name,
      ordinal: s.sequence,
      deals: laneDeals,
      amountSummary: amountSummary(laneDeals),
    };
  });

  // Lanes for unrecognized/legacy stage values present in the data. The live env's
  // `cr664_dealstagereference` table is operator-populated and may contain names like
  // "TEST — Stage Phase 121" that don't match the canonical vocabulary.
  const customLanes: Lane[] = [];
  for (const [key, laneDeals] of customLaneGroups.entries()) {
    const label = laneDeals[0]!.stage!.trim();
    customLanes.push({
      key,
      label,
      ordinal: stageOrdinal(label),
      deals: laneDeals,
      amountSummary: amountSummary(laneDeals),
    });
  }

  // Stage unknown lane — only appears when at least one deal has a
  // missing / blank stage. Never fabricated.
  const unknownLane: Lane | null =
    unknownDeals.length > 0
      ? {
          key: STAGE_UNKNOWN_LABEL.toLowerCase(),
          label: STAGE_UNKNOWN_LABEL,
          ordinal: Number.POSITIVE_INFINITY,
          deals: unknownDeals,
          amountSummary: amountSummary(unknownDeals),
        }
      : null;

  const allLanes = [...canonicalLanes, ...customLanes];
  if (unknownLane) allLanes.push(unknownLane);

  return allLanes.sort((a, b) => {
    if (a.ordinal !== b.ordinal) return a.ordinal - b.ordinal;
    return a.label.localeCompare(b.label);
  });
}

/**
 * Sum of parseable amounts in the lane, formatted compactly. Returns
 * null when the lane is empty OR every deal in the lane has a
 * missing/unparseable amount — never silently surfaces `$0` when the
 * underlying data is genuinely missing.
 */
function amountSummary(laneDeals: readonly PipelineDeal[]): string | null {
  if (laneDeals.length === 0) return null;
  let sum = 0;
  let anyParseable = false;
  for (const d of laneDeals) {
    if (typeof d.amount === 'number' && Number.isFinite(d.amount)) {
      sum += d.amount;
      anyParseable = true;
    }
  }
  if (!anyParseable) return null;
  return formatCompactCurrency(sum);
}

function DealCard({
  deal,
  onOpen,
}: {
  deal: PipelineDeal;
  onOpen: () => void;
}) {
  const isPastClose = isOverdueDate(deal.targetCloseDate);
  const isStale = isStaleActivity(deal.lastActivityOn);
  const accentColor = isPastClose
    ? palette.atRisk
    : isStale
      ? palette.atRisk
      : palette.primary;

  const targetCloseLabel = formatTargetClose(deal.targetCloseDate);

  return (
    <button
      type="button"
      className="cc-row-hover"
      style={{
        ...styles.dealCard,
        borderLeft: `3px solid ${accentColor}`,
      }}
      onClick={onOpen}
      aria-label={`Open deal ${deal.name}`}
    >
      <div style={styles.dealCardTopRow}>
        <span style={styles.dealCardName}>{deal.name}</span>
        {isStale && (
          <Badge variant="atRisk" appearance="outline">
            Stale {STALE_ACTIVITY_DAYS}d+
          </Badge>
        )}
      </div>
      <div style={styles.dealCardClient}>{deal.clientName ?? '—'}</div>
      <div style={styles.dealCardMetaRow}>
        {deal.status ? (
          <Badge variant="neutral" appearance="outline">
            {deal.status}
          </Badge>
        ) : (
          <span style={styles.dealCardMeta}>Status not set</span>
        )}
        <span style={styles.dealCardAmount}>
          {deal.amount != null && Number.isFinite(deal.amount)
            ? formatCurrency(deal.amount)
            : <span style={styles.dealCardAmountMissing}>Amount not set</span>}
        </span>
      </div>
      {targetCloseLabel && (
        <div
          style={{
            ...styles.dealCardMeta,
            ...(isPastClose ? styles.overdue : null),
          }}
        >
          Target close: {targetCloseLabel}
        </div>
      )}
      <div style={styles.dealCardLastActivity}>
        Last touched: {formatRelative(deal.lastActivityOn)}
      </div>
    </button>
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

function countSignals(deals: PipelineDeal[]): {
  closingThisMonth: number;
  pastTargetClose: number;
} {
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

/**
 * Phase 120 — per-card stale badge predicate. Uses the same
 * STALE_ACTIVITY_DAYS threshold as the Phase 119 "Stale 14d+" KPI
 * tile so the badge count and tile count agree: if the tile says
 * "1 stale", exactly one pipeline card badges. Missing /
 * unparseable lastActivityOn returns false (no badge — honest,
 * never silently treated as stale).
 */
function isStaleActivity(iso: string | undefined): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  const days = Math.floor((Date.now() - t) / MS_PER_DAY);
  return days >= STALE_ACTIVITY_DAYS;
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

function formatCompactCurrency(amount: number): string {
  if (amount === 0) return '$0';
  const abs = Math.abs(amount);
  if (abs >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(amount / 1_000).toFixed(1)}K`;
  return `$${amount.toLocaleString()}`;
}

function formatTargetClose(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const absolute = d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const days = Math.round((d.getTime() - Date.now()) / MS_PER_DAY);
  if (days < 0) return `${absolute} (${Math.abs(days)}d past)`;
  if (days === 0) return `${absolute} (today)`;
  if (days === 1) return `${absolute} (tomorrow)`;
  if (days < 30) return `${absolute} (in ${days}d)`;
  return absolute;
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

const LANE_WIDTH = 296;

const styles: Record<string, React.CSSProperties> = {
  empty: {
    margin: 0,
    color: palette.textMuted,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.snug,
    padding: `${spacing.lg} ${spacing.xl}`,
    background: palette.surfaceAlt,
    border: `1px dashed ${palette.borderStrong}`,
    borderRadius: radius.md,
    textAlign: 'center' as const,
  },
  filters: {
    display: 'flex',
    gap: spacing.md,
    flexWrap: 'wrap',
    alignItems: 'flex-end',
  },
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
  kanbanBoard: {
    display: 'flex',
    gap: spacing.md,
    overflowX: 'auto',
    overflowY: 'visible',
    paddingBottom: spacing.sm,
    paddingTop: 2,
    alignItems: 'stretch',
    // Phase 124 follow-up — give the board a generous vertical
    // floor so the lane bodies + deal cards + framed empty states
    // breathe. The page (BankerShell > main > tabPanel) grows
    // naturally; nothing above us caps height.
    minHeight: 420,
  },
  lane: {
    flex: `0 0 ${LANE_WIDTH}px`,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
    background: palette.surfaceAlt,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.md,
    padding: spacing.sm,
    // Phase 124 follow-up — bumped from 200 to 360 so a lane with
    // a single deal card or an empty-state card still reads as a
    // substantial column rather than a cramped strip.
    minHeight: 360,
  },
  laneHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
    padding: `${spacing.xs} ${spacing.xs} 0`,
  },
  laneHeaderLabelGroup: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacing.xs,
    minWidth: 0,
  },
  laneHeaderAccent: {
    display: 'inline-block',
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    background: palette.primary,
    flexShrink: 0,
  },
  laneHeaderLabel: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
    color: palette.text,
    letterSpacing: typography.letterSpacing.heading,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  laneHeaderCount: {
    fontSize: typography.size.xs,
    color: palette.primary,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase',
    fontWeight: typography.weight.semibold,
    padding: `1px ${spacing.xs}`,
    background: palette.primaryBg,
    border: `1px solid ${palette.primary}`,
    borderRadius: radius.pill,
    flexShrink: 0,
  },
  laneHeaderAmount: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: palette.textMuted,
    fontVariantNumeric: 'tabular-nums',
    padding: `0 ${spacing.xs}`,
  },
  laneBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
    flex: 1,
  },
  laneEmpty: {
    // Phase 124 follow-up — `flex: 1` now fills the lane's
    // (taller) min-height naturally; the previous explicit
    // minHeight: 100 floor was holding the empty card down even
    // when the lane was tall. Removed so the empty state grows
    // with the lane.
    flex: 1,
    color: palette.textSubtle,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.snug,
    padding: `${spacing.md} ${spacing.sm}`,
    background: palette.surfaceSubtle,
    border: `1px dashed ${palette.border}`,
    borderRadius: radius.sm,
    textAlign: 'center' as const,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dealCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: `${spacing.sm} ${spacing.md}`,
    background: palette.surface,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    boxShadow: shadow.card,
    cursor: 'pointer',
    textAlign: 'left' as const,
    fontFamily: typography.family,
    color: palette.text,
    transition: 'box-shadow 140ms ease, transform 140ms ease',
  },
  dealCardTopRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  dealCardName: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: palette.text,
    lineHeight: typography.lineHeight.tight,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  dealCardClient: {
    fontSize: typography.size.xs,
    color: palette.textMuted,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  dealCardMetaRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
    paddingTop: 2,
  },
  dealCardMeta: {
    fontSize: typography.size.xs,
    color: palette.textMuted,
    lineHeight: typography.lineHeight.snug,
  },
  dealCardAmount: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: palette.text,
    fontVariantNumeric: 'tabular-nums',
  },
  dealCardAmountMissing: {
    fontSize: typography.size.xs,
    color: palette.textSubtle,
    fontStyle: 'italic' as const,
    fontWeight: typography.weight.regular,
  },
  dealCardLastActivity: {
    fontSize: typography.size.xs,
    color: palette.textSubtle,
  },
  overdue: {
    color: palette.atRiskFg,
    fontWeight: typography.weight.semibold,
  },
};
