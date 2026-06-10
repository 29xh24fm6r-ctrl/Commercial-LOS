import { describe, it, expect } from 'vitest';
import { evaluateCrmWritebackPolicyGate, CRM_WRITEBACK_MODE, type CrmWritebackPolicyGateInput } from './crmWritebackPolicyGate';

function input(over: Partial<CrmWritebackPolicyGateInput> = {}): CrmWritebackPolicyGateInput {
  return { provider: 'salesforce', entityKind: 'relationship_note', operationKind: 'create', requestedFields: ['relationship_note'], mode: CRM_WRITEBACK_MODE, ...over };
}

const ALL_PREREQS = { sourceOfTruthConfirmed: true, identityMatchConfirmed: true, conflictFree: true, auditModelReady: true, rollbackReady: true, allowlistConfigured: true };

describe('Phase 143E — CRM writeback policy gate', () => {
  it('keeps allowedForLiveWriteNow / liveWritePerformed false in all outcomes', () => {
    for (const r of [evaluateCrmWritebackPolicyGate(input()), evaluateCrmWritebackPolicyGate(null), evaluateCrmWritebackPolicyGate(input(ALL_PREREQS))]) {
      expect(r.allowedForLiveWriteNow).toBe(false);
      expect(r.liveWritePerformed).toBe(false);
      expect(r.externalSystemChanged).toBe(false);
    }
  });

  it('only ever reaches ready_for_dry_run, never ready_for_live', () => {
    const r = evaluateCrmWritebackPolicyGate(input(ALL_PREREQS));
    expect(r.status).toBe('ready_for_dry_run');
  });

  it('rejects an unsupported entity / operation', () => {
    expect(evaluateCrmWritebackPolicyGate(input({ entityKind: 'loan' as unknown as 'account' })).rejectedReason).toBe('unsupported_operation');
  });

  it('blocks a stage / status / amount / pricing field', () => {
    expect(evaluateCrmWritebackPolicyGate(input({ requestedFields: ['stage'], ...ALL_PREREQS })).status).toBe('blocked_policy');
    expect(evaluateCrmWritebackPolicyGate(input({ requestedFields: ['amount'], ...ALL_PREREQS })).status).toBe('blocked_policy');
    expect(evaluateCrmWritebackPolicyGate(input({ requestedFields: ['pricing'], ...ALL_PREREQS })).status).toBe('blocked_policy');
  });

  it('is blocked_disabled without an allowlist', () => {
    expect(evaluateCrmWritebackPolicyGate(input({ sourceOfTruthConfirmed: true, identityMatchConfirmed: true, conflictFree: true, auditModelReady: true, rollbackReady: true })).status).toBe('blocked_disabled');
  });

  it('is blocked_policy when a prerequisite is missing', () => {
    expect(evaluateCrmWritebackPolicyGate(input({ ...ALL_PREREQS, conflictFree: false })).status).toBe('blocked_policy');
  });

  it('derives a deterministic policy gate proof id', () => {
    expect(evaluateCrmWritebackPolicyGate(input(ALL_PREREQS)).policyGateProofId).toBe(evaluateCrmWritebackPolicyGate(input(ALL_PREREQS)).policyGateProofId);
  });
});
