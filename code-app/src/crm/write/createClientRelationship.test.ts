import { describe, it, expect } from 'vitest';
import {
  createClientRelationship,
  buildLiveCreateClientRelationshipDeps,
  CREATE_CLIENT_RELATIONSHIP_ENABLED,
  CLIENT_BORROWER_TYPES,
  type CreateClientRelationshipDeps,
  type CreateClientRelationshipInput,
} from './createClientRelationship';

/**
 * Governed "create CRM client relationship" workflow.
 *
 * Pins:
 *   - disabled by default (no IO until an explicit certified enablement);
 *   - fail-closed authorization + required-field validation (name + type);
 *   - create -> readback -> audit ordering (readback proves persistence);
 *   - the ONLY table it writes is cr664_clientrelationships — no fabricated
 *     contacts / organizations / roles / activities / spine records.
 */

const AUTHORIZED = {
  actorEmail: 'banker@bank.com',
  actorSystemUserId: 'sys-1',
  authorized: true as const,
};

function input(over: Partial<CreateClientRelationshipInput> = {}): CreateClientRelationshipInput {
  return { ...AUTHORIZED, clientName: 'Acme Holdings LLC', borrowerType: 'LLC', ...over };
}

function fakeDeps(over: Partial<CreateClientRelationshipDeps> = {}): {
  deps: CreateClientRelationshipDeps;
  store: { payload?: Record<string, unknown> };
  calls: { create: number; read: number; audit: number };
} {
  const store: { payload?: Record<string, unknown> } = {};
  const calls = { create: 0, read: 0, audit: 0 };
  const deps: CreateClientRelationshipDeps = {
    enabled: true,
    createClientRelationship: async (payload) => {
      calls.create += 1;
      store.payload = payload;
      return { success: true, id: 'client-new-1' };
    },
    readClientRelationship: async () => {
      calls.read += 1;
      return { success: true, clientName: 'Acme Holdings LLC' };
    },
    emitAudit: async () => {
      calls.audit += 1;
      return { success: true, id: 'audit-1' };
    },
    ...over,
  };
  return { deps, store, calls };
}

describe('createClientRelationship — disabled posture', () => {
  it('the feature flag constant is hard false', () => {
    expect(CREATE_CLIENT_RELATIONSHIP_ENABLED).toBe(false);
  });

  it('the live deps carry enabled:false and refuse before any IO', async () => {
    const live = buildLiveCreateClientRelationshipDeps();
    expect(live.enabled).toBe(false);
    const out = await createClientRelationship(input(), live);
    expect(out.kind).toBe('disabled');
  });

  it('refuses with disabled when the gate is off (no create)', async () => {
    const { deps, calls } = fakeDeps({ enabled: false });
    const out = await createClientRelationship(input(), deps);
    expect(out.kind).toBe('disabled');
    expect(calls.create).toBe(0);
  });
});

describe('createClientRelationship — validation + authorization', () => {
  it('rejects a blank client name without writing', async () => {
    const { deps, calls } = fakeDeps();
    const out = await createClientRelationship(input({ clientName: '  ' }), deps);
    expect(out.kind).toBe('invalid-input');
    expect(calls.create).toBe(0);
  });

  it('rejects an off-list borrower type', async () => {
    const { deps, calls } = fakeDeps();
    const out = await createClientRelationship(input({ borrowerType: 'Cyborg' }), deps);
    expect(out.kind).toBe('invalid-input');
    expect(calls.create).toBe(0);
  });

  it('is unauthorized (no write) when the actor is not authorized', async () => {
    const { deps, calls } = fakeDeps();
    const out = await createClientRelationship(input({ authorized: false }), deps);
    expect(out.kind).toBe('unauthorized');
    expect(calls.create).toBe(0);
  });

  it('is identity-unresolved when no Dataverse identity is present', async () => {
    const { deps, calls } = fakeDeps();
    const out = await createClientRelationship(input({ actorSystemUserId: '', actorEmail: '' }), deps);
    expect(out.kind).toBe('identity-unresolved');
    expect(calls.create).toBe(0);
  });
});

describe('createClientRelationship — success + readback + audit', () => {
  it('creates, reads back, audits, and returns the new id (correct payload)', async () => {
    const { deps, store, calls } = fakeDeps();
    const out = await createClientRelationship(input({ industry: 'Manufacturing' }), deps);
    expect(out.kind).toBe('success');
    if (out.kind === 'success') {
      expect(out.id).toBe('client-new-1');
      expect(out.clientName).toBe('Acme Holdings LLC');
    }
    expect(store.payload).toMatchObject({
      cr664_clientname: 'Acme Holdings LLC',
      cr664_borrowertype: CLIENT_BORROWER_TYPES.LLC,
      cr664_industry: 'Manufacturing',
    });
    expect(calls.create).toBe(1);
    expect(calls.read).toBe(1);
    expect(calls.audit).toBe(1);
  });

  it('returns readback-mismatch when the created row does not read back with the name', async () => {
    const { deps, calls } = fakeDeps({
      readClientRelationship: async () => ({ success: true, clientName: 'Something Else' }),
    });
    const out = await createClientRelationship(input(), deps);
    expect(out.kind).toBe('readback-mismatch');
    expect(calls.audit).toBe(0);
  });

  it('returns write-failed when the create IO fails (no readback / audit), mapped to the shared business-safe message', async () => {
    const { deps, calls } = fakeDeps({
      createClientRelationship: async () => ({ success: false, error: { message: 'boom' } }),
    });
    const out = await createClientRelationship(input(), deps);
    expect(out.kind).toBe('write-failed');
    if (out.kind === 'write-failed') {
      expect(out.error).not.toContain('boom');
      expect(out.error).toContain("We couldn't save that action");
    }
    expect(calls.read).toBe(0);
    expect(calls.audit).toBe(0);
  });

  it('returns audit-failed (row persisted) when only the audit write fails', async () => {
    const { deps } = fakeDeps({
      emitAudit: async () => ({ success: false, error: { message: 'audit down' } }),
    });
    const out = await createClientRelationship(input(), deps);
    expect(out.kind).toBe('audit-failed');
    if (out.kind === 'audit-failed') expect(out.auditError).toBe('audit down');
  });
});

describe('createClientRelationship — no fabrication', () => {
  it('the source writes ONLY cr664_clientrelationships (no org/person/timeline/spine creates)', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const src = readFileSync(resolve(__dirname, 'createClientRelationship.ts'), 'utf8');
    // The only generated service imported for a create is the client-relationship one.
    expect(src).toContain('Cr664_clientrelationshipsService');
    for (const forbidden of [
      'Cr664_crmorganizationsService',
      'Cr664_crmpersonsService',
      'Cr664_crmtimelineeventsService',
      'Cr664_crmrelationshipsService',
      'Cr664_crmcontactpointsService',
    ]) {
      expect(src).not.toContain(forbidden);
    }
  });
});
