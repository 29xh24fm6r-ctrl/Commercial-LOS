import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useBanker } from './BankerContext';
import {
  loadBankerWorkQueueData,
  type BankerWorkQueueData,
} from './workQueueQueries';
import { boundedRetry } from '../shared/async/boundedRetry';
import { deriveBankerPersonalActivity } from '../shared/analytics/bankerPersonalActivity';
import { parseCalendarDate, formatCalendarDate, daysUntilCalendarDate } from '../shared/formatters';
import { PersonalActivitySummary } from './PersonalActivitySummary';
import { BankerMorningCatchUp } from './BankerMorningCatchUp';
import { BankerAutopilotRollup } from './BankerAutopilotRollup';
import { MyWorkQueue } from './MyWorkQueue';
import { RelationshipMemory } from './RelationshipMemory';
import { PersonalPipeline } from './PersonalPipeline';
import { BankerActivityFeed } from './BankerActivityFeed';
import { BankerDueDiligenceView } from './BankerDueDiligenceView';
import { BankerNewDealCreate } from './BankerNewDealCreate';
import { BankerLoanWorkflowTab } from './BankerLoanWorkflowTab';
import { LendingOSLayout, type LendingOSNavKey } from './LendingOSLayout';
import { GreetingHeader } from './GreetingHeader';
import { BankerKpiGrid } from './BankerKpiGrid';
import { WORKSPACE_ROUTES } from '../bootstrap/workspaceRoutes';
import { CrmHubWorkspace } from '../crm/workspace/CrmHubWorkspace';
import { BankerOperatingCommandCenter } from './BankerOperatingCommandCenter';
import { ErrorBoundary } from '../shared/ErrorBoundary';
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
  | 'crm-hub'
  | 'loan-workflow'
  | 'signals';

interface TabSpec {
  readonly key: ShellTab;
  readonly label: string;
  readonly nav: LendingOSNavKey;
}

const TAB_SPECS: ReadonlyArray<TabSpec> = [
  { key: 'dashboard', label: 'Dashboard', nav: 'dashboard' },
  { key: 'active-deals', label: 'Active Deals', nav: 'active-deals' },
  { key: 'loan-workflow', label: 'Loan Workflow', nav: 'loan-workflow' },
  { key: 'tasks', label: 'Tasks & Actions', nav: 'tasks' },
  { key: 'due-diligence', label: 'Due Diligence', nav: 'due-diligence' },
  { key: 'crm-hub', label: 'CRM Hub', nav: 'crm-hub' },
  { key: 'activity', label: 'Activity', nav: 'activity' },
  { key: 'relationships', label: 'Relationships', nav: 'relationships' },
  { key: 'my-alerts', label: 'My Alerts', nav: 'my-alerts' },
  { key: 'signals', label: 'Signals', nav: 'signals' },
];

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: BankerWorkQueueData }
  | { kind: 'failed'; message: string };

/**
 * Post-create readback confirmation state for a just-created deal. A create
 * returning `createdDealId` does not guarantee the pipeline read (a separate
 * fetch, potentially a different cache/replica tier) reflects it yet, so the
 * shell confirms the EXACT id appears before navigating — never falling back
 * to a previous/default deal, and never navigating on an unconfirmed guess.
 */
type DealCreateConfirmState =
  | { kind: 'idle' }
  | { kind: 'confirming'; createdDealId: string }
  | { kind: 'timed-out'; createdDealId: string };

/** Bounded readback retry budget for confirming a just-created deal appears
 *  in the pipeline before navigating to it. Small and fixed — never
 *  uncontrolled polling. Worst case: 5 attempts, ~4 * 400ms ≈ 1.6s. */
const DEAL_CREATE_READBACK_MAX_ATTEMPTS = 5;
const DEAL_CREATE_READBACK_DELAY_MS = 400;

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

/**
 * Remediation 2026-07-22 (Workstream C) — the deal cockpit is a separate route from this shell's
 * own local-tab navigation, so a nav click from inside a deal must navigate back to this route
 * carrying which tab to land on, rather than silently doing nothing. Validates against the real
 * tab set so a stale/forged location.state can never select a tab that doesn't exist.
 */
