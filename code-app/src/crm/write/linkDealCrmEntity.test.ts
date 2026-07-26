import { describe, it, expect } from 'vitest';
import {
  linkDealCrmEntity,
  DEAL_CRM_LINK_TARGETS,
  type LinkDealCrmEntityDeps,
  type LinkDealCrmEntityInput,
} from './linkDealCrmEntity';

/**
 * Governed deal → CRM entity link write.
 *
 * Pins the governance discipline:
 *   - fail-closed authorization (unauthorized / identity-unresolved);
 *   - required-input validation;
 *   - the deal lookup is bound to EXACTLY the selected record;
 *   - the write is read back and must match (readback proves the link);
 *   - a CRM audit entry is emitted with the correlation id;
 *   - no write happens before the auth gate passes.
 */

const AUTHORIZED = {
  actorEmail: 'banker@bank.com',
  actorSystemUserId: 'sys-1',
  authorized: true as const,
};

function clientInput(over: Partial<LinkDealCrmEntityInput> = {}): LinkDealCrmEntityInput {
  return {
    ...AUTHORIZED,
    dealId: 'deal-1',
    target: 'client',
    entityId: 'client-guid-1',
    entityName: 'Acme Holdings LLC',
    ...over,
  };
}

/** Deps that persist the link into an in-memory store and read it back. */
function fakeDeps(over: Partial<LinkDealCrmEntityDeps> = {}): {
  deps: LinkDealCrmEntityDeps;
  store: { linked: Record<string, string | undefined> };
  calls: { update: number; read: number; audit: number };
  updateArgs: Array<{ dealId: string; bindProperty: string; targetTable: string; entityId: string }>;
  auditPayloads: Array<Record<string, unknown>>;
} {
  const store = { linked: {} as Record<string, string | undefined> };
  const calls = { update: 0, read: 0, audit: 0 };
  const updateArgs: Array<{ dealId: string; bindProperty: string; targetTable: string; entityId: string }> = [];
  const auditPayloads: Array<Record<string, unknown>> = [];
  const deps: LinkDealCrmEntityDeps = {
    updateDealLink: async (args) => {
      calls.update += 1;
      updateArgs.push(args);
      // Persist the just-linked entity so readDealLink can prove the link.
      store.linked.__last = args.entityId;
      return { success: true, id: args.dealId };
    },
    readDealLink: async () => {
      calls.read += 1;
      return { success: true, linkedId: store.linked.__last };
    },
    emitAudit: async (payload) => {
      calls.audit += 1;
      auditPayloads.push(payload);
      return { success: true, id: 'audit-1' };
    },
    ...over,
  };
  return { deps, store, calls, updateArgs, auditPayloads };
}

describe('linkDealCrmEntity — target config', () => {
  it('binds the client lookup to cr664_clientrelationships and reads back _cr664_client_value', () => {
    expect(DEAL_CRM_LINK_TARGETS.client.bindProperty).toBe('cr664_Client@odata.bind');
    expect(DEAL_CRM_LINK_TARGETS.client.targetTable).toBe('cr664_clientrelationships');
    expect(DEAL_CRM_LINK_TARGETS.client.readbackValueField).toBe('_cr664_client_value');
  });
  it('binds the team lookup to cr664_teams and reads back _cr664_team_value', () => {
    expect(DEAL_CRM_LINK_TARGETS.team.bindProperty).toBe('cr664_Team@odata.bind');
    expect(DEAL_CRM_LINK_TARGETS.team.targetTable).toBe('cr664_teams');
    expect(DEAL_CRM_LINK_TARGETS.team.readbackValueField).toBe('_cr664_team_value');
  });
});

describe('linkDealCrmEntity — authorization (fail-closed)', () => {
  it('returns unauthorized and performs NO write when the actor is not authorized', async () => {
    const { deps, calls } = fakeDeps();
    const out = await linkDealCrmEntity(clientInput({ authorized: false }), deps);
    expect(out.kind).toBe('unauthorized');
    expect(calls.update).toBe(0);
    expect(calls.audit).toBe(0);
  });

  it('returns identity-unresolved when there is no Dataverse identity', async () => {
    const { deps, calls } = fakeDeps();
    const out = await linkDealCrmEntity(
      clientInput({ actorSystemUserId: '', actorEmail: '' }),
      deps,
    );
    expect(out.kind).toBe('identity-unresolved');
    expect(calls.update).toBe(0);
  });
});

describe('linkDealCrmEntity — validation', () => {
  it('rejects a missing entity selection without writing', async () => {
    const { deps, calls } = fakeDeps();
    const out = await linkDealCrmEntity(clientInput({ entityId: '   ' }), deps);
    expect(out.kind).toBe('invalid-input');
    expect(calls.update).toBe(0);
  });

  it('rejects a missing deal id', async () => {
    const { deps } = fakeDeps();
    const out = await linkDealCrmEntity(clientInput({ dealId: '' }), deps);
    expect(out.kind).toBe('invalid-input');
  });
});

