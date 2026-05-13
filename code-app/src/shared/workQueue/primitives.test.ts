import { describe, it, expect } from 'vitest';
import {
  BLOCKED_PAST_CLOSE_DAYS,
  CLOSING_SOON_DAYS,
  MAX_WORK_QUEUE_ROWS,
  STALE_STAGE_AT_RISK_DAYS,
  WORK_QUEUE_TIER_RANK,
  WORK_QUEUE_TIER_WINDOW,
  compareWorkQueueItems,
  countBySeverity,
  daysFromNow,
  formatQueueDate,
  isPastDue,
  overallBadgeLabel,
  overallSeverityKey,
  severityLabel,
  severityToKey,
  subtitleForCounts,
  tierBase,
  type WorkQueueItemBase,
  type WorkQueueSeverity,
} from './primitives';

const NOW_MS = new Date('2026-05-13T12:00:00Z').getTime();

describe('day thresholds — exposed as named constants', () => {
  it('mirror the values the three role queues already used', () => {
    expect(BLOCKED_PAST_CLOSE_DAYS).toBe(7);
    expect(STALE_STAGE_AT_RISK_DAYS).toBe(30);
    expect(CLOSING_SOON_DAYS).toBe(14);
    expect(MAX_WORK_QUEUE_ROWS).toBe(60);
  });
});

describe('tier rank + tierBase', () => {
  it('orders severities by urgency: blocked > overdue > at-risk > upcoming', () => {
    expect(WORK_QUEUE_TIER_RANK.blocked).toBeGreaterThan(
      WORK_QUEUE_TIER_RANK.overdue,
    );
    expect(WORK_QUEUE_TIER_RANK.overdue).toBeGreaterThan(
      WORK_QUEUE_TIER_RANK['at-risk'],
    );
    expect(WORK_QUEUE_TIER_RANK['at-risk']).toBeGreaterThan(
      WORK_QUEUE_TIER_RANK.upcoming,
    );
  });

  it('tierBase reserves a 10_000-wide window per tier so per-tier day counts cannot bleed across tiers', () => {
    expect(WORK_QUEUE_TIER_WINDOW).toBe(10_000);
    expect(tierBase('upcoming')).toBeLessThan(tierBase('at-risk'));
    expect(tierBase('at-risk')).toBeLessThan(tierBase('overdue'));
    expect(tierBase('overdue')).toBeLessThan(tierBase('blocked'));
    // Even adding a very large within-tier bump cannot promote a
    // lower-tier item above a higher tier.
    expect(tierBase('overdue') + 9_999).toBeLessThan(tierBase('blocked'));
  });
});

describe('isPastDue', () => {
  it('returns false for undefined / invalid ISO', () => {
    expect(isPastDue(undefined, NOW_MS)).toBe(false);
    expect(isPastDue('not-a-date', NOW_MS)).toBe(false);
  });

  it('returns true when the ISO predates the now timestamp', () => {
    expect(isPastDue('2026-05-12T00:00:00Z', NOW_MS)).toBe(true);
  });

  it('returns false when the ISO is in the future', () => {
    expect(isPastDue('2026-05-14T00:00:00Z', NOW_MS)).toBe(false);
  });
});

describe('daysFromNow — calendar-day differencing', () => {
  it('returns null for undefined / invalid ISO', () => {
    expect(daysFromNow(undefined, NOW_MS)).toBeNull();
    expect(daysFromNow('not-a-date', NOW_MS)).toBeNull();
  });

  it('reports banker-intuitive day counts independent of time-of-day', () => {
    // NOW is May 13 noon UTC. May 1 midnight UTC is 12 calendar days
    // back, not 12.5. Calendar-day differencing must round to whole
    // days based on start-of-UTC-day indices.
    expect(daysFromNow('2026-05-01T00:00:00Z', NOW_MS)).toBe(-12);
    // May 20 midnight is 7 days forward from May 13 noon (not 6 or
    // 6.5). Same rule.
    expect(daysFromNow('2026-05-20T00:00:00Z', NOW_MS)).toBe(7);
  });

  it('March 1 is 73 days back from May 13 (calendar)', () => {
    expect(daysFromNow('2026-03-01T00:00:00Z', NOW_MS)).toBe(-73);
  });
});

