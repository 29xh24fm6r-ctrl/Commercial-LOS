import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

import { deriveCreditCommitteePackageQueue } from '../../committee/creditCommitteePackageQueue';

/**
 * Phase 142M — credit committee package review queue governance.
 *
 * Pins the read-only, no-voting contract: NO fetch / XMLHttpRequest / axios, NO
 * POST/PATCH/PUT/DELETE, NO create/update/upsert/delete mutation call, NO
 * vote/approve/deny action handler, NO "committee-approved" / "recommended by
 * committee" copy, NO fake/sample/mock production data, NO new route mounting.
 * NOTE: the queue + panel deliberately DISCLAIM voting/approval ("review only —
 * no voting or approvals") — scans target EXECUTION / action-handler patterns and
 * misleading-approval phrases, never the disclaimer words.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const PROD_FILES = [
  'src/committee/creditCommitteePackageQueue.ts',
  'src/committee/CreditCommitteePackageReviewQueuePanel.tsx',
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

describe('Phase 142M — files exist', () => {
  for (const rel of ['docs/PHASE_142M_CREDIT_COMMITTEE_PACKAGE_REVIEW_QUEUE.md', ...PROD_FILES, 'src/shared/governance/creditCommitteePackageQueueGovernance.test.ts']) {
    it(`${rel} exists`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});

describe('Phase 142M — no network / write / mutation execution', () => {
  it('imports only relative modules + react', () => {
    for (const f of SOURCES) {
      const specifiers = Array.from(f.code.matchAll(/(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]/g)).map((m) => m[1]);
      for (const spec of specifiers) {
        expect(spec === 'react' || spec.startsWith('.'), `${f.rel} imports ${spec}`).toBe(true);
      }
    }
  });

  it('uses no fetch / XMLHttpRequest / axios', () => {
    const hits = SOURCES.filter((f) => /\b(fetch|XMLHttpRequest)\s*\(|\baxios\b/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('introduces no POST / PATCH / PUT / DELETE method string', () => {
    const hits = SOURCES.filter((f) => /method:\s*['"](POST|PATCH|PUT|DELETE)['"]|\b(POST|PATCH|PUT|DELETE)\b\s*:/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('uses no create / update / upsert / delete mutation call', () => {
    const hits = SOURCES.filter((f) => /\b(createRecord|updateRecord|deleteRecord|upsert\w*|save[A-Z]\w*)\s*\(/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('exposes no vote / approve / deny action handler', () => {
    const hits = SOURCES.filter((f) => /\b(onVote|onApprove|onDeny|castVote|recordVote|submitVote|approvePackage|denyPackage|recommendPackage|decisionPackage)\s*\(?/i.test(f.code) || /<button/i.test(f.code) || /onClick/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('uses no committee-approved / voted / recommended-by-committee copy', () => {
    const hits = SOURCES.filter((f) => /committee[- ]approved|recommended by committee|approved by committee|denied by committee|vote (recorded|cast)|cast (a )?ballot|has voted/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('uses no fake / sample / mock production data', () => {
    const hits = SOURCES.filter((f) => /\b(sampleData|mockData|fakeData|SAMPLE_\w+|MOCK_\w+|FAKE_\w+|dummyData)\b/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('contains no external URL / dollar literal / email fixture', () => {
    const hits: string[] = [];
    for (const f of SOURCES) {
      if (/https?:\/\//.test(f.raw)) hits.push(`${f.rel} url`);
      if (/\$\s*\d/.test(f.code)) hits.push(`${f.rel} $-literal`);
      if (/['"`][a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}['"`]/i.test(f.code)) hits.push(`${f.rel} email`);
    }
    expect(hits).toEqual([]);
  });

  it('App.tsx mounts no committee queue route (mounting deferred)', () => {
    const app = readFileSync(resolve(REPO_ROOT, 'src/App.tsx'), 'utf8');
    expect(app).not.toMatch(/CreditCommitteePackageReviewQueuePanel|creditCommitteePackageQueue/);
  });
});

describe('Phase 142M — behavioral: read-only, honest, no approval inference', () => {
  it('is fail-closed (unavailable) when no input is supplied', () => {
    expect(deriveCreditCommitteePackageQueue(undefined).available).toBe(false);
  });

  it('does not infer approval readiness from deal completeness alone', () => {
    const q = deriveCreditCommitteePackageQueue({ packages: [{ dealId: 'D1', status: 'complete', stage: 'committee', memoId: 'M1', committeeReadiness: { evidenceCount: 5 } }] });
    expect(q.rows[0].readinessStatus).toBe('unknown');
  });

  it('emits no approved / voted / denied / decisioned labels', () => {
    const q = deriveCreditCommitteePackageQueue({ packages: [{ dealId: 'D1', memoId: 'M1', committeeReadiness: { hasDecisionSupport: true, evidenceCount: 6 } }] });
    const s = JSON.stringify(q).toLowerCase();
    for (const w of ['approved', 'voted', 'denied', 'decisioned', 'committee-approved']) {
      expect(s).not.toContain(w);
    }
  });
});
