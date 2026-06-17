import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * PHASE 188E — document checklist pilot live-proof mode contract pins.
 *
 * `--commit-document-checklist-generation-proof` is the ONLY mode that writes
 * checklist rows, and only for one exact deal after the 188B readiness checks.
 * Source-level pins only — the suite never runs the script or calls Dataverse.
 */

const ROOT = resolve(__dirname, '..', '..', '..');
const SCRIPT = readFileSync(resolve(ROOT, 'scripts', 'phase122-lookup-repair.mjs'), 'utf8');

const SECTION = SCRIPT.slice(
  SCRIPT.indexOf('// Phase 188E — document checklist pilot LIVE proof'),
  SCRIPT.indexOf('// Audit phase — publishers + tables + columns', SCRIPT.indexOf('// Phase 188E —')),
);
const HANDLER = SCRIPT.slice(
  SCRIPT.indexOf('async function runCommitDocumentChecklistGenerationProof'),
  SCRIPT.indexOf('// Audit phase — publishers + tables + columns', SCRIPT.indexOf('async function runCommitDocumentChecklistGenerationProof')),
);

describe('flags, args & mutual exclusivity', () => {
  it('defines the proof mode + its required args', () => {
    expect(SCRIPT).toMatch(/arg === '--commit-document-checklist-generation-proof'/);
    expect(SCRIPT).toMatch(/arg === '--actor-upn'/);
    expect(SCRIPT).toMatch(/arg === '--correlation-id'/);
  });

  it('is in the mutually-exclusive mode set', () => {
    expect(SCRIPT).toMatch(/flags\.commitDocChecklistProof,\s*\n\s*\]\.filter\(Boolean\)/);
  });

  it('requires deal-id (exact), document-names, actor-upn, correlation-id; rejects deal-name', () => {
    expect(SCRIPT).toMatch(/--commit-document-checklist-generation-proof requires --deal-id <guid>/);
    expect(SCRIPT).toMatch(/--commit-document-checklist-generation-proof does not accept --deal-name/);
    expect(SCRIPT).toMatch(/--commit-document-checklist-generation-proof requires --document-names/);
    expect(SCRIPT).toMatch(/--commit-document-checklist-generation-proof requires --actor-upn/);
    expect(SCRIPT).toMatch(/--commit-document-checklist-generation-proof requires --correlation-id/);
  });
});

