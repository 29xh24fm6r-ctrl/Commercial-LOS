// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BankerWorkQueueData } from './workQueueQueries';

/**
 * Phase 125F — BankerShell (Lending OS) tests.
 *
 * Replaces the Phase 117/120 invariants with the recomposed shell:
 *   - dark sidebar exposes the Lending OS nav (Dashboard, Active
 *     Deals, My Alerts, Tasks & Actions, Due Diligence, Activity
 *     Log) + disabled placeholders for Schedule / Contacts /
 *     Vendors / Settings / Help & Support;
 *   - GreetingHeader renders the personal greeting + task count
 *     + disabled-placeholder Log Activity / + New Deal / search
 *     affordances;
 *   - flat 10-tile BankerKpiGrid renders with the cockpit-icon
 *     treatment; tiles needing schema we don't have surface
 *     italic "Not yet wired";
 *   - 8-tab content area with count badges driven by derived
 *     work-queue data;
 *   - right rail renders "Today's Schedule" (renamed from
 *     "Closing soon") + "My Tasks";
 *   - read-only banner renders when banker has no Dataverse
 *     systemuser provisioned;
 *   - no Outlook adapter / SendEmailV2 import in the shell (Phase
 *     104–110 communication lock).
 */

vi.mock('./workQueueQueries', () => ({
  loadBankerWorkQueueData: vi.fn(),
}));

