/**
 * Phase 189H — Manager/Team CRM detail MOUNT readiness audit.
 *
 * Pure, READ-ONLY. No IO, no Dataverse call, no SDK/client import, no React. It
 * audits — but does NOT perform — whether the existing read-only CRM
 * relationship surface (the 189C panel + 189F/G detail cards) could safely be
 * mounted into the Manager and Team deal workspaces, given each host's existing
 * authorization and provider context.
 *
 * This phase mounts NOTHING. `BankerDealWorkspace` remains the ONLY active
 * `DealCrmRelationshipPanel` mount. The audit reports which non-banker surfaces
 * are technically mount-capable today and which are blocked, so a future,
 * explicitly-decided enablement can act on proven facts instead of re-deriving
 * safety in the host workspaces.
 *
 * Honesty rules (pinned by tests):
 *   - The CRM relationship surface is read-only everywhere; mounting it never
 *     introduces a write affordance, so read-only posture is an invariant, not a
 *     per-host variable.
 *   - A non-banker host is mount-CAPABLE only when it already resolves the
 *     deal context the panel consumes (`useDealData` via `DealDataProvider`) AND
 *     that deal was loaded under an authorized, role-scoped loader (no new CRM
 *     query, no broadened visibility).
 *   - A missing banker context does NOT block a mount: the panel reads the
 *     assigned banker through `useOptionalBanker` and degrades honestly to the
 *     authorized deal row's lookup ids. It is recorded as a degradation only.
 *   - Mount capability never implies a mount. Every capable non-banker surface
 *     stays UNMOUNTED this phase; the banker-only active-mount invariant holds.
 *   - A manager/team mount must NEVER broaden CRM visibility beyond the
 *     team-scoped deal already authorized to that host, and must NEVER fabricate
 *     contacts, org hierarchy, roles, activities, timeline, or communication
 *     preferences — these are listed as explicitly rejected unsafe assumptions.
 */

import { CRM_LIVE_PERSISTENCE_ENABLED } from './crmFeatureFlags';

export type CrmMountReadinessStatus = 'ready' | 'partial' | 'blocked';

export type CrmDealWorkspaceSurfaceKind = 'banker' | 'manager' | 'team';

export interface CrmMountSurfaceInput {
  surface: CrmDealWorkspaceSurfaceKind;
  label?: string;
  /** Does this workspace already mount DealCrmRelationshipPanel today? */
  currentlyMountsCrmPanel: boolean;
  /** Does it wrap deal content in DealDataProvider so `useDealData` resolves? */
  providesDealData: boolean;
  /** Does it expose a banker context for `useOptionalBanker`? (optional) */
  providesBankerContext: boolean;
  /** Was the deal loaded under an authorized, role-scoped loader (no new query)? */
  authorizedDealLoad: boolean;
  /** Authorization scope label, e.g. 'deal-owner', 'team-scoped'. */
  authorizationScope: string;
}

export interface CrmManagerTeamMountReadinessInput {
  surfaces: CrmMountSurfaceInput[];
  /** Defaults to the build-time CRM_LIVE_PERSISTENCE_ENABLED flag (false). */
  liveCrmPersistenceEnabled?: boolean;
}

export interface CrmMountSurfaceAssessment {
  surface: CrmDealWorkspaceSurfaceKind;
  label: string;
  /** Technically capable of hosting the read-only CRM surface today. */
  mountCapable: boolean;
  /** Already the active mount (true only for the banker workspace). */
  isActiveMount: boolean;
  /** Will this audit mount it this phase? Always false — audit only. */
  mountedThisPhase: false;
  reason: string;
  satisfiedPrerequisites: string[];
  missingPrerequisites: string[];
  /** Non-blocking caveats (e.g. no banker context → assigned-banker fallback). */
  degradations: string[];
}

export interface CrmMountBlockedSurface {
  surface: CrmDealWorkspaceSurfaceKind;
  reason: string;
}

export interface CrmUnsafeMountAssumption {
  assumption: string;
  reason: string;
}

export type CrmMountActionKind =
  | 'preserve_active_mount_invariant'
  | 'defer_capable_mount'
  | 'resolve_blocked_prerequisite';

export interface CrmMountNextAction {
  priority: number;
  kind: CrmMountActionKind;
  action: string;
}

export interface CrmManagerTeamMountReadiness {
  readinessStatus: CrmMountReadinessStatus;

  // Safety literals — this audit performs no writes and mounts nothing.
  readOnly: true;
  newMountsAdded: false;
  bankerRemainsOnlyActiveMount: true;
  liveCrmPersistenceEnabled: boolean;

