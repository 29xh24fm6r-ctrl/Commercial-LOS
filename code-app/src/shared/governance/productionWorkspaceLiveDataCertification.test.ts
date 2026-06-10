import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

describe('Phase 149 — production workspace live data certification docs exist', () => {
  const DOCS = [
    'docs/PHASE_149_PRODUCTION_WORKSPACE_LIVE_DATA_VERIFICATION.md',
    'docs/PHASE_149_NO_FAKE_DATA_CERTIFICATION.md',
  ];
  for (const rel of DOCS) {
    it(`${rel} exists`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});

describe('Phase 149 — verification doc pins certification scope', () => {
  it('verification doc covers production workspace scope', () => {
    const doc = readFileSync(resolve(REPO_ROOT, 'docs/PHASE_149_PRODUCTION_WORKSPACE_LIVE_DATA_VERIFICATION.md'), 'utf8');
    expect(doc.toLowerCase()).toContain('production workspace');
    expect(doc).toContain('authorized data');
    expect(doc).toContain('honest unavailable');
    expect(doc).toContain('No fake');
    expect(doc).not.toMatch(/\bdemo-ready\b/i);
  });

  it('no-fake-data doc covers prohibited patterns', () => {
    const doc = readFileSync(resolve(REPO_ROOT, 'docs/PHASE_149_NO_FAKE_DATA_CERTIFICATION.md'), 'utf8');
    expect(doc).toContain('sampleDeal');
    expect(doc).toContain('mockDeal');
    expect(doc).toContain('honest unavailable');
    expect(doc).toContain('No fake');
  });
});

describe('Phase 149 — CRM surfaces remain preview-only/dry-run/read-only', () => {
  it('CRM command center VM has safety flags', () => {
    const src = readFileSync(resolve(REPO_ROOT, 'src/crm/commandCenter/crmCommandCenterViewModel.ts'), 'utf8');
    expect(src).toContain('readOnly: true');
    expect(src).toContain('previewOnly: true');
    expect(src).toContain('dryRunOnly: true');
    expect(src).toContain('liveWritePerformed: false');
  });
});
