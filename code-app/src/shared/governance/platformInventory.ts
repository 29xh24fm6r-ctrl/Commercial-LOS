/**
 * Static platform inventory. Introduced in Phase 40; extended through
 * Phase 51 (Phase 41 added REFERENCE_DATA_GOVERNED; Phase 43 added
 * the optional `enablementMapPath` field on DeliberatelyBlockedEntry;
 * Phase 51 added `deal-document-receive` to GOVERNED_WRITES and
 * tightened the `document-upload` NOT_WIRED reason).
 *
 * Single source of truth for what the commercial-lending app has
 * built, deliberately not wired, and intentionally blocked. Consumed
 * by:
 *   - the Release Readiness Gate admin card (no behavior change —
 *     the originally inline constants moved here verbatim in Phase 40);
 *   - the stabilization checklist + release notes docs
 *     (docs/STABILIZATION_CHECKLIST.md +
 *      docs/RELEASE_NOTES_PHASES_1_40.md +
 *      docs/RELEASE_NOTES_PHASES_41_51.md);
 *   - the Phase 46–50 inventory-driven regression sweeps in
 *     src/shared/governance/ that pin the contract every governed
 *     write must follow;
 *   - a focused test (platformInventory.test.ts) that pins the known
 *     blockers and not-wired surfaces so drift can't silently land.
 *
 * Discipline:
 *   - This module is STATIC. No runtime probes, no service calls.
 *     Each entry reflects a known property of the codebase as of
 *     the current phase. Update entries via deliberate edit when
 *     the underlying fact changes.
 *   - DELIBERATELY_BLOCKED and NOT_WIRED are honest about
 *     limitations. Do NOT move an entry to "shipped" without the
 *     code change that justifies it.
 */

// ---------------------------------------------------------------------------
// Governed writes
// ---------------------------------------------------------------------------

export interface GovernedWriteEntry {
  id: string;
  label: string;
  phase: number;
  /** True when the write coordinates an audit-event create. */
  emitsAudit: boolean;
  /** True when the write coordinates a DealTimelineEvent create. */
  emitsTimeline: boolean;
  /**
   * True for a write whose correlation-id/audit/timeline plumbing was built under a LATER,
   * cross-cutting shared-builder architecture (id generated in a UI component, threaded as a
   * parameter through several layers, audit assembled by buildNewDealAuditPayload) that does not
   * fit the Phase 46/47/49/50 discipline sweeps' single-action-file / `const correlationId = ...`
   * convention. Those four sweeps (correlationIdDiscipline / outcomeUnionDiscipline /
   * auditPayloadDiscipline / timelinePayloadDiscipline) skip this write's completeness check with
   * an explicit, reasoned exemption rather than forcing a mismatched or fake registration.
   * Retrofitting the write path to the older convention (or evolving the sweeps to recognize the
   * newer shared-builder pattern) is real, separate work, not attempted as part of registration.
   */
  legacyDisciplineExempt?: boolean;
}

export const GOVERNED_WRITES: readonly GovernedWriteEntry[] = [
  {
    id: 'data-quality-flag-resolve',
    label: 'Data Quality Flag resolve',
    phase: 18,
    emitsAudit: true,
    emitsTimeline: false,
  },
  {
    id: 'alert-resolve',
    label: 'Alert resolve',
    phase: 19,
    emitsAudit: true,
    emitsTimeline: false,
  },
  {
    id: 'alert-dismiss',
    label: 'Alert dismiss',
    phase: 19,
    emitsAudit: true,
    emitsTimeline: false,
  },
  {
    id: 'deal-task-complete',
    label: 'Deal task complete',
    phase: 21,
    emitsAudit: true,
    emitsTimeline: true,
  },
  {
    id: 'deal-document-request',
    label: 'Deal document request',
    phase: 22,
    emitsAudit: true,
    emitsTimeline: true,
  },
  {
    id: 'credit-memo-draft-save',
    label: 'Credit memo draft save',
    phase: 25,
    emitsAudit: true,
    emitsTimeline: true,
  },
  {
    id: 'deal-document-receive',
    label: 'Deal document mark received',
    phase: 51,
    emitsAudit: true,
    emitsTimeline: true,
  },
  {
    id: 'deal-document-review',
    label: 'Deal document mark reviewed',
    phase: 55,
    emitsAudit: true,
    emitsTimeline: true,
  },
  {
    id: 'deal-document-request-email',
    label: 'Deal document request — Outlook send',
    phase: 61,
    emitsAudit: true,
    emitsTimeline: true,
  },
  {
    id: 'deal-document-request-handoff',
    label: 'Deal document request — Outlook handoff (no-admin)',
    phase: 63,
    emitsAudit: true,
    emitsTimeline: true,
  },
  {
    id: 'deal-document-review-task-create',
    label: 'Create document review follow-up task',
    phase: 70,
    emitsAudit: true,
    emitsTimeline: true,
  },
  {
    id: 'deal-borrower-update-email',
    label: 'Borrower update -- Outlook send',
    phase: 105,
    emitsAudit: true,
    emitsTimeline: true,
  },
  {
    id: 'deal-log-activity',
    label: 'Log banker activity',
    phase: 160,
    emitsAudit: true,
    emitsTimeline: true,
  },
  {
    id: 'deal-stage-advance',
    label: 'Deal stage advance (forward Advance only)',
    phase: 237,
    emitsAudit: true,
    emitsTimeline: true,
    legacyDisciplineExempt: true,
  },
  // Final LOS Completion arc (Workstream M) -- registers the six durable-record governed writes
  // Workstreams C/D/E/F/H/J shipped, none of which had been added here, so
  // AdminCapabilityTruthMatrix's "live governed write" list was silently incomplete since those
  // workstreams landed. All six follow the identical shape every write above does (correlation id,
  // parallel audit + timeline emission, mapBusinessSafeError) but were built under this arc's own
  // per-entity submit*.ts convention rather than the Phase 46/47/49/50 sweeps' pattern -- see
  // `durableRecordCapabilityInventory.ts` for each one's own status vocabulary (a concern
  // GOVERNED_WRITES itself does not model). Phase numbers 265-270 are assigned sequentially, chosen
  // above the highest real Phase-N doc number in this repo (264) to guarantee no collision -- this
  // arc's own workstreams are lettered (A-X), not phase-numbered, so these numbers exist only to
  // satisfy this schema's required `phase: number` field, not to claim a real Phase 265-270 doc.
  {
    id: 'credit-approval-decision-submit',
    label: 'Credit Approval Decision submit',
    phase: 265,
    emitsAudit: true,
    emitsTimeline: true,
    legacyDisciplineExempt: true,
  },
  {
    id: 'commitment-submit',
    label: 'Commitment issue / respond',
    phase: 266,
    emitsAudit: true,
    emitsTimeline: true,
    legacyDisciplineExempt: true,
  },
  {
    id: 'condition-verification-submit',
    label: 'Condition Verification submit',
    phase: 267,
    emitsAudit: true,
    emitsTimeline: true,
    legacyDisciplineExempt: true,
  },
  {
    id: 'executed-document-attestation-submit',
    label: 'Executed Document Attestation submit',
    phase: 268,
    emitsAudit: true,
    emitsTimeline: true,
    legacyDisciplineExempt: true,
  },
  {
    id: 'booking-qc-check-submit',
    label: 'Booking QC Check submit',
    phase: 269,
    emitsAudit: true,
    emitsTimeline: true,
    legacyDisciplineExempt: true,
  },
  {
    id: 'adverse-action-submit',
    label: 'Adverse Action Record submit',
    phase: 270,
    emitsAudit: true,
    emitsTimeline: true,
    legacyDisciplineExempt: true,
  },
  // Workstream O -- the first write that CREATES a cr664_dataqualityflags row (previously only
  // resolve existed; see dataQualityActions.ts). Emits an audit event, same as resolve; no
  // timeline event -- a data-quality flag is an admin-facing exception record, not a deal-facing
  // timeline fact, matching how the six existing flag types are never timeline-cross-written
  // either. Follows dataQualityActions.ts's own established audit-pairing convention (see
  // createDataQualityFlagAction.ts), not the Phase 46/47/49/50 sweeps' pattern.
  {
    id: 'data-quality-flag-create',
    label: 'Data Quality Flag create (detection sweep)',
    phase: 271,
    emitsAudit: true,
    emitsTimeline: false,
    legacyDisciplineExempt: true,
  },
  // 146 Factory arc (Workstream 146-B) -- flips the credit memo's cr664_status Draft -> Final.
  // Phase 272 continues the 265-271 sequential numbering above this same discipline established
  // (a number to satisfy this schema's required `phase: number` field, not a real Phase-N doc).
  {
    id: 'credit-memo-finalize',
    label: 'Credit memo finalize',
    phase: 272,
    emitsAudit: true,
    emitsTimeline: true,
    legacyDisciplineExempt: true,
  },
  // 146 Factory arc (Workstream 146-E) -- assigns/reassigns cr664_AssignedServicingOwner on a
  // boarded portfolio loan. Audit only (like data-quality-flag-create above): a portfolio-loan
  // admin action is not a deal-facing timeline fact.
  {
    id: 'assign-servicing-owner',
    label: 'Assign servicing owner',
    phase: 273,
    emitsAudit: true,
    emitsTimeline: false,
    legacyDisciplineExempt: true,
  },
];
// NOTE: forward stage-advance (DealStageProgressionCard -> stageAdvanceWriteDependency.ts
// -> buildLiveStageAdvanceDeps.ts) is a real, armed, audited + timelined governed write and
// belongs in this list. It is deliberately NOT added as its own dedicated registration phase
// here -- doing so correctly also requires adding matching entries to AUDIT_BY_WRITE_ID,
// OUTCOME_BY_WRITE_ID, and TIMELINE_BY_WRITE_ID (each independently cross-verified against the
// real source in auditPayloadDiscipline.test.ts / outcomeUnionDiscipline.test.ts /
// timelinePayloadDiscipline.test.ts) plus every hardcoded GOVERNED_WRITES.length citation across
// release-candidate docs. Tracked as a follow-up registration phase; see the New Deal Intake /
// Loan Workflow audit report for detail. The DELIBERATELY_BLOCKED entry below is corrected in the
// meantime so this file stops asserting the false "AUTO_STAGE_ADVANCE_ENABLED is off" claim.

