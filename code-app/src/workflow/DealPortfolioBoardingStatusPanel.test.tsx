// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('../deals/DealDataProvider', () => ({ useDealData: vi.fn() }));

import { useDealData } from '../deals/DealDataProvider';
import { DealPortfolioBoardingStatusPanel } from './DealPortfolioBoardingStatusPanel';
import type { BoardingHandoffReadiness } from './boardingHandoffReadiness';

const mock = vi.mocked(useDealData);

function setup(stage: string | undefined) {
  mock.mockReturnValue({
    deal: { id: 'deal-1', name: 'Deal', stage },
  } as unknown as ReturnType<typeof useDealData>);
}

/**
 * WFLOW-H — a deal's stage string reading BOARDED is a CLAIM, not proof. This
 * panel must not render "Ready for portfolio boarding" (or any green badge)
 * for an already-boarded deal without checking the real portfolio handoff
 * record — the exact live-smoke gap the stage-string regex left open.
 */
describe('DealPortfolioBoardingStatusPanel — real boarding-handoff evidence, not a stage-string guess', () => {
  it('a pre-boarding stage (Closing & Funding) uses the honest stage-only signal, no live evidence lookup', () => {
    setup('Closing & Funding');
    const loadHandoff = vi.fn();
    render(<DealPortfolioBoardingStatusPanel loadHandoff={loadHandoff} />);
    expect(screen.getByText('Ready for portfolio boarding')).toBeInTheDocument();
    expect(loadHandoff).not.toHaveBeenCalled();
  });

  it('a deal claiming BOARDED with a verified active handoff record renders "Boarded"', async () => {
    setup('Boarded / Servicing');
    const readiness: BoardingHandoffReadiness = {
      dealStage: 'Boarded / Servicing',
      dealClaimsBoarded: true,
      handoffEvidencePresent: true,
      verdict: 'boarded',
      boardingCompleted: true,
      servicingOwnerAssigned: false,
      blockers: [],
    };
    const loadHandoff = vi.fn(async () => readiness);
    render(<DealPortfolioBoardingStatusPanel loadHandoff={loadHandoff} />);
    expect(screen.getByText('Verifying…')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Boarded')).toBeInTheDocument());
    expect(loadHandoff).toHaveBeenCalledWith('deal-1', 'Boarded / Servicing');
    expect(screen.queryByText('Ready for portfolio boarding')).toBeNull();
  });

  it('a deal claiming BOARDED with NO active handoff record renders an unverified warning, never a false-positive "Boarded"', async () => {
    setup('Boarded / Servicing');
    const readiness: BoardingHandoffReadiness = {
      dealStage: 'Boarded / Servicing',
      dealClaimsBoarded: true,
      handoffEvidencePresent: false,
      verdict: 'missing-handoff',
      boardingCompleted: false,
      servicingOwnerAssigned: false,
      blockers: ['Deal stage is BOARDED but no active cr664_portfolioboardedloans handoff record exists for this deal; the closing→servicing handoff is unproven (fail-closed).'],
    };
    const loadHandoff = vi.fn(async () => readiness);
    render(<DealPortfolioBoardingStatusPanel loadHandoff={loadHandoff} />);
    await waitFor(() => expect(screen.getByText('Requires completion')).toBeInTheDocument());
    expect(screen.getByText(/unproven \(fail-closed\)/i)).toBeInTheDocument();
    expect(screen.queryByText('Boarded')).toBeNull();
    expect(screen.queryByText('Ready for portfolio boarding')).toBeNull();
  });

  // Factory Arc Phase 9 residual gap, documented rather than silently left implicit: the
  // panel only calls loadHandoff for deals whose OWN stage claims BOARDED (see the
  // `if (!claimsBoarded) return;` guard above). A "premature-handoff" verdict — an active
  // portfolio record exists but the deal is NOT at BOARDED — is a real case
  // deriveBoardedHandoffStatus can classify as "Boarding failed" (see
  // portfolioBoardingStatus.test.ts), but this panel cannot currently surface it: doing so
  // would mean checking handoff evidence for every deal regardless of stage, a query-per-
  // deal-load behavior change beyond this phase's scope.
  it('a pre-BOARDED stage never checks for a premature handoff record — the panel reflects the honest stage-only signal', () => {
    setup('Underwriting');
    const loadHandoff = vi.fn();
    render(<DealPortfolioBoardingStatusPanel loadHandoff={loadHandoff} />);
    expect(loadHandoff).not.toHaveBeenCalled();
    expect(screen.getByText('Not ready for boarding')).toBeInTheDocument();
  });
});
