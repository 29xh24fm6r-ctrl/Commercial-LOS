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
];

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
    label: 'Stage progression (Advance Stage write)',
    phase: 28,
    reason:
      'Dataverse schema does not expose a deterministic next-stage ordering. ' +
      'No Cr664_stagereferences service in the generated SDK; no sequence/order ' +
      'field on the loan deal record or in system settings. See ' +
      'src/shared/governance/stageProgressionAvailability.ts for the future-extension contract. ' +
      'See docs/STAGE_PROGRESSION_ENABLEMENT_MAP.md for the concrete unblock checklist.',
    enablementMapPath: 'docs/STAGE_PROGRESSION_ENABLEMENT_MAP.md',
  },
];

// ---------------------------------------------------------------------------
// Not wired (capability is absent in the app today; presence elsewhere is
// out of scope for the current phase set)
// ---------------------------------------------------------------------------

export interface NotWiredEntry {
  id: string;
  label: string;
  reason: string;
}

export const NOT_WIRED: readonly NotWiredEntry[] = [
  {
    id: 'email-delivery',
    label: 'Borrower update email delivery (Outlook/Graph)',
    reason:
      'Phase 23 borrower-update remains local-only Copy-to-clipboard. The ' +
      'banker generates a borrower-safe update preview and pastes it into ' +
      'their own mail client; no Outlook/Graph integration is invoked for ' +
      'that flow and no BorrowerUpdateSent timeline event is ever emitted. ' +
      'Phase 61 wired document-request email delivery as a SEPARATE governed ' +
      'flow (deal-document-request-email in GOVERNED_WRITES) — borrower-' +
      'update delivery would be a distinct future phase with its own ' +
      'outcome union and audit/timeline coordination.',
  },
  {
    id: 'outlook-connector-live-send',
    label: 'Outlook connector LIVE send (Office 365 connector registration)',
    reason:
      'Phase 61 wires the document-request email-send governed write end ' +
      'to end (audit + timeline + outcome union + masked recipient + ' +
      'DRY_RUN/LIVE mode discipline). DRY_RUN operates fully today: the ' +
      'adapter validates inputs and synthesizes "accepted" without a ' +
      'network call. LIVE today returns a permanent-failure with a clear ' +
      '"Office 365 Outlook connector not yet registered" reason — the ' +
      'connector needs to be registered for this Code App and the SDK ' +
      'regenerated, at which point the LIVE adapter swaps in the typed ' +
      'Office365_*Service call. See docs/PHASE_61_OUTLOOK_EMAIL_DELIVERY.md.',
  },
  {
    id: 'document-upload',
    label: 'Document upload (binary file)',
    reason:
      'No binary file upload pipeline exists. The cr664_DocumentChecklist ' +
      'schema has no File column to upload to (and no generated upload ' +
      'service can target what does not exist). The @microsoft/power-apps ' +
      'SDK does expose client.uploadFileToRecord, so the unblock path is ' +
      'schema-side: add a File column on cr664_DocumentChecklist, ' +
      'regenerate the SDK, then wire the in-app upload UI. Phase 22 stamps ' +
      'cr664_requestdate (Request) and Phase 51 stamps cr664_receiveddate ' +
      '(Mark received) — both metadata-only; neither carries a binary. ' +
      'See docs/PHASE_51_DOCUMENT_UPLOAD_SCOPE.md.',
  },
  {
    id: 'ai-generation',
    label: 'AI / model-driven generation',
    reason:
      'No AI/model calls anywhere in the app. Phase 24 credit memo draft is ' +
      'a pure deterministic generator. The "no AI used" line is asserted in ' +
      'the draft preview banner.',
  },
  {
    id: 'test-coverage-build-verification',
    label: 'Test coverage / build verification (in-app)',
    reason:
      'The app has no runtime signal for npm run build or npm test results. ' +
      'CI verification is performed out-of-band; the Release Readiness Gate ' +
      'reports this row as Not Wired by design.',
  },
  {
    id: 'stage-reference-data-source',
    label: 'Stage reference Power Apps data source',
    reason:
      'Cr664_stagereferences is not registered as a Power Apps data source; ' +
      'no typed service exists in src/generated/services/.',
  },
  {
    id: 'stage-ordering-contract',
    label: 'Stage ordering / sequence contract',
    reason:
      'No sequence / order field is exposed on the loan deal record, system ' +
      'settings, or KPI threshold configuration.',
  },
  {
    id: 'executive-deal-drillthrough',
    label: 'Executive /deals/:id drill-through',
    reason:
      'Executive workspace is snapshot-only by design (Phase 15). Deal ' +
      'drill-through from the executive surface requires a separate ' +
      'governance decision.',
  },
  {
    id: 'admin-deal-drillthrough',
    label: 'Admin /deals/:id drill-through',
    reason:
      'Admin operational deal drill-through is a separate governance ' +
      'decision; intentionally not wired through DealRoute.',
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
    label: 'Borrower update draft',
    phase: 23,
    note:
      'Generate-and-copy only. No Dataverse write. No BorrowerUpdateSent ' +
      'timeline event emitted. Banker manually pastes into a mail client.',
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
      'Phase 28 schema gap — Cr664_stagereferences not registered as a Power Apps data source and no sequence/order field is exposed on the loan deal record. The Phase 41 catalog provides canonical lifecycle metadata + governance predicates, but does NOT enable the Advance Stage write. See docs/STAGE_GOVERNANCE.md and src/shared/governance/stageProgressionAvailability.ts.',
  },
});
