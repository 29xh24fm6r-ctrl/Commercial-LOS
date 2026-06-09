import { describe, it, expect } from 'vitest';
import { resolveAnnualReviewCovenantDefinitions, type RawCovenantRecord } from './resolveAnnualReviewCovenantDefinitions';

/**
 * Phase 141O — covenant definition resolver pins.
 */

const DSCR: RawCovenantRecord = { covenantId: 'C-DSCR', label: 'DSCR ≥ 1.20x', covenantType: 'dscr', operator: 'gte', thresholdValue: 1.2, active: true, sourceDocumentId: 'LA1' };

describe('Phase 141O — covenant definition resolver', () => {
  it('resolves boarded-loan covenant definitions (source preserved)', () => {
    const defs = resolveAnnualReviewCovenantDefinitions({ boardedLoanCovenants: [DSCR] });
    expect(defs).toHaveLength(1);
    expect(defs[0].source).toBe('boarded_loan');
    expect(defs[0].sourceDocumentId).toBe('LA1');
  });

  it('falls back to an originated-loan covenant only when linked', () => {
    const orig: RawCovenantRecord = { covenantId: 'C-CR', covenantType: 'current_ratio', operator: 'gte', thresholdValue: 1.0, active: true };
    expect(resolveAnnualReviewCovenantDefinitions({ originatedDealCovenants: [orig], originatedDealLinked: false })).toHaveLength(0);
    const linked = resolveAnnualReviewCovenantDefinitions({ originatedDealCovenants: [orig], originatedDealLinked: true });
    expect(linked).toHaveLength(1);
    expect(linked[0].source).toBe('originated_deal');
  });

  it('a missing threshold becomes a review_required definition blocker', () => {
    const incomplete: RawCovenantRecord = { covenantId: 'C-LEV', covenantType: 'leverage_maximum', active: true };
    const defs = resolveAnnualReviewCovenantDefinitions({ boardedLoanCovenants: [incomplete] });
    expect(defs[0].definitionBlocker).toBe('missing_threshold');
  });

  it('excludes inactive covenants by default', () => {
    const inactive: RawCovenantRecord = { ...DSCR, covenantId: 'C-OLD', active: false };
    expect(resolveAnnualReviewCovenantDefinitions({ boardedLoanCovenants: [inactive] })).toHaveLength(0);
    expect(resolveAnnualReviewCovenantDefinitions({ boardedLoanCovenants: [inactive], includeInactive: true })).toHaveLength(1);
  });

  it('invents no covenants (empty input → empty output)', () => {
    expect(resolveAnnualReviewCovenantDefinitions({})).toEqual([]);
  });

  it('document covenants do not require a numeric threshold', () => {
    const reporting: RawCovenantRecord = { covenantId: 'C-REP', covenantType: 'reporting_requirement', active: true };
    const defs = resolveAnnualReviewCovenantDefinitions({ boardedLoanCovenants: [reporting] });
    expect(defs[0].definitionBlocker).toBeUndefined();
    expect(defs[0].operator).toBe('required');
  });
});
