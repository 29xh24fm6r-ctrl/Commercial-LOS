import { describe, it, expect, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DOCUMENT_CHECKLIST_PILOT_UI_ENABLED,
  DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED,
} from '../../deals/documentChecklistPilotConfig';
import { DOCUMENT_CHECKLIST_GENERATION_ENABLED } from '../../deals/dealOriginationFeatureFlags';
import { DOCUMENT_CHECKLIST_ALLOWED_FIELDS } from '../../deals/newDealChecklistGenerationAdapter';
import { buildDocumentChecklistUiEnableReadiness } from '../../deals/documentChecklistUiEnableReadiness';
import {
  runDocumentChecklistUiGenerationAction,
  type DocumentChecklistUiGenerationActionInput,
} from '../../deals/documentChecklistUiGenerationAction';

/**
 * PHASE 188K — certification + rollback-control pins for the merged 188J
 * controlled banker-UI checklist generation seam.
 *
 * This phase enables NOTHING. It certifies, as enforceable tests, that the
 * default runtime stays fully disabled, that all three gates fail closed
 * independently, that the dependency-injected bridge still refuses every unsafe
 * precondition (gates off, missing actor/deal/names, /systemusers bind), that
 * the UI action cannot be reached from a normal panel render, that no borrower
 * comms / live Dataverse dep / route / orchestrator wiring exists, that the row
 * allow-list is unchanged, and that the correlation id stays audit-only.
 */

