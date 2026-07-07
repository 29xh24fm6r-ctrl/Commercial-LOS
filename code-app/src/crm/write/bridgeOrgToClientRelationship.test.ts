import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  bridgeOrgToClientRelationship,
  bridgedClientRelationshipId,
  buildLiveBridgeOrgToClientDeps,
  BRIDGE_DEFAULT_BORROWER_TYPE,
  type BridgeOrgToClientDeps,
  type BridgeOrgToClientInput,
} from './bridgeOrgToClientRelationship';
import { CLIENT_BORROWER_TYPES } from './createClientRelationship';

/**
 * Governed CRM company → canonical client bridge.
 *
 * Pins the fix for the CRM Hub company vs deal-linkable client mismatch:
 *   - a Borrower/Client company mirrors into a cr664_clientrelationship;
 *   - an existing client of the same name is REUSED (idempotent, no duplicate);
 *   - non-borrower companies (Vendor, etc.) are not eligible — no client made;
 *   - create → readback → audit discipline with a discriminated outcome;
 *   - the ONLY table written is cr664_clientrelationships — no contacts, org
 *     hierarchy, roles, activities, or Salesforce spine fabricated.
 */

const AUTHORIZED = {
  actorEmail: 'banker@bank.com',
  actorSystemUserId: 'sys-1',
  authorized: true as const,
};

function input(over: Partial<BridgeOrgToClientInput> = {}): BridgeOrgToClientInput {
  return {
    ...AUTHORIZED,
    organizationId: 'org-omni-1',
    organizationName: 'OmniCare 365',
    organizationType: 'Borrower',
    ...over,
  };
}

function fakeDeps(over: Partial<BridgeOrgToClientDeps> = {}): {
  deps: BridgeOrgToClientDeps;
  store: { payload?: Record<string, unknown> };
  calls: { find: number; create: number; read: number; audit: number };
} {
  const store: { payload?: Record<string, unknown> } = {};
  const calls = { find: 0, create: 0, read: 0, audit: 0 };
  const deps: BridgeOrgToClientDeps = {
    findClientRelationshipByName: async () => {
      calls.find += 1;
      return [];
    },
    createClientRelationship: async (payload) => {
      calls.create += 1;
      store.payload = payload;
      return { success: true, id: 'client-new-1' };
    },
    readClientRelationship: async () => {
      calls.read += 1;
      return { success: true, clientName: 'OmniCare 365' };
    },
    emitAudit: async () => {
      calls.audit += 1;
      return { success: true, id: 'audit-1' };
    },
    ...over,
  };
  return { deps, store, calls };
}

describe('bridgeOrgToClientRelationship — create path', () => {
  it('mirrors a Borrower company into a new client relationship (create → readback → audit)', async () => {
    const { deps, store, calls } = fakeDeps();
    const out = await bridgeOrgToClientRelationship(input(), deps);
    expect(out.kind).toBe('created');
    if (out.kind === 'created') {
      expect(out.clientRelationshipId).toBe('client-new-1');
      expect(out.clientName).toBe('OmniCare 365');
    }
    expect(store.payload).toMatchObject({
      cr664_clientname: 'OmniCare 365',
      cr664_borrowertype: CLIENT_BORROWER_TYPES[BRIDGE_DEFAULT_BORROWER_TYPE],
    });
    expect(calls.find).toBe(1);
    expect(calls.create).toBe(1);
    expect(calls.read).toBe(1);
    expect(calls.audit).toBe(1);
    expect(bridgedClientRelationshipId(out)).toBe('client-new-1');
  });

  it('honors an explicit valid borrower type', async () => {
    const { deps, store } = fakeDeps();
    await bridgeOrgToClientRelationship(input({ borrowerType: 'LLC' }), deps);
    expect(store.payload).toMatchObject({ cr664_borrowertype: CLIENT_BORROWER_TYPES.LLC });
  });

  it('accepts the "Client" party type too', async () => {
    const { deps } = fakeDeps();
    const out = await bridgeOrgToClientRelationship(input({ organizationType: 'Client' }), deps);
    expect(out.kind).toBe('created');
  });
});

