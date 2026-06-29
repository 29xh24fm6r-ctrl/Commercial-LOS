// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deriveFinalLaunchReadiness } from './finalLaunchReadiness';
import {
  FINAL_LAUNCH_CAPABILITIES,
  type FinalLaunchCapability,
  type FinalLaunchSmokeEvidence,
} from '../access/finalLaunchSmokeEvidence';

function validRecord(capability: FinalLaunchCapability, over: Partial<FinalLaunchSmokeEvidence> = {}): FinalLaunchSmokeEvidence {
  const base: FinalLaunchSmokeEvidence = {
    capability,
    outcome: 'passed',
    operatorUpn: 'mpaller@oldglorybank.com',
    environmentUrl: 'https://org3a57b8d4.crm.dynamics.com/',
    environmentId: '5f2d77a5-de50-edeb-9d74-5b2400a2320d',
    correlationId: `corr-${capability}`,
    startedAtIso: '2026-06-25T17:00:00.000Z',
    completedAtIso: '2026-06-25T17:00:30.000Z',
    liveOperationPerformed: true,
    readbackVerified: true,
    rollbackVerified: true,
    evidenceNote: 'controlled launch-test smoke',
    // Phase 1 — AUTOMATED_CRUD machine proof (real record ids the smoke created + cleaned).
    affectedRecordIds: [`rec-${capability}`],
    cleanupRecordIds: [`rec-${capability}`],
  };
  if (capability === 'borrowerSend') {
    return {
      ...base,
      rollbackVerified: false,
      deliveryVerified: true,
      auditVerified: true,
      // EXTERNAL_SEND machine proof.
      deliveryReceiptId: 'AAMkADk-receipt-0001',
      approvedRecipient: 'approved-test@oldglorybank.com',
      approverUpn: 'approver@oldglorybank.com',
      ...over,
    };
  }
  return { ...base, ...over };
}

const allFiveValid = () => FINAL_LAUNCH_CAPABILITIES.map((c) => validRecord(c));

describe('Phase 256A — final-launch readiness projection', () => {
  it('with NO artifacts: this projection withholds deployment and projects only 1/6, even though the real gates are already live (6/6)', () => {
    const r = deriveFinalLaunchReadiness({ records: [] });
    expect(r.deploymentAllowed).toBe(false);
    expect(r.allCapabilitiesGo).toBe(false);
    expect(r.capabilities.every((c) => !c.smokeGo && c.blockReason)).toBe(true);
    // Launch Phase 5: the real verification is now gated on evidence integrity too — only
    // New Deal create is live (1/6); full launch is NOT achieved.
    expect(r.currentEnabledCount).toBe(1);
    expect(r.currentFullLaunchAchieved).toBe(false);
    // The projection itself, fed NO smoke records, also projects only New Deal (1).
    expect(r.projectedEnabledCount).toBe(1);
  });

  it('backend is hydrated (CRM + portfolio) — the prerequisite for deployment', () => {
    const r = deriveFinalLaunchReadiness({ records: [] });
    expect(r.crmHydrated).toBe(true);
    expect(r.portfolioHydrated).toBe(true);
    expect(r.backendReady).toBe(true);
    expect(r.newDealCertified).toBe(true);
  });

  it('with VALID artifacts for all five: deploymentAllowed true and projection reaches 6/6; the real gates are live too (Phase 256B)', () => {
    const r = deriveFinalLaunchReadiness({ records: allFiveValid() });
    expect(r.allCapabilitiesGo).toBe(true);
    expect(r.deploymentAllowed).toBe(true);
    expect(r.projectedEnabledCount).toBe(6);
    expect(r.projectedFullLaunchAchieved).toBe(true);
    // The projection proves authentic evidence would reach 6/6; the REAL verification stays
    // gated on the (still-insufficient) committed evidence → 1/6, not launched.
    expect(r.currentEnabledCount).toBe(1);
    expect(r.currentFullLaunchAchieved).toBe(false);
  });

  it('a single failed/missing artifact blocks that capability and withholds deployment', () => {
    const withOneFailed = allFiveValid().map((rec) =>
      rec.capability === 'stageAdvancement' ? { ...rec, outcome: 'failed' as const } : rec,
    );
    const r = deriveFinalLaunchReadiness({ records: withOneFailed });
    expect(r.deploymentAllowed).toBe(false);
    expect(r.capabilities.find((c) => c.capability === 'stageAdvancement')?.smokeGo).toBe(false);
    expect(r.capabilities.filter((c) => c.smokeGo).length).toBe(4);
    expect(r.projectedEnabledCount).toBe(5);

    // A missing artifact (only four supplied) also withholds deployment.
    const fourOnly = allFiveValid().filter((rec) => rec.capability !== 'borrowerSend');
    const r2 = deriveFinalLaunchReadiness({ records: fourOnly });
    expect(r2.deploymentAllowed).toBe(false);
    expect(r2.capabilities.find((c) => c.capability === 'borrowerSend')?.present).toBe(false);
  });

  it('a borrowerSend smoke without delivery/audit verification is blocked', () => {
    const records = allFiveValid().map((rec) =>
      rec.capability === 'borrowerSend' ? { ...rec, deliveryVerified: false, auditVerified: false } : rec,
    );
    const r = deriveFinalLaunchReadiness({ records });
    expect(r.deploymentAllowed).toBe(false);
    expect(r.capabilities.find((c) => c.capability === 'borrowerSend')?.smokeGo).toBe(false);
  });

  it('this module (the projection) assigns NO live gate constant — the 256B gate flips live in the flag-source files, not here', () => {
    const src = readFileSync(resolve(__dirname, 'finalLaunchReadiness.ts'), 'utf8');
    // The projection module must never assign a gate constant (true or false); it only derives.
    expect(src).not.toMatch(/_ENABLED\s*=\s*(true|false)/);
  });
});
