import { describe, it, expect } from 'vitest';
import { evaluateExternalPlatformConnectorReadiness } from './externalPlatformConnectorReadiness';

describe('Phase 150 — externalPlatformConnectorReadiness', () => {
  it('disabled mode returns not_configured', () => {
    const r = evaluateExternalPlatformConnectorReadiness({
      platformDomain: 'external_crm', connectorConfigured: false, authConfigured: false,
      secureTransportConfigured: false, readScopeDocumented: false, writeScopeDocumented: false,
      fieldMapDocumented: false, objectMapDocumented: false, rollbackDocumented: false,
      auditModelDocumented: false, mode: 'disabled_by_default',
    });
    expect(r.status).toBe('not_configured');
    expect(r.liveConnectionAttempted).toBe(false);
    expect(r.liveWritePerformed).toBe(false);
    expect(r.credentialsStoredInCode).toBe(false);
  });

  it('missing auth blocks', () => {
    const r = evaluateExternalPlatformConnectorReadiness({
      platformDomain: 'external_crm', connectorConfigured: true, authConfigured: false,
      secureTransportConfigured: true, readScopeDocumented: true, writeScopeDocumented: true,
      fieldMapDocumented: true, objectMapDocumented: true, rollbackDocumented: true,
      auditModelDocumented: true, mode: 'read_only_candidate',
    });
    expect(r.status).toBe('blocked');
    expect(r.blockers).toContain('Auth not configured');
  });

  it('complete read-only prereqs returns ready_for_read_only_pilot', () => {
    const r = evaluateExternalPlatformConnectorReadiness({
      platformDomain: 'external_crm', connectorConfigured: true, authConfigured: true,
      secureTransportConfigured: true, readScopeDocumented: true, writeScopeDocumented: true,
      fieldMapDocumented: true, objectMapDocumented: true, rollbackDocumented: true,
      auditModelDocumented: true, mode: 'read_only_candidate',
    });
    expect(r.status).toBe('ready_for_read_only_pilot');
    expect(r.liveWritePerformed).toBe(false);
    expect(r.externalSystemChanged).toBe(false);
  });

  it('no result allows write', () => {
    const statuses = ['disabled_by_default', 'read_only_candidate', 'dry_run_candidate'].map((mode) =>
      evaluateExternalPlatformConnectorReadiness({
        platformDomain: 'external_crm', connectorConfigured: true, authConfigured: true,
        secureTransportConfigured: true, readScopeDocumented: true, writeScopeDocumented: true,
        fieldMapDocumented: true, objectMapDocumented: true, rollbackDocumented: true,
        auditModelDocumented: true, mode: mode as any,
      }),
    );
    for (const r of statuses) {
      expect(r.liveWritePerformed).toBe(false);
      expect(r.externalSystemChanged).toBe(false);
    }
  });
});
