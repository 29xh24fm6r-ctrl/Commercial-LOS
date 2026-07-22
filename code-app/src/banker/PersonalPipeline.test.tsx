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

function renderShell(props: { refreshToken?: number } = {}) {
  return render(
    <MemoryRouter>
      <PersonalPipeline {...props} />
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

  it('groups deals into stage sections sorted by canonical sequence (Workstream B: canonical 7-stage vocabulary)', async () => {
    loadMock.mockResolvedValue([
      deal({ id: 'd1', name: 'Northwind WC', stage: 'Underwriting' }),
      deal({ id: 'd2', name: 'Acme Term Loan', stage: 'Intake' }),
      deal({ id: 'd3', name: 'Globex CRE', stage: 'Closing & Funding' }),
      deal({ id: 'd4', name: 'Initech LOC', stage: 'Intake' }),
    ]);
    renderShell();

    await waitFor(() => {
      expect(screen.getByText('Northwind WC')).toBeInTheDocument();
    });

    // Three stage sections: Intake, Underwriting, Closing & Funding.
    const intakeSection = screen.getByRole('region', { name: /^Stage: Intake$/i });
    const underwritingSection = screen.getByRole('region', { name: /Stage: Underwriting/i });
    const closingSection = screen.getByRole('region', { name: /Stage: Closing & Funding/i });

    expect(within(intakeSection).getByText('Acme Term Loan')).toBeInTheDocument();
    expect(within(intakeSection).getByText('Initech LOC')).toBeInTheDocument();
    expect(within(intakeSection).getByText('2 deals')).toBeInTheDocument();

    expect(within(underwritingSection).getByText('Northwind WC')).toBeInTheDocument();
    expect(within(underwritingSection).getByText('1 deal')).toBeInTheDocument();

    expect(within(closingSection).getByText('Globex CRE')).toBeInTheDocument();
    expect(within(closingSection).getByText('1 deal')).toBeInTheDocument();

    // Canonical order: Intake (10) < Underwriting (20) < Closing & Funding (60).
    // Sections appear in DOM in that order.
    const sections = screen.getAllByRole('region');
    const order = sections.map((s) => s.getAttribute('aria-label'));
    expect(order.indexOf('Stage: Intake')).toBeLessThan(
      order.indexOf('Stage: Underwriting'),
    );
    expect(order.indexOf('Stage: Underwriting')).toBeLessThan(
      order.indexOf('Stage: Closing & Funding'),
    );
  });

  it('Workstream B — a newly-created Intake deal appears on the board (the confirmed live-audit defect)', async () => {
    loadMock.mockResolvedValue([
      deal({ id: 'd1', name: 'Brand New Deal', stage: 'Intake' }),
    ]);
    renderShell();

    await waitFor(() => {
      expect(screen.getByText('Brand New Deal')).toBeInTheDocument();
    });

    // Must land in a real, ordered "Intake" lane -- not an unordered custom lane keyed by the raw
    // string, and not the "Stage unknown" lane.
    const intakeSection = screen.getByRole('region', { name: /^Stage: Intake$/i });
    expect(within(intakeSection).getByText('Brand New Deal')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /Stage unknown/i })).toBeNull();
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

    // The Underwriting lane has the deal; the other 5 canonical
    // non-terminal lanes (Intake, Credit Approval, Commitment,
    // Documentation, Closing & Funding) are present but empty. Each of
    // their bodies renders the honest empty-state copy.
    const emptyStateCount = screen.getAllByText('No deals in this stage.').length;
    // 6 canonical non-terminal stages (Workstream B: BOARDED is terminal, excluded) - 1 with the
    // deal = 5 empty lanes.
    expect(emptyStateCount).toBe(5);
  });

  it('Workstream B — renders all 6 canonical non-terminal lanes when there is at least one deal', async () => {
    loadMock.mockResolvedValue([
      deal({ id: 'd1', name: 'Sample', stage: 'Underwriting' }),
    ]);
    renderShell();

    await waitFor(() => {
      expect(screen.getByText('Sample')).toBeInTheDocument();
    });

    // The canonical non-terminal lanes (same vocabulary as the deal cockpit Stage Map). BOARDED is
    // the one terminal canonical stage and is excluded.
    for (const stageLabel of [
      'Intake',
      'Underwriting',
      'Credit Approval',
      'Commitment',
      'Documentation',
      'Closing & Funding',
    ]) {
      expect(
        screen.getByRole('region', { name: `Stage: ${stageLabel}` }),
      ).toBeInTheDocument();
    }
    expect(screen.queryByRole('region', { name: /Stage: Boarded/i })).toBeNull();
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

  it('Workstream B — every active deal appears exactly once across all lanes, none silently dropped', async () => {
    loadMock.mockResolvedValue([
      deal({ id: 'd1', name: 'Intake Deal', stage: 'Intake' }),
      deal({ id: 'd2', name: 'Underwriting Deal', stage: 'Underwriting' }),
      deal({ id: 'd3', name: 'Credit Approval Deal', stage: 'Credit Approval' }),
      deal({ id: 'd4', name: 'Commitment Deal', stage: 'Commitment' }),
      deal({ id: 'd5', name: 'Documentation Deal', stage: 'Documentation' }),
      deal({ id: 'd6', name: 'Closing Deal', stage: 'Closing & Funding' }),
      deal({ id: 'd7', name: 'Legacy Stage Deal', stage: 'TEST — Stage Phase 121' }),
      deal({ id: 'd8', name: 'No Stage Deal', stage: undefined }),
    ]);
    renderShell();

    const names = [
      'Intake Deal',
      'Underwriting Deal',
      'Credit Approval Deal',
      'Commitment Deal',
      'Documentation Deal',
      'Closing Deal',
      'Legacy Stage Deal',
      'No Stage Deal',
    ];
    await waitFor(() => {
      for (const name of names) expect(screen.getByText(name)).toBeInTheDocument();
    });

    // Each deal name appears exactly once in the whole board -- no duplication, no drop.
    for (const name of names) {
      expect(screen.getAllByText(name)).toHaveLength(1);
    }
    // The unrecognized legacy value gets its own diagnostic lane (visible, not dropped, not
    // merged into a real canonical lane).
    expect(
      screen.getByRole('region', { name: 'Stage: TEST — Stage Phase 121' }),
    ).toBeInTheDocument();
  });

  it('Workstream B — a BOARDED-stage deal (should already be excluded upstream) is never placed in one of the 6 active canonical lanes', async () => {
    // loadBankerPipeline already excludes terminal-status deals at the query level; this pins
    // that PersonalPipeline does not independently re-include a BOARDED-stage deal into an active
    // lane even if one somehow appeared in the loader's result (fail-closed, not fail-open) --
    // there is no canonical "Boarded" lane among the 6 active stages, since BOARDED is the one
    // terminal canonical stage. It still renders honestly (never silently dropped), just outside
    // the 6 fixed lanes.
    loadMock.mockResolvedValue([
      deal({ id: 'd1', name: 'Somehow Boarded', stage: 'Boarded / Servicing' }),
    ]);
    renderShell();

    await waitFor(() => {
      expect(screen.getByText('Somehow Boarded')).toBeInTheDocument();
    });

    for (const activeLabel of [
      'Intake',
      'Underwriting',
      'Credit Approval',
      'Commitment',
      'Documentation',
      'Closing & Funding',
    ]) {
      const section = screen.getByRole('region', { name: `Stage: ${activeLabel}` });
      expect(within(section).queryByText('Somehow Boarded')).toBeNull();
    }
  });
});

