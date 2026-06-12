import { describe, it, expect } from 'vitest';
import { evaluateAllowlistedWritePilot } from './externalAllowlistedWritePilot';

describe('Phase 155 — externalAllowlistedWritePilot', () => {
  it('disabled by default with no fields', () => {
    const r = evaluateAllowlistedWritePilot({ candidateFields: [] });
    expect(r.status).toBe('disabled');
    expect(r.liveWritePilotEnabled).toBe(false);
    expect(r.liveWritePerformed).toBe(false);
  });

  it('eligible field produces eligible_for_future_pilot but no write', () => {
    const r = evaluateAllowlistedWritePilot({ candidateFields: ['non_authoritative_relationship_note'] });
    expect(r.status).toBe('eligible_for_future_pilot');
    expect(r.allowedFieldCount).toBe(1);
    expect(r.liveWritePilotEnabled).toBe(false);
    expect(r.liveWritePerformed).toBe(false);
  });

  it('blocked field rejects', () => {
    const r = evaluateAllowlistedWritePilot({ candidateFields: ['credit_decision'] });
    expect(r.status).toBe('rejected');
    expect(r.blockedFieldCount).toBe(1);
  });

  it('all safety booleans pinned', () => {
    const r = evaluateAllowlistedWritePilot({ candidateFields: ['non_authoritative_relationship_note'] });
    expect(r.liveWritePilotEnabled).toBe(false);
    expect(r.liveWritePerformed).toBe(false);
    expect(r.externalSystemChanged).toBe(false);
  });
});
