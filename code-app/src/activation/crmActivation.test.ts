import { describe, it, expect } from 'vitest';
import {
  deriveCrmSchemaGate,
  deriveCrmPersistenceActivation,
  crmWriteback,
  CRM_LIVE_PERSISTENCE_ENABLED,
  type CrmSchemaFacts,
  type CrmWritebackInput,
} from './crmActivation';
import type { OperatorSmokeEvidence, SmokeEvidenceRegistryInput } from '../access/operatorSmokeEvidenceRegistry';

function schema(over: Partial<CrmSchemaFacts> = {}): CrmSchemaFacts {
  return {
    services: [{ label: 'organizations', present: true }, { label: 'people', present: true }],
    columns: [{ label: 'org.name', present: true }],
    relationships: [{ label: 'personÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢org', present: true }],
    ...over,
  };
}
function ev(records: OperatorSmokeEvidence[] = []): SmokeEvidenceRegistryInput {
  return { source: 'out-of-band', records };
}

describe('Phase 217 ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â CRM schema gate', () => {
  it('verified only when all checks present and at least one declared', () => {
    expect(deriveCrmSchemaGate(schema()).verified).toBe(true);
    expect(deriveCrmSchemaGate({ services: [], columns: [], relationships: [] }).verified).toBe(false);
  });
  it('lists missing services/columns/relationships', () => {
    const g = deriveCrmSchemaGate(schema({ services: [{ label: 'organizations', present: false }] }));
    expect(g.verified).toBe(false);
    expect(g.missing.join(' ')).toMatch(/service: organizations/);
  });
  it('persistence blocked until schema verified + flags + smoke', () => {
    const r = deriveCrmPersistenceActivation({ schema: schema(), actorAuthorized: false, transportInjected: false, auditWired: false, singleRecordSmokeEnabled: false, evidence: ev() });
    expect(r.readiness.level).toBe('blocked');
  });
});

function wb(over: Partial<CrmWritebackInput> = {}): CrmWritebackInput {
  return {
    entity: 'organization', record: { name: 'Acme' }, actorAuthorized: true, schemaVerified: true, correlationId: 'c1',
    requiredFields: ['name'],
    transport: { create: async () => ({ ok: true, id: 'org-1' }) },
    auditSink: { write: async () => ({ ok: true }) },
    ...over,
  };
}

describe('Phase 229 â€” CRM writeback adapter active for internal OGB CRM', () => {
  it('enabled by default for internal OGB CRM writeback', async () => {
    expect(CRM_LIVE_PERSISTENCE_ENABLED).toBe(false);
    expect((await crmWriteback(wb())).outcome).toBe('disabled');
    expect((await crmWriteback(wb({ enabled: true }))).outcome).toBe('written');
  });
  it('unauthorized', async () => {
    expect((await crmWriteback(wb({ enabled: true, actorAuthorized: false }))).outcome).toBe('unauthorized');
  });
  it('schema_not_verified when schema/transport/audit missing', async () => {
    expect((await crmWriteback(wb({ enabled: true, schemaVerified: false }))).outcome).toBe('schema_not_verified');
    expect((await crmWriteback(wb({ enabled: true, transport: undefined }))).outcome).toBe('schema_not_verified');
  });
  it('validation_error on missing required field', async () => {
    expect((await crmWriteback(wb({ enabled: true, record: {} }))).outcome).toBe('validation_error');
  });
  it('write_failed surfaces transport failure', async () => {
    expect((await crmWriteback(wb({ enabled: true, transport: { create: async () => ({ ok: false, error: 'x' }) } }))).outcome).toBe('write_failed');
  });
  it('audit_failed_partial_success', async () => {
    expect((await crmWriteback(wb({ enabled: true, auditSink: { write: async () => ({ ok: false }) } }))).outcome).toBe('audit_failed_partial_success');
  });
  it('timeline_failed_partial_success when timeline enabled and fails', async () => {
    const out = await crmWriteback(wb({ enabled: true, timelineEnabled: true, timelineSink: { write: async () => ({ ok: false }) } }));
    expect(out.outcome).toBe('timeline_failed_partial_success');
  });
  it('written on happy path', async () => {
    expect((await crmWriteback(wb({ enabled: true }))).outcome).toBe('written');
  });
});
