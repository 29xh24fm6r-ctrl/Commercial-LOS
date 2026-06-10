import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const CRM_SRC = resolve(__dirname, '..', '..', 'crm');

describe('Phase 147F — all Phase 147 docs exist on disk', () => {
  const DOCS = [
    'docs/PHASE_147A_CRM_COMMAND_CENTER_VISUAL_DENSITY.md',
    'docs/PHASE_147B_SALESFORCE_LANE_EXPERIENCE.md',
    'docs/PHASE_147C_NCINO_LANE_EXPERIENCE.md',
    'docs/PHASE_147D_CRM_RELATIONSHIP_INTELLIGENCE_STORYTELLING.md',
    'docs/PHASE_147E_CRM_COMMAND_CENTER_ENTRY_POINTS.md',
    'docs/PHASE_147F_CRM_VISUAL_POLISH_CERTIFICATION.md',
  ];
  for (const rel of DOCS) {
    it(`${rel} exists`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});

describe('Phase 147F — Phase 147 source files exist', () => {
  const FILES = [
    'src/crm/salesforceLane/salesforceLaneViewModel.ts',
    'src/crm/salesforceLane/SalesforceLane.tsx',
    'src/crm/ncinoLane/ncinoLaneViewModel.ts',
    'src/crm/ncinoLane/NcinoLane.tsx',
    'src/crm/commandCenter/CrmRelationshipIntelligenceStory.tsx',
    'src/crm/commandCenter/CrmWorkspaceEntryCard.tsx',
  ];
  for (const rel of FILES) {
    it(`${rel} exists`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});

describe('Phase 147F — safety booleans pinned in lane VMs', () => {
  it('Salesforce lane VM pins safety booleans', () => {
    const src = readFileSync(resolve(CRM_SRC, 'salesforceLane/salesforceLaneViewModel.ts'), 'utf8');
    expect(src).toContain('readOnly: true');
    expect(src).toContain('previewOnly: true');
    expect(src).toContain('liveWritePerformed: false');
    expect(src).toContain('salesforceWritePerformed: false');
  });

  it('nCino lane VM pins safety booleans', () => {
    const src = readFileSync(resolve(CRM_SRC, 'ncinoLane/ncinoLaneViewModel.ts'), 'utf8');
    expect(src).toContain('readOnly: true');
    expect(src).toContain('previewOnly: true');
    expect(src).toContain('liveWritePerformed: false');
    expect(src).toContain('ncinoWritePerformed: false');
  });
});

describe('Phase 147F — no forbidden patterns in Phase 147 source', () => {
  function readSafe(rel: string): string {
    const full = resolve(REPO_ROOT, rel);
    return existsSync(full) ? readFileSync(full, 'utf8') : '';
  }

  const FILES = [
    'src/crm/salesforceLane/salesforceLaneViewModel.ts',
    'src/crm/salesforceLane/SalesforceLane.tsx',
    'src/crm/ncinoLane/ncinoLaneViewModel.ts',
    'src/crm/ncinoLane/NcinoLane.tsx',
    'src/crm/commandCenter/CrmRelationshipIntelligenceStory.tsx',
    'src/crm/commandCenter/CrmWorkspaceEntryCard.tsx',
  ];

  const FORBIDDEN = [
    { pattern: /\bfetch\s*\(/, label: 'fetch()' },
    { pattern: /XMLHttpRequest/, label: 'XMLHttpRequest' },
    { pattern: /\baxios\b/, label: 'axios' },
    { pattern: /\beval\s*\(/, label: 'eval()' },
    { pattern: /new\s+Function\s*\(/, label: 'Function constructor' },
    { pattern: /dangerouslySetInnerHTML/, label: 'dangerouslySetInnerHTML' },
    { pattern: /syncNow|pushNow|writeNow|enableLive/, label: 'action handler' },
    { pattern: /synced successfully|pushed successfully|connected successfully/i, label: 'fake success' },
  ];

  for (const { pattern, label } of FORBIDDEN) {
    it(`no Phase 147 source contains ${label}`, () => {
      for (const rel of FILES) {
        const code = readSafe(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
        expect(code, `${rel} contains ${label}`).not.toMatch(pattern);
      }
    });
  }
});

describe('Phase 147F — certification doc pins safety posture', () => {
  it('certification doc pins key guarantees', () => {
    const doc = readFileSync(resolve(REPO_ROOT, 'docs/PHASE_147F_CRM_VISUAL_POLISH_CERTIFICATION.md'), 'utf8');
    expect(doc).toContain('No live Salesforce writes');
    expect(doc).toContain('No live nCino writes');
    expect(doc).toContain('readOnly');
    expect(doc).toContain('previewOnly');
    expect(doc).toContain('dryRunOnly');
  });
});
