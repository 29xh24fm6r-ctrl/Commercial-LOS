/**
 * Phase 40: static platform inventory.
 *
 * Single source of truth for what the commercial-lending app has
 * built, deliberately not wired, and intentionally blocked. Consumed
 * by:
 *   - the Release Readiness Gate admin card (no behavior change —
 *     the previously inline constants moved here verbatim);
 *   - the Phase-40 stabilization checklist + release notes docs
 *     (docs/STABILIZATION_CHECKLIST.md + docs/RELEASE_NOTES_PHASES_1_40.md);
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
      'src/shared/governance/stageProgressionAvailability.ts for the future-extension contract.',
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
    label: 'Borrower email delivery (Outlook/Graph)',
    reason:
      'External communication delivery has not been implemented. Phase 23 ' +
      'borrower-update is local-only Copy-to-clipboard. No Outlook/Graph ' +
      'integration. No BorrowerUpdateSent timeline event is ever emitted.',
  },
  {
    id: 'document-upload',
    label: 'Document upload',
    reason:
      'No document upload pipeline exists. Phase 22 only stamps ' +
      'cr664_requestdate on the document checklist row.',
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
