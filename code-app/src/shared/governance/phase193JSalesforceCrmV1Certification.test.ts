import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { runCrmSpineSchemaOrchestrator } from '../../crm/crmSalesforceSpineApplyOrchestrator';
import { persistCrmSpineRecords } from '../../crm/crmSalesforceSpinePersistenceAdapter';
import { linkNewDealToCrm } from '../../crm/crmSalesforceSpineNewDealLinkage';
import { deriveCrmRelationshipHealth } from '../../crm/crmRelationshipHealthModel';
import { deriveCrmManagerRollup } from '../../crm/crmRelationshipRollups';
import { deriveCrmAdminControlState } from '../../crm/crmAdminControlModel';
import { deriveCrmAccountSurfaceViewModel } from '../../crm/crmAccountViewModel';
import { deriveCrmTimeline } from '../../crm/crmActivityTaskModel';

/**
 * Phase 193J — Salesforce CRM V1 certification.
 *
 * Certifies the full build: every surface/module exists, and the default
 * behavior of every live-capable path is no-write / fail-closed. This is the
 * evidence pin for the V1 release candidate.
 */

const here = (...p: string[]) => resolve(__dirname, '..', '..', ...p);

const REQUIRED_FILES = [
  // Live gates + apply (193A)
  'crm/crmSalesforceSpineLiveGates.ts',
  'crm/crmSalesforceSpineApplyOrchestrator.ts',
  // Persistence + audit (193B)
  'crm/crmSalesforceSpinePersistenceAdapter.ts',
  'crm/crmSalesforceSpineAudit.ts',
  // Recovery console (193C)
  'crm/CrmSpineRecoveryConsole.tsx',
  // Account/contact/coverage (193D)
  'crm/crmAccountViewModel.ts',
  'crm/CrmAccountSurfaces.tsx',
  // Activities/tasks/timeline (193E)
  'crm/crmActivityTaskModel.ts',
  'crm/CrmActivityTimeline.tsx',
  // Relationship health (193F)
  'crm/crmRelationshipHealthModel.ts',
  'crm/CrmRelationshipHealthCard.tsx',
  // New deal linkage (193G)
  'crm/crmSalesforceSpineNewDealLinkage.ts',
  // Rollups (193H)
  'crm/crmRelationshipRollups.ts',
  'crm/CrmRollupCards.tsx',
  // Admin controls (193I)
  'crm/crmAdminControlModel.ts',
  'crm/CrmAdminControlPanel.tsx',
];

describe('CRM V1 — all surfaces and modules exist', () => {
  for (const rel of REQUIRED_FILES) {
    it(`${rel} exists`, () => {
      expect(existsSync(here(rel))).toBe(true);
    });
  }
});

describe('CRM V1 — default behavior is no-write / fail-closed', () => {
  const facts = [{ statement: 's', sourceLogicalName: null, sourceRecordId: null }];

  it('schema apply: dry-run executes nothing; live blocks with no gate', async () => {
    const dry = await runCrmSpineSchemaOrchestrator({ mode: 'dry-run-apply', correlationId: 'j1', snapshot: [] });
    expect(dry.executed).toBe(false);
    const live = await runCrmSpineSchemaOrchestrator({ mode: 'live-apply', correlationId: 'j2', snapshot: [] });
    expect(live.outcome).toBe('blocked_gate_not_satisfied');
    expect(live.schemaMutated).toBe(false);
  });

  it('persistence: dry-run no write; live blocks with no gate', async () => {
    const dry = await persistCrmSpineRecords({ mode: 'dry-run', requests: [{ entity: 'account', fields: { cr664_name: 'X' }, sourceFacts: facts }], actor: 'op', correlationId: 'j3' });
    expect(dry.executed).toBe(false);
    const live = await persistCrmSpineRecords({ mode: 'live', requests: [{ entity: 'account', fields: { cr664_name: 'X' }, sourceFacts: facts }], actor: 'op', correlationId: 'j4' });
    expect(live.overallOutcome).toBe('blocked_gate_not_satisfied');
  });

  it('new deal linkage: inert with no gate', async () => {
    const r = await linkNewDealToCrm({ mode: 'live', deal: { dealId: 'd', dealName: 'N', clientId: 'c', clientName: 'Name' }, actor: 'op', correlationId: 'j5' });
    expect(r.linkageAttempted).toBe(false);
    expect(r.outcome).toBe('blocked_gate_not_satisfied');
  });

  it('relationship health: unknown with no evidence (no fake score)', () => {
    expect(deriveCrmRelationshipHealth({}).band).toBe('unknown');
  });

  it('rollups: fail closed when not entitled', () => {
    expect(deriveCrmManagerRollup({ accounts: [], viewerEntitled: false }).entitled).toBe(false);
  });

  it('admin controls: gates closed by default', () => {
    expect(deriveCrmAdminControlState({}).controlSummary).toBe('gates-closed');
  });

  it('account surface: no account → empty state, no fabricated records', () => {
    const vm = deriveCrmAccountSurfaceViewModel({ account: null });
    expect(vm.hasAccount).toBe(false);
    expect(vm.contacts).toEqual([]);
  });

  it('timeline: empty (not fabricated) with no records', () => {
    expect(deriveCrmTimeline({}).hasHistory).toBe(false);
  });
});
