/**
 * Production-Surface Inventory (Factory Arc Phase 1).
 *
 * A machine-readable catalog of every place this codebase renders internal
 * launch-program language (gated / pilot / certification / smoke / dry-run /
 * feature-flag names / "pending enablement") to a live user, so a banker or
 * manager sees the product narrated as an unfinished engineering program
 * instead of a working operating system.
 *
 * This file makes NO behavior change. It does not remove, hide, or rewrite
 * any of the copy it catalogs — that is later-phase work (see
 * `migrationPhase` on each entry, and docs/PRODUCTION_SURFACE_INVENTORY.md
 * for the full narrative). It exists so:
 *   1. later phases have a concrete, reviewable worklist instead of "clean up
 *      launch language" as an unbounded ask;
 *   2. `bankerFacingLaunchLanguageGuard.test.ts` has an explicit allowlist —
 *      every entry here with `currentAudience` of 'banker-operational' or
 *      'manager-operational' is pre-existing debt, grandfathered in; any NEW
 *      occurrence introduced after this inventory was built is not on the
 *      allowlist and fails that test.
 *
 * Scope searched: src/banker, src/deals, src/workspaces, src/crm,
 * src/portfolioBoarding, src/shared, src/admin, plus src/manager and
 * src/access (both explicitly in-scope per the factory brief). Non-test
 * .ts/.tsx source only.
 */

export type SurfaceClassification =
  | 'banker-operational'
  | 'manager-operational'
  | 'portfolio-operational'
  | 'admin-platform-operations'
  | 'developer-test-only'
  | 'documentation-only';

/** Which later phase of the factory arc is responsible for resolving this entry. */
export type MigrationPhase =
  | 'phase-2-state-separation'
  | 'phase-3-banker-dashboard'
  | 'phase-4-platform-ops-workspace'
  | 'phase-5-retire-launch-readiness'
  | 'phase-6-capability-availability'
  | 'phase-8-crm-presentation'
  | 'phase-9-portfolio-presentation'
  | 'phase-10-borrower-communications'
  | 'phase-11-new-deal-semantics'
  | 'phase-12-navigation-role-cleanup'
  | 'phase-14-operational-dashboard-redesign'
  | 'no-change-already-admin-scoped'
  | 'no-change-orphaned-unrouted';

export interface ProductionSurfaceInventoryEntry {
  /** Repo-relative path. */
  readonly file: string;
  /** The component or model function that owns this copy. */
  readonly componentOrModel: string;
  /** A representative verbatim visible-copy string (there may be more in the file — see doc). */
  readonly visibleCopy: string;
  /** How many distinct flagged occurrences this file contains. */
  readonly occurrenceCount: number;
  /** The constant, model call, or state source that controls whether/how this copy renders. */
  readonly triggeringSource: string;
  /** Who sees this today. */
  readonly currentAudience: SurfaceClassification;
  /** Who SHOULD see this (or a replacement of it) once the arc completes. */
  readonly correctFutureAudience: SurfaceClassification;
  /** What live, role-appropriate signal should replace this copy. */
  readonly replacementOperationalSignal: string;
  readonly migrationPhase: MigrationPhase;
}

