// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ManagerData } from './ManagerDataProvider';
import type { TeamDeal } from './managerQueries';

/**
 * Phase 81 — ManagerAutopilotRollup card tests.
 *
 * Pins:
 *   - loading + failed + empty (no-deals) + empty (no-signals)
 *     states;
 *   - populated rendering: priority count chips + scan line + top
 *     deal rows + banker / stage / target-close meta + deal-name
 *     navigation button;
 *   - rollup never claims "all clear" / "no risk" / "portfolio
 *     healthy" / "everything is fine";
 *   - signal-coverage disclaimer renders verbatim (manager surface
 *     is deal-record-signal only);
 *   - conservative disclaimer renders verbatim;
 *   - rendered DOM never contains AI / automation / decisioning /
 *     prediction vocabulary;
 *   - clicking a deal-name navigates via react-router.
 */

vi.mock('./ManagerDataProvider', () => ({
  useManagerData: vi.fn(),
}));

const navigateSpy = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateSpy,
}));

import { useManagerData } from './ManagerDataProvider';
import { ManagerAutopilotRollup } from './ManagerAutopilotRollup';

const useManagerDataMock = vi.mocked(useManagerData);

const NOW = new Date();
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isoDaysAgo(d: number): string {
  return new Date(NOW.getTime() - d * MS_PER_DAY).toISOString();
}
function isoDaysFromNow(d: number): string {
  return new Date(NOW.getTime() + d * MS_PER_DAY).toISOString();
}

function ready(deals: TeamDeal[]): ManagerData {
  return {
    teamPipeline: { kind: 'ready', data: deals },
    teamBankers: { kind: 'ready', data: [] },
  };
}

function deal(overrides: Partial<TeamDeal> = {}): TeamDeal {
  return {
    id: 'd-1',
    name: 'Sample Deal',
    clientName: 'Sample Co',
    stage: 'Underwriting',
    status: 'Active',
    amount: 1_000_000,
    targetCloseDate: isoDaysFromNow(90),
    stageEntryDate: isoDaysAgo(5),
    modifiedOn: isoDaysAgo(1),
    assignedBankerId: 'b-1',
    assignedBankerName: 'M. Paller',
    ...overrides,
  };
}

