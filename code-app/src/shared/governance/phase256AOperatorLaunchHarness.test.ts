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
  it('Phase 1 (hardened): the committed evidence still loads but is integrity-INSUFFICIENT → deployment withheld', () => {
    // The five JSON artifacts remain structurally parseable (so they can be reported), but the
    // hardened integrity gate rejects every one: crm/portfolio carry operatorUpn
    // "unknown-operator"; documentChecklist/stageAdvancement carry no affectedRecordIds;
    // borrowerSend carries no transport delivery receipt. None may certify a launch.
    const loaded = loadFinalLaunchSmokeRecords(ROOT);
    expect(loaded.records.length).toBe(5); // structurally loadable
    const r = deriveFinalLaunchReadiness({ records: loaded.records });
    expect(r.deploymentAllowed).toBe(false);
    expect(r.capabilities.every((c) => !c.smokeGo && c.evidenceInsufficient)).toBe(true);
    expect(r.capabilities.find((c) => c.capability === 'crmLivePersistence')?.integrity?.identityValid).toBe(false);
    expect(r.capabilities.find((c) => c.capability === 'portfolioBoarding')?.integrity?.identityValid).toBe(false);
    expect(r.capabilities.find((c) => c.capability === 'documentChecklist')?.integrity?.machineProofPresent).toBe(false);
    expect(r.capabilities.find((c) => c.capability === 'stageAdvancement')?.integrity?.machineProofPresent).toBe(false);
    expect(r.capabilities.find((c) => c.capability === 'borrowerSend')?.integrity?.machineProofPresent).toBe(false);
  });

  it('backend is hydrated; the flag-driven verification still reports 6/6 (Phase 5 gates this on integrity)', () => {
    // Phase 1 hardens the EVIDENCE layer; the flag-driven productionEnvironmentVerification is
    // truthed-up against the integrity report in Phase 5. Until then it reflects the live flags.
    const r = deriveFinalLaunchReadiness({ records: [] });
    expect(r.backendReady).toBe(true); // CRM + portfolio hydrated (Phases 253C/255B)
    const verification = deriveProductionEnvironmentVerification();
    expect(verification.enabledCount).toBe(6);
    expect(verification.fullLaunchReady).toBe(true);
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
