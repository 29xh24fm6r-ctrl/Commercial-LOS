import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * PHASE 188F — document checklist pilot certification pins.
 *
 * Pins the certification doc's recorded live-proof facts and re-asserts the
 * runtime safety boundaries hold at certification time. Docs/source pins only.
 */

const ROOT = resolve(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');
const CERT_REL = 'docs/PHASE_188F_DOCUMENT_CHECKLIST_PILOT_CERTIFICATION.md';

describe('certification doc + recorded live-proof facts', () => {
  it('the 188F certification doc exists', () => {
    expect(existsSync(resolve(ROOT, CERT_REL))).toBe(true);
  });

  const CERT = read(CERT_REL);

  it('certifies PILOT_LIVE_CONTROLLED and records the proof deal id', () => {
    expect(CERT).toMatch(/PILOT_LIVE_CONTROLLED/);
    expect(CERT).toMatch(/1a10a165-756a-f111-ab0c-70a8a59be491/);
  });

  it('records all three created checklist row ids', () => {
    for (const id of [
      '7a674efc-a36a-f111-ab0c-70a8a59be491',
      '7c674efc-a36a-f111-ab0c-70a8a59be491',
      '7e674efc-a36a-f111-ab0c-70a8a59be491',
    ]) {
      expect(CERT).toMatch(new RegExp(id));
    }
  });

  it('records PROOF_CREATED and ALREADY_GENERATED', () => {
    expect(CERT).toMatch(/PROOF_CREATED/);
    expect(CERT).toMatch(/ALREADY_GENERATED/);
  });

  it('records no borrower communication', () => {
    expect(CERT).toMatch(/No borrower communication/i);
    expect(CERT).toMatch(/no email\s*\/\s*SMS\s*\/\s*Outlook\s*\/\s*handoff/i);
  });

  it('records DOCUMENT_CHECKLIST_GENERATION_ENABLED remained false', () => {
    expect(CERT).toMatch(/DOCUMENT_CHECKLIST_GENERATION_ENABLED.*remained.*false|remained.*false/i);
    expect(CERT).toMatch(/DOCUMENT_CHECKLIST_GENERATION_ENABLED/);
  });

  it('records cr664_correlationid was audit-only', () => {
    expect(CERT).toMatch(/excluded `?cr664_correlationid`?/i);
    expect(CERT).toMatch(/[Cc]orrelation id was audit-only/);
  });

  it('records the /cr664_users actor bind and rejects /systemusers', () => {
    expect(CERT).toMatch(/\/cr664_users\(940a202e-756a-f111-ab0c-70a8a59be491\)/);
    expect(CERT).toMatch(/never.*\/systemusers|not.*\/systemusers/i);
  });
});

describe('runtime boundaries still hold at certification', () => {
  it('the generator adapter + live deps import no borrower-comms module', () => {
    const adapter = read('src/deals/newDealChecklistGenerationAdapter.ts');
    const live = read('src/deals/newDealChecklistGenerationLiveDeps.ts');
    for (const src of [adapter, live]) {
      const imports = src.split('\n').filter((l) => /^\s*import\b/.test(l)).join('\n');
      for (const re of [/sendDocumentRequestEmail/, /prepareDocumentRequestHandoff/, /emailDelivery/, /outlook/i, /\bsms\b/i, /handoff/i, /mailto/]) {
        expect(imports).not.toMatch(re);
      }
    }
  });

  it('the app-runtime generation gate is true (Phase 256B flipped it after the 188F certification)', () => {
    // Phase 256B flipped this constant true after the GO document-checklist smoke; the 188F
    // certification doc above records the historical false state at certification time.
    expect(read('src/deals/dealOriginationFeatureFlags.ts')).toMatch(/DOCUMENT_CHECKLIST_GENERATION_ENABLED = true as const/);
  });

  it('the pilot UI generate action remains disabled', () => {
    expect(read('src/deals/documentChecklistPilotConfig.ts')).toMatch(/DOCUMENT_CHECKLIST_PILOT_UI_ENABLED = false as const/);
    expect(read('src/deals/DocumentChecklistPilotPanel.tsx')).toMatch(/const generateDisabled = true/);
    expect(read('src/deals/documentChecklistPilotViewModel.ts')).toMatch(/canGenerate: false/);
  });

  it('no route is added by the checklist pilot UI (no route count change)', () => {
    for (const rel of [
      'src/deals/DocumentChecklistPilotPanel.tsx',
      'src/deals/documentChecklistPilotViewModel.ts',
      'src/deals/documentChecklistPilotConfig.ts',
    ]) {
      const src = read(rel);
      expect(src).not.toMatch(/createBrowserRouter|<Route|path:\s*['"]/);
    }
  });
});
