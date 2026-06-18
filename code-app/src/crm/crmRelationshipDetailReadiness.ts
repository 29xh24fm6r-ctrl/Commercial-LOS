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

export interface CrmDetailSectionAssessment {
  section: CrmDetailSectionKey;
  label: string;
  safe: boolean;
  reason: string;
  /** Ids this section needs to render a real record-detail surface. */
  requiredIds: string[];
  /** Of the required ids, which were present AND real (non-surrogate). */
  presentRealIds: string[];
}

export interface CrmBlockedDetailSection {
  section: CrmDetailSectionKey;
  reason: string;
}

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
  blockedDetailSections: CrmBlockedDetailSection[];
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

  // --- clientIdentity ------------------------------------------------------
  const clientReal = client != null && isRealId(client.id) && client.lookupClassification === 'real-lookup';
  if (!client) {
    missingInputs.push('client.id (cr664_loandeal.cr664_Client)');
    assessments.push({
      section: 'clientIdentity',
      label: 'Client identity detail',
      safe: false,
      reason: 'No canonical client is linked to the deal — no client record to detail.',
      requiredIds: ['client.id'],
      presentRealIds: [],
    });
  } else if (!clientReal) {
    const surrogate = !isRealId(client.id);
    assessments.push({
      section: 'clientIdentity',
      label: 'Client identity detail',
      safe: false,
      reason: surrogate
        ? 'Client is known by name only (name: surrogate id); a record-detail drilldown is not safe.'
        : `Client edge is "${client.lookupClassification ?? 'unknown'}", not a verified real lookup.`,
      requiredIds: ['client.id'],
      presentRealIds: [],
    });
    sourceFacts.push(
      `Client present by ${surrogate ? 'name only' : 'unverified edge'}; record-detail blocked.`,
    );
  } else {
    assessments.push({
      section: 'clientIdentity',
      label: 'Client identity detail',
      safe: true,
      reason: 'Real cr664_clientrelationship id with a verified real-lookup edge.',
      requiredIds: ['client.id'],
      presentRealIds: ['client.id'],
    });
    sourceFacts.push(`Client record id ${client.id} is a real lookup — detail safe.`);
  }

  // --- teamOwnership -------------------------------------------------------
  const teamReal = team != null && isRealId(team.id) && team.lookupClassification === 'real-lookup';
  if (!team) {
    missingInputs.push('team.id (cr664_loandeal.cr664_Team)');
    assessments.push(blockedSection('teamOwnership', 'Team ownership detail', ['team.id'],
      'Owning-team edge is unset in this context.'));
  } else if (!teamReal) {
    assessments.push(blockedSection('teamOwnership', 'Team ownership detail', ['team.id'],
      `Team edge is "${team.lookupClassification ?? 'unknown'}", not a verified real lookup.`));
  } else {
    assessments.push(safeSection('teamOwnership', 'Team ownership detail', ['team.id'],
      'Real cr664_team id with a verified real-lookup edge.'));
    sourceFacts.push(`Team record id ${team.id} is a real lookup — detail safe.`);
  }

  // --- assignedBanker ------------------------------------------------------
  const bankerReal = banker != null && isRealId(banker.id) && banker.lookupClassification === 'real-lookup';
  if (!banker) {
    missingInputs.push('assignedBanker.id (cr664_loandeal.cr664_AssignedTo)');
    assessments.push(blockedSection('assignedBanker', 'Assigned banker detail', ['assignedBanker.id'],
      'Assigned-banker edge is unset in this context.'));
  } else if (!bankerReal) {
    assessments.push(blockedSection('assignedBanker', 'Assigned banker detail', ['assignedBanker.id'],
      `Assigned-banker edge is "${banker.lookupClassification ?? 'unknown'}" (e.g. id from workspace context only), not a verified real lookup.`));
  } else {
    assessments.push(safeSection('assignedBanker', 'Assigned banker detail', ['assignedBanker.id'],
      'Real assigned-banker id with a verified real-lookup edge.'));
    sourceFacts.push(`Assigned-banker record id ${banker.id} is a real lookup — detail safe.`);
  }

  // --- platformWorkspaceBridge (optional) ----------------------------------
  if (platformUser && isRealId(platformUser.id)) {
    assessments.push(safeSection('platformWorkspaceBridge', 'Platform / workspace bridge',
      ['platformUser.id'], 'Real platform-user id present; workspace/core-user bridge can render.'));
  } else {
    assessments.push(blockedSection('platformWorkspaceBridge', 'Platform / workspace bridge',
      ['platformUser.id'], 'No platform-user context supplied (optional surface).'));
  }

  // --- relationshipIntegrity (diagnostic over what we have) ----------------
  if (deal) {
    assessments.push(safeSection('relationshipIntegrity', 'Relationship integrity diagnostics',
      [], 'Edge classifications (real-lookup / unknown / pseudo / missing) are derivable read-only from the supplied graph.'));
  } else {
    assessments.push(blockedSection('relationshipIntegrity', 'Relationship integrity diagnostics',
      [], 'No deal anchor — nothing to diagnose.'));
  }

  // --- salesforceSpine (never seeded / wired this phase) -------------------
  assessments.push(blockedSection('salesforceSpine', 'Salesforce-style spine detail', [],
    'The cr664_crm* spine is not seeded and not wired; no spine detail can render.'));

  const safeDetailSections = assessments.filter((a) => a.safe).map((a) => a.section);
  const blockedDetailSections = assessments
    .filter((a) => !a.safe)
    .map((a) => ({ section: a.section, reason: a.reason }));

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
    for (const b of blockedDetailSections.filter((s) => s.section !== 'salesforceSpine')) {
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
    sectionAssessments: assessments,
    missingInputs,
    unsafeAssumptionsRejected: REJECTED_ASSUMPTIONS.map((a) => ({ ...a })),
    nextActions,
    sourceFacts,
  };
}

function safeSection(
  section: CrmDetailSectionKey,
  label: string,
  requiredIds: string[],
  reason: string,
): CrmDetailSectionAssessment {
  return { section, label, safe: true, reason, requiredIds, presentRealIds: requiredIds };
}

function blockedSection(
  section: CrmDetailSectionKey,
  label: string,
  requiredIds: string[],
  reason: string,
): CrmDetailSectionAssessment {
  return { section, label, safe: false, reason, requiredIds, presentRealIds: [] };
}
