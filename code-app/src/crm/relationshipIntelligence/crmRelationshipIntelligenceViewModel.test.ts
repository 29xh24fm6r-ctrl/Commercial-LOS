import { describe, it, expect } from 'vitest';
import { deriveCrmRelationshipIntelligenceViewModel } from './crmRelationshipIntelligenceViewModel';
import { auditCrmConnectorReadiness, CRM_CONNECTOR_MODE } from '../connectors/crmConnectorReadiness';
import { deriveCrmEntityMatch } from '../matching/crmEntityMatchingModel';
import { deriveCrmSyncPreviewPlan } from '../syncPreview/crmSyncPreviewPlan';
import { evaluateCrmWritebackPolicyGate, CRM_WRITEBACK_MODE } from '../writeback/crmWritebackPolicyGate';

const ALL_DOCS = { objectMapDocumented: true, fieldMapDocumented: true, writePolicyDocumented: true, rollbackDocumented: true };

describe('Phase 143H — CRM relationship intelligence cockpit view model', () => {
  it('assembles all cockpit sections and stays read-only', () => {
    const vm = deriveCrmRelationshipIntelligenceViewModel({});
    expect(vm.sections.map((s) => s.key)).toEqual([
      'activation_posture', 'salesforce_readiness', 'ncino_readiness', 'entity_match',
      'sync_preview', 'writeback_policy', 'dry_run_proof', 'timeline',
    ]);
    expect(vm.readOnly).toBe(true);
    expect(vm.liveCrmLookupPerformed).toBe(false);
    expect(vm.externalSystemChanged).toBe(false);
  });

  it('recommends documenting connectors when readiness is missing', () => {
    expect(deriveCrmRelationshipIntelligenceViewModel({}).nextSafeStep.toLowerCase()).toMatch(/connector readiness/);
  });

  it('never recommends "sync now" or "push now"', () => {
    const vm = deriveCrmRelationshipIntelligenceViewModel({
      salesforceReadiness: auditCrmConnectorReadiness({ provider: 'salesforce', configured: true, ...ALL_DOCS, mode: CRM_CONNECTOR_MODE }),
      ncinoReadiness: auditCrmConnectorReadiness({ provider: 'ncino', configured: true, ...ALL_DOCS, mode: CRM_CONNECTOR_MODE }),
      entityMatch: deriveCrmEntityMatch({ los: { clientName: 'Acme LLC' }, salesforce: { accountName: 'Acme LLC' } }),
      syncPreview: deriveCrmSyncPreviewPlan({ dealId: 'D1' }),
      writebackPolicy: evaluateCrmWritebackPolicyGate({ provider: 'salesforce', entityKind: 'relationship_note', operationKind: 'create', requestedFields: ['relationship_note'], sourceOfTruthConfirmed: true, identityMatchConfirmed: true, conflictFree: true, auditModelReady: true, rollbackReady: true, allowlistConfigured: true, mode: CRM_WRITEBACK_MODE }),
    });
    const s = JSON.stringify(vm).toLowerCase();
    expect(s).not.toContain('sync now');
    expect(s).not.toContain('push now');
    expect(vm.nextSafeStep.toLowerCase()).toMatch(/dry-run|no live/);
  });

  it('routes to conflict resolution when the sync preview has blocked items', () => {
    const vm = deriveCrmRelationshipIntelligenceViewModel({
      salesforceReadiness: auditCrmConnectorReadiness({ provider: 'salesforce', configured: true, ...ALL_DOCS, mode: CRM_CONNECTOR_MODE }),
      ncinoReadiness: auditCrmConnectorReadiness({ provider: 'ncino', configured: true, ...ALL_DOCS, mode: CRM_CONNECTOR_MODE }),
      entityMatch: deriveCrmEntityMatch({ los: { clientName: 'Acme LLC' }, salesforce: { accountName: 'Acme LLC' } }),
      syncPreview: deriveCrmSyncPreviewPlan({ dealId: 'D1', hasConflicts: true }),
    });
    expect(vm.nextSafeStep.toLowerCase()).toMatch(/resolve sync-preview conflicts/);
  });
});