// ---------------------------------------------------------------------------
// Deliberately blocked surfaces (schema or governance gap; not a missing
// feature — there's a documented reason we didn't ship)
// ---------------------------------------------------------------------------

export interface DeliberatelyBlockedEntry {
  id: string;
  label: string;
  phase: number;
  reason: string;
  /** Optional path (repo-relative) to a planning doc that describes
   *  what would have to be true for this block to be lifted. Linked
   *  for discoverability; presence of a map does NOT imply schedule. */
  enablementMapPath?: string;
}

export const DELIBERATELY_BLOCKED: readonly DeliberatelyBlockedEntry[] = [
  {
    id: 'stage-progression-advance',
    label: 'Stage progression — Return / Decline / Withdraw (canonical engine)',
    phase: 28,
    reason:
      'Scoped specifically to the CANONICAL transition engine ' +
      '(src/workflow/canonicalStageTransition.ts + StageWorkflowControl.tsx + approvalAuthorityMatrix.ts): ' +
      'Return / Decline / Withdraw. That control is built, tested, and gated on AUTO_STAGE_ADVANCE_ENABLED. ' +
      'CORRECTION (Factory mission PR A, 2026-07-27): the claim that this control "is not mounted in any live ' +
      'workspace" was stale and is corrected here -- it IS mounted live: DealGovernedTransitionPanel.tsx is ' +
      'mounted in BankerDealWorkspace.tsx (showAdvance={false}, so only Return/Decline/Withdraw render there; ' +
      'forward Advance stays on the separate DealStageProgressionCard.tsx control by design, see that file\'s ' +
      'showAdvance doc comment) and executes a real write -- executeCanonicalStageTransition -> ' +
      'buildLiveCanonicalTransitionDeps.ts, which emits both a Cr664_auditevents row and a ' +
      'Cr664_dealtimelineevents row, the same audit+timeline shape as every other governed write. ' +
      'NOTE: forward Advance (DealStageProgressionCard.tsx -> stageAdvanceWriteDependency.ts -> ' +
      'buildLiveStageAdvanceDeps.ts) IS already registered as its own GOVERNED_WRITES entry ' +
      "(id: 'deal-stage-advance') -- the prior claim that it was not yet registered was ALSO stale. " +
      'This Return/Decline/Withdraw entry remains classified here rather than moved to GOVERNED_WRITES ' +
      'because, unlike deal-stage-advance, it has not yet been given its own registry id -- a follow-on ' +
      'registration is still warranted, but the false "unmounted" claim is the defect this correction fixes; ' +
      'reclassification is left for a dedicated pass so as not to cascade every count-pinned test in this ' +
      'same change. AUTO_STAGE_ADVANCE_ENABLED itself is ARMED (true, dealOriginationFeatureFlags.ts) as of ' +
      'the WF-1A phase -- it is not the remaining blocker for either path. The remaining prerequisite for ' +
      'BOTH paths is a data-seeding fact this static inventory cannot verify: the maker adding the ' +
      'cr664_sequence ordinal to the stage reference table and seeding the seven ordered stage rows in the ' +
      'target environment. See docs/STAGE_PROGRESSION_ENABLEMENT_MAP.md and docs/STAGE_SCHEMA_SETUP.md.',
    enablementMapPath: 'docs/STAGE_PROGRESSION_ENABLEMENT_MAP.md',
  },
];

// ---------------------------------------------------------------------------
// Not wired (capability is absent in the app today; presence elsewhere is
// out of scope for the current phase set)
// ---------------------------------------------------------------------------

/**
 * Phase 68 — `NotWiredBlockerKind` classifies WHY a not-wired
 * capability is not wired, so the Release Readiness Gate can
 * surface upstream-blocker structure without collapsing
 * everything into a single "blocked" bucket.
 *
 *  - 'connector'     — Power Platform connector registration /
 *                      Office 365 / Graph dependency not in place.
 *  - 'schema'        — a Dataverse column / table / option-set
 *                      value is missing. The SDK can't even
 *                      target it.
 *  - 'governance'    — a deliberate non-goal or deferred design
 *                      decision; nothing upstream is missing,
 *                      we have not chosen to ship the surface.
 *  - 'observability' — runtime signal does not exist inside the
 *                      app (e.g. CI status; build/test feed).
 *  - 'compound'      — two or more of the above stacked. Use only
 *                      when the entry's reason text explicitly
 *                      enumerates multiple unrelated upstream
 *                      blockers (e.g. borrower-portal).
 */
export type NotWiredBlockerKind =
  | 'connector'
  | 'schema'
  | 'governance'
  | 'observability'
  | 'compound';

export interface NotWiredEntry {
  id: string;
  label: string;
  reason: string;
  /** Phase 68 — required classification of the upstream blocker. */
  blockerKind: NotWiredBlockerKind;
}