describe('linkDealCrmEntity — success + readback', () => {
  it('links the client, binds the correct lookup, and reads the link back', async () => {
    const { deps, calls, updateArgs } = fakeDeps();
    const out = await linkDealCrmEntity(clientInput(), deps);
    expect(out.kind).toBe('success');
    if (out.kind === 'success') {
      expect(out.entityId).toBe('client-guid-1');
      expect(out.entityName).toBe('Acme Holdings LLC');
      expect(out.correlationId).toBeTruthy();
    }
    // Bound to the client relationship table via the client lookup.
    expect(updateArgs[0].bindProperty).toBe('cr664_Client@odata.bind');
    expect(updateArgs[0].targetTable).toBe('cr664_clientrelationships');
    expect(updateArgs[0].entityId).toBe('client-guid-1');
    // Order: update → readback → audit.
    expect(calls.update).toBe(1);
    expect(calls.read).toBe(1);
    expect(calls.audit).toBe(1);
  });

  it('links a team via the same mechanism', async () => {
    const { deps, updateArgs } = fakeDeps();
    const out = await linkDealCrmEntity(
      clientInput({ target: 'team', entityId: 'team-guid-1', entityName: 'Commercial East' }),
      deps,
    );
    expect(out.kind).toBe('success');
    expect(updateArgs[0].bindProperty).toBe('cr664_Team@odata.bind');
    expect(updateArgs[0].targetTable).toBe('cr664_teams');
  });

  it('emits an audit entry that carries the correlation id', async () => {
    const { deps, auditPayloads } = fakeDeps();
    const out = await linkDealCrmEntity(clientInput(), deps);
    expect(out.kind).toBe('success');
    expect(auditPayloads).toHaveLength(1);
    const reason = String(auditPayloads[0].cr664_reason ?? '');
    if (out.kind === 'success') {
      expect(reason).toContain(out.correlationId);
    }
    expect(String(auditPayloads[0].cr664_action)).toBe('crm-link-deal-client');
  });

  it('tolerates GUID casing differences between the write and the readback', async () => {
    const deps: LinkDealCrmEntityDeps = {
      updateDealLink: async () => ({ success: true, id: 'deal-1' }),
      // Dataverse returns the value lowercased; the caller selected upper-case.
      readDealLink: async () => ({ success: true, linkedId: 'abc-123' }),
      emitAudit: async () => ({ success: true, id: 'audit-1' }),
    };
    const out = await linkDealCrmEntity(clientInput({ entityId: 'ABC-123' }), deps);
    expect(out.kind).toBe('success');
  });
});

describe('linkDealCrmEntity — failure modes', () => {
  it('returns write-failed when the update does not succeed (no audit)', async () => {
    let audits = 0;
    const deps: LinkDealCrmEntityDeps = {
      updateDealLink: async () => ({ success: false, error: { message: 'boom' } }),
      readDealLink: async () => ({ success: true, linkedId: 'client-guid-1' }),
      emitAudit: async () => {
        audits += 1;
        return { success: true, id: 'a' };
      },
    };
    const out = await linkDealCrmEntity(clientInput(), deps);
    expect(out.kind).toBe('write-failed');
    expect(audits).toBe(0);
  });

  it('returns readback-mismatch when the deal does not read back as linked (no audit)', async () => {
    let audits = 0;
    const deps: LinkDealCrmEntityDeps = {
      updateDealLink: async () => ({ success: true, id: 'deal-1' }),
      readDealLink: async () => ({ success: true, linkedId: 'some-other-guid' }),
      emitAudit: async () => {
        audits += 1;
        return { success: true, id: 'a' };
      },
    };
    const out = await linkDealCrmEntity(clientInput(), deps);
    expect(out.kind).toBe('readback-mismatch');
    expect(audits).toBe(0);
  });

  it('returns readback-mismatch when the readback lookup is blank', async () => {
    const deps: LinkDealCrmEntityDeps = {
      updateDealLink: async () => ({ success: true, id: 'deal-1' }),
      readDealLink: async () => ({ success: true, linkedId: undefined }),
      emitAudit: async () => ({ success: true, id: 'a' }),
    };
    const out = await linkDealCrmEntity(clientInput(), deps);
    expect(out.kind).toBe('readback-mismatch');
  });

  it('returns audit-failed (link persisted) when only the audit write fails', async () => {
    const deps: LinkDealCrmEntityDeps = {
      updateDealLink: async () => ({ success: true, id: 'deal-1' }),
      readDealLink: async () => ({ success: true, linkedId: 'client-guid-1' }),
      emitAudit: async () => ({ success: false, error: { message: 'audit down' } }),
    };
    const out = await linkDealCrmEntity(clientInput(), deps);
    expect(out.kind).toBe('audit-failed');
    // PR A remediation — the raw transport error ("audit down") must never reach the banker;
    // only the mapped, business-safe message does (see LinkDealCrmEntityModal.tsx's rendering).
    if (out.kind === 'audit-failed') {
      expect(out.auditError).not.toBe('audit down');
      expect(out.auditError).toMatch(/couldn't save that action/i);
    }
  });
});