export const PRODUCTION_SURFACE_INVENTORY: readonly ProductionSurfaceInventoryEntry[] = [
  // ---------------------------------------------------------------------
  // Banker-facing — highest priority (Phase 3 dashboard, Phase 6 capability
  // availability, Phase 10/11 for the domain-specific ones).
  // ---------------------------------------------------------------------
  {
    file: 'src/banker/bankerOperatingCommandCenterModel.ts',
    componentOrModel: 'deriveBankerOperatingCommandCenterModel',
    visibleCopy: '"Generation gated" / "Boarding persistence armed — pending certification" / "Create gated"',
    occurrenceCount: 12,
    triggeringSource:
      'BANKER_NEW_DEAL_CREATE_ENABLED, DOCUMENT_CHECKLIST_GENERATION_ENABLED, BORROWER_MESSAGING_ENABLED, CRM_FEATURE_FLAG_DEFAULTS.CRM_LIVE_PERSISTENCE_ENABLED, PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS.PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED (all global constants, not deal-scoped)',
    currentAudience: 'banker-operational',
    correctFutureAudience: 'banker-operational',
    replacementOperationalSignal:
      'Per-capability CapabilityAvailability derived from the banker\'s own deals (blockers, outstanding documents, boarding-eligible loans) — not a global flag label. See Phase 6/Phase 3.',
    migrationPhase: 'phase-3-banker-dashboard',
  },
  {
    file: 'src/banker/BankerOperatingCommandCenter.tsx',
    componentOrModel: 'BankerOperatingCommandCenter (the "System status" section)',
    visibleCopy: '"What\'s live vs. gated for you — hover a pill for detail." / raw EMAIL_MODE value "DRY_RUN"',
    occurrenceCount: 4,
    triggeringSource: 'deriveBankerOperatingCommandCenterModel(), EMAIL_MODE',
    currentAudience: 'banker-operational',
    correctFutureAudience: 'banker-operational',
    replacementOperationalSignal:
      'Replace the whole "System status" pill strip with live Portfolio & Workflow Health metrics (active deals, blockers, documents outstanding/awaiting review, tasks overdue, closings in 14 days). See Phase 3.',
    migrationPhase: 'phase-3-banker-dashboard',
  },
  {
    file: 'src/banker/BankerNewDealCreate.tsx',
    componentOrModel: 'BankerNewDealCreate',
    visibleCopy: '"Create disabled" / "New Deal creation is not enabled in this environment. No record has been created."',
    occurrenceCount: 4,
    triggeringSource: 'evaluateBankerCreateRollout() (bankerNewDealCreateRollout.ts), BANKER_CREATE_PILOT (bankerCreatePilotConfig.ts)',
    currentAudience: 'banker-operational',
    correctFutureAudience: 'banker-operational',
    replacementOperationalSignal:
      'Hide or disable the "+ New Deal" action with a specific reason (permission / reference-data / Dataverse connectivity) — never a global "gated" pill. See Phase 11.',
    migrationPhase: 'phase-11-new-deal-semantics',
  },
  {
    file: 'src/deals/DraftBorrowerUpdateModal.tsx',
    componentOrModel: 'DraftBorrowerUpdateModal',
    visibleCopy: '"Mode: DRY_RUN." / "DRY_RUN: borrower update prepared for ${maskedRecipient}"',
    occurrenceCount: 2,
    triggeringSource: 'EMAIL_MODE',
    currentAudience: 'banker-operational',
    correctFutureAudience: 'banker-operational',
    replacementOperationalSignal:
      'Communication state ("draft prepared", "ready for review", "sent", "failed") rather than the raw transport-mode token. See Phase 10.',
    migrationPhase: 'phase-10-borrower-communications',
  },
  {
    file: 'src/deals/RequestDocumentModal.tsx',
    componentOrModel: 'RequestDocumentModal',
    visibleCopy: '"Mode is DRY_RUN: nothing leaves the client." / "Send recorded (DRY_RUN)"',
    occurrenceCount: 2,
    triggeringSource: 'EMAIL_MODE',
    currentAudience: 'banker-operational',
    correctFutureAudience: 'banker-operational',
    replacementOperationalSignal: 'Same as DraftBorrowerUpdateModal — real communication state, not the raw transport token.',
    migrationPhase: 'phase-10-borrower-communications',
  },
  {
    file: 'src/portfolioBoarding/PortfolioLoanBoardingForm.tsx',
    componentOrModel: 'PortfolioLoanBoardingForm',
    visibleCopy:
      '"Live boarding persistence is not enabled in this environment. This form previews and validates; nothing is saved until an operator enables it after a recorded smoke test."',
    occurrenceCount: 1,
    triggeringSource: 'usePortfolioLoanBoardingPersistence() -> PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED',
    currentAudience: 'portfolio-operational',
    correctFutureAudience: 'portfolio-operational',
    replacementOperationalSignal:
      'Deal-specific boarding state ("Not ready for boarding" / "Ready for boarding" / "Boarding in progress" / "Boarded") — never a smoke-test reference. See Phase 9.',
    migrationPhase: 'phase-9-portfolio-presentation',
  },
  {
    file: 'src/portfolioBoarding/PortfolioLoanBoardingDocumentUploadPanel.tsx',
    componentOrModel: 'PortfolioLoanBoardingDocumentUploadPanel',
    visibleCopy: '"DRY RUN — no SharePoint connector is wired yet." / "Recorded (dry-run) — no file was actually stored."',
    occurrenceCount: 2,
    triggeringSource: 'uploadMode (portfolioSharePointDocumentMode.ts)',
    currentAudience: 'portfolio-operational',
    correctFutureAudience: 'portfolio-operational',
    replacementOperationalSignal: '"Document not yet stored — connector unavailable" phrased as a local, specific limitation. See Phase 9.',
    migrationPhase: 'phase-9-portfolio-presentation',
  },

  // ---------------------------------------------------------------------
  // CRM — banker/manager/team/admin shared surfaces (Phase 8).
  // ---------------------------------------------------------------------
  {
    file: 'src/crm/commandCenter/crmCommandCenterViewModel.ts',
    componentOrModel: 'crmCommandCenterViewModel (dryRunOnly posture)',
    visibleCopy: '"Live CRM and lending workflow writes are disabled. This cockpit shows read-only intelligence... dry-run readiness only."',
    occurrenceCount: 3,
    triggeringSource: 'static dryRunOnly: true field',
    currentAudience: 'banker-operational',
    correctFutureAudience: 'banker-operational',
    replacementOperationalSignal: '"CRM records available", "Last relationship activity", "Open follow-ups" — see Phase 8.',
    migrationPhase: 'phase-8-crm-presentation',
  },
  {
    file: 'src/crm/commandCenter/CrmCommandCenterShell.tsx',
    componentOrModel: 'CrmCommandCenterShell',
    visibleCopy: '"CRM and lending workflow intelligence — read-only, preview-only, dry-run only"',
    occurrenceCount: 1,
    triggeringSource: 'static subtitle string',
    currentAudience: 'banker-operational',
    correctFutureAudience: 'banker-operational',
    replacementOperationalSignal: 'Same as crmCommandCenterViewModel.ts.',
    migrationPhase: 'phase-8-crm-presentation',
  },
  {
    file: 'src/crm/commandCenter/CrmWorkspaceEntryCard.tsx',
    componentOrModel: 'CrmWorkspaceEntryCard',
    visibleCopy: '"Review source-of-truth, matching, sync preview, and dry-run posture."',
    occurrenceCount: 1,
    triggeringSource: 'static subtitle string',
    currentAudience: 'banker-operational',
    correctFutureAudience: 'banker-operational',
    replacementOperationalSignal: 'Same as crmCommandCenterViewModel.ts.',
    migrationPhase: 'phase-8-crm-presentation',
  },
  {
    file: 'src/crm/commandCenter/CrmCommandCenterRoute.tsx',
    componentOrModel: 'CrmCommandCenterRoute',
    visibleCopy: '"Unified CRM readiness — the live identity-gated CRM Hub and the flag-gated spine, one story."',
    occurrenceCount: 1,
    triggeringSource: 'static subtitle string',
    currentAudience: 'banker-operational',
    correctFutureAudience: 'banker-operational',
    replacementOperationalSignal:
      'Phase 8 copy fix done. Phase 12 closed a separate leak on this same file: it rendered ' +
      'deriveUnifiedCrmReadiness()\'s full 10-dimension model — including "certification-attribution," a ' +
      'release/launch-evidence fact — to every workspace (banker/team/manager/admin alike). Added an ' +
      '`audience` prop (default \'team\'); only audience==="admin" now sees that dimension, wired via the ' +
      'admin-only crm-command-center-admin entry in featureSurfaces.tsx. The underlying attribution module ' +
      '(crmCertificationAttribution.ts) also moved src/crm/certification/ -> src/access/ so the import-graph ' +
      'guard (releaseGovernanceRuntimeImportGuard.test.ts) can scan src/crm without breaking the legitimate ' +
      'admin-only consumer (crmTeamReadinessCertification.ts).',
    migrationPhase: 'phase-12-navigation-role-cleanup',
  },
  {
    file: 'src/crm/CrmRelationshipDetailCards.tsx',
    componentOrModel: 'CrmRelationshipDetailCards (PROVENANCE / SECTION_SOURCE_FACT)',
    visibleCopy:
      '"Every value below is derived from the already-authorized deal row via the 189B view-model and gated by the 189E readiness audit — no new CRM lookup is performed."',
    occurrenceCount: 7,
    triggeringSource: 'static PROVENANCE / SECTION_SOURCE_FACT constants (contain internal phase codes 189B/189E)',
    currentAudience: 'banker-operational',
    correctFutureAudience: 'banker-operational',
    replacementOperationalSignal: 'Plain provenance language with no internal phase-code references. See Phase 8/13.',
    migrationPhase: 'phase-8-crm-presentation',
  },
  {
    file: 'src/crm/workspace/CrmHubWorkspace.tsx',
    componentOrModel: 'CrmHubWorkspace',
    visibleCopy: '"Editing is governed: identity-gated, allow-listed, and audited."',
    occurrenceCount: 1,
    triggeringSource: 'static footer copy',
    currentAudience: 'banker-operational',
    correctFutureAudience: 'banker-operational',
    replacementOperationalSignal: '"Editing is authorized and audited" — drop "gated" as a user-visible adjective. See Phase 8.',
    migrationPhase: 'phase-8-crm-presentation',
  },
  {
    file: 'src/crm/CrmActivityTimeline.tsx',
    componentOrModel: 'CrmActivityTimeline',
    visibleCopy: '"Live activity logging is gated by the persistence adapter."',
    occurrenceCount: 1,
    triggeringSource: 'persistence adapter availability check',
    currentAudience: 'banker-operational',
    correctFutureAudience: 'banker-operational',
    replacementOperationalSignal: '"Activity logging is temporarily unavailable" (OperationalCapabilityState). See Phase 8.',
    migrationPhase: 'phase-8-crm-presentation',
  },
  {
    file: 'src/crm/writeback/CrmDryRunWritebackCommandCenter.tsx',
    componentOrModel: 'CrmDryRunWritebackCommandCenter',
    visibleCopy: '"Dry-run only. No live Salesforce or nCino writes."',
    occurrenceCount: 6,
    triggeringSource: 'entirely dormant — listed in src/navigation/intentionallyUnrouted.ts, not mounted anywhere',
    currentAudience: 'developer-test-only',
    correctFutureAudience: 'admin-platform-operations',
    replacementOperationalSignal: 'If ever mounted, belongs under Admin Platform Operations only, never a banker/manager route. See Phase 4.',
    migrationPhase: 'no-change-orphaned-unrouted',
  },
  {
    file: 'src/crm/CrmSpineRecoveryConsole.tsx',
    componentOrModel: 'CrmSpineRecoveryConsole',
    visibleCopy: '"Operator cockpit — inspect / plan / dry-run apply, with gated live apply"',
    occurrenceCount: 4,
    triggeringSource: 'entirely dormant — listed in src/navigation/intentionallyUnrouted.ts, not mounted anywhere',
    currentAudience: 'developer-test-only',
    correctFutureAudience: 'admin-platform-operations',
    replacementOperationalSignal: 'Same as CrmDryRunWritebackCommandCenter.tsx — Admin Platform Operations only if ever mounted.',
    migrationPhase: 'no-change-orphaned-unrouted',
  },

  // ---------------------------------------------------------------------
  // Manager-facing (parallels the banker command center exactly).
  // ---------------------------------------------------------------------
  {
    file: 'src/manager/managerOperatingCommandCenterModel.ts',
    componentOrModel: 'deriveManagerOperatingCommandCenterModel',
    visibleCopy:
      '"Do not treat gated create/writeback/send/boarding controls as enabled until admin certification clears them." / raw supervisionAnchors id "manager-workflow-launch-readiness"',
    occurrenceCount: 14,
    triggeringSource: 'same global flags as bankerOperatingCommandCenterModel.ts',
    currentAudience: 'manager-operational',
    correctFutureAudience: 'manager-operational',
    replacementOperationalSignal:
      'Phase 14 — pipeline-supervision and banker-workload now show real team-scoped counts (deal/at-risk/' +
      'blocked totals, active-banker + flagged-deal counts) instead of a static "Active" label. crm-coverage ' +
      'and workflow-bottlenecks remain a plain availability label (no cheap live count exists yet without a ' +
      'new query — left honest rather than fabricated). The five live-write domains (new-deal-intake, ' +
      'document-readiness, crm-writeback, borrower-communication, portfolio-boarding) stay intentionally ' +
      'flag-driven so `state` never disagrees with the cross-panel launch-coherence authority — see the ' +
      'per-domain Phase 9/10/11 comments in the source for why each is safe as-is.',
    migrationPhase: 'phase-14-operational-dashboard-redesign',
  },
  {
    file: 'src/manager/ManagerOperatingCommandCenter.tsx',
    componentOrModel: 'ManagerOperatingCommandCenter',
    visibleCopy: 'raw Badge text {domain.state} rendering the literal token "gated" / "operational" / "review"',
    occurrenceCount: 10,
    triggeringSource: 'deriveManagerOperatingCommandCenterModel()',
    currentAudience: 'manager-operational',
    correctFutureAudience: 'manager-operational',
    replacementOperationalSignal:
      'Phase 14 — fixed. The Badge now renders MANAGER_OPERATING_DOMAIN_STATE_LABEL (a friendly word: ' +
      '"Live" / "Review needed" / "Pending certification"), never the raw ManagerOperatingDomainState ' +
      'union member. The pipeline-supervision and banker-workload domains also now show real team-scoped ' +
      'counts (deal/at-risk/blocked totals, active banker + flagged-deal counts) sourced from ' +
      'ManagerDataProvider\'s already-loaded teamPipeline/teamBankers, replacing the static "Active" ' +
      'placeholder. The CardFooter certifications no longer print raw flag names with a literal ": ' +
      'true"/": false" suffix.',
    migrationPhase: 'phase-14-operational-dashboard-redesign',
  },
  {
    file: 'src/workspaces/ManagerWorkspace.tsx',
    componentOrModel: 'ManagerWorkspace (mounts ManagerWorkflowLaunchReadinessPanel)',
    visibleCopy: 'panel literally titled "Launch Readiness"',
    occurrenceCount: 1,
    triggeringSource: 'src/workflow/ManagerWorkflowLaunchReadinessPanel.tsx (outside the 7 scanned dirs — flagged for follow-up read in Phase 3)',
    currentAudience: 'manager-operational',
    correctFutureAudience: 'admin-platform-operations',
    replacementOperationalSignal: 'Move this panel (or its live-relevant parts) out of the manager workspace entirely. See Phase 3/4.',
    migrationPhase: 'phase-3-banker-dashboard',
  },

  // ---------------------------------------------------------------------
  // Admin — already the correct audience. Cataloged, no audience change
  // needed; only the internal cross-links from banker/manager surfaces
  // (above) need to stop assuming the banker/manager can read this state.
  // ---------------------------------------------------------------------
  {
    file: 'src/shared/readiness/v1ActivationReadinessModel.ts',
    componentOrModel: 'buildV1ActivationReadiness (consumed only by V1ActivationReadinessPanel.tsx)',
    visibleCopy: '"GATED" / "ENABLED" / "New Deal create pilot"',
    occurrenceCount: 9,
    triggeringSource: 'CapabilityStatus = \'ENABLED\' | \'GATED\'',
    currentAudience: 'admin-platform-operations',
    correctFutureAudience: 'admin-platform-operations',
    replacementOperationalSignal: 'None needed for audience — already admin-only. Fold into Platform Operations > Feature Activation. See Phase 4.',
    migrationPhase: 'no-change-already-admin-scoped',
  },
  {
    file: 'src/admin/releaseGovernanceSnapshot.ts',
    componentOrModel: 'deriveReleaseGovernanceSnapshot (+ FullSystemLaunchReadinessConsole.tsx)',
    visibleCopy: '"CRM writeback remains gated." / "Workflow writes remain gated."',
    occurrenceCount: 55,
    triggeringSource: 'static, offline, governance-constant-derived (no live Dataverse read)',
    currentAudience: 'admin-platform-operations',
    correctFutureAudience: 'admin-platform-operations',
    replacementOperationalSignal:
      'Done — renamed from fullSystemLaunchReadinessModel.ts (deriveFullSystemLaunchReadiness -> ' +
      'deriveReleaseGovernanceSnapshot). Was already admin-only; releaseGovernanceRuntimeImportGuard.test.ts ' +
      'now enforces it (plus the retired name) is never imported by src/banker, src/manager, src/deals, ' +
      'src/portfolioBoarding, or src/portfolio.',
    migrationPhase: 'no-change-already-admin-scoped',
  },
  {
    file: 'src/admin/fullActivationLaunchCertificationModel.ts',
    componentOrModel: 'deriveFullActivationLaunchCertification (+ FullSystemActivationLaunchPanel.tsx)',
    visibleCopy: '"Full System Activation Launch Certification" / CERTIFIABLE_NOW / "Full launch achieved"',
    occurrenceCount: 69,
    triggeringSource: 'static, offline, governance-constant-derived',
    currentAudience: 'admin-platform-operations',
    correctFutureAudience: 'admin-platform-operations',
    replacementOperationalSignal: 'Fold into Platform Operations > Feature Activation report. See Phase 4/5.',
    migrationPhase: 'phase-5-retire-launch-readiness',
  },
  {
    file: 'src/admin/v1GoLiveReleaseCertificationModel.ts',
    componentOrModel: 'deriveV1GoLiveReleaseCertification (+ V1GoLiveReleaseCertificationPanel.tsx)',
    visibleCopy: '"V1.0 Go-Live Release Certification" / Badge value "gated"',
    occurrenceCount: 42,
    triggeringSource: 'static, offline, governance-constant-derived',
    currentAudience: 'admin-platform-operations',
    correctFutureAudience: 'admin-platform-operations',
    replacementOperationalSignal: 'Fold into Platform Operations > Feature Activation report. See Phase 4/5.',
    migrationPhase: 'phase-5-retire-launch-readiness',
  },
  {
    file: 'src/admin/eliteCrmLosActivationReadinessModel.ts',
    componentOrModel: 'buildEliteCrmLosActivationReadiness (+ EliteCrmLosActivationReadinessPanel.tsx)',
    visibleCopy: '"Gated readiness"',
    occurrenceCount: 23,
    triggeringSource: 'static, offline, governance-constant-derived',
    currentAudience: 'admin-platform-operations',
    correctFutureAudience: 'admin-platform-operations',
    replacementOperationalSignal: 'Fold into Platform Operations > Feature Activation report. See Phase 4/5.',
    migrationPhase: 'phase-5-retire-launch-readiness',
  },
  {
    file: 'src/admin/ogbCrmWorkflowActivationModel.ts',
    componentOrModel: 'deriveOgbCrmWorkflowActivation (+ OgbCrmWorkflowActivationPanel.tsx)',
    visibleCopy: '"enabled (pilot-only)" / "gated"',
    occurrenceCount: 26,
    triggeringSource: 'static, offline, governance-constant-derived',
    currentAudience: 'admin-platform-operations',
    correctFutureAudience: 'admin-platform-operations',
    replacementOperationalSignal: 'Fold into Platform Operations > Feature Activation report. See Phase 4/5.',
    migrationPhase: 'phase-5-retire-launch-readiness',
  },
  {
    file: 'src/admin/controlledLiveCutoverReadiness.ts',
    componentOrModel: 'controlledLiveCutoverReadiness',
    visibleCopy: '"Record a controlled CRM single-record writeback smoke with rollback evidence, then flip CRM_LIVE_PERSISTENCE_ENABLED..."',
    occurrenceCount: 23,
    triggeringSource: 'static, offline, governance-constant-derived',
    currentAudience: 'admin-platform-operations',
    correctFutureAudience: 'admin-platform-operations',
    replacementOperationalSignal: 'Platform Operations > Smoke Evidence + Feature Activation. See Phase 4.',
    migrationPhase: 'no-change-already-admin-scoped',
  },
  {
    file: 'src/admin/fullProductionLaunchEvidence.ts',
    componentOrModel: 'fullProductionLaunchEvidence',
    visibleCopy: '"Phase 227/228A production smoke PASSED; live-controlled via the approved banker pilot (BANKER_CREATE_PILOT_ENABLED)."',
    occurrenceCount: 34,
    triggeringSource: 'static, offline, governance-constant-derived',
    currentAudience: 'admin-platform-operations',
    correctFutureAudience: 'admin-platform-operations',
    replacementOperationalSignal: 'Platform Operations > Smoke Evidence. See Phase 4.',
    migrationPhase: 'no-change-already-admin-scoped',
  },
  {
    file: 'src/admin/emailLiveSmokeTest.ts',
    componentOrModel: 'emailLiveSmokeTest (+ EmailLiveDiagnostics.tsx)',
    visibleCopy: '"OGB LOS Outlook smoke test" / "This is an operator-triggered smoke test..."',
    occurrenceCount: 58,
    triggeringSource: 'admin-triggered diagnostic action',
    currentAudience: 'admin-platform-operations',
    correctFutureAudience: 'admin-platform-operations',
    replacementOperationalSignal: 'Platform Operations > Connector Health. See Phase 4.',
    migrationPhase: 'no-change-already-admin-scoped',
  },
  {
    file: 'src/admin/finalV1ReleaseDecisionModel.ts',
    componentOrModel: 'deriveFinalV1ReleaseDecision',
    visibleCopy: '"Foundation is launch-ready, but one or more evidence/signoff/domain conditions remain unresolved."',
    occurrenceCount: 11,
    triggeringSource: 'static, offline, governance-constant-derived',
    currentAudience: 'admin-platform-operations',
    correctFutureAudience: 'admin-platform-operations',
    replacementOperationalSignal: 'Fold into Platform Operations > Feature Activation report. See Phase 4/5.',
    migrationPhase: 'no-change-already-admin-scoped',
  },
  {
    file: 'src/admin/productionEnvironmentVerification.ts',
    componentOrModel: 'productionEnvironmentVerification',
    visibleCopy: '(74 internal verification-step strings — not fully triaged render-vs-internal; flagged for a follow-up read before Phase 4)',
    occurrenceCount: 74,
    triggeringSource: 'admin diagnostic model',
    currentAudience: 'admin-platform-operations',
    correctFutureAudience: 'admin-platform-operations',
    replacementOperationalSignal: 'Platform Operations > Runtime Capabilities. Needs a dedicated read before folding in. See Phase 4.',
    migrationPhase: 'no-change-already-admin-scoped',
  },
  {
    file: 'src/access/OperatorLaunchConsole.tsx',
    componentOrModel: 'OperatorLaunchConsole (+ operatorLaunchConsoleModel.ts)',
    visibleCopy: '"Operator Launch Console" / "Per-capability gate state, latest smoke, and rollback. Observe-only — no gate is flipped here."',
    occurrenceCount: 2,
    triggeringSource:
      'Mounted (Factory Arc Phase 4) via src/admin/PlatformOperationsWorkspacePanel.tsx inside AdminWorkspace.tsx, fed live by platformOperationsLiveDeps.ts.',
    currentAudience: 'admin-platform-operations',
    correctFutureAudience: 'admin-platform-operations',
    replacementOperationalSignal:
      'Done — this IS the Phase 4 Platform Operations > Runtime Capabilities / Feature Activation / Smoke Evidence / Deployment Version / Audit History surface; consolidated rather than rebuilt, per this entry\'s original note.',
    migrationPhase: 'no-change-already-admin-scoped',
  },
] as const;

