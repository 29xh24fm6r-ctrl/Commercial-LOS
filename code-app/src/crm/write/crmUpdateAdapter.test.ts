import { describe, it, expect, vi } from 'vitest';
import {
  updateOrganizationField,
  makeOrgFieldSaver,
  type CrmUpdateDeps,
} from './crmUpdateAdapter';

/**
 * Phase 6 — governed CRM field-update adapter certification: default-off,
 * fail-closed, allow-listed, sensitive-field-rejecting, value-validated, audited.
 */

function stubDeps(over: Partial<CrmUpdateDeps> = {}): CrmUpdateDeps {
  return {
    updateOrganization: vi.fn(async () => ({ success: true })),
    emitAudit: vi.fn(async () => ({ success: true, id: 'audit-1' })),
    ...over,
  };
}

const ACTOR = { actorEmail: 'banker@bank.test', actorSystemUserId: 'sys-1', authorized: true };
const ON = { ...ACTOR, organizationId: 'org-1', enabled: true };

describe('updateOrganizationField', () => {
  it('is DISABLED by default (fail-closed) — no write', async () => {
    const deps = stubDeps();
    const outcome = await updateOrganizationField({ ...ACTOR, organizationId: 'org-1', field: 'cr664_industry', value: 'x' }, deps);
    expect(outcome.kind).toBe('disabled');
    expect(deps.updateOrganization).not.toHaveBeenCalled();
  });

  it('rejects an unauthorized actor even when enabled', async () => {
    const deps = stubDeps();
    const outcome = await updateOrganizationField({ ...ON, authorized: false, field: 'cr664_industry', value: 'x' }, deps);
    expect(outcome.kind).toBe('unauthorized');
    expect(deps.updateOrganization).not.toHaveBeenCalled();
  });

  it('rejects a non-allow-listed field', async () => {
    const deps = stubDeps();
    const outcome = await updateOrganizationField({ ...ON, field: 'cr664_secretscore', value: 'x' }, deps);
    expect(outcome.kind).toBe('disallowed-field');
  });

  it('rejects a sensitive identifier field', async () => {
    const deps = stubDeps();
    const outcome = await updateOrganizationField({ ...ON, field: 'cr664_taxid', value: '12-3456789' }, deps);
    expect(outcome.kind).toBe('disallowed-field');
    expect(deps.updateOrganization).not.toHaveBeenCalled();
  });

  it('validates structured values (off-list Type / bad NAICS)', async () => {
    const deps = stubDeps();
    expect((await updateOrganizationField({ ...ON, field: 'cr664_organizationtype', value: 'CRE' }, deps)).kind).toBe('invalid-input');
    expect((await updateOrganizationField({ ...ON, field: 'cr664_naicscode', value: '72' }, deps)).kind).toBe('invalid-input');
  });

  it('updates an allow-listed field and writes an audit (success)', async () => {
    const deps = stubDeps();
    const outcome = await updateOrganizationField({ ...ON, field: 'cr664_organizationtype', value: 'Borrower' }, deps);
    expect(outcome.kind).toBe('success');
    expect(deps.updateOrganization).toHaveBeenCalledWith('org-1', { cr664_organizationtype: 'Borrower' });
    const audit = (deps.emitAudit as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(audit.cr664_action).toBe('crm-update-organization-field');
    expect(audit.cr664_entityid).toBe('org-1');
  });

  it('surfaces an update failure without claiming success', async () => {
    const deps = stubDeps({ updateOrganization: vi.fn(async () => ({ success: false, error: 'row locked' })) });
    const outcome = await updateOrganizationField({ ...ON, field: 'cr664_notes', value: 'hi' }, deps);
    expect(outcome.kind).toBe('update-failed');
    expect(deps.emitAudit).not.toHaveBeenCalled();
  });

  it('reports audit failure after the write', async () => {
    const deps = stubDeps({ emitAudit: vi.fn(async () => ({ success: false, error: 'audit sink down' })) });
    const outcome = await updateOrganizationField({ ...ON, field: 'cr664_notes', value: 'hi' }, deps);
    expect(outcome.kind).toBe('audit-failed');
  });
});

describe('makeOrgFieldSaver (InlineEdit bridge)', () => {
  it('resolves on success', async () => {
    const deps = stubDeps();
    const save = makeOrgFieldSaver({ organizationId: 'org-1', actor: ACTOR, deps, enabled: true })('cr664_industry');
    await expect(save('Manufacturing')).resolves.toBeUndefined();
  });

  it('rejects (rolls back) when disabled by default', async () => {
    const deps = stubDeps();
    const save = makeOrgFieldSaver({ organizationId: 'org-1', actor: ACTOR, deps })('cr664_industry');
    await expect(save('x')).rejects.toThrow(/disabled/i);
  });
});
