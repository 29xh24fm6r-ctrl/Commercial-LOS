import { describe, it, expect } from 'vitest';
import { deriveWatchlist, deriveCriticizedClassifiedTrend, type WatchlistInput } from './watchlist';

const NOW = '2026-06-30';

describe('deriveWatchlist', () => {
  it('includes criticized ratings and manual watch flags, excludes Pass', () => {
    const inputs: WatchlistInput[] = [
      { loanId: 'A', classification: 'Pass', exposure: 1_000_000 },
      { loanId: 'B', classification: 'Special Mention', exposure: 2_000_000 },
      { loanId: 'C', classification: 'Substandard', exposure: 3_000_000 },
      { loanId: 'D', classification: 'Pass', watchFlag: true, exposure: 500_000 }, // manual watch
    ];
    const b = deriveWatchlist(inputs, NOW);
    expect(b.entries.map((e) => e.loanId).sort()).toEqual(['B', 'C', 'D']);
    expect(b.criticizedCount).toBe(3);
    expect(b.classifiedCount).toBe(1); // only C (Substandard)
    expect(b.totalExposure).toBe(5_500_000);
  });

  it('groups by classification worst-first and ages entries', () => {
    const inputs: WatchlistInput[] = [
      { loanId: 'A', classification: 'Special Mention', exposure: 1_000_000, openedDate: '2026-06-20' },
      { loanId: 'B', classification: 'Doubtful', exposure: 2_000_000, openedDate: '2026-01-01' },
    ];
    const b = deriveWatchlist(inputs, NOW);
    // Doubtful sorts before Special Mention.
    expect(b.entries[0].loanId).toBe('B');
    expect(b.entries[0].agedDays).toBe(180);
    expect(b.groups[0].classification).toBe('Doubtful');
  });

  it('flags an overdue action plan', () => {
    const b = deriveWatchlist(
      [{ loanId: 'A', classification: 'Substandard', actionPlan: { status: 'in_progress', dueDate: '2026-05-01' } }],
      NOW,
    );
    expect(b.entries[0].actionPlanOverdue).toBe(true);
    expect(b.actionPlansOverdue).toBe(1);
  });

  it('does not flag a completed action plan as overdue', () => {
    const b = deriveWatchlist(
      [{ loanId: 'A', classification: 'Substandard', actionPlan: { status: 'complete', dueDate: '2026-05-01' } }],
      NOW,
    );
    expect(b.entries[0].actionPlanOverdue).toBe(false);
  });
});

describe('deriveCriticizedClassifiedTrend', () => {
  it('reports deterioration when the criticized/classified count rises', () => {
    const current = deriveWatchlist(
      [
        { loanId: 'A', classification: 'Special Mention', exposure: 1_000_000 },
        { loanId: 'B', classification: 'Substandard', exposure: 2_000_000 },
      ],
      NOW,
    );
    const t = deriveCriticizedClassifiedTrend({ criticizedCount: 1, classifiedCount: 0, totalExposure: 1_000_000 }, current);
    expect(t.criticizedDelta).toBe(1);
    expect(t.classifiedDelta).toBe(1);
    expect(t.direction).toBe('deteriorating');
  });

  it('reports improvement when counts fall', () => {
    const current = deriveWatchlist([{ loanId: 'A', classification: 'Special Mention', exposure: 1_000_000 }], NOW);
    const t = deriveCriticizedClassifiedTrend({ criticizedCount: 3, classifiedCount: 2, totalExposure: 5_000_000 }, current);
    expect(t.direction).toBe('improving');
  });
});