describe('compareWorkQueueItems', () => {
  function item(
    overrides: Partial<WorkQueueItemBase>,
  ): WorkQueueItemBase {
    return {
      id: overrides.id ?? 'x',
      severity: overrides.severity ?? 'upcoming',
      dealName: overrides.dealName ?? 'Some Deal',
      sortKey: overrides.sortKey ?? 0,
      ...overrides,
    };
  }

  it('sorts higher sortKey first (most urgent)', () => {
    const a = item({ id: 'a', sortKey: 50_000, dealName: 'A' });
    const b = item({ id: 'b', sortKey: 10_000, dealName: 'B' });
    expect([a, b].sort(compareWorkQueueItems).map((i) => i.id)).toEqual(['a', 'b']);
    expect([b, a].sort(compareWorkQueueItems).map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('breaks ties deterministically by dealName ascending', () => {
    const z = item({ id: 'z', sortKey: 100, dealName: 'Z Deal' });
    const a = item({ id: 'a', sortKey: 100, dealName: 'A Deal' });
    expect([z, a].sort(compareWorkQueueItems).map((i) => i.id)).toEqual(['a', 'z']);
  });
});

describe('severityToKey + severityLabel', () => {
  it('severity → theme SeverityKey mapping', () => {
    expect(severityToKey('blocked')).toBe('blocked');
    expect(severityToKey('overdue')).toBe('atRisk');
    expect(severityToKey('at-risk')).toBe('atRisk');
    expect(severityToKey('upcoming')).toBe('info');
  });

  it('severity → human label', () => {
    expect(severityLabel('blocked')).toBe('Blocked');
    expect(severityLabel('overdue')).toBe('Overdue');
    expect(severityLabel('at-risk')).toBe('At risk');
    expect(severityLabel('upcoming')).toBe('Upcoming');
  });
});

describe('countBySeverity + overall helpers', () => {
  function items(...severities: WorkQueueSeverity[]) {
    return severities.map((s, i) => ({ severity: s, id: String(i) }));
  }

  it('counts by severity and reports total', () => {
    const c = countBySeverity(
      items('blocked', 'blocked', 'overdue', 'at-risk', 'upcoming'),
    );
    expect(c.blocked).toBe(2);
    expect(c.overdue).toBe(1);
    expect(c.atRisk).toBe(1);
    expect(c.upcoming).toBe(1);
    expect(c.total).toBe(5);
  });

  it('overallSeverityKey rolls up: blocked > overdue/at-risk > upcoming > clear', () => {
    expect(overallSeverityKey(countBySeverity(items('blocked')))).toBe('blocked');
    expect(overallSeverityKey(countBySeverity(items('overdue')))).toBe('atRisk');
    expect(overallSeverityKey(countBySeverity(items('at-risk')))).toBe('atRisk');
    expect(overallSeverityKey(countBySeverity(items('upcoming')))).toBe('info');
    expect(overallSeverityKey(countBySeverity([]))).toBe('clear');
  });

  it('overallBadgeLabel mirrors overallSeverityKey copy', () => {
    expect(overallBadgeLabel(countBySeverity(items('blocked')))).toBe('Blockers open');
    expect(overallBadgeLabel(countBySeverity(items('overdue')))).toBe('Overdue items');
    expect(overallBadgeLabel(countBySeverity(items('at-risk')))).toBe('Review needed');
    expect(overallBadgeLabel(countBySeverity(items('upcoming')))).toBe('Upcoming');
    expect(overallBadgeLabel(countBySeverity([]))).toBe('Clear');
  });

  it('subtitleForCounts concatenates severity counts with " · " separators', () => {
    const c = countBySeverity(items('blocked', 'overdue', 'overdue', 'upcoming'));
    expect(subtitleForCounts(c)).toBe('1 blocked · 2 overdue · 1 upcoming');
  });

  it('subtitleForCounts falls back to a total-only string when all severities are zero', () => {
    expect(subtitleForCounts(countBySeverity([]))).toBe('0 work items');
  });
});

describe('formatQueueDate', () => {
  it('returns undefined for undefined / invalid ISO', () => {
    expect(formatQueueDate(undefined)).toBeUndefined();
    expect(formatQueueDate('not-a-date')).toBeUndefined();
  });

  it('renders en-US short month + day + year in UTC (so the date matches the underlying ISO regardless of local timezone)', () => {
    // Midnight UTC May 1 must read as "May 1" even when the test
    // environment runs in a non-UTC zone.
    expect(formatQueueDate('2026-05-01T00:00:00Z')).toBe('May 1, 2026');
    expect(formatQueueDate('2026-12-31T00:00:00Z')).toBe('Dec 31, 2026');
  });
});
