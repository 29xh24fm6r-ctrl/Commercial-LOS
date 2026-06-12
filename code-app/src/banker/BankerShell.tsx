import { useCallback, useEffect, useMemo, useState } from 'react';
import { useBanker } from './BankerContext';
import {
  loadBankerWorkQueueData,
  type BankerWorkQueueData,
} from './workQueueQueries';
import { deriveBankerPersonalActivity } from '../shared/analytics/bankerPersonalActivity';
import { PersonalActivitySummary } from './PersonalActivitySummary';
import { BankerMorningCatchUp } from './BankerMorningCatchUp';
import { BankerAutopilotRollup } from './BankerAutopilotRollup';
import { MyWorkQueue } from './MyWorkQueue';
import { RelationshipMemory } from './RelationshipMemory';
import { PersonalPipeline } from './PersonalPipeline';
import { BankerActivityFeed } from './BankerActivityFeed';
import { BankerDueDiligenceView } from './BankerDueDiligenceView';
import { LendingOSLayout, type LendingOSNavKey } from './LendingOSLayout';
import { GreetingHeader } from './GreetingHeader';
import { BankerKpiGrid } from './BankerKpiGrid';
import { BankerCrmIntelligencePanel } from './BankerCrmIntelligencePanel';
import { Badge } from '../shared/Badge';
import { CountBadge } from '../shared/cockpitPrimitives';
import { palette, radius, shadow, spacing, typography } from '../shared/theme';

/**
 * Phase 125F — Banker Workspace shell (Lending OS recomposition).
 *
 * Replaces the Phase 117 institutional shell with the original
 * Lending OS reference: dark left sidebar (LendingOSLayout) +
 * personal greeting header (GreetingHeader) + flat 10-tile KPI
 * grid (BankerKpiGrid) + tab bar with count badges + right
 * rail with "Today's Schedule" + "My Tasks".
 *
 * Honest discipline (carried from Phase 117 + 118):
 *   - KPI values derive from `deriveBankerPersonalActivity` over
 *     real authorized data. Tiles needing data the schema does
 *     not surface (WEIGHTED / WIN RATE / HIGH PROB / YTD CLOSED)
 *     render italic "Not yet wired" with explicit tooltips.
 *   - Log Activity is the governed banker write; "+ New Deal" and
 *     global search remain honest placeholders in GreetingHeader.
 *   - Schedule / Contacts / Vendors / Settings / Help & Support
 *     sidebar items are disabled placeholders in LendingOSLayout.
 *   - Phase 110 communication-lane lock untouched.
 *   - Permission-before-render preserved: only renders inside
 *     BankerProvider.
 */

type ShellTab =
  | 'dashboard'
  | 'active-deals'
  | 'my-alerts'
  | 'tasks'
  | 'due-diligence'
  | 'activity'
  | 'relationships'
  | 'signals';

interface TabSpec {
  readonly key: ShellTab;
  readonly label: string;
  readonly nav: LendingOSNavKey;
}

const TAB_SPECS: ReadonlyArray<TabSpec> = [
  { key: 'dashboard', label: 'Dashboard', nav: 'dashboard' },
  { key: 'active-deals', label: 'Active Deals', nav: 'active-deals' },
  { key: 'tasks', label: 'Tasks & Actions', nav: 'tasks' },
  { key: 'due-diligence', label: 'Due Diligence', nav: 'due-diligence' },
  { key: 'activity', label: 'Activity', nav: 'activity' },
  { key: 'relationships', label: 'Relationships', nav: 'relationships' },
  { key: 'my-alerts', label: 'My Alerts', nav: 'my-alerts' },
  { key: 'signals', label: 'Signals', nav: 'signals' },
];

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: BankerWorkQueueData }
  | { kind: 'failed'; message: string };

export interface BankerShellProps {
  workspaceName: string;
  /**
   * Phase 124C — optional entitled-workspace links forwarded to
   * LendingOSLayout so the sidebar can render the workspace
   * switcher for manager-entitled users. When undefined, the shell
   * falls back to the single-workspace pill.
   */
  workspaceLinks?: ReadonlyArray<import('../bootstrap/workspaceEntitlements').WorkspaceLink>;
}

