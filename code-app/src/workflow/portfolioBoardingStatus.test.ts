import { describe, it, expect } from 'vitest';
import { derivePortfolioBoardingStatus } from './portfolioBoardingStatus';

describe('Phase 258 — derivePortfolioBoardingStatus', () => {
  it('is pending before funding (Intake / Underwriting)', () => {
    expect(derivePortfolioBoardingStatus('Intake').phase).toBe('pending');
    expect(derivePortfolioBoardingStatus('Underwriting').phase).toBe('pending');
    expect(derivePortfolioBoardingStatus(undefined).phase).toBe('pending');
  });

  it('is eligible at/after funding/closing/booking', () => {
    expect(derivePortfolioBoardingStatus('Funded').phase).toBe('eligible');
    expect(derivePortfolioBoardingStatus('Closing').phase).toBe('eligible');
    expect(derivePortfolioBoardingStatus('Booked').phase).toBe('eligible');
  });

  it('returns honest bank-user labels (no dev/readiness jargon)', () => {
    const s = derivePortfolioBoardingStatus('Funded');
    expect(s.label).toBe('Ready for portfolio boarding');
    expect(s.note).toMatch(/Portfolio workspace/);
  });
});
