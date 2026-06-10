import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import { sanitizeDrillThroughTargetId } from '../drillthrough/drillThroughDeepLink';
import {
  hasDrillThroughContent,
  resolveDrillThroughAction,
  validateDrillThroughTarget,
} from '../drillthrough/drillThroughTypes';
import { crmRelationshipSectionTargets } from '../../crm/relationshipIntelligence/crmRelationshipDrillThrough';

/**
 * Phase 144E — drill-through deep-link expansion governance.
 *
 * Proves Manager / Team / Executive / CRM cockpits all opt into the shared 144D
 * deep-link helper (no second framework), the CRM adapter is read-only and adds
 * no write/network/exec pattern, every CRM section target is deep-linkable and
 * resolves, and the panel payload comes from the local registry — not the URL.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const DEEP_LINK_COCKPITS: ReadonlyArray<{ workspace: string; file: string }> = [
  { workspace: 'manager', file: 'src/manager/ManagerBloombergControlPanel.tsx' },
  { workspace: 'team', file: 'src/team/TeamOpsQueue.tsx' },
  { workspace: 'executive', file: 'src/executive/ExecutiveCommandCenter.tsx' },
  { workspace: 'crm', file: 'src/crm/relationshipIntelligence/CrmRelationshipIntelligenceCockpit.tsx' },
];

const NEW_PROD_FILES: readonly string[] = [
  'src/crm/relationshipIntelligence/crmRelationshipDrillThrough.ts',
];

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const NEW_SOURCES = NEW_PROD_FILES.map((rel) => ({
  rel: relative(REPO_ROOT, resolve(REPO_ROOT, rel)).split(sep).join('/'),
  code: stripComments(readFileSync(resolve(REPO_ROOT, rel), 'utf8')),
}));

describe('Phase 144E — doc + new source exist', () => {
  for (const rel of [...NEW_PROD_FILES, 'docs/PHASE_144E_EXTEND_DRILL_THROUGH_DEEP_LINKS.md']) {
    it(`${rel} exists`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});

describe('Phase 144E — every cockpit opts into the shared deep-link helper', () => {
  for (const c of DEEP_LINK_COCKPITS) {
    it(`${c.workspace} cockpit uses useDrillThroughDeepLink`, () => {
      const src = readFileSync(resolve(REPO_ROOT, c.file), 'utf8');
      expect(src).toMatch(/useDrillThroughDeepLink/);
      expect(src).toMatch(/deepLinkCardProps|deepLink\.isActive/);
    });
  }

  it('the CRM cockpit sources its panels from the local section registry, not the URL', () => {
    const src = readFileSync(resolve(REPO_ROOT, 'src/crm/relationshipIntelligence/CrmRelationshipIntelligenceCockpit.tsx'), 'utf8');
    expect(src).toMatch(/crmRelationshipSectionTargets/);
  });
});

describe('Phase 144E — no second framework / no new route', () => {
  it('no cockpit defines a new route element or router', () => {
    for (const c of DEEP_LINK_COCKPITS) {
      const code = stripComments(readFileSync(resolve(REPO_ROOT, c.file), 'utf8'));
      expect(/<Route\b|createBrowserRouter|createMemoryRouter|<Routes\b/.test(code), `${c.workspace} adds a route`).toBe(false);
    }
  });
});

describe('Phase 144E — CRM adapter adds no write / network / sink / exec', () => {
  it('no fetch / XMLHttpRequest / axios', () => {
    expect(NEW_SOURCES.filter((f) => /\b(fetch|XMLHttpRequest)\s*\(|\baxios\b/.test(f.code)).map((h) => h.rel)).toEqual([]);
  });
  it('no POST / PATCH / PUT / DELETE', () => {
    expect(NEW_SOURCES.filter((f) => /method:\s*['"](POST|PATCH|PUT|DELETE)['"]|\b(POST|PATCH|PUT|DELETE)\b\s*:/.test(f.code)).map((h) => h.rel)).toEqual([]);
  });
  it('no Dataverse create/update/upsert/delete, Salesforce/nCino write', () => {
    expect(NEW_SOURCES.filter((f) => /\b(createRecord|updateRecord|deleteRecord|upsert\w*)\s*\(|salesforce\w*write|ncino\w*write|writeToSalesforce|writeToNcino/i.test(f.code)).map((h) => h.rel)).toEqual([]);
  });
  it('no Graph / Outlook / Power Automate', () => {
    expect(NEW_SOURCES.filter((f) => /graph\.microsoft|microsoftgraph|outlook(client|service|services|api)|power[\s_-]?automate/i.test(f.code)).map((h) => h.rel)).toEqual([]);
  });
  it('no eval / Function constructor / dangerouslySetInnerHTML', () => {
    expect(NEW_SOURCES.filter((f) => /\beval\s*\(|new\s+Function\b|dangerouslySetInnerHTML/.test(f.code)).map((h) => h.rel)).toEqual([]);
  });
  it('no <button> / <form> / onClick / onSubmit', () => {
    expect(NEW_SOURCES.filter((f) => /<button\b|<form\b|onClick|onSubmit/i.test(f.code)).map((h) => h.rel)).toEqual([]);
  });
  it('no approve / deny / vote / sync-now / push-now / apply-now affordance', () => {
    expect(NEW_SOURCES.filter((f) => /['"][^'"]*\b(sync now|push now|apply now|approve|deny|vote)\b[^'"]*['"]/i.test(f.code)).map((h) => h.rel)).toEqual([]);
  });
  it('no fake / sample / mock data', () => {
    expect(NEW_SOURCES.filter((f) => /\b(sampleData|mockData|fakeData|SAMPLE_\w+|MOCK_\w+|FAKE_\w+|dummyData)\b/.test(f.code)).map((h) => h.rel)).toEqual([]);
  });
});

describe('Phase 144E — CRM section targets are read-only, deep-linkable, never blank', () => {
  const sections = [
    { key: 'salesforce_readiness', title: 'Salesforce readiness', status: 'ready_for_dry_run', detail: 'Connector status: ready for dry run.' },
    { key: 'writeback_policy', title: 'Writeback policy status', status: 'blocked_disabled', detail: 'Policy blocked; live write not allowed now.' },
  ];
  const targets = crmRelationshipSectionTargets(sections, 'Document connector readiness (no live connection).');

  it('each target is read-only, valid, resolves to a panel, and has content', () => {
    for (const t of Object.values(targets)) {
      expect(t.readOnly).toBe(true);
      expect(validateDrillThroughTarget(t)).toEqual([]);
      expect(resolveDrillThroughAction(t).kind).toBe('panel');
      expect(hasDrillThroughContent(t)).toBe(true);
    }
  });

  it('each target id is a safe, deep-linkable id', () => {
    for (const t of Object.values(targets)) {
      expect(sanitizeDrillThroughTargetId(t.id)).toBe(t.id);
    }
  });

  it('the detail payload comes from the section view model, not any URL text', () => {
    expect(targets['salesforce_readiness'].sourceFields.some((f) => f.value.includes('ready for dry run'))).toBe(true);
    // The panel summary states it is read-only and performs no live action.
    expect(targets['salesforce_readiness'].summary).toMatch(/no live Salesforce\/nCino lookup, sync, push, or write/i);
  });
});
