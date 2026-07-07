/**
 * Phase 189E — CRM relationship DETAIL readiness audit.
 *
 * Pure, READ-ONLY. No IO, no Dataverse call, no SDK/client import. Given the
 * already-authorized relationship graph (the 189D-enriched
 * `CrmRelationshipGraphInput`: real lookup ids + per-edge classifications), it
 * assesses which detail surfaces are SAFE to render before any richer CRM
 * detail UI is built or the Salesforce-style spine is seeded.
 *
 * Honesty rules (pinned by tests):
 *   - A detail section is safe ONLY when its required record id is present, is a
 *     REAL id (not a `name:` surrogate), and its edge classified `real-lookup`.
 *   - A name-only surrogate client cannot support record-detail drilldown.
 *   - A missing client blocks CRM detail readiness entirely.
 *   - The future Salesforce-style spine stays not seeded / not wired.
 *   - Contacts, org hierarchy, relationship roles, activities, timeline events,
 *     and communication preferences are NEVER inferred — they are listed as
 *     explicitly rejected unsafe assumptions.
 */

import { CRM_LIVE_PERSISTENCE_ENABLED } from './crmFeatureFlags';
import { CRM_NAME_REF_PREFIX } from './buildCrmRelationshipInput';
import type { CrmRelationshipGraphInput } from './crmRelationshipViewModel';

export type CrmDetailReadinessStatus = 'ready' | 'partial' | 'blocked';

export type CrmDetailSectionKey =
  | 'clientIdentity'
  | 'teamOwnership'
  | 'assignedBanker'
  | 'platformWorkspaceBridge'
  | 'relationshipIntegrity'
  | 'salesforceSpine';

/**
 * The nature of a detail section, which decides whether its absence is a true
 * blocker or an expected/optional gap:
 *   - required : must be present; its absence BLOCKS CRM detail (only the
 *                canonical client qualifies).
 *   - degraded : actionable/expected-incomplete (team, assigned banker); its
 *                absence degrades (partial), it never blocks.
 *   - optional : may legitimately be absent (platform/workspace bridge);
 *                displayed as OPTIONAL / NOT PROVIDED, never blocked.
 *   - deferred : intentionally not built/seeded yet (Salesforce-style spine);
 *                displayed as DEFERRED / NOT SEEDED / NOT WIRED, never blocked.
 */
export type CrmDetailSectionRequirement = 'required' | 'degraded' | 'optional' | 'deferred';

/**
 * The rendered state of a detail section. `blocked` is reserved for a REQUIRED
 * section that is missing; optional/deferred sections get their own honest
 * states so they never read as an app failure.
 */
export type CrmDetailSectionState = 'safe' | 'blocked' | 'degraded' | 'optional' | 'deferred';

export interface CrmDetailSectionAssessment {
  section: CrmDetailSectionKey;
  label: string;
  /** True only when the section can render a real record-detail surface. */
  safe: boolean;
  /** Whether the section is required / degraded / optional / deferred. */
  requirement: CrmDetailSectionRequirement;
  /** Rendered state: safe | blocked (required-missing) | degraded | optional | deferred. */
  state: CrmDetailSectionState;
  reason: string;
  /** Ids this section needs to render a real record-detail surface. */
  requiredIds: string[];
  /** Of the required ids, which were present AND real (non-surrogate). */
  presentRealIds: string[];
}

export interface CrmDetailSectionNote {
  section: CrmDetailSectionKey;
  reason: string;
}

/** @deprecated shape alias — a truly BLOCKED (required-missing) section. */
export type CrmBlockedDetailSection = CrmDetailSectionNote;

export interface CrmUnsafeAssumption {
  assumption: string;
  reason: string;
}

export type CrmReadinessActionKind =
  | 'render_safe_detail'
  | 'resolve_blocked_section'
  | 'defer_spine_seed';

export interface CrmReadinessNextAction {
  priority: number;
  kind: CrmReadinessActionKind;
  action: string;
}

export interface CrmRelationshipDetailReadiness {
  readinessStatus: CrmDetailReadinessStatus;

  // Safety booleans (literal — this audit performs no writes).
  readOnly: true;
  spineSeeded: false;
  liveSpinePersistenceEnabled: boolean;

  safeDetailSections: CrmDetailSectionKey[];
  /** ONLY required sections that are missing (i.e. the canonical client). */
  blockedDetailSections: CrmBlockedDetailSection[];
  /** Actionable/expected-incomplete sections (team, assigned banker). */
  degradedDetailSections: CrmDetailSectionNote[];
  /** Legitimately-absent optional sections (platform/workspace bridge). */
  optionalDetailSections: CrmDetailSectionNote[];
  /** Intentionally not-yet-built sections (Salesforce-style spine). */
  deferredDetailSections: CrmDetailSectionNote[];
  sectionAssessments: CrmDetailSectionAssessment[];
  missingInputs: string[];
  unsafeAssumptionsRejected: CrmUnsafeAssumption[];
  nextActions: CrmReadinessNextAction[];
  sourceFacts: string[];
}

