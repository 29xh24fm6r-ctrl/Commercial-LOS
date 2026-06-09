import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

import { createDisabledAdminConfigurationPersistenceAdapter } from '../../adminConfig/createDisabledAdminConfigurationPersistenceAdapter';
import { ADMIN_CONFIG_PERSISTENCE_FEATURE_FLAG_DEFAULTS, resolveAdminConfigPersistenceFeatureFlags } from '../../adminConfig/adminConfigurationPersistenceFeatureFlags';
import { assertAllowedAdminConfigEntitySet } from '../../adminConfig/createAdminConfigurationDataversePersistenceAdapter';
import { ADMIN_CONFIG_PERSISTENCE_ENTITY_SET_ALLOWLIST } from '../../adminConfig/adminConfigurationDataverseSchemaPlan';
import { mapProposalToRecord } from '../../adminConfig/adminConfigurationPersistenceMapper';
import { buildAdminConfigurationProposal } from '../../adminConfig/buildAdminConfigurationProposal';
import type { AdminConfigurationProposalRecord } from '../../adminConfig/adminConfigurationPersistenceTypes';

/**
 * Phase 142J — admin configuration persistence governance.
 *
 * Pins the disabled-by-default persistence contract: persistence + write + apply
 * are off; NO schema creation/seed, NO delete, NO apply/deploy/publish/activate,
 * NO mutate-schema/create-field/register-route, NO enable-integration/widen-
 * permission, NO execute-workflow, NO credit approval/decline, NO covenant waiver,
 * NO borrower outreach/upload-link/email/SMS, NO Dataverse write, NO fetch, NO
 * arbitrary entity set, NO raw secrets/PII. NOTE: the schema plan + types
 * deliberately NAME forbidden actions as field/copy/comment — scans target
 * EXECUTION call patterns only.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const PROD_FILES = [
  'src/adminConfig/adminConfigurationPersistenceTypes.ts',
  'src/adminConfig/adminConfigurationDataverseSchemaPlan.ts',
  'src/adminConfig/deriveAdminConfigurationSchemaReadiness.ts',
  'src/adminConfig/adminConfigurationPersistenceMapper.ts',
  'src/adminConfig/adminConfigurationPersistenceAdapter.ts',
  'src/adminConfig/createDisabledAdminConfigurationPersistenceAdapter.ts',
  'src/adminConfig/createAdminConfigurationDataversePersistenceAdapter.ts',
  'src/adminConfig/adminConfigurationPersistenceFeatureFlags.ts',
  'src/adminConfig/resolveAdminConfigurationPersistenceAdapter.ts',
  'src/adminConfig/AdminConfigurationPersistenceReadinessPanel.tsx',
];

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const SOURCES = PROD_FILES.map((rel) => ({
  rel: relative(REPO_ROOT, resolve(REPO_ROOT, rel)).split(sep).join('/'),
  isComponent: rel.endsWith('.tsx'),
  raw: readFileSync(resolve(REPO_ROOT, rel), 'utf8'),
  code: stripComments(readFileSync(resolve(REPO_ROOT, rel), 'utf8')),
}));

const CLOCK = '2026-06-09T00:00:00.000Z';

describe('Phase 142J — files exist', () => {
  for (const rel of ['docs/PHASE_142J_ADMIN_CONFIGURATION_PERSISTENCE_ADAPTER.md', ...PROD_FILES, 'src/shared/governance/adminConfigurationPersistenceGovernance.test.ts']) {
    it(`${rel} exists`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});

describe('Phase 142J — no schema creation / apply / mutation execution', () => {
  it('no schema creation / seed execution', () => {
    const hits = SOURCES.filter((f) => /\b(createTable|createEntity|createColumn|createSchema|seedSchema|seedTable|seedSchemaFromPlan)\s*\(/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no apply / deploy / publish / activate execution', () => {
    const hits = SOURCES.filter((f) => /\b(applyProposal|applyConfig|applyConfiguration|deployProposal|publishProposal|activateProposal)\s*\(/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no mutate-schema / create-field / register-route execution', () => {
    const hits = SOURCES.filter((f) => /\b(mutateSchema|createField|createCustomField|registerRoute)\s*\(/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no enable-integration / widen-permission / execute-workflow execution', () => {
    const hits = SOURCES.filter((f) => /\b(enableIntegration|activateProvider|widenPermission|grantPermission|executeWorkflow|runWorkflow)\s*\(/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no delete execution', () => {
    const hits = SOURCES.filter((f) => /\b(deleteRecord|deleteProposal|deleteEntity|delete[A-Z]\w*)\s*\(/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });
});

describe('Phase 142J — no credit / waiver / outreach / write / fetch', () => {
  it('no credit approval/decline / covenant waiver execution', () => {
    const hits = SOURCES.filter((f) => /\b(approveCredit|declineCredit|waiveCovenant|grantWaiver)\s*\(/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no borrower outreach / upload-link / email / SMS execution', () => {
    const hits = SOURCES.filter((f) => /\b(sendEmail|sendSms|sendBorrower|generateUploadLink|createUploadLink)\s*\(|mailto:|twilio/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no CRM / Dataverse write verbs', () => {
    const hits = SOURCES.filter((f) => /\b(createRecord|updateRecord|deleteRecord)\b|method:\s*'(POST|PATCH|DELETE)'/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no fetch / XMLHttpRequest (especially in components) and no external URL', () => {
    const hits = SOURCES.filter((f) => /\b(fetch|XMLHttpRequest)\s*\(/.test(f.code) || /https?:\/\//.test(f.raw));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('components have no button / onClick mutation control', () => {
    for (const c of SOURCES.filter((f) => f.isComponent)) {
      expect(c.code).not.toMatch(/<button/i);
      expect(c.code).not.toMatch(/onClick/);
    }
  });

  it('App.tsx registers no persistence panel route', () => {
    const app = readFileSync(resolve(REPO_ROOT, 'src/App.tsx'), 'utf8');
    expect(app).not.toMatch(/AdminConfigurationPersistenceReadinessPanel/);
  });
});

describe('Phase 142J — behavioral: disabled, write/apply off, allowlist, redaction', () => {
  it('persistence is disabled by default and save is blocked', () => {
    const adapter = createDisabledAdminConfigurationPersistenceAdapter();
    expect(adapter.mode).toBe('disabled');
    expect(adapter.getStatus()).toBe('disabled_not_configured');
    expect(adapter.saveProposal({} as AdminConfigurationProposalRecord).ok).toBe(false);
  });

  it('write and apply are off by default and cannot be enabled by config', () => {
    expect(ADMIN_CONFIG_PERSISTENCE_FEATURE_FLAG_DEFAULTS.ADMIN_CONFIG_PERSISTENCE_WRITE_ENABLED).toBe(false);
    expect(ADMIN_CONFIG_PERSISTENCE_FEATURE_FLAG_DEFAULTS.ADMIN_CONFIG_PERSISTENCE_APPLY_ENABLED).toBe(false);
    const f = resolveAdminConfigPersistenceFeatureFlags({ persistenceEnabled: true, writeEnabled: true, applyEnabled: true });
    expect(f.ADMIN_CONFIG_PERSISTENCE_WRITE_ENABLED).toBe(false);
    expect(f.ADMIN_CONFIG_PERSISTENCE_APPLY_ENABLED).toBe(false);
  });

  it('only the three admin-config entity sets are addressable', () => {
    expect(ADMIN_CONFIG_PERSISTENCE_ENTITY_SET_ALLOWLIST.length).toBe(3);
    expect(assertAllowedAdminConfigEntitySet('cr664_loandeals')).toBe(false);
    expect(assertAllowedAdminConfigEntitySet('cr664_clientrelationships')).toBe(false);
  });

  it('the mapper redacts PII and never persists raw sensitive values', () => {
    const proposal = buildAdminConfigurationProposal({ proposalId: 'P1', proposalType: 'platform_object_change', title: 'View', summary: 'metadata', proposedChangeSummary: 'reorder', requestedBy: 'admin-1', clock: CLOCK });
    const withPii = { ...proposal, summary: 'ssn 123-45-6789' };
    const record = mapProposalToRecord(withPii);
    expect(record.cr664_summary).not.toContain('123-45-6789');
  });
});
