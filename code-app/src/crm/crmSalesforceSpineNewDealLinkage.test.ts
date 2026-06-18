import { describe, it, expect } from 'vitest';
import { linkNewDealToCrm, type CrmNewDealInput } from './crmSalesforceSpineNewDealLinkage';
import { CRM_SPINE_PERSISTENCE_ACK, type CrmSpineLiveGateConfig } from './crmSalesforceSpineLiveGates';
import type { CrmDataverseTransport, CrmTransportResult } from './crmLiveDataverseTransport';

/** Phase 193 — gated New Deal → CRM linkage. */

const liveGate: CrmSpineLiveGateConfig = {
  livePersistenceEnabled: 'true',
  acknowledgement: CRM_SPINE_PERSISTENCE_ACK,
  targetEnvironmentPresent: true,
  operatorAuthorized: true,
};

const deal: CrmNewDealInput = { dealId: 'deal-1', dealName: 'Working Capital', clientId: 'client-1', clientName: 'Provided Client Name' };

function okTransport(): CrmDataverseTransport {
  return {
    createRecord: async (): Promise<CrmTransportResult> => ({ ok: true, id: 'crm-1' }),
    updateRecord: async (): Promise<CrmTransportResult> => ({ ok: true }),
    readRecord: async (): Promise<CrmTransportResult> => ({ ok: true }),
    searchRecords: async (): Promise<CrmTransportResult> => ({ ok: true }),
  };
}

describe('disabled / dry-run', () => {
  it('live mode with no gate is inert (not attempted, blocked)', async () => {
    const r = await linkNewDealToCrm({ mode: 'live', deal, actor: 'op', correlationId: 'c1', transport: okTransport() });
    expect(r.outcome).toBe('blocked_gate_not_satisfied');
    expect(r.linkageAttempted).toBe(false);
  });

  it('dry-run simulates the link without writing', async () => {
    const r = await linkNewDealToCrm({ mode: 'dry-run', deal, actor: 'op', correlationId: 'c2' });
    expect(r.outcome).toBe('dry_run');
    expect(r.accountResult?.outcome).toBe('dry_run');
    expect(r.dealRelationshipResult?.outcome).toBe('dry_run');
  });
});

describe('live linkage', () => {
  it('links account + deal relationship when gate satisfied + transport wired', async () => {
    const r = await linkNewDealToCrm({ mode: 'live', deal, actor: 'op', correlationId: 'c3', gate: liveGate, transport: okTransport() });
    expect(r.outcome).toBe('linked');
    expect(r.linkageAttempted).toBe(true);
    expect(r.accountResult?.outcome).toBe('created');
    expect(r.dealRelationshipResult?.outcome).toBe('created');
    expect(r.audit.length).toBeGreaterThan(0);
  });

  it('rejects (skipped) when the deal has no client name — never invents an account', async () => {
    const r = await linkNewDealToCrm({
      mode: 'live',
      deal: { dealId: 'd', dealName: 'No Client', clientId: null, clientName: null },
      actor: 'op',
      correlationId: 'c4',
      gate: liveGate,
      transport: okTransport(),
    });
    expect(r.outcome).toBe('skipped_missing_required_data');
    expect(r.dealRelationshipResult).toBeNull();
  });

  it('returns partial_success when the account links but the relationship fails', async () => {
    const transport: CrmDataverseTransport = {
      ...okTransport(),
      createRecord: async (entitySet: string): Promise<CrmTransportResult> =>
        entitySet === 'cr664_crmrelationships' ? { ok: false, error: 'dv_rel_error' } : { ok: true, id: 'org-1' },
    };
    const r = await linkNewDealToCrm({ mode: 'live', deal, actor: 'op', correlationId: 'c5', gate: liveGate, transport });
    expect(r.accountResult?.outcome).toBe('created');
    expect(r.dealRelationshipResult?.outcome).toBe('failed_dataverse');
    expect(r.outcome).toBe('partial_success');
    expect(r.blockedReason).toMatch(/dv_rel_error/);
  });
});
