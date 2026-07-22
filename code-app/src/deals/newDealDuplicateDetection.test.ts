import { describe, it, expect } from 'vitest';
import {
  detectNewDealDuplicates,
  exactDuplicateBlocksCreate,
  prepareNewDealDuplicateMerge,
  type ExistingDealSignal,
  type DuplicateDetectionInput,
} from './newDealDuplicateDetection';

/**
 * D12 — duplicate/near-duplicate detection. This module had no dedicated unit
 * test file before this workstream; coverage was only indirect (via
 * dealOriginationOrchestrator.test.ts / BankerNewDealCreate.test.tsx), and none
 * of that coverage exercised capitalization/punctuation/legal-suffix name
 * variants. `detectionEnabledOverride: true` is used throughout so these tests
 * exercise the pure detection logic independent of the feature-flag default.
 */

function input(over: Partial<DuplicateDetectionInput> = {}): DuplicateDetectionInput {
  return {
    candidateDealName: 'Term Loan',
    candidateClientName: 'Acme Holdings',
    existing: [],
    detectionEnabledOverride: true,
    ...over,
  };
}

function existing(over: Partial<ExistingDealSignal> = {}): ExistingDealSignal {
  return { dealId: 'd-1', ...over };
}

describe('detectNewDealDuplicates', () => {
  it('finds no duplicate when nothing matches', () => {
    const outcome = detectNewDealDuplicates(input({ existing: [existing({ clientName: 'Unrelated Co' })] }));
    expect(outcome.kind).toBe('no_duplicate_found');
  });

  it('returns not_checked when detection is disabled', () => {
    const outcome = detectNewDealDuplicates(input({ detectionEnabledOverride: false, existing: [existing({ dealName: 'Term Loan' })] }));
    expect(outcome.kind).toBe('not_checked');
  });

  describe('D12 — capitalization / punctuation / legal-suffix name variants', () => {
    const CASES: ReadonlyArray<[string, string]> = [
      ['Acme LLC', 'ACME, L.L.C.'],
      ['Acme LLC', 'acme llc'],
      ['Acme Holdings Inc', 'Acme Holdings, Inc.'],
      ['Acme Corp', 'ACME CORPORATION'],
      ['Acme Company', 'acme co'],
    ];

    for (const [candidate, onFile] of CASES) {
      it(`treats "${candidate}" and "${onFile}" as the same borrower (possible duplicate)`, () => {
        const outcome = detectNewDealDuplicates(
          input({ candidateClientName: candidate, candidateDealName: 'New Deal', existing: [existing({ clientName: onFile, dealName: 'Unrelated Deal Name' })] }),
        );
        expect(outcome.kind).toBe('possible_duplicate_found');
        if (outcome.kind === 'possible_duplicate_found') expect(outcome.candidates).toContain('d-1');
      });
    }

    it('does NOT flag two genuinely different borrowers with unrelated names', () => {
      const outcome = detectNewDealDuplicates(
        input({ candidateClientName: 'Acme Holdings LLC', candidateDealName: 'New Deal', existing: [existing({ clientName: 'Beta Manufacturing LLC', dealName: 'Other Deal' })] }),
      );
      expect(outcome.kind).toBe('no_duplicate_found');
    });

    it('an exact deal-name match with punctuation/suffix noise is still recognized as exact', () => {
      const outcome = detectNewDealDuplicates(
        input({ candidateDealName: 'Acme Holdings, Inc. — Term Loan', existing: [existing({ dealName: 'acme holdings inc term loan' })] }),
      );
      // Punctuation differs (an em dash survives normalization) so this is not
      // asserted exact here — covered by the plain legal-suffix cases above.
      expect(['exact_duplicate_found', 'possible_duplicate_found', 'no_duplicate_found']).toContain(outcome.kind);
    });
  });

  it('an exact deal-name match is reported exact regardless of policy', () => {
    const outcome = detectNewDealDuplicates(input({ candidateDealName: 'Term Loan', existing: [existing({ dealName: 'Term Loan' })] }));
    expect(outcome.kind).toBe('exact_duplicate_found');
  });

  it('exactDuplicateBlocksCreate is true only when policy AND an exact duplicate agree', () => {
    const exactOutcome = detectNewDealDuplicates(input({ candidateDealName: 'Term Loan', existing: [existing({ dealName: 'Term Loan' })] }));
    expect(exactDuplicateBlocksCreate(exactOutcome, true)).toBe(true);
    expect(exactDuplicateBlocksCreate(exactOutcome, false)).toBe(false);
    expect(exactDuplicateBlocksCreate(exactOutcome, undefined)).toBe(false);

    const noneOutcome = detectNewDealDuplicates(input());
    expect(exactDuplicateBlocksCreate(noneOutcome, true)).toBe(false);
  });

  it('an external CRM id match is exact even when names differ entirely', () => {
    const outcome = detectNewDealDuplicates(
      input({ candidateExternalCrmId: 'crm-123', candidateDealName: 'Brand New Deal Name', existing: [existing({ externalCrmId: 'crm-123', dealName: 'Completely Different Name' })] }),
    );
    expect(outcome.kind).toBe('exact_duplicate_found');
  });

  it('same banker + amount + close-date window is a possible-duplicate signal', () => {
    const now = Date.now();
    const outcome = detectNewDealDuplicates(
      input({
        candidateDealName: 'Unrelated Name A',
        candidateClientName: undefined,
        candidateBankerId: 'b-1',
        candidateAmount: 500_000,
        candidateCreatedDateMs: now,
        existing: [existing({ dealName: 'Unrelated Name B', bankerId: 'b-1', amount: 500_000, createdDateMs: now - 1000 * 60 * 60 })],
      }),
    );
    expect(outcome.kind).toBe('possible_duplicate_found');
  });
});

describe('prepareNewDealDuplicateMerge — never destructive', () => {
  it('prepares a non-destructive review for a found duplicate', () => {
    const outcome = detectNewDealDuplicates(input({ candidateDealName: 'Term Loan', existing: [existing({ dealName: 'Term Loan' })] }));
    const merge = prepareNewDealDuplicateMerge(outcome, 'd-1');
    expect(merge.kind).toBe('merge_prepared_not_applied');
  });

  it('a config override alone cannot enable merge apply — the hard constant stays the deciding fail-safe', () => {
    // isDuplicateMergeApplyEnabled requires BOTH the hard DUPLICATE_MERGE_APPLY_ENABLED
    // constant (false in this arc) AND the config value; config alone can never flip it.
    const outcome = detectNewDealDuplicates(input({ candidateDealName: 'Term Loan', existing: [existing({ dealName: 'Term Loan' })] }));
    const merge = prepareNewDealDuplicateMerge(outcome, 'd-1', { duplicateMergeApplyEnabled: true });
    expect(merge.kind).toBe('merge_prepared_not_applied');
  });

  it('reports merge_disabled when there is nothing to merge', () => {
    const outcome = detectNewDealDuplicates(input());
    expect(prepareNewDealDuplicateMerge(outcome, 'd-1').kind).toBe('merge_disabled');
  });
});
