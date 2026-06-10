import { describe, it, expect } from 'vitest';
import {
  CRM_SOURCE_OF_TRUTH_MAP,
  CRM_SOURCE_OF_TRUTH_DOMAIN_KEYS,
  getCrmSourceOfTruthEntry,
  crmSourceOfTruthAllNonLive,
} from './crmSourceOfTruthMap';

describe('Phase 143A — CRM source-of-truth map', () => {
  it('covers every required CRM domain', () => {
    for (const key of [
      'borrower_client_identity', 'business_legal_name', 'dba_name', 'contacts', 'relationship_managers',
      'deal_opportunity', 'loan_amount', 'stage_status', 'product_type', 'loan_structure', 'pricing_type',
      'tasks', 'activities', 'emails_communications', 'documents', 'credit_memo', 'committee_package',
      'closing_checklist', 'servicing_handoff', 'deposit_opportunity', 'cross_sell_relationship_intelligence',
    ]) {
      expect(CRM_SOURCE_OF_TRUTH_DOMAIN_KEYS).toContain(key);
    }
  });

  it('defaults every entry to disabled_by_default with no CRM write target', () => {
    for (const e of CRM_SOURCE_OF_TRUTH_MAP) {
      expect(e.activationStatus).toBe('disabled_by_default');
      expect(e.proposedWriteTarget).toBe('none');
    }
    expect(crmSourceOfTruthAllNonLive()).toBe(true);
  });

  it('keeps LOS authoritative for identity, amount, stage/status, and pricing', () => {
    for (const key of ['borrower_client_identity', 'loan_amount', 'stage_status', 'pricing_type']) {
      expect(getCrmSourceOfTruthEntry(key)?.losOwner).toBe('los_dataverse');
      expect(getCrmSourceOfTruthEntry(key)?.proposedReadSource).toBe('los_dataverse');
    }
  });

  it('blocks stage/status from any writeback in its conflict rule', () => {
    expect(getCrmSourceOfTruthEntry('stage_status')?.conflictRule.toLowerCase()).toMatch(/blocked/);
  });

  it('returns undefined for an unknown domain', () => {
    expect(getCrmSourceOfTruthEntry('not_a_domain')).toBeUndefined();
  });
});