  activeMountSurfaces: CrmDealWorkspaceSurfaceKind[];
  mountCapableSurfaces: CrmDealWorkspaceSurfaceKind[];
  blockedSurfaces: CrmMountBlockedSurface[];
  surfaceAssessments: CrmMountSurfaceAssessment[];
  missingPrerequisites: string[];
  unsafeAssumptionsRejected: CrmUnsafeMountAssumption[];
  nextActions: CrmMountNextAction[];
  sourceFacts: string[];
}

// Things a manager/team CRM mount must NEVER do or invent. Listed explicitly so
// the audit rejects them rather than letting a future mount quietly assume them.
const REJECTED_ASSUMPTIONS: ReadonlyArray<CrmUnsafeMountAssumption> = Object.freeze([
  { assumption: 'broadened_crm_visibility', reason: 'A manager/team mount must stay within the team-scoped deal already authorized to that host; it must not widen CRM data with a new or org-wide query.' },
  { assumption: 'cross_team_contacts', reason: 'No contacts outside the authorized deal are reachable; cross-team contact surfacing must not be inferred.' },
  { assumption: 'manager_write_affordances', reason: 'The CRM relationship surface is read-only; a manager/team mount must not add a write button, form, or action handler.' },
  { assumption: 'contacts', reason: 'No contact records are reachable from the authorized deal row; the spine is not seeded.' },
  { assumption: 'organization_hierarchy', reason: 'No org/parent hierarchy exists for cr664_clientrelationship; nothing to infer.' },
  { assumption: 'relationship_roles', reason: 'No role-assignment records exist; roles must not be inferred from a single lookup.' },
  { assumption: 'activities', reason: 'No CRM activity records are reachable; activities must not be synthesized.' },
  { assumption: 'timeline_events', reason: 'No CRM timeline entity is seeded; timeline events must not be fabricated.' },
  { assumption: 'communication_preferences', reason: 'No communication-preference records exist; preferences must not be assumed.' },
]);

function defaultLabel(surface: CrmDealWorkspaceSurfaceKind): string {
  switch (surface) {
    case 'banker':
      return 'Banker deal workspace';
    case 'manager':
      return 'Manager deal workspace';
    case 'team':
      return 'Team deal workspace';
  }
}

function assessSurface(input: CrmMountSurfaceInput): CrmMountSurfaceAssessment {
  const label = input.label ?? defaultLabel(input.surface);
  const isActiveMount = input.surface === 'banker' && input.currentlyMountsCrmPanel;

  const satisfied: string[] = [];
  const missing: string[] = [];
  const degradations: string[] = [];

  // The two hard prerequisites for hosting the read-only CRM surface.
  if (input.providesDealData) {
    satisfied.push('providesDealData (useDealData resolves via DealDataProvider)');
  } else {
    missing.push('providesDealData (DealDataProvider must wrap the panel for useDealData)');
  }

  if (input.authorizedDealLoad) {
    satisfied.push(`authorizedDealLoad (${input.authorizationScope}; no new CRM query)`);
  } else {
    missing.push('authorizedDealLoad (deal must be loaded under an authorized, role-scoped loader)');
  }

  // Banker context is optional: the panel uses useOptionalBanker and degrades
  // to the authorized deal row's lookup ids when absent.
  if (!input.providesBankerContext) {
    degradations.push(
      'No banker context (useOptionalBanker) — the assigned-banker fallback is lost; the panel uses the authorized deal row lookup ids only.',
    );
  }

  const mountCapable = input.providesDealData && input.authorizedDealLoad;

  let reason: string;
  if (isActiveMount) {
    reason = 'Active CRM panel mount today; the read-only surface already renders here under deal-owner authorization.';
  } else if (mountCapable) {
    reason = `Technically mount-capable (deal context + ${input.authorizationScope} authorization), but deliberately NOT mounted this phase — banker remains the only active mount.`;
  } else {
    reason = `Blocked: missing ${missing.join('; ')}.`;
  }

  return {
    surface: input.surface,
    label,
    mountCapable,
    isActiveMount,
    mountedThisPhase: false,
    reason,
    satisfiedPrerequisites: satisfied,
    missingPrerequisites: missing,
    degradations,
  };
}

