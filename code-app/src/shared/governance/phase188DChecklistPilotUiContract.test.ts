import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * PHASE 188D — static governance pins for the disabled checklist pilot UI. The
 * panel + view-model + config must never import a borrower-comms module, the
 * generator adapter, or the live deps; never call a Dataverse write; never
 * enable the gate; and be mounted banker-only.
 */

const ROOT = resolve(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

const PANEL = read('src/deals/DocumentChecklistPilotPanel.tsx');
const VM = read('src/deals/documentChecklistPilotViewModel.ts');
const CONFIG = read('src/deals/documentChecklistPilotConfig.ts');
const DEAL_DOCS = read('src/deals/DealDocuments.tsx');
const FLAGS = read('src/deals/dealOriginationFeatureFlags.ts');

const UI_FILES: ReadonlyArray<readonly [string, string]> = [
  ['panel', PANEL],
  ['view-model', VM],
  ['config', CONFIG],
];

describe('comms boundary — no borrower communication anywhere in the UI path', () => {
  for (const [label, src] of UI_FILES) {
    it(`${label} imports no email/SMS/Outlook/handoff/request module`, () => {
      const imports = src.split('\n').filter((l) => /^\s*import\b/.test(l)).join('\n');
      for (const re of [
        /sendDocumentRequestEmail/,
        /prepareDocumentRequestHandoff/,
        /emailDelivery/,
        /outlook/i,
        /\bsms\b/i,
        /handoff/i,
        /\bmailto\b/,
      ]) {
        expect(imports).not.toMatch(re);
      }
    });
  }

  it('the panel has no borrower-send language or mailto', () => {
    expect(PANEL).not.toMatch(/mailto:/);
    expect(PANEL).not.toMatch(/send request|request documents|borrower email/i);
  });
});

describe('adapter / live-deps / service boundary', () => {
  it('the UI never imports the generator adapter or its live deps', () => {
    for (const [, src] of UI_FILES) {
      expect(src).not.toMatch(/generateAuditedDocumentChecklist/);
      expect(src).not.toMatch(/newDealChecklistGenerationLiveDeps/);
      expect(src).not.toMatch(/newDealChecklistGenerationAdapter/);
    }
  });

  it('the UI calls no generated Dataverse service create/update/delete', () => {
    for (const [, src] of UI_FILES) {
      expect(src).not.toMatch(/Cr664_\w+Service/);
      expect(src).not.toMatch(/\.(create|update|delete)Record/);
    }
  });
});

describe('gate stays disabled', () => {
  it('DOCUMENT_CHECKLIST_GENERATION_ENABLED is true (Phase 256B flipped it; the pilot UI did not)', () => {
    // Phase 256B flipped the runtime gate true after the GO document-checklist smoke. The pilot
    // UI flag below stays false and the view-model still forces canGenerate false.
    expect(FLAGS).toMatch(/DOCUMENT_CHECKLIST_GENERATION_ENABLED = true as const/);
  });

  it('the pilot UI flag is a disabled constant; the view-model forces canGenerate false', () => {
    expect(CONFIG).toMatch(/DOCUMENT_CHECKLIST_PILOT_UI_ENABLED = false as const/);
    expect(VM).toMatch(/canGenerate: false/);
    expect(VM).toMatch(/readonly canGenerate: false/);
    expect(PANEL).toMatch(/const generateDisabled = true/);
  });

  it('nothing flips a gate to true', () => {
    for (const [, src] of [...UI_FILES, ['deal-docs', DEAL_DOCS] as const]) {
      expect(src).not.toMatch(/DOCUMENT_CHECKLIST_(GENERATION|PILOT_UI)_ENABLED\s*=\s*true/);
    }
  });
});

describe('placement — banker-only, no route change', () => {
  it('DealDocuments mounts the panel only for a banker and not in readOnly', () => {
    expect(DEAL_DOCS).toMatch(/import \{ DocumentChecklistPilotPanel \}/);
    expect(DEAL_DOCS).toMatch(/!readOnly && banker && \(\s*\n?\s*<DocumentChecklistPilotPanel/);
  });

  it('the panel is imported by exactly one runtime surface: DealDocuments', () => {
    expect(read('src/deals/DealDocuments.tsx')).toMatch(/DocumentChecklistPilotPanel/);
  });

  it('introduces no new route and no auto-run on New Deal create', () => {
    for (const [, src] of UI_FILES) {
      expect(src).not.toMatch(/createBrowserRouter|<Route|path:\s*['"]/);
      expect(src).not.toMatch(/orchestrateDealOrigination|runGovernedCreate|onCreateDeal/);
    }
  });
});
