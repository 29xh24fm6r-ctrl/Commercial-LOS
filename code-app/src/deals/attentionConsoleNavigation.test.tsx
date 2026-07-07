// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DealDetail } from './dealQueries';
import type { DealData } from './DealDataProvider';

/**
 * Attention Console navigation actions.
 *
 * The Attention Console signal rows used to look actionable but a
 * click did nothing. These tests pin the fix:
 *   - overdue-task signal → scrolls/focuses the Tasks panel;
 *   - missing-data signal → scrolls/focuses the deal details surface;
 *   - overdue-document signal → scrolls/focuses the Documents panel;
 *   - a signal with no known destination stays read-only (no button);
 *   - clicking never triggers a Dataverse write (no refresh / mutation).
 *
 * The derivation primitive (deriveBlockers) is exercised in
 * blockerRules.test.ts; this file verifies the panel wiring.
 */

vi.mock('./DealDataProvider', () => ({
  useDealData: vi.fn(),
}));

import { useDealData } from './DealDataProvider';
import { DealBlockers } from './DealBlockers';
import {
  attentionDestinationFor,
  focusAttentionTarget,
} from './attentionNavigation';

const useDealDataMock = vi.mocked(useDealData);

const NOW = new Date();
const MS_PER_DAY = 24 * 60 * 60 * 1000;
function isoDaysAgo(d: number): string {
  return new Date(NOW.getTime() - d * MS_PER_DAY).toISOString();
}
function isoDaysFromNow(d: number): string {
  return new Date(NOW.getTime() + d * MS_PER_DAY).toISOString();
}

function baseDeal(over: Partial<DealDetail> = {}): DealDetail {
  return {
    id: 'd-nav',
    name: 'Acme RLOC',
    clientName: 'Acme',
    stage: 'Underwriting',
    status: 'Active',
    amount: 4_500_000,
    bankerName: 'M. Paller',
    targetCloseDate: isoDaysFromNow(60),
    productType: 'RLOC',
    loanStructure: undefined,
    customerType: undefined,
    industry: undefined,
    guarantorStructure: undefined,
    pricingType: undefined,
    spreadIndex: undefined,
    spreadMargin: undefined,
    collateralSummary: undefined,
    createdOn: undefined,
    stageEntryDate: isoDaysAgo(5),
    isClosed: false,
    ...over,
  };
}

function readyDealData(over: Partial<DealData> = {}): DealData {
  return {
    deal: baseDeal(),
    tasks: { kind: 'ready', data: { open: [], completed: [] } },
    documents: {
      kind: 'ready',
      data: { outstanding: [], received: [], reviewed: [] },
    },
    creditMemo: { kind: 'ready', data: { memos: [], sections: [] } },
    activity: { kind: 'ready', data: [] },
    refresh: () => undefined,
    ...over,
  };
}

/** Append a wrapper carrying the given data-deal-card attribute and
 *  spy on its scrollIntoView, mirroring BankerDealWorkspace wiring. */
function mountSurface(card: string): { el: HTMLElement; scroll: ReturnType<typeof vi.fn> } {
  const el = document.createElement('div');
  el.setAttribute('data-deal-card', card);
  document.body.appendChild(el);
  const scroll = vi.fn();
  el.scrollIntoView = scroll;
  return { el, scroll };
}

const surfaces: HTMLElement[] = [];
afterEach(() => {
  for (const el of surfaces.splice(0)) el.remove();
  vi.clearAllMocks();
});

function surface(card: string) {
  const s = mountSurface(card);
  surfaces.push(s.el);
  return s;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Attention Console — navigation destinations map', () => {
  it('maps overdue tasks / documents / missing data to the right surfaces', () => {
    expect(attentionDestinationFor('overdue-tasks')?.selector).toBe(
      '[data-deal-card="tasks"]',
    );
    expect(attentionDestinationFor('overdue-documents')?.selector).toBe(
      '[data-deal-card="documents"]',
    );
    expect(attentionDestinationFor('missing-required')?.selector).toBe(
      '[data-deal-card="deal-summary"]',
    );
  });

  it('returns undefined for an unknown signal id (read-only)', () => {
    expect(attentionDestinationFor('some-future-signal')).toBeUndefined();
  });

  it('focusAttentionTarget no-ops safely when the target is absent', () => {
    expect(focusAttentionTarget('[data-deal-card="not-present"]')).toBe(false);
  });
});

