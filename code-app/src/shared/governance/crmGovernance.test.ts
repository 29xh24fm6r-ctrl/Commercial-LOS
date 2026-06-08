import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

import { createDisabledCrmPersistenceAdapter } from '../../crm/crmPersistenceAdapter';
import { deriveCrmContactReadiness } from '../../shared/crm/deriveCrmReadiness';
import { resolveBorrowerRequestRecipient } from '../../shared/crm/resolveBorrowerRequestRecipient';
import { createEmptyCrmMaster } from '../../shared/crm/crmTypes';

/**
 * Phase 141B-H — CRM governance.
 *
 * Pins the CRM safety contract: no fake customer/vendor/contact data, no sample
 * emails/phones, no borrower outreach primitives, no fetch/Dataverse in
 * components, no delete/writes by default, no permission widening, and the
 * readiness/recipient engines fail closed.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const DIRS = ['src/shared/crm', 'src/crm'];

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

interface SourceFile { rel: string; isComponent: boolean; code: string }

function collect(): SourceFile[] {
  const out: SourceFile[] = [];
  for (const dir of DIRS) {
    const abs = resolve(REPO_ROOT, dir);
    if (!existsSync(abs)) continue;
    for (const entry of readdirSync(abs)) {
      const file = resolve(abs, entry);
      if (!statSync(file).isFile()) continue;
      if (!entry.endsWith('.ts') && !entry.endsWith('.tsx')) continue;
      if (entry.endsWith('.test.ts') || entry.endsWith('.test.tsx')) continue;
      out.push({
        rel: relative(REPO_ROOT, file).split(sep).join('/'),
        isComponent: entry.endsWith('.tsx'),
        code: stripComments(readFileSync(file, 'utf8')),
      });
    }
  }
  return out;
}

const FILES = collect();

describe('Phase 141B-H — CRM files exist', () => {
  const REQUIRED = [
    'src/shared/crm/crmTypes.ts',
    'src/shared/crm/deriveCrmReadiness.ts',
    'src/shared/crm/deriveCrmRelationshipNetworkSnapshot.ts',
    'src/shared/crm/deriveCrmContactTasks.ts',
    'src/shared/crm/resolveBorrowerRequestRecipient.ts',
    'src/shared/crm/crmIntegrationSeams.ts',
    'src/shared/crm/crmDataverseSchemaPlan.ts',
    'src/crm/crmPersistenceAdapter.ts',
    'src/crm/crmFeatureFlags.ts',
    'src/crm/crmDataverseMapper.ts',
    'src/crm/crmLiveDataverseTransport.ts',
    'src/crm/crmLiveDataverseAdapter.ts',
    'src/crm/resolveCrmPersistenceAdapter.ts',
    'src/crm/crmRuntimeSchemaGate.ts',
    'src/crm/CrmRelationshipCommandCenter.tsx',
  ];
  for (const rel of REQUIRED) {
    it(`${rel} exists on disk`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});

describe('Phase 141B-H — no fetch / Dataverse / outreach in source', () => {
  it('discovers source files', () => {
    expect(FILES.length).toBeGreaterThan(8);
  });

  it('no React component calls fetch / XMLHttpRequest or imports the Dataverse SDK', () => {
    const hits = FILES.filter(
      (f) =>
        f.isComponent &&
        (/\b(fetch|XMLHttpRequest)\s*\(/.test(f.code) ||
          /@microsoft\/power-apps/.test(f.code) ||
          /Cr664_\w+Service/.test(f.code)),
    );
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no outreach primitives (email/SMS/Twilio/mailto)', () => {
    const hits = FILES.filter((f) =>
      /\b(sendEmail|SendEmailV2|sendSms|twilio)\b|mailto:/i.test(f.code),
    );
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no delete verb anywhere in source (Phase 141L: live transport is non-destructive)', () => {
    // Delete is forbidden in EVERY CRM file — the live persistence adapter and
    // transport seam (141L) expose create/read/update only, never delete.
    const hits = FILES.filter((f) =>
      /\b(deleteRecord|deleteMultiple)\b|method:\s*'DELETE'/.test(f.code),
    );
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no write verbs (create/update/delete) inside React components', () => {
    // The transport / adapter seam legitimately declares createRecord /
    // updateRecord (141L). Components must never call them — they go through
    // providers / hooks. So the write-verb ban is scoped to .tsx components.
    const hits = FILES.filter(
      (f) =>
        f.isComponent &&
        (/\b(createRecord|updateRecord|deleteRecord)\b/.test(f.code) ||
          /method:\s*'(POST|PATCH|DELETE)'/.test(f.code)),
    );
    expect(hits.map((h) => h.rel)).toEqual([]);
  });
});

describe('Phase 141B-H — no fake customer/vendor/contact data; no sample emails/phones', () => {
  it('no sample email addresses or phone numbers in production source', () => {
    const hits: string[] = [];
    for (const f of FILES) {
      // A literal email like x@y.z inside a string is forbidden in source.
      if (/['"`][a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}['"`]/i.test(f.code)) hits.push(`${f.rel} email`);
      // A literal US phone number.
      if (/\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/.test(f.code)) hits.push(`${f.rel} phone`);
      if (/\$\s*\d/.test(f.code)) hits.push(`${f.rel} $-literal`);
    }
    expect(hits).toEqual([]);
  });

  it('no common fake customer / vendor placeholder names', () => {
    const NAMES = [/\bAcme\b/i, /\bJohn\s+Smith\b/i, /\bContoso\b/i, /\bFabrikam\b/i, /\bWidget(s)?\s+(Inc|LLC)\b/i];
    const hits: string[] = [];
    for (const f of FILES) for (const re of NAMES) if (re.test(f.code)) hits.push(`${f.rel} ${re}`);
    expect(hits).toEqual([]);
  });

  it('App.tsx registers no CRM route (no permission widening)', () => {
    const app = readFileSync(resolve(REPO_ROOT, 'src/App.tsx'), 'utf8');
    expect(app).not.toMatch(/\bcrm\b|CrmRelationship/i);
  });
});

describe('Phase 141B-H — disabled adapter + fail-closed engines', () => {
  it('the disabled adapter writes nothing', async () => {
    const a = createDisabledCrmPersistenceAdapter();
    expect(a.enabled).toBe(false);
    expect((await a.savePerson({ personId: 'X', personType: 'other', status: 'active' })).ok).toBe(false);
  });

  it('readiness fails closed: no contact → not outreach-ready', () => {
    const r = deriveCrmContactReadiness({ subject: { ownerType: 'person', ownerId: 'P', contactPoints: [], authorizations: [] } });
    expect(r.outreachReady).toBe(false);
    expect(r.uploadLinkReady).toBe(false);
  });

  it('recipient resolver fails closed when no borrower is linked', () => {
    const r = resolveBorrowerRequestRecipient({ master: createEmptyCrmMaster(), loanId: 'L' });
    expect(r.outreachReady).toBe(false);
    expect(r.uploadLinkReady).toBe(false);
  });
});