export function deriveCrmManagerTeamMountReadiness(
  input: CrmManagerTeamMountReadinessInput,
): CrmManagerTeamMountReadiness {
  const liveCrmPersistenceEnabled =
    input.liveCrmPersistenceEnabled ?? CRM_LIVE_PERSISTENCE_ENABLED;

  const assessments = input.surfaces.map(assessSurface);

  const activeMountSurfaces = assessments
    .filter((a) => a.isActiveMount)
    .map((a) => a.surface);
  const sourceFacts: string[] = [];
  sourceFacts.push(
    activeMountSurfaces.length === 1 && activeMountSurfaces[0] === 'banker'
      ? 'BankerDealWorkspace is the only active DealCrmRelationshipPanel mount.'
      : `Active CRM panel mounts: ${activeMountSurfaces.join(', ') || 'none'}.`,
  );

  // Candidates this audit is about: the non-banker (manager/team) surfaces.
  const candidates = assessments.filter((a) => !a.isActiveMount);

  const mountCapableSurfaces = candidates
    .filter((a) => a.mountCapable)
    .map((a) => a.surface);
  const blockedSurfaces = candidates
    .filter((a) => !a.mountCapable)
    .map((a) => ({ surface: a.surface, reason: a.reason }));

  const missingPrerequisites = Array.from(
    new Set(candidates.flatMap((a) => a.missingPrerequisites)),
  );

  for (const a of candidates) {
    sourceFacts.push(
      a.mountCapable
        ? `${a.label}: mount-capable but unmounted (audit only).`
        : `${a.label}: blocked — ${a.missingPrerequisites.join('; ')}.`,
    );
  }

  // --- readiness status over the manager/team candidates -------------------
  let readinessStatus: CrmMountReadinessStatus;
  if (candidates.length === 0 || candidates.every((a) => !a.mountCapable)) {
    readinessStatus = 'blocked';
  } else if (candidates.every((a) => a.mountCapable)) {
    readinessStatus = 'ready';
  } else {
    readinessStatus = 'partial';
  }

  // --- next actions: preserve the invariant, defer capable mounts ----------
  const nextActions: CrmMountNextAction[] = [];
  let priority = 1;
  nextActions.push({
    priority: priority++,
    kind: 'preserve_active_mount_invariant',
    action: 'Keep BankerDealWorkspace as the only active DealCrmRelationshipPanel mount; this audit adds no mount.',
  });
  for (const b of blockedSurfaces) {
    nextActions.push({
      priority: priority++,
      kind: 'resolve_blocked_prerequisite',
      action: `Resolve "${b.surface}" before any mount: ${b.reason}`,
    });
  }
  if (mountCapableSurfaces.length > 0) {
    nextActions.push({
      priority: priority++,
      kind: 'defer_capable_mount',
      action: `Defer: ${mountCapableSurfaces.join(', ')} ${mountCapableSurfaces.length === 1 ? 'is' : 'are'} mount-capable but a manager/team CRM mount requires an explicit, separate enablement decision — not part of this phase.`,
    });
  }

  return {
    readinessStatus,
    readOnly: true,
    newMountsAdded: false,
    bankerRemainsOnlyActiveMount: true,
    liveCrmPersistenceEnabled,
    activeMountSurfaces,
    mountCapableSurfaces,
    blockedSurfaces,
    surfaceAssessments: assessments,
    missingPrerequisites,
    unsafeAssumptionsRejected: REJECTED_ASSUMPTIONS.map((a) => ({ ...a })),
    nextActions,
    sourceFacts,
  };
}

/**
 * The canonical, real-codebase surface descriptors as of Phase 189H:
 *   - banker: BankerDealWorkspace mounts the panel (deal-owner authorization,
 *     DealDataProvider + banker context present).
 *   - manager: ManagerDealWorkspace loads via loadDealForManager (team-scoped),
 *     wraps content in DealDataProvider, but exposes no banker context.
 *   - team: TeamDealWorkspace loads via loadDealForTeam (team-scoped), wraps
 *     content in DealDataProvider, but exposes no banker context.
 */
export const KNOWN_CRM_MOUNT_SURFACES: ReadonlyArray<CrmMountSurfaceInput> = Object.freeze([
  {
    surface: 'banker',
    currentlyMountsCrmPanel: true,
    providesDealData: true,
    providesBankerContext: true,
    authorizedDealLoad: true,
    authorizationScope: 'deal-owner',
  },
  {
    surface: 'manager',
    currentlyMountsCrmPanel: false,
    providesDealData: true,
    providesBankerContext: false,
    authorizedDealLoad: true,
    authorizationScope: 'team-scoped',
  },
  {
    surface: 'team',
    currentlyMountsCrmPanel: false,
    providesDealData: true,
    providesBankerContext: false,
    authorizedDealLoad: true,
    authorizationScope: 'team-scoped',
  },
]);

/** Audit the known real surfaces with no arguments. */
export function auditCrmManagerTeamMountReadiness(): CrmManagerTeamMountReadiness {
  return deriveCrmManagerTeamMountReadiness({
    surfaces: KNOWN_CRM_MOUNT_SURFACES.map((s) => ({ ...s })),
  });
}