function resolveInitialTab(state: unknown): ShellTab {
  if (state && typeof state === 'object' && 'initialTab' in state) {
    const candidate = (state as { initialTab?: unknown }).initialTab;
    if (typeof candidate === 'string' && TAB_SPECS.some((t) => t.key === candidate)) {
      return candidate as ShellTab;
    }
  }
  return 'dashboard';
}

export function BankerShell({ workspaceName, workspaceLinks }: BankerShellProps) {
  const { bankerId, fullName, email, systemUserId, writeDisabledReason } = useBanker();
  const location = useLocation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<ShellTab>(() => resolveInitialTab(location.state));
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  // Bugfix — the post-create readback retry in `onDealCreated` below is a multi-await async
  // function that can still be in flight (mid-retry-delay) when this shell unmounts (tab switch /
  // route change / test teardown). Without this guard, its eventual `setState`/`navigate` calls
  // fire against an unmounted component, and an uncaught rejection from the retry itself becomes an
  // unhandled rejection that outlives the component entirely.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const reload = useCallback(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    loadBankerWorkQueueData(bankerId, { includeTestDeals: true })
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

  // Phase 257 — the header "+ New Deal" shortcut routes to the Active Deals
  // tab's governed New Deal panel (the single create surface) and focuses it.
  // The panel itself enforces authorization, the production Stage/Status
  // resolver, and audit; the header is only a navigation shortcut.
  const [newDealFocusNonce, setNewDealFocusNonce] = useState(0);
  const openNewDeal = useCallback(() => {
    setTab('active-deals');
    setNewDealFocusNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    if (newDealFocusNonce === 0) return;
    const raf = requestAnimationFrame(() => {
      const target = document.querySelector('[data-header-new-deal-target]');
      try {
        (target as HTMLElement | null)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch {
        // scrollIntoView is a no-op in non-DOM/test environments.
      }
      document
        .querySelector<HTMLInputElement>('[data-banker-new-deal-name]')
        ?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [newDealFocusNonce]);

  // Remediation 2026-07-22 (Workstream E) — PersonalPipeline (the Kanban board) does its own
  // independent loadBankerPipeline fetch, entirely separate from this shell's own `state`. Bumping
  // this nonce (passed down as PersonalPipeline's refreshToken) is what makes a just-created deal
  // appear on the board in-session instead of only after a tab switch / reload; `reload()` below
  // refreshes this shell's own KPIs (including the pipeline-total) the same way MyWorkQueue's
  // onDataChanged already does for tasks.
  const [dealsRefreshNonce, setDealsRefreshNonce] = useState(0);
  const [dealCreateConfirm, setDealCreateConfirm] = useState<DealCreateConfirmState>({ kind: 'idle' });
  const onDealCreated = useCallback(
    async (createdDealId: string) => {
      // Bump PersonalPipeline's refetch + refresh this shell's own KPIs immediately — both are
      // best-effort UI refreshes independent of the confirmation below.
      setDealsRefreshNonce((n) => n + 1);
      reload();
      if (!mountedRef.current) return;
      setDealCreateConfirm({ kind: 'confirming', createdDealId });

      // A create returning createdDealId does not guarantee THIS read reflects it yet (a
      // read-after-write race against a separate fetch/cache tier) — confirm the EXACT id
      // actually appears before navigating. A stale first read that doesn't include it is
      // expected and retried; an unrelated existing deal is never substituted. Dynamic import
      // keeps the static graph SDK-free, matching BankerNewDealCreate.tsx's own dynamic-import
      // use of the same dealQueries module.
      //
      // The retry itself (and the readback read it drives) can reject — a thrown/rejected
      // `attempt()`, or a shape the caller didn't expect. That must never surface as an unhandled
      // promise rejection (this is a fire-and-forget callback from BankerNewDealCreate, not
      // something its caller awaits); it is treated the same as an unconfirmed readback — the
      // deal itself was already created successfully before this point, only confirmation failed.
      let satisfied = false;
      try {
        const { loadBankerPipeline } = await import('./dealQueries');
        const result = await boundedRetry({
          attempt: () => loadBankerPipeline(bankerId),
          // Fail-closed: a malformed/non-array readback result (e.g. from a failed shape, or a
          // stubbed test double that never sets a return value) must never be trusted as
          // confirmation just because `.some` happened not to throw.
          isSatisfied: (deals) => Array.isArray(deals) && deals.some((deal) => deal.id === createdDealId),
          maxAttempts: DEAL_CREATE_READBACK_MAX_ATTEMPTS,
          delayMs: DEAL_CREATE_READBACK_DELAY_MS,
        });
        satisfied = result.satisfied;
      } catch {
        satisfied = false;
      }

      // The shell may have unmounted while the retry was mid-flight (tab switch, route change,
      // test teardown) — never update state or navigate after that.
      if (!mountedRef.current) return;
      if (satisfied) {
        setDealCreateConfirm({ kind: 'idle' });
        navigate(`/deals/${createdDealId}`);
      } else {
        setDealCreateConfirm({ kind: 'timed-out', createdDealId });
      }
    },
    [bankerId, reload, navigate],
  );

  const now = useMemo(() => new Date(), [state]);
  const kpis = useMemo(() => {
    if (state.kind !== 'ready') return null;
    return deriveBankerPersonalActivity(state.data, now);
  }, [state, now]);

  const closingSoonDeals = useMemo(() => {
    if (state.kind !== 'ready') return [];
    const horizonMs = 14 * 24 * 60 * 60 * 1000;
    // Remediation 2026-07-22 (Workstream H) — targetCloseDate is date-only; comparing a raw
    // `new Date(...)` (UTC midnight) against the exact current instant shifted the 14-day window
    // boundary by several hours for any US timezone (a deal closing "today" could drop out of the
    // window hours before today locally ends). Compare against the start of today instead.
    const startOfTodayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return state.data.deals
      .filter((d) => {
        const t = parseCalendarDate(d.targetCloseDate)?.getTime();
        if (t === undefined) return false;
        const delta = t - startOfTodayMs;
        return delta >= 0 && delta <= horizonMs;
      })
      .slice()
      .sort((a, b) => {
        const at = parseCalendarDate(a.targetCloseDate)?.getTime() ?? Number.POSITIVE_INFINITY;
        const bt = parseCalendarDate(b.targetCloseDate)?.getTime() ?? Number.POSITIVE_INFINITY;
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
        if (navKey === 'crm-hub') {
          // Update local state as well so isolated shell tests and any slow route
          // transition never leave a blank panel. In production the route change
          // immediately unmounts this shell.
          setTab('crm-hub');
          navigate(WORKSPACE_ROUTES.crm);
          return;
        }
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
        pipelineAmount={kpis ? kpis.totalAmount : undefined}
        dealsMissingAmount={kpis ? kpis.dealsMissingAmount : undefined}
        urgentCount={kpis ? kpis.urgentItemCount : undefined}
        onActivityLogged={reload}
        onNewDeal={openNewDeal}
        now={now}
      />
      <BankerKpiGrid state={state} now={now} onSelectTab={setTab} />
      <main style={styles.main} role="main" aria-label="Banker workspace">
        <div style={styles.body}>
          <section style={styles.contentArea} aria-label="Banker workspace content">
            <TabBar
              active={tab}
              onSelect={(next) => {
                setTab(next);
                if (next === 'crm-hub') navigate(WORKSPACE_ROUTES.crm);
              }}
              kpis={kpis}
              state={state}
            />
            <div style={styles.tabPanel} role="tabpanel" aria-labelledby={`tab-${tab}`}>
              <ErrorBoundary surface={TAB_SPECS.find((t) => t.key === tab)?.label ?? 'This section'} navKey={tab}>
                <TabContent
                  tab={tab}
                  onNewDeal={openNewDeal}
                  crmIdentity={{ email, systemUserId, writeDisabledReason }}
                  kpis={kpis}
                  deals={state.kind === 'ready' ? state.data.deals : []}
                  loading={state.kind === 'loading'}
                  healthError={state.kind === 'failed' ? state.message : undefined}
                  onWorkQueueDataChanged={reload}
                  onSelectTab={setTab}
                  onDealCreated={onDealCreated}
                  dealsRefreshNonce={dealsRefreshNonce}
                  dealCreateConfirm={dealCreateConfirm}
                  newDealFocusNonce={newDealFocusNonce}
                />
              </ErrorBoundary>
            </div>
          </section>
          <aside style={styles.rightRail} aria-label="Today's schedule and tasks">
            <RightRail
              state={state}
              closingSoonDeals={closingSoonDeals}
              topTasks={topTasks}
              onOpenTask={(dealId) => navigate(`/deals/${dealId}`)}
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

function TabContent({
  tab,
  onNewDeal,
  crmIdentity,
  kpis,
  deals,
  loading,
  healthError,
  onSelectTab,
  onWorkQueueDataChanged,
  onDealCreated,
  dealsRefreshNonce,
  dealCreateConfirm,
  newDealFocusNonce,
}: {
  tab: ShellTab;
  onNewDeal: () => void;
  crmIdentity: { email: string | undefined; systemUserId: string | undefined; writeDisabledReason: string | undefined };
  kpis: ReturnType<typeof deriveBankerPersonalActivity> | null;
  deals: readonly import('./dealQueries').PipelineDeal[];
  loading: boolean;
  /** Set when loadBankerWorkQueueData failed — distinct from "still loading". */
  healthError?: string;
  onSelectTab: (tab: ShellTab) => void;
  /**
   * Remediation 2026-07-22 (Workstream F) — MyWorkQueue fetches its own
   * BankerWorkQueueData snapshot independently of this shell's own `state`
   * (tab badges, header "N tasks pending", right-rail My Tasks panel). Without
   * this callback, completing a task or acting on a document inside the
   * "Tasks & Actions" / "My Alerts" tabs updated MyWorkQueue's own list but
   * left every shell-level count stale until the banker navigated away and back.
   */
  onWorkQueueDataChanged: () => void;
  /**
   * Bumps dealsRefreshNonce + reloads shell KPIs, then confirms the exact
   * created record via a bounded readback retry and navigates to it (see
   * `dealCreateConfirm` below for the pending/timeout UI this drives).
   */
  onDealCreated: (createdDealId: string) => Promise<void> | void;
  /** Passed to PersonalPipeline as its refreshToken. */
  dealsRefreshNonce: number;
  /** Post-create readback confirmation state — renders a visible, honest
   *  message when confirmation times out instead of silently doing nothing. */
  dealCreateConfirm: DealCreateConfirmState;
  /**
   * Factory Arc Phase 7 — bumped by the header "+ New Deal" shortcut. The Active Deals tab keeps
   * the create panel collapsed by default (the pipeline list is what a banker actually wants to see
   * when they click "Active Deals") and expands it only when this nonce increments.
   */
  newDealFocusNonce: number;
}) {
  // Factory Arc Phase 7 — the New Deal wizard was always fully rendered above the pipeline list,
  // so clicking "Active Deals" in the nav surfaced a multi-step create form before a banker's
  // actual deal list. Collapsed by default; the header "+ New Deal" shortcut (newDealFocusNonce)
  // expands it and the existing scroll/focus effect still lands on it correctly.
  const [newDealPanelOpen, setNewDealPanelOpen] = useState(false);
  useEffect(() => {
    if (newDealFocusNonce > 0) setNewDealPanelOpen(true);
  }, [newDealFocusNonce]);

  switch (tab) {
    case 'dashboard':
      return (
        <div style={styles.tabStack}>
          <BankerOperatingCommandCenter
            kpis={kpis}
            deals={deals}
            loading={loading}
            healthError={healthError}
            onSelectTab={onSelectTab}
          />
          <PersonalActivitySummary />
          <BankerMorningCatchUp />
        </div>
      );
    case 'active-deals':
      return (
        <div style={styles.tabStack}>
          <PersonalPipeline refreshToken={dealsRefreshNonce} />
          {dealCreateConfirm.kind === 'timed-out' && (
            <div
              style={styles.dealCreateConfirmTimeout}
              role="alert"
              data-banker-deal-create-confirm="timed-out"
            >
              The deal (id {dealCreateConfirm.createdDealId}) was created but could not yet be
              confirmed in your pipeline. Refresh to check again — it is not lost.
            </div>
          )}
          <div data-header-new-deal-target>
            {newDealPanelOpen ? (
              <BankerNewDealCreate
                onCreated={onDealCreated}
                dealPlacementConfirmation={
                  dealCreateConfirm.kind === 'confirming' || dealCreateConfirm.kind === 'timed-out'
                    ? dealCreateConfirm.kind
                    : undefined
                }
              />
            ) : (
              <button
                type="button"
                style={styles.newDealToggle}
                onClick={() => setNewDealPanelOpen(true)}
                data-banker-new-deal-toggle
              >
                + New Deal
              </button>
            )}
          </div>
        </div>
      );
    case 'loan-workflow':
      return (
        <div style={styles.tabStack}>
          <BankerLoanWorkflowTab onNewDeal={onNewDeal} />
        </div>
      );
    case 'crm-hub':
      return (
        <div style={styles.tabStack}>
          <CrmHubWorkspace
            actorEmail={crmIdentity.email}
            actorSystemUserId={crmIdentity.systemUserId}
            writeDisabledReason={crmIdentity.writeDisabledReason}
          />
        </div>
      );
    case 'tasks':
      return (
        <div style={styles.tabStack}>
          <MyWorkQueue onDataChanged={onWorkQueueDataChanged} />
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
      // P1-10 / P2-17 — the My Alerts badge counts the urgent (blocked + overdue) tier, so its
      // destination shows exactly that alert slice, not the full Tasks & Actions work list.
      return (
        <div style={styles.tabStack}>
          <MyWorkQueue filter="alerts" onDataChanged={onWorkQueueDataChanged} />
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
  onOpenTask,
}: {
  state: LoadState;
  closingSoonDeals: readonly { id: string; name: string; targetCloseDate: string | undefined }[];
  topTasks: readonly { id: string; dealId: string; title: string; dueDate: string | undefined }[];
  onOpenTask: (dealId: string) => void;
}) {
  return (
    <div style={styles.railStack}>
      <div style={styles.rail}>
        <div style={styles.railHeader}>
          <div style={styles.railTitle}>Closing Soon</div>
          <Badge variant="neutral" appearance="outline">
            {closingSoonDeals.length}
          </Badge>
        </div>
        <div style={styles.railSubtitle}>
          Deals with a target close within 14 days.
        </div>
        {state.kind === 'loading' && <div style={styles.railMuted}>Loading…</div>}
        {state.kind === 'failed' && (
          <div style={styles.railMuted}>
            Could not load schedule preview. Refresh to retry.
          </div>
        )}
        {state.kind === 'ready' && closingSoonDeals.length === 0 && (
          <div style={styles.railMuted}>No deals closing in the next 14 days.</div>
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

      <MyTasksRailPanel state={state} tasks={topTasks} onOpenTask={onOpenTask} />
    </div>
  );
}

function MyTasksRailPanel({
  state,
  tasks,
  onOpenTask,
}: {
  state: LoadState;
  tasks: readonly { id: string; dealId: string; title: string; dueDate: string | undefined }[];
  onOpenTask: (dealId: string) => void;
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
            <li
              key={t.id}
              style={{ ...styles.railItem, cursor: 'pointer' }}
              className="cc-row-hover"
              onClick={() => onOpenTask(t.dealId)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onOpenTask(t.dealId);
                }
              }}
              tabIndex={0}
              role="link"
              aria-label={`Open deal for task ${t.title}`}
            >
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
  const target = parseCalendarDate(iso);
  if (!target) return '—';
  const absolute = formatCalendarDate(iso);
  const days = daysUntilCalendarDate(iso);
  if (days === undefined || days <= 0) return `today (${absolute})`;
  if (days === 1) return `tomorrow (${absolute})`;
  return `in ${days}d (${absolute})`;
}

const styles: Record<string, React.CSSProperties> = {
  dealCreateConfirmTimeout: {
    background: palette.atRiskBg,
    border: `1px solid ${palette.atRisk}`,
    borderRadius: radius.sm,
    padding: `${spacing.sm} ${spacing.md}`,
    color: palette.text,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.snug,
  },
  newDealToggle: {
    alignSelf: 'flex-start',
    background: palette.cobalt,
    color: palette.textInverse,
    border: 'none',
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
    fontFamily: typography.family,
    cursor: 'pointer',
  },
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
  workflowGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: spacing.md,
  },
  workflowCard: {
    background: palette.surface,
    border: `1px solid ${palette.panelBorder}`,
    borderRadius: radius.md,
    boxShadow: shadow.card,
    padding: `${spacing.lg} ${spacing.xl}`,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
  },
  workflowValue: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    color: palette.cobalt,
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
