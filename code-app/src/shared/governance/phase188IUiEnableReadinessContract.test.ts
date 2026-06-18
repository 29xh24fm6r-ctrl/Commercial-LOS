import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * PHASE 188I — static governance pins for the UI-enable readiness PLAN.
 *
 * 188I is docs/tests/view-model + a single disabled future-state flag. It must
 * enable NOTHING: both gates stay false, the panel button stays disabled, the
 * readiness model imports no adapter / live deps / borrower-comms module and
 * does no IO, the checklist row allow-list stays two fields, the correlation id
 * stays audit-only, and no route / New Deal auto-run is introduced.
 */

const ROOT = resolve(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

const CONFIG = read('src/deals/documentChecklistPilotConfig.ts');
const READINESS = read('src/deals/documentChecklistUiEnableReadiness.ts');
const PILOT_VM = read('src/deals/documentChecklistPilotViewModel.ts');
const PANEL = read('src/deals/DocumentChecklistPilotPanel.tsx');
const FLAGS = read('src/deals/dealOriginationFeatureFlags.ts');
const ADAPTER = read('src/deals/newDealChecklistGenerationAdapter.ts');
const DOC_REL = 'docs/PHASE_188I_DOCUMENT_CHECKLIST_UI_ENABLE_READINESS.md';

// The full UI / readiness surface that must stay non-operative.
const UI_FILES: ReadonlyArray<readonly [string, string]> = [
  ['readiness', READINESS],
  ['pilot view-model', PILOT_VM],
  ['config', CONFIG],
  ['panel', PANEL],
];

describe('188I enables nothing — both gates stay false', () => {
  it('the runtime generation gate remains false', () => {
    expect(FLAGS).toMatch(/DOCUMENT_CHECKLIST_GENERATION_ENABLED = false as const/);
  });

  it('the pilot UI flag remains false', () => {
    expect(CONFIG).toMatch(/DOCUMENT_CHECKLIST_PILOT_UI_ENABLED = false as const/);
  });

  it('the new future-state UI-action flag is a DISABLED constant', () => {
    expect(CONFIG).toMatch(/DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED = false as const/);
  });

  it('nothing flips any checklist gate to true', () => {
    for (const [, src] of [...UI_FILES, ['flags', FLAGS] as const]) {
      expect(src).not.toMatch(
        /DOCUMENT_CHECKLIST_(GENERATION_ENABLED|PILOT_UI_ENABLED|UI_GENERATE_ACTION_ENABLED)\s*=\s*true/,
      );
    }
  });
});

describe('188I keeps the UI non-operative', () => {
  it('the pilot view-model still forces canGenerate false', () => {
    expect(PILOT_VM).toMatch(/readonly canGenerate: false/);
    expect(PILOT_VM).toMatch(/canGenerate: false/);
  });

  it('the panel generate button stays permanently disabled', () => {
    expect(PANEL).toMatch(/const generateDisabled = true/);
  });

  it('the readiness model hard-codes canGenerate false and reports both gates false', () => {
    expect(READINESS).toMatch(/readonly canGenerate: false/);
    expect(READINESS).toMatch(/canGenerate: false/);
    expect(READINESS).toMatch(/uiEnabledNow: false/);
    expect(READINESS).toMatch(/runtimeGenerationEnabled: false/);
  });
});

describe('adapter / live-deps / comms boundary', () => {
  it('no UI/readiness file imports the generator adapter or its live deps', () => {
    for (const [, src] of UI_FILES) {
      expect(src).not.toMatch(/generateAuditedDocumentChecklist/);
      expect(src).not.toMatch(/newDealChecklistGenerationLiveDeps/);
      expect(src).not.toMatch(/from '\.\/newDealChecklistGenerationAdapter'/);
    }
  });

  it('the readiness model imports no borrower-comms module and does no IO', () => {
    const imports = READINESS.split('\n').filter((l) => /^\s*import\b/.test(l)).join('\n');
    for (const re of [
      /sendDocumentRequestEmail/,
      /prepareDocumentRequestHandoff/,
      /emailDelivery/,
      /outlook/i,
      /\bsms\b/i,
      /handoff/i,
      /\bmailto\b/,
      /\bfetch\b/,
    ]) {
      expect(imports).not.toMatch(re);
    }
    // Pure module: no IO calls anywhere in the body.
    expect(READINESS).not.toMatch(/\bawait\b/);
    expect(READINESS).not.toMatch(/\bfetch\(/);
    expect(READINESS).not.toMatch(/\.(create|update|delete)Record/);
  });

  it('the readiness model has no mailto or borrower-send call', () => {
    // NOTE: the model legitimately documents "No borrower email / SMS ..." in its
    // forbidden-after-enablement list, so we assert against actual send wiring
    // (a mailto link or an imperative send call), not the forbidden-list wording.
    expect(READINESS).not.toMatch(/mailto:/);
    expect(READINESS).not.toMatch(/sendDocumentRequest|sendBorrower|requestDocuments\s*\(/);
  });
});

describe('row payload + correlation id invariants hold', () => {
  it('the checklist row allow-list remains exactly two fields', () => {
    expect(ADAPTER).toMatch(
      /DOCUMENT_CHECKLIST_ALLOWED_FIELDS = Object\.freeze\(\[\s*'cr664_documentname',\s*'cr664_Deal@odata\.bind',\s*\] as const\)/,
    );
  });

  it('no checklist row payload carries cr664_correlationid (audit-only)', () => {
    // The only cr664_correlationid mention in the adapter is the 188G comment.
    const payloadCorrelation = ADAPTER.match(/cr664_correlationid/g) ?? [];
    expect(payloadCorrelation.length).toBeLessThanOrEqual(1);
    // The readiness model documents correlation id as audit-only.
    expect(READINESS).toMatch(/[Cc]orrelation id \(audit-only/);
  });
});

describe('no route, no New Deal auto-run', () => {
  it('the readiness model adds no route and no New Deal auto-run', () => {
    expect(READINESS).not.toMatch(/createBrowserRouter|<Route|path:\s*['"]/);
    expect(READINESS).not.toMatch(/orchestrateDealOrigination|runGovernedCreate|onCreateDeal/);
  });
});

describe('the 188I readiness doc records the 188J proof preconditions', () => {
  it('the doc exists on disk', () => {
    expect(existsSync(resolve(ROOT, DOC_REL))).toBe(true);
  });

  const DOC = read(DOC_REL);

  it('documents the two-gate enable condition', () => {
    expect(DOC).toMatch(/DOCUMENT_CHECKLIST_GENERATION_ENABLED/);
    expect(DOC).toMatch(/DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED/);
  });

  it('documents required actor + deal identity and approved-name source', () => {
    expect(DOC).toMatch(/\/cr664_users\(<CoreUser>\)/);
    expect(DOC).toMatch(/never[\s`]*\/systemusers/i);
    expect(DOC).toMatch(/exact deal id/i);
    expect(DOC).toMatch(/DOCUMENT_CHECKLIST_PILOT_APPROVED_NAMES/);
  });

  it('documents the readiness statuses and UI state mapping', () => {
    expect(DOC).toMatch(/ready_for_future_enablement/);
    expect(DOC).toMatch(/already_generated/);
    expect(DOC).toMatch(/missing_actor_identity/);
    expect(DOC).toMatch(/success_refresh_checklist/);
  });

  it('records forbidden borrower comms + forbidden New Deal auto-run + no live writes in 188I', () => {
    expect(DOC).toMatch(/No borrower (communication|email)/i);
    expect(DOC).toMatch(/No New Deal auto-run/i);
    expect(DOC).toMatch(/no live writes/i);
  });

  it('records the rollback switch', () => {
    expect(DOC).toMatch(/[Rr]ollback/);
    expect(DOC).toMatch(/=false/);
  });
});
