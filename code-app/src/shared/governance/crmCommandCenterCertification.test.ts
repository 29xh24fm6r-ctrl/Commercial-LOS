import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const CRM_SRC = resolve(__dirname, '..', '..', 'crm');

function readDoc(rel: string): string {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
}

function collectSourceFiles(dir: string): { rel: string; code: string }[] {
  const results: { rel: string; code: string }[] = [];
  if (!existsSync(dir)) return results;
  function walk(d: string) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.tsx')) continue;
      if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
        results.push({ rel: full.replace(CRM_SRC, 'src/crm'), code: readFileSync(full, 'utf8') });
      }
    }
  }
  walk(dir);
  return results;
}

// Phase 146 subdirectories
const PHASE_146_DIRS = ['commandCenter', 'dailyActions', 'managerIntelligence', 'executiveStrategy'];

describe('Phase 146J — all Phase 146 docs exist on disk', () => {
  const REQUIRED_DOCS = [
    'docs/PHASE_146A_CRM_COMMAND_CENTER_SHELL.md',
    'docs/PHASE_146B_CRM_SOURCE_OF_TRUTH_COCKPIT.md',
    'docs/PHASE_146C_CRM_RELATIONSHIP_INTELLIGENCE_DRILLTHROUGH.md',
    'docs/PHASE_146D_CRM_SYNC_PREVIEW_COCKPIT.md',
    'docs/PHASE_146E_CRM_DRY_RUN_WRITEBACK_COMMAND_CENTER.md',
    'docs/PHASE_146F_BANKER_CRM_DAILY_ACTION_QUEUE.md',
    'docs/PHASE_146G_MANAGER_CRM_PIPELINE_INTELLIGENCE.md',
    'docs/PHASE_146H_EXECUTIVE_CRM_REVENUE_PRODUCT_STRATEGY.md',
    'docs/PHASE_146I_CRM_COMMAND_CENTER_ROUTE_MOUNTING.md',
    'docs/PHASE_146J_CRM_COMMAND_CENTER_CERTIFICATION.md',
  ];
  for (const rel of REQUIRED_DOCS) {
    it(`${rel} exists`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});

describe('Phase 146J — Phase 146 source files have no forbidden patterns', () => {
  const allFiles = PHASE_146_DIRS.flatMap((d) => collectSourceFiles(join(CRM_SRC, d)));
  // Include syncPreview and writeback 146 files
  const extraDirs = ['syncPreview', 'relationshipIntelligence'];
  for (const d of extraDirs) {
    allFiles.push(...collectSourceFiles(join(CRM_SRC, d)).filter((f) =>
      f.code.includes('Phase 146') || f.rel.includes('Cockpit') || f.rel.includes('Drillthrough') || f.rel.includes('drillthrough'),
    ));
  }

  it('discovers Phase 146 source files', () => {
    expect(allFiles.length).toBeGreaterThan(0);
  });

  const FORBIDDEN = [
    { pattern: /\bfetch\s*\(/, label: 'fetch()' },
    { pattern: /XMLHttpRequest/, label: 'XMLHttpRequest' },
    { pattern: /\baxios\b/, label: 'axios' },
    { pattern: /\b(PATCH|PUT|DELETE)\b|\.post\s*\(|method:\s*['"]POST['"]/, label: 'HTTP method verb' },
    { pattern: /salesforce.*token|nCino.*token|sfdc.*secret/i, label: 'CRM token/secret' },
    { pattern: /\beval\s*\(/, label: 'eval()' },
    { pattern: /new\s+Function\s*\(/, label: 'Function constructor' },
    { pattern: /dangerouslySetInnerHTML/, label: 'dangerouslySetInnerHTML' },
    { pattern: /syncNow|pushNow|writeNow|enableLive|updateSalesforceNow|updateNcinoNow/, label: 'action handler' },
    { pattern: /synced successfully|pushed successfully|Salesforce updated|nCino updated|live write completed/i, label: 'fake success copy' },
  ];

  for (const { pattern, label } of FORBIDDEN) {
    it(`no Phase 146 source contains ${label}`, () => {
      for (const f of allFiles) {
        // Strip comments before checking
        const stripped = f.code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
        expect(stripped, `${f.rel} contains forbidden ${label}`).not.toMatch(pattern);
      }
    });
  }
});

describe('Phase 146J — safety booleans pinned in view model source', () => {
  it('command center VM source pins all safety booleans as literals', () => {
    const src = readFileSync(resolve(CRM_SRC, 'commandCenter/crmCommandCenterViewModel.ts'), 'utf8');
    expect(src).toContain('readOnly: true');
    expect(src).toContain('previewOnly: true');
    expect(src).toContain('dryRunOnly: true');
    expect(src).toContain('liveWritePerformed: false');
    expect(src).toContain('salesforceWritePerformed: false');
    expect(src).toContain('ncinoWritePerformed: false');
    expect(src).toContain('externalSystemChanged: false');
    expect(src).toContain('allowedForLiveWriteNow: false');
  });

  it('sync preview VM source pins all safety booleans', () => {
    const src = readFileSync(resolve(CRM_SRC, 'syncPreview/crmSyncPreviewCockpitViewModel.ts'), 'utf8');
    expect(src).toContain('previewOnly: true');
    expect(src).toContain('liveWritePerformed: false');
    expect(src).toContain('crmRecordCreated: false');
    expect(src).toContain('crmRecordUpdated: false');
    expect(src).toContain('crmRecordLinked: false');
    expect(src).toContain('externalSystemChanged: false');
  });

  it('dry-run writeback VM source pins all safety booleans', () => {
    const src = readFileSync(resolve(CRM_SRC, 'writeback/crmDryRunWritebackCommandViewModel.ts'), 'utf8');
    expect(src).toContain('dryRunOnly: true');
    expect(src).toContain('allowedForLiveWriteNow: false');
    expect(src).toContain('liveWritePerformed: false');
    expect(src).toContain('salesforceWritePerformed: false');
    expect(src).toContain('ncinoWritePerformed: false');
    expect(src).toContain('externalSystemChanged: false');
  });
});

describe('Phase 146J — certification doc pins safety posture', () => {
  it('certification doc exists and pins key guarantees', () => {
    const doc = readDoc('docs/PHASE_146J_CRM_COMMAND_CENTER_CERTIFICATION.md');
    expect(doc).toContain('No live Salesforce writes');
    expect(doc).toContain('No live nCino writes');
    expect(doc).toMatch(/No.*credentials/i);
    expect(doc).toContain('No Dataverse writes');
    expect(doc).toContain('readOnly');
    expect(doc).toContain('previewOnly');
    expect(doc).toContain('dryRunOnly');
  });
});