vi.mock('./BankerContext', () => ({
  useBanker: vi.fn(),
  BankerIdentityProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('../generated/services/Office365OutlookService', () => ({
  Office365OutlookService: { SendEmailV2: vi.fn() },
}));

vi.mock('../deals/logActivityActions', () => ({
  logActivity: vi.fn(),
}));

vi.mock('./PersonalActivitySummary', () => ({
  PersonalActivitySummary: () => (
    <div data-testid="card-personal-activity-summary">PersonalActivitySummary</div>
  ),
}));
vi.mock('./BankerMorningCatchUp', () => ({
  BankerMorningCatchUp: () => (
    <div data-testid="card-morning-catchup">MorningCatchUp</div>
  ),
}));
vi.mock('./BankerAutopilotRollup', () => ({
  BankerAutopilotRollup: () => (
    <div data-testid="card-autopilot-rollup">AutopilotRollup</div>
  ),
}));
vi.mock('./MyWorkQueue', () => ({
  MyWorkQueue: () => <div data-testid="card-work-queue">MyWorkQueue</div>,
}));
vi.mock('./RelationshipMemory', () => ({
  RelationshipMemory: () => (
    <div data-testid="card-relationship-memory">RelationshipMemory</div>
  ),
}));
vi.mock('./PersonalPipeline', () => ({
  PersonalPipeline: () => (
    <div data-testid="card-personal-pipeline">PersonalPipeline</div>
  ),
}));
vi.mock('./BankerActivityFeed', () => ({
  BankerActivityFeed: () => (
    <div data-testid="card-activity-feed">BankerActivityFeed</div>
  ),
}));
vi.mock('./BankerDueDiligenceView', () => ({
  BankerDueDiligenceView: () => (
    <div data-testid="card-due-diligence">BankerDueDiligenceView</div>
  ),
}));
// Phase 258 — CRM Hub now opens the live CRM workspace (own loader + tests).
// Stub it so the shell tests stay scoped and never hit a live CRM read.
vi.mock('../crm/workspace/CrmHubWorkspace', () => ({
  CrmHubWorkspace: () => (
    <section data-crm-hub="workspace" data-testid="crm-hub-workspace">
      <h2>CRM</h2>
    </section>
  ),
}));
// Phase 258 — Loan Workflow tab now opens the lending workbench (own loader +
// router + tests). Stub it so the shell tests stay scoped.
vi.mock('./BankerLoanWorkflowWorkbench', () => ({
  BankerLoanWorkflowWorkbench: () => (
    <section data-loan-workbench="workspace" data-testid="loan-workbench">
      <h2>Loan Workflow</h2>
    </section>
  ),
}));

import { loadBankerWorkQueueData } from './workQueueQueries';
import { useBanker } from './BankerContext';
import { BankerShell } from './BankerShell';
import { logActivity } from '../deals/logActivityActions';

const loadMock = vi.mocked(loadBankerWorkQueueData);
const useBankerMock = vi.mocked(useBanker);
const logActivityMock = vi.mocked(logActivity);

function emptyData(): BankerWorkQueueData {
  return {
    deals: [],
    tasks: [],
    outstandingDocuments: [],
    pendingReviewDocuments: [],
    memos: [],
    memoSections: [],
  };
}

function dataWithOneDeal(): BankerWorkQueueData {
  return {
    ...emptyData(),
    deals: [
      {
        id: 'deal-1',
        name: 'Expansion Loan',
        clientName: 'Acme Co',
        stage: 'Underwriting',
        status: 'Active',
        amount: 1000000,
        targetCloseDate: '2026-07-01T00:00:00Z',
        lastActivityOn: '2026-06-01T00:00:00Z',
        stageEntryDate: '2026-05-15T00:00:00Z',
        isClosed: false,
        collateralSummary: undefined,
      },
    ],
  };
}

function setUpBanker(overrides: Partial<{ writeDisabledReason: string | undefined }> = {}) {
  useBankerMock.mockReturnValue({
    bankerId: 'banker-1',
    fullName: 'Matt Paller',
    email: 'mpaller@oldglorybank.com',
    systemUserId: 'sys-1',
    writeDisabledReason: undefined,
    ...overrides,
  });
}

beforeEach(() => {
  loadMock.mockReset();
  useBankerMock.mockReset();
  logActivityMock.mockReset();
});

// ---------------------------------------------------------------------------
// Shell layout regions
// ---------------------------------------------------------------------------

describe('Phase 125F — Lending OS shell layout', () => {
  it('renders the dark sidebar with Lending OS navigation', () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    render(<BankerShell workspaceName="Banker Workspace" />);
    const nav = screen.getByRole('navigation', { name: /lending os navigation/i });
    expect(nav).toBeInTheDocument();
    // Brand block
    expect(within(nav).getByText('Lending OS')).toBeInTheDocument();
    expect(within(nav).getByText('Old Glory Bank')).toBeInTheDocument();
  });

  it('renders the canonical sidebar nav items as real (clickable) buttons', () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    render(<BankerShell workspaceName="Banker Workspace" />);
    for (const label of [
      'Dashboard',
      'Active Deals',
      'My Alerts',
      'Tasks & Actions',
      'Due Diligence',
      'Activity Log',
    ]) {
      const button = screen.getByRole('button', { name: new RegExp(`^${label}$`, 'i') });
      expect(button).toBeInTheDocument();
      expect(button).not.toBeDisabled();
    }
  });

  it('hides unbuilt placeholder sidebar items (Schedule / Contacts / Vendors / Settings / Help) from the launch nav', () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    const { container } = render(<BankerShell workspaceName="Banker Workspace" />);
    for (const id of ['schedule', 'contacts', 'vendors', 'settings', 'help']) {
      expect(container.querySelector(`[data-nav-placeholder="${id}"]`)).toBeNull();
    }
    // No disabled "Soon" pill anywhere in the production sidebar.
    expect(screen.queryByText('Soon')).toBeNull();
  });

  it('renders the personal greeting header (h1 + task-count subtitle)', async () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    render(<BankerShell workspaceName="Banker Workspace" />);
    // Greeting is "Good <morning/afternoon/evening>, Matt"
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent).toMatch(/Good \w+, Matt$/);
    // Subtitle resolves after the work-queue load to "You have 0 tasks pending..."
    await waitFor(() => {
      expect(
        screen.getByText(/You have/i),
      ).toBeInTheDocument();
    });
  });

  it('renders the + New Deal header action as an enabled governed shortcut, with Log Activity enabled for governed writers', () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    const { container } = render(<BankerShell workspaceName="Banker Workspace" />);
    // The disabled global-search placeholder is hidden from the launch UI.
    expect(container.querySelector('[data-search-placeholder="lending-os-search"]')).toBeNull();
    expect(screen.getByRole('button', { name: /^Log Activity$/i })).not.toBeDisabled();
    // Phase 257: + New Deal is a real, enabled navigation shortcut (no longer a placeholder).
    const newDeal = container.querySelector('[data-action-new-deal]');
    expect(newDeal).not.toBeNull();
    expect(newDeal?.getAttribute('disabled')).toBeNull();
    expect(container.querySelector('[data-action-placeholder="-new-deal"]')).toBeNull();
  });

  it('keeps Log Activity disabled when governed write identity is unavailable', () => {
    setUpBanker({ writeDisabledReason: 'No cr664_systemuser binding for this banker.' });
    loadMock.mockResolvedValue(emptyData());
    const { container } = render(<BankerShell workspaceName="Banker Workspace" />);
    expect(container.querySelector('[data-action-placeholder="log-activity"]')).not.toBeNull();
  });

  it('logs activity against a selected banker-authorized deal and refreshes dashboard data', async () => {
    setUpBanker();
    loadMock.mockResolvedValue(dataWithOneDeal());
    logActivityMock.mockResolvedValue({ kind: 'success', activityId: 'activity-1' });
    render(<BankerShell workspaceName="Banker Workspace" />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /^Log Activity$/i }));
    const dialog = screen.getByRole('dialog', { name: /^Log activity$/i });
    await user.type(
      within(dialog).getByRole('textbox', { name: /activity note/i }),
      'Client confirmed diligence timeline.',
    );
    await user.click(within(dialog).getByRole('button', { name: /^Log Activity$/i }));

    await waitFor(() => {
      expect(logActivityMock).toHaveBeenCalledWith({
        dealId: 'deal-1',
        dealName: 'Expansion Loan',
        bankerName: 'Matt Paller',
        systemUserId: 'sys-1',
        actorEmail: 'mpaller@oldglorybank.com',
        note: 'Client confirmed diligence timeline.',
      });
    });
    await waitFor(() => {
      expect(loadMock).toHaveBeenCalledTimes(2);
    });
  });

  it('renders the flat KPI grid with 10 tonal tiles', async () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    const { container } = render(<BankerShell workspaceName="Banker Workspace" />);
    await waitFor(() => {
      const tiles = container.querySelectorAll('[data-kpi-tile]');
      expect(tiles.length).toBe(10);
    });
  });

  it('marks the unavailable KPI tiles (WEIGHTED / WIN RATE / HIGH PROB / YTD CLOSED) with bank-user "Not available" copy', async () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    const { container } = render(<BankerShell workspaceName="Banker Workspace" />);
    await waitFor(() => {
      expect(container.querySelectorAll('[data-kpi-tile]').length).toBe(10);
    });
    // The 4 unavailable tiles render "Not available" (no dev "not yet wired" copy).
    const notAvailable = screen.getAllByText(/Not available/i);
    expect(notAvailable.length).toBeGreaterThanOrEqual(4);
    expect(screen.queryByText(/Not yet wired/i)).toBeNull();
  });

  it('renders the tab bar with the Phase 125F labels plus the Phase 257 Loan Workflow + CRM Hub tabs', async () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    render(<BankerShell workspaceName="Banker Workspace" />);
    await waitFor(() => {
      const tablist = screen.getByRole('tablist', { name: /banker workspace sections/i });
      expect(within(tablist).getAllByRole('tab').length).toBe(10);
    });
    for (const label of [
      'Dashboard',
      'Active Deals',
      'Loan Workflow',
      'Tasks & Actions',
      'Due Diligence',
      'CRM Hub',
      'Activity',
      'Relationships',
      'My Alerts',
      'Signals',
    ]) {
      expect(
        screen.getByRole('tab', { name: new RegExp(label, 'i') }),
      ).toBeInTheDocument();
    }
  });

  it('renders the right rail with Closing Soon + My Tasks (no calendar/Outlook dev copy)', async () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    render(<BankerShell workspaceName="Banker Workspace" />);
    await waitFor(() => {
      expect(screen.getByText(/Closing Soon/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/^My Tasks$/i)).toBeInTheDocument();
    expect(screen.getByText(/Deals with a target close within 14 days/i)).toBeInTheDocument();
    expect(screen.queryByText(/Not a calendar integration/i)).toBeNull();
    expect(screen.queryByText(/Outlook is not wired/i)).toBeNull();
  });

  it('switching tabs swaps the rendered card without leaking previous panel content', async () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    render(<BankerShell workspaceName="Banker Workspace" />);
    const user = userEvent.setup();
    // Default tab is Dashboard
    expect(screen.getByTestId('card-personal-activity-summary')).toBeInTheDocument();
    // Switch to Active Deals
    await user.click(screen.getByRole('tab', { name: /^Active Deals$/i }));
    expect(screen.getByTestId('card-personal-pipeline')).toBeInTheDocument();
    expect(screen.queryByTestId('card-personal-activity-summary')).toBeNull();
  });

  it('renders the read-only banner when banker has no Dataverse systemuser', () => {
    setUpBanker({ writeDisabledReason: 'No cr664_systemuser binding for this banker.' });
    loadMock.mockResolvedValue(emptyData());
    render(<BankerShell workspaceName="Banker Workspace" />);
    expect(
      screen.getByText(/No cr664_systemuser binding for this banker/i),
    ).toBeInTheDocument();
    // "Read-only mode" appears twice (badge label + banner). Use getAllByText.
    expect(screen.getAllByText(/Read-only mode/i).length).toBeGreaterThanOrEqual(1);
  });

  it('zero data renders honest zero counts (no fabricated values)', async () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    const { container } = render(<BankerShell workspaceName="Banker Workspace" />);
    await waitFor(() => {
      expect(container.querySelectorAll('[data-kpi-tile]').length).toBe(10);
    });
    // The honest tiles (pipeline, active deals, urgent, etc.) render "0" or "$0".
    expect(container.querySelector('[data-kpi-tile="pipeline"]')?.textContent).toMatch(/\$0/);
    expect(container.querySelector('[data-kpi-tile="active-deals"]')?.textContent).toMatch(/(?:^|\D)0(?:\D|$)/);
  });
});