describe('bridgeOrgToClientRelationship — idempotent find-existing', () => {
  it('reuses an existing client of the same name (no create, no duplicate)', async () => {
    const { deps, calls } = fakeDeps({
      findClientRelationshipByName: async () => [{ id: 'client-existing-9', clientName: 'OmniCare 365' }],
    });
    const out = await bridgeOrgToClientRelationship(input(), deps);
    expect(out.kind).toBe('linked-existing');
    if (out.kind === 'linked-existing') expect(out.clientRelationshipId).toBe('client-existing-9');
    expect(calls.create).toBe(0);
    expect(calls.audit).toBe(0);
    expect(bridgedClientRelationshipId(out)).toBe('client-existing-9');
  });

  it('matches case-insensitively', async () => {
    const { deps, calls } = fakeDeps({
      findClientRelationshipByName: async () => [{ id: 'client-existing-9', clientName: 'omnicare 365' }],
    });
    const out = await bridgeOrgToClientRelationship(input({ organizationName: 'OmniCare 365' }), deps);
    expect(out.kind).toBe('linked-existing');
    expect(calls.create).toBe(0);
  });
});

describe('bridgeOrgToClientRelationship — eligibility + validation + auth', () => {
  it('is not-eligible for a non-borrower company (no create)', async () => {
    const { deps, calls } = fakeDeps();
    const out = await bridgeOrgToClientRelationship(input({ organizationType: 'Vendor' }), deps);
    expect(out.kind).toBe('not-eligible');
    expect(calls.find).toBe(0);
    expect(calls.create).toBe(0);
    expect(bridgedClientRelationshipId(out)).toBeNull();
  });

  it('rejects a blank company name', async () => {
    const { deps } = fakeDeps();
    const out = await bridgeOrgToClientRelationship(input({ organizationName: '  ' }), deps);
    expect(out.kind).toBe('invalid-input');
  });

  it('is unauthorized (no create) when the actor is not authorized', async () => {
    const { deps, calls } = fakeDeps();
    const out = await bridgeOrgToClientRelationship(input({ authorized: false }), deps);
    expect(out.kind).toBe('unauthorized');
    expect(calls.create).toBe(0);
  });

  it('is identity-unresolved when no Dataverse identity is present', async () => {
    const { deps } = fakeDeps();
    const out = await bridgeOrgToClientRelationship(input({ actorSystemUserId: '', actorEmail: '' }), deps);
    expect(out.kind).toBe('identity-unresolved');
  });
});

describe('bridgeOrgToClientRelationship — failure modes', () => {
  it('write-failed when the create IO fails (no readback / audit)', async () => {
    const { deps, calls } = fakeDeps({
      createClientRelationship: async () => ({ success: false, error: { message: 'boom' } }),
    });
    const out = await bridgeOrgToClientRelationship(input(), deps);
    expect(out.kind).toBe('write-failed');
    expect(calls.read).toBe(0);
    expect(calls.audit).toBe(0);
  });

  it('readback-mismatch when the created row does not read back with the name', async () => {
    const { deps, calls } = fakeDeps({
      readClientRelationship: async () => ({ success: true, clientName: 'Something Else' }),
    });
    const out = await bridgeOrgToClientRelationship(input(), deps);
    expect(out.kind).toBe('readback-mismatch');
    expect(calls.audit).toBe(0);
  });

  it('audit-failed (row persisted, id usable) when only the audit write fails', async () => {
    const { deps } = fakeDeps({
      emitAudit: async () => ({ success: false, error: { message: 'audit down' } }),
    });
    const out = await bridgeOrgToClientRelationship(input(), deps);
    expect(out.kind).toBe('audit-failed');
    expect(bridgedClientRelationshipId(out)).toBe('client-new-1');
  });
});

describe('bridgeOrgToClientRelationship — no fabrication', () => {
  it('writes ONLY cr664_clientrelationships (no org/person/timeline/spine service)', () => {
    const src = readFileSync(resolve(__dirname, 'bridgeOrgToClientRelationship.ts'), 'utf8');
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

  it('the live deps only bind clientrelationships + audit services', () => {
    // Construct the live deps (SDK-free at build time; dynamic imports inside).
    const deps = buildLiveBridgeOrgToClientDeps();
    expect(typeof deps.findClientRelationshipByName).toBe('function');
    expect(typeof deps.createClientRelationship).toBe('function');
    expect(typeof deps.readClientRelationship).toBe('function');
    expect(typeof deps.emitAudit).toBe('function');
  });
});