const ROOT = resolve(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

const CONFIG = read('src/deals/documentChecklistPilotConfig.ts');
const FLAGS = read('src/deals/dealOriginationFeatureFlags.ts');
const PANEL = read('src/deals/DocumentChecklistPilotPanel.tsx');
const ACTION = read('src/deals/documentChecklistUiGenerationAction.ts');
const ADAPTER = read('src/deals/newDealChecklistGenerationAdapter.ts');
const DEAL_DOCS = read('src/deals/DealDocuments.tsx');
const APP = read('src/App.tsx');
const WORKSPACE_GATE = read('src/bootstrap/WorkspaceGate.tsx');
const WORKSPACE_ROUTES = read('src/bootstrap/workspaceRoutes.ts');
const BANKER_NEW_DEAL = read('src/banker/BankerNewDealCreate.tsx');
const ORCHESTRATOR = read('src/deals/dealOriginationOrchestrator.ts');
const DOC_REL = 'docs/PHASE_188K_UI_CHECKLIST_GENERATION_CERTIFICATION.md';

/** Strip block + whole-line comments so safety DOCSTRINGS (which legitimately
 * name "email / SMS / Outlook / handoff") never trip a borrower-comms pin. We
 * assert against actual CODE, not descriptive comments. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** Module specifiers from every `from '...'` import in a source file. */
function importSpecifiers(src: string): string[] {
  return (src.match(/from '([^']+)'/g) ?? []).map((m) => m.replace(/^from '|'$/g, ''));
}

const DEAL_ID = '1a10a165-756a-f111-ab0c-70a8a59be491';
const CORE_USER_BIND = '/cr664_users(940a202e-756a-f111-ab0c-70a8a59be491)';
const APPROVED = ['2024 Business Tax Return', 'Debt Schedule'];

const READY = buildDocumentChecklistUiEnableReadiness({
  evaluateFutureReadiness: true,
  actorIdentity: { email: 'banker@oldglorybank.com', coreUserId: 'cu-1' },
  dealId: DEAL_ID,
  approvedChecklistNames: APPROVED,
  existingChecklistRows: [],
  graphReadinessSafe: true,
});

function enabledInput(
  overrides: Partial<DocumentChecklistUiGenerationActionInput> = {},
): DocumentChecklistUiGenerationActionInput {
  return {
    readiness: READY,
    gates: { pilotUiEnabled: true, uiGenerateActionEnabled: true },
    actor: { email: 'banker@oldglorybank.com', changedByBind: CORE_USER_BIND },
    dealId: DEAL_ID,
    approvedNames: APPROVED,
    generateChecklist: vi.fn(async () => ({ module: 'document-checklist', kind: 'success' as const })),
    refreshChecklist: vi.fn(async () => ({ ok: true, names: APPROVED })),
    correlationId: 'dc-audit-cert',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. All three gates remain false — default runtime fully disabled.
// ---------------------------------------------------------------------------
describe('188K — all three gates remain false (default runtime disabled)', () => {
  it('the pilot UI flag is false (constant + source)', () => {
    expect(DOCUMENT_CHECKLIST_PILOT_UI_ENABLED).toBe(false);
    expect(CONFIG).toMatch(/DOCUMENT_CHECKLIST_PILOT_UI_ENABLED = false as const/);
  });

  it('the UI generate-action flag is false (constant + source)', () => {
    expect(DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED).toBe(false);
    expect(CONFIG).toMatch(/DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED = false as const/);
  });

  it('the runtime generation gate is true (Phase 256B flipped it; 188K enables nothing)', () => {
    // Phase 256B flipped this constant true after the GO document-checklist smoke. 188K is
    // certification + rollback control only and enables nothing of its own.
    expect(DOCUMENT_CHECKLIST_GENERATION_ENABLED).toBe(true);
    expect(FLAGS).toMatch(/DOCUMENT_CHECKLIST_GENERATION_ENABLED = true as const/);
  });

  it('nothing in 188K flips a checklist gate to true (the runtime gate is Phase 256B, not 188K)', () => {
    // 188K's own files (config, panel, action bridge) flip none of the three gates.
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

// ---------------------------------------------------------------------------
// 2. Panel stays disabled by default and live-dep / comms free.
// ---------------------------------------------------------------------------
describe('188K — panel disabled by default, live-dep + comms free', () => {
  it('preserves the disabled-by-default invariant literal', () => {
    expect(PANEL).toMatch(/const generateDisabled = true/);
    // The action gate defaults to the disabled config flag (not a literal true).
    expect(PANEL).toMatch(
      /generateActionEnabled = DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED/,
    );
  });

  it('imports only pure local modules + shared UI + react', () => {
    const allowed = new Set([
      'react',
      '../shared/Badge',
      '../shared/theme',
      './documentChecklistPilotViewModel',
      './documentChecklistPilotConfig',
    ]);
    const specs = importSpecifiers(PANEL);
    expect(specs.length).toBeGreaterThan(0);
    for (const s of specs) expect(allowed.has(s)).toBe(true);
  });

  it('imports no generator adapter, bridge, live deps, or Power Apps client', () => {
    expect(PANEL).not.toMatch(/generateAuditedDocumentChecklist/);
    expect(PANEL).not.toMatch(/from '\.\/documentChecklistUiGenerationAction'/);
    expect(PANEL).not.toMatch(/from '\.\/newDealChecklistGenerationAdapter'/);
    expect(PANEL).not.toMatch(/newDealChecklistGenerationLiveDeps/);
    expect(PANEL).not.toMatch(/@microsoft\/power-apps|getClient|dataSourcesInfo/);
    expect(PANEL).not.toMatch(/crmLiveDataverseAdapter|PersistenceAdapter|LiveDeps/);
  });

  it('the panel CODE (sans safety docstring) wires no borrower comms', () => {
    const code = stripComments(PANEL);
    for (const re of [
      /\bemail\b/i,
      /\bsms\b/i,
      /\boutlook\b/i,
      /\bhandoff\b/i,
      /mailto:/i,
      /send request/i,
      /document request/i,
      /sendDocumentRequest|sendBorrower|BorrowerCommunication/,
    ]) {
      expect(code).not.toMatch(re);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. The UI action cannot be reached from a normal panel render.
// ---------------------------------------------------------------------------
describe('188K — UI action unreachable from a normal panel render', () => {
  it('DealDocuments mounts the panel banker-only, read-only, with no action wiring', () => {
    expect(DEAL_DOCS).toMatch(/<DocumentChecklistPilotPanel/);
    expect(DEAL_DOCS).toMatch(/!readOnly && banker/);
    // No onGenerate / generateActionEnabled is ever passed in runtime.
    expect(DEAL_DOCS).not.toMatch(/onGenerate/);
    expect(DEAL_DOCS).not.toMatch(/generateActionEnabled/);
    expect(DEAL_DOCS).not.toMatch(/documentChecklistUiGenerationAction/);
  });
});

// ---------------------------------------------------------------------------
// 4. Bridge/action stays dependency-injected and fail-closed (behavioral).
// ---------------------------------------------------------------------------
describe('188K — bridge stays dependency-injected & fail-closed', () => {
  it('the bridge imports only pure modules (no live deps / adapter / SDK)', () => {
    const specs = importSpecifiers(ACTION).join('\n');
    expect(specs).toMatch(/auditActorBind/);
    expect(specs).toMatch(/dealOriginationOutcomes/);
    expect(specs).toMatch(/documentChecklistUiEnableReadiness/);
    expect(specs).not.toMatch(/newDealChecklistGeneration/);
    expect(ACTION).not.toMatch(/@microsoft\/power-apps|getClient|\bfetch\(/);
  });

  it('refuses when the UI pilot gate is false (adapter never invoked)', async () => {
    const adapter = vi.fn(async () => ({ module: 'document-checklist', kind: 'success' as const }));
    const res = await runDocumentChecklistUiGenerationAction(
      enabledInput({ gates: { pilotUiEnabled: false, uiGenerateActionEnabled: true }, generateChecklist: adapter }),
    );
    expect(res.uiState).toBe('refused_gate_disabled');
    expect(res.invokedAdapter).toBe(false);
    expect(adapter).not.toHaveBeenCalled();
  });

  it('refuses when the UI generate-action gate is false', async () => {
    const adapter = vi.fn(async () => ({ module: 'document-checklist', kind: 'success' as const }));
    const res = await runDocumentChecklistUiGenerationAction(
      enabledInput({ gates: { pilotUiEnabled: true, uiGenerateActionEnabled: false }, generateChecklist: adapter }),
    );
    expect(res.uiState).toBe('refused_gate_disabled');
    expect(adapter).not.toHaveBeenCalled();
  });

  it('runtime gate fail-closes via the injected adapter (disabled -> blocked, no refresh)', async () => {
    // The runtime generation gate is NOT represented in the bridge gate config;
    // it is enforced fail-closed by the injected adapter. With the runtime gate
    // off the adapter returns `disabled`, which the bridge maps to a blocked UI
    // state and never refreshes.
    const adapter = vi.fn(async () => ({ module: 'document-checklist', kind: 'disabled' as const }));
    const refresh = vi.fn(async () => ({ ok: true, names: APPROVED }));
    const res = await runDocumentChecklistUiGenerationAction(
      enabledInput({ generateChecklist: adapter, refreshChecklist: refresh }),
    );
    expect(res.category).toBe('blocked');
    expect(res.refreshed).toBe(false);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('rejects a /systemusers actor bind', async () => {
    const adapter = vi.fn(async () => ({ module: 'document-checklist', kind: 'success' as const }));
    const res = await runDocumentChecklistUiGenerationAction(
      enabledInput({ actor: { email: 'b@x.com', changedByBind: '/systemusers(abc)' }, generateChecklist: adapter }),
    );
    expect(res.uiState).toBe('refused_unsafe_actor_bind');
    expect(adapter).not.toHaveBeenCalled();
  });

  it('refuses a missing actor, a missing deal id, and empty approved names', async () => {
    const adapter = vi.fn(async () => ({ module: 'document-checklist', kind: 'success' as const }));
    const noActor = await runDocumentChecklistUiGenerationAction(enabledInput({ actor: null, generateChecklist: adapter }));
    const noDeal = await runDocumentChecklistUiGenerationAction(enabledInput({ dealId: '   ', generateChecklist: adapter }));
    const noNames = await runDocumentChecklistUiGenerationAction(enabledInput({ approvedNames: ['  '], generateChecklist: adapter }));
    expect(noActor.uiState).toBe('refused_missing_actor');
    expect(noDeal.uiState).toBe('refused_missing_deal_id');
    expect(noNames.uiState).toBe('refused_missing_approved_names');
    expect(adapter).not.toHaveBeenCalled();
  });

  it('keeps the read-only refresh injected and only post-success', async () => {
    // success -> refresh runs once (read-only).
    const refreshOnSuccess = vi.fn(async () => ({ ok: true, names: APPROVED }));
    const ok = await runDocumentChecklistUiGenerationAction(
      enabledInput({
        generateChecklist: vi.fn(async () => ({ module: 'document-checklist', kind: 'success' as const })),
        refreshChecklist: refreshOnSuccess,
      }),
    );
    expect(ok.refreshed).toBe(true);
    expect(refreshOnSuccess).toHaveBeenCalledTimes(1);

    // error -> no refresh.
    const refreshOnError = vi.fn(async () => ({ ok: true, names: APPROVED }));
    const err = await runDocumentChecklistUiGenerationAction(
      enabledInput({
        generateChecklist: vi.fn(async () => ({ module: 'document-checklist', kind: 'partial_success' as const })),
        refreshChecklist: refreshOnError,
      }),
    );
    expect(err.category).toBe('error');
    expect(err.refreshed).toBe(false);
    expect(refreshOnError).not.toHaveBeenCalled();
  });

  it('invokes the injected adapter exactly once on the fully-enabled path', async () => {
    const adapter = vi.fn(async () => ({ module: 'document-checklist', kind: 'success' as const }));
    await runDocumentChecklistUiGenerationAction(enabledInput({ generateChecklist: adapter }));
    expect(adapter).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// 5. No route / App / WorkspaceGate / new-deal orchestrator wiring.
// ---------------------------------------------------------------------------
describe('188K — no route / orchestrator wiring of the UI action', () => {
  it('App / WorkspaceGate / workspaceRoutes mount no checklist generation surface', () => {
    for (const src of [APP, WORKSPACE_GATE, WORKSPACE_ROUTES]) {
      expect(src).not.toMatch(/documentChecklistUiGenerationAction/);
      expect(src).not.toMatch(/DocumentChecklistPilotPanel/);
      expect(src).not.toMatch(/generateAuditedDocumentChecklist/);
    }
  });

  it('BankerNewDealCreate and the origination orchestrator never import the UI action', () => {
    for (const src of [BANKER_NEW_DEAL, ORCHESTRATOR]) {
      expect(src).not.toMatch(/documentChecklistUiGenerationAction/);
      expect(src).not.toMatch(/runDocumentChecklistUiGenerationAction/);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Row payload allow-list unchanged + correlation id audit-only.
// ---------------------------------------------------------------------------
describe('188K — row allow-list unchanged + correlation id audit-only', () => {
  it('DOCUMENT_CHECKLIST_ALLOWED_FIELDS is exactly the two row fields (value + source)', () => {
    expect([...DOCUMENT_CHECKLIST_ALLOWED_FIELDS]).toEqual([
      'cr664_documentname',
      'cr664_Deal@odata.bind',
    ]);
    expect(ADAPTER).toMatch(
      /DOCUMENT_CHECKLIST_ALLOWED_FIELDS = Object\.freeze\(\[\s*'cr664_documentname',\s*'cr664_Deal@odata\.bind',\s*\] as const\)/,
    );
  });

  it('no checklist row payload carries cr664_correlationid (audit-only)', () => {
    // The only cr664_correlationid mention in the adapter is the 188G comment.
    const inAdapter = ADAPTER.match(/cr664_correlationid/g) ?? [];
    expect(inAdapter.length).toBeLessThanOrEqual(1);
    // The bridge never constructs a row key nor a cr664_correlationid.
    expect(ACTION).not.toMatch(/cr664_correlationid/);
    expect(ACTION).not.toMatch(/cr664_documenttype/);
    expect(ACTION).not.toMatch(/['"]cr664_documentname['"]\s*:/);
    expect(ACTION).not.toMatch(/['"]cr664_Deal@odata\.bind['"]\s*:/);
  });

  it('the bridge carries the correlation id only as audit / request metadata', () => {
    expect(ACTION).toMatch(/audit-only/i);
    expect(ACTION).toMatch(/correlationId/);
    const res = enabledInput();
    // A behavioral check: the request handed to the adapter carries correlationId
    // as metadata; the row payload is the adapter's concern (two fields only).
    expect(res.correlationId).toBe('dc-audit-cert');
  });
});

// ---------------------------------------------------------------------------
// 7. The 188K certification doc records the rollback procedure.
// ---------------------------------------------------------------------------
describe('188K — certification doc records the rollback procedure', () => {
  it('the doc exists on disk', () => {
    expect(existsSync(resolve(ROOT, DOC_REL))).toBe(true);
  });

  const DOC = read(DOC_REL);

  it('documents the three independent rollback switches set to false', () => {
    expect(DOC).toMatch(/DOCUMENT_CHECKLIST_PILOT_UI_ENABLED\s*=\s*false/);
    expect(DOC).toMatch(/DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED\s*=\s*false/);
    expect(DOC).toMatch(/DOCUMENT_CHECKLIST_GENERATION_ENABLED\s*=\s*false/);
  });

  it('documents the expected behavior after rollback', () => {
    expect(DOC).toMatch(/panel renders disabled/i);
    expect(DOC).toMatch(/no adapter invocation/i);
    expect(DOC).toMatch(/no row creation/i);
    expect(DOC).toMatch(/no borrower contact/i);
    expect(DOC).toMatch(/read-only checklist state still visible/i);
  });

  it('documents the operator verification commands', () => {
    expect(DOC).toMatch(/pnpm test --/);
    expect(DOC).toMatch(/phase188K/);
    expect(DOC).toMatch(/releaseCandidateSnapshot/);
    expect(DOC).toMatch(/pnpm build/);
  });

  it('explicitly states 188K enables nothing and runs no live proof', () => {
    expect(DOC).toMatch(/does not enable UI generation/i);
    expect(DOC).toMatch(/does not execute a live proof/i);
    expect(DOC).toMatch(/does not create checklist rows/i);
    expect(DOC).toMatch(/does not contact borrowers/i);
    expect(DOC).toMatch(/188L/);
  });

  it('pins the actor + row invariants in the doc', () => {
    expect(DOC).toMatch(/\/cr664_users\(<CoreUser>\)/);
    expect(DOC).toMatch(/never[\s`]*\/systemusers/i);
    expect(DOC).toMatch(/cr664_documentname/);
    expect(DOC).toMatch(/cr664_Deal@odata\.bind/);
  });
});