describe('Attention Console — clicking a signal focuses its surface', () => {
  it('clicking the overdue-task item scrolls + focuses the Tasks panel', async () => {
    const { el, scroll } = surface('tasks');
    useDealDataMock.mockReturnValue(
      readyDealData({
        tasks: {
          kind: 'ready',
          data: {
            open: [
              {
                id: 't1',
                title: 'Send Q2 financials',
                dueDate: isoDaysAgo(3),
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
    render(<DealBlockers />);
    const button = screen.getByRole('button', { name: /go to Tasks/i });
    await userEvent.click(button);
    expect(scroll).toHaveBeenCalledTimes(1);
    // Non-interactive wrapper picks up tabindex -1 so it can be focused.
    expect(el.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(el);
  });

  it('clicking the missing-data item scrolls + focuses the deal details surface', async () => {
    const { scroll } = surface('deal-summary');
    useDealDataMock.mockReturnValue(
      readyDealData({
        deal: baseDeal({ amount: undefined, clientName: undefined }),
      }),
    );
    render(<DealBlockers />);
    const button = screen.getByRole('button', { name: /go to Deal details/i });
    await userEvent.click(button);
    expect(scroll).toHaveBeenCalledTimes(1);
  });

  it('clicking the overdue-document item scrolls + focuses the Documents panel', async () => {
    const { scroll } = surface('documents');
    useDealDataMock.mockReturnValue(
      readyDealData({
        documents: {
          kind: 'ready',
          data: {
            outstanding: [
              {
                id: 'doc1',
                name: 'PFS',
                dueDate: isoDaysAgo(2),
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
    render(<DealBlockers />);
    const button = screen.getByRole('button', { name: /go to Documents/i });
    await userEvent.click(button);
    expect(scroll).toHaveBeenCalledTimes(1);
  });

  it('activates via the keyboard (Enter) — actionable rows are real buttons', async () => {
    const { scroll } = surface('tasks');
    useDealDataMock.mockReturnValue(
      readyDealData({
        tasks: {
          kind: 'ready',
          data: {
            open: [
              {
                id: 't1',
                title: 'Send Q2 financials',
                dueDate: isoDaysAgo(3),
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
    render(<DealBlockers />);
    const button = screen.getByRole('button', { name: /go to Tasks/i });
    button.focus();
    expect(document.activeElement).toBe(button);
    await userEvent.keyboard('{Enter}');
    expect(scroll).toHaveBeenCalledTimes(1);
  });
});

describe('Attention Console — read-only + no-write guarantees', () => {
  it('does not trigger a Dataverse write (refresh) when a navigation item is clicked', async () => {
    surface('tasks');
    const refresh = vi.fn();
    useDealDataMock.mockReturnValue(
      readyDealData({
        refresh,
        tasks: {
          kind: 'ready',
          data: {
            open: [
              {
                id: 't1',
                title: 'Send Q2 financials',
                dueDate: isoDaysAgo(3),
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
    render(<DealBlockers />);
    const button = screen.getByRole('button', { name: /go to Tasks/i });
    await userEvent.click(button);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('renders a clear deal with no fake actionable rows (nothing pretends to be clickable)', () => {
    // A pristine, closed deal produces no signals at all.
    useDealDataMock.mockReturnValue(
      readyDealData({ deal: baseDeal({ isClosed: true }) }),
    );
    const { container } = render(<DealBlockers />);
    // No signal buttons rendered when there are no signals.
    const navButtons = container.querySelectorAll('[data-attention-nav]');
    expect(navButtons.length).toBe(0);
  });

  it('renders actionable rows as <button> (not inert divs) with a where-it-goes aria-label', () => {
    surface('tasks');
    useDealDataMock.mockReturnValue(
      readyDealData({
        tasks: {
          kind: 'ready',
          data: {
            open: [
              {
                id: 't1',
                title: 'Send Q2 financials',
                dueDate: isoDaysAgo(3),
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
    render(<DealBlockers />);
    const list = screen.getByRole('list');
    const button = within(list).getByRole('button', { name: /go to Tasks/i });
    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('aria-label')).toMatch(/overdue open task/i);
    expect(button.getAttribute('aria-label')).toMatch(/go to Tasks/i);
  });
});
