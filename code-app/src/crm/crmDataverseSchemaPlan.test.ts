import { describe, it, expect } from 'vitest';
import {
  CRM_SCHEMA_VERSION,
  CRM_PUBLISHER_PREFIX,
  CRM_TARGET_TABLES,
  CRM_TARGET_COLUMNS,
  CRM_TARGET_RELATIONSHIPS,
  CRM_TARGET_OPTION_SETS,
  CRM_REUSE_CANDIDATE_TABLES,
  CRM_SEED_ORDER,
  crmTargetColumnsForTable,
  ALL_CRM_TARGET_TABLE_LOGICAL_NAMES,
} from './crmDataverseSchemaPlan';

/**
 * Phase 141J-K — CRM Dataverse schema plan pins.
 *
 * The plan is constants only: 10 CRM target tables, their columns, optional
 * lookup relationships, option-set metadata, and reuse candidates — with no
 * fake customer / vendor / contact data and no sample emails or phone numbers.
 */

describe('Phase 141J-K — CRM schema plan tables', () => {
  const EXPECTED_TABLES = [
    'cr664_crmorganization',
    'cr664_crmperson',
    'cr664_crmcontactpoint',
    'cr664_crmrelationship',
    'cr664_crmroleassignment',
    'cr664_crmcommunicationpreference',
    'cr664_crmcontactauthorization',
    'cr664_crmvendorprofile',
    'cr664_crmtimelineevent',
    'cr664_crmauditentry',
  ];

  it('includes all 10 CRM target tables', () => {
    expect(CRM_TARGET_TABLES).toHaveLength(10);
    for (const t of EXPECTED_TABLES) {
      expect(ALL_CRM_TARGET_TABLE_LOGICAL_NAMES).toContain(t);
    }
  });

  it('includes the cr664_crmorganization root table', () => {
    const org = CRM_TARGET_TABLES.find((t) => t.logicalName === 'cr664_crmorganization');
    expect(org).toBeDefined();
    expect(org?.seedOrder).toBe(1);
    expect(org?.primaryNameColumn).toBe('cr664_name');
  });

  it('includes cr664_crmperson', () => {
    expect(CRM_TARGET_TABLES.some((t) => t.logicalName === 'cr664_crmperson')).toBe(true);
  });

  it('includes contact point / relationship / role / preference / authorization / vendor / timeline / audit tables', () => {
    for (const t of [
      'cr664_crmcontactpoint',
      'cr664_crmrelationship',
      'cr664_crmroleassignment',
      'cr664_crmcommunicationpreference',
      'cr664_crmcontactauthorization',
      'cr664_crmvendorprofile',
      'cr664_crmtimelineevent',
      'cr664_crmauditentry',
    ]) {
      expect(ALL_CRM_TARGET_TABLE_LOGICAL_NAMES).toContain(t);
    }
  });

  it('every table logical name uses the cr664_ publisher prefix', () => {
    expect(CRM_PUBLISHER_PREFIX).toBe('cr664');
    for (const t of CRM_TARGET_TABLES) {
      expect(t.logicalName.startsWith('cr664_')).toBe(true);
    }
  });

  it('seed order covers all 10 tables in declared order', () => {
    expect(CRM_SEED_ORDER).toHaveLength(10);
    expect(CRM_SEED_ORDER[0]).toBe('cr664_crmorganization');
    expect(CRM_SEED_ORDER[1]).toBe('cr664_crmperson');
  });

  it('exposes a stable schema version', () => {
    expect(CRM_SCHEMA_VERSION).toMatch(/^141J-K\./);
  });
});

