import { describe, it, expect } from 'vitest';
import { derivePlatformObjectModel } from './derivePlatformObjectModel';
import { PLATFORM_OBJECT_REGISTRY, ALL_PLATFORM_OBJECT_KEYS } from './platformObjectRegistry';

/**
 * Phase 142A — platform object model pins.
 */

describe('Phase 142A — platform object model', () => {
  const { integrity } = derivePlatformObjectModel();

  it('contains CRM / LOS / annual review / portfolio objects', () => {
    for (const k of ['crm_organization', 'crm_person', 'deal', 'annual_review', 'memo_package', 'fdic_package', 'portfolio_boarded_loan']) {
      expect(ALL_PLATFORM_OBJECT_KEYS).toContain(k);
    }
  });

  it('every object has an owner workspace and permission scope', () => {
    expect(integrity.allHaveOwnerWorkspace).toBe(true);
    expect(integrity.allHavePermissionScope).toBe(true);
  });

  it('writes default false (registry enables no writes)', () => {
    expect(integrity.noWritesEnabledByDefault).toBe(true);
    expect(PLATFORM_OBJECT_REGISTRY.every((o) => o.writeEnabledDefault === false)).toBe(true);
  });

  it('uses no arbitrary table names (only governed cr664 / systemuser)', () => {
    expect(integrity.noArbitraryTableNames).toBe(true);
    for (const o of PLATFORM_OBJECT_REGISTRY) {
      if (o.sourceTable) expect(o.sourceTable.startsWith('cr664_') || o.sourceTable === 'systemuser').toBe(true);
    }
  });

  it('forbids schema mutation and custom field creation everywhere', () => {
    expect(integrity.schemaMutationForbidden).toBe(true);
    for (const o of PLATFORM_OBJECT_REGISTRY) {
      expect(o.forbiddenActions).toContain('schema_mutate');
      expect(o.forbiddenActions).toContain('create_custom_field');
    }
    expect(integrity.violations).toEqual([]);
  });
});
