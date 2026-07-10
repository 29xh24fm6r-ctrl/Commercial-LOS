// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../deals/DealDataProvider', () => ({ useDealData: vi.fn() }));

import { useDealData } from '../deals/DealDataProvider';
import { ClosingBookingReadinessPanel } from './ClosingBookingReadinessPanel';

const mock = vi.mocked(useDealData);

function setup(stage: string | undefined) {
  mock.mockReturnValue({
    deal: { id: 'd-1', name: 'Deal', stage },
    tasks: { kind: 'ready', data: { open: [], completed: [] } },
    documents: { kind: 'ready', data: { outstanding: [], received: [], reviewed: [] } },
  } as unknown as ReturnType<typeof useDealData>);
}

/**
 * Booking readiness must be STAGE-AWARE: an Intake-stage deal (with no closing artifacts yet) must
 * not show a green "BOOKING READY" badge — the live-smoke defect. It reads "not yet evaluated"
 * below Closing & Funding, and evaluates for real from that stage onward.
 */
describe('ClosingBookingReadinessPanel — stage-aware labeling', () => {
  it('an Intake-stage deal shows "not yet evaluated" / pending upstream — never a false green', () => {
    setup('Intake');
    render(<ClosingBookingReadinessPanel />);
    expect(screen.getAllByText(/not yet evaluated/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/booking ready/i)).toBeNull();
    expect(screen.getByText(/pending upstream completion/i)).toBeInTheDocument();
    expect(document.querySelector('[data-booking-readiness="not-evaluated"]')).not.toBeNull();
  });

  it('an unrecognized/custom stage is treated as not-yet-evaluated (honest, not booking-ready)', () => {
    setup('Some Custom Stage');
    render(<ClosingBookingReadinessPanel />);
    expect(screen.getAllByText(/not yet evaluated/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/booking ready/i)).toBeNull();
  });

  it('evaluates booking readiness from the Closing & Funding stage onward', () => {
    setup('Closing & Funding');
    render(<ClosingBookingReadinessPanel />);
    // Stage is now applicable; with no closing blockers loaded it reports booking ready.
    expect(screen.getByText('booking ready')).toBeInTheDocument();
    expect(document.querySelector('[data-booking-readiness="ready"]')).not.toBeNull();
  });
});