// ---------------------------------------------------------------------------
// Phase 166 — top dashboard KPI cards open honest destinations (live smoke fix)
// ---------------------------------------------------------------------------

describe('Phase 166 — dashboard KPI card interactions', () => {
  async function renderReady(data = dataWithOneDeal()) {
    setUpBanker();
    loadMock.mockResolvedValue(data);
    const utils = render(<BankerShell workspaceName="Banker Workspace" />);
    // Wait for the real (ready) KPI tiles, not the 10 loading placeholders.
    await waitFor(() => {
      expect(
        utils.container.querySelector('[data-kpi-tile="active-deals"]')?.tagName,
      ).toBe('BUTTON');
    });
    return utils;
  }

  // Assert tab selection via the stable data-tab-key + aria-selected
  // attributes (querySelector, no cloneNode) rather than
  // getByRole('tab', {name}); the latter clones the now-active tab
  // button, which carries a var(--cc-*) background that trips a jsdom
  // shorthand-parsing bug during accessible-name computation.
  function tabSelected(container: HTMLElement, key: string): boolean {
    return (
      container
        .querySelector(`[data-tab-key="${key}"]`)
        ?.getAttribute('aria-selected') === 'true'
    );
  }

  it('Active Deals KPI click selects the Active Deals tab', async () => {
    const { container } = await renderReady();
    const user = userEvent.setup();
    // Default tab is Dashboard.
    expect(screen.getByTestId('card-personal-activity-summary')).toBeInTheDocument();

    const tile = container.querySelector('[data-kpi-tile="active-deals"]') as HTMLButtonElement;
    await user.click(tile);

    expect(tabSelected(container, 'active-deals')).toBe(true);
    expect(screen.getByTestId('card-personal-pipeline')).toBeInTheDocument();
    expect(screen.queryByTestId('card-personal-activity-summary')).toBeNull();
  });

  it('Urgent KPI click selects the My Alerts tab (owns overdue tasks/docs/closes)', async () => {
    const { container } = await renderReady();
    const user = userEvent.setup();
    const tile = container.querySelector('[data-kpi-tile="urgent"]') as HTMLButtonElement;
    expect(tile.getAttribute('data-kpi-target')).toBe('my-alerts');
    await user.click(tile);
    expect(tabSelected(container, 'my-alerts')).toBe(true);
  });

  it('In UW KPI click selects the Active Deals tab (stage-grouped board)', async () => {
    const { container } = await renderReady();
    const user = userEvent.setup();
    const tile = container.querySelector('[data-kpi-tile="in-uw"]') as HTMLButtonElement;
    expect(tile.tagName).toBe('BUTTON');
    await user.click(tile);
    expect(tabSelected(container, 'active-deals')).toBe(true);
  });

  it('keyboard activation (Enter) works on a clickable KPI tile', async () => {
    const { container } = await renderReady();
    const user = userEvent.setup();
    const tile = container.querySelector('[data-kpi-tile="active-deals"]') as HTMLButtonElement;
    tile.focus();
    expect(tile).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(tabSelected(container, 'active-deals')).toBe(true);
  });

  it('not-yet-wired and no-destination KPI tiles are NOT buttons and do not claim clickability', async () => {
    const { container } = await renderReady();
    // Not-yet-wired (bucket C) tiles + honest no-destination tiles.
    for (const id of ['weighted', 'ytd-closed', 'win-rate', 'high-prob', 'closing-soon', 'stale']) {
      const tile = container.querySelector(`[data-kpi-tile="${id}"]`);
      expect(tile, `tile ${id} should render`).not.toBeNull();
      expect(tile?.tagName, `tile ${id} must not be a button`).not.toBe('BUTTON');
      expect(tile?.getAttribute('data-kpi-target')).toBeNull();
      // No cursor:pointer affordance on non-clickable tiles.
      expect((tile as HTMLElement | null)?.style.cursor ?? '').not.toBe('pointer');
    }
  });

  it('clickable KPI tiles expose an honest aria-label naming the destination', async () => {
    const { container } = await renderReady();
    const tile = container.querySelector('[data-kpi-tile="active-deals"]');
    expect(tile?.getAttribute('aria-label')).toMatch(/Open the Active Deals tab\.$/);
  });

  it('+ New Deal stays an enabled shortcut / Log Activity stays available after the KPI change', async () => {
    await renderReady();
    // Phase 257: + New Deal is an enabled governed shortcut.
    const newDeal = document.querySelector('[data-action-new-deal]');
    expect(newDeal).not.toBeNull();
    expect(newDeal?.getAttribute('disabled')).toBeNull();
    // Log Activity remains available for governed writers.
    expect(screen.getByRole('button', { name: /^Log Activity$/i })).not.toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Phase 257 — sidebar nav activation (CRM Hub + Loan Workflow) and the
// governed + New Deal header shortcut.
// ---------------------------------------------------------------------------

describe('Phase 257 — CRM Hub + Loan Workflow nav are wired to real content', () => {
  it('CRM Hub sidebar nav click opens the live CRM workspace (Phase 258 system)', async () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    const { container } = render(<BankerShell workspaceName="Banker Workspace" />);
    const user = userEvent.setup();
    // Default tab is Dashboard.
    expect(screen.getByTestId('card-personal-activity-summary')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^CRM Hub$/i }));

    // Content changed: dashboard cards are gone, the CRM workspace is shown.
    expect(screen.queryByTestId('card-personal-activity-summary')).toBeNull();
    expect(container.querySelector('[data-crm-hub="workspace"]')).not.toBeNull();
    expect(screen.getByTestId('crm-hub-workspace')).toBeInTheDocument();
  });

  it('Loan Workflow sidebar nav click navigates to the real Loan Workflow workspace surface', async () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    const { container } = render(<BankerShell workspaceName="Banker Workspace" />);
    const user = userEvent.setup();
    expect(screen.getByTestId('card-personal-activity-summary')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Loan Workflow$/i }));

    expect(screen.queryByTestId('card-personal-activity-summary')).toBeNull();
    const panel = container.querySelector('[data-banker-loan-workflow="panel"]');
    expect(panel).not.toBeNull();
    expect(
      screen.getByRole('heading', { name: /^Loan Workflow$/i }),
    ).toBeInTheDocument();
    // The lending workbench (entry into per-deal command center) renders.
    expect(screen.getByTestId('loan-workbench')).toBeInTheDocument();
  });

  it('every real sidebar nav button is clickable AND lands on a non-empty content panel (no dead nav)', async () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    const { container } = render(<BankerShell workspaceName="Banker Workspace" />);
    const user = userEvent.setup();
    for (const label of ['CRM Hub', 'Loan Workflow']) {
      const navButton = screen.getByRole('button', { name: new RegExp(`^${label}$`, 'i') });
      expect(navButton).not.toBeDisabled();
      await user.click(navButton);
      // The tab panel always renders some content (never blank).
      const panel = container.querySelector('[role="tabpanel"]');
      expect(panel?.textContent?.trim().length ?? 0).toBeGreaterThan(0);
    }
  });
});

