import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// The runtime reader's static graph is SDK-free (the live client loads via
// dynamic import). The production resolver module imports the generated
// services statically, so mock those to avoid loading the SDK.
vi.mock('../generated/services/Cr664_dealstagereferencesService', () => ({
  Cr664_dealstagereferencesService: { getAll: vi.fn() },
}));
vi.mock('../generated/services/Cr664_dealstatusreferencesService', () => ({
  Cr664_dealstatusreferencesService: { getAll: vi.fn() },
}));

import {
  buildNewDealReferenceRuntimeReader,
  type RetrieveMultiple,
  type RetrieveResult,
} from './newDealReferenceRuntimeReader';
import { resolveProductionNewDealReferences } from './newDealReferenceReader';

/**
 * BUGFIX -- runtime Stage/Status reference reader for banker create.
 */

type Row = Record<string, unknown>;
const stage = (over: Row = {}): Row => ({
  cr664_dealstagereferenceid: 'stage-1',
  cr664_name: 'Intake',
  cr664_code: 'INTAKE',
  cr664_activeflag: true,
  ...over,
});
const status = (over: Row = {}): Row => ({
  cr664_dealstatusreferenceid: 'status-1',
  cr664_name: 'Open',
  cr664_code: 'OPEN',
  cr664_activeflag: true,
  ...over,
});

function retrieveFrom(stageRows: Row[], statusRows: Row[]): RetrieveMultiple {
  return async (dataSourceName: string): Promise<RetrieveResult> => {
    if (dataSourceName === 'cr664_dealstagereferences') return { success: true, data: stageRows };
    if (dataSourceName === 'cr664_dealstatusreferences') return { success: true, data: statusRows };
    return { success: false, error: { message: `unknown data source ${dataSourceName}` } };
  };
}

describe('runtime reader -- maps rows and throws on failure', () => {
  it('reads the two reference tables by data-source name and maps to ReferenceRow', async () => {
    const reader = buildNewDealReferenceRuntimeReader(retrieveFrom([stage()], [status()]));
    const s = await reader.readStageReferences();
    // Phase 226 — productionApproved defaults false without the governed marker.
    expect(s).toEqual([{ id: 'stage-1', name: 'Intake', code: 'INTAKE', activeFlag: true, productionApproved: false }]);
    const t = await reader.readStatusReferences();
    expect(t[0]).toMatchObject({ code: 'OPEN', activeFlag: true, productionApproved: false });
  });

  it('Phase 226 — maps INTAKE/Open rows with new_productionapproved: true to productionApproved true', async () => {
    const reader = buildNewDealReferenceRuntimeReader(
      retrieveFrom(
        [stage({ new_productionapproved: true })],
        [status({ new_productionapproved: true })],
      ),
    );
    const s = await reader.readStageReferences();
    const t = await reader.readStatusReferences();
    expect(s[0]).toMatchObject({ code: 'INTAKE', activeFlag: true, productionApproved: true });
    expect(t[0]).toMatchObject({ code: 'OPEN', activeFlag: true, productionApproved: true });
  });

  it('Phase 226 — a TEST/PHASE row with a false marker is never production-approved', async () => {
    const reader = buildNewDealReferenceRuntimeReader(
      retrieveFrom(
        [stage({ cr664_code: 'PHASE121_STAGE', cr664_name: 'TEST - Stage Phase 121', new_productionapproved: false })],
        [status()],
      ),
    );
    const s = await reader.readStageReferences();
    expect(s[0]!.productionApproved).toBe(false);
  });

  it('Phase 226 — selects the new_productionapproved marker for both tables', async () => {
    const seen: Record<string, readonly string[]> = {};
    const retrieve: RetrieveMultiple = async (dataSourceName, select) => {
      seen[dataSourceName] = select;
      return { success: true, data: [] };
    };
    const reader = buildNewDealReferenceRuntimeReader(retrieve);
    await reader.readStageReferences();
    await reader.readStatusReferences();
    expect(seen['cr664_dealstagereferences']).toContain('new_productionapproved');
    expect(seen['cr664_dealstatusreferences']).toContain('new_productionapproved');
  });

  it('throws on a non-success read so the resolver fails closed to serviceError', async () => {
    const reader = buildNewDealReferenceRuntimeReader(async () => ({
      success: false,
      error: { message: 'boom' },
    }));
    const res = await resolveProductionNewDealReferences(reader);
    expect(res.kind).toBe('serviceError');
  });
});

describe('production resolver over the runtime reader', () => {
  it('resolves INTAKE/Intake and OPEN/Open to lookup binds (no GUID literal)', async () => {
    const reader = buildNewDealReferenceRuntimeReader(retrieveFrom([stage()], [status()]));
    const res = await resolveProductionNewDealReferences(reader);
    expect(res.kind).toBe('ready');
    if (res.kind === 'ready') {
      expect(res.stageBind).toBe('/cr664_dealstagereferences(stage-1)');
      expect(res.statusBind).toBe('/cr664_dealstatusreferences(status-1)');
    }
  });

  it('filters TEST/PHASE rows -> missingStage', async () => {
    const reader = buildNewDealReferenceRuntimeReader(
      retrieveFrom(
        [stage({ cr664_code: 'PHASE121_STAGE', cr664_name: 'TEST - Stage Phase 121' })],
        [status()],
      ),
    );
    expect((await resolveProductionNewDealReferences(reader)).kind).toBe('missingStage');
  });

  it('duplicate production-safe Intake -> duplicateStage', async () => {
    const reader = buildNewDealReferenceRuntimeReader(
      retrieveFrom([stage({ cr664_dealstagereferenceid: 'a' }), stage({ cr664_dealstagereferenceid: 'b' })], [status()]),
    );
    expect((await resolveProductionNewDealReferences(reader)).kind).toBe('duplicateStage');
  });

  it('inactive Intake -> inactiveStage', async () => {
    const reader = buildNewDealReferenceRuntimeReader(
      retrieveFrom([stage({ cr664_activeflag: false })], [status()]),
    );
    expect((await resolveProductionNewDealReferences(reader)).kind).toBe('inactiveStage');
  });

  it('missing Open status -> missingStatus', async () => {
    const reader = buildNewDealReferenceRuntimeReader(retrieveFrom([stage()], []));
    expect((await resolveProductionNewDealReferences(reader)).kind).toBe('missingStatus');
  });
});

describe('runtime reader source discipline', () => {
  const SRC = readFileSync(resolve(__dirname, 'newDealReferenceRuntimeReader.ts'), 'utf8');
  it('does not depend on the generated typed service classes and hardcodes no GUID', () => {
    expect(SRC).not.toMatch(/Cr664_dealstagereferencesService|Cr664_dealstatusreferencesService/);
    expect(SRC).not.toMatch(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
    // No write call shapes.
    expect(SRC).not.toMatch(/createRecordAsync|updateRecordAsync|deleteRecordAsync/);
  });
});
