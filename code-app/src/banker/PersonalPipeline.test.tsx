// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { PipelineDeal } from './dealQueries';

/**
 * Phase 119 — PersonalPipeline stage-grouped layout tests.
 *
 * Pins the restored original Banker Workspace pipeline view:
 *   - flat table replaced by stage-grouped sections;
 *   - sections sorted by canonical STAGE_CATALOG ordinal;
 *   - empty Dataverse result renders honest "no active deals"
 *     copy, never a fabricated row;
 *   - unknown / missing stage names sort last as "Stage unknown"
 *     so a deal is never silently filed into a real stage;
 *   - per-row Stage column is removed (stage is the section
 *     heading; no duplicate badge per row);
 *   - card does not render the Phase-110 forbidden communication
 *     vocabulary anywhere in the pipeline DOM.
 */

vi.mock('./dealQueries', () => ({
  loadBankerPipeline: vi.fn(),
}));

vi.mock('./BankerContext', () => ({
  useBanker: () => ({
    bankerId: 'banker-1',
    fullName: 'Matt Paller',
    email: 'mpaller@oldglorybank.com',
    systemUserId: 'sys-1',
    writeDisabledReason: undefined,
  }),
}));

import { loadBankerPipeline } from './dealQueries';
import { PersonalPipeline } from './PersonalPipeline';

const loadMock = vi.mocked(loadBankerPipeline);

function deal(overrides: Partial<PipelineDeal>): PipelineDeal {
  return {
    id: 'd',
    name: 'Sample',
    clientName: 'Acme',
    stage: 'Underwriting',
    status: 'Active',
    amount: 1_000_000,
    targetCloseDate: undefined,
    lastActivityOn: undefined,
    stageEntryDate: undefined,
    isClosed: false,
    collateralSummary: undefined,
    ...overrides,
  };
}

function renderShell() {
  return render(
    <MemoryRouter>
      <PersonalPipeline />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  loadMock.mockReset();
});

