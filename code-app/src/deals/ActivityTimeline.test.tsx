// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { DealDetail } from './dealQueries';
import type { DealData } from './DealDataProvider';
import type { TimelineEvent } from './activityQueries';
import { LAST_VISIT_STORAGE_KEY_PREFIX } from '../shared/lastVisit/lastVisit';

/**
 * Phase 72 — ActivityTimeline integration with the per-deal
 * last-visit marker. Covers:
 *   - First-visit subtitle ("first visit on this browser")
 *   - Subsequent-visit "N new since your last visit" subtitle
 *   - Empty-since-last-visit "No new activity since your last
 *     visit" subtitle
 *   - Per-row "New" badge appears only on events newer than the
 *     prior marker (boundary equality excluded)
 *   - First-visit path: no "New" badge anywhere
 *   - Loading / failed states preserved (Phase 72 does not alter
 *     these paths)
 */

vi.mock('./DealDataProvider', () => ({
  useDealData: vi.fn(),
}));

import { useDealData } from './DealDataProvider';
import { ActivityTimeline } from './ActivityTimeline';

const useDealDataMock = vi.mocked(useDealData);

const baseDeal: DealDetail = {
  id: 'deal-phase72',
  name: 'Acme Working Capital',
  clientName: 'Acme',
  stage: 'Underwriting',
  status: 'Active',
  amount: 4_500_000,
  bankerName: 'M. Paller',
  targetCloseDate: '2026-09-30T00:00:00Z',
  productType: 'RLOC',
  loanStructure: 'Senior Secured',
  customerType: 'C&I',
  industry: 'Manufacturing',
  guarantorStructure: 'Two personal',
  pricingType: 'Floating',
  spreadIndex: 'SOFR',
  spreadMargin: 275,
  collateralSummary: 'A/R, inventory',
  createdOn: '2026-01-15T00:00:00Z',
  stageEntryDate: '2026-05-01T00:00:00Z',
  isClosed: false,
};

const T_PRIOR = '2026-05-15T12:00:00Z'; // banker's prior visit
const T_OLD_1 = '2026-05-10T08:00:00Z'; // before prior visit
const T_OLD_2 = '2026-05-15T11:59:59Z'; // 1 second before prior
const T_NEW_1 = '2026-05-16T09:00:00Z'; // after prior visit
const T_NEW_2 = '2026-05-17T14:00:00Z'; // after prior visit (newest)

function event(
  id: string,
  eventAt: string,
  overrides: Partial<TimelineEvent> = {},
): TimelineEvent {
  return {
    id,
    title: `Event ${id}`,
    summary: undefined,
    eventAt,
    eventType: 'NoteLogged',
    eventTypeKey: 'NoteLogged',
    eventSubType: undefined,
    isSystemGenerated: false,
    actorName: 'M. Paller',
    relatedEntityType: undefined,
    relatedEntityId: undefined,
    ...overrides,
  };
}

