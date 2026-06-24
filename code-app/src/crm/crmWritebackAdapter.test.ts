// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { crmWriteback, type CrmWritebackInput } from './crmWritebackAdapter';
import { CRM_ENTITIES } from './crmDataverseMapper';

function input(over: Partial<CrmWritebackInput> = {}): CrmWritebackInput {
  return {
    enabled: true,
    authorized: true,
    actorUpn: 'banker@oldglorybank.com',
    correlationId: 'corr-1',
    payload: { entityName: CRM_ENTITIES.organization, fields: { cr664_name: 'Acme LLC' } },
    transport: { create: vi.fn(async () => ({ ok: true, id: 'org-1' })) },
    auditSink: { write: vi.fn(async () => ({ ok: true })) },
    ...over,
  };
}

describe('Phase 237G — governed internal OGB CRM writeback adapter', () => {
  it('disabled by default → no write', async () => {
    const create = vi.fn(async () => ({ ok: true }));
    const out = await crmWriteback(input({ enabled: false, transport: { create } }));
    expect(out.kind).toBe('disabled');
    expect(create).not.toHaveBeenCalled();
  });

  it('unauthorized / missing actor is blocked', async () => {
    expect((await crmWriteback(input({ authorized: false }))).kind).toBe('unauthorized');
    expect((await crmWriteback(input({ actorUpn: '' }))).kind).toBe('validation_error');
  });

  it('allowed internal CRM write succeeds and audits', async () => {
    const create = vi.fn(async () => ({ ok: true, id: 'org-1' }));
    const audit = vi.fn(async () => ({ ok: true }));
    const out = await crmWriteback(input({ transport: { create }, auditSink: { write: audit } }));
    expect(out.kind).toBe('written');
    if (out.kind === 'written') expect(out.id).toBe('org-1');
    expect(create).toHaveBeenCalledWith(CRM_ENTITIES.organization, { cr664_name: 'Acme LLC' });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'written' }));
  });

  it('disallowed (non-internal) entity is blocked', async () => {
    const create = vi.fn(async () => ({ ok: true }));
    const out = await crmWriteback(input({ payload: { entityName: 'cr664_loandeal', fields: { cr664_name: 'x' } }, transport: { create } }));
    expect(out.kind).toBe('disallowed_entity');
    expect(create).not.toHaveBeenCalled();
  });

  it('raw sensitive identifier field is blocked (never persisted)', async () => {
    const out = await crmWriteback(input({ payload: { entityName: CRM_ENTITIES.organization, fields: { cr664_name: 'A', ssn: '123-45-6789' } } }));
    expect(out.kind).toBe('disallowed_field');
  });

  it('empty fields fail closed', async () => {
    expect((await crmWriteback(input({ payload: { entityName: CRM_ENTITIES.person, fields: {} } }))).kind).toBe('validation_error');
  });

  it('missing transport/audit → dependency_not_ready (no fake success)', async () => {
    expect((await crmWriteback(input({ transport: undefined }))).kind).toBe('dependency_not_ready');
  });

  it('adapter failure is surfaced as failed and audited (never fake success)', async () => {
    const audit = vi.fn(async () => ({ ok: true }));
    const out = await crmWriteback(input({ transport: { create: async () => ({ ok: false, error: 'boom' }) }, auditSink: { write: audit } }));
    expect(out.kind).toBe('failed');
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'failed' }));
  });

  it('only internal cr664_crm* entities are in the allow-list (no external dependency)', () => {
    for (const entity of Object.values(CRM_ENTITIES)) {
      expect(entity).toMatch(/^cr664_crm/);
    }
  });
});