export const NOT_WIRED: readonly NotWiredEntry[] = [
  {
    id: 'new-deal-create',
    label: 'New Deal create',
    reason:
      'WIRED_DISABLED, scoped to the PUBLIC/admin create path only. A governed, audited ' +
      'create adapter exists (src/deals/newDealCreateAdapter.ts). It is disabled by default -- ' +
      'NEW_DEAL_CREATE_ADAPTER_ENABLED=false and NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED=false -- ' +
      'so no public/admin live create or audit occurs. Its standalone controlled admin UI ' +
      '(Phase 170M-170N -- NewDealCreatePanel.tsx / newDealCreateController.ts / ' +
      'newDealCreateEnablement.ts) was removed: the submit button had no click handler and ' +
      'the admin panel mounted it with no enablement config, so it was permanently inert -- ' +
      'confusing dead weight next to the actually-live banker path (see below), not a real ' +
      'second create surface. NOTE: this is DISTINCT from banker create, which IS live -- ' +
      'BankerNewDealCreate.tsx calls the SAME adapter directly with its own ' +
      'BANKER_CREATE_PILOT rollout gate, bypassing NEW_DEAL_CREATE_ADAPTER_ENABLED entirely. ' +
      'Stage/Status resolve READY in TEST via the fail-closed resolver ' +
      '(cr664_dealstagereferences / cr664_dealstatusreferences, Phase 170D-170I); public/admin ' +
      'live create stays off pending production-approved reference rows and a certified ' +
      'enablement decision for that specific surface. Separate from Advance Stage / ' +
      'stage-progression ordering (see stage-progression-advance).',
    blockerKind: 'schema',
  },
  {
    id: 'document-upload',
    label: 'Document upload (binary file)',
    reason:
      'Factory Arc Phase 9 -- P0-2 already built the full binary upload ' +
      'pipeline end to end: documentUploadAction.ts calls the SDK client\'s ' +
      'uploadFileToRecord directly, documentUploadLiveDeps.ts wires it live, ' +
      'and ReceiveDocumentModal.tsx exposes a real file picker on the ' +
      'Documents card. This is no longer "no pipeline exists" -- it stays ' +
      'NOT_WIRED because the pipeline has no live column to target: the ' +
      'cr664_DocumentChecklist schema still has no File column, so ' +
      'DOCUMENT_FILE_UPLOAD_ENABLED / DOCUMENT_UPLOAD_ENABLED stay off and ' +
      'every upload attempt fails closed rather than landing a binary. The ' +
      'unblock path is purely schema-side: add the File column via ' +
      'scripts/dataverse/create-document-checklist-file-columns.ps1, ' +
      'regenerate the SDK, then flip the flags. Phase 22 stamps ' +
      'cr664_requestdate (Request) and Phase 51 stamps cr664_receiveddate ' +
      '(Mark received) — both metadata-only writes that remain available ' +
      'regardless. See docs/PHASE_51_DOCUMENT_UPLOAD_SCOPE.md and ' +
      'docs/P0-2_DOCUMENT_UPLOAD_OPERATOR_DEPENDENCY.md.',
    blockerKind: 'schema',
  },
  {
    id: 'ai-generation',
    label: 'AI / model-driven generation',
    reason:
      'No AI/model calls anywhere in the app. Phase 24 credit memo draft is ' +
      'a pure deterministic generator. The "no AI used" line is asserted in ' +
      'the draft preview banner.',
    blockerKind: 'governance',
  },
  {
    id: 'test-coverage-build-verification',
    label: 'Test coverage / build verification (in-app)',
    reason:
      'The app has no runtime signal for npm run build or npm test results. ' +
      'CI verification is performed out-of-band; the Release Readiness Gate ' +
      'reports this row as Not Wired by design.',
    blockerKind: 'observability',
  },
  {
    id: 'stage-reference-data-source',
    label: 'Stage reference Power Apps data source',
    reason:
      'Cr664_stagereferences (a separate stage-reference table imagined in Phase 28) is not ' +
      'registered as a Power Apps data source; no typed service exists in src/generated/services/ ' +
      'for it. SUPERSEDED: the chosen stage-progression design does not need this table — ordering ' +
      'now rides on the already-registered deal stage reference table via the cr664_sequence ' +
      'ordinal (see stage-progression-advance). Retained only to record that this separate table ' +
      'was never built.',
    blockerKind: 'schema',
  },
  {
    id: 'stage-ordering-contract',
    label: 'Stage ordering / sequence contract',
    reason:
      'The stage ordering CONTRACT now exists in code (src/workflow/stageOrderingContract.ts) and ' +
      'resolves next / prior / terminal deterministically. The remaining gap is schema DATA: the ' +
      'cr664_sequence ordinal is not yet added to the stage reference table and the seven ordered ' +
      'rows are not yet seeded, so the contract resolves UNAVAILABLE (fail-closed) in this ' +
      'environment. Resolves READY once the maker seeds cr664_sequence and regenerates the SDK ' +
      '(docs/STAGE_SCHEMA_SETUP.md). AUTO_STAGE_ADVANCE_ENABLED itself is ARMED (true) as of WF-1A -- ' +
      'this schema-seeding gap, not the flag, is what still fail-closes the live forward-Advance write ' +
      '(DealStageProgressionCard.tsx) in an unseeded environment.',
    blockerKind: 'schema',
  },
  {
    id: 'executive-deal-drillthrough',
    label: 'Executive /deals/:id drill-through',
    reason:
      'Executive workspace is snapshot-only by design (Phase 15). Deal ' +
      'drill-through from the executive surface requires a separate ' +
      'governance decision.',
    blockerKind: 'governance',
  },
  {
    id: 'admin-deal-drillthrough',
    label: 'Admin /deals/:id drill-through',
    reason:
      'Admin operational deal drill-through is a separate governance ' +
      'decision; intentionally not wired through DealRoute.',
    blockerKind: 'governance',
  },
  {
    id: 'borrower-portal',
    label: 'Borrower portal (external-user-facing)',
    reason:
      'No borrower-facing surface ships in this Code App. Phase 64 audited ' +
      'the platform end-to-end against a borrower portal MVP scope and ' +
      'confirmed six concurrent hard blockers, every one of which sits ' +
      'outside this repo: ' +
      '(1) no external auth provider — runBootstrap() requires a Bank-' +
      'tenant Entra UPN matched to a cr664_platformuser row (Phase 115 ' +
      'identity entry point), and borrowers are not on the Bank tenant; ' +
      '(2) no invitation-token / magic-link table — src/generated/services ' +
      'contains no Invitation*, Token*, MagicLink*, OneTime*, or Consent* ' +
      'service; ' +
      '(3) no external-user role model — src/bootstrap/workspaceRoutes.ts ' +
      'recognizes exactly five internal regexes (banker/team/manager/' +
      'executive|board/admin) and there is no entitlement chain for an ' +
      'external workspace; ' +
      '(4) no File column for uploads on cr664_DocumentChecklist — same ' +
      'gap pinned by NOT_WIRED.document-upload; the cr664_uploadstatus ' +
      'boolean is metadata only and no binary can land on the row; ' +
      '(5) no secure-message persistence — no Messages/Conversations/' +
      'Comments service exists and cr664_DealTimelineEvent.cr664_visibility' +
      'scope has no BorrowerSafe value (BankerAndManager/Team/' +
      'ExecutiveSafe/AdminOnly only), so a borrower-readable activity ' +
      'stream has no schema slot; ' +
      '(6) no automated borrower-notification path — Phase 104 wired ' +
      'LIVE document-request email and Phase 105 wired LIVE borrower- ' +
      'update email through the Office 365 Outlook connector ' +
      '(Office365OutlookService.SendEmailV2), but both are banker- ' +
      'initiated send paths (the banker types recipient + subject + ' +
      'body + banker note, then clicks Send). There is no automation ' +
      'that posts a notification on the borrower\'s behalf — no ' +
      'scheduled trigger, no event-driven push, no inbound-mail sync. ' +
      'The platform never independently notifies a borrower. Phase 63 ' +
      'HANDOFF mode is also banker-initiated and is not a notification ' +
      'surface. See docs/PHASE_64_BORROWER_PORTAL_AUDIT.md for the ' +
      'full capability matrix and unblock checklist; ' +
      'docs/PHASE_65_BORROWER_PORTAL_DEFERRAL.md for the standing ' +
      'deferral rationale.',
    blockerKind: 'compound',
  },
  {
    id: 'closing-document-persistence',
    label: 'Closing documents (deal-level persistence)',
    reason:
      'PR 107 -- DealClosingDocumentsPanel.tsx mounts the fully-built closing-document generation ' +
      'framework (src/closing/documents/*, 49 tests) using its own documented ' +
      'createInMemoryClosingDocumentStore() reference implementation -- real, working, but ' +
      'explicitly NOT persistence (lost on reload). No cr664_closingdocument-style table exists ' +
      'yet; unlike PR 105/106\'s single additive JSON columns, generated documents are immutable, ' +
      'append-only, per-document manifest rows (regeneration creates a new manifest via ' +
      'supersedesManifestId, never mutates the prior one), so real persistence needs its own table, ' +
      'not a deal-level blob. See docs/factory-arc/PR107_CLOSING_FUNDING_ACTIVATION.md. Factory Arc ' +
      'Phase 11 closed the "no table proposal exists yet" gap: ' +
      'scripts/schema-migrations/pr123-closing-document-persistence/ now has a full, reviewed, NOT-' +
      'yet-applied entity.mjs/create/verify/rollback bundle (mirroring the pr107-funding-authorization ' +
      'precedent) proposing cr664_closingdocumentmanifest -- one row per generated manifest, matching ' +
      'GeneratedClosingDocumentManifest field-for-field, plus the rendered content itself. See ' +
      'docs/factory-arc/PR123_CLOSING_DOCUMENT_PERSISTENCE_SCHEMA_PROPOSAL.md. Deliberately NOT hand-' +
      'authoring a fake generated SDK model/service for this table the way PR 112 did for funding ' +
      'authorization -- that precedent is itself flagged for reconciliation (see Phase 10\'s ' +
      'PR122_FUNDING_AUTHORIZATION_SDK_REGENERATION_ESCALATION.md), so this phase stops at the schema ' +
      'proposal and stays real: an operator must apply the table live and run a genuine `pac code` ' +
      'regeneration before any adapter is written.',
    blockerKind: 'schema',
  },
  {
    id: 'funding-authorization-persistence',
    label: 'Funding authorization (deal-level persistence)',
    reason:
      'PR 112 -- DealFundingAuthorizationPanel.tsx now writes/reads through ' +
      'createDataverseFundingAuthorizationStore() (src/funding/fundingAuthorizationDataverseStore.ts), ' +
      'a durable Dataverse-backed store against the cr664_fundingauthorization table specced in ' +
      'scripts/schema-migrations/pr107-funding-authorization/entity.mjs (18 columns + primary ' +
      'cr664_recordid), replacing PR 111\'s session-scoped createInMemoryFundingAuthorizationStore(). ' +
      'Dual-control policy is unchanged and durable now, not merely session-real: request -> first ' +
      'approval -> second approval -> disbursement confirmation, with FundingAuthorizationPanel\'s own ' +
      'isSelfApprovalRisk check + the policy engine\'s self_approval_not_permitted denial correctly ' +
      'blocking one actor from completing both approvals. The one remaining honest caveat: ' +
      'Cr664_fundingauthorizationsModel.ts / Service.ts (and the power.config.json data-source entry) ' +
      'were hand-authored to mechanically match entity.mjs and this repo\'s standard generated-SDK ' +
      'shape -- NOT produced by a real `pac code add-data-source` + regenerate against a live org (no ' +
      'live Dataverse credentials exist in this sandbox to do that). The adapter fails closed with a ' +
      'visible error rather than a silent fallback if a live call does not behave as expected; a real ' +
      'operator-run regeneration should be diffed against these files. CORRECTION (Factory mission PR A, ' +
      '2026-07-27): conditionsPrecedentResolved is NO LONGER one of the hard-coded facts -- Workstreams ' +
      'E/G wired DealFundingAuthorizationPanelConnected.tsx to derive it live via ' +
      'evaluateConditionVerificationReadiness() against real Condition Verification records. The remaining ' +
      'readiness facts with no live source (documents/exceptions/destination/expiry) still hard-code to ' +
      'their fail-closed blocking value, so a session genuinely reaches APPROVED but always shows blocked ' +
      'at disbursement confirmation -- correct behavior, not a bug. Factory Arc Phase 10 found the Phase ' +
      '2 SDK-regeneration escalation (docs/factory-arc/PR114_LOAN_DEAL_SDK_REGENERATION_ESCALATION.md) ' +
      'covers only cr664_loandeals and never mentioned this second hand-authored table, so an operator ' +
      'following that runbook alone would regenerate Loan Deal and stop there, unaware this table also ' +
      'needs the same real-regen-and-diff treatment -- closed with its own escalation runbook, ' +
      'docs/factory-arc/PR122_FUNDING_AUTHORIZATION_SDK_REGENERATION_ESCALATION.md. See also ' +
      'docs/final-seven-workstreams/07_FUNDING_AUTHORIZATION_FRAMEWORK.md.',
    blockerKind: 'schema',
  },
  {
    id: 'annual-review-persistence',
    label: 'Portfolio annual review (live persistence)',
    reason:
      'Factory Arc Phase 14 -- confirmed genuinely absent, and previously untracked by this registry ' +
      'entirely (no NOT_WIRED/DELIBERATELY_BLOCKED entry existed for this domain before this phase). ' +
      'src/portfolioAnnualReview/annualReviewPersistenceAdapter.ts\'s createDisabledAnnualReviewPersistenceAdapter() ' +
      'fails closed on every operation (readAnnualReviewCycle, searchAnnualReviewPackages, ' +
      'saveAnnualReviewPackage, updateRequirementStatus, addReviewNote, addEscalation, completeReview) ' +
      '-- its own header discloses "141A ships NO live annual-review writes; a live adapter arrives in ' +
      'a later phase once an annual-review schema/persistence plan is approved." No caller anywhere in ' +
      'the repo invokes this adapter (grepped clean) -- AnnualPortfolioReviewCommandCenter.tsx has zero ' +
      'onClick/mutation handlers. The displayed cycle is a hardcoded PREVIEW_ANNUAL_REVIEW_CYCLE fixture ' +
      '(src/navigation/featureSurfaces.tsx), and the whole surface is gated off by default via ' +
      'PORTFOLIO_ANNUAL_REVIEW_ROUTE_ENABLED: false (src/navigation/featureSurfaceFlags.ts). Unlike ' +
      'closing-document-persistence or funding-authorization-persistence, no schema proposal exists yet ' +
      'for this domain -- it needs one covering at minimum a review-cycle/package record, a per-' +
      'requirement status record, and an escalation record (see ' +
      'annualReviewPersistenceTypes.ts\'s AnnualReviewPersistenceAdapter contract), a materially larger ' +
      'design effort than the single-table proposals those two entries describe. Deferred as its own ' +
      'future phase rather than attempted here. See docs/factory-arc/PR126_PORTFOLIO_SERVICING_COMPLETION.md.',
    blockerKind: 'schema',
  },
  {
    id: 'portfolio-boarding-audit-governance',
    label: 'Portfolio boarding write (GOVERNED_WRITES registration)',
    reason:
      'Factory Arc Phase 14 -- src/portfolioBoarding/existingLoanEntryAdapter.ts is a real write path ' +
      '(the one with machine-proven smoke evidence, docs/operator-evidence/final-launch/portfolioBoarding.json) ' +
      'that DOES emit a genuine audit trail via Cr664_portfolioboardedloanauditentriesService -- so this ' +
      'is not a "no proof at all" gap like Phase 13 found for funding authorization pre-fix. The gap is ' +
      'narrower: it emits no DealTimelineEvent, and neither this write nor any other portfolio-boarding ' +
      'write appears in GOVERNED_WRITES (platformInventory.ts) at all, so this registry -- the single ' +
      'source of truth for what emits audit/timeline evidence -- is silently blind to the whole boarding ' +
      'domain. CORRECTION (Factory mission PR A, 2026-07-27): the prior claim here -- that the live ' +
      'persistence path is gated off by PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED and "no real write ' +
      'happens in production today" -- was stale and is corrected here. PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED ' +
      'gates a DIFFERENT write path (the manual bulk-import / "Add Existing Loan" form, resolved via ' +
      'resolvePortfolioLoanBoardingPersistenceAdapter.ts, used by portfolioImportRunner.ts / ' +
      'PortfolioLoanBoardingForm.tsx). The auto-board-on-stage-advance write this entry actually describes ' +
      '(existingLoanEntryAdapter.ts, invoked unconditionally from buildLiveStageAdvanceDeps.ts\'s ' +
      'onDealBoarded when a deal reaches BOARDED) has NO feature flag of its own, and AUTO_STAGE_ADVANCE_ENABLED ' +
      '(the flag that does gate it, transitively, by gating stage-advance itself) is ARMED (true, ' +
      'dealOriginationFeatureFlags.ts) -- so this write is real and live today, not gated off. The remaining ' +
      'gap is exactly the registration one above (no DealTimelineEvent on this path, no GOVERNED_WRITES entry) ' +
      '-- not a flag. See docs/factory-arc/PR126_PORTFOLIO_SERVICING_COMPLETION.md.',
    blockerKind: 'governance',
  },
  {
    id: 'portfolio-migration-reconciliation',
    label: 'Portfolio migration reconciliation (book tie-out)',
    reason:
      'Final LOS Completion arc (Workstream R) -- the full reconciliation ENGINE already exists and ' +
      'is thoroughly tested: deriveMigrationReconciliation (src/portfolio/reconciliation/bookReconciliation.ts) ' +
      'is a pure, deterministic tie-out (count/dollar deltas, per-segment breakdown, two orphan lists, ' +
      'tied/out_of_balance verdict), and MigrationReconciliationPanel (BookReconciliationPanel.tsx) is a ' +
      'fully built, live-reachable render of it, mounted on the Portfolio Command Center. This entry is ' +
      'not about missing logic -- it is about missing DATA: the panel is always mounted with no props, so ' +
      'it always renders its honest empty state, because the migration-control source it needs -- the ' +
      'planned cr664_portfoliomigrationcontrol table and the additive cr664_migrationbatchid column on ' +
      'the boarded-loan table (both fully specified in reconciliationControlSchemaPlan.ts) -- is not yet ' +
      'provisioned. Unblock path is schema-only: provision the table/column, regenerate the SDK, then wire ' +
      'a live loader that reads operator-entered migration controls and passes them (with the matching ' +
      'boarded-loan rows) into MigrationReconciliationPanel.',
    blockerKind: 'schema',
  },
];

