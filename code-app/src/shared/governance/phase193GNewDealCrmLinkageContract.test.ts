import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { linkNewDealToCrm } from '../../crm/crmSalesforceSpineNewDealLinkage';
import { CRM_SPINE_PERSISTENCE_ACK } from '../../crm/crmSalesforceSpineLiveGates';
import type { CrmDataverseTransport, CrmTransportResult } from '../../crm/crmLiveDataverseTransport';

/**
 * Phase 193G — governed New Deal → CRM linkage governance.
 *
 * Pins: linkage is inert without gates, never fabricates an account/sync,
 * returns partial_success honestly, and emits audit with a correlation id.
 */

const here = (...p: string[]) => resolve(__dirname, '..', '..', ...p);
const read = (...p: string[]) => readFileSync(here(...p), 'utf8');
const MODULE = read('crm', 'crmSalesforceSpineNewDealLinkage.ts');

const deal = { dealId: 'd-1', dealName: 'WC Line', clientId: 'c-1', clientName: 'Provided Client' };
const liveGate = { livePersistenceEnabled: 'true', acknowledgement: CRM_SPINE_PERSISTENCE_ACK, targetEnvironmentPresent: true, operatorAuthorized: true };
function okTransport(): CrmDataverseTransport {
  return {
    createRecord: async (): Promise<CrmTransportResult> => ({ ok: true, id: 'crm-1' }),
    updateRecord: async (): Promise<CrmTransportResult> => ({ ok: true }),
    readRecord: async (): Promise<CrmTransportResult> => ({ ok: true }),
    searchRecords: async (): Promise<CrmTransportResult> => ({ ok: true }),
  };
}

describe('static safety', () => {
  it('emits no fabricated sync-success copy and no borrower comms', () => {
    expect(MODULE).not.toMatch(/synced successfully|Salesforce updated|CRM sync complete/i);
    expect(MODULE).not.toMatch(/\b(sendEmail|SendEmailV2|sendSms|twilio)\b|mailto:/i);
  });
});

describe('runtime safety', () => {
  it('is inert with no gate (not attempted, blocked)', async () => {
    const r = await linkNewDealToCrm({ mode: 'live', deal, actor: 'op', correlationId: 'g1', transport: okTransport() });
    expect(r.linkageAttempted).toBe(false);
    expect(r.outcome).toBe('blocked_gate_not_satisfied');
  });

  it('dry-run never writes', async () => {
    const r = await linkNewDealToCrm({ mode: 'dry-run', deal, actor: 'op', correlationId: 'g2' });
    expect(r.outcome).toBe('dry_run');
  });

  it('returns partial_success when the account links but the relationship fails', async () => {
    const transport: CrmDataverseTransport = {
      ...okTransport(),
      createRecord: async (entitySet: string): Promise<CrmTransportResult> =>
        entitySet === 'cr664_crmrelationships' ? { ok: false, error: 'dv_rel' } : { ok: true, id: 'org-1' },
    };
    const r = await linkNewDealToCrm({ mode: 'live', deal, actor: 'op', correlationId: 'g3', gate: liveGate, transport });
    expect(r.outcome).toBe('partial_success');
    expect(r.audit.every((a) => a.correlationId === 'g3')).toBe(true);
  });

  it('never invents an account when the deal has no client name', async () => {
    const r = await linkNewDealToCrm({ mode: 'live', deal: { dealId: 'd', dealName: 'N', clientId: null, clientName: null }, actor: 'op', correlationId: 'g4', gate: liveGate, transport: okTransport() });
    expect(r.outcome).toBe('skipped_missing_required_data');
  });
});
