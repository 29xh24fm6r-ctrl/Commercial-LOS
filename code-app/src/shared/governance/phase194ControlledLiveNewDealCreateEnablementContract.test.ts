import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  evaluateBankerCreateRollout,
  type BankerCreateRolloutInput,
} from '../../deals/bankerNewDealCreateRollout';
import { BANKER_NEW_DEAL_CREATE_ENABLED } from '../../deals/dealOriginationFeatureFlags';
import { NEW_DEAL_CREATE_ADAPTER_ENABLED } from '../../deals/newDealCreateFeatureFlags';
import { NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED } from '../../admin/adminNewDealIntakeModel';
import {
  DOCUMENT_CHECKLIST_PILOT_UI_ENABLED,
  DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED,
} from '../../deals/documentChecklistPilotConfig';
import { DOCUMENT_CHECKLIST_GENERATION_ENABLED } from '../../deals/dealOriginationFeatureFlags';

/**
 * PHASE 194 — Controlled live New Deal create enablement contract.
 *
 * Certifies the controlled production enablement path for live New Deal create.
 * It changes NO gate. It pins that the gate model is fail-closed, that any one
 * false gate (rollback) disables live create, that all three gates plus a
 * certified actor / references / resolver are required for `live_controlled`,
 * that the create payload allow-list and the cr664_user audit bind are intact,
 * and that the create path introduces no borrower comms, no checklist
 * generation, no CRM writes, and no fake data.
 */

