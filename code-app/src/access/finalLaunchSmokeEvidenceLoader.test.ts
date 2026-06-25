// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { loadFinalLaunchSmokeRecords, FINAL_LAUNCH_EVIDENCE_DIR } from './finalLaunchSmokeEvidenceLoader';

const base = mkdtempSync(resolve(tmpdir(), 'final-launch-'));
const dir = resolve(base, FINAL_LAUNCH_EVIDENCE_DIR);
mkdirSync(dir, { recursive: true });

afterAll(() => rmSync(base, { recursive: true, force: true }));

const valid = {
  capability: 'crmLivePersistence',
  outcome: 'passed',
  operatorUpn: 'mpaller@oldglorybank.com',
  environmentUrl: 'https://org3a57b8d4.crm.dynamics.com/',
  environmentId: '5f2d77a5-de50-edeb-9d74-5b2400a2320d',
  correlationId: 'corr-1',
  startedAtIso: '2026-06-25T17:00:00.000Z',
  completedAtIso: '2026-06-25T17:00:30.000Z',
  liveOperationPerformed: true,
  readbackVerified: true,
  rollbackVerified: true,
  evidenceNote: 'launch-test crm smoke',
};

describe('Phase 256A — final-launch evidence loader (node, fail-closed)', () => {
  it('returns [] for a missing directory', () => {
    const r = loadFinalLaunchSmokeRecords(resolve(base, 'does-not-exist'));
    expect(r.records).toEqual([]);
    expect(r.errors).toEqual([]);
  });

  it('loads valid records and reports malformed/invalid files without coercing a pass', () => {
    writeFileSync(resolve(dir, 'crm.json'), JSON.stringify(valid), 'utf8');
    writeFileSync(resolve(dir, 'bad.json'), '{ not json', 'utf8');
    writeFileSync(resolve(dir, 'invalid.json'), JSON.stringify({ ...valid, capability: 'nope' }), 'utf8');
    writeFileSync(resolve(dir, 'ignore.txt'), 'not evidence', 'utf8');

    const r = loadFinalLaunchSmokeRecords(base);
    expect(r.records.map((x) => x.capability)).toEqual(['crmLivePersistence']);
    expect(r.errors.map((e) => e.file).sort()).toEqual(['bad.json', 'invalid.json']);
  });
});
