// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  deriveStageAdvancementSmokeProof,
  type StageAdvancementSmokeProof,
} from './stageAdvancementSmokeProof';

/** A fully machine-proven record (real ids, backed readback, real machine clock). */
function proof(over: Partial<StageAdvancementSmokeProof> = {}): StageAdvancementSmokeProof {
  return {
    operatorUpn: 'mpaller@oldglorybank.com',
    systemUserId: '5f2d77a5-de50-4deb-9d74-5b2400a2320d',
    environmentUrl: 'https://org3a57b8d4.crm.dynamics.com/',
    environmentId: '5f2d77a5-de50-edeb-9d74-5b2400a2320d',
    dealId: 'a1b2c3d4-0000-4000-8000-000000000001',
    fromStage: 'INTAKE',
    toStage: 'UNDERWRITING',
    correlationId: 'stage-smoke-20260703-1',
    completedAtIso: '2026-07-03T14:32:11.482Z',
    affectedRecordIds: ['a1b2c3d4-0000-4000-8000-000000000001'],
    auditRecordId: 'aud-1',
    timelineRecordId: 'tl-1',
    readbackVerified: true,
    readbackProof: 'cr664_StageReference=ref-uw; cr664_stageentrydate=2026-07-03T14:32:10Z',
    note: 'Advanced launch-test deal INTAKE→UNDERWRITING; re-read confirmed; test record retained for audit.',
    ...over,
  };
}

describe('deriveStageAdvancementSmokeProof — WFLOW-I machine proof', () => {
  it('a complete, attributable, readback-backed record is machineProven at HIGH confidence', () => {
    const r = deriveStageAdvancementSmokeProof(proof());
    expect(r.machineProven).toBe(true);
    expect(r.confidence).toBe('HIGH');
    expect(r.issues).toEqual([]);
    expect(r.fabricationFlags).toEqual([]);
  });

  it('OVERCLAIM GUARD: readbackVerified true with NO readbackProof is fabrication, not proof', () => {
    const r = deriveStageAdvancementSmokeProof(proof({ readbackProof: undefined }));
    expect(r.machineProven).toBe(false);
    expect(r.fabricationFlags).toContain('readback-claimed-without-proof');
    expect(r.issues.join(' ')).toMatch(/unbacked readback claim/);
  });

  it('EMPTY affectedRecordIds is flagged as no machine proof', () => {
    const r = deriveStageAdvancementSmokeProof(proof({ affectedRecordIds: [] }));
    expect(r.machineProven).toBe(false);
    expect(r.fabricationFlags).toContain('no-affected-record-ids');
  });

  it('a sentinel / malformed operatorUpn is not machine-proven', () => {
    expect(deriveStageAdvancementSmokeProof(proof({ operatorUpn: 'unknown-operator' })).machineProven).toBe(false);
    expect(deriveStageAdvancementSmokeProof(proof({ operatorUpn: 'system' })).machineProven).toBe(false);
  });

  it('a zero / non-GUID systemUserId is not machine-proven', () => {
    expect(deriveStageAdvancementSmokeProof(proof({ systemUserId: '00000000-0000-0000-0000-000000000000' })).machineProven).toBe(false);
    expect(deriveStageAdvancementSmokeProof(proof({ systemUserId: 'sys-1' })).machineProven).toBe(false);
  });

  it('missing audit or timeline record ids are not machine-proven', () => {
    expect(deriveStageAdvancementSmokeProof(proof({ auditRecordId: '' })).machineProven).toBe(false);
    expect(deriveStageAdvancementSmokeProof(proof({ timelineRecordId: '' })).machineProven).toBe(false);
  });

  it('a non-canonical or no-op stage move is not machine-proven', () => {
    expect(deriveStageAdvancementSmokeProof(proof({ toStage: 'NONSENSE' })).machineProven).toBe(false);
    expect(deriveStageAdvancementSmokeProof(proof({ fromStage: 'UNDERWRITING', toStage: 'UNDERWRITING' })).machineProven).toBe(false);
  });

  it('an unparseable timestamp is not machine-proven; a synthetic (round) one downgrades to LOW', () => {
    expect(deriveStageAdvancementSmokeProof(proof({ completedAtIso: 'not-a-date' })).machineProven).toBe(false);
    const round = deriveStageAdvancementSmokeProof(proof({ completedAtIso: '2026-07-03T14:32:00.000Z' }));
    expect(round.machineProven).toBe(true);
    expect(round.confidence).toBe('LOW');
  });

  it('a missing rollback/readback note is not machine-proven', () => {
    expect(deriveStageAdvancementSmokeProof(proof({ note: '' })).machineProven).toBe(false);
  });
});