// ---------------------------------------------------------------------------
// Executive transitional fallback (Phase 15 + reaffirmed by Phase 30 gate)
// ---------------------------------------------------------------------------

/**
 * Executive surfaces still on the transitional operational-fallback adapter
 * (snapshot entities for these features do not exist yet). The Phase-15
 * footer marks each card as "transitional"; this list is the source of
 * truth for the Release Readiness Gate's needs-review signal.
 */
export const EXEC_TRANSITIONAL_FALLBACK_FEATURES: readonly string[] = [
  'PipelineByStage',
  'MonthlyClosingForecast',
];

// ---------------------------------------------------------------------------
// Local-only flows (UI surfaces that generate / preview / copy but never
// write to Dataverse)
// ---------------------------------------------------------------------------

export interface LocalOnlyFlow {
  id: string;
  label: string;
  phase: number;
  note: string;
}

export const LOCAL_ONLY_FLOWS: readonly LocalOnlyFlow[] = [
  {
    id: 'borrower-update-draft',
    label: 'Borrower update draft (Copy fallback)',
    phase: 23,
    note:
      'Generate-and-copy preview of a borrower-safe update. No Dataverse ' +
      'write on the Copy path. No timeline event emitted by Copy alone. ' +
      'The banker pastes into their own mail client. Phase 105 added a ' +
      'parallel LIVE Send path via the new GOVERNED_WRITES.deal-borrower-' +
      'update-email governed write (audit + BorrowerUpdateSent timeline ' +
      '788190014, masked recipient, Outlook accepted copy — not ' +
      'delivered) but the Copy path remains as the operational fallback ' +
      'when EMAIL_MODE is DRY_RUN or when the banker explicitly chooses ' +
      'Copy over Send. Clicking Copy still emits NO Dataverse write.',
  },
  {
    id: 'credit-memo-local-preview',
    label: 'Credit memo local preview',
    phase: 24,
    note:
      'Generates a borrower-safe-by-construction memo preview. No Dataverse ' +
      'write. Phase 25 added the governed Save Draft path (which is a ' +
      'governed write — see GOVERNED_WRITES.credit-memo-draft-save).',
  },
  {
    id: 'credit-memo-consistency-check',
    label: 'Credit memo consistency review (deterministic, read-only)',
    phase: 73,
    note:
      'Deterministic local/read-only comparison between the saved ' +
      'credit memo draft and the deal\'s structured fields. No ' +
      'Dataverse write. No audit row. No timeline event. No AI. No ' +
      'approval / credit decision. No automatic blocking. No ' +
      'official validation state. The check inspects only the ' +
      'memo textPreview already loaded by DealDataProvider against ' +
      'structured deal fields (name, clientName, stage, amount, ' +
      'collateralSummary) and surfaces banker-review findings ' +
      'inside the Credit Memo card. Implementation: ' +
      'src/shared/creditMemoConsistency/checkCreditMemoConsistency.ts ' +
      '(pure function). See ' +
      'docs/PHASE_73_CREDIT_MEMO_CONSISTENCY_CHECK.md.',
  },
  {
    id: 'activity-since-last-visit',
    label: 'Activity since last visit (per-deal local marker)',
    phase: 72,
    note:
      'Local browser marker only — no Dataverse write. Per-deal ' +
      'last-viewed timestamp lives in localStorage; the Activity ' +
      'Timeline card derives "N new since your last visit" against ' +
      'that marker and highlights individual events newer than it. ' +
      'No cross-device sync; no notification delivery; no audit ' +
      'row; no timeline event; no AI involvement; no Teams / Outlook ' +
      'tie-in. A banker who reviews on desktop, then opens on ' +
      'mobile, will see every event as new on mobile (each browser ' +
      'has its own localStorage). Implementation: ' +
      'src/shared/lastVisit/lastVisit.ts (pure derivation + storage ' +
      'helpers) + src/shared/lastVisit/useLastVisit.ts (React hook). ' +
      'See docs/PHASE_72_ACTIVITY_SINCE_LAST_VISIT.md.',
  },
  {
    id: 'autopilot-suggestion-ledger',
    label: 'Autopilot suggestion ledger (local-only)',
    phase: 83,
    note:
      'Local browser-only "opened" / "dismissed" state for the ' +
      'Phase 80 per-deal Autopilot panel, the Phase 81 manager ' +
      'rollup, and the Phase 82 banker rollup. Tracked in ' +
      'localStorage under the namespaced slot ' +
      'cc:autopilotSuggestionLedger:v1. No Dataverse write. No ' +
      'audit row. No timeline event. No governed write. No ' +
      'cross-device sync. Not a workflow-resolution event — ' +
      'dismissing a suggestion does NOT mark the underlying deal ' +
      'item resolved / completed / closed / synced / officially ' +
      'acknowledged. The same rule fires on the next render; the ' +
      'ledger only changes how that suggestion is rendered ' +
      '(Dismissed locally · tracked on this browser · Restore). ' +
      'Pure helpers in src/shared/autopilot/suggestionLedger.ts; ' +
      'React hook in src/shared/autopilot/useSuggestionLedger.ts. ' +
      'See docs/PHASE_83_AUTOPILOT_SUGGESTION_LEDGER.md.',
  },
  {
    id: 'relationship-note-draft',
    label: 'Banker relationship-note draft (local-only)',
    phase: 78,
    note:
      'Local-only banker note drafting + copy-to-clipboard. No ' +
      'Dataverse write. No audit row. No timeline event. No ' +
      'governed write entry. No cross-device persistence. Modal ' +
      'state lives only in React state for the lifetime of the ' +
      'modal; closing without copying drops the draft. The banker ' +
      'types a relationship note (required) plus optional ' +
      'follow-up + open-asks blocks; the modal renders a formatted ' +
      'preview ending with the verbatim disclaimer "Local draft. ' +
      'Not saved to the system. Paste into the appropriate system ' +
      'of record." Copy uses navigator.clipboard.writeText; the ' +
      'card never persists, transmits, or interprets the text. ' +
      'Surfaced from the Phase 76 RelationshipMemory card (Banker ' +
      'Command Center) AND the Phase 77 RelationshipContext card ' +
      '(Banker Deal Workspace) — both banker-only. Implementation: ' +
      'src/shared/relationship/relationshipNoteDraft.ts (pure ' +
      'formatter) + src/banker/RelationshipNoteDraftModal.tsx ' +
      '(local-only modal). See ' +
      'docs/PHASE_78_RELATIONSHIP_NOTES_LOCAL_ONLY.md.',
  },
  {
    id: 'borrower-safe-status-packet',
    label: 'Borrower-safe status packet',
    phase: 66,
    note:
      'Generate-and-copy borrower-safe summary of outstanding / received / ' +
      'under-review document items, with a "Next requested actions" list. ' +
      'No Dataverse write, no audit row, no timeline event, no email send. ' +
      'Phase 66 shipped the pure generator + local-preview modal. Phase 67 ' +
      'extended the modal to surface the Phase 63 Outlook handoff helpers ' +
      'directly (Open in Outlook mailto: + Copy email clipboard) so the ' +
      'banker can prepare a borrower-safe email without leaving the modal. ' +
      'The recipient field is optional and empty by default — cr664_borrowers ' +
      'has no email column, so we never infer a recipient from clientName ' +
      'and never hardcode one. The full recipient (when typed) appears only ' +
      'in the local Outlook compose surface and the copied email text; no ' +
      'audit row, no timeline event, no Dataverse write of any kind. ' +
      'Implementation: src/deals/borrowerSafeStatusPacket.ts (pure ' +
      'generator) + src/deals/BorrowerSafeStatusPacketModal.tsx (local ' +
      'preview + mailto handoff + clipboard handoff). Does NOT imply a ' +
      'borrower portal exists (see NOT_WIRED.borrower-portal). See ' +
      'docs/PHASE_66_BORROWER_SAFE_STATUS_PACKET.md for the packet shape ' +
      'and docs/PHASE_67_PACKET_EMAIL_HANDOFF.md for the handoff workflow.',
  },
  {
    id: 'manager-filter-preference',
    label: 'Manager banker-filter preference',
    phase: 93,
    note:
      'Local browser-only memory of the Phase 92 manager banker- ' +
      'filter selection. Sibling to the Phase 90 last-seen markers ' +
      'and Phase 91 catch-up item ledger; uses a separate storage ' +
      'slot (`cc:managerFilterSelection:v1`) keyed by ' +
      '`manager:<bankerId>:<teamId>` so each (manager, team) ' +
      'pair has its own slot. Stored fields: kind (`all` | ' +
      '`banker` | `unassigned`), bankerId (when known), bankerName ' +
      'snapshot, recordedAt ISO. No PII, no deal content, no ' +
      'pipeline data. On provider mount the saved preference is ' +
      'validated against the current banker-filter options — stale ' +
      'selections (the banker no longer has deals; "unassigned" ' +
      'has no matching deals) fall back silently to All team. The ' +
      'preference is written on every selection change. No ' +
      'Dataverse write. No audit row. No timeline event. No ' +
      'cross-device sync. No notification delivery. This is NOT ' +
      'an official manager profile setting — it is a view ' +
      'convenience scoped to one browser. The card disclaimer ' +
      'states this verbatim ("Saved on this browser · Not synced ' +
      'across devices."). Implementation: ' +
      'src/manager/managerBankerFilterPreference.ts (pure storage ' +
      '+ validation helpers) + integration in ' +
      'src/manager/ManagerBankerFilter.tsx. See ' +
      'docs/PHASE_93_MANAGER_FILTER_PREFERENCE.md.',
  },
  {
    id: 'catch-up-item-ledger',
    label: 'Morning catch-up item ledger',
    phase: 91,
    note:
      'Local browser-only dismissed / snoozed state for individual ' +
      'items on the Phase 88 manager and Phase 89 banker morning ' +
      'catch-up cards. Sibling to the Phase 83 autopilot suggestion ' +
      'ledger; uses a separate storage slot ' +
      '(`cc:catchUpItemLedger:v1`) and a different action enum ' +
      '(`dismissed` | `snoozed`). Snoozed entries carry a ' +
      'snoozeUntil ISO timestamp; the default window is 24 hours ' +
      '(CATCH_UP_DEFAULT_SNOOZE_HOURS). The ledger entry only ' +
      'changes how an item is rendered on the card — the ' +
      'underlying deterministic catch-up derivation continues to ' +
      'evaluate against current records. Dismiss / snooze does ' +
      'NOT resolve, complete, or close any business item; does ' +
      'NOT mark a task or document as handled; does NOT change ' +
      'deal status. No Dataverse write. No audit row. No timeline ' +
      'event. No cross-device sync. No notification delivery. ' +
      'Does NOT create official acknowledged / unread state. ' +
      'Snoozed items reappear naturally after snoozeUntil passes; ' +
      'dismissed items can be restored via the per-row Restore ' +
      'affordance. Implementation: ' +
      'src/shared/activity/catchUpItemLedger.ts (pure storage + ' +
      'predicates) + src/shared/activity/useCatchUpItemLedger.ts ' +
      '(React hook). See ' +
      'docs/PHASE_91_CATCH_UP_ITEM_LEDGER.md.',
  },
  {
    id: 'catch-up-last-seen-markers',
    label: 'Morning catch-up last-seen markers',
    phase: 90,
    note:
      'Local-only "since your last visit on this browser" overlay on ' +
      'the Phase 88 manager and Phase 89 banker morning catch-up ' +
      'cards. Reuses the Phase 72 lastVisit pattern with a separate ' +
      'storage namespace (`cc:lastVisit:catchUp:`) so the per-deal ' +
      'Phase 72 markers and the Phase 90 catch-up markers cannot ' +
      'collide. The marker is scoped per-user-per-surface — banker ' +
      'scope key is `banker:<bankerId>`; manager scope key is ' +
      '`manager:<bankerId>:<teamId>`. When the identity is ' +
      'unavailable the card renders an honest "Last-seen marker ' +
      'unavailable for this browser" fallback and skips the marker ' +
      'write. The card surfaces a "N new since your last visit on ' +
      'this browser" line, "First visit on this browser" copy on ' +
      'first visit, and a per-item "New" badge on items whose ' +
      'anchor timestamp is strictly greater than the prior marker ' +
      'AND in the past (future-anchored items like closing-soon ' +
      'never trigger the "New" badge). The marker is bumped to ' +
      '`now` after a 2-second settle — same predictable timing ' +
      'Phase 72 uses. Phase 94 added a manual "Mark all seen" ' +
      'button to both catch-up cards that bumps the marker to `now` ' +
      'immediately (and writes it to localStorage) so the "N new" ' +
      'count + per-item "New" badges clear without waiting the ' +
      '2-second settle; the button surfaces only when the marker ' +
      'scope is available AND there are new items. No Dataverse ' +
      'write. No audit row. No timeline event. No cross-device ' +
      'sync. No notification delivery. Does NOT create official ' +
      'unread state. The marker is plain text (millisecond Unix ' +
      'epoch). Implementation: ' +
      'src/shared/lastVisit/catchUpLastSeen.ts (pure storage + ' +
      'derivation) + src/shared/lastVisit/useCatchUpLastSeen.ts ' +
      '(React hook with the Phase 94 `markAllSeen` action). See ' +
      'docs/PHASE_90_CATCH_UP_LAST_SEEN_MARKERS.md and ' +
      'docs/PHASE_94_CATCH_UP_MARK_ALL_SEEN.md.',
  },
  {
    id: 'outlook-summary-handoff',
    label: 'Microsoft Outlook summary copy / mailto handoff',
    phase: 101,
    note:
      'No-admin Outlook handoff parity for the same summary surfaces ' +
      'that carry the Phase 98 / 99 / 100 Teams handoff: ' +
      'BankerMorningCatchUp, ManagerMorningCatchUp, ActivityTimeline ' +
      '(per deal), and RelationshipMemory (per client row). A small ' +
      'wrapper (src/shared/email/summaryOutlookHandoff.ts) reuses the ' +
      'Phase 63 buildMailtoUrl + buildHandoffClipboardText primitives ' +
      'verbatim — no new mailto encoding logic. A reusable React ' +
      'component (src/shared/email/SummaryOutlookHandoffButtons.tsx) ' +
      'renders an "Open in Outlook" + "Copy email" pair on every ' +
      'consuming card. "Open in Outlook" sets window.location.href ' +
      'to an RFC 6068 mailto URL so the OS hands the URL to the ' +
      'user\'s default mail client; "Copy email" writes the Phase 63 ' +
      'clipboard payload ("To: …\\nSubject: …\\n\\n<body>") via ' +
      'navigator.clipboard.writeText. The body reuses the Phase 98 / ' +
      '99 / 100 plain-text formatter output unchanged. Subjects use ' +
      'the verbatim Phase 101 brief copy: "Morning catch-up summary" ' +
      'for catch-up surfaces, "Deal activity summary — <Deal Name>" ' +
      'for the per-deal Activity Timeline, "Relationship snapshot — ' +
      '<Client Name>" (or "(no borrower name on record)" placeholder ' +
      'when missing) for the relationship-memory row. The app does ' +
      'NOT send email. No Office 365 Outlook connector is registered ' +
      'or invoked. No Graph. No MSAL. No token acquisition. No ' +
      'notification delivery. No calendar sync. No Dataverse write. ' +
      'No audit row. No timeline event. No governed-write entry. ' +
      'Recipient is OPTIONAL and EMPTY by default — the brief ' +
      'explicitly forbids inferring a recipient from client name or ' +
      'any deal field; bankers type the recipient in their Outlook ' +
      'client after the mailto opens. The mailto URL has no ' +
      'characters between "mailto:" and the leading "?" when no ' +
      'recipient is provided. The UI carries the verbatim phrases ' +
      '"Open in Outlook", "Copy email", "You send from Outlook", and ' +
      '"Local handoff only". The rendered disclaimer and the source ' +
      'never positively claim that the app sent, delivered, synced, ' +
      'notified, was Outlook-connected, was connector-backed, ' +
      'transmitted any message automatically, or was Graph-connected. ' +
      'Crucially, the click does ' +
      'NOT mutate the Phase 72 per-deal last-visit marker, the Phase ' +
      '90 catch-up last-seen markers, the Phase 91 dismiss / snooze ' +
      'ledger, the Phase 83 Autopilot suggestion ledger, or the ' +
      'Phase 78 relationship-note draft state. localStorage byte-' +
      'snapshot tests pin the non-mutation guarantees on every ' +
      'surface. Implementation: ' +
      'src/shared/email/summaryOutlookHandoff.ts (helper + subject ' +
      'builders) + src/shared/email/SummaryOutlookHandoffButtons.tsx ' +
      '(reusable button pair) + inline wrappers in ' +
      'src/banker/BankerMorningCatchUp.tsx, ' +
      'src/manager/ManagerMorningCatchUp.tsx, ' +
      'src/deals/ActivityTimeline.tsx, and ' +
      'src/banker/RelationshipMemory.tsx. Does NOT use the Outlook ' +
      'connector — Phase 101 summary handoffs are copy-to-clipboard ' +
      'regardless of EMAIL_MODE (LIVE vs DRY_RUN). Phase 104 wired ' +
      'LIVE document-request email through SendEmailV2 and Phase 105 ' +
      'wired LIVE borrower-update email through the same connector, ' +
      'but the catch-up / activity / relationship summary surfaces ' +
      'still do not call SendEmailV2 — they remain copy-to-clipboard ' +
      'handoffs by design. See ' +
      'docs/PHASE_61_OUTLOOK_EMAIL_DELIVERY.md, ' +
      'docs/PHASE_63_EMAIL_HANDOFF_FALLBACK.md, and ' +
      'docs/PHASE_101_OUTLOOK_SUMMARY_HANDOFF.md.',
  },
  {
    id: 'relationship-memory-teams-summary-handoff',
    label: 'Microsoft Teams relationship-memory copy handoff',
    phase: 100,
    note:
      'No-admin copy-to-clipboard Teams handoff for each row of the ' +
      'Phase 76 Relationship Memory Lite card on the Banker Command ' +
      'Center. A pure formatter ' +
      '(src/shared/relationship/relationshipMemoryTeamsSummary.ts) ' +
      'turns one RelationshipMemoryEntry into a plain-text snapshot ' +
      'the banker pastes into Microsoft Teams. The snapshot includes ' +
      'the client display name + "Relationship snapshot" + YYYY-MM-DD ' +
      'UTC date + verbatim "Client-name grouped." line, active deal ' +
      'count + optional pipeline amount ("(N missing $)" when some ' +
      'deals lack amount), the Phase 76 timeline anchors ("Last ' +
      'activity: N days ago." + "Nearest upcoming close: in N days ' +
      '(YYYY-MM-DD)."), conditional Asks block (open document ' +
      'requests + open tasks with optional overdue parenthetical), ' +
      'conditional Attention block (pending review + closing soon + ' +
      'stage attention + draft memos), and up to ' +
      'RELATIONSHIP_MEMORY_TEAMS_SUMMARY_MAX_DEALS (8) active deal ' +
      'lines as "- dealName — stage" with a "- … and N more" ' +
      'overflow line. The formatter reuses the Phase 76 ' +
      'RelationshipMemoryEntry / RelationshipDealSnapshot shapes ' +
      'unchanged; no new derivation logic is introduced. The app ' +
      'does not post to Teams, send anything, sync with Teams, raise ' +
      'a Teams notification, create a meeting, or call Graph. No ' +
      'Dataverse write. No audit row. No timeline event. No calendar ' +
      'sync. No notification delivery. No Graph call. No access-' +
      'token acquisition. The Teams SDK is NOT loaded by this flow. ' +
      'Crucially, copying the snapshot does NOT save relationship ' +
      'notes, open the Phase 78 RelationshipNoteDraftModal, mutate ' +
      'the Phase 83 Autopilot suggestion ledger ' +
      '(cc:autopilotSuggestionLedger:v1), the Phase 90 last-seen ' +
      'markers (cc:lastVisit:catchUp:*), or the Phase 91 dismiss / ' +
      'snooze ledger (cc:catchUpItemLedger:v1). A localStorage byte-' +
      'snapshot test pins this. Copying does NOT create an official ' +
      'relationship record, does NOT imply a verified borrower / ' +
      'entity graph, and does NOT infer householding. The UI carries ' +
      'the verbatim phrases "Copy Teams summary", "Paste into Teams", ' +
      'and "You send the message manually". The rendered snapshot ' +
      'carries the verbatim limitation markers "Client-name ' +
      'grouped.", "may not include all related borrowers", "Not a ' +
      'relationship graph", "not a household linkage", and "not a ' +
      'relationship score". The output and the source never say ' +
      'sent / posted / delivered / notified / synced / Teams ' +
      'integrated / Graph connected / approved / denied / rejected / ' +
      'credit decision / risk score / performance score / AI-' +
      'generated / Copilot / household / verified / complete history ' +
      '/ full relationship profile / official relationship graph as ' +
      'a positive claim. The formatter output never echoes internal ' +
      'audit IDs, cr664_* logical names, _value lookup suffixes, raw ' +
      'timeline payload JSON, correlation ids, memo body text, ' +
      'secrets, tokens, or connector state. Implementation: ' +
      'src/shared/relationship/relationshipMemoryTeamsSummary.ts ' +
      '(pure formatter) + inline `<RelationshipMemoryTeamsCopyButton ' +
      '/>` in src/banker/RelationshipMemory.tsx. Does NOT imply a ' +
      'full Teams integration; the broader Lane E gaps documented ' +
      'in docs/PHASE_85_TEAMS_INTEGRATION_READINESS_AUDIT.md remain ' +
      'untouched. See docs/PHASE_100_RELATIONSHIP_MEMORY_TEAMS_HANDOFF.md.',
  },
  {
    id: 'activity-timeline-teams-summary-handoff',
    label: 'Microsoft Teams activity-timeline copy handoff',
    phase: 99,
    note:
      'No-admin copy-to-clipboard Teams handoff for the per-deal ' +
      'Activity Timeline card on the Banker Deal Workspace. A pure ' +
      'formatter (src/deals/activityTimelineTeamsSummary.ts) ' +
      'produces a plain-text digest the banker pastes into ' +
      'Microsoft Teams (any chat or channel). The digest includes ' +
      'the deal name + "activity digest" + YYYY-MM-DD UTC date, the ' +
      'total timeline event count, the Phase 72 since-last-visit ' +
      'context (when the marker has initialized — "First visit on ' +
      'this browser." or "N new activity item(s) since your last ' +
      'visit on this browser." or "No new activity since your last ' +
      'visit on this browser."), and up to ' +
      'ACTIVITY_TIMELINE_TEAMS_SUMMARY_MAX_ITEMS (8) most recent ' +
      'events as ' +
      '"- <YYYY-MM-DD HH:mm UTC> · <Event type[/SubType]>: <Title> ' +
      '— <summary> (<sourceLabel> · by <actor>)[ · new]" rows. The ' +
      'caller maps cr664_relatedentitytype to a banker-friendly ' +
      'source label via the existing friendlyEntityLabel helper ' +
      'before passing each item to the formatter — no raw cr664_* ' +
      'logical names ever reach the paste. The app does not post ' +
      'to Teams, send anything, sync with Teams, raise a Teams ' +
      'notification, create a meeting, or call Graph. No Dataverse ' +
      'write. No audit row. No timeline event. No calendar sync. ' +
      'No notification delivery. No Graph call. No access-token ' +
      'acquisition. The Teams SDK is NOT loaded by this flow. ' +
      'Crucially, copying the digest does NOT mutate the Phase 72 ' +
      'last-visit marker — the marker is owned by `useLastVisit(' +
      'deal.id)` and its auto-bump runs on its own schedule; the ' +
      'copy click never invokes a setter or writes the marker ' +
      'localStorage slot directly. A localStorage byte-snapshot ' +
      'test (ActivityTimeline.test.tsx) pins this. Activity is NOT ' +
      'marked seen by copying; the deal state is unchanged. The UI ' +
      'carries the verbatim phrases "Copy Teams summary", "Paste ' +
      'into Teams", and "You send the message manually". The ' +
      'output and the source never say sent / posted / delivered / ' +
      'notified / synced / Teams integrated / Graph connected / ' +
      'approved / denied / rejected / credit decision / risk score ' +
      '/ performance score / AI-generated / Copilot as a positive ' +
      'claim. The formatter output never echoes internal audit ' +
      'IDs, cr664_* logical names, _value lookup suffixes, raw ' +
      'timeline payload JSON, correlation ids, secrets, tokens, or ' +
      'connector state. Implementation: ' +
      'src/deals/activityTimelineTeamsSummary.ts (pure formatter) ' +
      '+ inline `<ActivityTimelineTeamsCopyButton />` in ' +
      'src/deals/ActivityTimeline.tsx. Does NOT imply a full Teams ' +
      'integration; the broader Lane E gaps documented in ' +
      'docs/PHASE_85_TEAMS_INTEGRATION_READINESS_AUDIT.md remain ' +
      'untouched. See docs/PHASE_99_ACTIVITY_TIMELINE_TEAMS_HANDOFF.md.',
  },
  {
    id: 'catch-up-teams-summary-handoff',
    label: 'Microsoft Teams morning-catch-up copy handoff',
    phase: 98,
    note:
      'No-admin copy-to-clipboard Teams handoff for the Phase 88 ' +
      'manager and Phase 89 banker morning-catch-up cards. A pure ' +
      'formatter (src/shared/activity/catchUpTeamsSummary.ts) ' +
      'produces a plain-text summary the user can paste into ' +
      'Microsoft Teams (any chat or channel). The summary includes ' +
      'a banker / manager surface label, a YYYY-MM-DD UTC date, the ' +
      'visible-item count, the Phase 90 since-last-visit context ' +
      '(when the marker scope is available on this browser), and up ' +
      'to CATCH_UP_TEAMS_SUMMARY_MAX_ITEMS (8) top items as ' +
      '"- [PRIORITY] DealName — Title: Reason" rows. The manager ' +
      'surface additionally appends "(Banker: <ownerName>)" so the ' +
      'manager can see ownership at a glance; the banker surface ' +
      'omits that suffix (the signed-in banker is the implicit ' +
      'owner). The app does not post to Teams, send anything, sync ' +
      'with Teams, raise a Teams notification, create a meeting, or ' +
      'call Graph. No Dataverse write. No audit row. No timeline ' +
      'event. No calendar sync. No notification delivery. No Graph ' +
      'call. No access-token acquisition. The Teams SDK is NOT ' +
      'loaded by this flow. Crucially, copying the summary does ' +
      'NOT mutate the Phase 90 last-seen marker, the Phase 91 ' +
      'dismiss / snooze ledger, or the Phase 94 mark-all-seen ' +
      'state — items are not marked seen, dismissed, snoozed, or ' +
      'resolved by the copy click. The UI carries the verbatim ' +
      'phrases "Copy Teams summary", "Paste into Teams", and "You ' +
      'send the message manually". The output and the source never ' +
      'say sent / posted / delivered / notified / synced / Teams ' +
      'integrated / Graph connected / approved / denied / rejected ' +
      '/ credit decision / risk score / performance score / ' +
      'AI-generated / Copilot as a positive claim. The formatter ' +
      'output never echoes internal audit IDs, cr664_* logical ' +
      'names, raw timeline payloads, full memo body text, secrets, ' +
      'tokens, or connector state. Implementation: ' +
      'src/shared/activity/catchUpTeamsSummary.ts (pure formatter) ' +
      '+ inline `<CatchUpTeamsCopyButton />` in ' +
      'src/banker/BankerMorningCatchUp.tsx and ' +
      'src/manager/ManagerMorningCatchUp.tsx. Does NOT imply a full ' +
      'Teams integration; the broader Lane E gaps documented in ' +
      'docs/PHASE_85_TEAMS_INTEGRATION_READINESS_AUDIT.md remain ' +
      'untouched. See docs/PHASE_98_CATCH_UP_TEAMS_SUMMARY_HANDOFF.md.',
  },
  {
    id: 'teams-deal-summary-handoff',
    label: 'Microsoft Teams deal-summary copy handoff',
    phase: 96,
    note:
      'No-admin copy-to-clipboard Teams handoff. The Banker Deal ' +
      'Workspace renders a `<TeamsDealSummaryHandoff />` card with a ' +
      'plain-text deal summary the banker can copy and paste into ' +
      'Microsoft Teams (any chat or channel). The app does not post ' +
      'to Teams, send anything, sync with Teams, raise a Teams ' +
      'notification, create a meeting, or call Graph. No Dataverse ' +
      'write. No audit row. No timeline event. No calendar sync. ' +
      'No notification delivery. No Graph call. No access-token ' +
      'acquisition. No tenant API is contacted. The Teams SDK is ' +
      'NOT loaded by this flow (the sibling Phase 86 chat-handoff ' +
      'card loads it for a diagnostic-only probe; Phase 96 is purely ' +
      'a string formatter + clipboard write). The summary is built ' +
      'from records the banker already sees on the Deal Workspace ' +
      '(deal facts + open task count + outstanding/pending-review ' +
      'document counts + Phase 73 memo-consistency findings count + ' +
      'optional top Next Best Action). Phase 97 adds an optional ' +
      'one-line relationship-context note derived from the SAME ' +
      'Phase 76/77 primitive `<RelationshipContext />` already uses: ' +
      'loadBankerWorkQueueData(bankerId) -> deriveCrossDealContext. ' +
      'The note is rendered by a pure formatter ' +
      '(src/shared/relationship/relationshipContextNote.ts) and is ' +
      'OMITTED when there is no useful content (no client name on ' +
      'record OR no other visible deals share the client-name ' +
      'group). The note carries the verbatim "client-name grouped" + ' +
      '"From visible records; may not include all related borrowers" ' +
      'limitation markers and NEVER says household / verified / ' +
      'complete / full relationship profile / relationship score / ' +
      'risk score / all borrower exposure / AI-generated / ' +
      'relationship graph. It never echoes internal ' +
      'audit IDs, raw timeline payloads, full credit memo body text, ' +
      'borrower-sensitive private fields, secrets, tokens, or ' +
      'connector state. The UI carries the verbatim phrases "Copy ' +
      'Teams summary", "Paste into Teams", and "You send the message ' +
      'manually". The app never says sent / posted / delivered / ' +
      'notified / synced / Teams integrated / Graph connected as a ' +
      'positive claim. Implementation: ' +
      'src/deals/teamsDealSummary.ts (pure formatter) + ' +
      'src/deals/TeamsDealSummaryHandoff.tsx (banker-only Deal ' +
      'Workspace card) + Phase 97: ' +
      'src/shared/relationship/relationshipContextNote.ts ' +
      '(pure relationship-note formatter, reuses the Phase 76/77 ' +
      'deriveCrossDealContext primitive). Does NOT imply a full ' +
      'Teams integration; the broader Lane E gaps documented in ' +
      'docs/PHASE_85_TEAMS_INTEGRATION_READINESS_AUDIT.md remain ' +
      'untouched. See docs/PHASE_96_TEAMS_DEAL_SUMMARY_HANDOFF.md ' +
      'and docs/PHASE_97_TEAMS_SUMMARY_RELATIONSHIP_CONTEXT.md.',
  },
  {
    id: 'teams-chat-handoff',
    label: 'Microsoft Teams chat handoff',
    phase: 86,
    note:
      'No-admin deep-link handoff to the banker\'s own Microsoft ' +
      'Teams client. Clicking the "Open Teams chat" button on the ' +
      'Banker Deal Workspace opens the well-known Microsoft URL ' +
      'https://teams.microsoft.com/l/chat/0/0 with the signed-in ' +
      'banker\'s verified email as the users= param and the deal ' +
      'name as the topic. The recipient and message can be edited ' +
      'inside the Teams client; the app never sends a message. ' +
      'No Dataverse write. No audit row. No timeline event. No ' +
      'calendar sync. No notification delivery. No meeting created. ' +
      'No Graph call. No access-token acquisition. No tenant API ' +
      'is contacted. The Teams SDK (@microsoft/teams-js) is loaded ' +
      'only to probe whether the app is running inside Teams; the ' +
      'result is diagnostic only and the handoff works regardless. ' +
      'The UPN is sourced exclusively from useOptionalBanker().email ' +
      '(the Phase 4 bootstrap chain matches the Entra UPN to a ' +
      'cr664_users row); it is NEVER inferred from borrower / ' +
      'client name or any free-text field. When no verified email ' +
      'is available, the card renders a disabled "Teams chat ' +
      'handoff unavailable" state. Implementation: ' +
      'src/shared/teams/teamsEnvironment.ts (pure deep-link builder ' +
      '+ best-effort SDK probe) + src/deals/TeamsChatHandoff.tsx ' +
      '(banker-only Deal Workspace card). Does NOT imply a full ' +
      'Teams integration; the broader Lane E gaps documented in ' +
      'docs/PHASE_85_TEAMS_INTEGRATION_READINESS_AUDIT.md remain ' +
      'untouched. See docs/PHASE_86_TEAMS_SDK_CHAT_HANDOFF.md.',
  },
];

