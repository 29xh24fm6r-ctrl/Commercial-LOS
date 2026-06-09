import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

import { INTEGRATION_PROVIDER_REGISTRY, getIntegrationProvider } from '../../integrations/integrationProviderRegistry';
import { resolveIntegrationAdapter } from '../../integrations/resolveIntegrationAdapter';
import { createDisabledIntegrationAdapter } from '../../integrations/createDisabledIntegrationAdapters';

/**
 * Phase 142F — integration adapter governance.
 *
 * Pins the registry-only, disabled-by-default contract: NO external call, fetch,
 * vendor SDK import, external package dependency, external URL, or secret; NO AML
 * run, credit pull, scoring final decision, core banking write, payment posting,
 * disbursement, e-sign envelope send, upload-link generation, borrower outreach,
 * CRM/Dataverse write, covenant waiver, or credit approval/decline; NO PII /
 * SSN / TIN / account-number fixtures. NOTE: capabilities and disclaimer banners
 * deliberately NAME disabled actions ("credit pull", "disbursement") as data /
 * copy — scans target EXECUTION call patterns and structural-true flags only.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const PROD_FILES = [
  'src/integrations/integrationAdapterTypes.ts',
  'src/integrations/integrationProviderRegistry.ts',
  'src/integrations/integrationAdapterContracts.ts',
  'src/integrations/validateIntegrationRequest.ts',
  'src/integrations/createDisabledIntegrationAdapters.ts',
  'src/integrations/resolveIntegrationAdapter.ts',
  'src/integrations/deriveIntegrationReadiness.ts',
  'src/integrations/IntegrationAdapterRegistryPanel.tsx',
  'src/integrations/IntegrationRequestPreviewPanel.tsx',
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

describe('Phase 142F — files exist', () => {
  for (const rel of ['docs/PHASE_142F_INTEGRATION_ADAPTER_REGISTRY.md', ...PROD_FILES]) {
    it(`${rel} exists`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});

describe('Phase 142F — no external package / SDK / fetch / URL / secret', () => {
  it('imports only relative modules and react (no external package / vendor SDK)', () => {
    for (const f of SOURCES) {
      const specifiers = Array.from(f.code.matchAll(/(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]/g)).map((m) => m[1]);
      for (const spec of specifiers) {
        expect(spec === 'react' || spec.startsWith('.'), `${f.rel} imports ${spec}`).toBe(true);
      }
    }
  });

  it('contains no fetch / XMLHttpRequest call', () => {
    const hits = SOURCES.filter((f) => /\b(fetch|XMLHttpRequest)\s*\(/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('contains no external URL', () => {
    const hits = SOURCES.filter((f) => /https?:\/\//.test(f.raw));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('contains no secrets / tokens', () => {
    const hits = SOURCES.filter((f) => /\b(api[_-]?key|apikey|client[_-]?secret|bearer\s+[a-z0-9]|access[_-]?token\s*[:=])/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });
});

describe('Phase 142F — no external execution', () => {
  it('no AML / sanctions run execution', () => {
    const hits = SOURCES.filter((f) => /\b(runAml|runAmlScreening|executeAml|runSanctions|executeScreening)\s*\(/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no credit pull execution', () => {
    const hits = SOURCES.filter((f) => /\b(pullCredit|pullBureau|requestCreditReport|fetchCreditReport)\s*\(/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no scoring final credit decision', () => {
    const hits = SOURCES.filter((f) => /\b(approveCredit|declineCredit|finalCreditDecision)\s*\(|finalDecision:\s*true|canProduceCreditDecision:\s*true/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no core banking write execution', () => {
    const hits = SOURCES.filter((f) => /\b(createCoreAccount|postToCore|writeCore|coreWrite|bookToCore)\s*\(/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no payment posting / disbursement execution', () => {
    const hits = SOURCES.filter((f) => /\b(postPayment|applyPayment|disburse|disburseFunds)\s*\(/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no e-sign envelope send / upload-link generation execution', () => {
    const hits = SOURCES.filter((f) => /\b(sendEnvelope|submitEnvelope|generateUploadLink|createUploadLink)\s*\(/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no borrower outreach execution', () => {
    const hits = SOURCES.filter((f) => /\b(sendEmail|sendSms|sendBorrower|sendRequest)\s*\(|mailto:|twilio/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no covenant waiver execution', () => {
    const hits = SOURCES.filter((f) => /\b(waiveCovenant|grantWaiver)\s*\(/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no CRM / Dataverse write verbs', () => {
    const hits = SOURCES.filter((f) => /\b(createRecord|updateRecord|deleteRecord)\b|method:\s*'(POST|PATCH|DELETE)'/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });
});

describe('Phase 142F — no PII / mutation controls / route', () => {
  it('panels have no button / onClick mutation control', () => {
    for (const c of SOURCES.filter((f) => f.isComponent)) {
      expect(c.code).not.toMatch(/<button/i);
      expect(c.code).not.toMatch(/onClick/);
    }
  });

  it('contains no SSN / TIN / account-number / email / phone fixtures', () => {
    const hits: string[] = [];
    for (const f of SOURCES) {
      if (/\b\d{3}-\d{2}-\d{4}\b/.test(f.code)) hits.push(`${f.rel} ssn`);
      if (/['"`][a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}['"`]/i.test(f.code)) hits.push(`${f.rel} email`);
      if (/\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/.test(f.code)) hits.push(`${f.rel} phone`);
      if (/\baccountNumber\s*[:=]\s*['"`]?\d/.test(f.code)) hits.push(`${f.rel} account`);
    }
    expect(hits).toEqual([]);
  });

  it('App.tsx registers no integration panel route', () => {
    const app = readFileSync(resolve(REPO_ROOT, 'src/App.tsx'), 'utf8');
    expect(app).not.toMatch(/IntegrationAdapterRegistryPanel|IntegrationRequestPreviewPanel/);
  });
});

describe('Phase 142F — behavioral: disabled by default', () => {
  it('every provider is disabled by default with read-only audit', () => {
    for (const p of INTEGRATION_PROVIDER_REGISTRY) {
      expect(p.mode).toBe('disabled');
      expect(p.auditSummary.readOnly).toBe(true);
      expect(p.auditSummary.containsLiveCall).toBe(false);
      expect(p.canProduceCreditDecision).toBe(false);
    }
  });

  it('the resolver default and every disabled adapter block external attempts', () => {
    expect(resolveIntegrationAdapter({ providerKey: 'core_banking_provider' }).adapter?.getStatus().status).toBe('disabled');
    const bureau = getIntegrationProvider('credit_bureau_provider')!;
    const result = createDisabledIntegrationAdapter(bureau).attemptRequest({ providerKey: bureau.providerKey, capability: 'retrieve_credit_report_summary' });
    expect(result.allowed).toBe(false);
    expect(result.auditSummary.containsPiiTransmission).toBe(false);
  });
});
