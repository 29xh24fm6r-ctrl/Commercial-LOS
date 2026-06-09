import { describe, it, expect } from 'vitest';
import { createDisabledAdminConfigurationPersistenceAdapter } from './createDisabledAdminConfigurationPersistenceAdapter';
import {
  createAdminConfigurationDataversePersistenceAdapter,
  assertAllowedAdminConfigEntitySet,
  type AdminConfigPersistenceTransport,
} from './createAdminConfigurationDataversePersistenceAdapter';
import { resolveAdminConfigPersistenceFeatureFlags } from './adminConfigurationPersistenceFeatureFlags';
import { deriveAdminConfigurationSchemaReadiness } from './deriveAdminConfigurationSchemaReadiness';
import { ADMIN_CONFIG_TARGET_TABLES, ADMIN_CONFIG_TARGET_RELATIONSHIPS, adminConfigTargetColumnsForTable } from './adminConfigurationDataverseSchemaPlan';
import type { AdminConfigurationProposalRecord, AdminConfigurationReviewDecisionRecord, AdminConfigurationAuditRecord } from './adminConfigurationPersistenceTypes';

const TRANSPORT: AdminConfigPersistenceTransport = { kind: 'admin_config_persistence_transport' };

function readySchema() {
  return deriveAdminConfigurationSchemaReadiness({
    publisherPrefixConfirmed: true,
    inspectedTables: ADMIN_CONFIG_TARGET_TABLES.map((t) => ({ logicalName: t.logicalName, exists: true, presentColumns: adminConfigTargetColumnsForTable(t.logicalName).map((c) => c.logicalName) })),
    relationshipsPresent: ADMIN_CONFIG_TARGET_RELATIONSHIPS.map((r) => r.relationshipSchemaName),
  });
}

const EMPTY_PROPOSAL = {} as AdminConfigurationProposalRecord;
const EMPTY_DECISION = {} as AdminConfigurationReviewDecisionRecord;
const EMPTY_AUDIT = {} as AdminConfigurationAuditRecord;

describe('Phase 142J — disabled persistence adapter', () => {
  const adapter = createDisabledAdminConfigurationPersistenceAdapter();

  it('is disabled by default', () => {
    expect(adapter.mode).toBe('disabled');
    expect(adapter.getStatus()).toBe('disabled_not_configured');
    expect(adapter.getReadiness().writeEnabled).toBe(false);
    expect(adapter.getReadiness().applyEnabled).toBe(false);
  });

  it('blocks saveProposal / saveReviewDecision / saveAuditEntry', () => {
    expect(adapter.saveProposal(EMPTY_PROPOSAL).ok).toBe(false);
    expect(adapter.saveProposal(EMPTY_PROPOSAL).errorCode).toBe('admin_config_persistence_disabled');
    expect(adapter.saveReviewDecision(EMPTY_DECISION).ok).toBe(false);
    expect(adapter.saveAuditEntry(EMPTY_AUDIT).ok).toBe(false);
  });

  it('list methods return empty without writing', () => {
    expect(adapter.listProposals().data).toEqual([]);
    expect(adapter.listReviewDecisions().ok).toBe(true);
    for (const r of [adapter.saveProposal(EMPTY_PROPOSAL), adapter.saveAuditEntry(EMPTY_AUDIT)]) {
      expect(r.auditSummary.wroteToDataverse).toBe(false);
    }
  });
});

describe('Phase 142J — Dataverse persistence adapter seam (write disabled)', () => {
  const flagsEnabled = resolveAdminConfigPersistenceFeatureFlags({ persistenceEnabled: true, readEnabled: true });

  it('blocks when the feature flag is off', () => {
    const a = createAdminConfigurationDataversePersistenceAdapter({ flags: resolveAdminConfigPersistenceFeatureFlags(), schemaReadiness: readySchema(), transport: TRANSPORT, permissionContext: { grantedPermissions: ['admin.config.persistence.use'] }, policyContext: { persistenceAllowed: true } });
    expect(a.getStatus()).toBe('disabled_not_configured');
  });

  it('blocks when the schema is not ready', () => {
    const a = createAdminConfigurationDataversePersistenceAdapter({ flags: flagsEnabled, schemaReadiness: deriveAdminConfigurationSchemaReadiness(), transport: TRANSPORT, permissionContext: { grantedPermissions: ['admin.config.persistence.use'] }, policyContext: { persistenceAllowed: true } });
    expect(a.getStatus()).toBe('schema_not_ready');
  });

  it('blocks when the transport is missing', () => {
    const a = createAdminConfigurationDataversePersistenceAdapter({ flags: flagsEnabled, schemaReadiness: readySchema(), permissionContext: { grantedPermissions: ['admin.config.persistence.use'] }, policyContext: { persistenceAllowed: true } });
    expect(a.getStatus()).toBe('blocked_by_missing_transport');
  });

  it('blocks when permission is denied', () => {
    const a = createAdminConfigurationDataversePersistenceAdapter({ flags: flagsEnabled, schemaReadiness: readySchema(), transport: TRANSPORT, policyContext: { persistenceAllowed: true } });
    expect(a.getStatus()).toBe('blocked_by_permission');
  });

  it('keeps write disabled and blocks save even when every gate opens', () => {
    const a = createAdminConfigurationDataversePersistenceAdapter({ flags: flagsEnabled, schemaReadiness: readySchema(), transport: TRANSPORT, permissionContext: { grantedPermissions: ['admin.config.persistence.use'] }, policyContext: { persistenceAllowed: true } });
    expect(a.getStatus()).toBe('ready_for_future_persistence');
    expect(a.mode).toBe('live_write_disabled');
    expect(a.getReadiness().writeEnabled).toBe(false);
    expect(a.saveProposal(EMPTY_PROPOSAL).errorCode).toBe('admin_config_write_forbidden');
  });

  it('rejects an arbitrary entity set via the allowlist', () => {
    expect(assertAllowedAdminConfigEntitySet('cr664_adminconfigurationproposals')).toBe(true);
    expect(assertAllowedAdminConfigEntitySet('cr664_loandeals')).toBe(false);
    expect(assertAllowedAdminConfigEntitySet('systemusers')).toBe(false);
  });
});
