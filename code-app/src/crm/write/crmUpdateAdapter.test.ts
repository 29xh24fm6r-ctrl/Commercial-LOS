import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  updateOrganizationField,
  makeOrgFieldSaver,
  buildLiveCrmUpdateDeps,
  type CrmUpdateDeps,
} from './crmUpdateAdapter';
import { Cr664_crmorganizationsService } from '../../generated/services/Cr664_crmorganizationsService';
import { Cr664_crmauditentriesService } from '../../generated/services/Cr664_crmauditentriesService';

// Mock the generated services so buildLiveCrmUpdateDeps' dynamic imports resolve to controllable
// stubs — this is where the D1 "Boolean(result) reports failure as success" bug lived.
vi.mock('../../generated/services/Cr664_crmorganizationsService', () => ({
  Cr664_crmorganizationsService: { update: vi.fn(), get: vi.fn() },
}));
vi.mock('../../generated/services/Cr664_crmauditentriesService', () => ({
  Cr664_crmauditentriesService: { create: vi.fn() },
}));

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
  it('is ENABLED by default (identity-gated like creates); an explicit enabled:false fails closed', async () => {
    const deps = stubDeps();
    // Default (no enabled flag) rides the identity gate → writes.
    const ok = await updateOrganizationField({ ...ACTOR, organizationId: 'org-1', field: 'cr664_industry', value: 'x' }, deps);
    expect(ok.kind).toBe('success');
    expect(deps.updateOrganization).toHaveBeenCalledWith('org-1', { cr664_industry: 'x' });
    // A caller can still force the fail-closed path.
    const off = await updateOrganizationField({ ...ACTOR, organizationId: 'org-1', field: 'cr664_industry', value: 'x', enabled: false }, deps);
    expect(off.kind).toBe('disabled');
  });

  it('updates the Boolean tax-id-on-file flag, coercing the string to a boolean (the number is never stored)', async () => {
    const deps = stubDeps();
    const outcome = await updateOrganizationField({ ...ON, field: 'cr664_taxidpresent', value: 'true' }, deps);
    expect(outcome.kind).toBe('success');
    expect(deps.updateOrganization).toHaveBeenCalledWith('org-1', { cr664_taxidpresent: true });
  });

  it('rejects a non-boolean value for the on-file flag', async () => {
    const deps = stubDeps();
    expect((await updateOrganizationField({ ...ON, field: 'cr664_taxidpresent', value: 'maybe' }, deps)).kind).toBe('invalid-input');
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

  it('verifies the write via readback when a reader is injected (match → success, audit written)', async () => {
    const deps = stubDeps({ readOrganization: vi.fn(async () => ({ success: true, data: { cr664_notes: 'hi' } })) });
    const outcome = await updateOrganizationField({ ...ON, field: 'cr664_notes', value: 'hi' }, deps);
    expect(outcome.kind).toBe('success');
    expect(deps.readOrganization).toHaveBeenCalledWith('org-1');
    expect(deps.emitAudit).toHaveBeenCalled();
  });

  it('fails closed as readback-mismatch when the read-back value differs (audit NOT written)', async () => {
    const deps = stubDeps({ readOrganization: vi.fn(async () => ({ success: true, data: { cr664_notes: 'STALE' } })) });
    const outcome = await updateOrganizationField({ ...ON, field: 'cr664_notes', value: 'hi' }, deps);
    expect(outcome.kind).toBe('readback-mismatch');
    expect(deps.emitAudit).not.toHaveBeenCalled();
  });

  it('coerces booleans in the readback compare (taxidpresent true)', async () => {
    const deps = stubDeps({ readOrganization: vi.fn(async () => ({ success: true, data: { cr664_taxidpresent: true } })) });
    expect((await updateOrganizationField({ ...ON, field: 'cr664_taxidpresent', value: 'true' }, deps)).kind).toBe('success');
  });
});

describe('makeOrgFieldSaver (InlineEdit bridge)', () => {
  it('resolves on success', async () => {
    const deps = stubDeps();
    const save = makeOrgFieldSaver({ organizationId: 'org-1', actor: ACTOR, deps, enabled: true })('cr664_industry');
    await expect(save('Manufacturing')).resolves.toBeUndefined();
  });

  it('rejects (rolls back) when the caller forces disabled (enabled:false)', async () => {
    const deps = stubDeps();
    const save = makeOrgFieldSaver({ organizationId: 'org-1', actor: ACTOR, deps, enabled: false })('cr664_industry');
    await expect(save('x')).rejects.toThrow(/disabled/i);
  });
});

describe('buildLiveCrmUpdateDeps — maps the SDK IOperationResult honestly (D1 regression guard)', () => {
  const orgSvc = vi.mocked(Cr664_crmorganizationsService);
  const auditSvc = vi.mocked(Cr664_crmauditentriesService);
  beforeEach(() => vi.clearAllMocks());

  it('reports a Dataverse-rejected update as FAILURE, not success (this is the D1 bug)', async () => {
    orgSvc.update.mockResolvedValue({ success: false, error: { message: 'row locked' } } as never);
    const deps = buildLiveCrmUpdateDeps();
    // The dep must read result.success, NOT Boolean(result) (which is always true for an object).
    expect(await deps.updateOrganization('org-1', { cr664_notes: 'x' })).toEqual({ success: false, error: 'row locked' });
    // End-to-end: a failed live update yields update-failed, never a false "saved".
    const outcome = await updateOrganizationField({ ...ON, field: 'cr664_notes', value: 'x' }, deps);
    expect(outcome.kind).toBe('update-failed');
  });

  it('maps a successful update to success and reads the record back via get()', async () => {
    orgSvc.update.mockResolvedValue({ success: true, data: {} } as never);
    orgSvc.get.mockResolvedValue({ success: true, data: { cr664_notes: 'x' } } as never);
    const deps = buildLiveCrmUpdateDeps();
    expect(await deps.updateOrganization('org-1', { cr664_notes: 'x' })).toEqual({ success: true, error: undefined });
    expect(await deps.readOrganization!('org-1')).toEqual({ success: true, data: { cr664_notes: 'x' }, error: undefined });
  });

  it('extracts the audit id on success and surfaces a failed audit honestly', async () => {
    auditSvc.create.mockResolvedValueOnce({ success: true, data: { cr664_crmauditentryid: 'aud-9' } } as never);
    const deps = buildLiveCrmUpdateDeps();
    expect(await deps.emitAudit({})).toEqual({ success: true, id: 'aud-9', error: undefined });
    auditSvc.create.mockResolvedValueOnce({ success: false, error: { message: 'sink down' } } as never);
    expect(await deps.emitAudit({})).toEqual({ success: false, id: undefined, error: 'sink down' });
  });
});
