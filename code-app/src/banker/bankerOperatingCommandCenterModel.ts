export interface BankerOperatingCommandCenterModel {
  readonly title: string;
  readonly posture: string;
  readonly dealCockpitAnchors: readonly string[];
}

/**
 * Factory Arc Phase 2/3 — banker operating layer identity.
 *
 * Prior to this phase, this module also derived a `domains` array of
 * per-capability "operational / review / gated" pills sourced directly from
 * global feature-flag constants (BANKER_NEW_DEAL_CREATE_ENABLED,
 * DOCUMENT_CHECKLIST_GENERATION_ENABLED, etc.) and a `certifications` array
 * of raw boolean strings — release-governance concepts, not operational
 * ones, presented as if they were live per-banker state. That machinery is
 * retired: BankerOperatingCommandCenter.tsx's "System status" pill strip is
 * gone (replaced by live Portfolio & Workflow Health metrics derived from
 * the banker's own deals — see BankerOperatingCommandCenter.tsx), and this
 * module has nothing left to inject a capability-availability adapter INTO,
 * because it no longer models per-capability gate/certification state at
 * all. releaseGovernanceRuntimeImportGuard.test.ts enforces that this file
 * (and every other file under src/banker, src/manager, src/deals,
 * src/portfolioBoarding) never re-imports a release-governance model to
 * rebuild that concept.
 *
 * What remains is pure identity/navigation data: the command center's
 * title, its one-line posture statement, and the deal-cockpit anchor ids it
 * points bankers to instead of inventing a parallel workflow — still
 * pinned by bankerOperatingCommandCenterModel.test.ts and
 * phase232BankerOperatingSurfaceActivation.test.ts.
 */
export function deriveBankerOperatingCommandCenterModel(): BankerOperatingCommandCenterModel {
  return {
    title: 'Banker Operating Command Center',
    posture:
      'Operate from CRM, your active deal workflow, daily actions, and each deal’s readiness — live create, stage advancement, borrower send, checklist generation, and portfolio boarding are available where authorized and governed by audited writes.',
    dealCockpitAnchors: ['stage-map', 'workstreams', 'crm-relationship', 'credit-memo', 'tasks', 'documents'],
  };
}
