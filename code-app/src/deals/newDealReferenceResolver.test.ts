import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  resolveNewDealReferences,
  STAGE_REFERENCE,
  STATUS_REFERENCE,
  type NewDealReferenceReader,
  type ReferenceRow,
} from './newDealReferenceResolver';

/**
 * Phase 170D -- New Deal Stage/Status reference resolver (fail-closed).
 */

function reader(
  stage: readonly ReferenceRow[],
  status: readonly ReferenceRow[],
): NewDealReferenceReader {
  return {
    readStageReferences: async () => stage,
    readStatusReferences: async () => status,
  };
}

const ACTIVE_STAGE: ReferenceRow = { id: 's-1', name: 'Application', code: 'APP', activeFlag: true };
const ACTIVE_STATUS: ReferenceRow = { id: 't-1', name: 'Active', code: 'ACT', activeFlag: true };
const TARGET = { stageCode: 'APP', statusCode: 'ACT' };

describe('Phase 170D -- discovered live metadata is pinned exactly', () => {
  it('Stage target table + entity set + primary id/name', () => {
    expect(STAGE_REFERENCE.logicalName).toBe('cr664_dealstagereference');
    expect(STAGE_REFERENCE.entitySetName).toBe('cr664_dealstagereferences');
    expect(STAGE_REFERENCE.primaryId).toBe('cr664_dealstagereferenceid');
    expect(STAGE_REFERENCE.primaryName).toBe('cr664_name');
    expect(STAGE_REFERENCE.bindAttribute).toBe('cr664_StageReference@odata.bind');
  });

  it('Status target table + entity set + primary id/name', () => {
    expect(STATUS_REFERENCE.logicalName).toBe('cr664_dealstatusreference');
    expect(STATUS_REFERENCE.entitySetName).toBe('cr664_dealstatusreferences');
    expect(STATUS_REFERENCE.primaryId).toBe('cr664_dealstatusreferenceid');
    expect(STATUS_REFERENCE.primaryName).toBe('cr664_name');
    expect(STATUS_REFERENCE.bindAttribute).toBe('cr664_StatusReference@odata.bind');
  });
});

describe('Phase 170D -- resolver fails closed', () => {
  it('notConfigured when no reader is injected (data sources not registered)', async () => {
    expect((await resolveNewDealReferences(TARGET, null)).kind).toBe('notConfigured');
    expect((await resolveNewDealReferences(TARGET, undefined)).kind).toBe('notConfigured');
  });

  it('missingStage when no stage row matches the target', async () => {
    const r = await resolveNewDealReferences(TARGET, reader([], [ACTIVE_STATUS]));
    expect(r.kind).toBe('missingStage');
  });

  it('missingStatus when stage resolves but no status row matches', async () => {
    const r = await resolveNewDealReferences(TARGET, reader([ACTIVE_STAGE], []));
    expect(r.kind).toBe('missingStatus');
  });

  it('inactiveStage when the only matching stage row is inactive', async () => {
    const r = await resolveNewDealReferences(
      TARGET,
      reader([{ ...ACTIVE_STAGE, activeFlag: false }], [ACTIVE_STATUS]),
    );
    expect(r.kind).toBe('inactiveStage');
  });

  it('inactiveStatus when the only matching status row is inactive', async () => {
    const r = await resolveNewDealReferences(
      TARGET,
      reader([ACTIVE_STAGE], [{ ...ACTIVE_STATUS, activeFlag: false }]),
    );
    expect(r.kind).toBe('inactiveStatus');
  });

  it('duplicateStage when more than one active stage row matches', async () => {
    const r = await resolveNewDealReferences(
      TARGET,
      reader([ACTIVE_STAGE, { ...ACTIVE_STAGE, id: 's-2' }], [ACTIVE_STATUS]),
    );
    expect(r.kind).toBe('duplicateStage');
    if (r.kind === 'duplicateStage') expect(r.count).toBe(2);
  });

  it('duplicateStatus when more than one active status row matches', async () => {
    const r = await resolveNewDealReferences(
      TARGET,
      reader([ACTIVE_STAGE], [ACTIVE_STATUS, { ...ACTIVE_STATUS, id: 't-2' }]),
    );
    expect(r.kind).toBe('duplicateStatus');
  });

  it('serviceError when the reader throws', async () => {
    const throwing: NewDealReferenceReader = {
      readStageReferences: async () => {
        throw new Error('boom');
      },
      readStatusReferences: async () => [ACTIVE_STATUS],
    };
    const r = await resolveNewDealReferences(TARGET, throwing);
    expect(r.kind).toBe('serviceError');
    if (r.kind === 'serviceError') expect(r.message).toMatch(/boom/);
  });

  it('missing when no target code/name is given (never invents a default)', async () => {
    const r = await resolveNewDealReferences({}, reader([ACTIVE_STAGE], [ACTIVE_STATUS]));
    expect(r.kind).toBe('missingStage');
  });
});

describe('Phase 170D -- resolver emits binds only from verified unique active ids', () => {
  it('ready builds bind paths from the resolved row ids (no hardcoded GUIDs)', async () => {
    const r = await resolveNewDealReferences(TARGET, reader([ACTIVE_STAGE], [ACTIVE_STATUS]));
    expect(r.kind).toBe('ready');
    if (r.kind === 'ready') {
      expect(r.stageId).toBe('s-1');
      expect(r.statusId).toBe('t-1');
      expect(r.stageBind).toBe('/cr664_dealstagereferences(s-1)');
      expect(r.statusBind).toBe('/cr664_dealstatusreferences(t-1)');
    }
  });

  it('resolves by name when no code is given', async () => {
    const r = await resolveNewDealReferences(
      { stageName: 'Application', statusName: 'Active' },
      reader([ACTIVE_STAGE], [ACTIVE_STATUS]),
    );
    expect(r.kind).toBe('ready');
  });
});

describe('Phase 170D -- resolver source discipline', () => {
  const SRC = readFileSync(resolve(__dirname, 'newDealReferenceResolver.ts'), 'utf8');

  it('hardcodes no Dataverse GUID', () => {
    expect(SRC).not.toMatch(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
  });

  it('introduces no fetch / XHR / Graph / Dataverse write (IO is injected)', () => {
    expect(SRC).not.toMatch(/\bfetch\s*\(/);
    expect(SRC).not.toMatch(/XMLHttpRequest/);
    expect(SRC).not.toMatch(/graph\.microsoft\.com/i);
    expect(SRC).not.toMatch(/createRecordAsync|updateRecordAsync|deleteRecordAsync/);
  });

  it('does not import a generated Stage/Status service (none registered yet)', () => {
    expect(SRC).not.toMatch(/from '\.\.\/generated\//);
  });
});
