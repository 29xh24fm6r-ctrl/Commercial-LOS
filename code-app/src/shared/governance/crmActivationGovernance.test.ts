import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

/**
 * Phase 143 — CRM activation arc governance (global scan).
 *
 * Pins the controlled CRM activation contract across the Phase 143 production
 * source: NO live transport (fetch/XMLHttpRequest/axios/POST/PATCH/PUT/DELETE/
 * Graph/Outlook/Power Automate/sendMail/webhook), NO Salesforce/nCino token/secret/
 * env var/endpoint URL, NO Dataverse create/update/upsert/delete, NO eval/Function,
 * NO "synced/pushed/updated successfully" or "live write completed" copy, NO
 * fake/sample/mock data, and NO syncNow/pushNow/writeNow action handlers. Asserts
 * the disabled/dry-run/read-only result booleans are present. NOTE: only the
 * explicit 143 production files are scanned (never the existing live 141-era CRM
 * Dataverse files), and the inline content-safety regex literals carry escapes so
 * the execution scans do not match them.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const CRM_143_PROD_FILES: readonly string[] = [
  'src/crm/activation/crmActivationSafety.ts',
  'src/crm/sourceOfTruth/crmSourceOfTruthMap.ts',
  'src/crm/connectors/crmConnectorReadiness.ts',
  'src/crm/matching/crmEntityMatchingModel.ts',
  'src/crm/syncPreview/crmSyncPreviewPlan.ts',
  'src/crm/writeback/crmWritebackPolicyGate.ts',
  'src/crm/writeback/crmControlledWritebackAdapter.ts',
  'src/crm/writeback/crmAllowlistedLiveWritePilot.ts',
  'src/crm/activityTimeline/crmActivityTimelineModel.ts',
  'src/crm/activityTimeline/CrmActivityTimelinePanel.tsx',
  'src/crm/relationshipIntelligence/crmRelationshipIntelligenceViewModel.ts',
  'src/crm/relationshipIntelligence/CrmRelationshipIntelligenceCockpit.tsx',
];

const PHASE_143_DOCS: readonly string[] = [
  'docs/PHASE_143A_CRM_ACTIVATION_INVENTORY_SOURCE_OF_TRUTH.md',
  'docs/PHASE_143B_SALESFORCE_NCINO_CONNECTOR_READINESS_AUDIT.md',
  'docs/PHASE_143C_CRM_IDENTITY_ENTITY_MATCHING_MODEL.md',
  'docs/PHASE_143D_CRM_SYNC_PREVIEW_NO_WRITES.md',
  'docs/PHASE_143E_CRM_WRITEBACK_POLICY_GATE_DISABLED.md',
  'docs/PHASE_143F_CRM_CONTROLLED_WRITEBACK_DRY_RUN_ADAPTER.md',
  'docs/PHASE_143G_CRM_ACTIVITY_TIMELINE_ENRICHMENT_READ_ONLY.md',
  'docs/PHASE_143H_CRM_RELATIONSHIP_INTELLIGENCE_COCKPIT.md',
  'docs/PHASE_143I_CRM_ALLOWLISTED_LIVE_WRITE_PILOT_SCAFFOLD.md',
  'docs/PHASE_143J_CRM_ACTIVATION_CERTIFICATION_AND_ROLLBACK.md',
];

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const SOURCES = CRM_143_PROD_FILES.map((rel) => ({
  rel: relative(REPO_ROOT, resolve(REPO_ROOT, rel)).split(sep).join('/'),
  isComponent: rel.endsWith('.tsx'),
  raw: readFileSync(resolve(REPO_ROOT, rel), 'utf8'),
  code: stripComments(readFileSync(resolve(REPO_ROOT, rel), 'utf8')),
}));
const ALL_RAW = SOURCES.map((s) => s.raw).join('\n');

describe('Phase 143 — required docs and source exist', () => {
  for (const rel of [...PHASE_143_DOCS, ...CRM_143_PROD_FILES, 'src/shared/governance/crmActivationGovernance.test.ts']) {
    it(`${rel} exists`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});

describe('Phase 143 — no live transport / write / connector secret', () => {
  it('imports only relative modules + react', () => {
    for (const f of SOURCES) {
      const specifiers = Array.from(f.code.matchAll(/(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]/g)).map((m) => m[1]);
      for (const spec of specifiers) {
        expect(spec === 'react' || spec.startsWith('.'), `${f.rel} imports ${spec}`).toBe(true);
      }
    }
  });

  it('no fetch / XMLHttpRequest / axios', () => {
    const hits = SOURCES.filter((f) => /\b(fetch|XMLHttpRequest)\s*\(|\baxios\b/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no POST / PATCH / PUT / DELETE method string', () => {
    const hits = SOURCES.filter((f) => /method:\s*['"](POST|PATCH|PUT|DELETE)['"]|\b(POST|PATCH|PUT|DELETE)\b\s*:/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no Graph / Outlook / Power Automate API usage', () => {
    // Target execution-style usage only; honest negated disclaimers ("No Outlook/Graph
    // lookup occurs") legitimately name these systems and must not trip the scan.
    const hits = SOURCES.filter((f) => /graph\.microsoft|microsoftgraph|outlook(client|service|services|api)|power[\s_-]?automate/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no sendMail / webhook registration', () => {
    const hits = SOURCES.filter((f) => /\bsendMail\s*\(|registerWebhook\s*\(|createWebhook\s*\(/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no Salesforce / nCino token / secret / env var / endpoint URL', () => {
    // Uppercase env-constant form only ((SALESFORCE|NCINO)_FOO) so camelCase safety
    // booleans like `salesforceWritePerformed: false` are not mistaken for secrets.
    const hits = SOURCES.filter((f) =>
      /process\.env|https?:\/\//.test(f.raw) ||
      /\b(SALESFORCE|NCINO)_[A-Z][A-Z_]*\s*[:=]/.test(f.raw) ||
      /(api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token)\s*[:=]\s*['"][^'"]+['"]/i.test(f.raw),
    );
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no Dataverse create / update / upsert / delete call', () => {
    const hits = SOURCES.filter((f) => /\b(createRecord|updateRecord|deleteRecord|upsert\w*)\s*\(/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no eval / Function constructor', () => {
    const hits = SOURCES.filter((f) => /\beval\s*\(|new\s+Function\b/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no syncNow / pushNow / writeNow / updateSalesforceNow / updateNcinoNow action handler', () => {
    const hits = SOURCES.filter((f) => /\b(syncNow|pushNow|writeNow|updateSalesforceNow|updateNcinoNow)\s*\(?/i.test(f.code) || /<button/i.test(f.code) || /onClick/i.test(f.code) || /<form\b/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no misleading synced/pushed/updated-successfully / live-write-completed copy', () => {
    const hits = SOURCES.filter((f) => /synced successfully|pushed successfully|salesforce updated|ncino updated|live write completed|write completed successfully/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no fake / sample / mock data', () => {
    const hits = SOURCES.filter((f) => /\b(sampleData|mockData|fakeData|SAMPLE_\w+|MOCK_\w+|FAKE_\w+|dummyData)\b/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('App.tsx mounts no Phase 143 CRM activation route (mounting deferred)', () => {
    const app = readFileSync(resolve(REPO_ROOT, 'src/App.tsx'), 'utf8');
    expect(app).not.toMatch(/CrmRelationshipIntelligenceCockpit|crmControlledWritebackAdapter|crmWritebackPolicyGate/);
  });
});

describe('Phase 143 — disabled/dry-run/read-only result contracts present', () => {
  const REQUIRED_BOOLEANS: readonly string[] = [
    'liveConnectionAttempted: false',
    'liveWritePerformed: false',
    'credentialsStored: false',
    'externalSystemChanged: false',
    'readOnly: true',
    'crmRecordLinked: false',
    'previewOnly: true',
    'crmRecordCreated: false',
    'crmRecordUpdated: false',
    'allowedForLiveWriteNow: false',
    'dryRunOnly: true',
    'salesforceWritePerformed: false',
    'ncinoWritePerformed: false',
    'liveCrmLookupPerformed: false',
    'liveWritePilotEnabled: false',
  ];
  for (const literal of REQUIRED_BOOLEANS) {
    it(`pins "${literal}" in the CRM activation source`, () => {
      expect(ALL_RAW.includes(literal)).toBe(true);
    });
  }
});
