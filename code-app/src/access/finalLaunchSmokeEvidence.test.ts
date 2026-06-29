// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  parseFinalLaunchSmokeEvidence,
  isFinalLaunchSmokeGo,
  isFinalLaunchSmokeShapeGo,
  deriveEvidenceIntegrity,
  isAttributableOperatorUpn,
  isSyntheticTimestamp,
  toOperatorSmokeEvidence,
  FINAL_LAUNCH_CAPABILITIES,
  FINAL_LAUNCH_TO_REGISTRY_CAPABILITY,
  type FinalLaunchCapability,
  type FinalLaunchSmokeEvidence,
} from './finalLaunchSmokeEvidence';

/** A complete, valid PASS record for a capability (rollback by default; delivery for borrowerSend). */
function validRecord(capability: FinalLaunchCapability, over: Partial<FinalLaunchSmokeEvidence> = {}): FinalLaunchSmokeEvidence {
  const base: FinalLaunchSmokeEvidence = {
    capability,
    outcome: 'passed',
    operatorUpn: 'mpaller@oldglorybank.com',
    environmentUrl: 'https://org3a57b8d4.crm.dynamics.com/',
    environmentId: '5f2d77a5-de50-edeb-9d74-5b2400a2320d',
    correlationId: 'corr-0001',
    startedAtIso: '2026-06-25T17:00:00.000Z',
    completedAtIso: '2026-06-25T17:00:30.000Z',
    liveOperationPerformed: true,
    readbackVerified: true,
    rollbackVerified: true,
    evidenceNote: 'controlled launch-test smoke',
    affectedRecordIds: ['rec-1'],
    cleanupRecordIds: ['rec-1'],
  };
  if (capability === 'borrowerSend') {
    return {
      ...base,
      rollbackVerified: false,
      deliveryVerified: true,
      auditVerified: true,
      // Phase 1 — EXTERNAL_SEND machine proof: transport receipt + approved recipient + approver.
      deliveryReceiptId: 'AAMkADk-receipt-0001',
      approvedRecipient: 'approved-test@oldglorybank.com',
      approverUpn: 'approver@oldglorybank.com',
      ...over,
    };
  }
  return { ...base, ...over };
}