// ---------------------------------------------------------------------------
// Workspace deal-access matrix
// ---------------------------------------------------------------------------

export type DealAccessMode = 'read-write' | 'read-only' | 'denied';

export interface WorkspaceDealAccess {
  role: 'banker' | 'manager' | 'team' | 'executive' | 'admin';
  dealAccess: DealAccessMode;
  /** Name of the authorization function used by this workspace's
   *  deal route branch, or null if the route is intentionally
   *  denied. */
  authFunction: string | null;
  /** Phase that wired (or denied) this workspace's deal-route
   *  branch. Useful in release notes / audit. */
  phase: number;
  notes: string;
}

export const WORKSPACE_DEAL_ACCESS: readonly WorkspaceDealAccess[] = [
  {
    role: 'banker',
    dealAccess: 'read-write',
    authFunction: 'loadDealForBanker',
    phase: 4,
    notes:
      'Full deal workspace. All five governed write surfaces (task complete, ' +
      'document request, credit memo draft save, plus the admin DQ + alert ' +
      'writes that live elsewhere) are reachable from this surface.',
  },
  {
    role: 'manager',
    dealAccess: 'read-only',
    authFunction: 'loadDealForManager',
    phase: 36,
    notes:
      'Team-scoped via _cr664_team_value. The four write-capable cards ' +
      'render with readOnly=true; no write button shows.',
  },
  {
    role: 'team',
    dealAccess: 'read-only',
    authFunction: 'loadDealForTeam',
    phase: 37,
    notes:
      'Team-scoped via _cr664_team_value. Same readOnly=true rendering as ' +
      'the manager surface.',
  },
  {
    role: 'executive',
    dealAccess: 'denied',
    authFunction: null,
    phase: 15,
    notes:
      'DealRoute denies. Executive workspace is snapshot-only by design.',
  },
  {
    role: 'admin',
    dealAccess: 'denied',
    authFunction: null,
    phase: 17,
    notes:
      'DealRoute denies. Admin operational deal drill-through is a separate ' +
      'governance decision.',
  },
];

