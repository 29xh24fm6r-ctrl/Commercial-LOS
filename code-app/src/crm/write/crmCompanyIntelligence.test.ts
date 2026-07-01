import { describe, it, expect, vi } from 'vitest';
import { addCompany, type CrmWriteDeps } from './crmWriteAdapter';

/**
 * CRM Intelligence Phase 2/3 — addCompany now validates the party Type against the
 * code-defined enum and the NAICS code shape, and persists cr664_naicscode.
 */

function stubDeps(over: Partial<CrmWriteDeps> = {}): CrmWriteDeps {
  const ok = async () => ({ success: true, id: 'new-id' });
  const read = async () => ({ success: true, data: { cr664_name: 'X' } });
  return {
    createOrganization: vi.fn(ok),
    readOrganization: vi.fn(read),
    createPerson: vi.fn(ok),
    readPerson: vi.fn(read),
    createRelationship: vi.fn(ok),
    readRelationship: vi.fn(read),
    createTimelineEvent: vi.fn(ok),
    readTimelineEvent: vi.fn(read),
    createContactPoint: vi.fn(ok),
    emitAudit: vi.fn(async () => ({ success: true, id: 'audit-id' })),
    ...over,
  };
}

const ACTOR = { actorEmail: 'banker@bank.test', actorSystemUserId: 'sys-1', authorized: true };

describe('addCompany — Type validation', () => {
  it('rejects an off-list Type without writing', async () => {
    const deps = stubDeps();
    const outcome = await addCompany({ ...ACTOR, name: 'Acme', organizationType: 'Comm RE' }, deps);
    expect(outcome.kind).toBe('invalid-input');
    expect(deps.createOrganization).not.toHaveBeenCalled();
  });

  it('accepts an on-list Type', async () => {
    const deps = stubDeps();
    const outcome = await addCompany({ ...ACTOR, name: 'Acme', organizationType: 'Professional/Advisor' }, deps);
    expect(outcome.kind).toBe('success');
    const payload = (deps.createOrganization as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload.cr664_organizationtype).toBe('Professional/Advisor');
  });

  it('allows an empty Type (optional field)', async () => {
    const deps = stubDeps();
    const outcome = await addCompany({ ...ACTOR, name: 'Acme' }, deps);
    expect(outcome.kind).toBe('success');
  });
});

describe('addCompany — NAICS code', () => {
  it('persists a valid 6-digit NAICS code to cr664_naicscode', async () => {
    const deps = stubDeps();
    const outcome = await addCompany({ ...ACTOR, name: 'Bistro LLC', naicsCode: '722511' }, deps);
    expect(outcome.kind).toBe('success');
    const payload = (deps.createOrganization as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload.cr664_naicscode).toBe('722511');
  });

  it('rejects a malformed NAICS code without writing', async () => {
    const deps = stubDeps();
    const outcome = await addCompany({ ...ACTOR, name: 'Bistro LLC', naicsCode: '72' }, deps);
    expect(outcome.kind).toBe('invalid-input');
    expect(deps.createOrganization).not.toHaveBeenCalled();
  });

  it('omits cr664_naicscode when not provided', async () => {
    const deps = stubDeps();
    await addCompany({ ...ACTOR, name: 'No NAICS Co' }, deps);
    const payload = (deps.createOrganization as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect('cr664_naicscode' in payload).toBe(false);
  });
});
