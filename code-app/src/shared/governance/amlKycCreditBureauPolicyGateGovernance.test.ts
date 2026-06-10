import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

import {
  evaluateAmlKycCreditBureauPolicyGate,
  POLICY_GATE_LIVE_PULL_MODE,
} from '../../integrations/policyGates/amlKycCreditBureauPolicyGate';

/**
 * Phase 142Q — AML/KYC and credit bureau policy gate governance.
 *
 * Pins the no-live-pull contract: NO SDK import / client / endpoint / env var /
 * secret / token / webhook, NO fetch / XMLHttpRequest / axios, NO POST/PATCH/PUT/
 * DELETE, NO Graph / Outlook / Power Automate, NO Dataverse create/update/upsert/
 * delete, NO "report/score retrieved (true) / verified successfully / OFAC no
 * match / sanctions clear / bureau score found / AML clear / KYC approved" copy,
 * NO approve/deny/vote handler, NO eval/Function, NO fake/sample/mock data. Every
 * outcome keeps every provider/retrieval/change flag and allowedForLivePullNow
 * false. NOTE: the result type NAMES the live-effect fields as literal-false and
 * the panel HONESTLY shows "...: false" — scans target EXECUTION patterns and
 * AFFIRMATIVE misleading copy only.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const PROD_FILES = [
  'src/integrations/policyGates/amlKycCreditBureauPolicyGate.ts',
  'src/integrations/policyGates/AmlKycCreditBureauPolicyGatePanel.tsx',
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

describe('Phase 142Q — files exist', () => {
  for (const rel of ['docs/PHASE_142Q_AML_KYC_CREDIT_BUREAU_POLICY_GATE.md', ...PROD_FILES, 'src/shared/governance/amlKycCreditBureauPolicyGateGovernance.test.ts']) {
    it(`${rel} exists`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});

describe('Phase 142Q — no provider / network / write / pull', () => {
  it('imports only relative modules + react (no SDK / API client)', () => {
    for (const f of SOURCES) {
      const specifiers = Array.from(f.code.matchAll(/(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]/g)).map((m) => m[1]);
      for (const spec of specifiers) {
        expect(spec === 'react' || spec.startsWith('.'), `${f.rel} imports ${spec}`).toBe(true);
      }
    }
  });

  it('uses no endpoint URL / env var / secret / token / webhook / client construction', () => {
    const hits = SOURCES.filter((f) => /process\.env|https?:\/\/|webhook|(api[_-]?key|client[_-]?secret|access[_-]?token|endpoint)\s*[:=]\s*['"][^'"]+['"]|new\s+\w*(Bureau|Experian|Equifax|TransUnion|Lexis|Aml|Kyc|Ofac)\w*Client/i.test(f.raw));
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

  it('uses no provider pull / report / score execution', () => {
    const hits = SOURCES.filter((f) => /\b(pullReport|pullBureau|runKyc|runAml|runOfac|checkSanctions|verifyIdentity|getScore|getBureau|softPull|hardPull)\s*\(/i.test(f.code));
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

  it('uses no affirmative clear / no-match / verified / score-found copy', () => {
    const hits = SOURCES.filter((f) => /report retrieved:\s*true|score retrieved:\s*true|retrieved successfully|verified successfully|ofac no match|sanctions clear|bureau score found|\baml clear\b|kyc approved/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('uses no fake / sample / mock data', () => {
    const hits = SOURCES.filter((f) => /\b(sampleData|mockData|fakeData|SAMPLE_\w+|MOCK_\w+|FAKE_\w+|dummyData)\b/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('App.tsx mounts no policy gate route (mounting deferred)', () => {
    const app = readFileSync(resolve(REPO_ROOT, 'src/App.tsx'), 'utf8');
    expect(app).not.toMatch(/AmlKycCreditBureauPolicyGatePanel|amlKycCreditBureauPolicyGate/);
  });
});

describe('Phase 142Q — behavioral: no live pull ever', () => {
  function base(over: Record<string, unknown> = {}) {
    return { dealId: 'D1', dealName: 'Deal One', requestedByDisplayName: 'admin-1', requestedAt: CLOCK, requestedPolicyDomains: ['aml_kyc'], livePullMode: POLICY_GATE_LIVE_PULL_MODE, ...over } as Parameters<typeof evaluateAmlKycCreditBureauPolicyGate>[0];
  }

  it('returns only blocked_no_live_pull / ready_for_future_configuration / rejected', () => {
    expect(['blocked_no_live_pull', 'ready_for_future_configuration', 'rejected']).toContain(evaluateAmlKycCreditBureauPolicyGate(base()).status);
  });

  it('keeps every flag false even when the provider is configured', () => {
    const r = evaluateAmlKycCreditBureauPolicyGate(base({ requestedPolicyDomains: ['disabled_placeholder'], providerConfigured: true }));
    expect(r.allowedForLivePullNow).toBe(false);
    expect(r.livePullPerformed).toBe(false);
    expect(r.creditBureauProviderCalled).toBe(false);
    expect(r.reportRetrieved).toBe(false);
    expect(r.scoreRetrieved).toBe(false);
  });

  it('rejects a sensitive identifier and produces a deterministic non-real proof id', () => {
    expect(evaluateAmlKycCreditBureauPolicyGate(base({ ssn: '000-00-0000' }) as never).rejectedReason).toBe('sensitive_identifier_present');
    const id = evaluateAmlKycCreditBureauPolicyGate(base()).policyGateProofId;
    expect(id).toBe(evaluateAmlKycCreditBureauPolicyGate(base()).policyGateProofId);
    expect(id).toMatch(/^policy_gate_no_live_pull_/);
  });
});