describe('Remediation 2026-07-22 (Workstream E) — refreshToken triggers an in-session refetch', () => {
  it('refetches when refreshToken changes, so a deal created elsewhere on the same tab appears without a tab switch/reload', async () => {
    loadMock.mockResolvedValueOnce([deal({ id: 'd1', name: 'Before Create' })]);
    const { rerender } = render(
      <MemoryRouter>
        <PersonalPipeline refreshToken={0} />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Before Create')).toBeInTheDocument());
    expect(loadMock).toHaveBeenCalledTimes(1);

    loadMock.mockResolvedValueOnce([
      deal({ id: 'd1', name: 'Before Create' }),
      deal({ id: 'd2', name: 'Just Created' }),
    ]);
    rerender(
      <MemoryRouter>
        <PersonalPipeline refreshToken={1} />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('Just Created')).toBeInTheDocument());
    expect(loadMock).toHaveBeenCalledTimes(2);
  });

  it('does NOT refetch on an unrelated re-render when refreshToken is unchanged', async () => {
    loadMock.mockResolvedValue([deal({ id: 'd1', name: 'Stable Deal' })]);
    const { rerender } = render(
      <MemoryRouter>
        <PersonalPipeline refreshToken={0} />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Stable Deal')).toBeInTheDocument());
    expect(loadMock).toHaveBeenCalledTimes(1);

    rerender(
      <MemoryRouter>
        <PersonalPipeline refreshToken={0} />
      </MemoryRouter>,
    );
    expect(loadMock).toHaveBeenCalledTimes(1);
  });
});
