import { describe, it, expect, vi } from 'vitest';

// Mock the generated reference services so importing the reader never loads the
// @microsoft/power-apps SDK. Tests pass their own in-memory reader; these are
// never called.
vi.mock('../generated/services/Cr664_dealstagereferencesService', () => ({
  Cr664_dealstagereferencesService: { getAll: vi.fn() },
}));
vi.mock('../generated/services/Cr664_dealstatusreferencesService', () => ({
  Cr664_dealstatusreferencesService: { getAll: vi.fn() },
}));

import { resolveProductionNewDealReferences } from './newDealReferenceReader';
import type { NewDealReferenceReader, ReferenceRow } from './newDealReferenceResolver';
import {
  isProductionUnsafeReferenceLabel,
  selectNewDealReferenceProfile,
  PRODUCTION_REFERENCES_APPROVED,
} from './newDealReferenceTargets';

/**
 * Phase 181B -- production-approved resolver profile (code/name, no GUID).
 */

function reader(stage: ReferenceRow[], status: ReferenceRow[]): NewDealReferenceReader {
  return {
    readStageReferences: async () => stage,
    readStatusReferences: async () => status,
  };
}
const row = (over: Partial<ReferenceRow> = {}): ReferenceRow => ({
  id: 'id-1',
  name: 'Intake',
  code: 'INTAKE',
  activeFlag: true,
  ...over,
});
const statusRow = (over: Partial<ReferenceRow> = {}): ReferenceRow => ({
  id: 'sid-1',
  name: 'Open',
  code: 'OPEN',
  activeFlag: true,
  ...over,
});

describe('Phase 181B -- production-unsafe label guard', () => {
  it('rejects TEST / PHASE / demo labels', () => {
    expect(isProductionUnsafeReferenceLabel('PHASE121_STAGE', 'TEST - Stage Phase 121')).toBe(true);
    expect(isProductionUnsafeReferenceLabel('INTAKE', 'TEST Intake')).toBe(true);
    expect(isProductionUnsafeReferenceLabel('DEMO_OPEN', 'Open (demo)')).toBe(true);
    expect(isProductionUnsafeReferenceLabel('PHASE_99', 'Phase 99')).toBe(true);
  });
  it('accepts clean production labels', () => {
    expect(isProductionUnsafeReferenceLabel('INTAKE', 'Intake')).toBe(false);
    expect(isProductionUnsafeReferenceLabel('OPEN', 'Open')).toBe(false);
  });
});

describe('Phase 182 -- profile selection (production references approved)', () => {
  it('production profile selects INTAKE/OPEN and is approved (Phase 182 seed verified)', () => {
    const p = selectNewDealReferenceProfile('production');
    expect(p.stage.code).toBe('INTAKE');
    expect(p.status.code).toBe('OPEN');
    expect(p.productionApproved).toBe(true);
    expect(PRODUCTION_REFERENCES_APPROVED).toBe(true);
  });
});

describe('Phase 181B -- production resolver fails closed on TEST / missing / dup / inactive', () => {
  it('approved INTAKE + OPEN active rows -> ready (binds from verified ids)', async () => {
    const res = await resolveProductionNewDealReferences(reader([row()], [statusRow()]));
    expect(res.kind).toBe('ready');
    if (res.kind === 'ready') {
      expect(res.stageBind).toBe('/cr664_dealstagereferences(id-1)');
      expect(res.statusBind).toBe('/cr664_dealstatusreferences(sid-1)');
    }
  });

  it('only TEST PHASE121 rows -> missingStage (filtered out, never resolves)', async () => {
    const res = await resolveProductionNewDealReferences(
      reader(
        [row({ code: 'PHASE121_STAGE', name: 'TEST - Stage Phase 121' })],
        [statusRow({ code: 'PHASE121_STATUS', name: 'TEST — Status Phase 121' })],
      ),
    );
    expect(res.kind).toBe('missingStage');
  });

  it('a TEST-labeled row that matches a production code is still filtered', async () => {
    const res = await resolveProductionNewDealReferences(
      reader([row({ name: 'TEST Intake' })], [statusRow()]),
    );
    expect(res.kind).toBe('missingStage');
  });

  it('duplicate active INTAKE -> duplicateStage', async () => {
    const res = await resolveProductionNewDealReferences(
      reader([row({ id: 'a' }), row({ id: 'b' })], [statusRow()]),
    );
    expect(res.kind).toBe('duplicateStage');
  });

  it('inactive INTAKE -> inactiveStage', async () => {
    const res = await resolveProductionNewDealReferences(
      reader([row({ activeFlag: false })], [statusRow()]),
    );
    expect(res.kind).toBe('inactiveStage');
  });

  it('missing OPEN status -> missingStatus', async () => {
    const res = await resolveProductionNewDealReferences(reader([row()], []));
    expect(res.kind).toBe('missingStatus');
  });
});
