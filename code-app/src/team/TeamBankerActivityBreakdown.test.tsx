// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { TeamData } from './TeamDataProvider';
import type { TeamDealRow } from './teamQueries';

vi.mock('./TeamDataProvider', () => ({
  useTeamData: vi.fn(),
}));

import { useTeamData } from './TeamDataProvider';
import { TeamBankerActivityBreakdown } from './TeamBankerActivityBreakdown';

const useTeamDataMock = vi.mocked(useTeamData);

function ready(deals: TeamDealRow[]): Partial<TeamData> {
  return {
    deals: { kind: 'ready', data: deals },
    // Other TeamData keys are not read by this card; cast through
    // unknown to satisfy the partial mock signature.
  } as TeamData;
}

function dealRow(overrides: Partial<TeamDealRow> = {}): TeamDealRow {
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
    ...overrides,
  };
}

describe('TeamBankerActivityBreakdown — Phase 71', () => {
  it('renders the card header + subtitle + disclaimer', () => {
    useTeamDataMock.mockReturnValue(ready([dealRow()]) as TeamData);
    render(<TeamBankerActivityBreakdown />);
    expect(
      screen.getByRole('heading', { name: /per-banker activity/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Workload across the team — derived from current records/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/not a performance evaluation/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no compensation impact/i),
    ).toBeInTheDocument();
  });

  it('shows the empty state when no deals have an assigned banker', () => {
    useTeamDataMock.mockReturnValue(
      ready([dealRow({ assignedBankerId: undefined })]) as TeamData,
    );
    render(<TeamBankerActivityBreakdown />);
    expect(
      screen.getByText(/No deals with an assigned banker on the team yet/i),
    ).toBeInTheDocument();
  });

  it('shows the loading state', () => {
    useTeamDataMock.mockReturnValue({
      deals: { kind: 'loading' },
    } as TeamData);
    render(<TeamBankerActivityBreakdown />);
    expect(
      screen.getByText(/Loading per-banker activity/i),
    ).toBeInTheDocument();
  });

  it('shows the failed state with the error message', () => {
    useTeamDataMock.mockReturnValue({
      deals: { kind: 'failed', message: 'team service unavailable' },
    } as TeamData);
    render(<TeamBankerActivityBreakdown />);
    expect(
      screen.getByText(/Could not load per-banker activity/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/team service unavailable/i)).toBeInTheDocument();
  });

  it('renders one row per assigned banker, sorted by deal count desc', () => {
    useTeamDataMock.mockReturnValue(
      ready([
        dealRow({ assignedBankerId: 'b-zoe', assignedBankerName: 'Zoe' }),
        dealRow({ assignedBankerId: 'b-alice', assignedBankerName: 'Alice' }),
        dealRow({ assignedBankerId: 'b-alice', assignedBankerName: 'Alice' }),
      ]) as TeamData,
    );
    render(<TeamBankerActivityBreakdown />);
    const rows = screen.getAllByRole('row');
    // 1 header + 2 banker rows = 3.
    expect(rows).toHaveLength(3);
    // Alice (2 deals) first, then Zoe (1 deal).
    expect(rows[1]!.textContent).toContain('Alice');
    expect(rows[2]!.textContent).toContain('Zoe');
  });

  it('renders the missing-amount hint when a banker has deals without amount data', () => {
    useTeamDataMock.mockReturnValue(
      ready([
        dealRow({ amount: 1_000_000, assignedBankerId: 'b-1' }),
        dealRow({ amount: undefined, assignedBankerId: 'b-1' }),
      ]) as TeamData,
    );
    render(<TeamBankerActivityBreakdown />);
    expect(screen.getByText(/1 missing \$/i)).toBeInTheDocument();
  });

  it('does NOT render any score / performance-rating / AI-generated / underperforming claim', () => {
    useTeamDataMock.mockReturnValue(ready([dealRow()]) as TeamData);
    render(<TeamBankerActivityBreakdown />);
    const text = document.body.textContent ?? '';
    // Same exclusion list as ManagerActivitySummary; "ranking" /
    // "predictive" appear ONLY inside the disclaimer-negation
    // phrase, which is the intended pattern.
    expect(text).not.toMatch(/\bscore\b/i);
    expect(text).not.toMatch(/\bperformance rating\b/i);
    expect(text).not.toMatch(/\bunderperforming\b/i);
    expect(text).not.toMatch(/\bguaranteed\b/i);
    expect(text).not.toMatch(/\bapproved\b/i);
    expect(text).not.toMatch(/\bAI[ -]generated\b/i);
    expect(text).toMatch(/No ranking, no predictive claim/i);
  });
});