describe('Phase 256A — final-launch smoke evidence parser (fail-closed)', () => {
  it('parses a valid record for every capability', () => {
    for (const cap of FINAL_LAUNCH_CAPABILITIES) {
      const res = parseFinalLaunchSmokeEvidence(validRecord(cap));
      expect(res.ok, cap).toBe(true);
      if (res.ok) expect(res.evidence.capability).toBe(cap);
    }
  });

  it('rejects non-objects and unknown capability/outcome', () => {
    expect(parseFinalLaunchSmokeEvidence(null).ok).toBe(false);
    expect(parseFinalLaunchSmokeEvidence('x').ok).toBe(false);
    expect(parseFinalLaunchSmokeEvidence([]).ok).toBe(false);
    expect(parseFinalLaunchSmokeEvidence({ ...validRecord('crmLivePersistence'), capability: 'nope' }).ok).toBe(false);
    expect(parseFinalLaunchSmokeEvidence({ ...validRecord('crmLivePersistence'), outcome: 'maybe' }).ok).toBe(false);
  });

  it('fails closed on each missing required string field', () => {
    for (const field of ['operatorUpn', 'environmentUrl', 'environmentId', 'correlationId', 'startedAtIso', 'completedAtIso', 'evidenceNote'] as const) {
      const rec = { ...validRecord('crmLivePersistence') } as Record<string, unknown>;
      delete rec[field];
      const res = parseFinalLaunchSmokeEvidence(rec);
      expect(res.ok, field).toBe(false);
      if (!res.ok) expect(res.errors.join(' ')).toContain(field);
    }
  });

  it('fails closed on missing/invalid verification booleans', () => {
    for (const field of ['liveOperationPerformed', 'readbackVerified', 'rollbackVerified'] as const) {
      const rec = { ...validRecord('crmLivePersistence') } as Record<string, unknown>;
      delete rec[field];
      expect(parseFinalLaunchSmokeEvidence(rec).ok, field).toBe(false);
    }
    expect(parseFinalLaunchSmokeEvidence({ ...validRecord('crmLivePersistence'), liveOperationPerformed: 'yes' }).ok).toBe(false);
  });

  it('borrowerSend requires a delivery/audit verification boolean (rollback may be false)', () => {
    const rec = { ...validRecord('borrowerSend') } as Record<string, unknown>;
    delete rec.deliveryVerified;
    delete rec.auditVerified;
    expect(parseFinalLaunchSmokeEvidence(rec).ok).toBe(false);
    // With delivery present it parses even though rollbackVerified is false.
    expect(parseFinalLaunchSmokeEvidence(validRecord('borrowerSend')).ok).toBe(true);
  });

  it('rejects an unparseable timestamp and malformed id arrays', () => {
    expect(parseFinalLaunchSmokeEvidence({ ...validRecord('crmLivePersistence'), completedAtIso: 'not-a-date' }).ok).toBe(false);
    expect(parseFinalLaunchSmokeEvidence({ ...validRecord('crmLivePersistence'), affectedRecordIds: [1, 2] }).ok).toBe(false);
  });

  it('normalizes a scalar-string id list to an array (PowerShell single-element serialization)', () => {
    const res = parseFinalLaunchSmokeEvidence({ ...validRecord('crmLivePersistence'), cleanupRecordIds: 'fa1e612c-d770-f111-ab0d-70a8a59be491' });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.evidence.cleanupRecordIds).toEqual(['fa1e612c-d770-f111-ab0d-70a8a59be491']);
  });
});

describe('Phase 256A — GO predicate + registry mapping', () => {
  it('GO requires passed + live + readback + closure (rollback, or delivery for borrowerSend)', () => {
    expect(isFinalLaunchSmokeGo(validRecord('crmLivePersistence'))).toBe(true);
    expect(isFinalLaunchSmokeGo(validRecord('crmLivePersistence', { outcome: 'failed' }))).toBe(false);
    expect(isFinalLaunchSmokeGo(validRecord('crmLivePersistence', { liveOperationPerformed: false }))).toBe(false);
    expect(isFinalLaunchSmokeGo(validRecord('crmLivePersistence', { readbackVerified: false }))).toBe(false);
    expect(isFinalLaunchSmokeGo(validRecord('crmLivePersistence', { rollbackVerified: false }))).toBe(false);
    // borrowerSend: delivery satisfies closure; without it, blocked.
    expect(isFinalLaunchSmokeGo(validRecord('borrowerSend'))).toBe(true);
    expect(isFinalLaunchSmokeGo(validRecord('borrowerSend', { deliveryVerified: false, auditVerified: false }))).toBe(false);
  });

  it('maps to the registry capability and downgrades a non-GO record to failed', () => {
    const go = toOperatorSmokeEvidence(validRecord('crmLivePersistence'));
    expect(go.capability).toBe(FINAL_LAUNCH_TO_REGISTRY_CAPABILITY.crmLivePersistence);
    expect(go.outcome).toBe('passed');
    expect(go.rollbackVerified).toBe(true);
    const notGo = toOperatorSmokeEvidence(validRecord('crmLivePersistence', { readbackVerified: false }));
    expect(notGo.outcome).toBe('failed'); // never an inferred pass
    // borrowerSend delivery maps onto the registry's rollbackVerified slot.
    const send = toOperatorSmokeEvidence(validRecord('borrowerSend'));
    expect(send.capability).toBe('borrower-communication');
    expect(send.outcome).toBe('passed');
    expect(send.rollbackVerified).toBe(true);
  });
});

