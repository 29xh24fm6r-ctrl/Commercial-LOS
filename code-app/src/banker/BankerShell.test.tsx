// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BankerWorkQueueData } from './workQueueQueries';

/**
 * Phase 117 — BankerShell tests.
 *
 * Pins the product-grade shell layout introduced in Phase 117:
 *   - shell renders the dark sidebar with the five tab affordances;
 *   - shell renders the KPI grid with six tiles drawn from real
 *     derivation (no fabricated metrics);
 *   - empty-zero state is honest (no "would have" or "expected"
 *     fabrication);
 *   - no fake routes / tabs are surfaced (Contacts, Due Diligence,
 *     Alerts, New Deal, Log Activity are all absent);
 *   - read-only banner renders when banker has no Dataverse
 *     systemuser provisioned (write-disabled mode honored);
 *   - tab switching changes the rendered child card without leaking
 *     other tabs;
 *   - no Outlook adapter / SendEmailV2 import (Phase 104–110
 *     communication lock preserved).
 */

vi.mock('./workQueueQueries', () => ({
  loadBankerWorkQueueData: vi.fn(),
}));

vi.mock('./BankerContext', () => ({
  useBanker: vi.fn(),
  BankerIdentityProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// SDK boundary: the shell + several child cards transitively import
// outlookEmailAdapters. Stub the connector so the @microsoft/power-
// apps SDK is not loaded by this rendering test.
vi.mock('../generated/services/Office365OutlookService', () => ({
  Office365OutlookService: { SendEmailV2: vi.fn() },
}));

// Child cards that load their own data — stub their loaders so the
// shell test focuses on layout, not card internals. Their own
// rendering invariants are pinned by their own test files.
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

describe('Phase 117 — BankerShell layout regions render', () => {
  it('renders the sidebar nav with all canonical sections (Phase 117 five + Phase 120 two)', () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    render(<BankerShell workspaceName="Banker Workspace" />);

    const nav = screen.getByRole('navigation', { name: /banker workspace navigation/i });
    expect(nav).toBeInTheDocument();
    // The sidebar's nav items are buttons with aria-label that
    // includes the section label.
    expect(
      screen.getByRole('button', { name: /^Overview — Workload snapshot/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Pipeline — Your active deals/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Action Queue — Tasks/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Due Diligence — Documents across all your deals/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Activity — Recent updates across your deals/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Relationships — Per-client snapshot/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Signals — Autopilot next-best-action/i }),
    ).toBeInTheDocument();
  });

  it('renders the workspace header with the title + identity', () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    render(<BankerShell workspaceName="Banker Workspace" />);
    expect(
      screen.getByRole('heading', { name: /Banker Command Center/i }),
    ).toBeInTheDocument();
    // Identity chip in sidebar
    expect(screen.getByText('Matt Paller')).toBeInTheDocument();
    expect(screen.getByText('mpaller@oldglorybank.com')).toBeInTheDocument();
  });

  it('renders the tab bar with seven tabs (Phase 117 five + Phase 120 two)', () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    render(<BankerShell workspaceName="Banker Workspace" />);
    const tablist = screen.getByRole('tablist', { name: /banker workspace sections/i });
    const tabs = screen.getAllByRole('tab');
    expect(tabs.length).toBe(7);
    expect(tablist).toBeInTheDocument();
  });

  it('renders the right rail with the "Closing soon" panel', () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    render(<BankerShell workspaceName="Banker Workspace" />);
    expect(screen.getByText('Closing soon')).toBeInTheDocument();
    expect(
      screen.getByText(/deals with a target close in the next 14 days/i),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// KPI grid — derived from real data, no fabrication
// ---------------------------------------------------------------------------

describe('Phase 117 — KPI grid is derived from BankerWorkQueueData', () => {
  it('renders the six Phase-117 tiles labeled Active deals / Pipeline / Closing soon / Open tasks / Outstanding docs / Pending reviews', async () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    render(<BankerShell workspaceName="Banker Workspace" />);

    await waitFor(() => {
      expect(screen.getByText('Active deals')).toBeInTheDocument();
    });

    // Scope KPI label assertions to the KPI grid region so the
    // "Closing soon" right-rail title and "Pipeline" tab nav button
    // (same strings appear in those other regions) don't trigger
    // multiple-match errors.
    //
    // Phase 123 — the KPI grid now organizes the 9 tiles into 3
    // semantic groups (Pipeline / Work items / Attention) with a
    // chrome-style group label above each sub-grid. The word
    // "Pipeline" therefore appears twice inside the kpiGrid region:
    // once as the group-header label and once as the actual KPI
    // tile. The assertions below acknowledge that intentionally —
    // `getAllByText('Pipeline').length` is 2.
    const kpiGrid = screen.getByRole('region', { name: /Workload KPIs$/i });
    expect(within(kpiGrid).getByText('Active deals')).toBeInTheDocument();
    expect(within(kpiGrid).getAllByText('Pipeline').length).toBeGreaterThanOrEqual(1);
    expect(within(kpiGrid).getByText('Closing soon')).toBeInTheDocument();
    expect(within(kpiGrid).getByText('Open tasks')).toBeInTheDocument();
    expect(within(kpiGrid).getByText('Outstanding docs')).toBeInTheDocument();
    expect(within(kpiGrid).getByText('Pending reviews')).toBeInTheDocument();
  });

  it('zero-data state renders honest zeros, not fabricated values', async () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    render(<BankerShell workspaceName="Banker Workspace" />);

    await waitFor(() => {
      expect(screen.getByText('Active deals')).toBeInTheDocument();
    });

    // All nine metrics are zero with no active deals (six Phase-117
    // tiles + three Phase-119 part-1 tiles).
    // The Pipeline tile renders $0 in zero state.
    expect(screen.getByText('$0')).toBeInTheDocument();
    // Multiple zeros render (one per metric tile); use getAllByText.
    const zeroCount = screen.getAllByText(/^0$/).length;
    expect(zeroCount).toBeGreaterThanOrEqual(8);
  });

  it('renders the failed-load alert region when the loader rejects', async () => {
    setUpBanker();
    loadMock.mockRejectedValue(new Error('Dataverse query timed out'));
    render(<BankerShell workspaceName="Banker Workspace" />);

    await waitFor(() => {
      expect(
        screen.getByText(/Could not load workload snapshot/i),
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/Dataverse query timed out/i)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Phase 119 — restored original Banker Workspace surfaces (part 1)
// ---------------------------------------------------------------------------

describe('Phase 119 — restored KPI tiles (Urgent items / In underwriting / Stale 14d+)', () => {
  it('renders the three new tiles in the KPI grid', async () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    render(<BankerShell workspaceName="Banker Workspace" />);

    await waitFor(() => {
      expect(screen.getByText('Active deals')).toBeInTheDocument();
    });

    const kpiGrid = screen.getByRole('region', { name: /Workload KPIs$/i });
    expect(within(kpiGrid).getByText('Urgent items')).toBeInTheDocument();
    expect(within(kpiGrid).getByText('In underwriting')).toBeInTheDocument();
    expect(within(kpiGrid).getByText('Stale 14d+')).toBeInTheDocument();
  });

  it('shows honest zero values for the new tiles when the loader returns empty data (no fabrication)', async () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    render(<BankerShell workspaceName="Banker Workspace" />);

    await waitFor(() => {
      expect(screen.getByText('Urgent items')).toBeInTheDocument();
    });

    const kpiGrid = screen.getByRole('region', { name: /Workload KPIs$/i });
    // Each new tile's value should be the literal "0" — no
    // fabricated/sample value, no "—", no "N/A".
    const tiles = within(kpiGrid)
      .getAllByText(/^0$/)
      .map((el) => el.textContent);
    expect(tiles.length).toBeGreaterThanOrEqual(8);
  });

  it('renders the new tiles with read-only banker context (no governed write triggered by render)', async () => {
    setUpBanker({
      writeDisabledReason:
        'No Dataverse systemuser is provisioned for the current Entra identity.',
    });
    loadMock.mockResolvedValue(emptyData());
    render(<BankerShell workspaceName="Banker Workspace" />);

    await waitFor(() => {
      expect(screen.getByText('Urgent items')).toBeInTheDocument();
    });

    // Banner present + new tiles still render — restoration honors
    // the existing read-only state.
    expect(screen.getByRole('status')).toBeInTheDocument();
    const kpiGrid = screen.getByRole('region', { name: /Workload KPIs$/i });
    expect(within(kpiGrid).getByText('Urgent items')).toBeInTheDocument();
    expect(within(kpiGrid).getByText('In underwriting')).toBeInTheDocument();
    expect(within(kpiGrid).getByText('Stale 14d+')).toBeInTheDocument();
  });
});

describe('Phase 119 — My Tasks right-rail panel', () => {
  it('renders the "My Tasks" panel heading alongside Closing soon', async () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    render(<BankerShell workspaceName="Banker Workspace" />);

    await waitFor(() => {
      expect(screen.getByText('Closing soon')).toBeInTheDocument();
    });

    expect(screen.getByText('My Tasks')).toBeInTheDocument();
  });

  it('shows honest empty-state copy when no open tasks (no fabricated rows)', async () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    render(<BankerShell workspaceName="Banker Workspace" />);

    await waitFor(() => {
      expect(screen.getByText('My Tasks')).toBeInTheDocument();
    });

    expect(
      screen.getByText(/No open tasks on your active deals/i),
    ).toBeInTheDocument();
  });

  it('renders top-3 open tasks (overdue first) when tasks exist', async () => {
    setUpBanker();
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    loadMock.mockResolvedValue({
      deals: [],
      tasks: [
        {
          id: 't1',
          dealId: 'd1',
          title: 'Confirm PFS receipt',
          dueDate: new Date(now - 2 * day).toISOString(),
          modifiedOn: undefined,
          completed: false,
        },
        {
          id: 't2',
          dealId: 'd1',
          title: 'Order title search',
          dueDate: new Date(now + 5 * day).toISOString(),
          modifiedOn: undefined,
          completed: false,
        },
        {
          id: 't3',
          dealId: 'd1',
          title: 'Review covenants',
          dueDate: new Date(now - 7 * day).toISOString(),
          modifiedOn: undefined,
          completed: false,
        },
        {
          id: 't4',
          dealId: 'd1',
          title: 'Hidden by top-3 cap',
          dueDate: new Date(now + 10 * day).toISOString(),
          modifiedOn: undefined,
          completed: false,
        },
      ],
      outstandingDocuments: [],
      pendingReviewDocuments: [],
      memos: [],
      memoSections: [],
    });
    render(<BankerShell workspaceName="Banker Workspace" />);

    await waitFor(() => {
      expect(screen.getByText('My Tasks')).toBeInTheDocument();
    });

    expect(screen.getByText('Confirm PFS receipt')).toBeInTheDocument();
    expect(screen.getByText('Review covenants')).toBeInTheDocument();
    expect(screen.getByText('Order title search')).toBeInTheDocument();
    // The 4th task is capped out by the top-3 rule.
    expect(screen.queryByText('Hidden by top-3 cap')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tab switching
// ---------------------------------------------------------------------------

describe('Phase 117 — Tab switching changes the rendered child card', () => {
  it('Overview tab renders PersonalActivitySummary + MorningCatchUp by default', async () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    render(<BankerShell workspaceName="Banker Workspace" />);
    expect(screen.getByTestId('card-personal-activity-summary')).toBeInTheDocument();
    expect(screen.getByTestId('card-morning-catchup')).toBeInTheDocument();
  });

  it('clicking Pipeline tab swaps the panel to the PersonalPipeline card', async () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    render(<BankerShell workspaceName="Banker Workspace" />);
    const user = userEvent.setup();
    const pipelineTab = screen.getByRole('tab', { name: /^Pipeline$/i });
    await user.click(pipelineTab);
    expect(screen.getByTestId('card-personal-pipeline')).toBeInTheDocument();
    // Overview content should no longer be on the screen.
    expect(screen.queryByTestId('card-personal-activity-summary')).toBeNull();
    expect(screen.queryByTestId('card-morning-catchup')).toBeNull();
  });

  it('clicking Action Queue tab swaps the panel to MyWorkQueue', async () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    render(<BankerShell workspaceName="Banker Workspace" />);
    const user = userEvent.setup();
    const actionQueueTab = screen.getByRole('tab', { name: /^Action Queue$/i });
    await user.click(actionQueueTab);
    expect(screen.getByTestId('card-work-queue')).toBeInTheDocument();
    expect(screen.queryByTestId('card-personal-activity-summary')).toBeNull();
  });

  it('clicking Relationships tab swaps the panel to RelationshipMemory', async () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    render(<BankerShell workspaceName="Banker Workspace" />);
    const user = userEvent.setup();
    const tab = screen.getByRole('tab', { name: /^Relationships$/i });
    await user.click(tab);
    expect(screen.getByTestId('card-relationship-memory')).toBeInTheDocument();
  });

  it('clicking Signals tab swaps the panel to BankerAutopilotRollup', async () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    render(<BankerShell workspaceName="Banker Workspace" />);
    const user = userEvent.setup();
    const tab = screen.getByRole('tab', { name: /^Signals$/i });
    await user.click(tab);
    expect(screen.getByTestId('card-autopilot-rollup')).toBeInTheDocument();
  });

  it('only one tab is active at a time (aria-selected)', async () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    render(<BankerShell workspaceName="Banker Workspace" />);
    const tabs = screen.getAllByRole('tab');
    const selected = tabs.filter((t) => t.getAttribute('aria-selected') === 'true');
    expect(selected.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Phase 120 — restored Activity + Due Diligence tabs
// ---------------------------------------------------------------------------

describe('Phase 120 — Due Diligence tab', () => {
  it('renders the Due Diligence tab in the tablist for an entitled banker', async () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    render(<BankerShell workspaceName="Banker Workspace" />);
    expect(
      screen.getByRole('tab', { name: /^Due Diligence$/i }),
    ).toBeInTheDocument();
  });

  it('clicking Due Diligence tab swaps the panel to BankerDueDiligenceView', async () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    render(<BankerShell workspaceName="Banker Workspace" />);
    const user = userEvent.setup();
    const tab = screen.getByRole('tab', { name: /^Due Diligence$/i });
    await user.click(tab);
    expect(screen.getByTestId('card-due-diligence')).toBeInTheDocument();
    expect(screen.queryByTestId('card-personal-activity-summary')).toBeNull();
  });
});

describe('Phase 120 — Activity tab', () => {
  it('renders the Activity tab in the tablist for an entitled banker', async () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    render(<BankerShell workspaceName="Banker Workspace" />);
    expect(
      screen.getByRole('tab', { name: /^Activity$/i }),
    ).toBeInTheDocument();
  });

  it('clicking Activity tab swaps the panel to BankerActivityFeed', async () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    render(<BankerShell workspaceName="Banker Workspace" />);
    const user = userEvent.setup();
    const tab = screen.getByRole('tab', { name: /^Activity$/i });
    await user.click(tab);
    expect(screen.getByTestId('card-activity-feed')).toBeInTheDocument();
    expect(screen.queryByTestId('card-personal-activity-summary')).toBeNull();
  });
});

describe('Phase 120 — Workspace switcher (sidebar footer)', () => {
  it('renders the workspace switcher with the current workspace name', () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    render(<BankerShell workspaceName="Banker Workspace" />);

    const switcher = screen.getByRole('group', {
      name: /Workspace switcher \(only one workspace available/i,
    });
    expect(switcher).toBeInTheDocument();
    expect(within(switcher).getByText('Banker Workspace')).toBeInTheDocument();
    expect(within(switcher).getByText(/^Current$/i)).toBeInTheDocument();
  });

  it('renders the single-workspace honest hint copy', () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    render(<BankerShell workspaceName="Banker Workspace" />);

    expect(
      screen.getByText(/Only one workspace is entitled to your account/i),
    ).toBeInTheDocument();
  });

  it('falls back to "Banker Workspace" when workspaceName is blank (fail-closed display)', () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    render(<BankerShell workspaceName="   " />);

    const switcher = screen.getByRole('group', {
      name: /Workspace switcher/i,
    });
    expect(within(switcher).getByText('Banker Workspace')).toBeInTheDocument();
  });

  it('does NOT render a multi-workspace dropdown / select / interactive switcher control', () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    render(<BankerShell workspaceName="Banker Workspace" />);

    // No combobox / select / "Switch workspace" affordance — the
    // entitlement model is single-workspace per user today.
    const switcher = screen.getByRole('group', {
      name: /Workspace switcher/i,
    });
    expect(within(switcher).queryByRole('combobox')).toBeNull();
    expect(within(switcher).queryByRole('listbox')).toBeNull();
    expect(within(switcher).queryByRole('button')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Honest-language + no fake routes
// ---------------------------------------------------------------------------

describe('Phase 117 — no fake routes / no unsupported claims', () => {
  it('shell does NOT render Contacts or Alerts tabs (those surfaces still do not exist; Phase 120 added Due Diligence + Activity but Contacts and Alerts remain absent)', async () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    render(<BankerShell workspaceName="Banker Workspace" />);
    expect(screen.queryByRole('tab', { name: /^Contacts$/i })).toBeNull();
    expect(screen.queryByRole('tab', { name: /^Alerts$/i })).toBeNull();
  });

  it('shell does NOT render "New Deal" or "Log Activity" action buttons (no governed write supports either)', async () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    render(<BankerShell workspaceName="Banker Workspace" />);
    expect(screen.queryByRole('button', { name: /^New Deal/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Log Activity/i })).toBeNull();
  });

  it('rendered DOM does NOT contain forbidden communication-lane vocabulary (Phase 110 wording lock preserved at the shell level)', async () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    render(<BankerShell workspaceName="Banker Workspace" />);
    await waitFor(() => {
      expect(screen.getByText('Active deals')).toBeInTheDocument();
    });
    const everyText = document.body.textContent ?? '';
    expect(everyText).not.toMatch(/\bdelivered\b/i);
    expect(everyText).not.toMatch(/\bemail\s+(sent|delivered)\b/i);
    expect(everyText).not.toMatch(/\bborrower\s+(?:was|has\s+been)\s+notified\b/i);
  });

  it('right rail Closing soon disclaimer states "Not a calendar integration"', async () => {
    setUpBanker();
    loadMock.mockResolvedValue(emptyData());
    render(<BankerShell workspaceName="Banker Workspace" />);
    expect(
      screen.getByText(/Not a calendar integration/i),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Permission / read-only state
// ---------------------------------------------------------------------------

describe('Phase 117 — write-disabled banker state surfaces a read-only banner', () => {
  it('renders the read-only banner when writeDisabledReason is set', async () => {
    setUpBanker({
      writeDisabledReason:
        'No Dataverse systemuser is provisioned for the current Entra identity.',
    });
    loadMock.mockResolvedValue(emptyData());
    render(<BankerShell workspaceName="Banker Workspace" />);
    // "Read-only mode" appears both in the header badge and in the
    // status banner; the banner is the load-bearing one (it carries
    // the full reason text + the recovery hint).
    const banner = screen.getByRole('status');
    expect(within(banner).getByText(/Read-only mode/i)).toBeInTheDocument();
    expect(
      within(banner).getByText(
        /No Dataverse systemuser is provisioned for the current Entra identity\./,
      ),
    ).toBeInTheDocument();
  });

  it('does NOT render the read-only banner when writeDisabledReason is undefined', async () => {
    setUpBanker({ writeDisabledReason: undefined });
    loadMock.mockResolvedValue(emptyData());
    render(<BankerShell workspaceName="Banker Workspace" />);
    expect(screen.queryByText(/Read-only mode\./)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Communication-lane lock — static-source pin
// ---------------------------------------------------------------------------

describe('Phase 117 — BankerShell.tsx static-source pins', () => {
  // Read the BankerShell source once for the three static-source pins
  // below. JSDOM environments don't expose `import.meta.url` as a
  // file URL, so resolve via __dirname (which vitest provides) +
  // node:path. Same pattern Phase 106 / 107 / 110 use.
  const SHELL_SRC = readFileSync(
    resolve(__dirname, 'BankerShell.tsx'),
    'utf8',
  );

  it('does NOT import Office365OutlookService directly (Phase 110 lock invariant)', () => {
    expect(SHELL_SRC).not.toMatch(/from\s+['"][^'"]*Office365OutlookService['"]/);
  });

  it('does NOT call SendEmailV2 (Phase 110 single-callsite invariant)', () => {
    expect(SHELL_SRC).not.toMatch(/SendEmailV2\s*\(/);
  });

  it('does NOT import any sendXEmail action (the shell does not send mail)', () => {
    expect(SHELL_SRC).not.toMatch(/from\s+['"][^'"]*sendDocumentRequestEmail['"]/);
    expect(SHELL_SRC).not.toMatch(/from\s+['"][^'"]*sendBorrowerUpdateEmail['"]/);
  });
});