describe('Phase 257 — + New Deal header shortcut opens the governed create flow', () => {
  it('clicking + New Deal routes to the Active Deals New Deal panel (production Intake/Open framing)', async () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    const { container } = render(<BankerShell workspaceName="Banker Workspace" />);
    const user = userEvent.setup();
    // Dashboard first; New Deal panel not yet mounted.
    expect(container.querySelector('[data-banker-new-deal="panel"]')).toBeNull();

    await user.click(screen.getByRole('button', { name: /^Create deal$/i }));

    // The governed New Deal create panel is now visible on the Active Deals tab.
    const panel = container.querySelector('[data-banker-new-deal="panel"]');
    expect(panel).not.toBeNull();
    // Proves the production Stage/Status resolver framing (Intake / Open) is surfaced.
    expect(screen.getByText(/Stage opens at/i)).toBeInTheDocument();
    expect(within(panel as HTMLElement).getByText(/Intake/)).toBeInTheDocument();
    expect(within(panel as HTMLElement).getByText(/Open/)).toBeInTheDocument();
  });

  it('+ New Deal is reachable from a non-dashboard tab too (header shortcut is global)', async () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    const { container } = render(<BankerShell workspaceName="Banker Workspace" />);
    const user = userEvent.setup();
    // Move to Tasks tab first.
    await user.click(screen.getByRole('tab', { name: /^Tasks & Actions$/i }));
    expect(container.querySelector('[data-banker-new-deal="panel"]')).toBeNull();
    // Header + New Deal still routes to the create panel.
    await user.click(screen.getByRole('button', { name: /^Create deal$/i }));
    expect(container.querySelector('[data-banker-new-deal="panel"]')).not.toBeNull();
  });
});

