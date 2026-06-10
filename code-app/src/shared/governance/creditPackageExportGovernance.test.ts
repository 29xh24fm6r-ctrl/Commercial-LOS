import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

import {
  submitCreditPackageExport,
  prepareCreditPackageExportRequest,
} from '../../committee/creditPackageExportAdapter';

/**
 * Phase 142N — credit package export adapter governance.
 *
 * Pins the disabled-by-default export-seam contract: NO fetch / XMLHttpRequest /
 * axios, NO POST/PATCH/PUT/DELETE, NO Graph / Outlook / Power Automate, NO
 * Dataverse create/update/upsert/delete, NO sendMail / file upload execution, NO
 * "exported / delivered / sent successfully" copy, NO approve/deny/vote handler,
 * NO eval/Function, NO fake/sample/mock data. Every outcome keeps
 * liveExportPerformed / externalDeliveryPerformed / fileUploaded / emailSent
 * false. NOTE: the result type NAMES these as literal-false fields and the panel
 * DISCLAIMS uploads/emails — scans target EXECUTION call patterns and misleading
 * success copy only.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const PROD_FILES = [
  'src/committee/creditPackageExportAdapter.ts',
  'src/committee/CreditPackageExportPanel.tsx',
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

describe('Phase 142N — files exist', () => {
  for (const rel of ['docs/PHASE_142N_LIVE_PACKAGE_EXPORT_ADAPTER_SEAM.md', ...PROD_FILES, 'src/shared/governance/creditPackageExportGovernance.test.ts']) {
    it(`${rel} exists`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});

describe('Phase 142N — no live export / network / write / send', () => {
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

  it('uses no Graph / Outlook / Power Automate connector', () => {
    const hits = SOURCES.filter((f) => /\bGraph\b|\bOutlook\b|power[\s_-]?automate|\bflow\.run\b/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('uses no Dataverse create / update / upsert / delete call', () => {
    const hits = SOURCES.filter((f) => /\b(createRecord|updateRecord|deleteRecord|upsert\w*)\s*\(/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('uses no sendMail / file upload execution', () => {
    const hits = SOURCES.filter((f) => /\b(sendMail|sendEmail|uploadFile|fileUpload|upload|deliverPackage|exportPackage)\s*\(/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('uses no eval / Function constructor', () => {
    const hits = SOURCES.filter((f) => /\beval\s*\(|new\s+Function\b/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('uses no approve / deny / vote action handler or button', () => {
    const hits = SOURCES.filter((f) => /\b(onApprove|onDeny|onVote|castVote|approvePackage|denyPackage|recordVote)\s*\(?/i.test(f.code) || /<button/i.test(f.code) || /onClick/i.test(f.code) || /<form\b/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('uses no misleading exported/delivered/sent-successfully copy', () => {
    const hits = SOURCES.filter((f) => /live exported|exported successfully|delivered successfully|sent successfully|uploaded successfully|export complete|delivery confirmed/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('uses no fake / sample / mock production data and no external URL', () => {
    const hits: string[] = [];
    for (const f of SOURCES) {
      if (/\b(sampleData|mockData|fakeData|SAMPLE_\w+|MOCK_\w+|FAKE_\w+|dummyData)\b/.test(f.code)) hits.push(`${f.rel} mock`);
      if (/https?:\/\//.test(f.raw)) hits.push(`${f.rel} url`);
      if (/['"`][a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}['"`]/i.test(f.code)) hits.push(`${f.rel} email`);
    }
    expect(hits).toEqual([]);
  });

  it('App.tsx mounts no export panel route (mounting deferred)', () => {
    const app = readFileSync(resolve(REPO_ROOT, 'src/App.tsx'), 'utf8');
    expect(app).not.toMatch(/CreditPackageExportPanel|creditPackageExportAdapter/);
  });
});

describe('Phase 142N — behavioral: disabled, no live effect', () => {
  function req(over: Record<string, unknown> = {}) {
    return { ...prepareCreditPackageExportRequest({ dealId: 'D1', dealName: 'Deal One', requestedByDisplayName: 'admin-1', requestedAt: CLOCK }), ...over };
  }

  it('always returns disabled or rejected — never a success outcome', () => {
    const r = submitCreditPackageExport(req());
    expect(['disabled', 'rejected']).toContain(r.status);
  });

  it('keeps every live-effect flag false on disabled and rejected outcomes', () => {
    for (const r of [submitCreditPackageExport(req()), submitCreditPackageExport(null)]) {
      expect(r.liveExportPerformed).toBe(false);
      expect(r.externalDeliveryPerformed).toBe(false);
      expect(r.fileUploaded).toBe(false);
      expect(r.emailSent).toBe(false);
    }
  });

  it('produces a deterministic export seam proof id', () => {
    expect(submitCreditPackageExport(req()).exportSeamProofId).toBe(submitCreditPackageExport(req()).exportSeamProofId);
  });
});