const ROOT = resolve(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const DOC_REL = 'docs/PHASE_194_CONTROLLED_LIVE_NEW_DEAL_CREATE_ENABLEMENT.md';
const NEW_DEAL_SURFACE = read('src/banker/BankerNewDealCreate.tsx');
const CREATE_ADAPTER = read('src/deals/newDealCreateAdapter.ts');
const AUDIT_RESOLVER = read('src/deals/newDealAuditActorResolver.ts');
const WORKSPACE_GATE = read('src/bootstrap/WorkspaceGate.tsx');
const BANKER_PROVIDER = read('src/banker/BankerProvider.tsx');
const PKG = read('package.json');
const SNAPSHOT = read('src/shared/governance/releaseCandidateSnapshot.test.ts');

/** Fake/sample/demo *data* identifiers that must never enter the create path. */
const FAKE_DATA_RE =
  /\b(sampleDeals|demoData|mockClients|fakeBorrower|sampleData|seedData|SAMPLE_DATA|DEMO_DATA|MOCK_DATA|FAKE_DATA)\b/;
/** Borrower-comms send identifiers. */
const BORROWER_COMMS_RE =
  /mailto:|sendBorrower|BorrowerCommunication|sendDocumentRequest|sendBorrowerUpdate|\bOutlook\b|\bSMS\b/i;

/** Every prerequisite satisfied EXCEPT the gate values, which each test sets. */
function prereqs(over: Partial<BankerCreateRolloutInput> = {}): BankerCreateRolloutInput {
  return {
    actorSystemUserId: 'su-1',
    bankerAuthorized: true,
    resolverReady: true,
    productionReferencesApproved: true,
    environmentIsProduction: false,
    gateValues: { banker: true, adapter: true, intake: true },
    ...over,
  };
}

// ---------------------------------------------------------------------------
// 1. Docs + snapshot.
// ---------------------------------------------------------------------------
describe('194 — doc + snapshot + prior release docs', () => {
  it('the Phase 194 doc exists on disk', () => {
    expect(existsSync(resolve(ROOT, DOC_REL))).toBe(true);
  });
  it('the release-candidate snapshot references the Phase 194 doc', () => {
    expect(SNAPSHOT).toMatch(/PHASE_194_CONTROLLED_LIVE_NEW_DEAL_CREATE_ENABLEMENT/);
  });
  it('the Phase 191 + Phase 192 docs remain present', () => {
    expect(existsSync(resolve(ROOT, 'docs/PHASE_191_BANKER_V1_RELEASE_CANDIDATE_HARDENING.md'))).toBe(true);
    expect(existsSync(resolve(ROOT, 'docs/PHASE_192_CREDIT_COMMITTEE_COMPLIANCE_V1_READINESS.md'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. Gate model — fail-closed, all-three-required, rollback disables.
// ---------------------------------------------------------------------------
describe('194 — gate model is fail-closed', () => {
  it('the three global create gates default to false', () => {
    expect(BANKER_NEW_DEAL_CREATE_ENABLED).toBe(false);
    expect(NEW_DEAL_CREATE_ADAPTER_ENABLED).toBe(false);
    expect(NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED).toBe(false);
    expect(read('src/deals/dealOriginationFeatureFlags.ts')).toMatch(/BANKER_NEW_DEAL_CREATE_ENABLED = false as const/);
    expect(read('src/deals/newDealCreateFeatureFlags.ts')).toMatch(/NEW_DEAL_CREATE_ADAPTER_ENABLED = false as const/);
    expect(read('src/admin/adminNewDealIntakeModel.ts')).toMatch(/NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED = false as const/);
  });

  it('evaluateBankerCreateRollout() returns disabled by default (no overrides)', () => {
    expect(evaluateBankerCreateRollout()).toBe('disabled');
  });

  it('rollback: with no gate-value override it falls back to the false globals → disabled', () => {
    expect(evaluateBankerCreateRollout(prereqs({ gateValues: undefined }))).toBe('disabled');
  });

  it('all three gates true + certified actor/references/resolver → live_controlled', () => {
    expect(evaluateBankerCreateRollout(prereqs())).toBe('live_controlled');
  });

  it('any ONE false gate blocks live create (rollback of any gate disables)', () => {
    expect(evaluateBankerCreateRollout(prereqs({ gateValues: { banker: false, adapter: true, intake: true } }))).toBe('disabled');
    expect(evaluateBankerCreateRollout(prereqs({ gateValues: { banker: true, adapter: false, intake: true } }))).toBe('disabled');
    expect(evaluateBankerCreateRollout(prereqs({ gateValues: { banker: true, adapter: true, intake: false } }))).toBe('disabled');
  });
});

// ---------------------------------------------------------------------------
// 3. Create path safety — actor required, references/resolver/environment gated.
// ---------------------------------------------------------------------------
describe('194 — create path requires a certified actor + context', () => {
  it('a missing actor systemuser is unauthorized (no actorless create)', () => {
    expect(evaluateBankerCreateRollout(prereqs({ actorSystemUserId: null }))).toBe('unauthorized');
  });
  it('an unauthorized banker is rejected', () => {
    expect(evaluateBankerCreateRollout(prereqs({ bankerAuthorized: false }))).toBe('unauthorized');
  });
  it('production without explicit rollout approval is environment_not_allowed', () => {
    expect(
      evaluateBankerCreateRollout(prereqs({ environmentIsProduction: true, productionRolloutApproved: false })),
    ).toBe('environment_not_allowed');
  });
  it('unapproved production references block create', () => {
    expect(evaluateBankerCreateRollout(prereqs({ productionReferencesApproved: false }))).toBe('references_not_approved');
  });
  it('an unready Stage/Status resolver blocks create', () => {
    expect(evaluateBankerCreateRollout(prereqs({ resolverReady: false }))).toBe('resolver_not_ready');
  });

  it('the create surface requires a resolved banker identity to go live', () => {
    expect(NEW_DEAL_SURFACE).toMatch(/useBanker\(\)/);
    expect(NEW_DEAL_SURFACE).toMatch(/bankerAuthorized = Boolean\(systemUserId\) && !writeDisabledReason/);
    // Factory Arc Phase 6 — the form + submit still render only when the rollout
    // resolves to live_controlled, but now via ONE normalized CapabilityAvailability
    // (deriveNewDealCreateAvailability) instead of a direct `rollout === 'live_controlled'`
    // comparison in the component. deriveNewDealCreateAvailability's own test file pins
    // that `available` is true if and only if the rollout state is 'live_controlled'.
    expect(NEW_DEAL_SURFACE).toMatch(/const availability = deriveNewDealCreateAvailability\(rollout, /);
    expect(NEW_DEAL_SURFACE).toMatch(/const live = availability\.available/);
    expect(NEW_DEAL_SURFACE).toMatch(/canSubmit =\s*\n?\s*live &&/);
  });

  it('the create surface disables downstream WRITE automation (no checklist generation triggered)', () => {
    // The banker create's config enables ONLY duplicateDetectionEnabled — a pure, read-only,
    // warning-only pre-create check (no IO, never blocks unless policy says an exact duplicate
    // blocks, which this surface does not set). Every downstream WRITE module (CRM link, borrower
    // invite, stage advance, task generation, checklist generation, portfolio side effects,
    // borrower messaging) stays disabled — this pins that no OTHER automation key is ever set.
    expect(NEW_DEAL_SURFACE).toMatch(/config:\s*\{\s*duplicateDetectionEnabled:\s*true\s*\}/);
    expect(NEW_DEAL_SURFACE).not.toMatch(
      /config:\s*\{[^}]*(bankerCreateEnabled|crmAutomationEnabled|borrowerInviteMode|autoStageAdvanceEnabled|taskGenerationEnabled|documentChecklistEnabled|portfolioSideEffectsEnabled|borrowerMessagingMode|borrowerEmailTransportEnabled|borrowerSmsTransportEnabled|borrowerTwilioTransportEnabled|duplicateMergeApplyEnabled)/,
    );
    expect(DOCUMENT_CHECKLIST_GENERATION_ENABLED).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. Create path imports — no comms, no checklist gen, no CRM write, no fake data.
// ---------------------------------------------------------------------------
describe('194 — create path import boundary is clean', () => {
  it('the create surface + adapter import no borrower comms', () => {
    for (const src of [NEW_DEAL_SURFACE, CREATE_ADAPTER]) {
      expect(stripComments(src)).not.toMatch(BORROWER_COMMS_RE);
    }
  });
  it('the create surface + adapter import no checklist generation', () => {
    for (const src of [NEW_DEAL_SURFACE, CREATE_ADAPTER]) {
      expect(src).not.toMatch(/from '[^']*(documentChecklist|newDealChecklistGeneration)[^']*'/);
    }
  });
  it('the create surface + adapter import no CRM write adapter', () => {
    for (const src of [NEW_DEAL_SURFACE, CREATE_ADAPTER]) {
      expect(src).not.toMatch(/from '[^']*(crmLiveDataverse|crmPersistence|crmWriteback|Salesforce)[^']*'/i);
    }
  });
  it('no fake/sample/demo data enters the create path', () => {
    for (const src of [NEW_DEAL_SURFACE, CREATE_ADAPTER]) {
      expect(stripComments(src)).not.toMatch(FAKE_DATA_RE);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Dataverse write boundary — allow-list + core-user bind intact.
// ---------------------------------------------------------------------------
describe('194 — Dataverse write boundary intact', () => {
  it('the certified create payload allow-list is exactly the CRM-first field set', () => {
    // Read the frozen allow-list from source (the adapter module pulls the
    // Power Apps SDK, so we assert against its text rather than importing it).
    // The CRM-first intake adds cr664_Team@odata.bind (owning-team lookup) to
    // the previously-certified set — still a closed, deliberate allow-list.
    const block = CREATE_ADAPTER.match(
      /NEW_DEAL_CREATE_ALLOWED_FIELDS = Object\.freeze\(\[([\s\S]*?)\] as const\)/,
    );
    expect(block).toBeTruthy();
    const fields = [...block![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(fields).toEqual([
      'cr664_dealname',
      'cr664_StageReference@odata.bind',
      'cr664_StatusReference@odata.bind',
      'cr664_AssignedBanker@odata.bind',
      'cr664_stageentrydate',
      'cr664_amount',
      'cr664_Client@odata.bind',
      'cr664_Team@odata.bind',
    ]);
    // The adapter asserts the built payload's keys are a subset and fails closed.
    expect(CREATE_ADAPTER).toMatch(/new Set<string>\(NEW_DEAL_CREATE_ALLOWED_FIELDS\)/);
  });

  it('the audit actor binds a cr664_user (CoreUser), never /systemusers', () => {
    expect(CREATE_ADAPTER).toMatch(/resolveActorChangedBy/);
    expect(AUDIT_RESOLVER).toMatch(/\/cr664_users\(/);
    // The resolver never emits a /systemusers ChangedBy bind.
    expect(stripComments(AUDIT_RESOLVER)).not.toMatch(/changedByBind:\s*`?\/systemusers/);
  });

  it('correlation id is not part of the create payload allow-list (audit metadata only)', () => {
    const block = CREATE_ADAPTER.match(
      /NEW_DEAL_CREATE_ALLOWED_FIELDS = Object\.freeze\(\[([\s\S]*?)\] as const\)/,
    );
    expect(block![1]).not.toMatch(/cr664_correlationid/);
  });
});

// ---------------------------------------------------------------------------
// 6. Release alignment — permission, build recovery, checklist gates.
// ---------------------------------------------------------------------------
describe('194 — release alignment', () => {
  it('permission-before-render remains fail-closed', () => {
    expect(WORKSPACE_GATE).toMatch(/<Navigate to=\{route\} replace \/>/);
    expect(BANKER_PROVIDER).toMatch(/kind: 'not-banker'/);
  });
  it('the Phase 190A build preflight remains wired into the build', () => {
    expect(PKG).toMatch(/"build":\s*"node scripts\/phase190A-power-artifact-preflight\.mjs --ensure && tsc -b && vite build"/);
  });
  it('the two pilot-UI gates remain false; generation reset to safe default off', () => {
    expect(DOCUMENT_CHECKLIST_PILOT_UI_ENABLED).toBe(false);
    expect(DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED).toBe(false);
    expect(DOCUMENT_CHECKLIST_GENERATION_ENABLED).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 7. The Phase 194 doc records the enablement + rollback + recommendation.
// ---------------------------------------------------------------------------
describe('194 — doc records enablement controls + recommendation', () => {
  const DOC = read(DOC_REL);

  it('names all three create gates', () => {
    expect(DOC).toMatch(/BANKER_NEW_DEAL_CREATE_ENABLED/);
    expect(DOC).toMatch(/NEW_DEAL_CREATE_ADAPTER_ENABLED/);
    expect(DOC).toMatch(/NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED/);
  });

  it('documents the rollback / kill-switch and operator checklists', () => {
    expect(DOC).toMatch(/rollback|kill[- ]switch/i);
    expect(DOC).toMatch(/pre-enable/i);
    expect(DOC).toMatch(/smoke/i);
  });

  it('records the no-borrower-comms / no-schema / no-checklist-generation statements', () => {
    expect(DOC).toMatch(/no borrower comms|no borrower communication/i);
    expect(DOC).toMatch(/no schema|no migration/i);
    expect(DOC).toMatch(/no checklist generation/i);
  });

  it('keeps the three checklist gates documented false + build-from-no-.power', () => {
    expect(DOC).toMatch(/DOCUMENT_CHECKLIST_GENERATION_ENABLED\s*=\s*false/);
    expect(DOC).toMatch(/\.power/);
    expect(DOC).toMatch(/pnpm build/);
  });

  it('states a controlled-enablement recommendation and the prior CONDITIONAL GO posture', () => {
    expect(DOC).toMatch(/READY FOR CONTROLLED ENABLEMENT|NOT READY FOR CONTROLLED ENABLEMENT/);
    expect(DOC).toMatch(/CONDITIONAL GO/);
    expect(DOC).toMatch(/191/);
    expect(DOC).toMatch(/192/);
  });
});
