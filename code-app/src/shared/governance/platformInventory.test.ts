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
        'deal-borrower-update-email',
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
        'deal-borrower-update-email',
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
      // Phase 105 shipped 'deal-borrower-update-email' — the legacy
      // 'borrower-email-send' name was never used and must not
      // accidentally appear as a sibling id.
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
    // Phase 105: email-delivery NOT_WIRED was removed when the
    // borrower-update LIVE Send path landed (GOVERNED_WRITES.deal-
    // borrower-update-email via Office365OutlookService.SendEmailV2).
    expect(ids.has('email-delivery')).toBe(false);
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
    // Phase 104: outlook-connector-live-send removed when document-
    // request LIVE landed. Phase 105: email-delivery (borrower-update)
    // removed when its LIVE send landed too. Both Outlook governance
    // rows are now closed; the only remaining email-flavored NOT_WIRED
    // rows live inside the borrower-portal compound entry, which
    // documents the broader cross-tenant / inbound / automation gaps.
    expect(byId.get('outlook-connector-live-send')).toBeUndefined();
    expect(byId.get('email-delivery')).toBeUndefined();
    // Schema-blocked
    expect(byId.get('document-upload')?.blockerKind).toBe('schema');
    expect(byId.get('stage-reference-data-source')?.blockerKind).toBe(
      'schema',
    );
    expect(byId.get('stage-ordering-contract')?.blockerKind).toBe('schema');
    // Governance / deferred design decision
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
    // schema + secure-message + automation blockers
    expect(byId.get('borrower-portal')?.blockerKind).toBe('compound');
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
    // Phase 96 — Microsoft Teams deal-summary copy handoff
    // (copy-to-clipboard only; no Graph; no Dataverse write).
    expect(ids.has('teams-deal-summary-handoff')).toBe(true);
    // Phase 98 — Microsoft Teams morning-catch-up copy handoff
    // (copy-to-clipboard only; no Graph; no Dataverse write; does
    // not mutate Phase 90 last-seen or Phase 91 dismiss/snooze
    // ledger).
    expect(ids.has('catch-up-teams-summary-handoff')).toBe(true);
    // Phase 99 — Microsoft Teams activity-timeline copy handoff
    // (per-deal copy-to-clipboard; no Graph; no Dataverse write;
    // does not mutate Phase 72 last-visit marker).
    expect(ids.has('activity-timeline-teams-summary-handoff')).toBe(true);
    // Phase 100 — Microsoft Teams relationship-memory copy handoff
    // (per-client snapshot copy-to-clipboard; no Graph; no
    // Dataverse write; client-name grouped only; not a relationship
    // graph).
    expect(ids.has('relationship-memory-teams-summary-handoff')).toBe(true);
    // Phase 101 — Microsoft Outlook summary copy/mailto handoff for
    // the same four surfaces (banker + manager catch-up, activity
    // timeline, relationship memory). No connector send; no Graph.
    expect(ids.has('outlook-summary-handoff')).toBe(true);
    // Phase 90 — Catch-up last-seen markers (local-only "new since
    // your last visit" overlay on the Phase 88 manager + Phase 89
    // banker morning catch-up cards).
    expect(ids.has('catch-up-last-seen-markers')).toBe(true);
    // Phase 91 — Catch-up item ledger (per-item local dismiss /
    // snooze state on the same two cards).
    expect(ids.has('catch-up-item-ledger')).toBe(true);
    // Phase 93 — Manager banker-filter preference (local browser
    // memory of the Phase 92 filter selection).
    expect(ids.has('manager-filter-preference')).toBe(true);
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

  it('teams-deal-summary-handoff (Phase 96) is a LOCAL_ONLY flow with the right disclaimers', () => {
    const entry = LOCAL_ONLY_FLOWS.find(
      (f) => f.id === 'teams-deal-summary-handoff',
    );
    expect(entry).toBeDefined();
    expect(entry!.phase).toBe(96);
    // Brief mandates each of these disclaimers.
    expect(entry!.note).toMatch(/no Dataverse write/i);
    expect(entry!.note).toMatch(/no audit row/i);
    expect(entry!.note).toMatch(/no timeline event/i);
    expect(entry!.note).toMatch(/no Graph call/i);
    expect(entry!.note).toMatch(/no calendar sync/i);
    expect(entry!.note).toMatch(/no notification delivery/i);
    expect(entry!.note).toMatch(/no access-token acquisition/i);
    // The three required UI phrases the brief pins.
    expect(entry!.note).toMatch(/Copy Teams summary/);
    expect(entry!.note).toMatch(/Paste into Teams/);
    expect(entry!.note).toMatch(/You send the message manually/);
    // The note must explicitly say the app never claims any of the
    // forbidden positive-claim verbs.
    expect(entry!.note).toMatch(
      /never says sent \/ posted \/ delivered \/ notified \/ synced \/ Teams integrated \/ Graph connected/i,
    );
    // Implementation references for traceability.
    expect(entry!.note).toMatch(/src\/deals\/teamsDealSummary\.ts/);
    expect(entry!.note).toMatch(/src\/deals\/TeamsDealSummaryHandoff\.tsx/);
    expect(entry!.note).toMatch(/PHASE_96_TEAMS_DEAL_SUMMARY_HANDOFF\.md/);
    // Honest about the broader Lane E gap.
    expect(entry!.note).toMatch(/Does NOT imply a full.*Teams integration/i);
    expect(entry!.note).toMatch(
      /PHASE_85_TEAMS_INTEGRATION_READINESS_AUDIT\.md/,
    );
  });

  it('the Phase 96 doc actually exists on disk', () => {
    const repoRoot = resolve(__dirname, '..', '..', '..');
    const docPath = resolve(
      repoRoot,
      'docs/PHASE_96_TEAMS_DEAL_SUMMARY_HANDOFF.md',
    );
    expect(existsSync(docPath)).toBe(true);
  });

  it('teams-deal-summary-handoff is NOT in GOVERNED_WRITES (Phase 96 is a handoff, not a write)', () => {
    const ids = new Set(GOVERNED_WRITES.map((w) => w.id));
    expect(ids.has('teams-deal-summary-handoff')).toBe(false);
  });

  it('teams-deal-summary-handoff note carries the Phase 97 relationship-context references', () => {
    const entry = LOCAL_ONLY_FLOWS.find(
      (f) => f.id === 'teams-deal-summary-handoff',
    );
    expect(entry).toBeDefined();
    // Phase 97 references the new pure formatter + reuses the
    // Phase 76/77 derivation; both must show up in the inventory
    // note so future readers can trace the wiring.
    expect(entry!.note).toMatch(
      /src\/shared\/relationship\/relationshipContextNote\.ts/,
    );
    expect(entry!.note).toMatch(/deriveCrossDealContext/);
    // Phase 97 limitation-marker pins.
    expect(entry!.note).toMatch(/client-name grouped/i);
    expect(entry!.note).toMatch(
      /may not include all related borrowers/i,
    );
    // Phase 97 forbidden-claim pins.
    expect(entry!.note).toMatch(/never says household/i);
    expect(entry!.note).toMatch(/relationship score/i);
    expect(entry!.note).toMatch(/relationship graph/i);
    // Phase 97 doc reference.
    expect(entry!.note).toMatch(
      /PHASE_97_TEAMS_SUMMARY_RELATIONSHIP_CONTEXT\.md/,
    );
  });

  it('the Phase 97 doc actually exists on disk', () => {
    const repoRoot = resolve(__dirname, '..', '..', '..');
    const docPath = resolve(
      repoRoot,
      'docs/PHASE_97_TEAMS_SUMMARY_RELATIONSHIP_CONTEXT.md',
    );
    expect(existsSync(docPath)).toBe(true);
  });

  it('Phase 97 does not introduce a new GOVERNED_WRITES entry', () => {
    const ids = new Set(GOVERNED_WRITES.map((w) => w.id));
    // The Phase 97 brief explicitly forbids a new governed write.
    // The Phase 96 entry id remains the only Teams-summary inventory
    // row and it is still LOCAL_ONLY, not GOVERNED.
    expect(ids.has('teams-deal-summary-handoff')).toBe(false);
    expect(ids.has('teams-deal-summary-relationship-context')).toBe(false);
    expect(ids.has('relationship-context-note')).toBe(false);
  });

  it('catch-up-teams-summary-handoff (Phase 98) is a LOCAL_ONLY flow with the right disclaimers', () => {
    const entry = LOCAL_ONLY_FLOWS.find(
      (f) => f.id === 'catch-up-teams-summary-handoff',
    );
    expect(entry).toBeDefined();
    expect(entry!.phase).toBe(98);
    // Brief mandates each of these disclaimers.
    expect(entry!.note).toMatch(/no Dataverse write/i);
    expect(entry!.note).toMatch(/no audit row/i);
    expect(entry!.note).toMatch(/no timeline event/i);
    expect(entry!.note).toMatch(/no Graph call/i);
    expect(entry!.note).toMatch(/no calendar sync/i);
    expect(entry!.note).toMatch(/no notification delivery/i);
    expect(entry!.note).toMatch(/no access-token acquisition/i);
    // The three required UI phrases the brief pins.
    expect(entry!.note).toMatch(/Copy Teams summary/);
    expect(entry!.note).toMatch(/Paste into Teams/);
    expect(entry!.note).toMatch(/You send the message manually/);
    // The note must explicitly cite the local-ledger non-mutation
    // guarantees the brief pins.
    expect(entry!.note).toMatch(/Phase 90 last-seen marker/i);
    expect(entry!.note).toMatch(/Phase 91 (dismiss|snooze)/i);
    expect(entry!.note).toMatch(/Phase 94 mark-all-seen/i);
    // The note must explicitly state items are NOT marked seen /
    // dismissed / snoozed / resolved by copying.
    expect(entry!.note).toMatch(
      /items are not marked seen, dismissed, snoozed, or resolved/i,
    );
    // Implementation references for traceability.
    expect(entry!.note).toMatch(
      /src\/shared\/activity\/catchUpTeamsSummary\.ts/,
    );
    expect(entry!.note).toMatch(/src\/banker\/BankerMorningCatchUp\.tsx/);
    expect(entry!.note).toMatch(/src\/manager\/ManagerMorningCatchUp\.tsx/);
    expect(entry!.note).toMatch(
      /PHASE_98_CATCH_UP_TEAMS_SUMMARY_HANDOFF\.md/,
    );
    // Honest about the broader Lane E gap.
    expect(entry!.note).toMatch(/Does NOT imply a full.*Teams integration/i);
    expect(entry!.note).toMatch(
      /PHASE_85_TEAMS_INTEGRATION_READINESS_AUDIT\.md/,
    );
  });

  it('the Phase 98 doc actually exists on disk', () => {
    const repoRoot = resolve(__dirname, '..', '..', '..');
    const docPath = resolve(
      repoRoot,
      'docs/PHASE_98_CATCH_UP_TEAMS_SUMMARY_HANDOFF.md',
    );
    expect(existsSync(docPath)).toBe(true);
  });

  it('catch-up-teams-summary-handoff is NOT in GOVERNED_WRITES (Phase 98 is a handoff, not a write)', () => {
    const ids = new Set(GOVERNED_WRITES.map((w) => w.id));
    expect(ids.has('catch-up-teams-summary-handoff')).toBe(false);
  });

  it('activity-timeline-teams-summary-handoff (Phase 99) is a LOCAL_ONLY flow with the right disclaimers', () => {
    const entry = LOCAL_ONLY_FLOWS.find(
      (f) => f.id === 'activity-timeline-teams-summary-handoff',
    );
    expect(entry).toBeDefined();
    expect(entry!.phase).toBe(99);
    // Brief mandates each of these disclaimers.
    expect(entry!.note).toMatch(/no Dataverse write/i);
    expect(entry!.note).toMatch(/no audit row/i);
    expect(entry!.note).toMatch(/no timeline event/i);
    expect(entry!.note).toMatch(/no Graph call/i);
    expect(entry!.note).toMatch(/no calendar sync/i);
    expect(entry!.note).toMatch(/no notification delivery/i);
    expect(entry!.note).toMatch(/no access-token acquisition/i);
    // The three required UI phrases the brief pins.
    expect(entry!.note).toMatch(/Copy Teams summary/);
    expect(entry!.note).toMatch(/Paste into Teams/);
    expect(entry!.note).toMatch(/You send the message manually/);
    // Phase 99 brief pins the last-visit non-mutation guarantee.
    expect(entry!.note).toMatch(/Phase 72 last-visit marker/i);
    expect(entry!.note).toMatch(/Activity is NOT marked seen by copying/i);
    expect(entry!.note).toMatch(/deal state is unchanged/i);
    // Implementation references for traceability.
    expect(entry!.note).toMatch(
      /src\/deals\/activityTimelineTeamsSummary\.ts/,
    );
    expect(entry!.note).toMatch(/src\/deals\/ActivityTimeline\.tsx/);
    expect(entry!.note).toMatch(
      /PHASE_99_ACTIVITY_TIMELINE_TEAMS_HANDOFF\.md/,
    );
    // Honest about the broader Lane E gap.
    expect(entry!.note).toMatch(/Does NOT imply a full.*Teams integration/i);
    expect(entry!.note).toMatch(
      /PHASE_85_TEAMS_INTEGRATION_READINESS_AUDIT\.md/,
    );
  });

  it('the Phase 99 doc actually exists on disk', () => {
    const repoRoot = resolve(__dirname, '..', '..', '..');
    const docPath = resolve(
      repoRoot,
      'docs/PHASE_99_ACTIVITY_TIMELINE_TEAMS_HANDOFF.md',
    );
    expect(existsSync(docPath)).toBe(true);
  });

  it('activity-timeline-teams-summary-handoff is NOT in GOVERNED_WRITES (Phase 99 is a handoff, not a write)', () => {
    const ids = new Set(GOVERNED_WRITES.map((w) => w.id));
    expect(ids.has('activity-timeline-teams-summary-handoff')).toBe(false);
  });

  it('relationship-memory-teams-summary-handoff (Phase 100) is a LOCAL_ONLY flow with the right disclaimers', () => {
    const entry = LOCAL_ONLY_FLOWS.find(
      (f) => f.id === 'relationship-memory-teams-summary-handoff',
    );
    expect(entry).toBeDefined();
    expect(entry!.phase).toBe(100);
    // Brief mandates each of these disclaimers.
    expect(entry!.note).toMatch(/no Dataverse write/i);
    expect(entry!.note).toMatch(/no audit row/i);
    expect(entry!.note).toMatch(/no timeline event/i);
    expect(entry!.note).toMatch(/no Graph call/i);
    expect(entry!.note).toMatch(/no calendar sync/i);
    expect(entry!.note).toMatch(/no notification delivery/i);
    expect(entry!.note).toMatch(/no access-token acquisition/i);
    // The three required UI phrases the brief pins.
    expect(entry!.note).toMatch(/Copy Teams summary/);
    expect(entry!.note).toMatch(/Paste into Teams/);
    expect(entry!.note).toMatch(/You send the message manually/);
    // Phase 100 brief pins the relationship-memory non-mutation
    // and the relationship-graph + householding negations.
    expect(entry!.note).toMatch(/Client-name grouped/i);
    expect(entry!.note).toMatch(/may not include all related borrowers/i);
    expect(entry!.note).toMatch(/Not a relationship graph/i);
    expect(entry!.note).toMatch(/not a household linkage/i);
    expect(entry!.note).toMatch(/not a relationship score/i);
    expect(entry!.note).toMatch(/does NOT save relationship notes/i);
    expect(entry!.note).toMatch(
      /does NOT create an official relationship record/i,
    );
    expect(entry!.note).toMatch(/does NOT infer householding/i);
    // Implementation references for traceability.
    expect(entry!.note).toMatch(
      /src\/shared\/relationship\/relationshipMemoryTeamsSummary\.ts/,
    );
    expect(entry!.note).toMatch(/src\/banker\/RelationshipMemory\.tsx/);
    expect(entry!.note).toMatch(
      /PHASE_100_RELATIONSHIP_MEMORY_TEAMS_HANDOFF\.md/,
    );
    // Honest about the broader Lane E gap.
    expect(entry!.note).toMatch(/Does NOT imply a full.*Teams integration/i);
    expect(entry!.note).toMatch(
      /PHASE_85_TEAMS_INTEGRATION_READINESS_AUDIT\.md/,
    );
  });

  it('the Phase 100 doc actually exists on disk', () => {
    const repoRoot = resolve(__dirname, '..', '..', '..');
    const docPath = resolve(
      repoRoot,
      'docs/PHASE_100_RELATIONSHIP_MEMORY_TEAMS_HANDOFF.md',
    );
    expect(existsSync(docPath)).toBe(true);
  });

  it('relationship-memory-teams-summary-handoff is NOT in GOVERNED_WRITES (Phase 100 is a handoff, not a write)', () => {
    const ids = new Set(GOVERNED_WRITES.map((w) => w.id));
    expect(ids.has('relationship-memory-teams-summary-handoff')).toBe(false);
  });

  it('outlook-summary-handoff (Phase 101) is a LOCAL_ONLY flow with the right disclaimers', () => {
    const entry = LOCAL_ONLY_FLOWS.find(
      (f) => f.id === 'outlook-summary-handoff',
    );
    expect(entry).toBeDefined();
    expect(entry!.phase).toBe(101);
    // Brief mandates each of these disclaimers.
    expect(entry!.note).toMatch(/no Dataverse write/i);
    expect(entry!.note).toMatch(/no audit row/i);
    expect(entry!.note).toMatch(/no timeline event/i);
    expect(entry!.note).toMatch(/no Graph/i);
    expect(entry!.note).toMatch(/no calendar sync/i);
    expect(entry!.note).toMatch(/no notification delivery/i);
    expect(entry!.note).toMatch(/no token acquisition/i);
    // The four required UI phrases the brief pins.
    expect(entry!.note).toMatch(/Open in Outlook/);
    expect(entry!.note).toMatch(/Copy email/);
    expect(entry!.note).toMatch(/You send from Outlook/);
    expect(entry!.note).toMatch(/Local handoff only/);
    // Phase 101 brief pins the recipient-empty-by-default rule.
    expect(entry!.note).toMatch(/Recipient is OPTIONAL and EMPTY by default/i);
    expect(entry!.note).toMatch(/forbids inferring a recipient/i);
    // Phase 101 brief pins the four-surface non-mutation guarantee.
    expect(entry!.note).toMatch(/Phase 72 per-deal last-visit marker/i);
    expect(entry!.note).toMatch(/Phase 90 catch-up last-seen markers/i);
    expect(entry!.note).toMatch(/Phase 91 dismiss \/ snooze ledger/i);
    expect(entry!.note).toMatch(/Phase 83 Autopilot suggestion ledger/i);
    expect(entry!.note).toMatch(/Phase 78 relationship-note draft/i);
    // Forbidden positive-claim list pinned in the inventory note.
    // Phrased in negation form to avoid the conservative-copy guard
    // pattern that forbids the literal "email delivered" / "email
    // sent" substrings (the guard scans inventory note text
    // verbatim and cannot tell list-of-negations from positive
    // claims).
    expect(entry!.note).toMatch(/never positively claim/i);
    expect(entry!.note).toMatch(/Outlook-connected/i);
    expect(entry!.note).toMatch(/connector-backed/i);
    expect(entry!.note).toMatch(/transmitted any message automatically/i);
    expect(entry!.note).toMatch(/Graph-connected/i);
    // Implementation references for traceability — helper + button
    // component + every consuming surface.
    expect(entry!.note).toMatch(
      /src\/shared\/email\/summaryOutlookHandoff\.ts/,
    );
    expect(entry!.note).toMatch(
      /src\/shared\/email\/SummaryOutlookHandoffButtons\.tsx/,
    );
    expect(entry!.note).toMatch(/src\/banker\/BankerMorningCatchUp\.tsx/);
    expect(entry!.note).toMatch(
      /src\/manager\/ManagerMorningCatchUp\.tsx/,
    );
    expect(entry!.note).toMatch(/src\/deals\/ActivityTimeline\.tsx/);
    expect(entry!.note).toMatch(/src\/banker\/RelationshipMemory\.tsx/);
    expect(entry!.note).toMatch(/PHASE_101_OUTLOOK_SUMMARY_HANDOFF\.md/);
    // Honest about the broader Lane E + connector gap.
    expect(entry!.note).toMatch(/Does NOT use the Outlook connector/i);
    // Phase 104 + Phase 105: connector is now LIVE for both
    // document-request and borrower-update email. Summary handoffs
    // (catch-up / activity / relationship) remain copy-to-clipboard
    // by design — the note explains both LIVE swaps and pins the
    // remaining surfaces as Lane-E copy-only.
    expect(entry!.note).toMatch(/Phase 104 wired LIVE document-request email/);
    expect(entry!.note).toMatch(/Phase 105 wired LIVE borrower-update email/);
  });

  it('the Phase 101 doc actually exists on disk', () => {
    const repoRoot = resolve(__dirname, '..', '..', '..');
    const docPath = resolve(
      repoRoot,
      'docs/PHASE_101_OUTLOOK_SUMMARY_HANDOFF.md',
    );
    expect(existsSync(docPath)).toBe(true);
  });

  it('outlook-summary-handoff is NOT in GOVERNED_WRITES (Phase 101 is a handoff, not a write)', () => {
    const ids = new Set(GOVERNED_WRITES.map((w) => w.id));
    expect(ids.has('outlook-summary-handoff')).toBe(false);
  });

  it('catch-up-last-seen-markers (Phase 90) is a LOCAL_ONLY flow with the right disclaimers', () => {
    const entry = LOCAL_ONLY_FLOWS.find(
      (f) => f.id === 'catch-up-last-seen-markers',
    );
    expect(entry).toBeDefined();
    expect(entry!.phase).toBe(90);
    expect(entry!.note).toMatch(/no Dataverse write/i);
    expect(entry!.note).toMatch(/no audit row/i);
    expect(entry!.note).toMatch(/no timeline event/i);
    expect(entry!.note).toMatch(/no cross-device sync/i);
    expect(entry!.note).toMatch(/no notification delivery/i);
    expect(entry!.note).toMatch(/Does NOT create official unread state/i);
    // Marker keying contract.
    expect(entry!.note).toMatch(/`banker:<bankerId>`/);
    expect(entry!.note).toMatch(/`manager:<bankerId>:<teamId>`/);
    // Storage namespace separation from Phase 72.
    expect(entry!.note).toMatch(/cc:lastVisit:catchUp:/);
    // Implementation pointers + doc path.
    expect(entry!.note).toMatch(/src\/shared\/lastVisit\/catchUpLastSeen\.ts/);
    expect(entry!.note).toMatch(/src\/shared\/lastVisit\/useCatchUpLastSeen\.ts/);
    expect(entry!.note).toMatch(
      /PHASE_90_CATCH_UP_LAST_SEEN_MARKERS\.md/,
    );
  });

  it('the Phase 90 doc actually exists on disk', () => {
    const repoRoot = resolve(__dirname, '..', '..', '..');
    const docPath = resolve(
      repoRoot,
      'docs/PHASE_90_CATCH_UP_LAST_SEEN_MARKERS.md',
    );
    expect(existsSync(docPath)).toBe(true);
  });

  it('catch-up-last-seen-markers is NOT in GOVERNED_WRITES', () => {
    const ids = new Set(GOVERNED_WRITES.map((w) => w.id));
    expect(ids.has('catch-up-last-seen-markers')).toBe(false);
  });

  it('catch-up-last-seen-markers (Phase 90) note mentions the Phase 94 "Mark all seen" affordance', () => {
    const entry = LOCAL_ONLY_FLOWS.find(
      (f) => f.id === 'catch-up-last-seen-markers',
    );
    expect(entry).toBeDefined();
    // Phase 94 extended the existing note rather than adding a
    // new LOCAL_ONLY_FLOWS entry — the disclaimers are identical.
    expect(entry!.note).toMatch(/Phase 94.*Mark all seen/i);
    expect(entry!.note).toMatch(/bumps the marker to `now` immediately/i);
    expect(entry!.note).toMatch(/PHASE_94_CATCH_UP_MARK_ALL_SEEN\.md/);
    // Pre-Phase 94 invariants still hold.
    expect(entry!.note).toMatch(/No Dataverse write/i);
    expect(entry!.note).toMatch(/No cross-device sync/i);
    expect(entry!.note).toMatch(/Does NOT create official unread state/i);
  });

  it('the Phase 94 doc actually exists on disk', () => {
    const repoRoot = resolve(__dirname, '..', '..', '..');
    const docPath = resolve(
      repoRoot,
      'docs/PHASE_94_CATCH_UP_MARK_ALL_SEEN.md',
    );
    expect(existsSync(docPath)).toBe(true);
  });

  it('catch-up-item-ledger (Phase 91) is a LOCAL_ONLY flow with the right disclaimers', () => {
    const entry = LOCAL_ONLY_FLOWS.find(
      (f) => f.id === 'catch-up-item-ledger',
    );
    expect(entry).toBeDefined();
    expect(entry!.phase).toBe(91);
    // Local-only contract.
    expect(entry!.note).toMatch(/No Dataverse write/i);
    expect(entry!.note).toMatch(/No audit row/i);
    expect(entry!.note).toMatch(/No timeline event/i);
    expect(entry!.note).toMatch(/No cross-device sync/i);
    expect(entry!.note).toMatch(/No notification delivery/i);
    // Does NOT resolve business state.
    expect(entry!.note).toMatch(/does NOT resolve.*close.*business item/i);
    expect(entry!.note).toMatch(/does NOT change deal status/i);
    expect(entry!.note).toMatch(/Does NOT create official acknowledged/i);
    // Storage namespace separation from Phase 83.
    expect(entry!.note).toMatch(/cc:catchUpItemLedger:v1/);
    // Action enum.
    expect(entry!.note).toMatch(/`dismissed`\s*\|\s*`snoozed`/);
    // Implementation pointers + doc path.
    expect(entry!.note).toMatch(/src\/shared\/activity\/catchUpItemLedger\.ts/);
    expect(entry!.note).toMatch(
      /src\/shared\/activity\/useCatchUpItemLedger\.ts/,
    );
    expect(entry!.note).toMatch(/PHASE_91_CATCH_UP_ITEM_LEDGER\.md/);
  });

  it('the Phase 91 doc actually exists on disk', () => {
    const repoRoot = resolve(__dirname, '..', '..', '..');
    const docPath = resolve(
      repoRoot,
      'docs/PHASE_91_CATCH_UP_ITEM_LEDGER.md',
    );
    expect(existsSync(docPath)).toBe(true);
  });

  it('catch-up-item-ledger is NOT in GOVERNED_WRITES (local-only)', () => {
    const ids = new Set(GOVERNED_WRITES.map((w) => w.id));
    expect(ids.has('catch-up-item-ledger')).toBe(false);
  });

  it('manager-filter-preference (Phase 93) is a LOCAL_ONLY flow with the right disclaimers', () => {
    const entry = LOCAL_ONLY_FLOWS.find(
      (f) => f.id === 'manager-filter-preference',
    );
    expect(entry).toBeDefined();
    expect(entry!.phase).toBe(93);
    // Local-only contract.
    expect(entry!.note).toMatch(/No Dataverse write/i);
    expect(entry!.note).toMatch(/No audit row/i);
    expect(entry!.note).toMatch(/No timeline event/i);
    expect(entry!.note).toMatch(/No cross-device sync/i);
    expect(entry!.note).toMatch(/No notification delivery/i);
    // NOT an official setting.
    expect(entry!.note).toMatch(/NOT.*official.*manager.*profile setting/i);
    // Storage namespace + key shape.
    expect(entry!.note).toMatch(/cc:managerFilterSelection:v1/);
    expect(entry!.note).toMatch(/manager:<bankerId>:<teamId>/);
    // Validation behavior.
    expect(entry!.note).toMatch(/validated against the current.*filter options/i);
    expect(entry!.note).toMatch(/fall back silently to All team/i);
    // Implementation pointers + doc.
    expect(entry!.note).toMatch(
      /src\/manager\/managerBankerFilterPreference\.ts/,
    );
    expect(entry!.note).toMatch(/src\/manager\/ManagerBankerFilter\.tsx/);
    expect(entry!.note).toMatch(/PHASE_93_MANAGER_FILTER_PREFERENCE\.md/);
  });

  it('the Phase 93 doc actually exists on disk', () => {
    const repoRoot = resolve(__dirname, '..', '..', '..');
    const docPath = resolve(
      repoRoot,
      'docs/PHASE_93_MANAGER_FILTER_PREFERENCE.md',
    );
    expect(existsSync(docPath)).toBe(true);
  });

  it('manager-filter-preference is NOT in GOVERNED_WRITES (local-only)', () => {
    const ids = new Set(GOVERNED_WRITES.map((w) => w.id));
    expect(ids.has('manager-filter-preference')).toBe(false);
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

  it('GOVERNED_WRITES count: Phase 67 did not add a new governed write — Phase 70 added the 11th (review task); Phase 105 added the 12th (borrower-update email)', () => {
    expect(GOVERNED_WRITES.length).toBe(12);
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