describe('Phase 257 — BankerNewDealCreate uses the production Stage/Status resolver', () => {
  const SRC = readFileSync(resolve(__dirname, 'BankerNewDealCreate.tsx'), 'utf8');

  it('resolves references via resolveProductionNewDealReferences (never a hard-coded GUID)', () => {
    expect(SRC).toMatch(/resolveProductionNewDealReferences\s*\(/);
    expect(SRC).toMatch(/stageLabel:\s*'Intake'/);
    expect(SRC).toMatch(/statusLabel:\s*'Open'/);
  });
});

describe('Phase 125F — BankerShell.tsx static-source pins', () => {
  const SRC = readFileSync(resolve(__dirname, 'BankerShell.tsx'), 'utf8');

  it('does NOT import Office365OutlookService (Phase 110 lock)', () => {
    expect(SRC).not.toMatch(/from\s+['"][^'"]*Office365OutlookService['"]/);
  });

  it('does NOT call SendEmailV2 (Phase 110 single-callsite invariant)', () => {
    expect(SRC).not.toMatch(/SendEmailV2\s*\(/);
  });

  it('does NOT import any sendXEmail governed-write action', () => {
    expect(SRC).not.toMatch(/from\s+['"][^'"]*sendDocumentRequestEmail['"]/);
    expect(SRC).not.toMatch(/from\s+['"][^'"]*sendBorrowerUpdateEmail['"]/);
  });
});

// ---------------------------------------------------------------------------
// BUGFIX-PRODUCTION-CRM-SURFACES-NOT-VISIBLE-1 — CRM entry visible on dashboard
// ---------------------------------------------------------------------------

describe('Phase 258 — CRM is reachable via the CRM Hub tab (its own system)', () => {
  it('opens the live CRM workspace from the CRM Hub tab', async () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    const { container } = render(<BankerShell workspaceName="Banker Workspace" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: /^CRM Hub$/i }));
    expect(container.querySelector('[data-crm-hub="workspace"]')).not.toBeNull();
    expect(screen.getByTestId('crm-hub-workspace')).toBeInTheDocument();
  });

  it('keeps existing dashboard cards (Personal Activity + Morning Catch-Up) rendered', async () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    render(<BankerShell workspaceName="Banker Workspace" />);
    expect(await screen.findByTestId('card-personal-activity-summary')).toBeInTheDocument();
    expect(screen.getByTestId('card-morning-catchup')).toBeInTheDocument();
  });

  it('the dashboard no longer mounts the CRM readiness command center (moved to its own tab)', async () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    render(<BankerShell workspaceName="Banker Workspace" />);
    await screen.findByTestId('card-personal-activity-summary');
    // No CRM Command Center region on the dashboard anymore.
    expect(screen.queryByRole('region', { name: 'CRM Command Center' })).toBeNull();
  });
});
