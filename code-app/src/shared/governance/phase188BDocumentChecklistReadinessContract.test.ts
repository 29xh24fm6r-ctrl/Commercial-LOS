import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * PHASE 188B — Document checklist pilot readiness inspector contract pins.
 *
 * The two new READ-ONLY script modes (--inspect-document-checklist-graph,
 * --plan-document-checklist-generation) must never write Dataverse, never
 * contact a borrower, and must fail-closed with a precise terminal status.
 * Source-level pins only — the suite never runs the script or calls Dataverse.
 */

const ROOT = resolve(__dirname, '..', '..', '..');
const SCRIPT = readFileSync(resolve(ROOT, 'scripts', 'phase122-lookup-repair.mjs'), 'utf8');

const SECTION = (() => {
  const start = SCRIPT.indexOf('// Phase 188B — Document checklist pilot readiness inspector / planner.');
  // The follow-on Phase 188E live-proof section has its own contract test; bound
  // the 188B (read-only) slice to its start, falling back to the audit marker.
  const next = SCRIPT.indexOf('// Phase 188E — document checklist pilot LIVE proof', start);
  const end = next !== -1 ? next : SCRIPT.indexOf('// Audit phase — publishers + tables + columns', start);
  return SCRIPT.slice(start, end);
})();

describe('flags & mutual exclusivity', () => {
  it('defines the two read-only modes + their args', () => {
    expect(SCRIPT).toMatch(/arg === '--inspect-document-checklist-graph'/);
    expect(SCRIPT).toMatch(/arg === '--plan-document-checklist-generation'/);
    expect(SCRIPT).toMatch(/arg === '--deal-id'/);
    expect(SCRIPT).toMatch(/arg === '--document-names'/);
  });

  it('both modes are in the mutually-exclusive set', () => {
    expect(SCRIPT).toMatch(/flags\.inspectDocumentChecklistGraph,\s*\n\s*flags\.planDocumentChecklistGeneration,/);
  });

  it('each mode requires exactly one of --deal-name / --deal-id; plan requires --document-names', () => {
    expect(SCRIPT).toMatch(/requires exactly one of --deal-name "<name>" or --deal-id <guid>/);
    expect(SCRIPT).toMatch(/--plan-document-checklist-generation requires --document-names/);
    // Phase 188H merge: --deal-id now also feeds --inspect-crm-relationship-graph
    // (the CRM relationship spine from master), so the unioned rejection message
    // names that mode first, ahead of the document-checklist modes.
    expect(SCRIPT).toMatch(/--deal-id is only valid alongside --inspect-crm-relationship-graph, --inspect-document-checklist-graph, --plan-document-checklist-generation, or --commit-document-checklist-generation-proof/);
  });
});

describe('read-only — no writes anywhere in the 188B path', () => {
  it('issues no POST / PATCH / DELETE', () => {
    expect(SECTION).not.toMatch(/method:\s*'POST'/);
    expect(SECTION).not.toMatch(/method:\s*'PATCH'/);
    expect(SECTION).not.toMatch(/method:\s*'DELETE'/);
  });

  it('uses no PublishXml / bypass / suppress / force headers', () => {
    expect(SECTION).not.toMatch(/PublishXml/i);
    expect(SECTION).not.toMatch(/MSCRM\.SuppressDuplicateDetection/i);
    expect(SECTION).not.toMatch(/BypassCustomPluginExecution/i);
  });

  it('both handlers print WRITES: 0', () => {
    expect(SECTION).toMatch(/console\.log\('WRITES: 0'\)/);
    expect(SECTION).toMatch(/console\.log\('WRITES: 0 \(dry-run\)'\)/);
  });

  it('plan mode never calls the generator adapter', () => {
    expect(SECTION).not.toMatch(/runNewDealChecklistGeneration/);
  });
});

describe('deal resolution fails closed', () => {
  it('bails on zero or multiple name matches', () => {
    expect(SECTION).toMatch(/no Loan Deal matches cr664_dealname/);
    expect(SECTION).toMatch(/Loan Deals match.*ambiguous/s);
  });
});

