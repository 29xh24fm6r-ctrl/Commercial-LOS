import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import {
  DELIBERATELY_BLOCKED,
  EXEC_TRANSITIONAL_FALLBACK_FEATURES,
  GOVERNED_WRITES,
  LOCAL_ONLY_FLOWS,
  NOT_WIRED,
  PERMISSION_BEFORE_QUERY_VERIFIED,
  REFERENCE_DATA_GOVERNED,
  WORKSPACE_DEAL_ACCESS,
  WORKSPACE_ISOLATION_VERIFIED,
} from './platformInventory';

/**
 * Phase 40: pin the static metadata so a future edit cannot silently
 * move a known blocker into "shipped" or accidentally drop a guard
 * row. The Release Readiness Gate and the Phase-40 docs both read
 * this module — drift here would mislead both.
 */

describe('platformInventory — governed writes', () => {
  it('contains the eleven shipped governed writes (Phases 18, 19, 21, 22, 25, 51, 55, 61, 63, 70)', () => {
    const ids = GOVERNED_WRITES.map((w) => w.id).sort();
    expect(ids).toEqual(
      [
        'alert-dismiss',
        'alert-resolve',
        'credit-memo-draft-save',
        'data-quality-flag-resolve',
        'deal-document-receive',
        'deal-document-request',
        'deal-document-request-email',
        'deal-document-request-handoff',
        'deal-document-review',
        'deal-document-review-task-create',
        'deal-task-complete',
      ].sort(),
    );
  });

  it('every governed write emits audit; deal-domain writes also emit a timeline event', () => {
    for (const w of GOVERNED_WRITES) {
      expect(w.emitsAudit).toBe(true);
    }
    const dealWrites = GOVERNED_WRITES.filter((w) =>
      [
        'deal-task-complete',
        'deal-document-request',
        'deal-document-request-email',
        'deal-document-request-handoff',
        'deal-document-review-task-create',
        'deal-document-receive',
        'deal-document-review',
        'credit-memo-draft-save',
      ].includes(w.id),
    );
    for (const w of dealWrites) {
      expect(w.emitsTimeline).toBe(true);
    }
  });

  it('does NOT list any unbuilt write surface as a shipped governed write', () => {
    // These are explicitly deferred per the brief — they MUST NOT
    // appear under shipped governed writes. Note that
    // `document-upload` (binary file upload) remains here even
    // though Phase 51 shipped `deal-document-receive` — receive is
    // a metadata-only write, not a binary upload.
    const forbidden = [
      'stage-progression-advance',
      'credit-memo-finalize',
      'borrower-email-send',
      'document-upload',
      'ai-generation',
    ];
    const ids = new Set(GOVERNED_WRITES.map((w) => w.id));
    for (const id of forbidden) expect(ids.has(id)).toBe(false);
  });
});

describe('platformInventory — deliberately blocked', () => {
  it('lists stage-progression-advance as Blocked with the schema reason', () => {
    const entry = DELIBERATELY_BLOCKED.find(
      (b) => b.id === 'stage-progression-advance',
    );
    expect(entry).toBeDefined();
    expect(entry!.reason).toMatch(/stagereferences|stage reference/i);
    expect(entry!.reason).toMatch(/ordering|sequence/i);
  });
});

