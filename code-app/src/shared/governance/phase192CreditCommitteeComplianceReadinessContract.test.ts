import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { WORKSPACE_ROUTES } from '../../bootstrap/workspaceRoutes';
import {
  DOCUMENT_CHECKLIST_PILOT_UI_ENABLED,
  DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED,
} from '../../deals/documentChecklistPilotConfig';
import { DOCUMENT_CHECKLIST_GENERATION_ENABLED } from '../../deals/dealOriginationFeatureFlags';
import {
  deriveCreditCommitteePackageQueue,
  type CreditCommitteePackageInput,
} from '../../committee/creditCommitteePackageQueue';

/**
 * PHASE 192 — Credit / committee / compliance V1 readiness contract.
 *
 * Release-readiness pins for the regulated-lending credit path: credit memo
 * preview → committee readiness → source-fact traceability → audit/compliance
 * posture. These enforce the go/no-go matrix in
 * docs/PHASE_192_CREDIT_COMMITTEE_COMPLIANCE_V1_READINESS.md as executable
 * invariants. This phase certifies; it enables nothing, fabricates no
 * approval, fabricates no source facts, sends no borrower comms, and adds no
 * schema/migration. We assert against actual CODE (comments stripped) plus
 * behavioral checks of the pure committee-readiness deriver.
 */

