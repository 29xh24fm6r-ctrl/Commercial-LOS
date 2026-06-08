import { describe, it, expect } from 'vitest';
import {
  createCrmLiveDataverseAdapter,
  createDisabledCrmLiveDataverseAdapter,
} from './crmLiveDataverseAdapter';
import { deriveCrmFeatureFlagState } from './crmFeatureFlags';
import type { CrmDataverseTransport, CrmTransportResult } from './crmLiveDataverseTransport';
import type { CrmRuntimeSchemaGateResult } from './crmRuntimeSchemaGate';
import type { CrmOrganization } from '../shared/crm/crmTypes';

/**
 * Phase 141L — CRM live adapter pins.
 *
 * Disabled by default; fail-closed gate order (flag → schema → transport →
 * authorization); every write targets ONLY its `cr664_crm*` entity set; there is
 * no delete; raw tax ids are blocked.
 */

interface Call { method: string; entitySet: string }

function recordingTransport(calls: Call[]): CrmDataverseTransport {
  const ok: CrmTransportResult = { ok: true, id: 'new-id' };
  return {
    createRecord: async (entitySet) => { calls.push({ method: 'create', entitySet }); return ok; },
    updateRecord: async (entitySet) => { calls.push({ method: 'update', entitySet }); return { ok: true }; },
    readRecord: async (entitySet) => { calls.push({ method: 'read', entitySet }); return { ok: true, record: {} }; },
    searchRecords: async (entitySet) => { calls.push({ method: 'search', entitySet }); return { ok: true, records: [] }; },
  };
}

const READY_GATE: CrmRuntimeSchemaGateResult = {
  schemaReady: true,
  livePersistenceEnabled: true,
  canCreate: true,
  canUpdate: true,
  canRead: true,
  canSearch: true,
  blockers: [],
  warnings: [],
};

const LIVE_FLAGS = deriveCrmFeatureFlagState({ livePersistenceEnabled: true });

function liveAdapter(calls: Call[], over: Partial<Parameters<typeof createCrmLiveDataverseAdapter>[0]> = {}) {
  return createCrmLiveDataverseAdapter({
    transport: recordingTransport(calls),
    featureFlags: LIVE_FLAGS,
    schemaGate: READY_GATE,
    authorization: { isAuthorizedOperator: true },
    ...over,
  });
}

const ORG: CrmOrganization = { orgId: 'ORG1', legalName: 'Synthetic Org', orgType: 'customer', status: 'active' };

describe('Phase 141L — live adapter fail-closed gates', () => {
  it('the disabled flag blocks writes', async () => {
    const a = liveAdapter([], { featureFlags: deriveCrmFeatureFlagState({ livePersistenceEnabled: false }) });
    const r = await a.saveOrganization(ORG);
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe('crm_live_persistence_disabled');
  });

  it('a not-ready schema blocks writes', async () => {
    const a = liveAdapter([], { schemaGate: { ...READY_GATE, schemaReady: false } });
    const r = await a.saveOrganization(ORG);
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe('crm_schema_not_ready');
  });

  it('a missing transport blocks writes', async () => {
    const a = createCrmLiveDataverseAdapter({
      transport: undefined,
      featureFlags: LIVE_FLAGS,
      schemaGate: READY_GATE,
      authorization: { isAuthorizedOperator: true },
    });
    const r = await a.saveOrganization(ORG);
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe('crm_persistence_not_configured');
  });

  it('a denied authorization blocks writes', async () => {
    const a = liveAdapter([], { authorization: { isAuthorizedOperator: false } });
    const r = await a.saveOrganization(ORG);
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe('crm_permission_denied');
  });

  it('a raw tax id is blocked', async () => {
    const calls: Call[] = [];
    const a = liveAdapter(calls);
    const r = await a.saveOrganization({ ...ORG, taxId: '12-3456789' } as unknown as CrmOrganization);
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe('crm_sensitive_value_blocked');
    expect(calls).toEqual([]);
  });
});

describe('Phase 141L — every write targets only its CRM entity set', () => {
  const cases: { name: string; run: (a: ReturnType<typeof liveAdapter>) => Promise<unknown>; set: string }[] = [
    { name: 'saveOrganization', run: (a) => a.saveOrganization(ORG), set: 'cr664_crmorganizations' },
    { name: 'savePerson', run: (a) => a.savePerson({ personId: 'P1', personType: 'other', status: 'active' }), set: 'cr664_crmpersons' },
    { name: 'saveContactPoint', run: (a) => a.saveContactPoint({ contactPointId: 'CP1', ownerType: 'person', ownerId: 'P1', channel: 'email' }), set: 'cr664_crmcontactpoints' },
    { name: 'saveRelationship', run: (a) => a.saveRelationship({ relationshipId: 'R1', fromEntityType: 'organization', fromEntityId: 'ORG1', toEntityType: 'person', toEntityId: 'P1', relationshipType: 'borrower' }), set: 'cr664_crmrelationships' },
    { name: 'saveContactAuthorization', run: (a) => a.saveContactAuthorization({ authId: 'A1', personId: 'P1', authType: 'document_upload' }), set: 'cr664_crmcontactauthorizations' },
    { name: 'addTimelineEvent', run: (a) => a.addTimelineEvent({ eventId: 'E1', entityType: 'organization', entityId: 'ORG1', eventType: 'note' }), set: 'cr664_crmtimelineevents' },
    { name: 'addAuditEntry', run: (a) => a.addAuditEntry({ action: 'update', timestamp: '2026-06-08T00:00:00Z' }), set: 'cr664_crmauditentries' },
  ];

  for (const c of cases) {
    it(`${c.name} calls only ${c.set}`, async () => {
      const calls: Call[] = [];
      const a = liveAdapter(calls);
      const r = await c.run(a);
      expect((r as { ok: boolean }).ok).toBe(true);
      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual({ method: 'create', entitySet: c.set });
    });
  }
});

describe('Phase 141L — disabled live adapter + no delete', () => {
  it('the disabled live adapter fails closed on every write with not_configured', async () => {
    const a = createDisabledCrmLiveDataverseAdapter();
    expect(a.enabled).toBe(false);
    const r = await a.saveOrganization(ORG);
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe('crm_persistence_not_configured');
    const read = await a.searchOrganizations();
    expect(read.ok).toBe(false);
  });

  it('the adapter exposes no delete operation', () => {
    const a = liveAdapter([]);
    expect((a as unknown as Record<string, unknown>).deleteOrganization).toBeUndefined();
    expect((a as unknown as Record<string, unknown>).delete).toBeUndefined();
    expect((a as unknown as Record<string, unknown>).deleteRecord).toBeUndefined();
  });
});
