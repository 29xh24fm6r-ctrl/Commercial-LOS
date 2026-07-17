import type { CSSProperties } from 'react';
import { palette, radius, shadow, spacing, typography } from '../shared/theme';
import {
  deriveBankerWorkQueue,
  deriveBankerPipelineByStage,
  type WorkItem,
  type WorkTab,
  type WorkTone,
} from './bankerCommandCenterWorkModel';
import type { BankerPersonalActivity } from '../shared/analytics/bankerPersonalActivity';
import type { PipelineDeal } from './dealQueries';

/**
 * Banker Operating Command Center — the banker's ACTION cockpit.
 *
 * Factory Arc Phase 3: the old "System status" strip (per-capability
 * gated/operational/review pills sourced from global feature-flag constants,
 * plus a raw DRY_RUN email-mode pill) is retired, not just visually
 * demoted — it answered "which engineering feature flags are true," which
 * is a release-governance question, not an operational one, and does not
 * belong on a banker's dashboard (see docs/PRODUCTION_SURFACE_INVENTORY.md).
 * It's replaced by "Portfolio & Workflow Health": live counts derived from
 * this banker's own deals (the same `kpis` rollup already loaded for
 * section 1's work queue) — never invented, never a global label. A metric
 * with no live data source yet (deals-with-blockers aggregate, borrower
 * responses awaiting action, boarding exceptions) is left OFF the dashboard
 * entirely rather than faked; see the doc comment on PortfolioHealthSection.
 *
 * Read-only: this surface only reads the data the dashboard already loads
 * and navigates to existing tabs; it introduces no write.
 */
export interface BankerOperatingCommandCenterProps {
  /** The KPI rollup the dashboard already computes; null/absent while the snapshot is loading or failed. */
  readonly kpis?: BankerPersonalActivity | null;
  /** The banker's deals (for the honest pipeline-by-stage view). */
  readonly deals?: readonly PipelineDeal[];
  readonly loading?: boolean;
  /** Set when the dashboard's underlying query failed — distinct from "still loading" so the
   *  banker sees an honest local error instead of an indefinite/blank loading state. */
  readonly healthError?: string;
  /** Navigate to an existing shell tab when a work item is actioned. */
  readonly onSelectTab?: (tab: WorkTab) => void;
}

const TONE_COLOR: Record<WorkTone, string> = {
  urgent: palette.accent, // the ONE Seal-Red accent — genuinely urgent only
  attention: palette.atRisk,
  info: palette.cobalt,
};