const ROOT = resolve(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const DOC_REL = 'docs/PHASE_192_CREDIT_COMMITTEE_COMPLIANCE_V1_READINESS.md';
const CREDIT_MEMO = read('src/deals/CreditMemo.tsx');
const CREDIT_MEMO_DRAFT = read('src/deals/creditMemoDraft.ts');
const CREDIT_MEMO_ACTIONS = read('src/deals/creditMemoActions.ts');
const CREDIT_MEMO_QUERIES = read('src/deals/creditMemoQueries.ts');
const COMMITTEE_QUEUE = read('src/committee/creditCommitteePackageQueue.ts');
const COMMITTEE_PANEL = read('src/committee/CreditCommitteePackageReviewQueuePanel.tsx');
const DEAL_WORKSPACE = read('src/deals/BankerDealWorkspace.tsx');
const APP = read('src/App.tsx');
const PKG = read('package.json');
const SNAPSHOT = read('src/shared/governance/releaseCandidateSnapshot.test.ts');

/** Fake/sample/demo *data* identifiers that must never appear in production. */
const FAKE_DATA_RE =
  /\b(sampleDeals|demoData|mockClients|fakeBorrower|sampleData|seedData|SAMPLE_DATA|DEMO_DATA|MOCK_DATA|FAKE_DATA|sampleFinancials|demoFinancials)\b/;
/** Borrower-comms send identifiers (not the audit-actor email field). */
const BORROWER_COMMS_RE =
  /mailto:|sendBorrower|BorrowerCommunication|sendDocumentRequest|sendBorrowerUpdate|\bOutlook\b|\bSMS\b|\bhandoff\b/i;

const PROD_CREDIT_FILES = [
  'src/deals/CreditMemo.tsx',
  'src/deals/creditMemoDraft.ts',
  'src/deals/creditMemoActions.ts',
  'src/deals/creditMemoQueries.ts',
  'src/committee/creditCommitteePackageQueue.ts',
  'src/committee/CreditCommitteePackageReviewQueuePanel.tsx',
];

// ---------------------------------------------------------------------------
// 1. Doc + snapshot tracking.
// ---------------------------------------------------------------------------
describe('192 — doc exists and snapshot tracks it', () => {
  it('the Phase 192 doc exists on disk', () => {
    expect(existsSync(resolve(ROOT, DOC_REL))).toBe(true);
  });

  it('the release-candidate snapshot references the Phase 192 doc', () => {
    expect(SNAPSHOT).toMatch(/PHASE_192_CREDIT_COMMITTEE_COMPLIANCE_V1_READINESS/);
  });

  it('the existing Phase 191 banker doc remains present', () => {
    expect(existsSync(resolve(ROOT, 'docs/PHASE_191_BANKER_V1_RELEASE_CANDIDATE_HARDENING.md'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. Credit memo preview surface exists + reachable + no fake data + no comms.
// ---------------------------------------------------------------------------
describe('192 — credit memo preview surface', () => {
  it('the credit memo surface exists', () => {
    expect(existsSync(resolve(ROOT, 'src/deals/CreditMemo.tsx'))).toBe(true);
  });

  it('is mounted/reachable from the banker deal workspace', () => {
    expect(DEAL_WORKSPACE).toMatch(/import \{ CreditMemo \} from '\.\/CreditMemo'/);
    expect(DEAL_WORKSPACE).toMatch(/<CreditMemo/);
  });

  it('contains no fake/sample/demo financial literals (production credit path)', () => {
    for (const rel of PROD_CREDIT_FILES) {
      expect(stripComments(read(rel)), `${rel}`).not.toMatch(FAKE_DATA_RE);
    }
    // Missing inputs render an honest placeholder rather than fabricated data.
    expect(CREDIT_MEMO_DRAFT).toMatch(/MISSING_PLACEHOLDER\s*=\s*'Missing \/ Not provided\.'/);
  });

  it('the credit memo path wires no borrower comms (code, sans docstring)', () => {
    for (const src of [CREDIT_MEMO, CREDIT_MEMO_DRAFT, CREDIT_MEMO_ACTIONS]) {
      expect(stripComments(src)).not.toMatch(BORROWER_COMMS_RE);
    }
    // The preview component imports no borrower-comms module.
    const specs = (CREDIT_MEMO.match(/from '([^']+)'/g) ?? []).map((m) => m.replace(/^from '|'$/g, ''));
    for (const s of specs) {
      expect(/borrowerComms|BorrowerCommunication|sendBorrower|outlook|email/i.test(s), `import ${s}`).toBe(false);
    }
  });

  it('exposes no uncertified approval/decline action from preview', () => {
    const code = stripComments(CREDIT_MEMO);
    // No approve/decline/decision action identifiers (the disclaimer "Not an
    // approval or credit decision" is rendered TEXT, not an action).
    expect(code).not.toMatch(/\b(approveMemo|declineMemo|submitDecision|recordDecision|approveDeal|setApproved|castVote)\b/);
    // The only write is the governed Save Draft, gated by canWrite.
    expect(CREDIT_MEMO).toMatch(/saveCreditMemoDraft/);
    expect(CREDIT_MEMO).toMatch(/onSave=\{canWrite \? handleSave : undefined\}/);
    // The memo status vocabulary has no "approved" / "committee" state.
    expect(CREDIT_MEMO_QUERIES).toMatch(/CreditMemoStatusKey\s*=\s*'draft'\s*\|\s*'final'\s*\|\s*'stale'/);
    expect(stripComments(CREDIT_MEMO_QUERIES)).not.toMatch(/'committee[_-]?approved'|'approved'/);
  });

  it('renders the explicit no-credit-decision caveat (source-fact discipline)', () => {
    expect(CREDIT_MEMO).toMatch(/Not an approval or credit decision/);
    expect(CREDIT_MEMO_DRAFT).toMatch(/not a credit decision/i);
  });
});

// ---------------------------------------------------------------------------
// 3. Committee readiness surface — exists, honest, never implies approval.
// ---------------------------------------------------------------------------
describe('192 — committee readiness surface', () => {
  it('the committee readiness model + read-only panel exist', () => {
    expect(existsSync(resolve(ROOT, 'src/committee/creditCommitteePackageQueue.ts'))).toBe(true);
    expect(existsSync(resolve(ROOT, 'src/committee/CreditCommitteePackageReviewQueuePanel.tsx'))).toBe(true);
  });

  it('the panel is review-only with a visible no-approval caveat', () => {
    expect(COMMITTEE_PANEL).toMatch(/read-only|review-only/i);
    expect(COMMITTEE_PANEL).toMatch(/no vote, approval, or denial is implied or recorded/i);
  });

  it('the readiness model declares no "approved" status and no approval verbs', () => {
    // The status union carries no approval state.
    expect(COMMITTEE_QUEUE).toMatch(
      /CreditCommitteeReadinessStatus\s*=[\s\S]*?'ready_for_review'[\s\S]*?'blocked'[\s\S]*?'needs_evidence'[\s\S]*?'not_generated'[\s\S]*?'unknown'/,
    );
    expect(COMMITTEE_QUEUE).not.toMatch(/'committee_approved'|'approved'\b/);
  });

  it('a fully-ready package is "ready for human review" — never an approval', () => {
    const ready: CreditCommitteePackageInput = {
      dealId: 'd1',
      committeeReadiness: { hasDecisionSupport: true, remainingBlockers: [], evidenceCount: 3, missingEvidenceLabels: [] },
    };
    const out = deriveCreditCommitteePackageQueue({ packages: [ready] });
    const row = out.rows[0];
    expect(row.readinessStatus).toBe('ready_for_review');
    expect(row.readinessLabel).toMatch(/human committee review/i);
    // No row label / next step ever asserts approval, a vote, or a denial.
    for (const r of out.rows) {
      expect(r.readinessLabel).not.toMatch(/approv/i);
      expect(r.nextHumanReviewStep).not.toMatch(/\b(approve|vote|deny|denial)\b/i);
    }
  });

  it('no input renders an honest unavailable state (no sample fallback)', () => {
    const out = deriveCreditCommitteePackageQueue(undefined);
    expect(out.available).toBe(false);
    expect(out.rows).toHaveLength(0);
    expect(out.warnings.join(' ')).toMatch(/unavailable/i);
  });
});

// ---------------------------------------------------------------------------
// 4. Missing evidence / blockers / unsupported conclusions stay visible.
// ---------------------------------------------------------------------------
describe('192 — missing evidence + blockers stay visible (no generated approval)', () => {
  it('remaining blockers keep a package "blocked" — never ready/approved', () => {
    const blocked: CreditCommitteePackageInput = {
      dealId: 'd2',
      committeeReadiness: { remainingBlockers: ['Missing audited financials'], evidenceCount: 2 },
    };
    const row = deriveCreditCommitteePackageQueue({ packages: [blocked] }).rows[0];
    expect(row.readinessStatus).toBe('blocked');
    expect(row.remainingBlockerCount).toBe(1);
    expect(row.readinessLabel).toMatch(/blocker/i);
  });

  it('missing evidence keeps a package "needs_evidence" with labels preserved', () => {
    const needs: CreditCommitteePackageInput = {
      dealId: 'd3',
      committeeReadiness: { remainingBlockers: [], evidenceCount: 0, missingEvidenceLabels: ['2024 tax returns'] },
    };
    const row = deriveCreditCommitteePackageQueue({ packages: [needs] }).rows[0];
    expect(row.readinessStatus).toBe('needs_evidence');
    expect(row.missingEvidenceLabels).toContain('2024 tax returns');
  });

  it('an unsupported analyst/decision conclusion is NOT shown as ready', () => {
    const unsupported: CreditCommitteePackageInput = {
      dealId: 'd4',
      committeeReadiness: {
        remainingBlockers: [],
        evidenceCount: 3,
        missingEvidenceLabels: [],
        hasDecisionSupport: false,
        decisionSupportCount: 0,
      },
    };
    const row = deriveCreditCommitteePackageQueue({ packages: [unsupported] }).rows[0];
    expect(row.readinessStatus).not.toBe('ready_for_review');
    expect(row.readinessStatus).toBe('unknown');
    expect(row.honestWarnings.join(' ')).toMatch(/missing or ambiguous/i);
  });

  it('the credit memo draft surfaces missing borrower/industry facts honestly', () => {
    // Industry + every other deal fact go through the missing-aware helpers.
    expect(CREDIT_MEMO_DRAFT).toMatch(/'Industry'/);
    expect(CREDIT_MEMO_DRAFT).toMatch(/valOrMissing|trackMissing/);
    // Recommended-next-steps never recommends/approves a credit decision.
    expect(stripComments(CREDIT_MEMO_DRAFT)).not.toMatch(/\bapproveDeal\b|\bsetApproved\b/);
  });
});

// ---------------------------------------------------------------------------
// 5. Audit/compliance posture intact.
// ---------------------------------------------------------------------------
describe('192 — audit/compliance posture intact', () => {
  it('credit memo writes resolve the audited actor via the core-user bind (never /systemusers)', () => {
    // Save uses the shared audit-actor bind contract; /systemusers is never bound
    // where a cr664_user (CoreUser) is required.
    expect(CREDIT_MEMO_ACTIONS).toMatch(/auditActorBind|assertChangedByCoreUserBind|changedByBind/);
    const code = stripComments(CREDIT_MEMO_ACTIONS);
    expect(code).not.toMatch(/cr664_ChangedBy[^\n]*\/systemusers/);
  });

  it('correlation id stays audit/request metadata (not a checklist-style row payload)', () => {
    // cr664_correlationid appears only on the audit event, never as a checklist
    // document row field.
    expect(CREDIT_MEMO_ACTIONS).not.toMatch(/cr664_documentname/);
  });
});

// ---------------------------------------------------------------------------
// 6. Release alignment — gates, build recovery, no new approval route.
// ---------------------------------------------------------------------------
describe('192 — release alignment', () => {
  it('all three checklist gates remain false', () => {
    expect(DOCUMENT_CHECKLIST_PILOT_UI_ENABLED).toBe(false);
    expect(DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED).toBe(false);
    expect(DOCUMENT_CHECKLIST_GENERATION_ENABLED).toBe(false);
    const config = read('src/deals/documentChecklistPilotConfig.ts');
    const flags = read('src/deals/dealOriginationFeatureFlags.ts');
    expect(config).toMatch(/DOCUMENT_CHECKLIST_PILOT_UI_ENABLED = false as const/);
    expect(config).toMatch(/DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED = false as const/);
    expect(flags).toMatch(/DOCUMENT_CHECKLIST_GENERATION_ENABLED = false as const/);
  });

  it('the Phase 190A build preflight remains wired into the build', () => {
    expect(PKG).toMatch(
      /"build":\s*"node scripts\/phase190A-power-artifact-preflight\.mjs --ensure && tsc -b && vite build"/,
    );
  });

  it('no ungoverned approval route is added (route shape unchanged)', () => {
    expect(Object.keys(WORKSPACE_ROUTES)).toEqual(['banker', 'team', 'manager', 'executive', 'admin']);
    expect((APP.match(/<WorkspaceGate allowed=/g) ?? []).length).toBe(5);
    expect(APP).not.toMatch(/path="[^"]*approv/i);
    expect(APP).not.toMatch(/path="[^"]*committee/i);
  });
});

// ---------------------------------------------------------------------------
// 7. The Phase 192 doc records the go/no-go matrix + safety statements.
// ---------------------------------------------------------------------------
describe('192 — doc records the go/no-go matrix + safety statements', () => {
  const DOC = read(DOC_REL);

  it('names the credit/committee surface inventory', () => {
    for (const re of [/credit memo/i, /committee readiness/i, /evidence|source fact/i, /blocker/i, /audit|compliance/i]) {
      expect(DOC).toMatch(re);
    }
  });

  it('records green/yellow/red status and P0/P1/P2 blockers', () => {
    expect(DOC).toMatch(/green/i);
    expect(DOC).toMatch(/yellow/i);
    expect(DOC).toMatch(/red/i);
    expect(DOC).toMatch(/P0/);
    expect(DOC).toMatch(/P1/);
    expect(DOC).toMatch(/P2/);
  });

  it('makes the explicit compliance statements', () => {
    expect(DOC).toMatch(/no fake.*source|no fabricated source|sourced or.*missing/i);
    expect(DOC).toMatch(/no fake approval|no fabricated approval|no false.*approv/i);
    expect(DOC).toMatch(/no borrower comms|no borrower communication/i);
  });

  it('keeps the three checklist gates documented false', () => {
    expect(DOC).toMatch(/DOCUMENT_CHECKLIST_PILOT_UI_ENABLED\s*=\s*false/);
    expect(DOC).toMatch(/DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED\s*=\s*false/);
    expect(DOC).toMatch(/DOCUMENT_CHECKLIST_GENERATION_ENABLED\s*=\s*false/);
  });

  it('records the build-from-no-.power statement and no-schema posture', () => {
    expect(DOC).toMatch(/\.power/);
    expect(DOC).toMatch(/pnpm build/);
    expect(DOC).toMatch(/no schema|no migration/i);
  });

  it('preserves the Phase 191 banker CONDITIONAL GO and states a recommendation', () => {
    expect(DOC).toMatch(/CONDITIONAL GO|NO-GO|\bGO\b/);
    expect(DOC).toMatch(/191/);
  });
});
