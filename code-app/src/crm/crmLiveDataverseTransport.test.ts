import { describe, it, expect } from 'vitest';
import {
  CRM_ALLOWED_ENTITY_SETS,
  CRM_DISALLOWED_ENTITY_SETS,
  isAllowedCrmEntitySet,
  crmEntitySetForLogicalName,
  createGuardedCrmTransport,
  type CrmDataverseClient,
  type CrmTransportResult,
} from './crmLiveDataverseTransport';

/**
 * Phase 141L — CRM live transport allow-list pins.
 *
 * Only the 10 `cr664_crm*` entity sets are allowed; loan-deal / client / team /
 * banker / platformuser / systemuser are rejected; arbitrary names are rejected;
 * there is no delete operation in the interface.
 */

function recordingClient(calls: string[]): CrmDataverseClient {
  const ok: CrmTransportResult = { ok: true };
  return {
    create: async (set) => { calls.push(`create:${set}`); return ok; },
    update: async (set) => { calls.push(`update:${set}`); return ok; },
    retrieve: async (set) => { calls.push(`retrieve:${set}`); return { ok: true, record: {} }; },
    retrieveMultiple: async (set) => { calls.push(`search:${set}`); return { ok: true, records: [] }; },
  };
}

describe('Phase 141L — CRM entity-set allow-list', () => {
  it('accepts only the 10 CRM entity sets', () => {
    expect(CRM_ALLOWED_ENTITY_SETS).toHaveLength(10);
    for (const set of CRM_ALLOWED_ENTITY_SETS) {
      expect(isAllowedCrmEntitySet(set)).toBe(true);
      expect(set.startsWith('cr664_crm')).toBe(true);
    }
  });

  it('disallows loan-deal / client / team / banker / platformuser / systemuser', () => {
    for (const set of CRM_DISALLOWED_ENTITY_SETS) {
      expect(isAllowedCrmEntitySet(set)).toBe(false);
    }
    expect(isAllowedCrmEntitySet('cr664_loandeals')).toBe(false);
    expect(isAllowedCrmEntitySet('systemusers')).toBe(false);
    expect(isAllowedCrmEntitySet('cr664_portfolioboardedloans')).toBe(false);
  });

  it('rejects an arbitrary / unknown entity set', () => {
    expect(isAllowedCrmEntitySet('accounts')).toBe(false);
    expect(isAllowedCrmEntitySet('')).toBe(false);
    expect(isAllowedCrmEntitySet('cr664_anything')).toBe(false);
  });

  it('resolves CRM logical names to entity sets, undefined for non-CRM', () => {
    expect(crmEntitySetForLogicalName('cr664_crmorganization')).toBe('cr664_crmorganizations');
    expect(crmEntitySetForLogicalName('cr664_crmauditentry')).toBe('cr664_crmauditentries');
    expect(crmEntitySetForLogicalName('cr664_loandeal')).toBeUndefined();
    expect(crmEntitySetForLogicalName('systemuser')).toBeUndefined();
  });
});

describe('Phase 141L — guarded transport blocks non-CRM tables', () => {
  it('passes CRM entity sets through to the client', async () => {
    const calls: string[] = [];
    const transport = createGuardedCrmTransport(recordingClient(calls));
    const res = await transport.createRecord('cr664_crmorganizations', {});
    expect(res.ok).toBe(true);
    expect(calls).toContain('create:cr664_crmorganizations');
  });

  it('rejects a disallowed entity set without ever calling the client', async () => {
    const calls: string[] = [];
    const transport = createGuardedCrmTransport(recordingClient(calls));
    const res = await transport.createRecord('cr664_loandeals', {});
    expect(res.ok).toBe(false);
    expect(res.error).toBe('crm_disallowed_table');
    expect(calls).toEqual([]);
  });

  it('exposes no delete operation', () => {
    const transport = createGuardedCrmTransport(recordingClient([]));
    expect((transport as unknown as Record<string, unknown>).deleteRecord).toBeUndefined();
    expect((transport as unknown as Record<string, unknown>).delete).toBeUndefined();
  });
});
