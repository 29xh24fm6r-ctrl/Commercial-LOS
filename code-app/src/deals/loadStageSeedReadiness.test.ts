// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CANONICAL_STAGES, type StageReferenceRow } from '../workflow/stageOrderingContract';
import { EXPECTED_STAGE_SEED_FINGERPRINT } from '../workflow/stageSeedReadiness';

const { stageGetAll } = vi.hoisted(() => ({ stageGetAll: vi.fn() }));
vi.mock('../generated/services/Cr664_dealstagereferencesService', () => ({
  Cr664_dealstagereferencesService: { getAll: stageGetAll },
}));

import { loadStageSeedReadiness } from './loadStageSeedReadiness';

beforeEach(() => stageGetAll.mockReset());

function goodRows(): StageReferenceRow[] {
  return CANONICAL_STAGES.map((s) => ({ cr664_code: s.code, cr664_name: s.name, cr664_sequence: s.sequence, cr664_activeflag: true }));
}

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
