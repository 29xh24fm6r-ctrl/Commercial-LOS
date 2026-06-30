// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  resolveStageOrdering,
  CANONICAL_STAGE_CODES,
  type StageReferenceRow,
} from './stageOrderingContract';

/** Build the full, valid seeded set (INTAKE=10 .. BOARDED=70). */
function validRows(): StageReferenceRow[] {
  const seqByCode: Record<string, number> = {
    INTAKE: 10, UNDERWRITING: 20, CREDIT_APPROVAL: 30, COMMITMENT: 40,
    DOCUMENTATION: 50, CLOSING_FUNDING: 60, BOARDED: 70,
  };
  return CANONICAL_STAGE_CODES.map((code) => ({
    cr664_code: code,
    cr664_name: code,
    cr664_sequence: seqByCode[code],
    cr664_activeflag: true,
  }));
}

describe('resolveStageOrdering — valid seeded set', () => {
  it('resolves next / prior / terminal deterministically from the sequence field', () => {
    const o = resolveStageOrdering(validRows());
    expect(o.status).toBe('ready');
    if (o.status !== 'ready') return;

    expect(o.stages.map((s) => s.code)).toEqual([...CANONICAL_STAGE_CODES]);
    expect(o.nextStage('INTAKE')?.code).toBe('UNDERWRITING');
    expect(o.nextStage('CREDIT_APPROVAL')?.code).toBe('COMMITMENT');
    // Terminal stage has no next.
    expect(o.nextStage('BOARDED')).toBeUndefined();
    expect(o.isTerminal('BOARDED')).toBe(true);
    expect(o.isTerminal('INTAKE')).toBe(false);
    // Prior stages are everything strictly before, ascending.
    expect(o.priorStages('CREDIT_APPROVAL').map((s) => s.code)).toEqual(['INTAKE', 'UNDERWRITING']);
    expect(o.priorStages('INTAKE')).toEqual([]);
    expect(o.stageBySequence().get(30)?.code).toBe('CREDIT_APPROVAL');
  });

  it('orders by the DATA sequence, not by code order (data is the source of truth)', () => {
    // Shuffle row order and use non-10-step but still ascending sequences.
    const rows = validRows().reverse();
    const o = resolveStageOrdering(rows);
    expect(o.status).toBe('ready');
    if (o.status !== 'ready') return;
    expect(o.stages.map((s) => s.sequence)).toEqual([10, 20, 30, 40, 50, 60, 70]);
    expect(o.nextStage('INTAKE')?.code).toBe('UNDERWRITING');
  });
});

describe('resolveStageOrdering — fail-closed cases', () => {
  it('is unavailable when a stage is missing', () => {
    const rows = validRows().filter((r) => r.cr664_code !== 'COMMITMENT');
    const r = resolveStageOrdering(rows);
    expect(r.status).toBe('unavailable');
    if (r.status === 'unavailable') expect(r.reasons.join(' ')).toMatch(/missing stage COMMITMENT/);
  });

  it('is unavailable when a stage has no sequence (not yet seeded)', () => {
    const rows = validRows().map((r) =>
      r.cr664_code === 'UNDERWRITING' ? { ...r, cr664_sequence: undefined } : r,
    );
    const res = resolveStageOrdering(rows);
    expect(res.status).toBe('unavailable');
    if (res.status === 'unavailable') expect(res.reasons.join(' ')).toMatch(/UNDERWRITING has no cr664_sequence/);
  });

  it('is unavailable when two stages share a sequence', () => {
    const rows = validRows().map((r) =>
      r.cr664_code === 'COMMITMENT' ? { ...r, cr664_sequence: 30 } : r,
    );
    const res = resolveStageOrdering(rows);
    expect(res.status).toBe('unavailable');
    if (res.status === 'unavailable') expect(res.reasons.join(' ')).toMatch(/sequence 30 is shared by/);
  });

  it('is unavailable when a stage code is duplicated', () => {
    const rows = [...validRows(), { cr664_code: 'INTAKE', cr664_name: 'Intake dup', cr664_sequence: 15, cr664_activeflag: true }];
    const res = resolveStageOrdering(rows);
    expect(res.status).toBe('unavailable');
    if (res.status === 'unavailable') expect(res.reasons.join(' ')).toMatch(/duplicate stage INTAKE/);
  });

  it('is unavailable when a non-canonical code is present', () => {
    const rows = [...validRows(), { cr664_code: 'WEIRD_STAGE', cr664_name: 'x', cr664_sequence: 99, cr664_activeflag: true }];
    const res = resolveStageOrdering(rows);
    expect(res.status).toBe('unavailable');
    if (res.status === 'unavailable') expect(res.reasons.join(' ')).toMatch(/non-canonical stage code "WEIRD_STAGE"/);
  });

  it('is unavailable for an empty / unseeded table', () => {
    const res = resolveStageOrdering([]);
    expect(res.status).toBe('unavailable');
    if (res.status === 'unavailable') expect(res.reasons.length).toBeGreaterThanOrEqual(7);
  });

  it('ignores inactive rows (an inactive stage counts as missing)', () => {
    const rows = validRows().map((r) =>
      r.cr664_code === 'BOARDED' ? { ...r, cr664_activeflag: false } : r,
    );
    const res = resolveStageOrdering(rows);
    expect(res.status).toBe('unavailable');
    if (res.status === 'unavailable') expect(res.reasons.join(' ')).toMatch(/missing stage BOARDED/);
  });
});