describe('platformInventory — not wired', () => {
  it('lists every brief-mandated capability that is not built', () => {
    const ids = new Set(NOT_WIRED.map((n) => n.id));
    expect(ids.has('email-delivery')).toBe(true);
    expect(ids.has('document-upload')).toBe(true);
    expect(ids.has('ai-generation')).toBe(true);
    expect(ids.has('test-coverage-build-verification')).toBe(true);
    expect(ids.has('stage-reference-data-source')).toBe(true);
    expect(ids.has('stage-ordering-contract')).toBe(true);
    expect(ids.has('executive-deal-drillthrough')).toBe(true);
    expect(ids.has('admin-deal-drillthrough')).toBe(true);
    // Phase 65 — borrower-portal deferral ratification.
    expect(ids.has('borrower-portal')).toBe(true);
  });

  it('every not-wired entry has a concrete reason (not a vague "coming soon")', () => {
    for (const n of NOT_WIRED) {
      expect(n.reason.length).toBeGreaterThan(40);
      expect(/\bcoming soon\b/i.test(n.reason)).toBe(false);
      expect(/\btbd\b/i.test(n.reason)).toBe(false);
    }
  });

  // Phase 68: every NOT_WIRED entry MUST carry a blockerKind tag
  // from the closed union { connector | schema | governance |
  // observability | compound }. The tag drives the Capability
  // Inventory section in the Release Readiness Gate (it groups
  // by upstream-blocker shape so stakeholders see structure, not
  // a single "blocked" bucket).
  it('every not-wired entry carries a blockerKind from the closed union (Phase 68)', () => {
    const allowed = new Set<string>([
      'connector',
      'schema',
      'governance',
      'observability',
      'compound',
    ]);
    for (const n of NOT_WIRED) {
      expect(typeof n.blockerKind).toBe('string');
      expect(
        allowed.has(n.blockerKind),
        `NOT_WIRED.${n.id} has unknown blockerKind="${n.blockerKind}"`,
      ).toBe(true);
    }
  });

  it('specific not-wired entries map to specific blockerKinds (Phase 68 anchor)', () => {
    const byId = new Map(NOT_WIRED.map((n) => [n.id, n]));
    // Connector-blocked
    expect(byId.get('outlook-connector-live-send')?.blockerKind).toBe(
      'connector',
    );
    // Schema-blocked
    expect(byId.get('document-upload')?.blockerKind).toBe('schema');
    expect(byId.get('stage-reference-data-source')?.blockerKind).toBe(
      'schema',
    );
    expect(byId.get('stage-ordering-contract')?.blockerKind).toBe('schema');
    // Governance / deferred design decision
    expect(byId.get('email-delivery')?.blockerKind).toBe('governance');
    expect(byId.get('ai-generation')?.blockerKind).toBe('governance');
    expect(byId.get('executive-deal-drillthrough')?.blockerKind).toBe(
      'governance',
    );
    expect(byId.get('admin-deal-drillthrough')?.blockerKind).toBe(
      'governance',
    );
    // In-app observability not wired
    expect(byId.get('test-coverage-build-verification')?.blockerKind).toBe(
      'observability',
    );
    // Compound: borrower-portal stacks auth + invitation + role +
    // schema + secure-message + connector blockers
    expect(byId.get('borrower-portal')?.blockerKind).toBe('compound');
  });

  it('email-delivery reason explicitly mentions no Outlook / no Graph and the Phase-23 local-only stance', () => {
    const email = NOT_WIRED.find((n) => n.id === 'email-delivery')!;
    expect(email.reason).toMatch(/outlook|graph/i);
    expect(email.reason).toMatch(/local-only|copy-to-clipboard/i);
    expect(email.reason).toMatch(/BorrowerUpdateSent/);
  });

  it('test-coverage-build-verification reason explicitly says no in-process signal', () => {
    const tcv = NOT_WIRED.find(
      (n) => n.id === 'test-coverage-build-verification',
    )!;
    expect(tcv.reason).toMatch(/no runtime signal|in-process signal/i);
  });
});

describe('platformInventory — executive transitional fallback', () => {
  it('lists the two Phase-15 transitional surfaces', () => {
    expect([...EXEC_TRANSITIONAL_FALLBACK_FEATURES].sort()).toEqual(
      ['MonthlyClosingForecast', 'PipelineByStage'].sort(),
    );
  });
});

