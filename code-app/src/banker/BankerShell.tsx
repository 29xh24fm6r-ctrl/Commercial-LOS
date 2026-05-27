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
import { EMAIL_MODE } from '../deals/emailDelivery/emailMode';
import { Badge } from '../shared/Badge';
import { palette, radius, shadow, spacing, typography } from '../shared/theme';

/**
 * Phase 117 — Banker Workspace product-grade shell.
 *
 * Replaces the pre-Phase-117 single-column stack with a structured
 * layout: dark left sidebar, top identity header, KPI tile grid,
 * tabbed content area, and right rail for closing-soon items. The
 * shell hoists ONE `loadBankerWorkQueueData` call to power the KPI
 * tiles + right rail; child cards keep their own independent loads
 * to avoid a wide test-surface refactor.
 *
 * Discipline:
 *   - All KPI values come from `deriveBankerPersonalActivity` over
 *     real banker-scoped data. Empty/zero is honest; no fabricated
 *     metrics, no sample data.
 *   - Navigation only exposes sections that actually exist in this
 *     repo (Overview / Pipeline / Action Queue / Relationships /
 *     Signals). Phase 117 explicitly does NOT add Contacts / Due
 *     Diligence / Alerts tabs because the underlying surfaces
 *     don't exist. They are documented as future-phase candidates,
 *     not implied as available.
 *   - No "New Deal" / "Log Activity" header buttons. No governed
 *     write exists for either action; rendering them would imply
 *     unsupported surfaces.
 *   - Phase 104–110 communication-lane lock untouched. The shell
 *     does not import any Outlook adapter, governed-write action,
 *     or email-mode toggle beyond the existing read-only
 *     `EMAIL_MODE` badge.
 *   - Permission-before-render preserved: this component renders
 *     only inside `BankerProvider`, which itself fails closed if
 *     the signed-in user has no `cr664_Banker` row.
 *   - Read-only / write-disabled state surfaced via the existing
 *     `BankerIdentity.writeDisabledReason` (rendered as a banner
 *     when present).
 */

type ShellTab =
  | 'overview'
  | 'pipeline'
  | 'action-queue'
  | 'due-diligence'
  | 'activity'
  | 'relationships'
  | 'signals';

interface NavItem {
  readonly key: ShellTab;
  readonly label: string;
  readonly hint: string;
}

const NAV_ITEMS: readonly NavItem[] = [
  { key: 'overview', label: 'Overview', hint: 'Workload snapshot + morning catch-up' },
  { key: 'pipeline', label: 'Pipeline', hint: 'Your active deals' },
  { key: 'action-queue', label: 'Action Queue', hint: 'Tasks · documents · memos' },
  { key: 'due-diligence', label: 'Due Diligence', hint: 'Documents across all your deals' },
  { key: 'activity', label: 'Activity', hint: 'Recent updates across your deals' },
  { key: 'relationships', label: 'Relationships', hint: 'Per-client snapshot' },
  { key: 'signals', label: 'Signals', hint: 'Autopilot next-best-action signals' },
];

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: BankerWorkQueueData }
  | { kind: 'failed'; message: string };

export interface BankerShellProps {
  /** Phase 120: the workspace name resolved by bootstrap. Surfaced in
   *  the sidebar-footer workspace switcher. The entitlement model
   *  currently surfaces one workspace per user, so the switcher
   *  renders the single-workspace state honestly — no fabricated
   *  "switch to manager" affordance. */
  workspaceName: string;
}

