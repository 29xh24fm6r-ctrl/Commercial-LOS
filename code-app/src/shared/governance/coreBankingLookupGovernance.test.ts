import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

import {
  submitCoreBankingLookup,
  prepareCoreBankingLookupRequest,
} from '../../integrations/coreBanking/coreBankingLookupAdapter';

/**
 * Phase 142P — core banking read-only lookup adapter governance.
 *
 * Pins the disabled-by-default seam contract: NO SDK import / client / endpoint /
 * env var / secret / token, NO fetch / XMLHttpRequest / axios, NO POST/PATCH/PUT/
 * DELETE, NO Graph / Outlook / Power Automate, NO Dataverse create/update/upsert/
 * delete, NO sendMail / upload execution, NO transfer/payment/money-movement
 * action, NO "core match found / customer|account|balance retrieved / verified
 * successfully" copy, NO approve/deny/vote handler, NO eval/Function, NO fake/
 * sample/mock data. Every outcome keeps all six retrieval/change flags false. NOTE:
 * the result type NAMES the live-effect fields as literal-false and the banner
 * DISCLAIMS retrieval — scans target EXECUTION patterns and misleading copy only.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const PROD_FILES = [
  'src/integrations/coreBanking/coreBankingLookupAdapter.ts',
  'src/integrations/coreBanking/CoreBankingLookupPanel.tsx',
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

const CLOCK = '2026-06-10T00:00:00.000Z';

describe('Phase 142P — files exist', () => {
  for (const rel of ['docs/PHASE_142P_CORE_BANKING_READ_ONLY_LOOKUP_ADAPTER.md', ...PROD_FILES, 'src/shared/governance/coreBankingLookupGovernance.test.ts']) {
    it(`${rel} exists`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});

describe('Phase 142P — no core SDK / network / write / money movement', () => {
  it('imports only relative modules + react (no SDK / API client)', () => {
    for (const f of SOURCES) {
      const specifiers = Array.from(f.code.matchAll(/(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]/g)).map((m) => m[1]);
      for (const spec of specifiers) {
        expect(spec === 'react' || spec.startsWith('.'), `${f.rel} imports ${spec}`).toBe(true);
      }
    }
  });

  it('uses no endpoint URL / env var / secret / token reference and no client construction', () => {
    const hits = SOURCES.filter((f) => /process\.env|https?:\/\/|(api[_-]?key|client[_-]?secret|access[_-]?token|endpoint)\s*[:=]\s*['"][^'"]+['"]|new\s+\w*(Core|Banking|Fiserv|Jack\s*Henry)\w*Client/i.test(f.raw));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('uses no fetch / XMLHttpRequest / axios', () => {
    const hits = SOURCES.filter((f) => /\b(fetch|XMLHttpRequest)\s*\(|\baxios\b/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('introduces no POST / PATCH / PUT / DELETE method string', () => {
    const hits = SOURCES.filter((f) => /method:\s*['"](POST|PATCH|PUT|DELETE)['"]|\b(POST|PATCH|PUT|DELETE)\b\s*:/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('uses no Graph / Outlook / Power Automate connector', () => {
    const hits = SOURCES.filter((f) => /\bGraph\b|\bOutlook\b|power[\s_-]?automate|\bflow\.run\b/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('uses no Dataverse create / update / upsert / delete call', () => {
    const hits = SOURCES.filter((f) => /\b(createRecord|updateRecord|deleteRecord|upsert\w*)\s*\(/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('uses no sendMail / upload execution', () => {
    const hits = SOURCES.filter((f) => /\b(sendMail|sendEmail|uploadFile|fileUpload|upload)\s*\(/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('uses no transfer / payment / money-movement / account-opening execution', () => {
    const hits = SOURCES.filter((f) => /\b(transferFunds|makePayment|moveMoney|postTransaction|initiateTransfer|openAccount|disburse)\s*\(/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('uses no eval / Function constructor', () => {
    const hits = SOURCES.filter((f) => /\beval\s*\(|new\s+Function\b/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('uses no approve / deny / vote action handler or button / form', () => {
    const hits = SOURCES.filter((f) => /\b(onApprove|onDeny|onVote|castVote|approvePackage|denyPackage|recordVote)\s*\(?/i.test(f.code) || /<button/i.test(f.code) || /onClick/i.test(f.code) || /<form\b/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('uses no misleading core-match / retrieved / verified copy', () => {
    const hits = SOURCES.filter((f) => /core match found|customer retrieved|account retrieved|balance retrieved|transaction retrieved|verified successfully|match found/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('uses no fake / sample / mock data', () => {
    const hits = SOURCES.filter((f) => /\b(sampleData|mockData|fakeData|SAMPLE_\w+|MOCK_\w+|FAKE_\w+|dummyData)\b/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('App.tsx mounts no core banking lookup route (mounting deferred)', () => {
    const app = readFileSync(resolve(REPO_ROOT, 'src/App.tsx'), 'utf8');
    expect(app).not.toMatch(/CoreBankingLookupPanel|coreBankingLookupAdapter/);
  });
});

describe('Phase 142P — behavioral: disabled, no live core effect', () => {
  function req(over: Record<string, unknown> = {}) {
    return { ...prepareCoreBankingLookupRequest({ dealId: 'D1', dealName: 'Deal One', lookupKind: 'borrower_relationship', requestedByDisplayName: 'admin-1', requestedAt: CLOCK }), ...over };
  }

  it('always returns disabled or rejected — never a success outcome', () => {
    expect(['disabled', 'rejected']).toContain(submitCoreBankingLookup(req()).status);
  });

  it('keeps every retrieval / change flag false on disabled and rejected outcomes', () => {
    for (const r of [submitCoreBankingLookup(req()), submitCoreBankingLookup(null)]) {
      expect(r.liveLookupPerformed).toBe(false);
      expect(r.customerDataRetrieved).toBe(false);
      expect(r.accountDataRetrieved).toBe(false);
      expect(r.balanceDataRetrieved).toBe(false);
      expect(r.transactionDataRetrieved).toBe(false);
      expect(r.externalSystemChanged).toBe(false);
    }
  });

  it('rejects a sensitive identifier and produces a deterministic non-real proof id', () => {
    expect(submitCoreBankingLookup({ ...req(), accountNumber: '12345678' } as never).rejectedReason).toBe('sensitive_identifier_present');
    const id = submitCoreBankingLookup(req()).lookupSeamProofId;
    expect(id).toBe(submitCoreBankingLookup(req()).lookupSeamProofId);
    expect(id).toMatch(/^core_lookup_seam_disabled_/);
  });
});
