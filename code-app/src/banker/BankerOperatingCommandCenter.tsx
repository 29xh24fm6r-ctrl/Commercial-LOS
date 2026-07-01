import type { CSSProperties } from 'react';
import { palette, radius, shadow, spacing, typography } from '../shared/theme';
import { EMAIL_MODE } from '../deals/emailDelivery/emailMode';
import {
  deriveBankerOperatingCommandCenterModel,
  type BankerOperatingDomainState,
} from './bankerOperatingCommandCenterModel';
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
 * Reframed from a status board for the builder into an action board for the banker: what needs
 * me, where my pipeline sits, and what's next. The governance truth is NOT lost — every gated /
 * DRY_RUN / Read-only fact from the old cards survives in the demoted "System status" strip
 * (compact pills + tooltips), visually subordinate to the work. Read-only: this surface only reads
 * the data the dashboard already loads and navigates to existing tabs; it introduces no write.
 */
export interface BankerOperatingCommandCenterProps {
  /** The KPI rollup the dashboard already computes; null/absent while the snapshot is loading. */
  readonly kpis?: BankerPersonalActivity | null;
  /** The banker's deals (for the honest pipeline-by-stage view). */
  readonly deals?: readonly PipelineDeal[];
  readonly loading?: boolean;
  /** Navigate to an existing shell tab when a work item is actioned. */
  readonly onSelectTab?: (tab: WorkTab) => void;
}

const TONE_COLOR: Record<WorkTone, string> = {
  urgent: palette.accent, // the ONE Seal-Red accent — genuinely urgent only
  attention: palette.atRisk,
  info: palette.cobalt,
};

const STATE_TINT: Record<BankerOperatingDomainState, { bg: string; fg: string }> = {
  operational: { bg: palette.clearBg, fg: palette.clearFg },
  review: { bg: palette.neutralBg, fg: palette.neutralFg },
  gated: { bg: palette.atRiskBg, fg: palette.atRiskFg },
};

export function BankerOperatingCommandCenter({
  kpis = null,
  deals = [],
  loading = false,
  onSelectTab,
}: BankerOperatingCommandCenterProps) {
  const work = kpis ? deriveBankerWorkQueue(kpis) : [];
  const pipeline = deriveBankerPipelineByStage(deals);
  const status = deriveBankerOperatingCommandCenterModel();

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

        {/* 4 — System status (demoted governance truth: compact pills + tooltips) */}
        <section style={styles.card} aria-label="System status">
          <h3 style={styles.cardTitle}>System status</h3>
          <p style={styles.statusHint}>
            What’s live vs. gated for you — hover a pill for detail. Nothing here is hidden.
          </p>
          <div style={styles.pillWrap}>
            {status.domains.map((d) => {
              const tint = STATE_TINT[d.state];
              return (
                <span
                  key={d.id}
                  style={{ ...styles.pill, background: tint.bg, color: tint.fg }}
                  data-operating-domain={d.id}
                  title={d.summary}
                >
                  <span style={styles.pillLabel}>{d.label}</span>
                  <span style={styles.pillValue} data-domain-value>
                    {d.value}
                  </span>
                </span>
              );
            })}
            <span
              style={{
                ...styles.pill,
                background: EMAIL_MODE === 'LIVE' ? palette.clearBg : palette.neutralBg,
                color: EMAIL_MODE === 'LIVE' ? palette.clearFg : palette.neutralFg,
              }}
              data-operating-domain="email-mode"
              title="Borrower email transport mode. DRY_RUN never invokes the live Outlook connector."
            >
              <span style={styles.pillLabel}>Email</span>
              <span style={styles.pillValue}>{EMAIL_MODE}</span>
            </span>
          </div>
        </section>
      </div>
    </section>
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
  statusHint: { margin: `0 0 ${spacing.sm}`, fontSize: typography.size.xs, color: palette.textSubtle },
  pillWrap: { display: 'flex', flexWrap: 'wrap', gap: spacing.xs },
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacing.xxs,
    padding: `${spacing.xxs} ${spacing.sm}`,
    borderRadius: radius.pill,
    fontSize: typography.size.xs,
    lineHeight: 1.3,
    cursor: 'default',
  },
  pillLabel: { fontWeight: typography.weight.semibold },
  pillValue: { opacity: 0.85 },
};
