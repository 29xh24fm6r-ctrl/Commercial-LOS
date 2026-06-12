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

  it('renders disabled placeholder sidebar items (Schedule / Contacts / Vendors / Settings / Help & Support)', () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    const { container } = render(<BankerShell workspaceName="Banker Workspace" />);
    for (const id of ['schedule', 'contacts', 'vendors', 'settings', 'help']) {
      const placeholder = container.querySelector(`[data-nav-placeholder="${id}"]`);
      expect(placeholder).not.toBeNull();
      expect(placeholder?.getAttribute('aria-disabled')).toBe('true');
    }
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

  it('renders search and + New Deal as disabled placeholders, with Log Activity enabled for governed writers', () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    const { container } = render(<BankerShell workspaceName="Banker Workspace" />);
    // Search input is rendered but disabled
    const search = container.querySelector('[data-search-placeholder="lending-os-search"]');
    expect(search).not.toBeNull();
    expect(search?.getAttribute('disabled')).not.toBeNull();
    expect(screen.getByRole('button', { name: /^Log Activity$/i })).not.toBeDisabled();
    expect(container.querySelector('[data-action-placeholder="-new-deal"]')).not.toBeNull();
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

  it('marks the "Not yet wired" KPI tiles (WEIGHTED / WIN RATE / HIGH PROB / YTD CLOSED) with italic placeholders', async () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    const { container } = render(<BankerShell workspaceName="Banker Workspace" />);
    await waitFor(() => {
      expect(container.querySelectorAll('[data-kpi-tile]').length).toBe(10);
    });
    // The 4 placeholder tiles render "Not yet wired" copy.
    const notYetWired = screen.getAllByText(/Not yet wired/i);
    // 4 tile values + the matching 4 sub-hints (8 minimum).
    expect(notYetWired.length).toBeGreaterThanOrEqual(4);
  });

  it('renders the 8-tab tab bar with the Phase 125F labels', async () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    render(<BankerShell workspaceName="Banker Workspace" />);
    await waitFor(() => {
      const tablist = screen.getByRole('tablist', { name: /banker workspace sections/i });
      expect(within(tablist).getAllByRole('tab').length).toBe(8);
    });
    for (const label of [
      'Dashboard',
      'Active Deals',
      'Tasks & Actions',
      'Due Diligence',
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

  it('renders the right rail with Today\'s Schedule + My Tasks (Closing soon was renamed)', async () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    render(<BankerShell workspaceName="Banker Workspace" />);
    await waitFor(() => {
      expect(screen.getByText(/Today's Schedule/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/^My Tasks$/i)).toBeInTheDocument();
    // The honest "Not a calendar integration" subtitle.
    expect(
      screen.getByText(/Not a calendar integration/i),
    ).toBeInTheDocument();
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

  it('CRM Command Center still renders and + New Deal stays disabled / Log Activity stays available after the KPI change', async () => {
    await renderReady();
    // CRM drill-through entry still present on the dashboard.
    expect(
      await screen.findByRole('region', { name: 'CRM Command Center' }),
    ).toBeInTheDocument();
    // + New Deal remains an honest disabled placeholder.
    const newDeal = document.querySelector('[data-action-placeholder="-new-deal"]');
    expect(newDeal).not.toBeNull();
    expect(newDeal?.getAttribute('disabled')).not.toBeNull();
    // Log Activity remains available for governed writers.
    expect(screen.getByRole('button', { name: /^Log Activity$/i })).not.toBeDisabled();
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

describe('BUGFIX-CRM-VISIBLE — Banker dashboard mounts the CRM Command Center entry', () => {
  it('renders the CRM Command Center entry + CRM preview copy on the default dashboard tab', async () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    render(<BankerShell workspaceName="Banker Workspace" />);
    const crm = await screen.findByRole('region', { name: 'CRM Command Center' });
    // DrillThroughCard renders the title in a face span; use getAllByText for multiple matches.
    expect(within(crm).getAllByText('CRM Command Center').length).toBeGreaterThanOrEqual(1);
    expect(within(crm).getAllByText(/CRM and lending workflow preview intelligence/).length).toBeGreaterThanOrEqual(1);
    // Read-only CRM working surface is mounted alongside the entry.
    expect(within(crm).getByText('CRM Intelligence')).toBeInTheDocument();
  });

  it('keeps existing dashboard cards (Personal Activity + Morning Catch-Up) rendered', async () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    render(<BankerShell workspaceName="Banker Workspace" />);
    expect(await screen.findByTestId('card-personal-activity-summary')).toBeInTheDocument();
    expect(screen.getByTestId('card-morning-catchup')).toBeInTheDocument();
  });

  it('exposes NO sync/push/write/enable-live controls and no fake sync success copy in the CRM entry', async () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    render(<BankerShell workspaceName="Banker Workspace" />);
    const crm = await screen.findByRole('region', { name: 'CRM Command Center' });
    expect(crm.querySelectorAll('button, form, input, select, textarea').length).toBe(0);
    const text = (crm.textContent ?? '').toLowerCase();
    for (const banned of ['sync now', 'push now', 'enable live', 'synced successfully', 'salesforce updated', 'ncino updated', 'write now']) {
      expect(text).not.toContain(banned);
    }
    // Honest read-only framing is present.
    expect(text).toContain('read-only');
  });
});