describe('platformInventory — local-only flows', () => {
  it('lists borrower update draft, credit memo local preview, Phase 66 borrower-safe status packet, Phase 72 activity-since-last-visit, Phase 73 credit-memo consistency check, and Phase 78 relationship-note draft', () => {
    const ids = new Set(LOCAL_ONLY_FLOWS.map((f) => f.id));
    expect(ids.has('borrower-update-draft')).toBe(true);
    expect(ids.has('credit-memo-local-preview')).toBe(true);
    // Phase 66 — borrower-safe status packet (no portal claim).
    expect(ids.has('borrower-safe-status-packet')).toBe(true);
    // Phase 72 — activity-since-last-visit (local browser marker).
    expect(ids.has('activity-since-last-visit')).toBe(true);
    // Phase 73 — credit-memo consistency review (deterministic
    // read-only; no AI; no decisioning).
    expect(ids.has('credit-memo-consistency-check')).toBe(true);
    // Phase 78 — banker relationship-note draft (local-only;
    // copy-to-clipboard; no Dataverse write; no audit/timeline).
    expect(ids.has('relationship-note-draft')).toBe(true);
    // Phase 83 — Autopilot suggestion ledger (local-only
    // opened/dismissed state across Phase 80/81/82 surfaces).
    expect(ids.has('autopilot-suggestion-ledger')).toBe(true);
    // Phase 86 — Microsoft Teams chat handoff (deep-link only;
    // no Graph; no Dataverse write; no audit/timeline; no notif).
    expect(ids.has('teams-chat-handoff')).toBe(true);
  });

  it('every local-only flow note explicitly states no Dataverse write', () => {
    for (const f of LOCAL_ONLY_FLOWS) {
      expect(f.note.toLowerCase()).toMatch(/no dataverse write|no.*write/);
    }
  });

  it('borrower-safe status packet (Phase 66) note explicitly disclaims any portal implication', () => {
    const entry = LOCAL_ONLY_FLOWS.find(
      (f) => f.id === 'borrower-safe-status-packet',
    );
    expect(entry).toBeDefined();
    expect(entry!.phase).toBe(66);
    // The note must explicitly cite that no portal is implied. This
    // pin survives even if the rest of the wording is edited later.
    expect(entry!.note).toMatch(/borrower portal|NOT_WIRED\.borrower-portal/i);
    // The note must reference the Phase 66 doc by path AND the
    // Phase 67 handoff-extension doc by path.
    expect(entry!.note).toMatch(/PHASE_66_BORROWER_SAFE_STATUS_PACKET\.md/);
    expect(entry!.note).toMatch(/PHASE_67_PACKET_EMAIL_HANDOFF\.md/);
  });

  it('activity-since-last-visit (Phase 72) is a LOCAL_ONLY flow with the right disclaimers', () => {
    const entry = LOCAL_ONLY_FLOWS.find(
      (f) => f.id === 'activity-since-last-visit',
    );
    expect(entry).toBeDefined();
    expect(entry!.phase).toBe(72);
    // The note must disclaim: no Dataverse write, no cross-device
    // sync, no audit/timeline emission, no notification delivery.
    expect(entry!.note).toMatch(/no Dataverse write/i);
    expect(entry!.note).toMatch(/no cross-device sync/i);
    expect(entry!.note).toMatch(/no audit row/i);
    expect(entry!.note).toMatch(/no timeline event/i);
    expect(entry!.note).toMatch(/no notification delivery/i);
    expect(entry!.note).toMatch(/no AI/i);
    expect(entry!.note).toMatch(/PHASE_72_ACTIVITY_SINCE_LAST_VISIT\.md/);
  });

  it('the Phase 72 doc actually exists on disk', () => {
    const repoRoot = resolve(__dirname, '..', '..', '..');
    const docPath = resolve(
      repoRoot,
      'docs/PHASE_72_ACTIVITY_SINCE_LAST_VISIT.md',
    );
    expect(existsSync(docPath)).toBe(true);
  });

  it('credit-memo-consistency-check (Phase 73) is a LOCAL_ONLY flow with the right disclaimers', () => {
    const entry = LOCAL_ONLY_FLOWS.find(
      (f) => f.id === 'credit-memo-consistency-check',
    );
    expect(entry).toBeDefined();
    expect(entry!.phase).toBe(73);
    // The note must explicitly disclaim every category the brief
    // forbids: no Dataverse write, no AI, no approval / credit
    // decision, no audit / timeline emission, no validation state.
    expect(entry!.note).toMatch(/no Dataverse write/i);
    expect(entry!.note).toMatch(/no AI/i);
    expect(entry!.note).toMatch(/no approval/i);
    expect(entry!.note).toMatch(/no audit row/i);
    expect(entry!.note).toMatch(/no timeline event/i);
    expect(entry!.note).toMatch(/no automatic blocking/i);
    expect(entry!.note).toMatch(/PHASE_73_CREDIT_MEMO_CONSISTENCY_CHECK\.md/);
  });

  it('the Phase 73 doc actually exists on disk', () => {
    const repoRoot = resolve(__dirname, '..', '..', '..');
    const docPath = resolve(
      repoRoot,
      'docs/PHASE_73_CREDIT_MEMO_CONSISTENCY_CHECK.md',
    );
    expect(existsSync(docPath)).toBe(true);
  });

  it('relationship-note-draft (Phase 78) is a LOCAL_ONLY flow with the right disclaimers', () => {
    const entry = LOCAL_ONLY_FLOWS.find(
      (f) => f.id === 'relationship-note-draft',
    );
    expect(entry).toBeDefined();
    expect(entry!.phase).toBe(78);
    // The note must explicitly disclaim every category the brief
    // forbids: no Dataverse write, no audit row, no timeline event,
    // no governed write entry, no cross-device persistence.
    expect(entry!.note).toMatch(/no Dataverse write/i);
    expect(entry!.note).toMatch(/no audit row/i);
    expect(entry!.note).toMatch(/no timeline event/i);
    expect(entry!.note).toMatch(/no governed write/i);
    expect(entry!.note).toMatch(/no cross-device persistence/i);
    // The note must cite the verbatim disclaimer the modal renders.
    expect(entry!.note).toMatch(
      /Local draft\. Not saved to the system\. Paste into the appropriate system of record\./,
    );
    expect(entry!.note).toMatch(/PHASE_78_RELATIONSHIP_NOTES_LOCAL_ONLY\.md/);
  });

  it('the Phase 78 doc actually exists on disk', () => {
    const repoRoot = resolve(__dirname, '..', '..', '..');
    const docPath = resolve(
      repoRoot,
      'docs/PHASE_78_RELATIONSHIP_NOTES_LOCAL_ONLY.md',
    );
    expect(existsSync(docPath)).toBe(true);
  });

  it('autopilot-suggestion-ledger (Phase 83) is a LOCAL_ONLY flow with the right disclaimers', () => {
    const entry = LOCAL_ONLY_FLOWS.find(
      (f) => f.id === 'autopilot-suggestion-ledger',
    );
    expect(entry).toBeDefined();
    expect(entry!.phase).toBe(83);
    // Brief mandates each of these disclaimers verbatim.
    expect(entry!.note).toMatch(/no Dataverse write/i);
    expect(entry!.note).toMatch(/no audit row/i);
    expect(entry!.note).toMatch(/no timeline event/i);
    expect(entry!.note).toMatch(/no governed write/i);
    expect(entry!.note).toMatch(/no cross-device sync/i);
    expect(entry!.note).toMatch(/not a workflow.resolution/i);
    expect(entry!.note).toMatch(/cc:autopilotSuggestionLedger:v1/);
    expect(entry!.note).toMatch(/PHASE_83_AUTOPILOT_SUGGESTION_LEDGER\.md/);
  });

  it('the Phase 83 doc actually exists on disk', () => {
    const repoRoot = resolve(__dirname, '..', '..', '..');
    const docPath = resolve(
      repoRoot,
      'docs/PHASE_83_AUTOPILOT_SUGGESTION_LEDGER.md',
    );
    expect(existsSync(docPath)).toBe(true);
  });

  it('teams-chat-handoff (Phase 86) is a LOCAL_ONLY flow with the right disclaimers', () => {
    const entry = LOCAL_ONLY_FLOWS.find((f) => f.id === 'teams-chat-handoff');
    expect(entry).toBeDefined();
    expect(entry!.phase).toBe(86);
    // Brief mandates each of these disclaimers.
    expect(entry!.note).toMatch(/no Dataverse write/i);
    expect(entry!.note).toMatch(/no audit row/i);
    expect(entry!.note).toMatch(/no timeline event/i);
    expect(entry!.note).toMatch(/no calendar sync/i);
    expect(entry!.note).toMatch(/no notification delivery/i);
    expect(entry!.note).toMatch(/no meeting created/i);
    expect(entry!.note).toMatch(/no Graph call/i);
    expect(entry!.note).toMatch(/no access-token acquisition/i);
    // UPN MUST come only from a verified user-context field; never
    // inferred from borrower / client name.
    expect(entry!.note).toMatch(/never inferred from borrower/i);
    // App must NEVER claim to send a message.
    expect(entry!.note).toMatch(/the app never sends a message/i);
    // Must reference the deep-link host AND the implementation files.
    expect(entry!.note).toMatch(
      /https:\/\/teams\.microsoft\.com\/l\/chat\/0\/0/,
    );
    expect(entry!.note).toMatch(/src\/shared\/teams\/teamsEnvironment\.ts/);
    expect(entry!.note).toMatch(/src\/deals\/TeamsChatHandoff\.tsx/);
    expect(entry!.note).toMatch(/PHASE_86_TEAMS_SDK_CHAT_HANDOFF\.md/);
    // The note MUST honestly state it is NOT a full Teams integration.
    expect(entry!.note).toMatch(/Does NOT imply a full.*Teams integration/i);
    expect(entry!.note).toMatch(/PHASE_85_TEAMS_INTEGRATION_READINESS_AUDIT\.md/);
  });

  it('the Phase 86 doc actually exists on disk', () => {
    const repoRoot = resolve(__dirname, '..', '..', '..');
    const docPath = resolve(
      repoRoot,
      'docs/PHASE_86_TEAMS_SDK_CHAT_HANDOFF.md',
    );
    expect(existsSync(docPath)).toBe(true);
  });

  it('teams-chat-handoff is NOT in GOVERNED_WRITES (Phase 86 is a handoff, not a write)', () => {
    const ids = new Set(GOVERNED_WRITES.map((w) => w.id));
    expect(ids.has('teams-chat-handoff')).toBe(false);
  });

  it('borrower-safe status packet (Phase 67) explicitly states no audit / timeline / Dataverse write for the handoff', () => {
    const entry = LOCAL_ONLY_FLOWS.find(
      (f) => f.id === 'borrower-safe-status-packet',
    )!;
    // The Phase 67 extension MUST stay LOCAL_ONLY. The note must
    // disclaim audit, timeline, and Dataverse writes — Phase 67 is
    // explicitly NOT a governed write.
    expect(entry.note).toMatch(/no audit row/i);
    expect(entry.note).toMatch(/no timeline event/i);
    expect(entry.note).toMatch(/no Dataverse write/i);
    // The note MUST describe the Phase 63 handoff helpers being
    // surfaced in the modal (mailto / clipboard).
    expect(entry.note).toMatch(/mailto/i);
    expect(entry.note).toMatch(/clipboard/i);
    // The note MUST state that recipient is never inferred from the
    // free-text clientName.
    expect(entry.note).toMatch(/never infer a recipient from clientName/i);
  });
});