describe('ManagerAutopilotRollup — Phase 81', () => {
  it('renders the card header + verbatim subtitle', () => {
    useManagerDataMock.mockReturnValue(ready([deal()]));
    render(<ManagerAutopilotRollup />);
    expect(
      screen.getByRole('heading', { name: /team next-best-action signals/i }),
    ).toBeInTheDocument();
    // The subtitle uses the same phrase as the bottom disclaimer on
    // populated states; check at least one occurrence appears.
    expect(
      screen.getAllByText(
        /Derived from current records\. Nothing happens automatically\./i,
      ).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('renders the loading state when teamPipeline is non-ready', () => {
    useManagerDataMock.mockReturnValue({
      teamPipeline: { kind: 'loading' },
      teamBankers: { kind: 'ready', data: [] },
    });
    render(<ManagerAutopilotRollup />);
    expect(screen.getByText(/Loading team signals/i)).toBeInTheDocument();
  });

  it('renders the failed state via role="alert"', () => {
    useManagerDataMock.mockReturnValue({
      teamPipeline: { kind: 'failed', message: 'service unavailable' },
      teamBankers: { kind: 'ready', data: [] },
    });
    render(<ManagerAutopilotRollup />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByText(/Could not load team signals/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/service unavailable/i)).toBeInTheDocument();
  });

  it('renders the no-deals empty state when teamPipeline is ready but empty', () => {
    useManagerDataMock.mockReturnValue(ready([]));
    render(<ManagerAutopilotRollup />);
    expect(
      screen.getByText(/No active deals on the team yet/i),
    ).toBeInTheDocument();
  });

  it('renders the no-signals empty state when no deal surfaces a suggestion', () => {
    // Two healthy deals: future close, fresh stage entry, fresh activity.
    useManagerDataMock.mockReturnValue(
      ready([
        deal({
          id: 'q1',
          name: 'Quiet One',
          targetCloseDate: isoDaysFromNow(90),
          stageEntryDate: isoDaysAgo(2),
          modifiedOn: isoDaysAgo(1),
        }),
        deal({
          id: 'q2',
          name: 'Quiet Two',
          targetCloseDate: isoDaysFromNow(120),
          stageEntryDate: isoDaysAgo(3),
          modifiedOn: isoDaysAgo(2),
        }),
      ]),
    );
    render(<ManagerAutopilotRollup />);
    expect(
      screen.getByText(
        /No next-best-action suggestions from current records\./i,
      ),
    ).toBeInTheDocument();
    // Must NOT say any of the forbidden empty-state phrases.
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/\ball\s+clear\b/i);
    expect(text).not.toMatch(/\bno\s+risk\b/i);
    expect(text).not.toMatch(/\bportfolio\s+healthy\b/i);
    expect(text).not.toMatch(/\beverything\s+is\s+fine\b/i);
  });

  it('renders priority count chips + top deal rows when signals fire', () => {
    useManagerDataMock.mockReturnValue(
      ready([
        // HIGH — closing-soon + stale activity.
        deal({
          id: 'h1',
          name: 'High Acme',
          targetCloseDate: isoDaysFromNow(5),
          modifiedOn: isoDaysAgo(20),
          assignedBankerName: 'M. Paller',
        }),
        // MEDIUM — stage aging only.
        deal({
          id: 'm1',
          name: 'Medium Beta',
          stageEntryDate: isoDaysAgo(45),
          modifiedOn: isoDaysAgo(1),
          assignedBankerName: 'B. Other',
        }),
        // LOW — stale activity only.
        deal({
          id: 'l1',
          name: 'Low Gamma',
          targetCloseDate: isoDaysFromNow(60),
          modifiedOn: isoDaysAgo(30),
          assignedBankerName: undefined,
        }),
        // Quiet deal (no signal — should not appear).
        deal({
          id: 'q1',
          name: 'Quiet Delta',
          targetCloseDate: isoDaysFromNow(120),
          stageEntryDate: isoDaysAgo(2),
          modifiedOn: isoDaysAgo(1),
        }),
      ]),
    );
    render(<ManagerAutopilotRollup />);

    // Priority chips by aria-label.
    expect(screen.getByLabelText(/High priority: 1 deal\b/i)).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Medium priority: 1 deal\b/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Low priority: 1 deal\b/i)).toBeInTheDocument();

    // Scan line.
    expect(
      screen.getByText(/Scanned 4 team deals · 3 with signals/i),
    ).toBeInTheDocument();

    // The top deal row order is HIGH → MEDIUM → LOW.
    const list = screen.getByRole('list', {
      name: /Top team deals with next-best-action signals/i,
    });
    const items = within(list).getAllByRole('listitem');
    expect(items.length).toBe(3);
    expect(items[0]!.textContent).toContain('High Acme');
    expect(items[1]!.textContent).toContain('Medium Beta');
    expect(items[2]!.textContent).toContain('Low Gamma');

    // Banker shown on rows.
    expect(items[0]!.textContent).toContain('M. Paller');
    expect(items[1]!.textContent).toContain('B. Other');
    expect(items[2]!.textContent).toContain('(unassigned)');
  });

  it('clicking a deal-name button navigates to /deals/<id>', async () => {
    useManagerDataMock.mockReturnValue(
      ready([
        deal({
          id: 'd-target',
          name: 'Target Deal',
          stageEntryDate: isoDaysAgo(45),
          modifiedOn: isoDaysAgo(1),
        }),
      ]),
    );
    render(<ManagerAutopilotRollup />);
    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: /Open deal Target Deal/i }),
    );
    expect(navigateSpy).toHaveBeenCalledWith('/deals/d-target');
  });

  it('renders the signal-coverage disclaimer and the conservative disclaimer', () => {
    useManagerDataMock.mockReturnValue(
      ready([
        deal({
          id: 'h1',
          name: 'High Acme',
          targetCloseDate: isoDaysFromNow(5),
          modifiedOn: isoDaysAgo(20),
        }),
      ]),
    );
    render(<ManagerAutopilotRollup />);
    expect(
      screen.getByText(/Manager rollup uses deal-record signals only/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/banker's deal workspace/i),
    ).toBeInTheDocument();
    // The bottom disclaimer.
    expect(
      screen.getByText(
        /No AI or automated decisions\. Manager visibility is scoped/i,
      ),
    ).toBeInTheDocument();
  });

  it('rendered DOM never contains AI / automation / decisioning / prediction vocabulary as a positive claim', () => {
    useManagerDataMock.mockReturnValue(
      ready([
        deal({
          id: 'h1',
          name: 'High Acme',
          targetCloseDate: isoDaysFromNow(5),
          modifiedOn: isoDaysAgo(20),
        }),
      ]),
    );
    const { container } = render(<ManagerAutopilotRollup />);
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/\bAI[ -]?generated\b/i);
    expect(text).not.toMatch(/\bautopilot\s+executed\b/i);
    expect(text).not.toMatch(/\b(is|was|has been|will be)\s+approved\b/i);
    expect(text).not.toMatch(/\bdecisioned\b/i);
    expect(text).not.toMatch(/\bguaranteed\b/i);
    expect(text).not.toMatch(/\bsystem\s+will\s+complete\b/i);
    expect(text).not.toMatch(/\bprediction\b/i);
    // Positive automation claim — disclaimer's "Nothing happens
    // automatically" is allowed (negation). Forbid affirmative forms.
    expect(text).not.toMatch(
      /\b(executes|runs|completes|approves|decides)\s+automatically\b/i,
    );
  });

  // ----- Phase 83: local suggestion ledger integration -----

  describe('Phase 83 — local suggestion ledger', () => {
    function flagged() {
      return [
        deal({
          id: 'd-flagged',
          name: 'Flagged Deal',
          stageEntryDate: isoDaysAgo(45),
          modifiedOn: isoDaysAgo(1),
        }),
      ];
    }

    beforeEach(() => {
      localStorage.clear();
    });

    it('renders a "Dismiss locally" button on each populated row', () => {
      useManagerDataMock.mockReturnValue(ready(flagged()));
      render(<ManagerAutopilotRollup />);
      expect(
        screen.getByRole('button', {
          name: /Dismiss suggestion for Flagged Deal locally/i,
        }),
      ).toBeInTheDocument();
    });

    it('clicking Dismiss locally marks the row dismissed with a Restore button', async () => {
      useManagerDataMock.mockReturnValue(ready(flagged()));
      render(<ManagerAutopilotRollup />);
      const user = userEvent.setup();
      await user.click(
        screen.getByRole('button', {
          name: /Dismiss suggestion for Flagged Deal locally/i,
        }),
      );
      expect(screen.getByText(/Dismissed locally/i)).toBeInTheDocument();
      expect(
        screen.getByRole('button', {
          name: /Restore suggestion for Flagged Deal/i,
        }),
      ).toBeInTheDocument();
    });

    it('clicking the deal-name records "opened" and navigates', async () => {
      useManagerDataMock.mockReturnValue(ready(flagged()));
      render(<ManagerAutopilotRollup />);
      const user = userEvent.setup();
      await user.click(
        screen.getByRole('button', { name: /Open deal Flagged Deal/i }),
      );
      expect(navigateSpy).toHaveBeenCalledWith('/deals/d-flagged');
      expect(
        screen.getAllByText(/Opened locally/i).length,
      ).toBeGreaterThanOrEqual(1);
    });

    it('extends the conservative disclaimer with the local-tracking copy', () => {
      useManagerDataMock.mockReturnValue(ready(flagged()));
      render(<ManagerAutopilotRollup />);
      expect(
        screen.getByText(/tracked on this browser only/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/do not change deal status/i),
      ).toBeInTheDocument();
    });

    it('rehydrates a pre-existing dismissed entry from localStorage on mount', () => {
      localStorage.setItem(
        'cc:autopilotSuggestionLedger:v1',
        JSON.stringify({
          'manager-rollup|d-flagged|stage-aging': {
            key: 'manager-rollup|d-flagged|stage-aging',
            surface: 'manager-rollup',
            suggestionId: 'stage-aging',
            dealId: 'd-flagged',
            action: 'dismissed',
            recordedAt: '2026-05-17T10:00:00.000Z',
            titleSnapshot: '45 days in current stage',
          },
        }),
      );
      useManagerDataMock.mockReturnValue(ready(flagged()));
      render(<ManagerAutopilotRollup />);
      expect(screen.getByText(/Dismissed locally/i)).toBeInTheDocument();
      expect(
        screen.getByRole('button', {
          name: /Restore suggestion for Flagged Deal/i,
        }),
      ).toBeInTheDocument();
    });
  });
});