describe('Phase 141J-K — CRM schema plan governance fields', () => {
  it('includes required contact governance fields on the contact point', () => {
    const cols = crmTargetColumnsForTable('cr664_crmcontactpoint').map((c) => c.logicalName);
    expect(cols).toContain('cr664_contacttype');
    expect(cols).toContain('cr664_value');
    expect(cols).toContain('cr664_authorizationstatus');
    expect(cols).toContain('cr664_verified');
  });

  it('includes a do-not-contact field', () => {
    const hit = CRM_TARGET_COLUMNS.find((c) => c.logicalName === 'cr664_donotcontact');
    expect(hit).toBeDefined();
    expect(hit?.dataType).toBe('Boolean');
  });

  it('includes authorization fields', () => {
    const cols = crmTargetColumnsForTable('cr664_crmcontactauthorization').map((c) => c.logicalName);
    expect(cols).toContain('cr664_authorizedforfinancialrequests');
    expect(cols).toContain('cr664_authorizedforuploadlinks');
    expect(cols).toContain('cr664_expiresat');
  });

  it('includes communication preference fields', () => {
    const cols = crmTargetColumnsForTable('cr664_crmcommunicationpreference').map((c) => c.logicalName);
    expect(cols).toContain('cr664_preferredmethod');
    expect(cols).toContain('cr664_consentstatus');
    expect(cols).toContain('cr664_uploadlinkpreference');
  });

  it('marks the raw contact value column sensitive', () => {
    const value = CRM_TARGET_COLUMNS.find(
      (c) => c.tableLogicalName === 'cr664_crmcontactpoint' && c.logicalName === 'cr664_value',
    );
    expect(value?.sensitive).toBe(true);
  });

  it('every column logical name uses the cr664_ prefix', () => {
    for (const c of CRM_TARGET_COLUMNS) {
      expect(c.logicalName.startsWith('cr664_')).toBe(true);
    }
  });
});

describe('Phase 141J-K — CRM schema plan relationships + option sets + reuse', () => {
  it('declares optional boarded-loan and originated-loan-deal links that point at external tables', () => {
    const byName = new Map(CRM_TARGET_RELATIONSHIPS.map((r) => [r.relationshipSchemaName, r]));
    expect(byName.get('cr664_crmrelationship_boardedloan')?.toTable).toBe('cr664_portfolioboardedloan');
    expect(byName.get('cr664_crmrelationship_originatedloandeal')?.toTable).toBe('cr664_loandeal');
    // These external links are optional so a missing target never blocks the seed.
    expect(byName.get('cr664_crmrelationship_boardedloan')?.required).toBe(false);
    expect(byName.get('cr664_crmrelationship_originatedloandeal')?.required).toBe(false);
  });

  it('plans the CRM option sets as metadata only', () => {
    const keys = CRM_TARGET_OPTION_SETS.map((o) => o.key);
    expect(keys).toContain('organizationType');
    expect(keys).toContain('contactType');
    expect(keys).toContain('authorizationStatus');
    expect(keys).toContain('vendorType');
  });

  it('lists the reuse candidate tables', () => {
    expect(CRM_REUSE_CANDIDATE_TABLES).toContain('cr664_portfolioboardedloan');
    expect(CRM_REUSE_CANDIDATE_TABLES).toContain('cr664_loandeal');
    expect(CRM_REUSE_CANDIDATE_TABLES).toContain('systemuser');
  });
});

describe('Phase 141J-K — CRM schema plan carries no fake data', () => {
  // Serialize the whole plan and scan it: no sample emails, no phone numbers,
  // no dollar literals, no placeholder company / person names.
  const SERIALIZED = JSON.stringify({
    CRM_TARGET_TABLES,
    CRM_TARGET_COLUMNS,
    CRM_TARGET_RELATIONSHIPS,
    CRM_TARGET_OPTION_SETS,
  });

  it('includes no sample email addresses', () => {
    expect(SERIALIZED).not.toMatch(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  });

  it('includes no sample phone numbers', () => {
    expect(SERIALIZED).not.toMatch(/\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/);
  });

  it('includes no dollar-amount literals', () => {
    expect(SERIALIZED).not.toMatch(/\$\s*\d/);
  });

  it('includes no common fake customer / vendor / person placeholder names', () => {
    for (const re of [/\bAcme\b/i, /\bJohn\s+Smith\b/i, /\bContoso\b/i, /\bFabrikam\b/i, /\bWidget(s)?\s+(Inc|LLC)\b/i]) {
      expect(SERIALIZED).not.toMatch(re);
    }
  });
});