describe('Phase 1 (launch readiness) — evidence integrity hardening', () => {
  it('rejects sentinel / non-UPN operator identities', () => {
    for (const bad of ['unknown-operator', 'unknown', '', 'system', 'service-account', 'n/a', '00000000-0000-0000-0000-000000000000', 'not-an-email']) {
      expect(isAttributableOperatorUpn(bad), bad).toBe(false);
    }
    expect(isAttributableOperatorUpn('mpaller@oldglorybank.com')).toBe(true);
  });

  it('an AUTOMATED_CRUD record with a sentinel operator is NOT accepted (identity)', () => {
    const e = validRecord('crmLivePersistence', { operatorUpn: 'unknown-operator' });
    const integ = deriveEvidenceIntegrity(e);
    expect(integ.identityValid).toBe(false);
    expect(integ.accepted).toBe(false);
    expect(integ.confidence).toBe('NONE');
    expect(isFinalLaunchSmokeGo(e)).toBe(false);
    expect(integ.issues.join(' ')).toMatch(/not an attributable UPN/i);
  });

  it('a valid UPN with record ids and a real machine clock is accepted HIGH', () => {
    const e = validRecord('crmLivePersistence', { completedAtIso: '2026-06-25T20:48:12.9971028Z' });
    const integ = deriveEvidenceIntegrity(e);
    expect(integ.accepted).toBe(true);
    expect(integ.identityValid).toBe(true);
    expect(integ.machineProofPresent).toBe(true);
    expect(integ.confidence).toBe('HIGH');
  });

  it('an AUTOMATED_CRUD record with no affectedRecordIds is INSUFFICIENT (no machine proof)', () => {
    const e = validRecord('documentChecklist', { affectedRecordIds: [], cleanupRecordIds: [] });
    const integ = deriveEvidenceIntegrity(e);
    expect(integ.machineProofPresent).toBe(false);
    expect(integ.accepted).toBe(false);
    expect(isFinalLaunchSmokeGo(e)).toBe(false);
    expect(integ.issues.join(' ')).toMatch(/no machine proof/i);
  });

  it('a borrowerSend without a delivery receipt / recipient / approver is INSUFFICIENT', () => {
    const e = validRecord('borrowerSend', { deliveryReceiptId: undefined, approvedRecipient: undefined, approverUpn: undefined });
    const integ = deriveEvidenceIntegrity(e);
    expect(integ.evidenceClass).toBe('EXTERNAL_SEND');
    expect(integ.machineProofPresent).toBe(false);
    expect(integ.accepted).toBe(false);
    expect(isFinalLaunchSmokeGo(e)).toBe(false);
    expect(integ.issues.join(' ')).toMatch(/deliveryReceiptId/);
  });

  it('flags a round synthetic timestamp as LOW confidence (still surfaced, not full proof)', () => {
    expect(isSyntheticTimestamp('2026-06-25T21:00:00.000Z')).toBe(true);
    expect(isSyntheticTimestamp('2026-06-25T20:48:12.9971028Z')).toBe(false);
    // Otherwise-complete AUTOMATED_CRUD evidence with a hand-recorded clock → LOW, not HIGH.
    const e = validRecord('crmLivePersistence', { completedAtIso: '2026-06-25T21:00:00.000Z' });
    const integ = deriveEvidenceIntegrity(e);
    expect(integ.accepted).toBe(true); // structurally + identity + proof OK
    expect(integ.confidence).toBe('LOW');
  });

  it('isFinalLaunchSmokeShapeGo checks shape only (identity/proof are the gate, not shape)', () => {
    // Shape-GO can be true while the certification gate (isFinalLaunchSmokeGo) is false.
    const sentinel = validRecord('crmLivePersistence', { operatorUpn: 'unknown-operator' });
    expect(isFinalLaunchSmokeShapeGo(sentinel)).toBe(true);
    expect(isFinalLaunchSmokeGo(sentinel)).toBe(false);
  });
});
