import { describe, it, expect } from 'vitest';
import {
  buildCrmSpineAuditPayload,
  isCompleteCrmSpineAudit,
  type CrmSpineAuditInput,
} from './crmSalesforceSpineAudit';

/** Phase 193 — deterministic audit payloads. */

const base: CrmSpineAuditInput = {
  correlationId: 'corr-1',
  actor: 'operator@bank',
  targetEntity: 'cr664_crmorganization',
  targetRecordId: 'rec-1',
  action: 'record-create',
  outcome: 'created',
  dryRun: false,
  sourceFacts: [{ statement: 'authorized deal row', sourceLogicalName: 'cr664_loandeal', sourceRecordId: 'd-1' }],
  occurredAt: '2026-01-01T00:00:00Z',
};

describe('buildCrmSpineAuditPayload', () => {
  it('is deterministic — same input yields an equal payload', () => {
    expect(buildCrmSpineAuditPayload(base)).toEqual(buildCrmSpineAuditPayload(base));
  });

  it('carries actor, target, action, outcome, source facts, correlation id, and error', () => {
    const p = buildCrmSpineAuditPayload({ ...base, error: 'boom', outcome: 'failed_dataverse' });
    expect(p.actor).toBe('operator@bank');
    expect(p.targetEntity).toBe('cr664_crmorganization');
    expect(p.targetRecordId).toBe('rec-1');
    expect(p.action).toBe('record-create');
    expect(p.outcome).toBe('failed_dataverse');
    expect(p.correlationId).toBe('corr-1');
    expect(p.error).toBe('boom');
    expect(p.sourceFacts).toHaveLength(1);
  });

  it('never invents an actor — a blank actor is preserved and flagged incomplete', () => {
    const p = buildCrmSpineAuditPayload({ ...base, actor: '' });
    expect(p.actor).toBe('');
    expect(isCompleteCrmSpineAudit(p)).toBe(false);
  });

  it('a fully-formed payload is complete', () => {
    expect(isCompleteCrmSpineAudit(buildCrmSpineAuditPayload(base))).toBe(true);
  });

  it('defaults optional fields without fabricating values', () => {
    const p = buildCrmSpineAuditPayload({
      correlationId: 'c', actor: 'a', targetEntity: 't', action: 'schema-inspect', outcome: 'ok', dryRun: true,
    });
    expect(p.targetRecordId).toBeNull();
    expect(p.sourceFacts).toEqual([]);
    expect(p.occurredAt).toBeNull();
    expect(p.error).toBeNull();
  });
});
