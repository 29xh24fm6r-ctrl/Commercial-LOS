import { describe, it, expect } from 'vitest';
import { auditCrmConnectorReadiness, CRM_CONNECTOR_MODE, type CrmConnectorReadinessInput } from './crmConnectorReadiness';

function input(over: Partial<CrmConnectorReadinessInput> = {}): CrmConnectorReadinessInput {
  return { provider: 'salesforce', mode: CRM_CONNECTOR_MODE, ...over };
}

const ALL_DOCS = { objectMapDocumented: true, fieldMapDocumented: true, writePolicyDocumented: true, rollbackDocumented: true };

describe('Phase 143B — CRM connector readiness audit', () => {
  it('returns not_configured when the connector is not configured', () => {
    expect(auditCrmConnectorReadiness(input()).status).toBe('not_configured');
  });

  it('keeps every live-effect flag false in all outcomes', () => {
    for (const r of [auditCrmConnectorReadiness(input()), auditCrmConnectorReadiness(null), auditCrmConnectorReadiness(input({ configured: true, ...ALL_DOCS }))]) {
      expect(r.liveConnectionAttempted).toBe(false);
      expect(r.liveWritePerformed).toBe(false);
      expect(r.credentialsStored).toBe(false);
      expect(r.externalSystemChanged).toBe(false);
    }
  });

  it('rejects an invalid provider or mode', () => {
    expect(auditCrmConnectorReadiness({ provider: 'hubspot' as unknown as 'salesforce', mode: CRM_CONNECTOR_MODE }).rejectedReason).toBe('invalid_provider');
    expect(auditCrmConnectorReadiness(input({ mode: 'live' as unknown as typeof CRM_CONNECTOR_MODE })).rejectedReason).toBe('invalid_mode');
  });

  it('configured but undocumented is blocked', () => {
    expect(auditCrmConnectorReadiness(input({ provider: 'ncino', configured: true })).status).toBe('blocked');
  });

  it('configured + fully documented can only reach ready_for_dry_run (never live)', () => {
    const r = auditCrmConnectorReadiness(input({ configured: true, authConfigured: true, endpointConfigured: true, ...ALL_DOCS }));
    expect(r.status).toBe('ready_for_dry_run');
    expect(r.liveWritePerformed).toBe(false);
  });

  it('derives a deterministic readiness proof id', () => {
    expect(auditCrmConnectorReadiness(input({ configured: true, ...ALL_DOCS })).readinessProofId).toBe(auditCrmConnectorReadiness(input({ configured: true, ...ALL_DOCS })).readinessProofId);
  });
});
