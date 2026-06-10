import { describe, it, expect } from 'vitest';
import { submitCrmControlledWriteback, type CrmControlledWritebackInput } from './crmControlledWritebackAdapter';

const CLOCK = '2026-06-10T00:00:00.000Z';

function input(over: Partial<CrmControlledWritebackInput> = {}): CrmControlledWritebackInput {
  return {
    provider: 'salesforce', planId: 'P1', dryRunOnly: true, policyGateStatus: 'ready_for_dry_run',
    operations: [{ entity: 'account', operation: 'would_link' }, { entity: 'opportunity', operation: 'would_update' }],
    requestedByDisplayName: 'admin-1', requestedAt: CLOCK, ...over,
  };
}

describe('Phase 143F — CRM controlled writeback adapter (dry-run only)', () => {
  it('records a dry run (not a live write) for a policy-approved plan', () => {
    const r = submitCrmControlledWriteback(input());
    expect(r.status).toBe('dry_run_recorded');
    expect(r.dryRunProofId).toBeTruthy();
    expect(r.message.toLowerCase()).toMatch(/no salesforce or ncino record is written/);
  });

  it('keeps every write flag false in all outcomes', () => {
    for (const r of [submitCrmControlledWriteback(input()), submitCrmControlledWriteback(null), submitCrmControlledWriteback(input({ dryRunOnly: false }))]) {
      expect(r.liveWritePerformed).toBe(false);
      expect(r.salesforceWritePerformed).toBe(false);
      expect(r.ncinoWritePerformed).toBe(false);
      expect(r.externalSystemChanged).toBe(false);
    }
  });

  it('rejects a missing plan, non-dry-run, or non-ready policy', () => {
    expect(submitCrmControlledWriteback(input({ planId: '' })).rejectedReason).toBe('missing_plan');
    expect(submitCrmControlledWriteback(input({ dryRunOnly: false })).rejectedReason).toBe('not_dry_run_only');
    expect(submitCrmControlledWriteback(input({ policyGateStatus: 'blocked_disabled' })).rejectedReason).toBe('policy_not_ready');
  });

  it('rejects unsupported operations and unsafe payloads', () => {
    expect(submitCrmControlledWriteback(input({ operations: [{ entity: 'account', operation: 'created' }] })).rejectedReason).toBe('unsupported_operation');
    expect(submitCrmControlledWriteback(input({ operations: [{ entity: 'account', operation: 'would_update', valueSummary: 'function(){ run() } => go' }] })).rejectedReason).toBe('unsafe_payload');
  });

  it('derives a deterministic dry-run proof id', () => {
    expect(submitCrmControlledWriteback(input()).dryRunProofId).toBe(submitCrmControlledWriteback(input()).dryRunProofId);
  });
});
