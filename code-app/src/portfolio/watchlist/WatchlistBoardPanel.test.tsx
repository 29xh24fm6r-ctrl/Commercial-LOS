// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WatchlistBoardPanel } from './WatchlistBoardPanel';
import { deriveWatchlist } from './watchlist';

describe('WatchlistBoardPanel', () => {
  it('shows honest absence when the watchlist is clear', () => {
    render(<WatchlistBoardPanel board={deriveWatchlist([], '2026-06-30')} />);
    const panel = screen.getByLabelText('Watchlist');
    expect(panel).toHaveAttribute('data-watchlist', 'empty');
  });

  it('renders groups worst-first and entries with an overdue action plan', () => {
    const board = deriveWatchlist(
      [
        { loanId: 'A', borrower: 'Aco', classification: 'Doubtful', exposure: 2_000_000, actionPlan: { status: 'in_progress', dueDate: '2026-01-01' } },
        { loanId: 'B', borrower: 'Bco', classification: 'Special Mention', exposure: 1_000_000 },
      ],
      '2026-06-30',
    );
    render(<WatchlistBoardPanel board={board} />);
    const panel = screen.getByLabelText('Watchlist');
    expect(panel).toHaveAttribute('data-watchlist', 'ready');
    const groups = panel.querySelector('[data-watchlist-groups]')!;
    expect(groups.firstElementChild?.getAttribute('data-watchlist-group')).toBe('Doubtful');
    expect(panel.querySelector('[data-watchlist-entry="A"]')).not.toBeNull();
  });
});