// Phase 67 pin: the handoff extension is NOT a governed write. If a
// future phase records the handoff to Dataverse it MUST add a
// GOVERNED_WRITES entry and remove this pin.
describe('platformInventory — Phase 67 handoff classification', () => {
  it('borrower-safe-status-packet is NOT in GOVERNED_WRITES', () => {
    const writeIds = new Set(GOVERNED_WRITES.map((w) => w.id));
    expect(writeIds.has('borrower-safe-status-packet')).toBe(false);
  });

  it('GOVERNED_WRITES count: Phase 67 did not add a new governed write — Phase 70 later added the 11th (review task)', () => {
    expect(GOVERNED_WRITES.length).toBe(11);
  });

  it('the Phase 67 deferral doc actually exists on disk', () => {
    const repoRoot = resolve(__dirname, '..', '..', '..');
    const docPath = resolve(repoRoot, 'docs/PHASE_67_PACKET_EMAIL_HANDOFF.md');
    expect(existsSync(docPath)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Phase 70 — Stale Pending-Review Escalation (governed task creation)
//
// The 11th GOVERNED_WRITES entry: banker-initiated follow-up task
// for a pending-review document, with audit + timeline coordination.
// These tests pin the new write at the inventory layer; the
// inventory-driven discipline sweeps (Phases 46–50) pick it up
// automatically via their mappings.
// ---------------------------------------------------------------------------

describe('platformInventory — Phase 70 review-task governed write', () => {
  it('deal-document-review-task-create is shipped in GOVERNED_WRITES', () => {
    const entry = GOVERNED_WRITES.find(
      (w) => w.id === 'deal-document-review-task-create',
    );
    expect(entry).toBeDefined();
    expect(entry!.phase).toBe(70);
    expect(entry!.emitsAudit).toBe(true);
    expect(entry!.emitsTimeline).toBe(true);
  });

  it('the Phase 70 doc exists on disk', () => {
    const repoRoot = resolve(__dirname, '..', '..', '..');
    const docPath = resolve(repoRoot, 'docs/PHASE_70_STALE_REVIEW_ESCALATION.md');
    expect(existsSync(docPath)).toBe(true);
  });
});

describe('platformInventory — workspace deal access matrix', () => {
  it('banker is read-write; manager and team are read-only; executive and admin are denied', () => {
    const byRole = new Map(WORKSPACE_DEAL_ACCESS.map((w) => [w.role, w]));
    expect(byRole.get('banker')?.dealAccess).toBe('read-write');
    expect(byRole.get('manager')?.dealAccess).toBe('read-only');
    expect(byRole.get('team')?.dealAccess).toBe('read-only');
    expect(byRole.get('executive')?.dealAccess).toBe('denied');
    expect(byRole.get('admin')?.dealAccess).toBe('denied');
  });

  it('every non-denied workspace names its authorization function', () => {
    for (const w of WORKSPACE_DEAL_ACCESS) {
      if (w.dealAccess === 'denied') {
        expect(w.authFunction).toBeNull();
      } else {
        expect(w.authFunction).toMatch(/^loadDealFor/);
      }
    }
  });
});

describe('platformInventory — architectural invariants', () => {
  it('workspace isolation and permission-before-query are currently verified true', () => {
    expect(WORKSPACE_ISOLATION_VERIFIED).toBe(true);
    expect(PERMISSION_BEFORE_QUERY_VERIFIED).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Phase 43 — Stage Progression Enablement Map cross-reference
//
// Pins the standing invariant that the enablement map exists and that
// stage progression remains blocked. The enablement map plans the
// unblock; it must NOT change the blocked status.
// ---------------------------------------------------------------------------

describe('platformInventory — Phase 43 stage progression enablement', () => {
  it('REFERENCE_DATA_GOVERNED.stageCatalog.progressionEnabled is still false', () => {
    expect(REFERENCE_DATA_GOVERNED.stageCatalog.progressionEnabled).toBe(false);
  });

  it('stage-progression-advance is still in DELIBERATELY_BLOCKED', () => {
    const entry = DELIBERATELY_BLOCKED.find(
      (b) => b.id === 'stage-progression-advance',
    );
    expect(entry).toBeDefined();
  });

  it('stage-progression-advance is NOT in GOVERNED_WRITES', () => {
    const writeIds = new Set(GOVERNED_WRITES.map((w) => w.id));
    expect(writeIds.has('stage-progression-advance')).toBe(false);
  });

  it('blocked reason still cites the Phase 28 schema gap', () => {
    const entry = DELIBERATELY_BLOCKED.find(
      (b) => b.id === 'stage-progression-advance',
    )!;
    expect(entry.reason).toMatch(/Cr664_stagereferences|sequence|stage reference/i);
  });

  it('stage-progression-advance carries an enablementMapPath pointing at the planning doc', () => {
    const entry = DELIBERATELY_BLOCKED.find(
      (b) => b.id === 'stage-progression-advance',
    )!;
    expect(entry.enablementMapPath).toBe(
      'docs/STAGE_PROGRESSION_ENABLEMENT_MAP.md',
    );
  });

  it('the enablement map file actually exists on disk', () => {
    // Repo root from this test file: src/shared/governance/ → up 3.
    const repoRoot = resolve(__dirname, '..', '..', '..');
    const mapPath = resolve(repoRoot, 'docs/STAGE_PROGRESSION_ENABLEMENT_MAP.md');
    expect(existsSync(mapPath)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Phase 65 — Borrower Portal Deferral Ratification
//
// Converts the Phase 64 audit into permanent governance metadata + tests.
// The standing posture is "no borrower-facing portal ships in this Code App";
// every assertion below pins one slice of that posture so a future phase
// cannot quietly add a portal route, magic-link table, or external auth
// without flipping these tests.
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

describe('platformInventory — Phase 65 borrower portal deferral', () => {
  it('borrower-portal appears in NOT_WIRED', () => {
    const entry = NOT_WIRED.find((n) => n.id === 'borrower-portal');
    expect(entry).toBeDefined();
    expect(entry!.label.toLowerCase()).toContain('borrower');
  });

  it('borrower-portal is NOT in GOVERNED_WRITES', () => {
    const writeIds = new Set(GOVERNED_WRITES.map((w) => w.id));
    expect(writeIds.has('borrower-portal')).toBe(false);
  });

  it('borrower-portal is NOT in LOCAL_ONLY_FLOWS', () => {
    const flowIds = new Set(LOCAL_ONLY_FLOWS.map((f) => f.id));
    expect(flowIds.has('borrower-portal')).toBe(false);
  });

  it('borrower-portal is NOT in DELIBERATELY_BLOCKED (the deferral lives in NOT_WIRED, not DB)', () => {
    // The Phase 64 audit classifies the borrower portal as missing
    // upstream capability (auth / schema / connector), which matches the
    // NOT_WIRED semantic. DELIBERATELY_BLOCKED is reserved for surfaces
    // we WOULD ship if a schema decision had been made differently
    // (e.g. Advance Stage). The borrower portal isn't one decision away;
    // it's many. Keeping it in NOT_WIRED is the truthful classification.
    const blockedIds = new Set(DELIBERATELY_BLOCKED.map((b) => b.id));
    expect(blockedIds.has('borrower-portal')).toBe(false);
  });

  it('the NOT_WIRED reason cites every concrete blocker the Phase 64 audit confirmed', () => {
    const entry = NOT_WIRED.find((n) => n.id === 'borrower-portal')!;
    // Each of the six blockers the Phase 64 audit confirmed must
    // appear in the reason text. Fragment-based to tolerate light
    // copy-editing.
    expect(entry.reason).toMatch(/external auth/i);
    expect(entry.reason).toMatch(/(invitation|magic[- ]?link|token)/i);
    expect(entry.reason).toMatch(/external[- ]user role/i);
    expect(entry.reason).toMatch(/file column|cr664_documentchecklist/i);
    expect(entry.reason).toMatch(/(secure[- ]message|messages|conversations)/i);
    expect(entry.reason).toMatch(/(connector[- ]backed|outlook connector|office 365)/i);
    // The Phase 65 doc must be reachable from the row.
    expect(entry.reason).toMatch(/PHASE_65_BORROWER_PORTAL_DEFERRAL\.md/);
    // The Phase 64 audit must be reachable from the row.
    expect(entry.reason).toMatch(/PHASE_64_BORROWER_PORTAL_AUDIT\.md/);
  });

  it('the NOT_WIRED reason is concrete (not "coming soon" / "tbd")', () => {
    const entry = NOT_WIRED.find((n) => n.id === 'borrower-portal')!;
    expect(/\bcoming soon\b/i.test(entry.reason)).toBe(false);
    expect(/\btbd\b/i.test(entry.reason)).toBe(false);
    // Length floor — the existing not-wired-reason test imposes 40
    // chars; the borrower-portal reason must be substantially longer
    // than that (six blockers + two doc references).
    expect(entry.reason.length).toBeGreaterThan(400);
  });

  it('the Phase 65 deferral doc actually exists on disk', () => {
    const docPath = resolve(REPO_ROOT, 'docs/PHASE_65_BORROWER_PORTAL_DEFERRAL.md');
    expect(existsSync(docPath)).toBe(true);
  });

  it('the Phase 64 audit doc actually exists on disk', () => {
    const docPath = resolve(REPO_ROOT, 'docs/PHASE_64_BORROWER_PORTAL_AUDIT.md');
    expect(existsSync(docPath)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Phase 65 — static-source assertion: no portal surface code exists
//
// A NOT_WIRED row is necessary but not sufficient. If a borrower route /
// magic-link handler / upload-portal component lands in the tree, the row
// would be a lie. This test sweeps src/ for any file whose path implies a
// borrower-portal surface and asserts the set is empty.
// ---------------------------------------------------------------------------

function isSourceFile(name: string): boolean {
  return (
    name.endsWith('.ts') ||
    name.endsWith('.tsx') ||
    name.endsWith('.js') ||
    name.endsWith('.jsx')
  );
}

function isTestFile(name: string): boolean {
  return /\.test\.(ts|tsx|js|jsx)$/.test(name);
}

function collectAll(dirAbs: string, out: string[]): void {
  for (const entry of readdirSync(dirAbs)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue;
    const abs = resolve(dirAbs, entry);
    const stat = statSync(abs);
    if (stat.isDirectory()) {
      collectAll(abs, out);
    } else if (stat.isFile() && isSourceFile(entry)) {
      out.push(abs);
    }
  }
}

function relForward(abs: string): string {
  return relative(REPO_ROOT, abs).split(sep).join('/');
}

// File-PATH patterns that would imply a portal surface. These match the
// path, not the contents, so a name reference inside a banker-only file
// (e.g. "borrower-update-draft") does not trigger them.
const FORBIDDEN_PATH_PATTERNS: ReadonlyArray<{ id: string; re: RegExp }> = [
  // /borrower/ as a route segment, OR borrower-portal-*, OR
  // BorrowerPortal*, OR src/borrower/ as a top-level role module.
  {
    id: 'borrower portal route',
    re: /(?:^|\/)src\/borrower\/|borrower[-_ ]?portal|BorrowerPortal/i,
  },
  // Magic-link / one-time-code / invitation routes or handlers.
  {
    id: 'magic-link route',
    re: /(?:^|\/)magic[-_ ]?link|MagicLink|one[-_ ]?time[-_ ]?(code|token)|OneTime(?:Code|Token)|invitation[-_ ]?token|InvitationToken/i,
  },
  // Upload-portal UI (distinct from the existing internal
  // document-upload non-capability; this guards against an
  // external-user-facing upload surface).
  {
    id: 'upload portal route',
    re: /upload[-_ ]?portal|UploadPortal|borrower[-_ ]?upload|BorrowerUpload/i,
  },
];

describe('platformInventory — Phase 65 static-source assertions (no portal code exists)', () => {
  const SRC = resolve(REPO_ROOT, 'src');
  const all: string[] = [];
  collectAll(SRC, all);

  // Test infrastructure self-reference: the platformInventory test file
  // itself contains these patterns inside string literals (the regexes
  // above). Allowlist test files from the structural sweep.
  const nonTestFiles = all.filter((abs) => !isTestFile(abs.split(sep).pop()!));

  // Allowlisted source files that mention "borrower-portal" by
  // CONTENT (audited literal references — e.g. the platformInventory
  // entry id, governance prose). These are the only places the
  // string should appear in production source.
  const ALLOWED_BORROWER_PORTAL_REFERENCES: ReadonlySet<string> = new Set([
    'src/shared/governance/platformInventory.ts',
  ]);

  for (const { id, re } of FORBIDDEN_PATH_PATTERNS) {
    it(`no source file path matches ${id} pattern`, () => {
      const offending = nonTestFiles
        .map(relForward)
        .filter((p) => re.test(p));
      expect(
        offending,
        `${id}: forbidden paths found — ${offending.join(', ')}`,
      ).toEqual([]);
    });
  }

  it('"borrower-portal" string literal only appears in the inventory file (production source)', () => {
    const hits: string[] = [];
    for (const abs of nonTestFiles) {
      const rel = relForward(abs);
      if (ALLOWED_BORROWER_PORTAL_REFERENCES.has(rel)) continue;
      const src = readFileSync(abs, 'utf8');
      if (/['"`]borrower-portal['"`]/.test(src)) hits.push(rel);
    }
    expect(
      hits,
      `'borrower-portal' literal leaked into production source outside the inventory: ${hits.join(', ')}`,
    ).toEqual([]);
  });

  it('no production source imports a token / magic-link / invitation module', () => {
    const offending: string[] = [];
    for (const abs of nonTestFiles) {
      const rel = relForward(abs);
      const src = readFileSync(abs, 'utf8');
      // Match import lines only — comments stripped roughly.
      const codeOnly = src
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
      if (
        /\bimport\b[^;]*\bfrom\s+['"][^'"]*(?:magicLink|MagicLink|oneTimeToken|OneTimeToken|invitationToken|InvitationToken)/.test(
          codeOnly,
        )
      ) {
        offending.push(rel);
      }
    }
    expect(offending).toEqual([]);
  });

  it('workspaceRoutes still recognizes exactly the five internal roles (no borrower / external / guest)', () => {
    // Read the file and assert the route map keys haven't expanded. A
    // future phase that adds a borrower role would have to touch this
    // file AND this test in the same commit, which is the desired
    // friction.
    const src = readFileSync(
      resolve(REPO_ROOT, 'src/bootstrap/workspaceRoutes.ts'),
      'utf8',
    );
    expect(src).toMatch(/banker:\s*'\/workspaces\/banker'/);
    expect(src).toMatch(/team:\s*'\/workspaces\/team'/);
    expect(src).toMatch(/manager:\s*'\/workspaces\/manager'/);
    expect(src).toMatch(/executive:\s*'\/workspaces\/executive'/);
    expect(src).toMatch(/admin:\s*'\/workspaces\/admin'/);
    // None of the external-role markers may appear.
    expect(src).not.toMatch(/\bborrower\b/i);
    expect(src).not.toMatch(/\bexternal\b/i);
    expect(src).not.toMatch(/\bguest\b/i);
    expect(src).not.toMatch(/\bportal\b/i);
  });

  it('WORKSPACE_DEAL_ACCESS lists exactly the five internal roles', () => {
    const roles = WORKSPACE_DEAL_ACCESS.map((w) => w.role).sort();
    expect(roles).toEqual(
      ['admin', 'banker', 'executive', 'manager', 'team'].sort(),
    );
  });
});
