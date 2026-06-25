import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * PHASE 188J — static governance pins for the controlled banker-UI checklist
 * generation PROOF seam.
 *
 * 188J adds a dependency-injected UI-to-adapter bridge plus tests, but it must
 * keep production behavior fail-closed: both UI/action gates stay false, the
 * runtime generation gate stays false, the panel button stays disabled by
 * default, the panel imports no live Dataverse dep / generator adapter /
 * borrower-comms module, the bridge imports no live dep either, the checklist
 * row allow-list stays exactly two fields, the correlation id stays audit-only,
 * and no route / New Deal auto-run is introduced.
 */

const ROOT = resolve(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

const CONFIG = read('src/deals/documentChecklistPilotConfig.ts');
const FLAGS = read('src/deals/dealOriginationFeatureFlags.ts');
const PANEL = read('src/deals/DocumentChecklistPilotPanel.tsx');
const ACTION = read('src/deals/documentChecklistUiGenerationAction.ts');
const ADAPTER = read('src/deals/newDealChecklistGenerationAdapter.ts');
const DOC_REL = 'docs/PHASE_188J_CONTROLLED_BANKER_UI_CHECKLIST_GENERATION_PROOF.md';

describe('188J keeps every checklist gate disabled by default', () => {
  it('the runtime generation gate is true (Phase 256B flipped it; 188J did not)', () => {
    // Phase 256B flipped the runtime gate true after the GO document-checklist smoke. 188J adds a
    // dependency-injected bridge + tests and flips nothing of its own.
    expect(FLAGS).toMatch(/DOCUMENT_CHECKLIST_GENERATION_ENABLED = true as const/);
  });

  it('the pilot UI flag remains false', () => {
    expect(CONFIG).toMatch(/DOCUMENT_CHECKLIST_PILOT_UI_ENABLED = false as const/);
  });

  it('the UI generate-action flag remains a disabled constant', () => {
    expect(CONFIG).toMatch(/DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED = false as const/);
  });

  it('nothing in 188J flips a checklist gate to true (the runtime gate is Phase 256B, not 188J)', () => {
    // 188J's own files (config, panel, action bridge) flip none of the three gates.
    for (const src of [CONFIG, PANEL, ACTION]) {
      expect(src).not.toMatch(
        /DOCUMENT_CHECKLIST_(GENERATION_ENABLED|PILOT_UI_ENABLED|UI_GENERATE_ACTION_ENABLED)\s*=\s*true/,
      );
    }
    // In the flags source only the runtime generation gate is true (flipped by Phase 256B); the
    // two UI gates are not assigned there.
    expect(FLAGS).not.toMatch(/DOCUMENT_CHECKLIST_PILOT_UI_ENABLED\s*=\s*true/);
    expect(FLAGS).not.toMatch(/DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED\s*=\s*true/);
  });
});

describe('188J keeps the panel disabled by default and live-dep-free', () => {
  it('the panel pins the disabled-by-default invariant literal', () => {
    expect(PANEL).toMatch(/const generateDisabled = true/);
  });

  it('the panel imports no generator adapter, live deps, or comms module', () => {
    expect(PANEL).not.toMatch(/generateAuditedDocumentChecklist/);
    // The panel may NAME the bridge in a comment, but must never IMPORT it.
    expect(PANEL).not.toMatch(/from '\.\/documentChecklistUiGenerationAction'/);
    expect(PANEL).not.toMatch(/newDealChecklistGenerationLiveDeps/);
    expect(PANEL).not.toMatch(/from '\.\/newDealChecklistGenerationAdapter'/);
    for (const re of [/sendDocumentRequest/, /BorrowerCommunication/, /emailDelivery/, /mailto:/, /\bfetch\(/]) {
      expect(PANEL).not.toMatch(re);
    }
  });

  it('the panel onGenerate seam is a plain injected callback (no live wiring)', () => {
    // The optional test-only callback is a bare function prop; the panel never
    // constructs a live adapter or a Dataverse client.
    expect(PANEL).toMatch(/onGenerate\?:\s*\(\)\s*=>\s*void/);
    expect(PANEL).not.toMatch(/getClient|@microsoft\/power-apps/);
  });
});

describe('188J bridge imports no live dep / comms / generator adapter', () => {
  it('the action wrapper is a pure injected seam', () => {
    expect(ACTION).not.toMatch(/generateAuditedDocumentChecklist/);
    expect(ACTION).not.toMatch(/newDealChecklistGenerationLiveDeps/);
    expect(ACTION).not.toMatch(/getClient|@microsoft\/power-apps/);
    expect(ACTION).not.toMatch(/\bfetch\(/);
    for (const re of [/sendDocumentRequestEmail/, /prepareDocumentRequestHandoff/, /emailDelivery/, /mailto:/, /\bsms\b/i]) {
      expect(ACTION).not.toMatch(re);
    }
  });

  it('the action wrapper only imports pure modules (types, bind guard, readiness)', () => {
    // Grab every `from '...'` module specifier (handles multi-line type imports).
    const specifiers = (ACTION.match(/from '([^']+)'/g) ?? []).join('\n');
    expect(specifiers).toMatch(/auditActorBind/);
    expect(specifiers).toMatch(/dealOriginationOutcomes/);
    expect(specifiers).toMatch(/documentChecklistUiEnableReadiness/);
    // No import of the generator adapter or its live deps module.
    expect(specifiers).not.toMatch(/newDealChecklistGeneration/);
  });
});

describe('188J row payload + correlation id invariants hold', () => {
  it('the checklist row allow-list remains exactly two fields', () => {
    expect(ADAPTER).toMatch(
      /DOCUMENT_CHECKLIST_ALLOWED_FIELDS = Object\.freeze\(\[\s*'cr664_documentname',\s*'cr664_Deal@odata\.bind',\s*\] as const\)/,
    );
  });

  it('the bridge never constructs a checklist row field and treats correlation id as audit-only', () => {
    // The bridge owns no row payload (the injected adapter does). It may mention
    // the allow-listed fields descriptively in comments, but it must never
    // construct a quoted row key or any cr664_correlationid / cr664_documenttype.
    expect(ACTION).not.toMatch(/cr664_correlationid/);
    expect(ACTION).not.toMatch(/cr664_documenttype/);
    expect(ACTION).not.toMatch(/['"]cr664_documentname['"]\s*:/);
    expect(ACTION).not.toMatch(/['"]cr664_Deal@odata\.bind['"]\s*:/);
    expect(ACTION).toMatch(/audit-only/i);
  });

  it('the actor bind guard enforces cr664_users (never systemusers)', () => {
    expect(ACTION).toMatch(/isCoreUserBind/);
    expect(ACTION).toMatch(/refused_unsafe_actor_bind/);
  });
});

describe('188J adds no route and no New Deal auto-run', () => {
  it('the bridge and panel add no router and no origination orchestrator call', () => {
    for (const src of [ACTION, PANEL]) {
      expect(src).not.toMatch(/createBrowserRouter|<Route|path:\s*['"]/);
      expect(src).not.toMatch(/orchestrateDealOrigination|runGovernedCreate|onCreateDeal/);
    }
  });
});

describe('the 188J controlled-proof doc records the proof path', () => {
  it('the doc exists on disk', () => {
    expect(existsSync(resolve(ROOT, DOC_REL))).toBe(true);
  });

  const DOC = read(DOC_REL);

  it('documents the two-gate disabled-by-default posture', () => {
    expect(DOC).toMatch(/DOCUMENT_CHECKLIST_PILOT_UI_ENABLED/);
    expect(DOC).toMatch(/DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED/);
    expect(DOC).toMatch(/DOCUMENT_CHECKLIST_GENERATION_ENABLED/);
    expect(DOC).toMatch(/disabled by default/i);
  });

  it('documents the actor + deal identity rules and approved-name source', () => {
    expect(DOC).toMatch(/\/cr664_users\(<CoreUser>\)/);
    expect(DOC).toMatch(/never[\s`]*\/systemusers/i);
    expect(DOC).toMatch(/exact deal id/i);
    expect(DOC).toMatch(/DOCUMENT_CHECKLIST_PILOT_APPROVED_NAMES/);
  });

  it('documents the controlled test-only proof path and adapter status mapping', () => {
    expect(DOC).toMatch(/test-only/i);
    expect(DOC).toMatch(/runDocumentChecklistUiGenerationAction/);
    expect(DOC).toMatch(/success_refresh_checklist/);
    expect(DOC).toMatch(/error_partial_review_required/);
  });

  it('records refresh behavior, audit behavior, and forbidden behavior', () => {
    expect(DOC).toMatch(/read-only/i);
    expect(DOC).toMatch(/audit-only/i);
    expect(DOC).toMatch(/No borrower (communication|email)/i);
    expect(DOC).toMatch(/No New Deal auto-run/i);
  });

  it('records the rollback switch and the 188K certification path', () => {
    expect(DOC).toMatch(/[Rr]ollback/);
    expect(DOC).toMatch(/=false/);
    expect(DOC).toMatch(/188K/);
  });
});