describe('Phase 119 — PersonalPipeline stage grouping', () => {
  it('renders an honest empty-state when the banker has no active deals (no fabricated rows)', async () => {
    loadMock.mockResolvedValue([]);
    renderShell();

    await waitFor(() => {
      expect(
        screen.getByText(/No active deals assigned to you/i),
      ).toBeInTheDocument();
    });

    expect(
      screen.getByText(/When deals are assigned to you/i),
    ).toBeInTheDocument();
    // No fabricated stage section is rendered in the empty state.
    expect(screen.queryByText(/^Underwriting$/)).toBeNull();
  });

  it('groups deals into stage sections sorted by canonical ordinal', async () => {
    loadMock.mockResolvedValue([
      deal({ id: 'd1', name: 'Northwind WC', stage: 'Underwriting' }),
      deal({ id: 'd2', name: 'Acme Term Loan', stage: 'Application' }),
      deal({ id: 'd3', name: 'Globex CRE', stage: 'Closing' }),
      deal({ id: 'd4', name: 'Initech LOC', stage: 'Application' }),
    ]);
    renderShell();

    await waitFor(() => {
      expect(screen.getByText('Northwind WC')).toBeInTheDocument();
    });

    // Three stage sections: Application, Underwriting, Closing.
    const applicationSection = screen.getByRole('region', { name: /Stage: Application/i });
    const underwritingSection = screen.getByRole('region', { name: /Stage: Underwriting/i });
    const closingSection = screen.getByRole('region', { name: /Stage: Closing/i });

    expect(within(applicationSection).getByText('Acme Term Loan')).toBeInTheDocument();
    expect(within(applicationSection).getByText('Initech LOC')).toBeInTheDocument();
    expect(within(applicationSection).getByText('2 deals')).toBeInTheDocument();

    expect(within(underwritingSection).getByText('Northwind WC')).toBeInTheDocument();
    expect(within(underwritingSection).getByText('1 deal')).toBeInTheDocument();

    expect(within(closingSection).getByText('Globex CRE')).toBeInTheDocument();
    expect(within(closingSection).getByText('1 deal')).toBeInTheDocument();

    // Canonical order: Application (30) < Underwriting (50) < Closing (80).
    // Sections appear in DOM in that order.
    const sections = screen.getAllByRole('region');
    const order = sections.map((s) => s.getAttribute('aria-label'));
    expect(order.indexOf('Stage: Application')).toBeLessThan(
      order.indexOf('Stage: Underwriting'),
    );
    expect(order.indexOf('Stage: Underwriting')).toBeLessThan(
      order.indexOf('Stage: Closing'),
    );
  });

  it('files deals with missing / blank stage into a "Stage unknown" section sorted last', async () => {
    loadMock.mockResolvedValue([
      deal({ id: 'd1', name: 'Known stage', stage: 'Underwriting' }),
      deal({ id: 'd2', name: 'No stage', stage: undefined }),
      deal({ id: 'd3', name: 'Blank stage', stage: '   ' }),
    ]);
    renderShell();

    await waitFor(() => {
      expect(screen.getByText('Known stage')).toBeInTheDocument();
    });

    const unknownSection = screen.getByRole('region', {
      name: /Stage: Stage unknown/i,
    });
    expect(within(unknownSection).getByText('No stage')).toBeInTheDocument();
    expect(within(unknownSection).getByText('Blank stage')).toBeInTheDocument();

    // "Stage unknown" sorts last (+infinity ordinal).
    const sections = screen.getAllByRole('region');
    const labels = sections.map((s) => s.getAttribute('aria-label'));
    expect(labels[labels.length - 1]).toMatch(/Stage unknown/i);
  });

  it('does not duplicate the stage as a per-row badge (stage lives in the section header)', async () => {
    loadMock.mockResolvedValue([
      deal({ id: 'd1', name: 'Northwind', stage: 'Underwriting' }),
    ]);
    renderShell();

    await waitFor(() => {
      expect(screen.getByText('Northwind')).toBeInTheDocument();
    });

    // "Underwriting" should appear exactly once — as the section
    // heading. The pre-Phase-119 layout had a "Stage" cell per
    // row; restoration removes that duplication.
    const occurrences = screen.getAllByText('Underwriting').length;
    expect(occurrences).toBe(1);
  });

  it('renders a "Stale 14d+" badge on rows whose lastActivityOn is 14+ days old (Phase 120)', async () => {
    const day = 24 * 60 * 60 * 1000;
    const fresh = new Date(Date.now() - 2 * day).toISOString();
    const stale = new Date(Date.now() - 20 * day).toISOString();
    const exactlyAtThreshold = new Date(Date.now() - 14 * day).toISOString();
    loadMock.mockResolvedValue([
      deal({ id: 'd1', name: 'Fresh deal', stage: 'Underwriting', lastActivityOn: fresh }),
      deal({ id: 'd2', name: 'Stale deal', stage: 'Underwriting', lastActivityOn: stale }),
      deal({ id: 'd3', name: 'Edge deal', stage: 'Underwriting', lastActivityOn: exactlyAtThreshold }),
    ]);
    renderShell();

    await waitFor(() => {
      expect(screen.getByText('Stale deal')).toBeInTheDocument();
    });

    const staleBadges = screen.getAllByText(/^Stale 14d\+$/);
    // 2 rows qualify: d2 (20d) and d3 (14d). d1 (2d) does NOT.
    expect(staleBadges.length).toBe(2);
  });

  it('renders no stale badge on freshly-modified rows (Phase 120)', async () => {
    const day = 24 * 60 * 60 * 1000;
    loadMock.mockResolvedValue([
      deal({
        id: 'd1',
        name: 'Fresh deal',
        stage: 'Underwriting',
        lastActivityOn: new Date(Date.now() - 3 * day).toISOString(),
      }),
    ]);
    renderShell();

    await waitFor(() => {
      expect(screen.getByText('Fresh deal')).toBeInTheDocument();
    });

    expect(screen.queryByText(/^Stale 14d\+$/)).toBeNull();
  });

  it('handles missing or unparseable lastActivityOn without crashing (no stale badge applied)', async () => {
    loadMock.mockResolvedValue([
      deal({ id: 'd1', name: 'No date', stage: 'Underwriting', lastActivityOn: undefined }),
      deal({ id: 'd2', name: 'Bad date', stage: 'Underwriting', lastActivityOn: 'not-an-iso' }),
    ]);
    renderShell();

    await waitFor(() => {
      expect(screen.getByText('No date')).toBeInTheDocument();
      expect(screen.getByText('Bad date')).toBeInTheDocument();
    });

    expect(screen.queryByText(/^Stale 14d\+$/)).toBeNull();
  });

  it('Phase 124 — renders a horizontal stage-board container with role=group', async () => {
    loadMock.mockResolvedValue([
      deal({ id: 'd1', name: 'Northwind WC', stage: 'Underwriting' }),
    ]);
    renderShell();

    await waitFor(() => {
      expect(screen.getByText('Northwind WC')).toBeInTheDocument();
    });

    const board = screen.getByRole('group', {
      name: /Pipeline stage board/i,
    });
    expect(board).toBeInTheDocument();
  });

  it('Phase 124 — renders empty canonical stage lanes with honest "No deals in this stage." copy', async () => {
    loadMock.mockResolvedValue([
      deal({ id: 'd1', name: 'Northwind WC', stage: 'Underwriting' }),
    ]);
    renderShell();

    await waitFor(() => {
      expect(screen.getByText('Northwind WC')).toBeInTheDocument();
    });

    // The Underwriting lane has the deal; other canonical non-terminal
    // lanes (Origination, Screening, Application, Pricing, Committee,
    // Documentation, Closing, Funded) are present but empty. Each of
    // their bodies renders the honest empty-state copy.
    const emptyStateCount = screen.getAllByText('No deals in this stage.').length;
    // 9 canonical non-terminal stages - 1 with the deal = 8 empty lanes.
    expect(emptyStateCount).toBe(8);
  });

  it('Phase 124 — renders all 9 canonical non-terminal lanes when there is at least one deal', async () => {
    loadMock.mockResolvedValue([
      deal({ id: 'd1', name: 'Sample', stage: 'Underwriting' }),
    ]);
    renderShell();

    await waitFor(() => {
      expect(screen.getByText('Sample')).toBeInTheDocument();
    });

    // The canonical non-terminal lanes from STAGE_CATALOG.
    for (const stageLabel of [
      'Origination',
      'Screening',
      'Application',
      'Pricing',
      'Underwriting',
      'Committee',
      'Documentation',
      'Closing',
      'Funded',
    ]) {
      expect(
        screen.getByRole('region', { name: `Stage: ${stageLabel}` }),
      ).toBeInTheDocument();
    }
  });

  it('Phase 124 — terminal lanes (Closed Won / Closed Lost / Cancelled) are NOT rendered', async () => {
    loadMock.mockResolvedValue([
      deal({ id: 'd1', name: 'Sample', stage: 'Underwriting' }),
    ]);
    renderShell();

    await waitFor(() => {
      expect(screen.getByText('Sample')).toBeInTheDocument();
    });

    expect(screen.queryByRole('region', { name: /Closed — Won/i })).toBeNull();
    expect(screen.queryByRole('region', { name: /Closed — Lost/i })).toBeNull();
    expect(screen.queryByRole('region', { name: /Stage: Cancelled/i })).toBeNull();
  });

  it('Phase 124 — DealCard surfaces an honest "Amount not set" when the deal has no amount', async () => {
    loadMock.mockResolvedValue([
      deal({ id: 'd1', name: 'No-amount deal', stage: 'Underwriting', amount: undefined }),
    ]);
    renderShell();

    await waitFor(() => {
      expect(screen.getByText('No-amount deal')).toBeInTheDocument();
    });

    expect(screen.getByText(/Amount not set/i)).toBeInTheDocument();
  });

  it('Phase 124 — DealCard omits the target close line when targetCloseDate is missing (no "—" placeholder line)', async () => {
    loadMock.mockResolvedValue([
      deal({
        id: 'd1',
        name: 'No-close deal',
        stage: 'Underwriting',
        targetCloseDate: undefined,
      }),
    ]);
    renderShell();

    await waitFor(() => {
      expect(screen.getByText('No-close deal')).toBeInTheDocument();
    });

    // No "Target close:" line should be rendered when the field is
    // missing — honest omission, not "Target close: —" filler.
    expect(screen.queryByText(/^Target close:/i)).toBeNull();
  });

  it('Phase 124 — lane amount summary renders only when at least one deal in the lane has a parseable amount', async () => {
    loadMock.mockResolvedValue([
      deal({ id: 'd1', name: 'A', stage: 'Underwriting', amount: 2_500_000 }),
      deal({ id: 'd2', name: 'B', stage: 'Underwriting', amount: 1_000_000 }),
    ]);
    renderShell();

    await waitFor(() => {
      expect(screen.getByText('A')).toBeInTheDocument();
    });

    const underwritingLane = screen.getByRole('region', {
      name: /Stage: Underwriting/i,
    });
    // Sum = $3.5M, compact formatted.
    expect(within(underwritingLane).getByText('$3.5M')).toBeInTheDocument();
  });

  it('Phase 124 — lane amount summary is omitted when every deal in the lane has a missing amount', async () => {
    loadMock.mockResolvedValue([
      deal({ id: 'd1', name: 'A', stage: 'Underwriting', amount: undefined }),
      deal({ id: 'd2', name: 'B', stage: 'Underwriting', amount: undefined }),
    ]);
    renderShell();

    await waitFor(() => {
      expect(screen.getByText('A')).toBeInTheDocument();
    });

    const underwritingLane = screen.getByRole('region', {
      name: /Stage: Underwriting/i,
    });
    // No $-formatted summary anywhere inside the lane header.
    expect(within(underwritingLane).queryByText(/^\$/)).toBeNull();
  });

  it('renders no Phase-110 forbidden communication vocabulary in the pipeline DOM', async () => {
    loadMock.mockResolvedValue([
      deal({ id: 'd1', name: 'Northwind', stage: 'Underwriting' }),
    ]);
    renderShell();

    await waitFor(() => {
      expect(screen.getByText('Northwind')).toBeInTheDocument();
    });

    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/\bdelivered\b/i);
    expect(text).not.toMatch(/\bemail\s+(sent|delivered)\b/i);
    expect(text).not.toMatch(/\bborrower\s+(?:was|has\s+been)\s+notified\b/i);
  });
});
