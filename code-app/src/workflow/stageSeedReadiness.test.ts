// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CANONICAL_STAGES, type StageReferenceRow } from './stageOrderingContract';

const { stageGetAll } = vi.hoisted(() => ({ stageGetAll: vi.fn() }));
vi.mock('../generated/services/Cr664_dealstagereferencesService', () => ({
  Cr664_dealstagereferencesService: { getAll: stageGetAll },
}));

import {
  evaluateStageSeedReadiness,
  loadStageSeedReadiness,
  EXPECTED_STAGE_SEED_FINGERPRINT,
  NOMINAL_STAGE_SEQUENCE,
} from './stageSeedReadiness';

beforeEach(() => stageGetAll.mockReset());

/** A correctly-seeded set: the seven canonical stages, active, at nominal sequences. */
function goodRows(): StageReferenceRow[] {
  return CANONICAL_STAGES.map((s) => ({ cr664_code: s.code, cr664_name: s.name, cr664_sequence: s.sequence, cr664_activeflag: true }));
}

describe('evaluateStageSeedReadiness — deterministic proof (WFLOW-F)', () => {
  it('a correct seed is ready, with the exact expected fingerprint and no reasons', () => {
    const r = evaluateStageSeedReadiness(goodRows());
    expect(r.ready).toBe(true);
    expect(r.reasons).toEqual([]);
    expect(r.fingerprint).toBe(EXPECTED_STAGE_SEED_FINGERPRINT);
    expect(r.fingerprint).toBe('INTAKE:10|UNDERWRITING:20|CREDIT_APPROVAL:30|COMMITMENT:40|DOCUMENTATION:50|CLOSING_FUNDING:60|BOARDED:70');
    expect(r.observed).toHaveLength(7);
  });

  it('is deterministic — the same rows in a shuffled order produce identical evidence', () => {
    const rows = goodRows();
    const shuffled = [rows[3], rows[0], rows[6], rows[1], rows[5], rows[2], rows[4]] as StageReferenceRow[];
    const a = evaluateStageSeedReadiness(rows);
    const b = evaluateStageSeedReadiness(shuffled);
    expect(b.ready).toBe(true);
    expect(b.fingerprint).toBe(a.fingerprint);
    expect(b.observed).toEqual(a.observed);
  });

  it('FAIL-CLOSED: a MISSING canonical stage is not ready', () => {
    const rows = goodRows().filter((r) => r.cr664_code !== 'COMMITMENT');
    const r = evaluateStageSeedReadiness(rows);
    expect(r.ready).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/missing stage COMMITMENT/);
  });

  it('FAIL-CLOSED: a DUPLICATE active canonical stage is not ready', () => {
    const rows = [...goodRows(), { cr664_code: 'UNDERWRITING', cr664_name: 'Underwriting', cr664_sequence: 20, cr664_activeflag: true }];
    const r = evaluateStageSeedReadiness(rows);
    expect(r.ready).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/duplicate stage UNDERWRITING/);
  });

  it('FAIL-CLOSED: an INACTIVE canonical stage counts as missing (not ready)', () => {
    const rows = goodRows().map((r) => (r.cr664_code === 'BOARDED' ? { ...r, cr664_activeflag: false } : r));
    const r = evaluateStageSeedReadiness(rows);
    expect(r.ready).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/missing stage BOARDED/);
  });

  it('FAIL-CLOSED: a structurally-valid but MISORDERED seed (wrong sequence) is not ready', () => {
    // UNDERWRITING seeded at 60 (not its ratified 20). Sequences are still all-unique,
    // so the structural pass alone accepts it — the nominal check must catch it.
    const rows = goodRows().map((r) => {
      if (r.cr664_code === 'UNDERWRITING') return { ...r, cr664_sequence: 60 };
      if (r.cr664_code === 'CLOSING_FUNDING') return { ...r, cr664_sequence: 20 };
      return r;
    });
    const r = evaluateStageSeedReadiness(rows);
    expect(r.ready).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/UNDERWRITING sequence 60 does not match the ratified 20/);
    expect(r.reasons.join(' ')).toMatch(/CLOSING_FUNDING sequence 20 does not match the ratified 60/);
  });

  it('FAIL-CLOSED: a canonical stage with NO sequence (not yet seeded) is not ready', () => {
    const rows = goodRows().map((r) => (r.cr664_code === 'INTAKE' ? { ...r, cr664_sequence: null } : r));
    const r = evaluateStageSeedReadiness(rows);
    expect(r.ready).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/INTAKE/);
  });

  it('FAIL-CLOSED: an unexpected non-canonical active code is not ready', () => {
    const rows = [...goodRows(), { cr664_code: 'LEGACY_PRESCREEN', cr664_name: 'Prescreen', cr664_sequence: 5, cr664_activeflag: true }];
    const r = evaluateStageSeedReadiness(rows);
    expect(r.ready).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/non-canonical stage code "LEGACY_PRESCREEN"/);
  });

  it('the nominal sequence map is exactly the ratified 10..70', () => {
    expect(NOMINAL_STAGE_SEQUENCE).toEqual({
      INTAKE: 10, UNDERWRITING: 20, CREDIT_APPROVAL: 30, COMMITMENT: 40, DOCUMENTATION: 50, CLOSING_FUNDING: 60, BOARDED: 70,
    });
  });
});

describe('loadStageSeedReadiness — live loader (WFLOW-F)', () => {
  it('reads the seeded rows and proves a correct seed ready', async () => {
    stageGetAll.mockResolvedValueOnce({ success: true, data: goodRows() });
    const r = await loadStageSeedReadiness();
    expect(r.ready).toBe(true);
    expect(r.fingerprint).toBe(EXPECTED_STAGE_SEED_FINGERPRINT);
    expect(stageGetAll).toHaveBeenCalledWith(expect.objectContaining({
      select: ['cr664_code', 'cr664_name', 'cr664_sequence', 'cr664_activeflag'],
    }));
  });

  it('FAIL-CLOSED: a failed reference read is not ready (never assumed-good)', async () => {
    stageGetAll.mockResolvedValueOnce({ success: false, error: { message: 'dataverse unavailable' } });
    const r = await loadStageSeedReadiness();
    expect(r.ready).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/read failed/);
  });

  it('FAIL-CLOSED: a thrown read is not ready', async () => {
    stageGetAll.mockRejectedValueOnce(new Error('boom'));
    const r = await loadStageSeedReadiness();
    expect(r.ready).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/threw: boom/);
  });
});
