// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadFinalLaunchSmokeRecords } from '../../access/finalLaunchSmokeEvidenceLoader';
import { deriveFinalLaunchReadiness } from '../../activation/finalLaunchReadiness';
import { deriveProductionEnvironmentVerification } from '../../admin/productionEnvironmentVerification';

const ROOT = resolve(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');
const HARNESS = 'scripts/dataverse/run-final-launch-smokes.ps1';

describe('Phase 256A — operator launch harness + smoke evidence wiring', () => {
  it('the committed evidence dir holds NO passed artifacts yet → every capability is blocked', () => {
    const loaded = loadFinalLaunchSmokeRecords(ROOT);
    expect(loaded.records).toEqual([]); // only README.md, no JSON evidence
    const r = deriveFinalLaunchReadiness({ records: loaded.records });
    expect(r.deploymentAllowed).toBe(false);
    expect(r.capabilities.every((c) => !c.smokeGo && c.blockReason)).toBe(true);
  });

  it('backend is hydrated but launch is NOT achieved and gates are not flipped', () => {
    const r = deriveFinalLaunchReadiness({ records: [] });
    expect(r.backendReady).toBe(true); // CRM + portfolio hydrated (Phases 253C/255B)
    expect(r.currentEnabledCount).toBe(1);
    expect(r.currentFullLaunchAchieved).toBe(false);
    const verification = deriveProductionEnvironmentVerification();
    expect(verification.enabledCount).toBe(1);
    expect(verification.fullLaunchReady).toBe(false);
  });

  it('the harness exists, is dry-run-by-default, fail-closed, and never pushes or flips gates', () => {
    expect(existsSync(resolve(ROOT, HARNESS))).toBe(true);
    const src = read(HARNESS);
    expect(src).toMatch(/DRY-RUN BY DEFAULT/);
    expect(src).toMatch(/-RecordManualEvidence/);
    expect(src).toMatch(/LAUNCH-SMOKE/); // typed confirmation for live ops
    // It must not push, flip flags, or auto-send mail behind the operator's back.
    expect(src).not.toMatch(/pac\s+code\s+push/);
    expect(src).not.toMatch(/[A-Za-z0-9_]+_ENABLED\s*=/);
    expect(src).not.toMatch(/SendEmailV2|\bsendEmail\b/);
    // Record-level DELETE/PATCH exist (the smoke updates + cleans up its own record), but
    // only ever against records named with the launch-test marker it created.
    expect(src).toMatch(/-Method\s+Delete/i); // cleanup is a required closure step
    expect(src).toMatch(/ZZ-LAUNCH-SMOKE/);
    // It never deletes by a raw query/filter — only by the id captured from its own create.
    expect(src).not.toMatch(/Remove-Item|DeleteEntity|DeleteAttribute|DeleteRelationship/);
  });

  it('the evidence dir README documents the schema + how to produce each artifact', () => {
    const readme = read('docs/operator-evidence/final-launch/README.md');
    for (const cap of ['crmLivePersistence', 'portfolioBoarding', 'documentChecklist', 'borrowerSend', 'stageAdvancement']) {
      expect(readme, cap).toContain(cap);
    }
    expect(readme).toMatch(/never fabricates/i);
  });
});
