// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DealData } from './DealDataProvider';
import type { DealDetail } from './dealQueries';

/**
 * Phase 80 — DealAutopilotPanel rendering tests.
 *
 * Pins:
 *   - loading state while any required data slot is non-ready;
 *   - empty state copy (must NOT say "all clear" / "no risk");
 *   - populated state with priority badges + reasons + Basis line +
 *     suggestedActionLabel button;
 *   - click handler scrolls the targeted data-deal-card wrapper into
 *     view (and does NOT mutate any deal state);
 *   - conservative disclaimer renders verbatim ("Autopilot suggests,
 *     banker decides. ... never creates tasks, sends emails, advances
 *     the stage, marks documents reviewed, or calls AI.");
 *   - rendered DOM does not contain forbidden vocabulary
 *     (AI-generated / autopilot executed / automatically / approved /
 *     decisioned / guaranteed / system will complete / prediction).
 *
 * SDK + consistency check are mocked at the module boundary; the
 * derivation primitive is exercised in dealAutopilot.test.ts. This
 * file verifies the panel's wiring + rendered invariants.
 */

vi.mock('./DealDataProvider', () => ({
  useDealData: vi.fn(),
}));

vi.mock('../shared/creditMemoConsistency/checkCreditMemoConsistency', () => ({
  checkCreditMemoConsistency: vi.fn(),
}));

import { useDealData } from './DealDataProvider';
import { checkCreditMemoConsistency } from '../shared/creditMemoConsistency/checkCreditMemoConsistency';
import { DealAutopilotPanel } from './DealAutopilotPanel';

const useDealDataMock = vi.mocked(useDealData);
const checkMock = vi.mocked(checkCreditMemoConsistency);

const NOW = new Date('2026-05-18T12:00:00Z');
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isoDaysAgo(d: number): string {
  return new Date(NOW.getTime() - d * MS_PER_DAY).toISOString();
}
function isoDaysFromNow(d: number): string {
  return new Date(NOW.getTime() + d * MS_PER_DAY).toISOString();
}

function deal(o: Partial<DealDetail> = {}): DealDetail {
  return {
    id: 'd-current',
    name: 'Acme RLOC',
    clientName: 'Acme Manufacturing',
    stage: 'Underwriting',
    status: 'Active',
    amount: 4_000_000,
    bankerName: 'M. Paller',
    targetCloseDate: isoDaysFromNow(60),
    productType: 'RLOC',
    loanStructure: 'Senior Secured',
    customerType: 'C&I',
    industry: 'Manufacturing',
    guarantorStructure: undefined,
    pricingType: undefined,
    spreadIndex: undefined,
    spreadMargin: undefined,
    collateralSummary: undefined,
    createdOn: undefined,
    stageEntryDate: isoDaysAgo(5),
    isClosed: false,
    ...o,
  };
}