/**
 * Every distinct file with at least one flagged occurrence — used by
 * bankerFacingLaunchLanguageGuard.test.ts to build its allowlist. Kept as a
 * flat list separate from the structured entries above because several
 * files below were confirmed as flagged during the Phase 1 scan but did not
 * get a full structured entry yet (internal-only files whose strings were
 * not confirmed to reach a `.tsx` renderer, or files already covered by a
 * sibling entry's `occurrenceCount`) — still worth pinning as "known,
 * inventoried, not yet re-triaged" so a future scan diff is meaningful.
 */
export const INVENTORIED_FILES: readonly string[] = [
  ...new Set([
    ...PRODUCTION_SURFACE_INVENTORY.map((e) => e.file),
    'src/deals/BorrowerSafeStatusPacketModal.tsx',
    'src/deals/AddRequiredDocumentModal.tsx',
    'src/deals/DealStageProgressionCard.tsx',
    'src/deals/bankerCreatePilotConfig.ts',
    'src/deals/bankerNewDealCreateRollout.ts',
    'src/deals/dealOriginationFeatureFlags.ts',
    'src/deals/newDealCreateFeatureFlags.ts',
    'src/deals/documentChecklistUiEnableReadiness.ts',
    'src/deals/documentChecklistUiGenerationAction.ts',
    'src/deals/documentChecklistPilotConfig.ts',
    'src/crm/CrmAccountSurfaces.tsx',
    'src/crm/CrmRollupCards.tsx',
    'src/crm/writeback/crmDryRunWritebackCommandViewModel.ts',
    'src/crm/crmSalesforceSpineLaunchReadiness.ts',
    'src/crm/readiness/unifiedCrmReadiness.ts',
    'src/crm/readiness/crmRoleMountRegistry.ts',
    'src/crm/certification/crmTeamReadinessCertification.ts',
    'src/crm/activation/crmActivationSafety.ts',
    'src/crm/seed/crmCanonicalSeedReadiness.ts',
    'src/crm/connectors/crmConnectorReadiness.ts',
    'src/portfolioBoarding/PortfolioLoanBoardingDetail.tsx',
    // Found by the automated bankerFacingLaunchLanguageGuard.test.ts scan (more exhaustive than
    // the manual Phase 1 sampling above) — real pre-existing occurrences, not newly introduced.
    'src/deals/emailDelivery/emailMode.ts',
    'src/deals/emailDelivery/outlookEmailAdapters.ts',
    'src/deals/emailDelivery/outlookEmailPort.ts',
    'src/deals/newDealCreateAdapter.ts',
    'src/deals/sendBorrowerUpdateEmail.ts',
    'src/deals/sendDocumentRequestEmail.ts',
    'src/portfolioBoarding/portfolioSharePointDocumentAdapters.ts',
    'src/portfolioBoarding/portfolioSharePointDocumentMode.ts',
    'src/portfolioBoarding/portfolioSharePointDocumentPort.ts',
    'src/portfolioBoarding/usePortfolioLoanDocumentPersistence.ts',
    'src/crm/advisors/advisorRoles.ts',
    'src/crm/crmRelationshipHealthModel.ts',
    'src/crm/crmSalesforceSpineSchemaAdapter.ts',
    'src/crm/relationshipIntelligence/CrmRelationshipIntelligenceCockpit.tsx',
    'src/crm/sourceOfTruth/crmSourceOfTruthMap.ts',
    'src/crm/writeback/crmAllowlistedLiveWritePilot.ts',
    'src/workspaces/AdminWorkspace.tsx',
    'src/workspaces/ExecutiveWorkspace.tsx',
    'src/shared/governance/releaseReadiness.ts',
    'src/shared/governance/platformInventory.ts',
    'src/admin/V1ActivationReadinessPanel.tsx',
    'src/admin/V1GoLiveReleaseCertificationPanel.tsx',
    'src/admin/EliteCrmLosActivationReadinessPanel.tsx',
    'src/admin/OgbCrmWorkflowActivationPanel.tsx',
    'src/admin/FullSystemLaunchReadinessConsole.tsx',
    'src/admin/FullSystemActivationLaunchPanel.tsx',
    'src/admin/EmailLiveDiagnostics.tsx',
    'src/admin/adminOperatorActionQueueModel.ts',
    'src/admin/ReleaseReadinessGate.tsx',
    'src/access/operatorLaunchConsoleModel.ts',
    'src/access/finalLaunchSmokeEvidence.ts',
    'src/access/finalLaunchSmokeEvidenceLoader.ts',
    'src/access/committedFinalLaunchEvidence.ts',
    'src/access/operatorSmokeEvidenceRegistry.ts',
    'src/access/stageAdvancementSmokeProof.ts',
  ]),
];
