import { describe, it, expect } from 'vitest';
import { CANONICAL_STAGES, CANONICAL_STAGE_CODES } from '../../workflow/stageOrderingContract';

/**
 * Dataverse remediation — cr664_sequence uniqueness guard (code-level).
 *
 * Dataverse has no native "unique among active rows only" constraint (a
 * literal alternate key would enforce uniqueness across ALL rows including
 * retired ones, blocking a legitimate future re-sequencing during a stage-set
 * migration — see create-dealstagereference-sequence-column.ps1's header).
 * Uniqueness-among-active-rows is therefore enforced at the application level
 * instead, at two points: scripts/seed-stage-references.mjs's existing
 * fail-closed duplicate-match handling at seed time, and this test pinning
 * the canonical in-code template itself never regresses to a duplicate or
 * gap. This is defense-in-depth for the source of truth the seed script
 * copies from, not a live-data check.
 */
describe('CANONICAL_STAGES sequence uniqueness (Dataverse remediation)', () => {
  it('every canonical stage has a distinct cr664_sequence value', () => {
    const sequences = CANONICAL_STAGES.map((s) => s.sequence);
    const distinct = new Set(sequences);
    expect(distinct.size, `duplicate sequence values found: ${sequences.join(', ')}`).toBe(sequences.length);
  });

  it('sequences are strictly ascending in canonical stage order (no accidental reorder)', () => {
    const sequences = CANONICAL_STAGES.map((s) => s.sequence);
    for (let i = 1; i < sequences.length; i++) {
      expect(sequences[i], `stage at index ${i} (${CANONICAL_STAGES[i]!.code}) is not ordered after the previous stage`).toBeGreaterThan(sequences[i - 1]!);
    }
  });

  it('every canonical stage code is distinct (no duplicate codes to seed)', () => {
    const codes = CANONICAL_STAGES.map((s) => s.code);
    const distinct = new Set(codes);
    expect(distinct.size).toBe(codes.length);
  });

  it('CANONICAL_STAGES covers exactly the seven codes in CANONICAL_STAGE_CODES — no drift between the two exports', () => {
    const fromStages = new Set(CANONICAL_STAGES.map((s) => s.code));
    const fromCodes = new Set(CANONICAL_STAGE_CODES);
    expect(fromStages).toEqual(fromCodes);
    expect(CANONICAL_STAGE_CODES.length).toBe(7);
  });
});