export function BankerShell({ workspaceName }: BankerShellProps) {
  const { bankerId, fullName, email, writeDisabledReason } = useBanker();
  const [tab, setTab] = useState<ShellTab>('overview');
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

  // Phase 119 — top 3 open tasks for the My Tasks rail panel. Overdue
  // tasks sort first (earliest dueDate, including negative deltas),
  // then upcoming. Tasks with no dueDate are sorted last so the rail
  // never silently buries a clearly-overdue row behind a dateless one.
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

  return (
    <div style={styles.page}>
      <Sidebar
        activeTab={tab}
        onSelect={setTab}
        fullName={fullName}
        email={email}
        workspaceName={workspaceName}
      />
      <div style={styles.content}>
        <Header
          fullName={fullName}
          email={email}
          writeDisabledReason={writeDisabledReason}
        />
        <main style={styles.main} role="main" aria-label="Banker workspace">
          <KpiGrid state={state} kpis={kpis} />
          <div style={styles.body}>
            <section style={styles.contentArea} aria-label="Banker workspace content">
              <TabBar active={tab} onSelect={setTab} />
              <div style={styles.tabPanel} role="tabpanel" aria-labelledby={`tab-${tab}`}>
                <TabContent tab={tab} />
              </div>
            </section>
            <aside style={styles.rightRail} aria-label="Upcoming attention">
              <RightRail
                state={state}
                closingSoonDeals={closingSoonDeals}
                topTasks={topTasks}
              />
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

function Sidebar({
  activeTab,
  onSelect,
  fullName,
  email,
  workspaceName,
}: {
  activeTab: ShellTab;
  onSelect: (k: ShellTab) => void;
  fullName: string;
  email: string;
  workspaceName: string;
}) {
  const initials = useMemo(() => deriveInitials(fullName), [fullName]);
  return (
    <nav style={styles.sidebar} aria-label="Banker workspace navigation">
      <div style={styles.brandBlock}>
        <div style={styles.brandMark}>OGB</div>
        <div style={styles.brandStack}>
          <div style={styles.brandName}>Old Glory Bank</div>
          <div style={styles.brandRole}>Banker Workspace</div>
        </div>
      </div>

      <ul style={styles.navList}>
        {NAV_ITEMS.map((item) => {
          const active = item.key === activeTab;
          return (
            <li key={item.key} style={styles.navItem}>
              <button
                type="button"
                onClick={() => onSelect(item.key)}
                aria-current={active ? 'page' : undefined}
                aria-label={`${item.label} — ${item.hint}`}
                style={active ? styles.navButtonActive : styles.navButton}
              >
                <span style={styles.navLabel}>{item.label}</span>
                <span style={styles.navHint}>{item.hint}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <WorkspaceSwitcher workspaceName={workspaceName} />

      <div style={styles.identityCard} aria-label="Signed in banker">
        <div style={styles.identityAvatar} aria-hidden="true">
          {initials}
        </div>
        <div style={styles.identityStack}>
          <div style={styles.identityName}>{fullName}</div>
          <div style={styles.identityEmail}>{email}</div>
        </div>
      </div>
    </nav>
  );
}

/**
 * Phase 120 — sidebar-footer workspace switcher.
 *
 * Honest entitlement model: the bootstrap flow resolves a SINGLE
 * primary workspace per signed-in user via
 * `cr664_platformuser._cr664_primaryworkspace_value`. There is no
 * multi-workspace entitlement table populated in the live env
 * today (the legacy `cr664_workspaceentitlement` rows are not
 * created by the bank's identity-seed workflow — see
 * `src/bootstrap/bootstrapFlow.ts` ¶New chain).
 *
 * The switcher therefore renders as a disabled, single-workspace
 * label — never a fabricated multi-workspace dropdown. A future
 * phase that wires up real multi-workspace entitlements would
 * upgrade this control to interactive.
 */
function WorkspaceSwitcher({ workspaceName }: { workspaceName: string }) {
  const safeName = workspaceName.trim().length > 0
    ? workspaceName
    : 'Banker Workspace';
  return (
    <div
      style={styles.workspaceSwitcher}
      aria-label="Workspace switcher (only one workspace available to your account)"
      role="group"
    >
      <div style={styles.workspaceSwitcherLabel}>Workspace</div>
      <div style={styles.workspaceSwitcherCurrent}>
        <span style={styles.workspaceSwitcherName}>{safeName}</span>
        <span style={styles.workspaceSwitcherPill}>Current</span>
      </div>
      <div style={styles.workspaceSwitcherHint}>
        Only one workspace is entitled to your account.
      </div>
    </div>
  );
}

function deriveInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function Header({
  fullName,
  email,
  writeDisabledReason,
}: {
  fullName: string;
  email: string;
  writeDisabledReason: string | undefined;
}) {
  return (
    <header style={styles.header} aria-label="Banker workspace header">
      <div style={styles.headerBand}>
        <div style={styles.headerTitleBlock}>
          <div style={styles.eyebrowRow}>
            <span style={styles.eyebrowDot} aria-hidden="true" />
            <span style={styles.eyebrow}>Old Glory Bank · Commercial Lending</span>
          </div>
          <h1 style={styles.headerTitle}>Banker Command Center</h1>
          <p style={styles.headerSubtitle}>
            Workload snapshot derived from your authorized pipeline,
            tasks, and document checklist. Conservative copy: no
            performance ranking, no predictive claim, no compensation
            impact.
          </p>
        </div>
        <div style={styles.headerMeta}>
          <Badge
            variant={EMAIL_MODE === 'LIVE' ? 'clear' : 'neutral'}
            appearance="outline"
            aria-label={`Email delivery mode: ${EMAIL_MODE}`}
          >
            Email: {EMAIL_MODE}
          </Badge>
          {writeDisabledReason && (
            <Badge variant="atRisk" appearance="outline" title={writeDisabledReason}>
              Read-only mode
            </Badge>
          )}
        </div>
      </div>
      {writeDisabledReason && (
        <div style={styles.readOnlyBanner} role="status">
          <strong>Read-only mode.</strong> {writeDisabledReason} Write
          actions in this workspace remain disabled until the underlying
          issue is resolved. (Identity chip: {fullName} · {email}.)
        </div>
      )}
    </header>
  );
}

// ---------------------------------------------------------------------------
// KPI grid
// ---------------------------------------------------------------------------

function KpiGrid({
  state,
  kpis,
}: {
  state: LoadState;
  kpis: ReturnType<typeof deriveBankerPersonalActivity> | null;
}) {
  // Honest empty/loading/failed states. No fabricated values.
  // Loading-state placeholder labels are intentionally generic
  // ("Loading…") rather than pre-naming the ready-state tiles so
  // tests using `screen.getByText('Closing soon')` and similar text
  // assertions can disambiguate between the right-rail "Closing soon"
  // panel header and the ready-state KPI tile.
  if (state.kind === 'loading') {
    return (
      <section style={styles.kpiGrid} aria-label="Workload KPIs (loading)">
        {(['Pipeline', 'Work items', 'Attention'] as const).map((groupLabel, idx) => {
          const tileCount = idx === 0 ? 4 : idx === 1 ? 3 : 2;
          return (
            <div key={groupLabel} style={styles.kpiGroup}>
              <div style={styles.kpiGroupHeader}>
                <span style={styles.kpiGroupLabel}>{groupLabel}</span>
                <span style={styles.kpiGroupCaption}>Loading…</span>
              </div>
              <div style={styles.kpiGroupBody}>
                {Array.from({ length: tileCount }).map((_, j) => (
                  <KpiTile
                    key={j}
                    hero={idx === 0 && j < 2}
                    label="Loading…"
                    value="—"
                    hint="Reading current records"
                  />
                ))}
              </div>
            </div>
          );
        })}
      </section>
    );
  }
  if (state.kind === 'failed') {
    return (
      <section style={styles.kpiGrid} aria-label="Workload KPIs (failed)">
        <div style={styles.kpiFailed} role="alert">
          <div style={styles.kpiFailedTitle}>Could not load workload snapshot</div>
          <div style={styles.kpiFailedDetail}>{state.message}</div>
          <div style={styles.kpiFailedHint}>
            Refresh to retry. The cards below load independently and may
            still render.
          </div>
        </div>
      </section>
    );
  }
  const k = kpis!;
  return (
    <section style={styles.kpiGrid} aria-label="Workload KPIs">
      <div style={styles.kpiGroup}>
        <div style={styles.kpiGroupHeader}>
          <span style={styles.kpiGroupLabel}>Pipeline</span>
          <span style={styles.kpiGroupCaption}>Authorized pipeline shape</span>
        </div>
        <div style={styles.kpiGroupBody}>
          <KpiTile
            hero
            label="Active deals"
            value={k.activeDeals.toString()}
            hint="Authorized to you"
          />
          <KpiTile
            hero
            label="Pipeline"
            value={formatCurrencyCompact(k.totalAmount)}
            hint={
              k.dealsMissingAmount > 0
                ? `${k.dealsMissingAmount} deal${k.dealsMissingAmount === 1 ? '' : 's'} missing amount`
                : 'Sum across active deals'
            }
          />
          <KpiTile
            label="In underwriting"
            value={k.inUnderwritingCount.toString()}
            hint="Active deals in Underwriting"
          />
          <KpiTile
            label="Closing soon"
            value={k.closingSoonCount.toString()}
            emphasis={k.closingSoonCount > 0 ? 'info' : undefined}
            hint="Target close ≤ 14 days"
          />
        </div>
      </div>

      <div style={styles.kpiGroup}>
        <div style={styles.kpiGroupHeader}>
          <span style={styles.kpiGroupLabel}>Work items</span>
          <span style={styles.kpiGroupCaption}>Tasks · documents · reviews</span>
        </div>
        <div style={styles.kpiGroupBody}>
          <KpiTile
            label="Open tasks"
            value={k.openTaskCount.toString()}
            emphasis={k.overdueTaskCount > 0 ? 'atRisk' : undefined}
            hint={
              k.overdueTaskCount > 0
                ? `${k.overdueTaskCount} overdue`
                : 'No overdue tasks'
            }
          />
          <KpiTile
            label="Outstanding docs"
            value={k.outstandingDocumentCount.toString()}
            hint="Awaiting receipt"
          />
          <KpiTile
            label="Pending reviews"
            value={k.pendingReviewDocumentCount.toString()}
            emphasis={k.pendingReviewDocumentCount > 0 ? 'atRisk' : undefined}
            hint="Received, no reviewer yet"
          />
        </div>
      </div>

      <div style={styles.kpiGroup}>
        <div style={styles.kpiGroupHeader}>
          <span style={styles.kpiGroupLabel}>Attention</span>
          <span style={styles.kpiGroupCaption}>Things to look at first</span>
        </div>
        <div style={styles.kpiGroupBody}>
          <KpiTile
            label="Urgent items"
            value={k.urgentItemCount.toString()}
            emphasis={k.urgentItemCount > 0 ? 'atRisk' : undefined}
            hint="Overdue tasks + docs + closes"
          />
          <KpiTile
            label="Stale 14d+"
            value={k.staleActivityCount.toString()}
            emphasis={k.staleActivityCount > 0 ? 'atRisk' : undefined}
            hint="No activity in 14+ days"
          />
        </div>
      </div>
    </section>
  );
}

function KpiTile({
  label,
  value,
  hint,
  emphasis,
  hero,
}: {
  label: string;
  value: string;
  hint: string;
  emphasis?: 'atRisk' | 'info';
  /** Phase 123 — premium hero treatment for the two anchor tiles
   *  (Active deals + Pipeline). Larger value, deeper elevation,
   *  subtle accent stripe. No data behavior change. */
  hero?: boolean;
}) {
  const valueColor =
    emphasis === 'atRisk'
      ? palette.atRiskFg
      : emphasis === 'info'
        ? palette.primary
        : palette.text;
  const accentColor =
    emphasis === 'atRisk'
      ? palette.atRisk
      : emphasis === 'info'
        ? palette.primary
        : hero
          ? palette.primary
          : palette.border;
  return (
    <div
      style={{
        ...(hero ? styles.kpiTileHero : styles.kpiTile),
        ...(emphasis || hero
          ? { borderLeft: `3px solid ${accentColor}` }
          : null),
      }}
    >
      <div style={styles.kpiLabel}>{label}</div>
      <div
        style={{
          ...(hero ? styles.kpiValueHero : styles.kpiValue),
          color: valueColor,
        }}
      >
        {value}
      </div>
      <div style={styles.kpiHint}>{hint}</div>
    </div>
  );
}

function formatCurrencyCompact(n: number): string {
  if (n === 0) return '$0';
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000)
    return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000)
    return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

// ---------------------------------------------------------------------------
// Tab bar + tab content
// ---------------------------------------------------------------------------

function TabBar({
  active,
  onSelect,
}: {
  active: ShellTab;
  onSelect: (t: ShellTab) => void;
}) {
  return (
    <div style={styles.tabBar} role="tablist" aria-label="Banker workspace sections">
      {NAV_ITEMS.map((item) => {
        const selected = item.key === active;
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
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function TabContent({ tab }: { tab: ShellTab }) {
  // Each tab composes the existing banker cards. The cards continue
  // to load their own data — no behavior change beyond layout.
  switch (tab) {
    case 'overview':
      return (
        <div style={styles.tabStack}>
          <PersonalActivitySummary />
          <BankerMorningCatchUp />
        </div>
      );
    case 'pipeline':
      return (
        <div style={styles.tabStack}>
          <PersonalPipeline />
        </div>
      );
    case 'action-queue':
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
        <div style={styles.railTitle}>Closing soon</div>
        <div style={styles.railSubtitle}>Deals with a target close in the next 14 days.</div>
        {state.kind === 'loading' && <div style={styles.railMuted}>Loading…</div>}
        {state.kind === 'failed' && (
          <div style={styles.railMuted}>
            Could not load closing-soon list. Refresh to retry.
          </div>
        )}
        {state.kind === 'ready' && closingSoonDeals.length === 0 && (
          <div style={styles.railMuted}>
            No deals with a target close in the next 14 days.
          </div>
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
        <div style={styles.railDisclaimer}>
          Derived from target-close dates on current deals. Not a
          calendar integration — no events are read from or written to
          Outlook / Teams calendars.
        </div>
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
  return (
    <div style={styles.rail}>
      <div style={styles.railTitle}>My Tasks</div>
      <div style={styles.railSubtitle}>
        Top 3 open tasks across your active deals — overdue first.
      </div>
      {state.kind === 'loading' && <div style={styles.railMuted}>Loading…</div>}
      {state.kind === 'failed' && (
        <div style={styles.railMuted}>
          Could not load tasks. Refresh to retry.
        </div>
      )}
      {state.kind === 'ready' && tasks.length === 0 && (
        <div style={styles.railMuted}>
          No open tasks on your active deals.
        </div>
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

// ---------------------------------------------------------------------------
// Styles — inline CSSProperties (matches the existing repo pattern)
// ---------------------------------------------------------------------------

const SIDEBAR_BG = '#0f172a'; // dark navy, matches the visual target
const SIDEBAR_BG_ALT = '#111c33';
const SIDEBAR_TEXT = '#e2e8f0';
const SIDEBAR_TEXT_MUTED = '#94a3b8';
const SIDEBAR_BORDER = 'rgba(148, 163, 184, 0.15)';
const SIDEBAR_ACTIVE_BG = '#1e293b';
const SIDEBAR_ACTIVE_ACCENT = '#60a5fa';

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: 'grid',
    gridTemplateColumns: '240px 1fr',
    minHeight: '100vh',
    fontFamily: typography.family,
    color: palette.text,
    background: palette.pageBg,
  },
  sidebar: {
    background: SIDEBAR_BG,
    color: SIDEBAR_TEXT,
    padding: `${spacing.lg} ${spacing.md}`,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.lg,
    borderRight: `1px solid ${SIDEBAR_BORDER}`,
    position: 'sticky',
    top: 0,
    height: '100vh',
    overflowY: 'auto',
  },
  brandBlock: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    paddingBottom: spacing.md,
    borderBottom: `1px solid ${SIDEBAR_BORDER}`,
  },
  brandMark: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    background: SIDEBAR_ACTIVE_BG,
    color: SIDEBAR_ACTIVE_ACCENT,
    fontWeight: typography.weight.bold,
    fontSize: typography.size.sm,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    letterSpacing: typography.letterSpacing.label,
  },
  brandStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
    minWidth: 0,
  },
  brandName: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: SIDEBAR_TEXT,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  brandRole: {
    fontSize: typography.size.xs,
    color: SIDEBAR_TEXT_MUTED,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase',
  },
  navList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xxs,
    flex: 1,
  },
  navItem: { display: 'flex' },
  navButton: {
    flex: 1,
    background: 'transparent',
    color: SIDEBAR_TEXT_MUTED,
    border: 'none',
    borderRadius: radius.sm,
    padding: `${spacing.sm} ${spacing.md}`,
    textAlign: 'left',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    fontFamily: typography.family,
    borderLeft: '3px solid transparent',
    transition: 'background-color 140ms ease, color 140ms ease, border-left-color 140ms ease',
  },
  navButtonActive: {
    flex: 1,
    background: SIDEBAR_ACTIVE_BG,
    color: SIDEBAR_TEXT,
    border: 'none',
    borderRadius: radius.sm,
    padding: `${spacing.sm} ${spacing.md}`,
    textAlign: 'left',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    fontFamily: typography.family,
    borderLeft: `3px solid ${SIDEBAR_ACTIVE_ACCENT}`,
  },
  navLabel: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
  navHint: {
    fontSize: typography.size.xs,
    color: SIDEBAR_TEXT_MUTED,
    lineHeight: typography.lineHeight.snug,
  },
  workspaceSwitcher: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderTop: `1px solid ${SIDEBAR_BORDER}`,
  },
  workspaceSwitcherLabel: {
    fontSize: typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
    color: SIDEBAR_TEXT_MUTED,
    fontWeight: typography.weight.semibold,
  },
  workspaceSwitcherCurrent: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
    padding: `${spacing.xs} ${spacing.sm}`,
    background: SIDEBAR_BG_ALT,
    border: `1px solid ${SIDEBAR_BORDER}`,
    borderLeft: `3px solid ${SIDEBAR_ACTIVE_ACCENT}`,
    borderRadius: radius.sm,
  },
  workspaceSwitcherName: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: SIDEBAR_TEXT,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  workspaceSwitcherPill: {
    fontSize: typography.size.xs,
    color: SIDEBAR_ACTIVE_ACCENT,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase',
    padding: `2px ${spacing.xs}`,
    border: `1px solid ${SIDEBAR_ACTIVE_ACCENT}`,
    borderRadius: radius.pill,
    fontWeight: typography.weight.semibold,
  },
  workspaceSwitcherHint: {
    fontSize: typography.size.xs,
    color: SIDEBAR_TEXT_MUTED,
    fontStyle: 'italic',
  },
  identityCard: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTop: `1px solid ${SIDEBAR_BORDER}`,
  },
  identityAvatar: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    background: SIDEBAR_BG_ALT,
    color: SIDEBAR_ACTIVE_ACCENT,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: typography.weight.semibold,
    fontSize: typography.size.sm,
  },
  identityStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
    minWidth: 0,
  },
  identityName: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: SIDEBAR_TEXT,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  identityEmail: {
    fontSize: typography.size.xs,
    color: SIDEBAR_TEXT_MUTED,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  header: {
    padding: `${spacing.xl} ${spacing.xxl} 0`,
    background: palette.surface,
    borderBottom: `1px solid ${palette.border}`,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
  },
  headerBand: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: spacing.lg,
    paddingBottom: spacing.xl,
    borderBottom: `1px solid ${palette.divider}`,
    position: 'relative',
  },
  headerTitleBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
    minWidth: 0,
    maxWidth: 720,
  },
  eyebrowRow: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacing.xs,
  },
  eyebrowDot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
    background: palette.primary,
    display: 'inline-block',
  },
  eyebrow: {
    fontSize: typography.size.xs,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase',
    color: palette.primary,
    fontWeight: typography.weight.semibold,
  },
  headerTitle: {
    margin: 0,
    fontSize: typography.size.hero,
    fontWeight: typography.weight.semibold,
    color: palette.text,
    letterSpacing: typography.letterSpacing.hero,
    lineHeight: typography.lineHeight.tight,
  },
  headerSubtitle: {
    margin: 0,
    color: palette.textMuted,
    fontSize: typography.size.md,
    lineHeight: typography.lineHeight.snug,
    maxWidth: 640,
  },
  headerMeta: {
    display: 'flex',
    gap: spacing.xs,
    flexWrap: 'wrap',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  readOnlyBanner: {
    flexBasis: '100%',
    padding: `${spacing.sm} ${spacing.md}`,
    background: palette.atRiskBg,
    color: palette.atRiskFg,
    border: `1px solid ${palette.atRisk}`,
    borderRadius: radius.sm,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.snug,
  },
  main: {
    padding: `${spacing.xl} ${spacing.xxl}`,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.lg,
  },
  kpiGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.lg,
  },
  kpiGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
  },
  kpiGroupHeader: {
    display: 'flex',
    alignItems: 'baseline',
    gap: spacing.sm,
    paddingLeft: 2,
  },
  kpiGroupLabel: {
    fontSize: typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
    color: palette.text,
    fontWeight: typography.weight.bold,
  },
  kpiGroupCaption: {
    fontSize: typography.size.xs,
    color: palette.textSubtle,
    letterSpacing: typography.letterSpacing.label,
  },
  kpiGroupBody: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: spacing.md,
  },
  kpiTile: {
    background: palette.surface,
    border: `1px solid ${palette.border}`,
    borderLeft: `3px solid ${palette.border}`,
    borderRadius: radius.md,
    boxShadow: shadow.card,
    padding: `${spacing.md} ${spacing.lg}`,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    transition: 'box-shadow 160ms ease, transform 160ms ease',
  },
  kpiTileHero: {
    background: palette.surface,
    border: `1px solid ${palette.border}`,
    borderLeft: `3px solid ${palette.primary}`,
    borderRadius: radius.md,
    boxShadow: shadow.elevated,
    padding: `${spacing.lg} ${spacing.xl}`,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    minHeight: 110,
  },
  kpiLabel: {
    fontSize: typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
    color: palette.textSubtle,
    fontWeight: typography.weight.semibold,
  },
  kpiValue: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.semibold,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: typography.letterSpacing.heading,
    lineHeight: typography.lineHeight.tight,
  },
  kpiValueHero: {
    fontSize: typography.size.hero,
    fontWeight: typography.weight.bold,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: typography.letterSpacing.hero,
    lineHeight: typography.lineHeight.tight,
  },
  kpiHint: {
    fontSize: typography.size.xs,
    color: palette.textMuted,
    lineHeight: typography.lineHeight.snug,
  },
  kpiFailed: {
    gridColumn: '1 / -1',
    background: palette.atRiskBg,
    border: `1px solid ${palette.atRisk}`,
    borderRadius: radius.sm,
    padding: spacing.md,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  kpiFailedTitle: {
    fontWeight: typography.weight.semibold,
    color: palette.atRiskFg,
    fontSize: typography.size.md,
  },
  kpiFailedDetail: {
    color: palette.text,
    fontSize: typography.size.sm,
  },
  kpiFailedHint: {
    color: palette.textMuted,
    fontSize: typography.size.xs,
    fontStyle: 'italic',
  },
  body: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 300px',
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
    borderBottom: `1px solid ${palette.border}`,
    background: palette.surface,
    paddingBottom: 0,
    paddingLeft: spacing.xs,
    paddingRight: spacing.xs,
    borderRadius: `${radius.md}px ${radius.md}px 0 0`,
  },
  tabButton: {
    position: 'relative',
    background: 'transparent',
    color: palette.textMuted,
    border: 'none',
    borderBottom: '2px solid transparent',
    padding: `${spacing.sm} ${spacing.md}`,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    fontFamily: typography.family,
    cursor: 'pointer',
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase',
    marginBottom: -1,
    transition: 'color 140ms ease, border-bottom-color 140ms ease',
  },
  tabButtonActive: {
    position: 'relative',
    background: 'transparent',
    color: palette.primary,
    border: 'none',
    borderBottom: `2px solid ${palette.primary}`,
    padding: `${spacing.sm} ${spacing.md}`,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
    fontFamily: typography.family,
    cursor: 'pointer',
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase',
    marginBottom: -1,
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
    border: `1px solid ${palette.border}`,
    borderTop: `3px solid ${palette.primary}`,
    borderRadius: radius.md,
    boxShadow: shadow.elevated,
    padding: `${spacing.md} ${spacing.lg}`,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
  },
  railTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
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
    borderLeft: `3px solid ${palette.primary}`,
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
  railDisclaimer: {
    fontSize: typography.size.xs,
    color: palette.textSubtle,
    lineHeight: typography.lineHeight.snug,
    paddingTop: spacing.xs,
    borderTop: `1px solid ${palette.divider}`,
  },
};
