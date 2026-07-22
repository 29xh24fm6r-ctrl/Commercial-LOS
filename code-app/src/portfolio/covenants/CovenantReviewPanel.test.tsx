// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CovenantReviewPanel } from './CovenantReviewPanel';
import { deriveReviewQueue } from './covenantMonitoring';

describe('CovenantReviewPanel', () => {
  it('shows honest absence with no reviews due and no breaches', () => {
    render(<CovenantReviewPanel reviewQueue={{ entries: [], overdue: 0, dueSoon: 0 }} />);
    expect(screen.getByLabelText('Covenants & reviews')).toHaveAttribute('data-covenant-review', 'empty');
  });

  it('renders the review queue + covenant breach counts', () => {
    const q = deriveReviewQueue([{ loanId: 'A', grade: 6, lastReviewDate: '2026-01-01' }], '2026-06-30');
    render(<CovenantReviewPanel reviewQueue={q} covenantBreachCount={2} covenantAtRiskCount={1} />);
    const panel = screen.getByLabelText('Covenants & reviews');
    expect(panel).toHaveAttribute('data-covenant-review', 'ready');
    expect(panel.querySelector('[data-review-entry="A"]')).not.toBeNull();
    expect(panel.querySelector('[data-review-status="overdue"]')).not.toBeNull();
  });

  it('D9 — renders "Not available" for breach/trend-to-breach counts when the feed is unwired, never a fabricated 0', () => {
    const q = deriveReviewQueue([{ loanId: 'A', grade: 6, lastReviewDate: '2026-01-01' }], '2026-06-30');
    render(<CovenantReviewPanel reviewQueue={q} />);
    const panel = screen.getByLabelText('Covenants & reviews');
    expect(panel).toHaveAttribute('data-covenant-review', 'ready');
    expect(panel.querySelectorAll('[data-covenant-hero]')[2]).toHaveTextContent('Not available');
    expect(panel.querySelectorAll('[data-covenant-hero]')[3]).toHaveTextContent('Not available');
  });

  it('D9 — the honest-absence state discloses when breach detection is not connected', () => {
    render(<CovenantReviewPanel reviewQueue={{ entries: [], overdue: 0, dueSoon: 0 }} />);
    const panel = screen.getByLabelText('Covenants & reviews');
    expect(panel).toHaveAttribute('data-covenant-review', 'empty');
    expect(panel).toHaveTextContent(/not connected to a live data source/i);
  });
});
