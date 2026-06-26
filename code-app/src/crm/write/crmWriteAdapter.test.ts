import { describe, it, expect, vi } from 'vitest';
import {
  addCompany,
  addContact,
  logActivity,
  createFollowUpTask,
  addRelationship,
  type CrmWriteDeps,
} from './crmWriteAdapter';

/**
 * Phase 261 (B) — governed CRM writes: payload shape, readback verification,
 * audit emission, fail-closed authorization/identity, and best-effort contact
 * points.
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

describe('addCompany', () => {
  it('creates the organization, verifies readback, and writes an audit', async () => {
    const deps = stubDeps();
    const outcome = await addCompany({ ...ACTOR, name: 'Acme Holdings', organizationType: 'Borrower', industry: 'Manufacturing' }, deps);
    expect(outcome.kind).toBe('success');
    const payload = (deps.createOrganization as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload.cr664_name).toBe('Acme Holdings');
    expect(payload.cr664_organizationtype).toBe('Borrower');
    expect(deps.readOrganization).toHaveBeenCalledTimes(1);
    const audit = (deps.emitAudit as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(audit.cr664_action).toBe('crm-add-company');
    expect(audit.cr664_entitytype).toBe('organization');
    expect(audit.cr664_actor).toBe('banker@bank.test');
  });

  it('rejects a blank name as invalid-input (no write)', async () => {
    const deps = stubDeps();
    const outcome = await addCompany({ ...ACTOR, name: '  ' }, deps);
    expect(outcome.kind).toBe('invalid-input');
    expect(deps.createOrganization).not.toHaveBeenCalled();
  });

  it('fails closed when unauthorized', async () => {
    const deps = stubDeps();
    const outcome = await addCompany({ ...ACTOR, authorized: false, name: 'Acme' }, deps);
    expect(outcome.kind).toBe('unauthorized');
    expect(deps.createOrganization).not.toHaveBeenCalled();
  });

  it('fails closed when no Dataverse identity is resolved', async () => {
    const deps = stubDeps();
    const outcome = await addCompany({ authorized: true, actorEmail: undefined, actorSystemUserId: undefined, name: 'Acme' }, deps);
    expect(outcome.kind).toBe('identity-unresolved');
  });

  it('reports readback-mismatch when the record cannot be verified', async () => {
    const deps = stubDeps({ readOrganization: vi.fn(async () => ({ success: true, data: { cr664_name: '' } })) });
    const outcome = await addCompany({ ...ACTOR, name: 'Acme' }, deps);
    expect(outcome.kind).toBe('readback-mismatch');
  });

  it('reports audit-failed (record created but audit could not be written)', async () => {
    const deps = stubDeps({ emitAudit: vi.fn(async () => ({ success: false, error: { message: 'audit down' } })) });
    const outcome = await addCompany({ ...ACTOR, name: 'Acme' }, deps);
    expect(outcome.kind).toBe('audit-failed');
    if (outcome.kind === 'audit-failed') expect(outcome.id).toBe('new-id');
  });
});

describe('addContact', () => {
  it('derives a name from first/last, binds employer, and creates email/phone contact points', async () => {
    const deps = stubDeps();
    const outcome = await addContact(
      { ...ACTOR, firstName: 'Dana', lastName: 'Lee', title: 'CFO', employerOrganizationId: 'org-1', email: 'dana@acme.test', phone: '555-1212' },
      deps,
    );
    expect(outcome.kind).toBe('success');
    const payload = (deps.createPerson as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload.cr664_name).toBe('Dana Lee');
    expect(payload['cr664_EmployerOrganization@odata.bind']).toBe('/cr664_crmorganizations(org-1)');
    // Two contact points (email + phone), each bound to the new person.
    expect((deps.createContactPoint as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(2);
    const cp = (deps.createContactPoint as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(cp['cr664_Person@odata.bind']).toBe('/cr664_crmpersons(new-id)');
  });

  it('surfaces a contact-point failure without failing the contact (child error reported)', async () => {
    const deps = stubDeps({ createContactPoint: vi.fn(async () => ({ success: false, error: { message: 'cp down' } })) });
    const outcome = await addContact({ ...ACTOR, fullName: 'Sam Borrower', email: 'sam@x.test' }, deps);
    expect(outcome.kind).toBe('success');
    if (outcome.kind === 'success') {
      expect(outcome.childErrors).toHaveLength(1);
      expect(outcome.childErrors[0].kind).toBe('contact-point-email');
    }
  });

  it('rejects a contact with no name', async () => {
    const outcome = await addContact({ ...ACTOR, title: 'CFO' }, stubDeps());
    expect(outcome.kind).toBe('invalid-input');
  });
});

describe('logActivity', () => {
  it('writes a typed timeline event with summary, occurredAt, and links', async () => {
    const deps = stubDeps();
    const outcome = await logActivity(
      { ...ACTOR, activityType: 'call', summary: 'Discussed renewal terms', organizationId: 'org-1', personId: 'p-1', outcome: 'Positive', nextFollowUpDate: '2026-07-10' },
      deps,
    );
    expect(outcome.kind).toBe('success');
    const payload = (deps.createTimelineEvent as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload.cr664_eventtype).toBe('call');
    expect(payload.cr664_summary).toBe('Discussed renewal terms');
    expect(payload['cr664_Organization@odata.bind']).toBe('/cr664_crmorganizations(org-1)');
    expect(String(payload.cr664_notes)).toMatch(/Outcome: Positive/);
    expect(String(payload.cr664_notes)).toMatch(/Next follow-up: 2026-07-10/);
    expect((deps.emitAudit as ReturnType<typeof vi.fn>).mock.calls[0][0].cr664_action).toBe('crm-log-activity');
  });

  it('requires a summary', async () => {
    const outcome = await logActivity({ ...ACTOR, activityType: 'note', summary: '' }, stubDeps());
    expect(outcome.kind).toBe('invalid-input');
  });
});

describe('createFollowUpTask', () => {
  it('creates a follow-up-task timeline event with the due date as occurredat', async () => {
    const deps = stubDeps();
    const outcome = await createFollowUpTask({ ...ACTOR, title: 'Send term sheet', dueDate: '2026-07-15', personId: 'p-1' }, deps);
    expect(outcome.kind).toBe('success');
    const payload = (deps.createTimelineEvent as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload.cr664_eventtype).toBe('follow-up-task');
    expect(payload.cr664_occurredat).toBe('2026-07-15');
    expect(payload['cr664_Person@odata.bind']).toBe('/cr664_crmpersons(p-1)');
    expect((deps.emitAudit as ReturnType<typeof vi.fn>).mock.calls[0][0].cr664_action).toBe('crm-create-followup-task');
  });

  it('requires a title', async () => {
    expect((await createFollowUpTask({ ...ACTOR, title: '' }, stubDeps())).kind).toBe('invalid-input');
  });
});

describe('addRelationship', () => {
  it('writes a relationship with source/target binds and audit', async () => {
    const deps = stubDeps();
    const outcome = await addRelationship(
      { ...ACTOR, name: 'Acme ↔ Dana (Owner)', relationshipType: 'owner', sourceOrganizationId: 'org-1', targetPersonId: 'p-1' },
      deps,
    );
    expect(outcome.kind).toBe('success');
    const payload = (deps.createRelationship as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload['cr664_SourceOrganization@odata.bind']).toBe('/cr664_crmorganizations(org-1)');
    expect(payload['cr664_TargetPerson@odata.bind']).toBe('/cr664_crmpersons(p-1)');
    expect(payload.cr664_active).toBe(true);
    expect((deps.emitAudit as ReturnType<typeof vi.fn>).mock.calls[0][0].cr664_entitytype).toBe('relationship');
  });
});
