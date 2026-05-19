// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

describe('ActivityTimeline — Phase 99 Copy Teams summary', () => {
  it('renders the Copy Teams summary button when timeline events exist', () => {
    useDealDataMock.mockReturnValue(ready([event('e1', T_NEW_1)]));
    render(<ActivityTimeline />);
    const btn = screen.getByRole('button', {
      name: /Copy Teams summary for Acme Working Capital activity timeline/i,
    });
    expect(btn).toBeEnabled();
    expect(btn.textContent).toContain('Copy Teams summary');
  });

  it('does NOT render the Copy button when the timeline is empty', () => {
    useDealDataMock.mockReturnValue(ready([]));
    render(<ActivityTimeline />);
    expect(
      screen.queryByRole('button', {
        name: /Copy Teams summary for Acme Working Capital activity timeline/i,
      }),
    ).toBeNull();
  });

  it('does NOT render the Copy button while the activity slot is loading', () => {
    useDealDataMock.mockReturnValue({
      ...ready([]),
      activity: { kind: 'loading' },
    } as DealData);
    render(<ActivityTimeline />);
    expect(
      screen.queryByRole('button', {
        name: /Copy Teams summary/i,
      }),
    ).toBeNull();
  });

  it('does NOT render the Copy button when the activity slot fails to load', () => {
    useDealDataMock.mockReturnValue({
      ...ready([]),
      activity: { kind: 'failed', message: 'boom' },
    } as DealData);
    render(<ActivityTimeline />);
    expect(
      screen.queryByRole('button', {
        name: /Copy Teams summary/i,
      }),
    ).toBeNull();
  });

  it('clicking Copy Teams summary writes the formatted digest to the clipboard', async () => {
    useDealDataMock.mockReturnValue(
      ready([
        event('e1', T_NEW_1, {
          title: 'Q2 financials received',
          eventType: 'TaskCompleted',
          relatedEntityType: 'cr664_dealtask1',
          actorName: 'M. Paller',
        }),
      ]),
    );
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    render(<ActivityTimeline />);
    await user.click(
      screen.getByRole('button', {
        name: /Copy Teams summary for Acme Working Capital activity timeline/i,
      }),
    );
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    const written = writeText.mock.calls[0]![0] as string;
    expect(written).toMatch(
      /^Acme Working Capital — activity digest — \d{4}-\d{2}-\d{2}\n/,
    );
    expect(written).toContain('1 timeline event.');
    expect(written).toContain('Q2 financials received');
    // The caller maps cr664_dealtask1 → "Task" via friendlyEntityLabel
    // before passing it to the formatter.
    expect(written).toContain('(Task · by M. Paller)');
    expect(written).toContain(
      'Local copy only. Not posted to Teams. Paste into Teams. ' +
        'You send the message manually.',
    );
  });

  it('shows "Copied to clipboard. Paste into Teams." status after a successful copy', async () => {
    useDealDataMock.mockReturnValue(ready([event('e1', T_NEW_1)]));
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    render(<ActivityTimeline />);
    await user.click(
      screen.getByRole('button', {
        name: /Copy Teams summary for Acme Working Capital activity timeline/i,
      }),
    );
    const status = await screen.findByText(
      /Copied to clipboard\. Paste into Teams\./i,
    );
    expect(status.closest('[role="status"]')).not.toBeNull();
  });

  it('shows "Clipboard unavailable. Select timeline text and copy manually." alert when clipboard is missing', async () => {
    useDealDataMock.mockReturnValue(ready([event('e1', T_NEW_1)]));
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    });
    render(<ActivityTimeline />);
    await user.click(
      screen.getByRole('button', {
        name: /Copy Teams summary for Acme Working Capital activity timeline/i,
      }),
    );
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(
      /Clipboard unavailable\. Select timeline text and copy manually\./i,
    );
  });

  it('clicking Copy does NOT mutate the Phase 72 last-visit marker', async () => {
    // Pre-seed the marker so we can prove the COPY click does not
    // overwrite it. The Phase 72 hook may write its own settled
    // value some time after mount — we capture the immediate
    // post-mount value BEFORE the click and assert it matches the
    // post-click value. Any drift would indicate the copy click
    // itself wrote to the marker, which Phase 99 forbids.
    localStorage.setItem(
      `${LAST_VISIT_STORAGE_KEY_PREFIX}${baseDeal.id}`,
      String(Date.parse(T_PRIOR)),
    );
    useDealDataMock.mockReturnValue(ready([event('e1', T_NEW_1)]));
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    render(<ActivityTimeline />);
    // Wait for the Copy button to render (i.e. activity is ready)
    // and capture the marker AFTER the Phase 72 hook's mount-time
    // effects but BEFORE the click.
    await screen.findByRole('button', {
      name: /Copy Teams summary for Acme Working Capital activity timeline/i,
    });
    const markerBefore = localStorage.getItem(
      `${LAST_VISIT_STORAGE_KEY_PREFIX}${baseDeal.id}`,
    );
    await user.click(
      screen.getByRole('button', {
        name: /Copy Teams summary for Acme Working Capital activity timeline/i,
      }),
    );
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    const markerAfter = localStorage.getItem(
      `${LAST_VISIT_STORAGE_KEY_PREFIX}${baseDeal.id}`,
    );
    // The click MUST NOT change the marker — Phase 72 auto-bump
    // is independent of the Phase 99 copy action.
    expect(markerAfter).toBe(markerBefore);
  });

  it('renders the conservative copy disclaimer next to the button', () => {
    useDealDataMock.mockReturnValue(ready([event('e1', T_NEW_1)]));
    render(<ActivityTimeline />);
    expect(
      screen.getByText(
        /Local copy only\. Not posted to Teams\. Paste into Teams\. You send the message manually\. Copying does not mark activity seen or change deal status\./i,
      ),
    ).toBeInTheDocument();
  });

  it('the rendered DOM never claims sent / posted / delivered / notified / synced / Teams integrated / Graph connected', () => {
    useDealDataMock.mockReturnValue(ready([event('e1', T_NEW_1)]));
    render(<ActivityTimeline />);
    // Strip the negation-laden disclaimer line(s) before checking
    // forbidden positive claims.
    const body =
      document.body.textContent
        ?.replace(/Not posted to Teams\.?/g, '')
        ?? '';
    expect(body).not.toMatch(/\bsent\b/i);
    expect(body).not.toMatch(/\bposted\b/i);
    expect(body).not.toMatch(/\bdelivered\b/i);
    expect(body).not.toMatch(/\bnotified\b/i);
    expect(body).not.toMatch(/Teams\s+integrated/i);
    expect(body).not.toMatch(/Graph\s+connected/i);
  });

  it('the copied output never claims sent / posted / delivered / notified / synced / Teams integrated', async () => {
    useDealDataMock.mockReturnValue(
      ready([event('e1', T_NEW_1), event('e2', T_NEW_2)]),
    );
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    render(<ActivityTimeline />);
    await user.click(
      screen.getByRole('button', {
        name: /Copy Teams summary for Acme Working Capital activity timeline/i,
      }),
    );
    await waitFor(() => {
      expect(writeText).toHaveBeenCalled();
    });
    const text = writeText.mock.calls[0]![0] as string;
    const body = text.replace(/— Local copy only\.[^\n]+/g, '');
    expect(body).not.toMatch(/\bsent\b/i);
    expect(body).not.toMatch(/\bposted\b/i);
    expect(body).not.toMatch(/\bdelivered\b/i);
    expect(body).not.toMatch(/\bnotified\b/i);
    expect(body).not.toMatch(/\bsynced\b/i);
    expect(body).not.toMatch(/Teams\s+integrated/i);
    expect(body).not.toMatch(/Graph\s+connected/i);
  });
});
