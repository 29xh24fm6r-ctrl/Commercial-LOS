import { describe, it, expect } from 'vitest';
import { derivePortfolioBoardingStatus, deriveBoardedHandoffStatus } from './portfolioBoardingStatus';
import type { BoardingHandoffReadiness } from './boardingHandoffReadiness';

describe('Phase 258 — derivePortfolioBoardingStatus', () => {
  it('is not-ready before funding (Intake / Underwriting)', () => {
    expect(derivePortfolioBoardingStatus('Intake').phase).toBe('not-ready');
    expect(derivePortfolioBoardingStatus('Underwriting').phase).toBe('not-ready');
    expect(derivePortfolioBoardingStatus(undefined).phase).toBe('not-ready');
  });

  it('is ready at/after funding/closing/booking', () => {
    expect(derivePortfolioBoardingStatus('Funded').phase).toBe('ready');
    expect(derivePortfolioBoardingStatus('Closing').phase).toBe('ready');
    expect(derivePortfolioBoardingStatus('Booked').phase).toBe('ready');
  });

  it('returns honest bank-user labels (no dev/readiness jargon)', () => {
    const s = derivePortfolioBoardingStatus('Funded');
    expect(s.label).toBe('Ready for portfolio boarding');
    expect(s.note).toMatch(/Portfolio workspace/);
  });
});

// Factory Arc Phase 9 — the per-deal boarding state model now distinguishes the two
// non-"boarded" handoff verdicts instead of collapsing them into one "unverified" bucket.
describe('Factory Arc Phase 9 — deriveBoardedHandoffStatus distinguishes requires-completion from failed', () => {
  function readiness(overrides: Partial<BoardingHandoffReadiness>): BoardingHandoffReadiness {
    return {
      dealStage: 'Boarded / Servicing',
      dealClaimsBoarded: true,
      handoffEvidencePresent: false,
      verdict: 'missing-handoff',
      boardingCompleted: false,
      servicingOwnerAssigned: false,
      blockers: [],
      ...overrides,
    };
  }

  it('verdict "boarded" reads Boarded', () => {
    const s = deriveBoardedHandoffStatus(readiness({ verdict: 'boarded', handoffEvidencePresent: true, boardingCompleted: true }));
    expect(s.phase).toBe('boarded');
    expect(s.label).toBe('Boarded');
  });

  it('verdict "missing-handoff" (deal claims Boarded, no evidence yet) reads Requires completion', () => {
    const s = deriveBoardedHandoffStatus(readiness({ verdict: 'missing-handoff' }));
    expect(s.phase).toBe('requires-completion');
    expect(s.label).toBe('Requires completion');
  });

  it('verdict "premature-handoff" (record exists, stage disagrees) reads Failed', () => {
    const s = deriveBoardedHandoffStatus(
      readiness({ verdict: 'premature-handoff', dealClaimsBoarded: false, handoffEvidencePresent: true }),
    );
    expect(s.phase).toBe('failed');
    expect(s.label).toBe('Boarding failed');
  });

  it('surfaces the real blocker text when present, never a fabricated reason', () => {
    const blocker = 'An active portfolio boarded-loan record exists but the deal stage is "Underwriting", not BOARDED; the boarding record and the deal stage disagree.';
    const s = deriveBoardedHandoffStatus(
      readiness({ verdict: 'premature-handoff', dealClaimsBoarded: false, handoffEvidencePresent: true, blockers: [blocker] }),
    );
    expect(s.note).toBe(blocker);
  });
});
