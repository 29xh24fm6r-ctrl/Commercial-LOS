import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

import { deriveServicingLifecycleProjection } from '../../servicing/servicingLifecycleMapper';

/**
 * Phase 142R — servicing lifecycle read-only mapper governance.
 *
 * Pins the read-only mapper contract: NO Dataverse create/update/upsert/delete,
 * NO fetch / XMLHttpRequest / axios, NO POST/PATCH/PUT/DELETE, NO Graph / Outlook
 * / Power Automate, NO SDK write / client / endpoint / env var / secret / token,
 * NO core banking call, loan boarding, servicing-record creation, payment-schedule
 * generation, statement send, or borrower notification execution; NO affirmative
 * "loan boarded / boarding succeeded / active servicing / marked current /
 * delinquent / defaulted / payment schedule generated / statement sent / borrower
 * notified" copy; NO approve/deny/vote handler, NO eval/Function, NO fake/sample/
 * mock data. NOTE: the spec-mandated banner DISCLAIMS these ("No loan is boarded,
 * no payment schedule is generated …") — scans target EXECUTION patterns and
 * AFFIRMATIVE/adjacent fact phrases only, never the negated disclaimer.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const PROD_FILES = [
  'src/servicing/servicingLifecycleMapper.ts',
  'src/servicing/ServicingLifecycleMapperPanel.tsx',
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

describe('Phase 142R — files exist', () => {
  for (const rel of ['docs/PHASE_142R_SERVICING_LIFECYCLE_READ_ONLY_DATAVERSE_MAPPER.md', ...PROD_FILES, 'src/shared/governance/servicingLifecycleMapperGovernance.test.ts']) {
    it(`${rel} exists`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});

describe('Phase 142R — no write / network / boarding / sync execution', () => {
  it('imports only relative modules + react', () => {
    for (const f of SOURCES) {
      const specifiers = Array.from(f.code.matchAll(/(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]/g)).map((m) => m[1]);
      for (const spec of specifiers) {
        expect(spec === 'react' || spec.startsWith('.'), `${f.rel} imports ${spec}`).toBe(true);
      }
    }
  });

  it('uses no endpoint URL / env var / secret / token / client construction', () => {
    const hits = SOURCES.filter((f) => /process\.env|https?:\/\/|(api[_-]?key|client[_-]?secret|access[_-]?token|endpoint)\s*[:=]\s*['"][^'"]+['"]|new\s+\w*(Core|Servicing|Dataverse)\w*Client/i.test(f.raw));
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

  it('uses no boarding / core-sync / schedule / statement / notify execution', () => {
    const hits = SOURCES.filter((f) => /\b(boardLoan|createServicingRecord|syncToCore|coreBankingSync|generateSchedule|generatePaymentSchedule|amortize|sendStatement|notifyBorrower|markCurrent|markDelinquent)\s*\(/i.test(f.code));
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

  it('uses no affirmative boarded / active-servicing / current / delinquent / defaulted fact copy', () => {
    const hits = SOURCES.filter((f) => /loan boarded|boarding succeeded|active servicing|marked current|marked delinquent|\bdefaulted\b|payment schedule generated|statement sent|borrower notified/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('uses no fake / sample / mock data', () => {
    const hits = SOURCES.filter((f) => /\b(sampleData|mockData|fakeData|SAMPLE_\w+|MOCK_\w+|FAKE_\w+|dummyData)\b/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('App.tsx mounts no servicing mapper route (mounting deferred)', () => {
    const app = readFileSync(resolve(REPO_ROOT, 'src/App.tsx'), 'utf8');
    expect(app).not.toMatch(/ServicingLifecycleMapperPanel|servicingLifecycleMapper/);
  });
});

describe('Phase 142R — behavioral: read-only, no servicing state', () => {
  it('keeps readOnly true and every live-effect flag false', () => {
    const r = deriveServicingLifecycleProjection({ dealId: 'D1', status: 'closed', stage: 'closed', productType: 'commercial', loanStructure: 'term_loan', amount: 250000, maturityDate: '2031-01-01', actualCloseDate: '2026-01-15' });
    expect(r.readOnly).toBe(true);
    expect(r.liveServicingSyncPerformed).toBe(false);
    expect(r.coreBankingSyncPerformed).toBe(false);
    expect(r.loanBoarded).toBe(false);
    expect(r.paymentScheduleGenerated).toBe(false);
    expect(r.externalSystemChanged).toBe(false);
  });

  it('is honest for missing identity and non-closed deals and infers no servicing facts', () => {
    expect(deriveServicingLifecycleProjection(undefined).servicingProjectionStatus).toBe('unknown');
    expect(deriveServicingLifecycleProjection({ dealId: 'D1', status: 'underwriting' }).servicingProjectionStatus).toBe('not_ready_for_servicing');
    const r = deriveServicingLifecycleProjection({ dealId: 'D1', status: 'closed', stage: 'closed', productType: 'commercial', loanStructure: 'term_loan', amount: 1, maturityDate: '2031-01-01', actualCloseDate: '2026-01-15', servicingRecordId: 'svc-1' });
    expect(JSON.stringify(r).toLowerCase()).not.toMatch(/"servicingprojectionstatus":"(boarded|serviced|current|delinquent|defaulted)"/);
  });
});