export function BankerOperatingCommandCenter({
  kpis = null,
  deals = [],
  loading = false,
  healthError,
  onSelectTab,
}: BankerOperatingCommandCenterProps) {
  const work = kpis ? deriveBankerWorkQueue(kpis) : [];
  const pipeline = deriveBankerPipelineByStage(deals);

  return (
    <section
      aria-label="Banker Operating Command Center"
      data-banker-operating-command-center
      style={styles.wrap}
    >
      <header>
        <h2 style={styles.title}>Your command center</h2>
        <p style={styles.subtitle}>What needs you, where your pipeline sits, and what’s next.</p>
      </header>

      {/* 1 — What needs you (the visual lead) */}
      <section style={styles.leadCard} className="cc-rise-in" aria-label="What needs you">
        <h3 style={styles.cardTitle}>What needs you</h3>
        {loading ? (
          <p style={styles.muted}>Loading your work…</p>
        ) : work.length === 0 ? (
          <div style={styles.clear} role="status">
            <span style={styles.clearMark} aria-hidden>
              ✓
            </span>
            <span>No urgent items — you’re clear.</span>
          </div>
        ) : (
          <ul style={styles.workList}>
            {work.map((item) => (
              <li key={item.id}>
                <WorkRow item={item} onSelect={onSelectTab} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <div style={styles.twoCol}>
        {/* 2 — Pipeline at a glance (honest current stage state) */}
        <section style={styles.card} aria-label="Pipeline at a glance">
          <h3 style={styles.cardTitle}>Pipeline at a glance</h3>
          {pipeline.totalActive === 0 ? (
            <p style={styles.muted}>No active deals yet.</p>
          ) : (
            <>
              <div style={styles.pipelineTotals}>
                <span className="cc-tnum" style={styles.pipelineBig}>
                  {pipeline.totalActive}
                </span>
                <span style={styles.muted}>
                  active {pipeline.totalActive === 1 ? 'deal' : 'deals'} ·{' '}
                  <span className="cc-tnum">{formatCurrencyCompact(pipeline.totalAmount)}</span>
                </span>
              </div>
              <ul style={styles.stageList}>
                {pipeline.groups.map((g) => (
                  <li key={g.stage} style={styles.stageRow} data-stage-group={g.stage}>
                    <span style={styles.stageName}>{g.stage}</span>
                    <span className="cc-tnum" style={styles.stageCount}>
                      {g.count}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        {/* 4 — Portfolio & Workflow Health: live counts derived from this banker's own deals. */}
        <PortfolioHealthSection kpis={kpis} loading={loading} healthError={healthError} onSelectTab={onSelectTab} />
      </div>
    </section>
  );
}

/**
 * Every tile here reads a field already computed on `kpis: BankerPersonalActivity`
 * (src/shared/analytics/bankerPersonalActivity.ts) — the same rollup section 1's
 * work queue already consumes, so this introduces no new query. Three metrics
 * the factory-arc brief asked for are deliberately OMITTED rather than faked,
 * because no live per-banker data source exists for them yet:
 *   - "Deals with blockers" — dealBlockerModel.ts is per-deal only; no aggregation
 *     across a banker's pipeline exists.
 *   - "Borrower responses awaiting action" — no inbound-reply tracking exists
 *     anywhere in the data model yet (borrower communication is outbound-log only).
 *   - "Boarding exceptions" — the portfolio-boarding exception count exists
 *     (portfolioBoardingCommandCenterAdapter.ts) but nothing scopes boarded loans
 *     to an originating banker.
 * Add them here once (and only once) a genuine live source exists for each.
 */
function PortfolioHealthSection({
  kpis,
  loading,
  healthError,
  onSelectTab,
}: {
  kpis: BankerPersonalActivity | null;
  loading: boolean;
  healthError: string | undefined;
  onSelectTab?: (tab: WorkTab) => void;
}) {
  return (
    <section style={styles.card} aria-label="Portfolio and workflow health">
      <h3 style={styles.cardTitle}>Portfolio &amp; workflow health</h3>
      {loading ? (
        <p style={styles.muted}>Loading portfolio health…</p>
      ) : healthError ? (
        <div style={styles.healthErrorBox} role="alert">
          <p style={styles.healthErrorText}>Could not load portfolio health: {healthError}</p>
        </div>
      ) : !kpis ? (
        <p style={styles.muted}>Portfolio health is unavailable right now.</p>
      ) : (
        <div style={styles.healthGrid}>
          <HealthTile
            label="Active deals"
            count={kpis.activeDeals}
            detail={kpis.activeDeals > 0 ? formatCurrencyCompact(kpis.totalAmount) : undefined}
            tab="active-deals"
            onSelectTab={onSelectTab}
          />
          <HealthTile label="Documents outstanding" count={kpis.outstandingDocumentCount} tab="due-diligence" onSelectTab={onSelectTab} />
          <HealthTile label="Documents awaiting review" count={kpis.pendingReviewDocumentCount} tab="due-diligence" onSelectTab={onSelectTab} />
          <HealthTile label="Tasks overdue" count={kpis.overdueTaskCount} tab="tasks" onSelectTab={onSelectTab} />
          <HealthTile label="Credit memos in draft" count={kpis.draftMemoCount} tab="active-deals" onSelectTab={onSelectTab} />
          <HealthTile label="Closing in 14 days" count={kpis.closingSoonCount} tab="active-deals" onSelectTab={onSelectTab} />
          <HealthTile label="Stale 14+ days" count={kpis.staleActivityCount} tab="active-deals" onSelectTab={onSelectTab} />
        </div>
      )}
    </section>
  );
}

function HealthTile({
  label,
  count,
  detail,
  tab,
  onSelectTab,
}: {
  label: string;
  count: number;
  detail?: string;
  tab: WorkTab;
  onSelectTab?: (tab: WorkTab) => void;
}) {
  return (
    <button
      type="button"
      style={styles.healthTile}
      onClick={() => onSelectTab?.(tab)}
      data-health-tile={label}
    >
      <span className="cc-tnum" style={styles.healthCount}>
        {count}
      </span>
      <span style={styles.healthLabel}>{label}</span>
      {detail && <span style={styles.healthDetail}>{detail}</span>}
    </button>
  );
}

function WorkRow({ item, onSelect }: { item: WorkItem; onSelect?: (tab: WorkTab) => void }) {
  const color = TONE_COLOR[item.tone];
  return (
    <button
      type="button"
      style={{ ...styles.workRow, borderLeft: `3px solid ${color}` }}
      onClick={() => onSelect?.(item.target)}
      data-work-item={item.id}
      data-work-tone={item.tone}
    >
      <span className="cc-tnum" style={{ ...styles.workCount, color }}>
        {item.count}
      </span>
      <span style={styles.workLabel}>{item.label}</span>
      <span style={{ ...styles.workAction, color }}>{item.actionLabel} →</span>
    </button>
  );
}

function formatCurrencyCompact(n: number): string {
  if (n === 0) return '$0';
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: spacing.lg },
  title: {
    margin: 0,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: palette.text,
    letterSpacing: typography.letterSpacing.heading,
  },
  subtitle: { margin: `${spacing.xxs} 0 0`, fontSize: typography.size.md, color: palette.textMuted },
  leadCard: {
    background: palette.surface,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.lg,
    boxShadow: shadow.elevated,
    padding: spacing.lg,
  },
  card: {
    background: palette.surface,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.lg,
    boxShadow: shadow.elevated,
    padding: spacing.lg,
    minWidth: 0,
  },
  cardTitle: {
    margin: `0 0 ${spacing.md}`,
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: palette.text,
  },
  muted: { margin: 0, fontSize: typography.size.sm, color: palette.textMuted },
  clear: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    fontSize: typography.size.md,
    color: palette.text,
    padding: `${spacing.sm} 0`,
  },
  clearMark: { color: palette.clear, fontWeight: typography.weight.bold, fontSize: typography.size.lg },
  workList: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: spacing.sm },
  workRow: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
    background: palette.surfaceAlt,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.md,
    padding: `${spacing.sm} ${spacing.md}`,
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: typography.family,
    color: palette.text,
  },
  workCount: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1,
    minWidth: '1.6em',
    textAlign: 'right',
  },
  workLabel: { flex: 1, fontSize: typography.size.md, color: palette.text },
  workAction: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, whiteSpace: 'nowrap' },
  twoCol: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: spacing.md,
  },
  pipelineTotals: { display: 'flex', alignItems: 'baseline', gap: spacing.sm, marginBottom: spacing.md },
  pipelineBig: {
    fontSize: typography.size.hero,
    fontWeight: typography.weight.bold,
    color: palette.text,
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1,
  },
  stageList: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: spacing.xs },
  stageRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: `${spacing.xs} ${spacing.sm}`,
    background: palette.surfaceAlt,
    borderRadius: radius.sm,
    border: `1px solid ${palette.border}`,
  },
  stageName: { fontSize: typography.size.sm, color: palette.text },
  stageCount: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    color: palette.text,
    fontVariantNumeric: 'tabular-nums',
  },
  healthGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
    gap: spacing.sm,
  },
  healthTile: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 2,
    background: palette.surfaceAlt,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.md,
    padding: `${spacing.sm} ${spacing.md}`,
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: typography.family,
    color: palette.text,
  },
  healthCount: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1,
    color: palette.text,
  },
  healthLabel: { fontSize: typography.size.xs, color: palette.textMuted },
  healthDetail: { fontSize: typography.size.xs, color: palette.textSubtle },
  healthErrorBox: {
    background: palette.blockedBg,
    border: `1px solid ${palette.blockedBg}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
  },
  healthErrorText: { margin: 0, color: palette.blockedFg, fontSize: typography.size.sm },
};