// ---------------------------------------------------------------------------
// Static architectural invariants (the two flags the Release Readiness
// Gate has historically read directly)
// ---------------------------------------------------------------------------

export const WORKSPACE_ISOLATION_VERIFIED = true;
export const PERMISSION_BEFORE_QUERY_VERIFIED = true;

// ---------------------------------------------------------------------------
// Phase 41: Reference data governance
//
// Records which platform reference-data tables / catalogs are governed by
// a canonical in-app source. Each entry documents:
//   - whether the catalog is canonical (single source of truth);
//   - whether the associated PROGRESSION / mutation surface is enabled;
//   - the reason it's blocked when not enabled, with the phase that
//     introduced the gap / decision.
//
// The shape is deliberately minimal — this is a governance record, not a
// configuration mechanism. The Release Readiness Gate continues to use the
// existing categories; this block exists so the platform can ENUMERATE its
// governed reference data, and so a future phase that flips
// progressionEnabled to true must do so via deliberate edit.
// ---------------------------------------------------------------------------

export interface ReferenceDataGovernanceEntry {
  /** True when this reference data has a single authoritative in-app
   *  source (e.g. src/shared/stages/stageCatalog.ts for the stage
   *  catalog). */
  canonical: boolean;
  /** True when the associated progression / mutation surface is wired.
   *  Stage progression remains FALSE until the Phase 28 schema gap is
   *  closed; flipping this to true requires the schema work + the
   *  Phase 21/22/25-style governed write. */
  progressionEnabled: boolean;
  /** Phase that introduced the canonical source. */
  introducedInPhase: number;
  /** Reason progression is blocked, when progressionEnabled is false. */
  progressionBlockedReason: string;
}

export const REFERENCE_DATA_GOVERNED: Readonly<
  Record<'stageCatalog', ReferenceDataGovernanceEntry>
> = Object.freeze({
  stageCatalog: {
    canonical: true,
    progressionEnabled: false,
    introducedInPhase: 41,
    progressionBlockedReason:
      'Stage reconciliation: the canonical stage VOCABULARY is now the seven-code set in src/workflow/stageOrderingContract.ts (CANONICAL_STAGES), seeded via cr664_sequence on cr664_stagereferences. The legacy 9-stage catalog here is RETIRED from the deal cockpit (the canonical Stage Map supersedes it) and remains only for non-cockpit consumers. Progression for THIS legacy catalog stays OFF because the schema gap is unclosed (cr664_stagereferences sequence not yet seeded) -- not because of AUTO_STAGE_ADVANCE_ENABLED, which is ARMED (true) as of WF-1A and gates the live canonical Stage Map advance instead (see GOVERNED_WRITES \'deal-stage-advance\'). See docs/STAGE_RECONCILIATION_MAP.md, docs/STAGE_SCHEMA_SETUP.md and src/shared/governance/stageProgressionAvailability.ts.',
  },
});
