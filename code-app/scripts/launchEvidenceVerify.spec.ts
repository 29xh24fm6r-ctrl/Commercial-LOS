// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { loadFinalLaunchSmokeRecords } from '../src/access/finalLaunchSmokeEvidenceLoader';
import {
  FINAL_LAUNCH_CAPABILITIES,
  deriveEvidenceIntegrity,
} from '../src/access/finalLaunchSmokeEvidence';

/**
 * Launch Phase 4 — `npm run verify:launch-evidence` machine check.
 *
 * Runs the Phase-1 integrity report over docs/operator-evidence/final-launch/*.json and
 * FAILS (non-zero exit) unless EVERY launch capability has an `accepted` record at `HIGH`
 * confidence. This is the gate the operator runs before declaring launch. It is deliberately
 * OUTSIDE the default `vitest`/`npm run verify` suite (its own config) so the green CI gate
 * is unaffected; until authentic evidence is re-captured this verifier exits non-zero — that
 * is the correct, honest signal, not a broken test.
 */

const ROOT = resolve(__dirname, '..');

describe('verify:launch-evidence — all launch domains accepted at HIGH confidence', () => {
  const loaded = loadFinalLaunchSmokeRecords(ROOT);
  const byCap = new Map(loaded.records.map((r) => [r.capability, r]));

  // Print a readable per-domain report (visible in the verifier output).
  const lines = FINAL_LAUNCH_CAPABILITIES.map((cap) => {
    const rec = byCap.get(cap);
    if (!rec) return `  ✗ ${cap}: NO ARTIFACT`;
    const i = deriveEvidenceIntegrity(rec);
    const mark = i.accepted && i.confidence === 'HIGH' ? '✓' : '✗';
    return `  ${mark} ${cap}: accepted=${i.accepted} confidence=${i.confidence}` +
      (i.issues.length ? `\n      - ${i.issues.join('\n      - ')}` : '');
  });
  console.log(`\nLaunch evidence integrity (${loaded.records.length} artifact(s) loaded):\n${lines.join('\n')}\n`);

  for (const cap of FINAL_LAUNCH_CAPABILITIES) {
    it(`${cap} has an accepted HIGH-confidence smoke artifact`, () => {
      const rec = byCap.get(cap);
      expect(rec, `no artifact for ${cap}`).toBeDefined();
      const integ = deriveEvidenceIntegrity(rec!);
      expect(integ.accepted, `${cap} not accepted: ${integ.issues.join('; ')}`).toBe(true);
      expect(integ.confidence, `${cap} confidence`).toBe('HIGH');
    });
  }

  if (loaded.errors.length > 0) {
    it('no evidence file is malformed', () => {
      expect(loaded.errors, loaded.errors.join('; ')).toEqual([]);
    });
  }
});