function readyData(over: Partial<DealData> = {}): DealData {
  // Default "healthy deal" baseline:
  //   - stage entered 5 days ago (not at-risk)
  //   - target close 60 days out (not closing soon)
  //   - one recent timeline event (so stale-activity signal does not
  //     auto-fire on the empty-state test)
  //   - no open tasks / documents / memos / consistency findings.
  return {
    deal: deal(),
    tasks: { kind: 'ready', data: { open: [], completed: [] } },
    documents: {
      kind: 'ready',
      data: { outstanding: [], received: [], reviewed: [] },
    },
    creditMemo: { kind: 'ready', data: { memos: [], sections: [] } },
    activity: {
      kind: 'ready',
      data: [
        {
          id: 'a-recent',
          eventAt: isoDaysAgo(1),
          eventType: 'NoteLogged',
          eventTypeKey: 'NoteLogged',
          eventSubType: undefined,
          title: 'Recent banker note',
          summary: undefined,
          actorName: 'M. Paller',
          isSystemGenerated: false,
          relatedEntityType: undefined,
          relatedEntityId: undefined,
        },
      ],
    },
    refresh: () => undefined,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Phase 128A — pin the wall clock to the fixture NOW so the
  // production component's `new Date()` (DealAutopilotPanel.tsx:109)
  // sees the same reference time the fixtures derive their iso
  // timestamps from. Previously these tests drifted into a "stale
  // activity" signal when wall-clock dates moved past the fixture's
  // 2026-05-18 horizon (6 pre-existing date-dependent failures).
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  // Default: consistency check finds no findings.
  checkMock.mockReturnValue({ hasDraftToCompare: false, findings: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('DealAutopilotPanel — Phase 80', () => {
  it('renders the loading state when any required slot is non-ready', () => {
    useDealDataMock.mockReturnValue(
      readyData({ tasks: { kind: 'loading' } }),
    );
    render(<DealAutopilotPanel />);
    // Phase 125E renamed the card title to "Action Console" but
    // kept the loading subtitle.
    expect(
      screen.getByRole('heading', { name: /Action Console/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Loading deal signals/i)).toBeInTheDocument();
  });

  it('renders the empty state when no signal fires', () => {
    useDealDataMock.mockReturnValue(readyData());
    render(<DealAutopilotPanel />);
    expect(
      screen.getByText(
        /No next-best-action suggestions from current records\./i,
      ),
    ).toBeInTheDocument();
    // Must NOT say "all clear" or "no risk".
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/\ball\s+clear\b/i);
    expect(text).not.toMatch(/\bno\s+risk\b/i);
  });

  it('renders an overdue-task suggestion with a HIGH priority badge', () => {
    useDealDataMock.mockReturnValue(
      readyData({
        tasks: {
          kind: 'ready',
          data: {
            open: [
              {
                id: 't1',
                title: 'Send Q2 financials',
                dueDate: isoDaysAgo(2),
                modifiedOn: undefined,
                completed: false,
                assigneeName: undefined,
              },
            ],
            completed: [],
          },
        },
      }),
    );
    render(<DealAutopilotPanel />);
    const list = screen.getByRole('list', {
      name: /next best actions for this deal/i,
    });
    const item = within(list).getByText(/1 overdue task\b/i);
    expect(item).toBeInTheDocument();
    expect(
      within(list).getByLabelText(/high priority suggestion/i),
    ).toBeInTheDocument();
    expect(
      within(list).getByText(/Basis:.*openTasks\.dueDate/),
    ).toBeInTheDocument();
  });

  it('clicking the suggested-action button scrolls the matching data-deal-card into view (and does NOT mutate deal state)', async () => {
    useDealDataMock.mockReturnValue(
      readyData({
        documents: {
          kind: 'ready',
          data: {
            outstanding: [
              {
                id: 'doc1',
                name: 'PFS',
                dueDate: undefined,
                requestDate: undefined,
                receivedDate: undefined,
                reviewer: undefined,
                uploaded: false,
                modifiedOn: undefined,
                status: 'outstanding',
              },
            ],
            received: [],
            reviewed: [],
          },
        },
      }),
    );

    // Render a host that includes the data-deal-card="documents"
    // wrapper alongside the panel — mirrors how BankerDealWorkspace
    // wires this up.
    const docsWrapper = document.createElement('div');
    docsWrapper.setAttribute('data-deal-card', 'documents');
    document.body.appendChild(docsWrapper);
    const scrollSpy = vi.fn();
    docsWrapper.scrollIntoView = scrollSpy;

    render(<DealAutopilotPanel />);
    const user = userEvent.setup();
    const button = screen.getByRole('button', {
      name: /Open Documents — banker chooses what to do/i,
    });
    await user.click(button);
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    // The wrapper picks up tabindex -1 so it can receive focus.
    expect(docsWrapper.getAttribute('tabindex')).toBe('-1');

    document.body.removeChild(docsWrapper);
  });

  it('renders the conservative disclaimer (Phase 125E shortened: "Read-only. Never creates tasks...")', () => {
    useDealDataMock.mockReturnValue(
      readyData({
        tasks: {
          kind: 'ready',
          data: {
            open: [
              {
                id: 't1',
                title: 'X',
                dueDate: isoDaysAgo(1),
                modifiedOn: undefined,
                completed: false,
                assigneeName: undefined,
              },
            ],
            completed: [],
          },
        },
      }),
    );
    render(<DealAutopilotPanel />);
    // Phase 125E trimmed the disclaimer to a single sentence:
    // "Read-only. Never creates tasks, sends emails, advances the
    //  stage, or calls AI."
    expect(
      screen.getByText(/Read-only\.\s*Never creates tasks, sends emails/i),
    ).toBeInTheDocument();
  });

  it('rendered DOM never contains AI / automation / decisioning / prediction vocabulary', () => {
    useDealDataMock.mockReturnValue(
      readyData({
        tasks: {
          kind: 'ready',
          data: {
            open: [
              {
                id: 't1',
                title: 'X',
                dueDate: isoDaysAgo(1),
                modifiedOn: undefined,
                completed: false,
                assigneeName: undefined,
              },
            ],
            completed: [],
          },
        },
        documents: {
          kind: 'ready',
          data: {
            outstanding: [
              {
                id: 'doc1',
                name: 'PFS',
                dueDate: undefined,
                requestDate: undefined,
                receivedDate: undefined,
                reviewer: undefined,
                uploaded: false,
                modifiedOn: undefined,
                status: 'outstanding',
              },
            ],
            received: [],
            reviewed: [],
          },
        },
      }),
    );
    const { container } = render(<DealAutopilotPanel />);
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/\bAI[ -]?generated\b/i);
    expect(text).not.toMatch(/\bautopilot\s+executed\b/i);
    expect(text).not.toMatch(/\b(is|was|has been|will be)\s+approved\b/i);
    expect(text).not.toMatch(/\bdecisioned\b/i);
    expect(text).not.toMatch(/\bguaranteed\b/i);
    expect(text).not.toMatch(/\bsystem\s+will\s+complete\b/i);
    expect(text).not.toMatch(/\bprediction\b/i);
    // "Nothing happens automatically" is allowed (explicit negation);
    // "happens automatically" without "Nothing" is not. The disclaimer
    // contains the negation form, so the regex matches "automatically"
    // — narrow the assertion to the positive claim form. The wording
    // we want to forbid is "executes automatically" / "runs
    // automatically" / "completes automatically".
    expect(text).not.toMatch(
      /\b(executes|runs|completes|approves|decides)\s+automatically\b/i,
    );
  });

  it('rolls up to at most three suggestions even when every signal fires', () => {
    useDealDataMock.mockReturnValue(
      readyData({
        deal: deal({
          targetCloseDate: isoDaysFromNow(5),
          stageEntryDate: isoDaysAgo(45),
        }),
        tasks: {
          kind: 'ready',
          data: {
            open: [
              {
                id: 't1',
                title: 'A',
                dueDate: isoDaysAgo(2),
                modifiedOn: undefined,
                completed: false,
                assigneeName: undefined,
              },
            ],
            completed: [],
          },
        },
        documents: {
          kind: 'ready',
          data: {
            outstanding: [
              {
                id: 'd1',
                name: 'PFS',
                dueDate: undefined,
                requestDate: undefined,
                receivedDate: undefined,
                reviewer: undefined,
                uploaded: false,
                modifiedOn: undefined,
                status: 'outstanding',
              },
            ],
            received: [
              {
                id: 'd2',
                name: 'Tax',
                dueDate: undefined,
                requestDate: undefined,
                receivedDate: isoDaysAgo(10),
                reviewer: undefined,
                uploaded: false,
                modifiedOn: undefined,
                status: 'received',
              },
            ],
            reviewed: [],
          },
        },
        activity: {
          kind: 'ready',
          data: [
            {
              id: 'a1',
              eventAt: isoDaysAgo(20),
              eventType: 'NoteLogged',
              eventTypeKey: 'NoteLogged',
              eventSubType: undefined,
              title: 'Phone call',
              summary: undefined,
              actorName: 'M. Paller',
              isSystemGenerated: false,
              relatedEntityType: undefined,
              relatedEntityId: undefined,
            },
          ],
        },
      }),
    );
    render(<DealAutopilotPanel />);
    const list = screen.getByRole('list', {
      name: /next best actions for this deal/i,
    });
    const items = within(list).getAllByRole('listitem');
    expect(items.length).toBeLessThanOrEqual(3);
    expect(items.length).toBe(3);
  });

  // ----- Phase 83: local suggestion ledger integration -----

  describe('Phase 83 — local suggestion ledger', () => {
    beforeEach(() => {
      localStorage.clear();
    });

    function oneOverdueTaskData(): DealData {
      return readyData({
        tasks: {
          kind: 'ready',
          data: {
            open: [
              {
                id: 't1',
                title: 'Send Q2 financials',
                dueDate: isoDaysAgo(2),
                modifiedOn: undefined,
                completed: false,
                assigneeName: undefined,
              },
            ],
            completed: [],
          },
        },
      });
    }

    it('renders a "Dismiss locally" button on each populated suggestion row', () => {
      useDealDataMock.mockReturnValue(oneOverdueTaskData());
      render(<DealAutopilotPanel />);
      expect(
        screen.getByRole('button', {
          name: /Dismiss suggestion .* locally/i,
        }),
      ).toBeInTheDocument();
    });

    it('clicking Dismiss locally marks the row dismissed (with tag + Restore button)', async () => {
      useDealDataMock.mockReturnValue(oneOverdueTaskData());
      render(<DealAutopilotPanel />);
      const user = userEvent.setup();
      await user.click(
        screen.getByRole('button', {
          name: /Dismiss suggestion .* locally/i,
        }),
      );
      expect(screen.getByText(/Dismissed locally/i)).toBeInTheDocument();
      // "tracked on this browser" appears in both the row tag and the
      // bottom disclaimer; assert at least one.
      expect(
        screen.getAllByText(/tracked on this browser/i).length,
      ).toBeGreaterThanOrEqual(1);
      // The action button disappears; Restore replaces the dismiss row.
      expect(
        screen.queryByRole('button', {
          name: /Dismiss suggestion .* locally/i,
        }),
      ).toBeNull();
      expect(
        screen.getByRole('button', { name: /Restore suggestion/i }),
      ).toBeInTheDocument();
    });

    it('clicking Restore re-shows the action button and removes the dismissed tag', async () => {
      useDealDataMock.mockReturnValue(oneOverdueTaskData());
      render(<DealAutopilotPanel />);
      const user = userEvent.setup();
      await user.click(
        screen.getByRole('button', {
          name: /Dismiss suggestion .* locally/i,
        }),
      );
      await user.click(
        screen.getByRole('button', { name: /Restore suggestion/i }),
      );
      expect(screen.queryByText(/Dismissed locally/i)).toBeNull();
      // Action button is back.
      expect(
        screen.getByRole('button', {
          name: /Open Tasks — banker chooses what to do/i,
        }),
      ).toBeInTheDocument();
    });

    it('clicking the action button records "opened" and shows the Opened locally tag', async () => {
      useDealDataMock.mockReturnValue(oneOverdueTaskData());
      render(<DealAutopilotPanel />);
      const user = userEvent.setup();
      await user.click(
        screen.getByRole('button', {
          name: /Open Tasks — banker chooses what to do/i,
        }),
      );
      // "Opened locally" appears in both the row tag and the bottom
      // disclaimer text; assert at least one.
      expect(
        screen.getAllByText(/Opened locally/i).length,
      ).toBeGreaterThanOrEqual(1);
    });

    it('extends the conservative disclaimer with the local-tracking copy (Phase 125E shortened)', () => {
      useDealDataMock.mockReturnValue(oneOverdueTaskData());
      render(<DealAutopilotPanel />);
      // Phase 125E shortened the disclaimer to a single sentence:
      // "...'Opened' / 'Dismiss locally' are tracked on this browser only."
      expect(
        screen.getByText(/tracked on this browser only/i),
      ).toBeInTheDocument();
    });

    it('the rendered DOM never claims the local action resolved / synced / officialized anything', async () => {
      useDealDataMock.mockReturnValue(oneOverdueTaskData());
      const { container } = render(<DealAutopilotPanel />);
      const user = userEvent.setup();
      await user.click(
        screen.getByRole('button', {
          name: /Dismiss suggestion .* locally/i,
        }),
      );
      const text = container.textContent ?? '';
      // Forbidden affirmative claims around dismissed semantics.
      expect(text).not.toMatch(/\b(is|was|has been)\s+resolved\b/i);
      expect(text).not.toMatch(/\b(is|was|has been)\s+completed\b/i);
      expect(text).not.toMatch(/\b(is|was|has been)\s+closed\b/i);
      expect(text).not.toMatch(/\b(is|was|has been)\s+synced\b/i);
      expect(text).not.toMatch(/\bofficial\s+(record|state|status)\b/i);
      expect(text).not.toMatch(/\bsystem\s+acknowledged\b/i);
      expect(text).not.toMatch(/\bAI[ -]?learned\b/i);
      expect(text).not.toMatch(/\bworkflow\s+updated\b/i);
    });

    it('a dismissed entry in localStorage at mount surfaces as dismissed (rehydration)', () => {
      // Pre-seed the ledger with a dismissed entry for the deal's
      // overdue-tasks suggestion.
      localStorage.setItem(
        'cc:autopilotSuggestionLedger:v1',
        JSON.stringify({
          'deal-panel|d-current|overdue-tasks': {
            key: 'deal-panel|d-current|overdue-tasks',
            surface: 'deal-panel',
            suggestionId: 'overdue-tasks',
            dealId: 'd-current',
            action: 'dismissed',
            recordedAt: '2026-05-17T10:00:00.000Z',
            titleSnapshot: '1 overdue task',
          },
        }),
      );
      useDealDataMock.mockReturnValue(oneOverdueTaskData());
      render(<DealAutopilotPanel />);
      expect(screen.getByText(/Dismissed locally/i)).toBeInTheDocument();
      // Restore button is the row's only action.
      expect(
        screen.getByRole('button', { name: /Restore suggestion/i }),
      ).toBeInTheDocument();
    });
  });
});

describe('DealAutopilotPanel — Phase 125 hotfix (deal-click crash, React error #310)', () => {
  /**
   * Phase 125 deploy surfaced a latent hooks-order bug in this
   * card: `useSuggestionLedger()` was called AFTER two early
   * returns (`if (!dataReady) return …` + `if (suggestions.length
   * === 0) return …`). That meant:
   *
   *   - initial loading render: 4 hooks (useDealData + 3 useMemos),
   *     returns early.
   *   - re-render once child loaders resolve AND the deal yields
   *     at least one autopilot suggestion: 5 hooks (the 4 above
   *     + the new useSuggestionLedger call past the early returns).
   *
   * React detects the count mismatch and throws error #310. In
   * production the deal workspace blanks out.
   *
   * The Phase 121 seeded deal (`TEST — Deal Phase 121`, target
   * close 7d out) is exactly the path that flips from
   * dataReady=false to suggestions.length > 0. The hotfix hoists
   * `useSuggestionLedger()` ABOVE every early return. This block
   * pins the regression so the bug cannot return.
   */

  function sparseDealClosingSoon(): DealDetail {
    // Mirrors the seeded TEST — Deal Phase 121 shape: sparse
    // summary fields, target close inside 14 days. The closing-
    // soon target alone is enough to make `deriveNextBestActions`
    // produce ≥1 suggestion, which is the bug-triggering branch.
    return deal({
      id: 'd-sparse',
      name: 'TEST — Deal Phase 121',
      clientName: 'TEST — Borrower Phase 121',
      bankerName: 'Matthew Paller',
      stage: 'TEST — Stage Phase 121',
      status: 'TEST — Status Phase 121',
      amount: 2_500_000,
      targetCloseDate: isoDaysFromNow(7),
      stageEntryDate: isoDaysAgo(1),
      productType: undefined,
      loanStructure: undefined,
      customerType: undefined,
      industry: undefined,
      guarantorStructure: undefined,
      pricingType: undefined,
      spreadIndex: undefined,
      spreadMargin: undefined,
      collateralSummary: undefined,
      createdOn: undefined,
    });
  }

  it('does NOT crash with React error #310 when the panel transitions from loading → ready+populated', () => {
    // Render 1: loading state (one slot non-ready). With the
    // pre-hotfix code this rendered 4 hooks before returning
    // early at `if (!dataReady) return …`.
    useDealDataMock.mockReturnValue(
      readyData({
        deal: sparseDealClosingSoon(),
        tasks: { kind: 'loading' },
      }),
    );
    const { rerender } = render(<DealAutopilotPanel />);
    expect(screen.getByText(/Loading deal signals/i)).toBeInTheDocument();

    // Render 2: every slot ready, sparse seeded deal closing in
    // 7 days. `deriveNextBestActions` produces a closing-soon
    // suggestion → suggestions.length > 0 → execution flows past
    // both early returns. Pre-hotfix this is where `useSuggestionLedger()`
    // would have been called as the 5th hook, mismatching the
    // previous render's 4-hook chain → React error #310.
    useDealDataMock.mockReturnValue(
      readyData({
        deal: sparseDealClosingSoon(),
        tasks: { kind: 'ready', data: { open: [], completed: [] } },
        documents: {
          kind: 'ready',
          data: { outstanding: [], received: [], reviewed: [] },
        },
        creditMemo: { kind: 'ready', data: { memos: [], sections: [] } },
        activity: { kind: 'ready', data: [] },
      }),
    );
    rerender(<DealAutopilotPanel />);

    // The panel should now render the populated branch without
    // throwing. We don't pin the exact suggestion text — the
    // primitive is exercised in dealAutopilot.test.ts. We pin
    // that SOMETHING from the populated branch renders + the
    // forbidden communication vocabulary stays absent.
    expect(
      screen.getByRole('list', { name: /next best actions for this deal/i }),
    ).toBeInTheDocument();
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/\bdelivered\b/i);
    expect(text).not.toMatch(/\bemail\s+(sent|delivered)\b/i);
    expect(text).not.toMatch(/\bborrower\s+(?:was|has\s+been)\s+notified\b/i);
  });

  it('does NOT crash when the panel transitions from loading → ready+empty', () => {
    // Companion to the above: the path that flips loading → ready
    // but produces ZERO suggestions also has to remain hook-order
    // stable. Pre-hotfix, this path returned early before the
    // useSuggestionLedger() call so the bug did NOT fire here —
    // but pinning both transitions guards against any future
    // refactor that re-introduces the conditional-hook pattern.
    useDealDataMock.mockReturnValue(
      readyData({
        deal: deal({ targetCloseDate: isoDaysFromNow(60) }),
        tasks: { kind: 'loading' },
      }),
    );
    const { rerender } = render(<DealAutopilotPanel />);
    expect(screen.getByText(/Loading deal signals/i)).toBeInTheDocument();

    useDealDataMock.mockReturnValue(readyData());
    rerender(<DealAutopilotPanel />);

    expect(
      screen.getByText(
        /No next-best-action suggestions from current records\./i,
      ),
    ).toBeInTheDocument();
  });
});
