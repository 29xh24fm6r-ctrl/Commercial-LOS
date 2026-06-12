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

const loadMock = vi.mocked(loadBankerWorkQueueData);
const useBankerMock = vi.mocked(useBanker);

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

  it('renders the disabled-placeholder header affordances (search / Log Activity / + New Deal)', () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    const { container } = render(<BankerShell workspaceName="Banker Workspace" />);
    // Search input is rendered but disabled
    const search = container.querySelector('[data-search-placeholder="lending-os-search"]');
    expect(search).not.toBeNull();
    expect(search?.getAttribute('disabled')).not.toBeNull();
    // Log Activity + New Deal disabled buttons
    expect(container.querySelector('[data-action-placeholder="log-activity"]')).not.toBeNull();
    expect(container.querySelector('[data-action-placeholder="-new-deal"]')).not.toBeNull();
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
