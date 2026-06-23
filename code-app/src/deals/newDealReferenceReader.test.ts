import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Phase 170F2 -- New Deal Stage/Status reference reader over the typed
 * generated services. Read-only, code/name selection, fail-closed.
 */

vi.mock('../generated/services/Cr664_dealstagereferencesService', () => ({
  Cr664_dealstagereferencesService: { getAll: vi.fn() },
}));
vi.mock('../generated/services/Cr664_dealstatusreferencesService', () => ({
  Cr664_dealstatusreferencesService: { getAll: vi.fn() },
}));

import { Cr664_dealstagereferencesService } from '../generated/services/Cr664_dealstagereferencesService';
import { Cr664_dealstatusreferencesService } from '../generated/services/Cr664_dealstatusreferencesService';
import {
  createNewDealReferenceReader,
  resolveConfiguredNewDealReferences,
} from './newDealReferenceReader';

const stageGetAll = vi.mocked(Cr664_dealstagereferencesService.getAll);
const statusGetAll = vi.mocked(Cr664_dealstatusreferencesService.getAll);

const ok = (data: unknown[]) => ({ success: true, data }) as never;
const fail = (message: string) => ({ success: false, error: { message } }) as never;

// One active row per table, matching the configured selection codes.
const activeStage = {
  cr664_dealstagereferenceid: 'stage-id-1',
  cr664_name: 'TEST - Stage Phase 121',
  cr664_code: 'PHASE121_STAGE',
  cr664_activeflag: true,
};
const activeStatus = {
  cr664_dealstatusreferenceid: 'status-id-1',
  cr664_name: 'TEST — Status Phase 121',
  cr664_code: 'PHASE121_STATUS',
  cr664_activeflag: true,
};

beforeEach(() => {
  stageGetAll.mockReset();
  statusGetAll.mockReset();
});

describe('Phase 170F2 -- reader reads least-privilege, code/name (never GUID)', () => {
  it('selects only id/name/code/activeflag and never filters by a GUID', async () => {
    stageGetAll.mockResolvedValue(ok([activeStage]));
    statusGetAll.mockResolvedValue(ok([activeStatus]));
    const reader = createNewDealReferenceReader();
    await reader.readStageReferences();
    await reader.readStatusReferences();
    const stageOpts = stageGetAll.mock.calls[0]![0]!;
    expect(stageOpts.select).toEqual([
      'cr664_dealstagereferenceid',
      'cr664_name',
      'cr664_code',
      'cr664_activeflag',
      'new_productionapproved',
    ]);
    const statusOpts = statusGetAll.mock.calls[0]![0]!;
    // Phase 226 — both select arrays carry the governed production-approval marker.
    expect(statusOpts.select).toContain('new_productionapproved');
    // No GUID-shaped filter anywhere in the call options.
    const blob = JSON.stringify(stageGetAll.mock.calls) + JSON.stringify(statusGetAll.mock.calls);
    expect(blob).not.toMatch(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
  });

  it('maps rows to ReferenceRow shape (productionApproved false without the marker)', async () => {
    stageGetAll.mockResolvedValue(ok([activeStage]));
    const rows = await createNewDealReferenceReader().readStageReferences();
    expect(rows).toEqual([
      { id: 'stage-id-1', name: 'TEST - Stage Phase 121', code: 'PHASE121_STAGE', activeFlag: true, productionApproved: false },
    ]);
  });

  it('Phase 226 — productionApproved is true ONLY when new_productionapproved === true', async () => {
    stageGetAll.mockResolvedValue(
      ok([
        { cr664_dealstagereferenceid: 'a', cr664_name: 'Intake', cr664_code: 'INTAKE', cr664_activeflag: true, new_productionapproved: true },
        { cr664_dealstagereferenceid: 'b', cr664_name: 'TEST - Stage Phase 121', cr664_code: 'PHASE121_STAGE', cr664_activeflag: true, new_productionapproved: false },
        { cr664_dealstagereferenceid: 'c', cr664_name: 'No marker', cr664_code: 'NOMARK', cr664_activeflag: true },
      ]),
    );
    const rows = await createNewDealReferenceReader().readStageReferences();
    expect(rows.map((r) => r.productionApproved)).toEqual([true, false, false]);
  });
});

describe('Phase 170F2 -- resolveConfiguredNewDealReferences end-to-end (fail-closed)', () => {
  it('ready when exactly one active Stage and one active Status match by code', async () => {
    stageGetAll.mockResolvedValue(ok([activeStage]));
    statusGetAll.mockResolvedValue(ok([activeStatus]));
    const r = await resolveConfiguredNewDealReferences();
    expect(r.kind).toBe('ready');
    if (r.kind === 'ready') {
      expect(r.stageBind).toBe('/cr664_dealstagereferences(stage-id-1)');
      expect(r.statusBind).toBe('/cr664_dealstatusreferences(status-id-1)');
    }
  });

  it('missingStage when no stage row matches the configured code', async () => {
    stageGetAll.mockResolvedValue(ok([{ ...activeStage, cr664_code: 'OTHER' }]));
    statusGetAll.mockResolvedValue(ok([activeStatus]));
    expect((await resolveConfiguredNewDealReferences()).kind).toBe('missingStage');
  });

  it('inactiveStage when the matching stage row is inactive', async () => {
    stageGetAll.mockResolvedValue(ok([{ ...activeStage, cr664_activeflag: false }]));
    statusGetAll.mockResolvedValue(ok([activeStatus]));
    expect((await resolveConfiguredNewDealReferences()).kind).toBe('inactiveStage');
  });

  it('duplicateStatus when two active status rows match the configured code', async () => {
    stageGetAll.mockResolvedValue(ok([activeStage]));
    statusGetAll.mockResolvedValue(
      ok([activeStatus, { ...activeStatus, cr664_dealstatusreferenceid: 'status-id-2' }]),
    );
    expect((await resolveConfiguredNewDealReferences()).kind).toBe('duplicateStatus');
  });

  it('serviceError when a read is unsuccessful', async () => {
    stageGetAll.mockResolvedValue(fail('Dataverse denied'));
    statusGetAll.mockResolvedValue(ok([activeStatus]));
    const r = await resolveConfiguredNewDealReferences();
    expect(r.kind).toBe('serviceError');
  });
});

describe('Phase 170F2 -- reader source discipline', () => {
  const SRC = readFileSync(resolve(__dirname, 'newDealReferenceReader.ts'), 'utf8');

  it('uses typed generated services, not a generic Dataverse connector', () => {
    expect(SRC).toMatch(/Cr664_dealstagereferencesService/);
    expect(SRC).toMatch(/Cr664_dealstatusreferencesService/);
    expect(SRC).not.toMatch(/MicrosoftDataverseService/);
    expect(SRC).not.toMatch(/shared_commondataserviceforapps/);
  });

  it('introduces no fetch / XHR / Graph and writes nothing', () => {
    expect(SRC).not.toMatch(/\bfetch\s*\(/);
    expect(SRC).not.toMatch(/XMLHttpRequest/);
    expect(SRC).not.toMatch(/graph\.microsoft\.com/i);
    expect(SRC).not.toMatch(/\.create\(|\.update\(|\.delete\(/);
  });

  it('hardcodes no inspected record GUID', () => {
    for (const id of ['128de457-3059-f111-bec7-70a8a59be491', '8029c312-3159-f111-bec7-70a8a59be491']) {
      expect(SRC).not.toContain(id);
    }
  });
});
