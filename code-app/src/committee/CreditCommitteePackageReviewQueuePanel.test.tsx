// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CreditCommitteePackageReviewQueuePanel } from './CreditCommitteePackageReviewQueuePanel';
import { deriveCreditCommitteePackageQueue, type CreditCommitteePackageInput } from './creditCommitteePackageQueue';

function queue(packages: readonly CreditCommitteePackageInput[]) {
  return deriveCreditCommitteePackageQueue({ packages });
}

const SAMPLE = queue([
  { dealId: 'D1', dealName: 'Deal One', clientName: 'Client A', bankerName: 'Banker B', memoId: 'M1', committeeReadiness: { hasDecisionSupport: true, decisionSupportCount: 5, evidenceCount: 6 } },
  { dealId: 'D2', dealName: 'Deal Two', clientName: 'Client C', bankerName: 'Banker D', memoId: 'M2', committeeReadiness: { remainingBlockers: ['covenant exception'], evidenceCount: 4, missingEvidenceLabels: ['tax returns'] } },
]);

describe('Phase 142M — CreditCommitteePackageReviewQueuePanel', () => {
  it('renders the header and review-only subtitle', () => {
    render(<CreditCommitteePackageReviewQueuePanel queue={SAMPLE} />);
    expect(screen.getByText('Credit Committee Package Review Queue')).toBeTruthy();
    expect(screen.getAllByText(/Review only — no voting or approvals/i).length).toBeGreaterThanOrEqual(1);
  });

  it('renders the KPI strip counts', () => {
    render(<CreditCommitteePackageReviewQueuePanel queue={SAMPLE} />);
    expect(screen.getByText('Total packages')).toBeTruthy();
    expect(screen.getByText('Ready for review')).toBeTruthy();
    expect(screen.getByText('Blocked')).toBeTruthy();
    expect(screen.getByText('Needs evidence')).toBeTruthy();
  });

  it('renders queue rows with readiness, evidence, and blockers', () => {
    render(<CreditCommitteePackageReviewQueuePanel queue={SAMPLE} />);
    expect(screen.getByText('Deal One')).toBeTruthy();
    expect(screen.getAllByText(/Ready for human committee review/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Blocked — readiness blockers remain/i).length).toBeGreaterThanOrEqual(1);
  });

  it('renders missing evidence labels', () => {
    render(<CreditCommitteePackageReviewQueuePanel queue={SAMPLE} />);
    expect(screen.getByText('tax returns')).toBeTruthy();
  });

  it('renders an honest empty state with no sample data', () => {
    render(<CreditCommitteePackageReviewQueuePanel queue={queue([])} />);
    expect(screen.getByText('No committee packages available for review yet.')).toBeTruthy();
    expect(screen.queryByText('Deal One')).toBeNull();
  });

  it('renders a fail-closed unavailable state when no data is supplied', () => {
    render(<CreditCommitteePackageReviewQueuePanel queue={deriveCreditCommitteePackageQueue(undefined)} />);
    expect(screen.getByText(/Credit committee package data is unavailable/i)).toBeTruthy();
  });

  it('exposes no vote / approve / deny buttons or form affordances', () => {
    const { container } = render(<CreditCommitteePackageReviewQueuePanel queue={SAMPLE} />);
    expect(container.querySelectorAll('button, form, input').length).toBe(0);
    const text = (container.textContent ?? '').toLowerCase();
    // Disclaimers legitimately say "no voting or approvals"; forbid only
    // action-control / misleading-approval phrasings.
    for (const w of ['cast vote', 'record vote', 'approve package', 'deny package', 'committee-approved', 'recommended by committee', 'cast ballot']) {
      expect(text).not.toContain(w);
    }
  });

  it('renders an internal deal link only when a route builder is provided', () => {
    const { container } = render(<CreditCommitteePackageReviewQueuePanel queue={SAMPLE} dealHrefFor={(id) => `/deals/${id}`} />);
    const link = container.querySelector('a');
    expect(link?.getAttribute('href')).toBe('/deals/D1');
    expect(container.innerHTML).not.toMatch(/https?:\/\//);
  });
});
