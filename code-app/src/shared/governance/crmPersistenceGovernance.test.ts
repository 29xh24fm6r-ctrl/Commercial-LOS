import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

import { createDisabledCrmLiveDataverseAdapter } from '../../crm/crmLiveDataverseAdapter';
import { resolveCrmPersistenceAdapter } from '../../crm/resolveCrmPersistenceAdapter';
import { deriveCrmFeatureFlagState } from '../../crm/crmFeatureFlags';
import { deriveCrmRuntimeSchemaGate } from '../../crm/crmRuntimeSchemaGate';
import {
  mapOrganizationToDataverse,
  mapAuditEntryToDataverse,
} from '../../crm/crmDataverseMapper';
import {
  CRM_ALLOWED_ENTITY_SETS,
  CRM_DISALLOWED_ENTITY_SETS,
} from '../../crm/crmLiveDataverseTransport';
import type { CrmOrganization } from '../../shared/crm/crmTypes';

/**
 * Phase 141L — CRM live persistence governance.
 *
 * Pins the live-adapter safety contract: disabled by default, no delete, no
 * outreach, no fake data, no full tax ids, writes confined to cr664_crm* tables,
 * no route registration, fail-closed gating, and mapper null-preservation +
 * audit redaction.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const PROD_FILES = [
  'src/crm/crmFeatureFlags.ts',
  'src/crm/crmPersistenceTypes.ts',
  'src/crm/crmPersistenceAdapter.ts',
  'src/crm/crmDataverseMapper.ts',
  'src/crm/crmLiveDataverseTransport.ts',
  'src/crm/crmLiveDataverseAdapter.ts',
  'src/crm/resolveCrmPersistenceAdapter.ts',
  'src/crm/crmRuntimeSchemaGate.ts',
];

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const SOURCES = PROD_FILES.map((rel) => ({
  rel: relative(REPO_ROOT, resolve(REPO_ROOT, rel)).split(sep).join('/'),
  code: stripComments(readFileSync(resolve(REPO_ROOT, rel), 'utf8')),
}));

describe('Phase 141L — files exist', () => {
  const REQUIRED = [
    'docs/PHASE_141L_CRM_LIVE_PERSISTENCE_ADAPTER.md',
    ...PROD_FILES,
  ];
  for (const rel of REQUIRED) {
    it(`${rel} exists`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});

describe('Phase 141L — live adapter disabled by default', () => {
  it('the disabled live adapter is enabled=false and fails closed', async () => {
    const a = createDisabledCrmLiveDataverseAdapter();
    expect(a.enabled).toBe(false);
    expect((await a.saveOrganization({ orgId: 'X', orgType: 'customer', status: 'active' })).ok).toBe(false);
  });

  it('the resolver returns a disabled adapter with no transport / flags off', () => {
    const r = resolveCrmPersistenceAdapter({
      flags: deriveCrmFeatureFlagState(),
      verified: { tablesFound: 10, columnsFound: 147, relationshipsFound: 28, conflicts: 0 },
      isAuthorizedOperator: true,
    });
    expect(r.live).toBe(false);
    expect(r.adapter.enabled).toBe(false);
  });
});

describe('Phase 141L — no delete / no outreach in source', () => {
  it('no delete verb in any CRM persistence file', () => {
    const hits = SOURCES.filter((f) => /\b(deleteRecord|deleteMultiple)\b|method:\s*'DELETE'/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no email / SMS / Twilio / mailto / upload-link send primitives', () => {
    const hits = SOURCES.filter((f) =>
      /\b(sendEmail|SendEmailV2|sendSms|twilio|sendUploadLink|generateUploadLink)\b|mailto:/i.test(f.code),
    );
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no direct fetch / Dataverse SDK import in the persistence layer', () => {
    const hits = SOURCES.filter(
      (f) => /\b(fetch|XMLHttpRequest)\s*\(/.test(f.code) || /@microsoft\/power-apps/.test(f.code) || /Cr664_\w+Service/.test(f.code),
    );
    expect(hits.map((h) => h.rel)).toEqual([]);
  });
});

describe('Phase 141L — no fake CRM data / no sensitive identifiers in source', () => {
  it('no sample emails / phones / dollar literals', () => {
    const hits: string[] = [];
    for (const f of SOURCES) {
      if (/['"`][a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}['"`]/i.test(f.code)) hits.push(`${f.rel} email`);
      if (/\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/.test(f.code)) hits.push(`${f.rel} phone`);
      if (/\$\s*\d/.test(f.code)) hits.push(`${f.rel} $-literal`);
    }
    expect(hits).toEqual([]);
  });

  it('no placeholder customer / vendor names in source', () => {
    const NAMES = [/\bAcme\b/i, /\bJohn\s+Smith\b/i, /\bContoso\b/i, /\bFabrikam\b/i];
    const hits: string[] = [];
    for (const f of SOURCES) for (const re of NAMES) if (re.test(f.code)) hits.push(f.rel);
    expect(hits).toEqual([]);
  });

  it('persists tax identity as a boolean presence only; a raw tax id throws', () => {
    const org: CrmOrganization = { orgId: 'O1', orgType: 'customer', status: 'active' };
    const fields = mapOrganizationToDataverse(org).fields;
    expect('cr664_taxidpresent' in fields).toBe(true);
    expect(typeof fields.cr664_taxidpresent === 'string').toBe(false);
    expect(() =>
      mapOrganizationToDataverse({ ...org, ssn: '123-45-6789' } as unknown as CrmOrganization),
    ).toThrow();
  });
});

describe('Phase 141L — writes confined to cr664_crm* tables', () => {
  it('the allow-list is exactly the 10 CRM entity sets', () => {
    expect(CRM_ALLOWED_ENTITY_SETS).toHaveLength(10);
    expect(CRM_ALLOWED_ENTITY_SETS.every((s) => s.startsWith('cr664_crm'))).toBe(true);
  });

  it('the disallow-list covers loandeal / client / team / banker / platformuser / systemuser', () => {
    for (const t of ['cr664_loandeals', 'cr664_clientrelationships', 'cr664_teams', 'cr664_bankers', 'cr664_platformusers', 'systemusers']) {
      expect(CRM_DISALLOWED_ENTITY_SETS).toContain(t);
    }
  });

  it('App.tsx registers no CRM route (no permission widening)', () => {
    const app = readFileSync(resolve(REPO_ROOT, 'src/App.tsx'), 'utf8');
    expect(app).not.toMatch(/\bcrm\b|CrmRelationship|CrmLive/i);
  });
});

describe('Phase 141L — mapper preserves nulls + redacts; schema gate fails closed', () => {
  it('the mapper preserves nulls (undefined optional → null, never omitted)', () => {
    const fields = mapOrganizationToDataverse({ orgId: 'O1', orgType: 'customer', status: 'active' }).fields;
    expect(fields.cr664_legalname).toBeNull();
    expect(fields.cr664_sourcesystem).toBeNull();
  });

  it('the mapper redacts sensitive audit value summaries', () => {
    const fields = mapAuditEntryToDataverse({
      action: 'update',
      timestamp: '2026-06-08T00:00:00Z',
      previousValueSummary: 'old',
      redacted: true,
    }).fields;
    expect(fields.cr664_previousvaluesummary).toBe('[redacted]');
    expect(fields.cr664_redacted).toBe(true);
  });

  it('the schema gate fails closed on a missing table', () => {
    const r = deriveCrmRuntimeSchemaGate({
      verified: { tablesFound: 9, columnsFound: 147, relationshipsFound: 28, conflicts: 0 },
      flags: deriveCrmFeatureFlagState({ livePersistenceEnabled: true }),
      adapterEnabled: true,
      isAuthorizedOperator: true,
    });
    expect(r.schemaReady).toBe(false);
    expect(r.canCreate).toBe(false);
  });
});
