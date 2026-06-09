import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

/**
 * Phase 142A — competitive platform convergence governance.
 *
 * Pins the strategy/metadata-only safety contract: no external repo / runtime
 * package dependency, no external fetch, no outreach, no upload-link generation,
 * no CRM/Dataverse writes, no final credit recommendation, no covenant waiver,
 * no dynamic schema mutation / custom fields, no route registration, no fake
 * data. NOTE: the object/workflow models deliberately *name* forbidden actions
 * (schema_mutate, create_custom_field, final_approve, …) as the safety surface —
 * the scans target EXECUTION patterns, never those enum/label strings.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const DIRS = ['src/competitive', 'src/platform', 'src/workflow'];

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

interface SourceFile { rel: string; isComponent: boolean; code: string }

function collect(): SourceFile[] {
  const out: SourceFile[] = [];
  for (const dir of DIRS) {
    const abs = resolve(REPO_ROOT, dir);
    if (!existsSync(abs)) continue;
    for (const entry of readdirSync(abs)) {
      if (!entry.endsWith('.ts') && !entry.endsWith('.tsx')) continue;
      if (entry.endsWith('.test.ts') || entry.endsWith('.test.tsx')) continue;
      const file = resolve(abs, entry);
      out.push({ rel: relative(REPO_ROOT, file).split(sep).join('/'), isComponent: entry.endsWith('.tsx'), code: stripComments(readFileSync(file, 'utf8')) });
    }
  }
  return out;
}

const FILES = collect();

describe('Phase 142A — discovers strategy/metadata source files', () => {
  it('collects the competitive / platform / workflow source files', () => {
    expect(FILES.length).toBeGreaterThanOrEqual(15);
  });
});

describe('Phase 142A — no external dependency / fetch / outreach / write', () => {
  it('imports only relative modules + react (no new runtime package dependency)', () => {
    const hits: string[] = [];
    for (const f of FILES) {
      const imports = [...f.code.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
      for (const imp of imports) {
        const ok = imp.startsWith('.') || imp === 'react' || imp === 'react-dom';
        if (!ok) hits.push(`${f.rel} imports ${imp}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('no external fetch / XMLHttpRequest / Dataverse SDK', () => {
    const hits = FILES.filter((f) => /\b(fetch|XMLHttpRequest)\s*\(/.test(f.code) || /@microsoft\/power-apps/.test(f.code) || /Cr664_\w+Service/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no borrower outreach primitives', () => {
    const hits = FILES.filter((f) => /\b(sendEmail|sendSms|twilio|generateUploadLink|createUploadLink)\b|mailto:/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no CRM / Dataverse write verbs', () => {
    const hits = FILES.filter((f) => /\b(createRecord|updateRecord|deleteRecord)\b|method:\s*'(POST|PATCH|DELETE)'/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });
});

describe('Phase 142A — no final decision / waiver / schema mutation execution', () => {
  it('no covenant-waiver execution', () => {
    const hits = FILES.filter((f) => /\b(applyWaiver|grantWaiver|autoWaive|executeWaiver)\s*\(/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no final credit approval / decline recommendation language', () => {
    const hits = FILES.filter((f) => /recommend(s|ed)?\s+(approval|decline)|finalCreditDecision|autoApproveCredit/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no dynamic schema mutation / custom-field creation execution', () => {
    const hits = FILES.filter((f) => /\b(mutateSchema|createCustomField|alterTable|addColumn|createField)\s*\(/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });
});

describe('Phase 142A — no fake data, no external links, no route registration', () => {
  it('no sample emails / phones / dollar literals', () => {
    const hits: string[] = [];
    for (const f of FILES) {
      if (/['"`][a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}['"`]/i.test(f.code)) hits.push(`${f.rel} email`);
      if (/\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/.test(f.code)) hits.push(`${f.rel} phone`);
      if (/\$\s*\d/.test(f.code)) hits.push(`${f.rel} $-literal`);
    }
    expect(hits).toEqual([]);
  });

  it('no external URLs in source', () => {
    const hits = FILES.filter((f) => /https?:\/\//.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('App.tsx registers no competitive / platform / workflow route', () => {
    const app = readFileSync(resolve(REPO_ROOT, 'src/App.tsx'), 'utf8');
    expect(app).not.toMatch(/CompetitiveCapabilityDashboard|platformObjectRegistry|workflowRouteRegistry/);
  });
});
