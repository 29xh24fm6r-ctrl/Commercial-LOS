import { describe, it, expect } from 'vitest';
import {
  persistCrmSpineRecords,
  requiredFieldsFor,
  isPersistableEntity,
  type CrmSpineWriteRequest,
} from './crmSalesforceSpinePersistenceAdapter';
import { CRM_SPINE_PERSISTENCE_ACK, type CrmSpineLiveGateConfig } from './crmSalesforceSpineLiveGates';
import type { CrmDataverseTransport, CrmTransportResult } from './crmLiveDataverseTransport';

/** Phase 193B — live CRM persistence adapter. */

const liveGate: CrmSpineLiveGateConfig = {
  livePersistenceEnabled: 'true',
  acknowledgement: CRM_SPINE_PERSISTENCE_ACK,
  targetEnvironmentPresent: true,
  operatorAuthorized: true,
};
const facts = [{ statement: 'operator entered', sourceLogicalName: null, sourceRecordId: null }];

function okTransport(): CrmDataverseTransport {
  return {
    createRecord: async (): Promise<CrmTransportResult> => ({ ok: true, id: 'new-1' }),
    updateRecord: async (): Promise<CrmTransportResult> => ({ ok: true, id: 'upd-1' }),
    readRecord: async (): Promise<CrmTransportResult> => ({ ok: true }),
    searchRecords: async (): Promise<CrmTransportResult> => ({ ok: true, records: [] }),
  };
}
const accountCreate: CrmSpineWriteRequest = { entity: 'account', fields: { cr664_name: 'Provided Org Name' }, sourceFacts: facts };

describe('entity mapping', () => {
  it('account/contact/relationship/coverage/activity/sourceFact are persistable; task/health/visibility are not', () => {
    for (const e of ['account', 'contact', 'accountContactRelationship', 'coverageTeamMember', 'dealRelationship', 'relationshipRole', 'activity', 'sourceFact'] as const) {
      expect(isPersistableEntity(e)).toBe(true);
    }
    for (const e of ['task', 'relationshipHealth', 'visibilityRequirement'] as const) {
      expect(isPersistableEntity(e)).toBe(false);
    }
    expect(requiredFieldsFor('account')).toContain('cr664_name');
  });
});

describe('dry-run never writes', () => {
  it('reports dry_run_only without a transport', async () => {
    const r = await persistCrmSpineRecords({ mode: 'dry-run', requests: [accountCreate], actor: 'op', correlationId: 'c1' });
    expect(r.executed).toBe(false);
    expect(r.results[0].outcome).toBe('dry_run_only');
    expect(r.results[0].audit.dryRun).toBe(true);
  });
});

describe('rejects missing required data', () => {
  it('skips a create with no primary name', async () => {
    const r = await persistCrmSpineRecords({ mode: 'dry-run', requests: [{ entity: 'account', fields: {}, sourceFacts: facts }], actor: 'op', correlationId: 'c2' });
    expect(r.results[0].outcome).toBe('skipped_missing_required_data');
    expect(r.results[0].error).toMatch(/cr664_name/);
  });
  it('skips a write with no source facts', async () => {
    const r = await persistCrmSpineRecords({ mode: 'dry-run', requests: [{ entity: 'account', fields: { cr664_name: 'X' }, sourceFacts: [] }], actor: 'op', correlationId: 'c3' });
    expect(r.results[0].outcome).toBe('skipped_missing_required_data');
    expect(r.results[0].error).toMatch(/sourceFacts/);
  });
  it('skips a non-persistable entity honestly', async () => {
    const r = await persistCrmSpineRecords({ mode: 'live', requests: [{ entity: 'task', fields: { cr664_name: 'T' }, sourceFacts: facts }], actor: 'op', correlationId: 'c4', gate: liveGate, transport: okTransport() });
    expect(r.results[0].outcome).toBe('skipped_missing_required_data');
    expect(r.results[0].error).toMatch(/derived\/policy/);
  });
});

describe('live mode is gated', () => {
  it('blocks every request when the gate is not satisfied', async () => {
    const r = await persistCrmSpineRecords({ mode: 'live', requests: [accountCreate], actor: 'op', correlationId: 'c5', transport: okTransport() });
    expect(r.executed).toBe(false);
    expect(r.results[0].outcome).toBe('blocked_gate_not_satisfied');
  });
  it('blocks when gate satisfied but no transport', async () => {
    const r = await persistCrmSpineRecords({ mode: 'live', requests: [accountCreate], actor: 'op', correlationId: 'c6', gate: liveGate });
    expect(r.results[0].outcome).toBe('blocked_gate_not_satisfied');
  });
  it('creates when gate satisfied + transport wired, with audit', async () => {
    const r = await persistCrmSpineRecords({ mode: 'live', requests: [accountCreate], actor: 'op', correlationId: 'c7', gate: liveGate, transport: okTransport() });
    expect(r.executed).toBe(true);
    expect(r.results[0].outcome).toBe('created');
    expect(r.results[0].recordId).toBe('new-1');
    expect(r.audit[0].actor).toBe('op');
    expect(r.audit[0].sourceFacts.length).toBe(1);
  });
  it('updates when a recordId is supplied (idempotent upsert)', async () => {
    const r = await persistCrmSpineRecords({ mode: 'live', requests: [{ entity: 'contact', recordId: 'p-1', fields: { cr664_name: 'Name' }, sourceFacts: facts }], actor: 'op', correlationId: 'c8', gate: liveGate, transport: okTransport() });
    expect(r.results[0].outcome).toBe('updated');
  });
  it('returns failed_dataverse when the transport rejects', async () => {
    const failing: CrmDataverseTransport = { ...okTransport(), createRecord: async () => ({ ok: false, error: 'dv_down' }) };
    const r = await persistCrmSpineRecords({ mode: 'live', requests: [accountCreate], actor: 'op', correlationId: 'c9', gate: liveGate, transport: failing });
    expect(r.results[0].outcome).toBe('failed_dataverse');
    expect(r.overallOutcome).toBe('failed_dataverse');
  });
  it('returns partial_success when one create succeeds and one is missing required data', async () => {
    const r = await persistCrmSpineRecords({ mode: 'live', requests: [accountCreate, { entity: 'contact', fields: {}, sourceFacts: facts }], actor: 'op', correlationId: 'c10', gate: liveGate, transport: okTransport() });
    expect(r.created).toBe(1);
    expect(r.skipped).toBe(1);
    expect(r.overallOutcome).toBe('partial_success');
  });
});