describe('terminal status logic', () => {
  it('derives all four statuses', () => {
    for (const s of ['UNSAFE_EXTERNAL_COMMUNICATION', 'BLOCKED', 'ALREADY_GENERATED', 'READY_TO_COMMIT']) {
      expect(SECTION).toMatch(new RegExp(`'${s}'`));
    }
  });

  it('unsafe > blocked > already/ready precedence', () => {
    expect(SECTION).toMatch(/if \(unsafe\) return 'UNSAFE_EXTERNAL_COMMUNICATION'/);
    expect(SECTION).toMatch(/if \(blockedReasons\.length > 0\) return 'BLOCKED'/);
    expect(SECTION).toMatch(/wouldCreateCount > 0 \? 'READY_TO_COMMIT' : 'ALREADY_GENERATED'/);
    expect(SECTION).toMatch(/existingCount > 0 \? 'ALREADY_GENERATED' : 'READY_TO_COMMIT'/);
  });

  it('blank + duplicate input names block', () => {
    expect(SECTION).toMatch(/invalid empty checklist name in --document-names/);
    expect(SECTION).toMatch(/duplicate name\(s\) in --document-names/);
  });

  it('missing metadata + unexpected required fields block', () => {
    expect(SECTION).toMatch(/cr664_documentchecklists metadata unavailable/);
    expect(SECTION).toMatch(/unexpected required-for-create field\(s\)/);
  });
});

describe('safety scans — identity bind + comms + documenttype', () => {
  it('detects unsafe borrower-communication imports in the generator path', () => {
    expect(SECTION).toMatch(/DOC_CHECKLIST_PROHIBITED_IMPORTS = \[/);
    expect(SECTION).toMatch(/sendDocumentRequestEmail/);
    expect(SECTION).toMatch(/prepareDocumentRequestHandoff/);
    expect(SECTION).toMatch(/function scanChecklistCommsSafety/);
    expect(SECTION).toMatch(/safe: offenders\.length === 0/);
  });

  it('confirms the actor bind shape is /cr664_users and never /systemusers', () => {
    expect(SECTION).toMatch(/function scanIdentityBindShape/);
    expect(SECTION).toMatch(/coreUsersBind = \/\\\/cr664_users\\\(\\\$\\\{\//);
    expect(SECTION).toMatch(/binds \/systemusers into cr664_ChangedBy \(forbidden\)/);
    expect(SECTION).toMatch(/assertChangedByCoreUserBind/);
  });

  it('confirms cr664_documenttype is NOT a checklist category/template field', () => {
    expect(SECTION).toMatch(/function scanDocumentTypeNotCategory/);
    expect(SECTION).toMatch(/documenttypeInAllowlist/);
    expect(SECTION).toMatch(/cr664_documenttype is in the generator allow-list \(must not be a checklist category\)/);
    expect(SECTION).toMatch(/DOC_CHECKLIST_EXPECTED_REQUIRED = \['cr664_deal', 'cr664_documentname'\]/);
  });

  it('the 188B script path imports NO email/SMS/Outlook/handoff module (it only scans for them)', () => {
    // The section references the prohibited names as regex literals to DETECT
    // them, but must not itself import/require any comms module.
    expect(SECTION).not.toMatch(/(?:import|require)\([^)]*(?:sendDocumentRequestEmail|prepareDocumentRequestHandoff|emailDelivery|outlook)/i);
    expect(SECTION).not.toMatch(/from\s+['"][^'"]*(?:sendDocumentRequestEmail|prepareDocumentRequestHandoff|emailDelivery|outlook)/i);
  });
});

describe('no runtime enablement changed by 188B', () => {
  it('the checklist generation gate constant stays at the safe default (off); 188B did not change it', () => {
    const flags = readFileSync(resolve(ROOT, 'src', 'deals', 'dealOriginationFeatureFlags.ts'), 'utf8');
    // Completion Phase A reset this to the SAFE DEFAULT (false); 188B's read-only
    // inspector/planner path never assigns it.
    expect(flags).toMatch(/DOCUMENT_CHECKLIST_GENERATION_ENABLED = false as const/);
  });

  it('the generator adapter is unchanged (still IO-injected, no document service import, no audit yet)', () => {
    const adapter = readFileSync(resolve(ROOT, 'src', 'deals', 'newDealChecklistGenerationAdapter.ts'), 'utf8');
    expect(adapter).not.toMatch(/Cr664_documentchecklistsService/);
    expect(adapter).not.toMatch(/Cr664_auditeventsService/);
    expect(adapter).toMatch(/DISABLED by default/);
  });
});