function ready(events: TimelineEvent[]): DealData {
  return {
    deal: baseDeal,
    tasks: { kind: 'ready', data: { open: [], completed: [] } },
    documents: {
      kind: 'ready',
      data: { outstanding: [], received: [], reviewed: [] },
    },
    creditMemo: { kind: 'ready', data: { memos: [], sections: [] } },
    activity: { kind: 'ready', data: events },
    refresh: () => undefined,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe('ActivityTimeline — Phase 72 first visit', () => {
  it('subtitle states "first visit on this browser" when no prior marker exists', () => {
    useDealDataMock.mockReturnValue(ready([event('e1', T_NEW_1)]));
    render(<ActivityTimeline />);
    expect(
      screen.getByText(/1 event, newest first · first visit on this browser/i),
    ).toBeInTheDocument();
  });

  it('renders NO "New" badge on the first visit (no prior marker to compare against)', () => {
    useDealDataMock.mockReturnValue(
      ready([event('e1', T_NEW_1), event('e2', T_NEW_2)]),
    );
    render(<ActivityTimeline />);
    // The badge text is "New"; with no prior marker, no row gets it.
    // We use queryAllByText to allow zero matches.
    const newBadges = screen.queryAllByText(/^new$/i);
    expect(newBadges).toEqual([]);
  });
});

describe('ActivityTimeline — Phase 72 subsequent visit', () => {
  it('renders "N new since your last visit" when events are newer than the prior marker', () => {
    // Pre-seed the marker so the hook reads "this is a returning visit"
    localStorage.setItem(
      `${LAST_VISIT_STORAGE_KEY_PREFIX}${baseDeal.id}`,
      String(Date.parse(T_PRIOR)),
    );
    useDealDataMock.mockReturnValue(
      ready([
        event('old1', T_OLD_1),
        event('old2', T_OLD_2),
        event('new1', T_NEW_1),
        event('new2', T_NEW_2),
      ]),
    );
    render(<ActivityTimeline />);
    expect(
      screen.getByText(
        /4 events, newest first · 2 new since your last visit \(locally tracked, this browser\)/i,
      ),
    ).toBeInTheDocument();
  });

  it('renders "No new activity since your last visit" when nothing is newer than the marker', () => {
    localStorage.setItem(
      `${LAST_VISIT_STORAGE_KEY_PREFIX}${baseDeal.id}`,
      String(Date.parse(T_NEW_2) + 1000), // marker AFTER every event
    );
    useDealDataMock.mockReturnValue(
      ready([event('old1', T_OLD_1), event('new2', T_NEW_2)]),
    );
    render(<ActivityTimeline />);
    expect(
      screen.getByText(/No new activity since your last visit/i),
    ).toBeInTheDocument();
  });

  it('flags only events strictly newer than the prior marker with the "New" badge', () => {
    localStorage.setItem(
      `${LAST_VISIT_STORAGE_KEY_PREFIX}${baseDeal.id}`,
      String(Date.parse(T_PRIOR)),
    );
    useDealDataMock.mockReturnValue(
      ready([
        event('old1', T_OLD_1),
        event('old2', T_OLD_2),
        event('new1', T_NEW_1),
        event('new2', T_NEW_2),
      ]),
    );
    render(<ActivityTimeline />);
    // Two "New" badges (one per new event row).
    const newBadges = screen.getAllByText(/^new$/i);
    expect(newBadges).toHaveLength(2);
  });

  it('boundary check: an event at EXACTLY the prior marker is NOT flagged as new', () => {
    localStorage.setItem(
      `${LAST_VISIT_STORAGE_KEY_PREFIX}${baseDeal.id}`,
      String(Date.parse(T_PRIOR)),
    );
    useDealDataMock.mockReturnValue(
      ready([event('boundary', T_PRIOR), event('new1', T_NEW_1)]),
    );
    render(<ActivityTimeline />);
    // Only `new1` (strictly after the marker) carries the badge;
    // `boundary` (exactly at the marker) does NOT.
    const newBadges = screen.getAllByText(/^new$/i);
    expect(newBadges).toHaveLength(1);
  });

  it('the new-row tooltip explicitly states the marker is local + per-browser (no cross-device sync)', () => {
    localStorage.setItem(
      `${LAST_VISIT_STORAGE_KEY_PREFIX}${baseDeal.id}`,
      String(Date.parse(T_PRIOR)),
    );
    useDealDataMock.mockReturnValue(
      ready([event('new1', T_NEW_1)]),
    );
    const { container } = render(<ActivityTimeline />);
    const newBadge = screen.getByText(/^new$/i);
    expect(newBadge.getAttribute('title')).toMatch(/Locally tracked/i);
    expect(newBadge.getAttribute('title')).toMatch(/not synced across devices/i);
    // And the row carries the data-attribute marker.
    const newRow = container.querySelector(
      '[data-new-since-last-visit="true"]',
    );
    expect(newRow).not.toBeNull();
  });

  it('does NOT render any synced / real-time / AI / notification claim', () => {
    localStorage.setItem(
      `${LAST_VISIT_STORAGE_KEY_PREFIX}${baseDeal.id}`,
      String(Date.parse(T_PRIOR)),
    );
    useDealDataMock.mockReturnValue(
      ready([event('new1', T_NEW_1)]),
    );
    render(<ActivityTimeline />);
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/\bsynced?\b/i);
    expect(text).not.toMatch(/\breal[- ]?time\b/i);
    expect(text).not.toMatch(/\bAI[ -]detected\b/i);
    expect(text).not.toMatch(/\bnotification\b/i);
    expect(text).not.toMatch(/\bunread count\b/i);
    expect(text).not.toMatch(/\bsystem alert\b/i);
    expect(text).not.toMatch(/\bguaranteed complete\b/i);
    // And the conservative phrasing IS present.
    expect(text).toMatch(/locally tracked, this browser/i);
  });
});

describe('ActivityTimeline — Phase 72 preserves loading / failed paths', () => {
  it('loading state renders unchanged', () => {
    useDealDataMock.mockReturnValue({
      ...ready([]),
      activity: { kind: 'loading' },
    } as DealData);
    render(<ActivityTimeline />);
    expect(screen.getByText(/Loading activity/i)).toBeInTheDocument();
  });

  it('failed state renders unchanged', () => {
    useDealDataMock.mockReturnValue({
      ...ready([]),
      activity: { kind: 'failed', message: 'boom' },
    } as DealData);
    render(<ActivityTimeline />);
    expect(screen.getByText(/Could not load activity/i)).toBeInTheDocument();
    expect(screen.getByText('boom')).toBeInTheDocument();
  });
});