describe('readiness gate before any write', () => {
  it('re-runs the 188B checks + plan and gates on the derived status', () => {
    expect(HANDLER).toMatch(/await gatherDocChecklistChecks\(\{ dealId \}/);
    expect(HANDLER).toMatch(/deriveDocChecklistStatus\(/);
  });

  it('stops on UNSAFE_EXTERNAL_COMMUNICATION and BLOCKED before writing', () => {
    const unsafeIdx = HANDLER.indexOf("status === 'UNSAFE_EXTERNAL_COMMUNICATION'");
    const blockedIdx = HANDLER.indexOf("status === 'BLOCKED'");
    const firstPost = HANDLER.indexOf('createDependencyRow(');
    expect(unsafeIdx).toBeGreaterThan(0);
    expect(blockedIdx).toBeGreaterThan(0);
    expect(unsafeIdx).toBeLessThan(firstPost);
    expect(blockedIdx).toBeLessThan(firstPost);
    expect(HANDLER).toMatch(/PROOF STATUS: PROOF_BLOCKED/);
  });

  it('ALREADY_GENERATED writes nothing (idempotent)', () => {
    const alreadyIdx = HANDLER.indexOf("status === 'ALREADY_GENERATED'");
    const firstPost = HANDLER.indexOf('createDependencyRow(');
    expect(alreadyIdx).toBeGreaterThan(0);
    expect(alreadyIdx).toBeLessThan(firstPost);
    expect(HANDLER).toMatch(/PROOF STATUS: PROOF_ALREADY_GENERATED/);
  });

  it('refuses blank / duplicate names', () => {
    expect(HANDLER).toMatch(/invalid empty checklist name in --document-names/);
    expect(HANDLER).toMatch(/duplicate name in --document-names/);
  });
});

describe('actor bind — /cr664_users only, never /systemusers', () => {
  it('resolves the actor via the platform-user bridge to a /cr664_users bind', () => {
    expect(SECTION).toMatch(/function resolveProofActorChangedByBind/);
    expect(SECTION).toMatch(/changedByBind: `\/cr664_users\(\$\{coreId\}\)`/);
    expect(SECTION).toMatch(/cr664_CoreUser is empty/);
  });

  it('the audit emit refuses a non-/cr664_users bind (rejects /systemusers)', () => {
    expect(SECTION).toMatch(/!String\(changedByBind\)\.startsWith\('\/cr664_users\('\)/);
    expect(SECTION).toMatch(/refusing audit: cr664_ChangedBy must bind \/cr664_users/);
    expect(SECTION).not.toMatch(/\/systemusers\(\$\{/);
  });

  it('the actor is resolved BEFORE any row is written (fail closed)', () => {
    const actorIdx = HANDLER.indexOf('resolveProofActorChangedByBind(actorUpn');
    const firstPost = HANDLER.indexOf('createDependencyRow(');
    expect(actorIdx).toBeGreaterThan(0);
    expect(actorIdx).toBeLessThan(firstPost);
  });
});

describe('row payload — excludes cr664_correlationid (188C discrepancy)', () => {
  it('the row allow-list is exactly documentname + Deal bind', () => {
    expect(SECTION).toMatch(/DOC_CHECKLIST_PROOF_ROW_ALLOWLIST = \['cr664_documentname', 'cr664_Deal@odata\.bind'\]/);
  });

  it('the created row body sets only those two fields (no correlationid / documenttype / stage / status)', () => {
    const start = HANDLER.indexOf('const body = {');
    const block = HANDLER.slice(start, HANDLER.indexOf('};', start));
    expect(block).toMatch(/cr664_documentname: name/);
    expect(block).toMatch(/'cr664_Deal@odata\.bind'/);
    expect(block).not.toMatch(/cr664_correlationid/);
    expect(block).not.toMatch(/cr664_documenttype|cr664_stage|cr664_status|cr664_portfolio/i);
  });

  it('the correlation id is set on the AUDIT event only', () => {
    const auditStart = SECTION.indexOf('async function emitProofChecklistAudit');
    const auditFn = SECTION.slice(auditStart, SECTION.indexOf('async function runCommitDocumentChecklistGenerationProof'));
    expect(auditFn).toMatch(/cr664_correlationid: correlationId/);
  });
});

describe('audit emitted only after all rows succeed; fail closed', () => {
  it('the audit POST happens after the create loop', () => {
    const loopIdx = HANDLER.indexOf('for (const name of wouldCreate)');
    const auditIdx = HANDLER.indexOf('emitProofChecklistAudit(');
    expect(loopIdx).toBeGreaterThan(0);
    expect(auditIdx).toBeGreaterThan(loopIdx);
  });

  it('first create failure -> PROOF_BLOCKED, no audit; later failure -> PROOF_PARTIAL_FAILURE, no audit', () => {
    expect(HANDLER).toMatch(/PROOF_BLOCKED \(first create failed; no rows persisted; no audit\)/);
    expect(HANDLER).toMatch(/PROOF_PARTIAL_FAILURE \(\$\{created\.length\} created, then a failure; NO audit emitted\)/);
    // The partial/blocked returns happen INSIDE the create loop, before the audit.
    const partialIdx = HANDLER.indexOf('PROOF_PARTIAL_FAILURE');
    const auditIdx = HANDLER.indexOf('emitProofChecklistAudit(');
    expect(partialIdx).toBeLessThan(auditIdx);
  });

  it('audit failure -> PROOF_AUDIT_FAILED (rows exist; not a clean success)', () => {
    expect(HANDLER).toMatch(/PROOF STATUS: PROOF_AUDIT_FAILED/);
    expect(HANDLER).toMatch(/rows exist; audit not written/);
  });

  it('all five terminal statuses exist', () => {
    for (const s of ['PROOF_CREATED', 'PROOF_ALREADY_GENERATED', 'PROOF_BLOCKED', 'PROOF_PARTIAL_FAILURE', 'PROOF_AUDIT_FAILED']) {
      expect(HANDLER).toMatch(new RegExp(s));
    }
  });

  it('reads back rows after the proof', () => {
    const auditIdx = HANDLER.indexOf('emitProofChecklistAudit(');
    const readbackIdx = HANDLER.indexOf('listDealChecklistRows(dealId');
    expect(readbackIdx).toBeGreaterThan(auditIdx);
  });
});

describe('hard boundaries — no borrower comms / UI / gate flip / New Deal', () => {
  it('the proof section imports/references no borrower-comms module', () => {
    for (const re of [/sendDocumentRequestEmail/, /prepareDocumentRequestHandoff/, /emailDelivery/, /outlook/i, /\bsms\b/i, /handoff/i, /mailto/]) {
      expect(SECTION).not.toMatch(re);
    }
  });

  it('the app-runtime gate constant stays false', () => {
    const flags = readFileSync(resolve(ROOT, 'src', 'deals', 'dealOriginationFeatureFlags.ts'), 'utf8');
    expect(flags).toMatch(/DOCUMENT_CHECKLIST_GENERATION_ENABLED = false as const/);
    // The proof mode is a SCRIPT override; it never flips the app constant.
    expect(SECTION).not.toMatch(/DOCUMENT_CHECKLIST_GENERATION_ENABLED/);
  });

  it('the pilot UI flag stays false and no UI button is enabled by 188E', () => {
    const config = readFileSync(resolve(ROOT, 'src', 'deals', 'documentChecklistPilotConfig.ts'), 'utf8');
    expect(config).toMatch(/DOCUMENT_CHECKLIST_PILOT_UI_ENABLED = false as const/);
    const panel = readFileSync(resolve(ROOT, 'src', 'deals', 'DocumentChecklistPilotPanel.tsx'), 'utf8');
    expect(panel).toMatch(/const generateDisabled = true/);
  });

  it('no New Deal create / auto-run and no other-deal / bulk write in the proof', () => {
    expect(SECTION).not.toMatch(/orchestrateDealOrigination|runGovernedCreate|cr664_loandeals\) VALUES|createLoanDeal/);
    // The proof writes only documentchecklists rows + one auditevents row.
    expect(SECTION).not.toMatch(/createBrowserRouter|<Route/);
  });

  it('hardcodes no Dataverse record GUID (the deal id is an arg)', () => {
    expect(SECTION).not.toMatch(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
  });
});
