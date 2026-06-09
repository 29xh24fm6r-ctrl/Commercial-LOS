import { describe, it, expect } from 'vitest';
import * as schemaPlan from './adminConfigurationDataverseSchemaPlan';
import {
  ADMIN_CONFIG_TARGET_TABLES,
  ADMIN_CONFIG_TARGET_COLUMNS,
  ADMIN_CONFIG_PERSISTENCE_ENTITY_SET_ALLOWLIST,
  adminConfigTargetColumnsForTable,
} from './adminConfigurationDataverseSchemaPlan';

describe('Phase 142J — admin configuration Dataverse schema plan', () => {
  it('contains exactly the three planned tables', () => {
    expect(ADMIN_CONFIG_TARGET_TABLES.map((t) => t.logicalName)).toEqual([
      'cr664_adminconfigurationproposal',
      'cr664_adminconfigurationreviewdecision',
      'cr664_adminconfigurationauditentry',
    ]);
  });

  it('uses the cr664_ publisher prefix on every table and column', () => {
    for (const t of ADMIN_CONFIG_TARGET_TABLES) expect(t.logicalName.startsWith('cr664_')).toBe(true);
    for (const c of ADMIN_CONFIG_TARGET_COLUMNS) expect(c.logicalName.startsWith('cr664_')).toBe(true);
  });

  it('plans the proposal columns from the spec', () => {
    const cols = adminConfigTargetColumnsForTable('cr664_adminconfigurationproposal').map((c) => c.logicalName);
    expect(cols).toContain('cr664_proposalidtext');
    expect(cols).toContain('cr664_status');
    expect(cols).toContain('cr664_redactedauditsummaryjson');
  });

  it('exposes only the three admin-config entity sets in the allowlist', () => {
    expect(ADMIN_CONFIG_PERSISTENCE_ENTITY_SET_ALLOWLIST).toEqual([
      'cr664_adminconfigurationproposals',
      'cr664_adminconfigurationreviewdecisions',
      'cr664_adminconfigurationauditentries',
    ]);
  });

  it('exposes no create / seed / write helper export', () => {
    for (const name of Object.keys(schemaPlan)) {
      expect(name).not.toMatch(/create|seed|write|mutate|apply/i);
    }
  });
});