// Detail surfaces that can NEVER be derived from authorized deal lookup ids
// alone. Listed explicitly so the audit rejects them rather than fabricating.
const REJECTED_ASSUMPTIONS: ReadonlyArray<CrmUnsafeAssumption> = Object.freeze([
  { assumption: 'contacts', reason: 'No contact records are reachable from deal lookup ids; the spine is not seeded.' },
  { assumption: 'organization_hierarchy', reason: 'No org/parent hierarchy exists for cr664_clientrelationship; nothing to infer.' },
  { assumption: 'relationship_roles', reason: 'No role-assignment records exist; roles must not be inferred from a single lookup.' },
  { assumption: 'activities', reason: 'No CRM activity records are reachable; activities must not be synthesized.' },
  { assumption: 'timeline_events', reason: 'No CRM timeline entity is seeded; timeline events must not be fabricated.' },
  { assumption: 'communication_preferences', reason: 'No communication-preference records exist; preferences must not be assumed.' },
]);

function isRealId(id: string | null | undefined): boolean {
  return typeof id === 'string' && id.length > 0 && !id.startsWith(CRM_NAME_REF_PREFIX);
}

export function deriveCrmRelationshipDetailReadiness(
  input: CrmRelationshipGraphInput,
): CrmRelationshipDetailReadiness {
  const sourceFacts: string[] = [];
  const missingInputs: string[] = [];
  const assessments: CrmDetailSectionAssessment[] = [];

  const deal = input.deal ?? null;
  const client = input.client ?? null;
  const team = input.team ?? null;
  const banker = input.assignedBanker ?? null;
  const platformUser = input.platformUser ?? null;

  if (deal) {
    sourceFacts.push(`Anchored on cr664_loandeal(${deal.id}).`);
  } else {
    sourceFacts.push('No Loan Deal anchor supplied.');
  }

  // --- clientIdentity (REQUIRED — the only true blocker) -------------------
  const clientReal = client != null && isRealId(client.id) && client.lookupClassification === 'real-lookup';
  if (!client) {
    missingInputs.push('client.id (cr664_loandeal.cr664_Client)');
    assessments.push(assess('clientIdentity', 'Client identity detail', 'required', 'blocked', ['client.id'],
      'No canonical client is linked to the deal — no client record to detail. Use "Link CRM client" to resolve.'));
  } else if (!clientReal) {
    // The client node EXISTS (name surrogate or unverified edge), so this is a
    // degraded drilldown, NOT a hard block — the overall status stays partial.
    const surrogate = !isRealId(client.id);
    assessments.push(assess('clientIdentity', 'Client identity detail', 'required', 'degraded', ['client.id'],
      surrogate
        ? 'Client is known by name only (name: surrogate id); a record-detail drilldown is not safe.'
        : `Client edge is "${client.lookupClassification ?? 'unknown'}", not a verified real lookup.`));
    sourceFacts.push(
      `Client present by ${surrogate ? 'name only' : 'unverified edge'}; record-detail degraded.`,
    );
  } else {
    assessments.push(assess('clientIdentity', 'Client identity detail', 'required', 'safe', ['client.id'],
      'Real cr664_clientrelationship id with a verified real-lookup edge.'));
    sourceFacts.push(`Client record id ${client.id} is a real lookup — detail safe.`);
  }

  // --- teamOwnership (DEGRADED — actionable, never a hard block) ------------
  const teamReal = team != null && isRealId(team.id) && team.lookupClassification === 'real-lookup';
  if (!team) {
    missingInputs.push('team.id (cr664_loandeal.cr664_Team)');
    assessments.push(assess('teamOwnership', 'Team ownership detail', 'degraded', 'degraded', ['team.id'],
      'Owning-team edge is unset in this context. Use "Assign owning team" to link it.'));
  } else if (!teamReal) {
    assessments.push(assess('teamOwnership', 'Team ownership detail', 'degraded', 'degraded', ['team.id'],
      `Team edge is "${team.lookupClassification ?? 'unknown'}", not a verified real lookup.`));
  } else {
    assessments.push(assess('teamOwnership', 'Team ownership detail', 'degraded', 'safe', ['team.id'],
      'Real cr664_team id with a verified real-lookup edge.'));
    sourceFacts.push(`Team record id ${team.id} is a real lookup — detail safe.`);
  }

  // --- assignedBanker (DEGRADED — actionable, never a hard block) -----------
  const bankerReal = banker != null && isRealId(banker.id) && banker.lookupClassification === 'real-lookup';
  if (!banker) {
    missingInputs.push('assignedBanker.id (cr664_loandeal.cr664_AssignedTo)');
    assessments.push(assess('assignedBanker', 'Assigned banker detail', 'degraded', 'degraded', ['assignedBanker.id'],
      'Assigned-banker edge is unset in this context.'));
  } else if (!bankerReal) {
    assessments.push(assess('assignedBanker', 'Assigned banker detail', 'degraded', 'degraded', ['assignedBanker.id'],
      `Assigned-banker edge is "${banker.lookupClassification ?? 'unknown'}" (e.g. id from workspace context only), not a verified real lookup.`));
  } else {
    assessments.push(assess('assignedBanker', 'Assigned banker detail', 'degraded', 'safe', ['assignedBanker.id'],
      'Real assigned-banker id with a verified real-lookup edge.'));
    sourceFacts.push(`Assigned-banker record id ${banker.id} is a real lookup — detail safe.`);
  }

  // --- platformWorkspaceBridge (OPTIONAL — never blocked) ------------------
  if (platformUser && isRealId(platformUser.id)) {
    assessments.push(assess('platformWorkspaceBridge', 'Platform / workspace bridge', 'optional', 'safe',
      ['platformUser.id'], 'Real platform-user id present; workspace/core-user bridge can render.'));
  } else {
    assessments.push(assess('platformWorkspaceBridge', 'Platform / workspace bridge', 'optional', 'optional',
      ['platformUser.id'],
      'Optional — no platform / workspace bridge is provided for this deal. This surface is not required for CRM relationship detail.'));
  }

  // --- relationshipIntegrity (diagnostic over what we have) ----------------
  if (deal) {
    assessments.push(assess('relationshipIntegrity', 'Relationship integrity diagnostics', 'degraded', 'safe',
      [], 'Edge classifications (real-lookup / unknown / pseudo / missing) are derivable read-only from the supplied graph.'));
  } else {
    assessments.push(assess('relationshipIntegrity', 'Relationship integrity diagnostics', 'degraded', 'degraded',
      [], 'No deal anchor — nothing to diagnose.'));
  }

  // --- salesforceSpine (DEFERRED — not seeded / not wired, never blocked) ---
  assessments.push(assess('salesforceSpine', 'Salesforce-style spine detail', 'deferred', 'deferred', [],
    'Deferred / optional — the cr664_crm* spine is not seeded and not wired; no spine detail can render. It is not required for CRM relationship detail.'));

  const byState = (state: CrmDetailSectionState): CrmDetailSectionNote[] =>
    assessments.filter((a) => a.state === state).map((a) => ({ section: a.section, reason: a.reason }));
  const safeDetailSections = assessments.filter((a) => a.safe).map((a) => a.section);
  // BLOCKED is reserved for required-missing sections only (the canonical
  // client). Team/banker are degraded; platform is optional; spine is deferred.
  const blockedDetailSections = byState('blocked');
  const degradedDetailSections = byState('degraded');
  const optionalDetailSections = byState('optional');
  const deferredDetailSections = byState('deferred');

  // --- readiness status ----------------------------------------------------
  let readinessStatus: CrmDetailReadinessStatus;
  if (!deal || !client) {
    readinessStatus = 'blocked';
  } else if (clientReal && teamReal && bankerReal) {
    readinessStatus = 'ready';
  } else {
    readinessStatus = 'partial';
  }

  // --- next actions (render safe BEFORE seeding spine) ---------------------
  const nextActions: CrmReadinessNextAction[] = [];
  let priority = 1;
  if (readinessStatus === 'blocked') {
    nextActions.push({
      priority: priority++,
      kind: 'resolve_blocked_section',
      action: 'Link a real cr664_loandeal.cr664_Client lookup before attempting any CRM detail surface.',
    });
  } else {
    if (safeDetailSections.length > 0) {
      nextActions.push({
        priority: priority++,
        kind: 'render_safe_detail',
        action: `Render only the safe detail sections (${safeDetailSections.join(', ')}) read-only behind existing deal/workspace authorization.`,
      });
    }
    // Actionable follow-ups are the DEGRADED sections (team / banker / a
    // name-only client). Optional (platform) and deferred (spine) sections are
    // expected gaps and never generate a "resolve" action.
    for (const b of degradedDetailSections) {
      nextActions.push({
        priority: priority++,
        kind: 'resolve_blocked_section',
        action: `Resolve "${b.section}": ${b.reason}`,
      });
    }
  }
  nextActions.push({
    priority: priority++,
    kind: 'defer_spine_seed',
    action: 'Defer: seed the Salesforce-style CRM spine only AFTER a runtime schema gate confirms the cr664_crm* tables exist live. Not part of this phase.',
  });

  return {
    readinessStatus,
    readOnly: true,
    spineSeeded: false,
    liveSpinePersistenceEnabled: CRM_LIVE_PERSISTENCE_ENABLED,
    safeDetailSections,
    blockedDetailSections,
    degradedDetailSections,
    optionalDetailSections,
    deferredDetailSections,
    sectionAssessments: assessments,
    missingInputs,
    unsafeAssumptionsRejected: REJECTED_ASSUMPTIONS.map((a) => ({ ...a })),
    nextActions,
    sourceFacts,
  };
}

function assess(
  section: CrmDetailSectionKey,
  label: string,
  requirement: CrmDetailSectionRequirement,
  state: CrmDetailSectionState,
  requiredIds: string[],
  reason: string,
): CrmDetailSectionAssessment {
  const safe = state === 'safe';
  return {
    section,
    label,
    safe,
    requirement,
    state,
    reason,
    requiredIds,
    presentRealIds: safe ? requiredIds : [],
  };
}
