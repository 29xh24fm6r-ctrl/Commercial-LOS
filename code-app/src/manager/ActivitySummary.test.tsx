// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ManagerData } from './ManagerDataProvider';
import type { TeamDeal } from './managerQueries';

vi.mock('./ManagerDataProvider', () => ({
  useManagerData: vi.fn(),
}));

import { useManagerData } from './ManagerDataProvider';
import { ManagerActivitySummary } from './ActivitySummary';

const useManagerDataMock = vi.mocked(useManagerData);

function ready(deals: TeamDeal[]): ManagerData {
  return {
    teamPipeline: { kind: 'ready', data: deals },
    teamBankers: { kind: 'ready', data: [] },
    teamTasks: { kind: 'ready', data: [] },
    teamDocuments: { kind: 'ready', data: [] },
    teamMemos: { kind: 'ready', data: [] },
    teamMemoSections: { kind: 'ready', data: [] },
  };
}

function deal(overrides: Partial<TeamDeal> = {}): TeamDeal {
  return {
    id: 'd-' + Math.random().toString(36).slice(2, 8),
    name: 'Acme',
    clientName: 'Acme Co',
    stage: 'Underwriting',
    status: 'Active',
    amount: 1_000_000,
    targetCloseDate: '2026-09-30T00:00:00Z',
    stageEntryDate: '2026-05-15T00:00:00Z',
    modifiedOn: undefined,
    assignedBankerId: 'banker-1',
    assignedBankerName: 'M. Paller',
    collateralSummary: undefined,
    ...overrides,
  };
}

describe('ManagerActivitySummary — Phase 71', () => {
  it('renders the card header + subtitle + disclaimer', () => {
    useManagerDataMock.mockReturnValue(ready([deal()]));
    render(<ManagerActivitySummary />);
    expect(
      screen.getByRole('heading', { name: /team activity summary/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Stage aging \+ pipeline mix — derived from current records/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /not a performance evaluation/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no ranking, no predictive claim/i),
    ).toBeInTheDocument();
  });

  it('shows the empty state when the team pipeline is empty', () => {
    useManagerDataMock.mockReturnValue(ready([]));
    render(<ManagerActivitySummary />);
    expect(
      screen.getByText(/No active deals on the team yet/i),
    ).toBeInTheDocument();
  });

  it('shows the loading state', () => {
    useManagerDataMock.mockReturnValue({
      teamPipeline: { kind: 'loading' },
      teamBankers: { kind: 'loading' },
      teamTasks: { kind: 'loading' },
      teamDocuments: { kind: 'loading' },
      teamMemos: { kind: 'loading' },
      teamMemoSections: { kind: 'loading' },
    });
    render(<ManagerActivitySummary />);
    expect(screen.getByText(/Loading activity summary/i)).toBeInTheDocument();
  });

  it('shows the failed state with the error message', () => {
    useManagerDataMock.mockReturnValue({
      teamPipeline: { kind: 'failed', message: 'service unavailable' },
      teamBankers: { kind: 'ready', data: [] },
      teamTasks: { kind: 'ready', data: [] },
      teamDocuments: { kind: 'ready', data: [] },
      teamMemos: { kind: 'ready', data: [] },
      teamMemoSections: { kind: 'ready', data: [] },
    });
    render(<ManagerActivitySummary />);
    expect(
      screen.getByText(/Could not load activity summary/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/service unavailable/i)).toBeInTheDocument();
  });

  it('renders both subsections and their stat labels', () => {
    useManagerDataMock.mockReturnValue(
      ready([
        deal({ assignedBankerId: 'b-1', stage: 'Application' }),
        deal({ assignedBankerId: 'b-2', stage: 'Underwriting' }),
      ]),
    );
    render(<ManagerActivitySummary />);
    expect(screen.getByText(/^stage aging$/i)).toBeInTheDocument();
    expect(screen.getByText(/^pipeline mix$/i)).toBeInTheDocument();
    expect(screen.getByText(/Avg days in stage/i)).toBeInTheDocument();
    expect(screen.getByText(/Median days/i)).toBeInTheDocument();
    expect(screen.getByText(/Longest in stage/i)).toBeInTheDocument();
    expect(screen.getByText(/At or past 30 days/i)).toBeInTheDocument();
    expect(screen.getByText(/Distinct stages/i)).toBeInTheDocument();
    expect(screen.getByText(/Active bankers/i)).toBeInTheDocument();
    expect(screen.getByText(/Top banker — pipeline \$ share/i)).toBeInTheDocument();
    expect(screen.getByText(/Top banker — deal count share/i)).toBeInTheDocument();
  });

  it('surfaces missing-stage-entry-date count when present', () => {
    useManagerDataMock.mockReturnValue(
      ready([
        deal({ stageEntryDate: undefined }),
        deal({ stageEntryDate: '2026-04-01T00:00:00Z' }),
      ]),
    );
    render(<ManagerActivitySummary />);
    expect(
      screen.getByText(/1 deal excluded from stage-aging math/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/estimated from available fields/i),
    ).toBeInTheDocument();
  });

  it('surfaces unassigned + missing-stage counts when present', () => {
    useManagerDataMock.mockReturnValue(
      ready([
        deal({ assignedBankerId: undefined }),
        deal({ stage: undefined }),
      ]),
    );
    render(<ManagerActivitySummary />);
    expect(
      screen.getByText(/have no assigned banker/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/have no stage value/i),
    ).toBeInTheDocument();
  });

  it('does NOT render any score / performance-rating / AI-generated / underperforming claim', () => {
    useManagerDataMock.mockReturnValue(ready([deal()]));
    render(<ManagerActivitySummary />);
    const text = document.body.textContent ?? '';
    // The Phase 71 brief forbids these terms in user-facing copy.
    // "ranking" and "predictive" appear ONLY inside the disclaimer
    // negation phrase ("No ranking, no predictive claim, no
    // automated decisioning") — that wording is allowed; pure
    // positive uses would be banned. The cleanest test is to ban
    // the terms that have no allowed-negation form.
    expect(text).not.toMatch(/\bscore\b/i);
    expect(text).not.toMatch(/\bperformance rating\b/i);
    expect(text).not.toMatch(/\bunderperforming\b/i);
    expect(text).not.toMatch(/\bguaranteed\b/i);
    expect(text).not.toMatch(/\bapproved\b/i);
    expect(text).not.toMatch(/\bfailed\b/i);
    expect(text).not.toMatch(/\bAI[ -]generated\b/i);
    expect(text).not.toMatch(/\bofficial performance rating\b/i);
    // And the allowed disclaimer-negation phrasing IS present:
    expect(text).toMatch(/No ranking, no predictive claim/i);
  });
});
