import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

import { deriveProductProfitabilityAvailability } from '../../executive/productProfitabilityAvailabilityModel';

/**
 * Phase 142S — product profitability / ROE availability governance.
 *
 * Pins the availability-only contract: NO fetch / XMLHttpRequest / axios, NO
 * POST/PATCH/PUT/DELETE, NO Graph / Outlook / Power Automate, NO Dataverse create/
 * update/upsert/delete, NO SDK client / endpoint / env var / secret / token, NO GL
 * / core / servicing call, NO "profitable / unprofitable / high ROE / low ROE /
 * ROE calculated / profitability calculated / yield calculated / margin calculated
 * / pricing recommendation / optimize portfolio" copy, NO approve/deny/vote handler,
 * NO eval/Function, NO fake/sample/mock data. Every outcome keeps readOnly true and
 * every *Calculated / externalSystemChanged flag false. NOTE: the model/panel
 * HONESTLY say metrics are "not calculated" and show "...: false" — scans target
 * EXECUTION patterns and AFFIRMATIVE/adjacent fact phrases only.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const PROD_FILES = [
  'src/executive/productProfitabilityAvailabilityModel.ts',
  'src/executive/ProductProfitabilityAvailabilityPanel.tsx',
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

describe('Phase 142S — files exist', () => {
  for (const rel of ['docs/PHASE_142S_EXECUTIVE_PRODUCT_PROFITABILITY_ROE_AVAILABILITY_MODEL.md', ...PROD_FILES, 'src/shared/governance/productProfitabilityAvailabilityGovernance.test.ts']) {
    it(`${rel} exists`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});

describe('Phase 142S — no calculation / network / write execution', () => {
  it('imports only relative modules + react', () => {
    for (const f of SOURCES) {
      const specifiers = Array.from(f.code.matchAll(/(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]/g)).map((m) => m[1]);
      for (const spec of specifiers) {
        expect(spec === 'react' || spec.startsWith('.'), `${f.rel} imports ${spec}`).toBe(true);
      }
    }
  });

  it('uses no endpoint URL / env var / secret / token / client construction', () => {
    const hits = SOURCES.filter((f) => /process\.env|https?:\/\/|(api[_-]?key|client[_-]?secret|access[_-]?token|endpoint)\s*[:=]\s*['"][^'"]+['"]|new\s+\w*(Ledger|Core|Servicing|Finance)\w*Client/i.test(f.raw));
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

  it('uses no GL / core / servicing call or metric calculation execution', () => {
    const hits = SOURCES.filter((f) => /\b(callGl|generalLedger|coreBanking|servicingSystem|calculateRoe|calculateProfitability|calculateYield|calculateMargin|computeRaroc|recommendPricing|optimizePortfolio)\s*\(/i.test(f.code));
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

  it('uses no affirmative profitable / high-low-ROE / metric-calculated / pricing copy', () => {
    const hits = SOURCES.filter((f) => /\bprofitable\b|\bunprofitable\b|high roe|low roe|roe calculated|profitability calculated|yield calculated|margin calculated|pricing recommendation|optimize portfolio/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('uses no fake / sample / mock data and no dollar-literal figure', () => {
    const hits: string[] = [];
    for (const f of SOURCES) {
      if (/\b(sampleData|mockData|fakeData|SAMPLE_\w+|MOCK_\w+|FAKE_\w+|dummyData)\b/.test(f.code)) hits.push(`${f.rel} mock`);
      if (/\$\s*\d/.test(f.code)) hits.push(`${f.rel} $-figure`);
    }
    expect(hits).toEqual([]);
  });

  it('App.tsx mounts no profitability availability route (mounting deferred)', () => {
    const app = readFileSync(resolve(REPO_ROOT, 'src/App.tsx'), 'utf8');
    expect(app).not.toMatch(/ProductProfitabilityAvailabilityPanel|productProfitabilityAvailabilityModel/);
  });
});

describe('Phase 142S — behavioral: availability only, no metric calculated', () => {
  function input(over: Record<string, unknown> = {}) {
    return { dealId: 'D1', dealName: 'Deal One', productType: 'commercial', loanStructure: 'term_loan', pricingType: 'fixed', ...over } as Parameters<typeof deriveProductProfitabilityAvailability>[0];
  }

  it('keeps readOnly true and every calculation flag false', () => {
    const r = deriveProductProfitabilityAvailability(input({ interestRateAvailable: true }));
    expect(r.readOnly).toBe(true);
    expect(r.profitabilityCalculated).toBe(false);
    expect(r.roeCalculated).toBe(false);
    expect(r.yieldCalculated).toBe(false);
    expect(r.marginCalculated).toBe(false);
    expect(r.feeIncomeCalculated).toBe(false);
    expect(r.externalSystemChanged).toBe(false);
  });

  it('emits no numeric metric and is honest for missing identity', () => {
    expect(deriveProductProfitabilityAvailability(undefined).availabilityStatus).toBe('unknown');
    const r = deriveProductProfitabilityAvailability(input({ interestRateAvailable: true, feeIncomeAvailable: true, costOfFundsAvailable: true, chargeOffDataAvailable: true, servicingPerformanceAvailable: true, generalLedgerDataAvailable: true, capitalAllocationDataAvailable: true }));
    expect(Object.values(r.futureMetricReadiness).every((v) => typeof v === 'string')).toBe(true);
    expect(JSON.stringify(r)).not.toMatch(/"(roe|yield|margin|profit)(value|pct|amount)"\s*:\s*-?\d/i);
  });
});
