import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * PHASE 188C — static governance pins for the audited document-checklist
 * generator. The adapter + its live deps must import NO borrower-comms module,
 * keep the gate false, audit via /cr664_users (never /systemusers) with the
 * shared guard, and touch no UI / New-Deal-auto-run / stage / portfolio / CRM.
 */

const ROOT = resolve(__dirname, '..', '..', '..');
const ADAPTER = readFileSync(resolve(ROOT, 'src', 'deals', 'newDealChecklistGenerationAdapter.ts'), 'utf8');
const LIVE = readFileSync(resolve(ROOT, 'src', 'deals', 'newDealChecklistGenerationLiveDeps.ts'), 'utf8');
const FLAGS = readFileSync(resolve(ROOT, 'src', 'deals', 'dealOriginationFeatureFlags.ts'), 'utf8');

const PROHIBITED_COMMS = [
  /sendDocumentRequestEmail/,
  /prepareDocumentRequestHandoff/,
  /emailDelivery/,
  /outlookEmail/i,
  /\bmailto\b/,
  /\bsms\b/i,
  /handoff/i,
];

describe('comms boundary — no borrower communication imports', () => {
  for (const [label, src] of [['adapter', ADAPTER], ['live deps', LIVE]] as const) {
    it(`${label} imports no email/SMS/Outlook/handoff module`, () => {
      const importLines = src.split('\n').filter((l) => /^\s*import\b/.test(l));
      const blob = importLines.join('\n');
      for (const re of PROHIBITED_COMMS) expect(blob).not.toMatch(re);
    });
  }

  it('the adapter references no borrower/contact field anywhere', () => {
    expect(ADAPTER).not.toMatch(/sendDocumentRequestEmail|prepareDocumentRequestHandoff/);
    expect(ADAPTER).not.toMatch(/cr664_borroweremail|cr664_borrowerphone|recipient/i);
  });
});

describe('gate stays disabled by default', () => {
  it('DOCUMENT_CHECKLIST_GENERATION_ENABLED is still false', () => {
    expect(FLAGS).toMatch(/DOCUMENT_CHECKLIST_GENERATION_ENABLED = false as const/);
  });

  it('the adapter gates on isDocumentChecklistEnabled and returns disabled first', () => {
    expect(ADAPTER).toMatch(/input\.enabledOverride \?\? isDocumentChecklistEnabled\(input\.config\)/);
    expect(ADAPTER).toMatch(/if \(!enabled\) \{\s*\n\s*return \{ module: MODULE, kind: 'disabled'/);
  });

  it('nothing flips the gate to true', () => {
    expect(ADAPTER).not.toMatch(/DOCUMENT_CHECKLIST_GENERATION_ENABLED\s*=\s*true/);
    expect(LIVE).not.toMatch(/DOCUMENT_CHECKLIST_GENERATION_ENABLED\s*=\s*true/);
  });
});

describe('payload allow-list — no documenttype / stage / status / portfolio / CRM', () => {
  it('the allow-list is exactly the three approved keys', () => {
    expect(ADAPTER).toMatch(
      /DOCUMENT_CHECKLIST_ALLOWED_FIELDS = Object\.freeze\(\[\s*'cr664_documentname',\s*'cr664_Deal@odata\.bind',\s*'cr664_correlationid',\s*\]/,
    );
  });

  it('the create payload sets none of cr664_documenttype / stage / status / portfolio / crm', () => {
    const start = ADAPTER.indexOf('const payload: ChecklistRowPayload = {');
    const block = ADAPTER.slice(start, ADAPTER.indexOf('};', start));
    expect(block).not.toMatch(/cr664_documenttype/);
    expect(block).not.toMatch(/cr664_(StageReference|StatusReference|stage|status|portfolio)/i);
  });
});

describe('audit — /cr664_users via the shared resolver + guard', () => {
  it('reuses createActorChangedByResolver (live) and the shared bind guard', () => {
    expect(LIVE).toMatch(/createActorChangedByResolver/);
    expect(ADAPTER).toMatch(/assertChangedByCoreUserBind/);
    expect(ADAPTER).toMatch(/import \{ assertChangedByCoreUserBind \} from '\.\.\/shared\/governance\/auditActorBind'/);
  });

  it('binds cr664_ChangedBy to the resolved changedByBind and asserts the guard before POST', () => {
    const start = ADAPTER.indexOf('export function createChecklistGenerationAuditEmitter');
    const fn = ADAPTER.slice(start);
    const assertIdx = fn.indexOf('assertChangedByCoreUserBind(resolution.changedByBind)');
    const postIdx = fn.indexOf('deps.createAudit(payload)');
    expect(assertIdx).toBeGreaterThan(0);
    expect(postIdx).toBeGreaterThan(assertIdx);
    expect(fn).toMatch(/changedByBind: resolution\.changedByBind/);
  });

  it('never constructs a /systemusers bind', () => {
    expect(ADAPTER).not.toMatch(/\/systemusers\(/);
    expect(LIVE).not.toMatch(/\/systemusers\(/);
  });

  it('reuses the existing audit convention (canonical builder + auditevents service), no second audit system', () => {
    expect(ADAPTER).toMatch(/buildNewDealAuditPayload/);
    expect(LIVE).toMatch(/Cr664_auditeventsService/);
  });
});

describe('runtime boundary — no UI / no New Deal auto-run / no extra writes', () => {
  it('the adapter + live deps reference no UI component or borrower send', () => {
    for (const src of [ADAPTER, LIVE]) {
      expect(src).not.toMatch(/\.tsx/);
      expect(src).not.toMatch(/DealDocuments|RequestDocumentModal|useState|render/);
    }
  });

  it('nothing wires checklist generation into New Deal create (no orchestrator auto-run added here)', () => {
    expect(ADAPTER).not.toMatch(/orchestrateDealOrigination|runGovernedCreate/);
    expect(LIVE).not.toMatch(/orchestrateDealOrigination|runGovernedCreate/);
  });

  it('the only Dataverse services the live deps touch are documentchecklists (create/read) + auditevents', () => {
    expect(LIVE).toMatch(/Cr664_documentchecklistsService/);
    expect(LIVE).toMatch(/Cr664_auditeventsService/);
    expect(LIVE).not.toMatch(/Cr664_loandealsService|Cr664_bankersService|Cr664_clientrelationshipsService|Cr664_dealtimelineeventsService/);
  });
});