export function BankerShell({ workspaceName, workspaceLinks }: BankerShellProps) {
  const { bankerId, fullName, email, systemUserId, writeDisabledReason } = useBanker();
  const [tab, setTab] = useState<ShellTab>('dashboard');
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  const reload = useCallback(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    loadBankerWorkQueueData(bankerId)
      .then((data) => {
        if (!cancelled) setState({ kind: 'ready', data });
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

  useEffect(() => {
    const cleanup = reload();
    return cleanup;
  }, [reload]);

  const now = useMemo(() => new Date(), [state]);
  const kpis = useMemo(() => {
    if (state.kind !== 'ready') return null;
    return deriveBankerPersonalActivity(state.data, now);
  }, [state, now]);

  const closingSoonDeals = useMemo(() => {
    if (state.kind !== 'ready') return [];
    const horizonMs = 14 * 24 * 60 * 60 * 1000;
    const nowMs = now.getTime();
    return state.data.deals
      .filter((d) => {
        if (!d.targetCloseDate) return false;
        const t = new Date(d.targetCloseDate).getTime();
        if (Number.isNaN(t)) return false;
        const delta = t - nowMs;
        return delta >= 0 && delta <= horizonMs;
      })
      .slice()
      .sort((a, b) => {
        const at = new Date(a.targetCloseDate ?? '').getTime();
        const bt = new Date(b.targetCloseDate ?? '').getTime();
        return at - bt;
      })
      .slice(0, 6);
  }, [state, now]);

  const topTasks = useMemo(() => {
    if (state.kind !== 'ready') return [];
    return state.data.tasks
      .slice()
      .sort((a, b) => {
        const at = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
        const bt = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
        if (Number.isNaN(at) && Number.isNaN(bt)) return 0;
        if (Number.isNaN(at)) return 1;
        if (Number.isNaN(bt)) return -1;
        return at - bt;
      })
      .slice(0, 3);
  }, [state]);

  const activeNav: LendingOSNavKey = TAB_SPECS.find((t) => t.key === tab)?.nav ?? 'dashboard';
  const activityDealOptions =
    state.kind === 'ready'
      ? state.data.deals.map((deal) => ({ id: deal.id, name: deal.name }))
      : [];

  return (
    <LendingOSLayout
      activeNav={activeNav}
      onNavSelect={(navKey) => {
        const target = TAB_SPECS.find((t) => t.nav === navKey);
        if (target) setTab(target.key);
      }}
      fullName={fullName}
      email={email}
      workspaceName={workspaceName}
      workspaceLinks={workspaceLinks}
    >
      <GreetingHeader
        fullName={fullName}
        email={email}
        writeDisabledReason={writeDisabledReason}
        systemUserId={systemUserId}
        bankerId={bankerId}
        activityDealOptions={activityDealOptions}
        openTaskCount={kpis ? kpis.openTaskCount : undefined}
        onActivityLogged={reload}
        now={now}
      />
      <BankerKpiGrid state={state} now={now} onSelectTab={setTab} />
      <main style={styles.main} role="main" aria-label="Banker workspace">
        <div style={styles.body}>
          <section style={styles.contentArea} aria-label="Banker workspace content">
            <TabBar active={tab} onSelect={setTab} kpis={kpis} state={state} />
            <div style={styles.tabPanel} role="tabpanel" aria-labelledby={`tab-${tab}`}>
              <TabContent tab={tab} />
            </div>
          </section>
          <aside style={styles.rightRail} aria-label="Today's schedule and tasks">
            <RightRail
              state={state}
              closingSoonDeals={closingSoonDeals}
              topTasks={topTasks}
            />
          </aside>
        </div>
      </main>
    </LendingOSLayout>
  );
}

// ---------------------------------------------------------------------------
// Tab bar with count badges
// ---------------------------------------------------------------------------

function TabBar({
  active,
  onSelect,
  kpis,
  state,
}: {
  active: ShellTab;
  onSelect: (t: ShellTab) => void;
  kpis: ReturnType<typeof deriveBankerPersonalActivity> | null;
  state: LoadState;
}) {
  // Phase 125F — count badges derived from the loaded KPIs. We
  // surface counts only when the parent state is `ready`; on
  // loading / failed we render the tab without a badge so the
  // banker doesn't see a transient "0" that resolves to a real
  // count moments later.
  const badges = useMemo(() => {
    if (state.kind !== 'ready' || !kpis) return new Map<ShellTab, number>();
    const m = new Map<ShellTab, number>();
    m.set('active-deals', kpis.activeDeals);
    m.set('tasks', kpis.openTaskCount);
    m.set('due-diligence', kpis.outstandingDocumentCount + kpis.pendingReviewDocumentCount);
    m.set('my-alerts', kpis.urgentItemCount);
    m.set('activity', state.data.deals.length);
    m.set('relationships', dedupeClients(state.data.deals).length);
    m.set('signals', kpis.draftMemoCount);
    return m;
  }, [state, kpis]);

  return (
    <div style={styles.tabBar} role="tablist" aria-label="Banker workspace sections">
      {TAB_SPECS.map((item) => {
        const selected = item.key === active;
        const count = badges.get(item.key);
        return (
          <button
            key={item.key}
            id={`tab-${item.key}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`panel-${item.key}`}
            onClick={() => onSelect(item.key)}
            style={selected ? styles.tabButtonActive : styles.tabButton}
            data-tab-key={item.key}
          >
            <span>{item.label}</span>
            {count !== undefined && count > 0 && (
              <CountBadge
                count={count}
                tone={item.key === 'my-alerts' && count > 0 ? 'atRisk' : 'neutral'}
                aria-label={`${item.label}: ${count}`}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

function dedupeClients(
  deals: ReadonlyArray<{ clientName?: string | undefined }>,
): ReadonlyArray<string> {
  const set = new Set<string>();
  for (const d of deals) {
    if (d.clientName && d.clientName.trim().length > 0) set.add(d.clientName.trim());
  }
  return Array.from(set);
}

function TabContent({ tab }: { tab: ShellTab }) {
  switch (tab) {
    case 'dashboard':
      return (
        <div style={styles.tabStack}>
          <BankerCrmIntelligencePanel />
          <PersonalActivitySummary />
          <BankerMorningCatchUp />
        </div>
      );
    case 'active-deals':
      return (
        <div style={styles.tabStack}>
          <PersonalPipeline />
        </div>
      );
    case 'tasks':
      return (
        <div style={styles.tabStack}>
          <MyWorkQueue />
        </div>
      );
    case 'due-diligence':
      return (
        <div style={styles.tabStack}>
          <BankerDueDiligenceView />
        </div>
      );
    case 'activity':
      return (
        <div style={styles.tabStack}>
          <BankerActivityFeed />
        </div>
      );
    case 'relationships':
      return (
        <div style={styles.tabStack}>
          <RelationshipMemory />
        </div>
      );
    case 'my-alerts':
      return (
        <div style={styles.tabStack}>
          <MyWorkQueue />
        </div>
      );
    case 'signals':
      return (
        <div style={styles.tabStack}>
          <BankerAutopilotRollup />
        </div>
      );
  }
}

// ---------------------------------------------------------------------------
// Right rail
// ---------------------------------------------------------------------------

function RightRail({
  state,
  closingSoonDeals,
  topTasks,
}: {
  state: LoadState;
  closingSoonDeals: readonly { id: string; name: string; targetCloseDate: string | undefined }[];
  topTasks: readonly { id: string; title: string; dueDate: string | undefined }[];
}) {
  return (
    <div style={styles.railStack}>
      <div style={styles.rail}>
        <div style={styles.railHeader}>
          <div style={styles.railTitle}>Today's Schedule</div>
          <Badge variant="neutral" appearance="outline">
            {closingSoonDeals.length}
          </Badge>
        </div>
        <div style={styles.railSubtitle}>
          Target-close dates within 14 days. <em>Not a calendar integration — Outlook is not wired.</em>
        </div>
        {state.kind === 'loading' && <div style={styles.railMuted}>Loading…</div>}
        {state.kind === 'failed' && (
          <div style={styles.railMuted}>
            Could not load schedule preview. Refresh to retry.
          </div>
        )}
        {state.kind === 'ready' && closingSoonDeals.length === 0 && (
          <div style={styles.railMuted}>No meetings today.</div>
        )}
        {state.kind === 'ready' && closingSoonDeals.length > 0 && (
          <ul style={styles.railList}>
            {closingSoonDeals.map((d) => (
              <li key={d.id} style={styles.railItem}>
                <div style={styles.railItemTitle}>{d.name}</div>
                <div style={styles.railItemMeta}>
                  Target close: {formatRelativeDate(d.targetCloseDate)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <MyTasksRailPanel state={state} tasks={topTasks} />
    </div>
  );
}

function MyTasksRailPanel({
  state,
  tasks,
}: {
  state: LoadState;
  tasks: readonly { id: string; title: string; dueDate: string | undefined }[];
}) {
  const pending = state.kind === 'ready' ? state.data.tasks.length : 0;
  return (
    <div style={styles.rail}>
      <div style={styles.railHeader}>
        <div style={styles.railTitle}>My Tasks</div>
        {state.kind === 'ready' && (
          <Badge variant={pending > 0 ? 'atRisk' : 'clear'} appearance="outline">
            {pending} pending
          </Badge>
        )}
      </div>
      <div style={styles.railSubtitle}>
        Top 3 open tasks — overdue first.
      </div>
      {state.kind === 'loading' && <div style={styles.railMuted}>Loading…</div>}
      {state.kind === 'failed' && (
        <div style={styles.railMuted}>Could not load tasks. Refresh to retry.</div>
      )}
      {state.kind === 'ready' && tasks.length === 0 && (
        <div style={styles.railMuted}>No open tasks on your active deals.</div>
      )}
      {state.kind === 'ready' && tasks.length > 0 && (
        <ul style={styles.railList}>
          {tasks.map((t) => (
            <li key={t.id} style={styles.railItem}>
              <div style={styles.railItemTitle}>{t.title}</div>
              <div style={styles.railItemMeta}>{formatTaskDue(t.dueDate)}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatTaskDue(iso: string | undefined): string {
  if (!iso) return 'No due date';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'No due date';
  const absolute = d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const days = Math.round((d.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return `Overdue by ${Math.abs(days)}d (${absolute})`;
  if (days === 0) return `Due today (${absolute})`;
  if (days === 1) return `Due tomorrow (${absolute})`;
  return `Due in ${days}d (${absolute})`;
}

function formatRelativeDate(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const absolute = d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const days = Math.round((d.getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return `today (${absolute})`;
  if (days === 1) return `tomorrow (${absolute})`;
  return `in ${days}d (${absolute})`;
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    padding: `0 ${spacing.xxl} ${spacing.xxl}`,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.lg,
  },
  body: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 320px',
    gap: spacing.lg,
    alignItems: 'flex-start',
  },
  contentArea: {
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    minWidth: 0,
  },
  tabBar: {
    display: 'flex',
    gap: spacing.xs,
    flexWrap: 'wrap',
    background: palette.surface,
    border: `1px solid ${palette.panelBorder}`,
    borderRadius: radius.md,
    padding: spacing.xs,
    boxShadow: shadow.card,
  },
  tabButton: {
    background: 'transparent',
    color: palette.textMuted,
    border: 'none',
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    fontFamily: typography.family,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacing.xs,
  },
  tabButtonActive: {
    background: palette.cobaltBg,
    color: palette.cobaltFg,
    border: 'none',
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
    fontFamily: typography.family,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacing.xs,
  },
  tabPanel: {
    paddingTop: spacing.lg,
    display: 'flex',
    flexDirection: 'column',
  },
  tabStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.lg,
  },
  rightRail: {
    position: 'sticky',
    top: spacing.md,
    alignSelf: 'flex-start',
    minWidth: 0,
  },
  railStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
  },
  rail: {
    background: palette.surface,
    border: `1px solid ${palette.panelBorder}`,
    borderRadius: radius.md,
    boxShadow: shadow.elevated,
    padding: `${spacing.md} ${spacing.lg}`,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
    // Phase 125G — consistent minimum widget height so the rail
    // reads as a row of equal-height operating widgets rather
    // than ragged cards keyed to their content length.
    minHeight: 160,
  },
  railHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  railTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: palette.text,
    letterSpacing: typography.letterSpacing.heading,
    margin: 0,
  },
  railSubtitle: {
    fontSize: typography.size.xs,
    color: palette.textMuted,
    lineHeight: typography.lineHeight.snug,
  },
  railList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
  },
  railItem: {
    padding: `${spacing.sm} ${spacing.md}`,
    background: palette.surfaceAlt,
    border: `1px solid ${palette.divider}`,
    borderLeft: `3px solid ${palette.cobalt}`,
    borderRadius: radius.sm,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  railItemTitle: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: palette.text,
  },
  railItemMeta: {
    fontSize: typography.size.xs,
    color: palette.textMuted,
  },
  railMuted: {
    color: palette.textMuted,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.snug,
    padding: `${spacing.md} ${spacing.sm}`,
    background: palette.surfaceSubtle,
    border: `1px dashed ${palette.border}`,
    borderRadius: radius.sm,
    textAlign: 'center' as const,
  },
};
