import { describe, it, expect } from 'vitest';
import { evaluateCrmAllowlistedLiveWritePilot } from './crmAllowlistedLiveWritePilot';

describe('Phase 143I — CRM allowlisted live-write pilot scaffold', () => {
  it('is disabled with no candidate fields', () => {
    expect(evaluateCrmAllowlistedLiveWritePilot({ candidateFields: [] }).status).toBe('disabled');
  });

  it('is eligible_for_future_pilot for allowlisted fields but performs no write', () => {
    const r = evaluateCrmAllowlistedLiveWritePilot({ dealId: 'D1', candidateFields: ['relationship_intelligence_note', 'crm_external_reference_label'] });
    expect(r.status).toBe('eligible_for_future_pilot');
    expect(r.liveWritePilotEnabled).toBe(false);
    expect(r.liveWritePerformed).toBe(false);
    expect(r.allowedFieldCount).toBe(2);
  });

  it('rejects a blocked or non-allowlisted field', () => {
    expect(evaluateCrmAllowlistedLiveWritePilot({ candidateFields: ['stage'] }).status).toBe('rejected');
    expect(evaluateCrmAllowlistedLiveWritePilot({ candidateFields: ['amount'] }).status).toBe('rejected');
    expect(evaluateCrmAllowlistedLiveWritePilot({ candidateFields: ['relationship_intelligence_note', 'credit_decision'] }).blockedFieldCount).toBe(1);
  });

  it('keeps every live-effect flag false in all outcomes', () => {
    for (const fields of [[], ['relationship_intelligence_note'], ['stage']]) {
      const r = evaluateCrmAllowlistedLiveWritePilot({ candidateFields: fields });
      expect(r.liveWritePilotEnabled).toBe(false);
      expect(r.liveWritePerformed).toBe(false);
      expect(r.externalSystemChanged).toBe(false);
    }
  });

  it('derives a deterministic pilot proof id', () => {
    const a = evaluateCrmAllowlistedLiveWritePilot({ dealId: 'D1', candidateFields: ['relationship_intelligence_note'] });
    const b = evaluateCrmAllowlistedLiveWritePilot({ dealId: 'D1', candidateFields: ['relationship_intelligence_note'] });
    expect(a.pilotProofId).toBe(b.pilotProofId);
  });
});
