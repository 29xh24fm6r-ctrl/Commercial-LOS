import { describe, it, expect } from 'vitest';
import {
  CANONICAL_STAGES,
  CANONICAL_STAGE_CODES,
  canonicalStageByCode,
  recognizeCanonicalStage,
} from './stageOrderingContract';

/**
 * Stage reconciliation Phase 2 — the single canonical display vocabulary.
 */

describe('CANONICAL_STAGES (the one display vocabulary)', () => {
  it('is the ratified seven, in sequence', () => {
    expect(CANONICAL_STAGES.map((s) => s.code)).toEqual([
      'INTAKE',
      'UNDERWRITING',
      'CREDIT_APPROVAL',
      'COMMITMENT',
      'DOCUMENTATION',
      'CLOSING_FUNDING',
      'BOARDED',
    ]);
    expect(CANONICAL_STAGES.map((s) => s.sequence)).toEqual([10, 20, 30, 40, 50, 60, 70]);
    expect(CANONICAL_STAGES[0]).toMatchObject({ code: 'INTAKE', name: 'Intake', sequence: 10 });
  });

  it('stays in lockstep with the canonical code list', () => {
    expect(CANONICAL_STAGES.map((s) => s.code)).toEqual([...CANONICAL_STAGE_CODES]);
  });

  it('canonicalStageByCode resolves exact codes', () => {
    expect(canonicalStageByCode('CREDIT_APPROVAL')?.name).toBe('Credit Approval');
    expect(canonicalStageByCode('nope')).toBeUndefined();
  });
});

describe('recognizeCanonicalStage (clears the "custom stage" warning honestly)', () => {
  it('recognizes a stored code (case-insensitive)', () => {
    expect(recognizeCanonicalStage('INTAKE')?.sequence).toBe(10);
    expect(recognizeCanonicalStage('intake')?.code).toBe('INTAKE');
  });
  it('recognizes a stored ratified name (case-insensitive)', () => {
    expect(recognizeCanonicalStage('Intake')?.code).toBe('INTAKE');
    expect(recognizeCanonicalStage('closing & funding')?.code).toBe('CLOSING_FUNDING');
  });
  it('returns undefined for legacy / unknown values (unmapped — needs review; never fabricates)', () => {
    expect(recognizeCanonicalStage('Screening')).toBeUndefined();
    expect(recognizeCanonicalStage('Qualification')).toBeUndefined();
    expect(recognizeCanonicalStage('TEST — Stage Phase 121')).toBeUndefined();
    expect(recognizeCanonicalStage('')).toBeUndefined();
    expect(recognizeCanonicalStage(undefined)).toBeUndefined();
  });
});
