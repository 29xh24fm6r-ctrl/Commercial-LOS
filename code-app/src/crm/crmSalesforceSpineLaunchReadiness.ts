/**
 * Phase 189J — Salesforce-style CRM spine LAUNCH READINESS engine.
 *
 * Pure, READ-ONLY. No IO, no Dataverse calls, no writes, no schema mutation, no
 * migration execution, no live-persistence flip, no fabricated records. Given an
 * already-authorized relationship graph plus the live presence of the planned
 * `cr664_crm*` tables, it classifies — per spine entity — exactly what stands
 * between today and a real CRM launch:
 *
 *   renderable | provisional | seed-required | blocked |
 *   authorization-required | schema-required | migration-required
 *
 * Honesty rules (pinned by tests):
 *   - The borrower/client stub yields ONLY a provisional Account identity.
 *   - Contacts, account/contact relationships, relationship roles, activities,
 *     tasks, and timeline remain non-renderable (seed/schema-gated) until a real
 *     spine is seeded or loaded — never fabricated.
 *   - Coverage team is derived ONLY from existing authorized banker/team facts.
 *   - The full Salesforce spine is never seeded and live persistence never flips.
 */

import { CRM_LIVE_PERSISTENCE_ENABLED } from './crmFeatureFlags';
import type { CrmRelationshipGraphInput, CrmSpineTableKey } from './crmRelationshipViewModel';
import {
  CRM_SPINE_ENTITIES,
  CRM_SPINE_LAUNCH_MODEL_VERSION,
  coverageTeamFromAuthorizedFacts,
  toProvisionalAccount,
  type CrmAccount,
  type CrmCoverageTeamMember,
  type CrmRelationshipHealth,
  type CrmSourceFact,
  type CrmSpineEntityDescriptor,
  type CrmSpineEntityKey,
  type CrmVisibilityRequirement,
} from './crmSalesforceSpineModel';

export type CrmSpineReadinessState =
  | 'renderable'
  | 'provisional'
  | 'seed-required'
  | 'blocked'
  | 'authorization-required'
  | 'schema-required'
  | 'migration-required';

export type CrmSpineLaunchStatus = 'launch-ready' | 'provisional-foundation' | 'blocked';

export interface CrmSpineEntityReadiness {
  entity: CrmSpineEntityKey;
  displayName: string;
  state: CrmSpineReadinessState;
  reason: string;
  /** Outstanding launch steps for this entity (schema/seed/migration/etc.). */
  requires: string[];
  backingTable: string | null;
}

export interface CrmSpineSeedPlanItem {
  entity: CrmSpineEntityKey;
  backingTable: string | null;
  schemaRequired: boolean;
  seedRequired: boolean;
  migrationRequired: boolean;
}

export interface CrmSpineRejectedFabrication {
  entity: string;
  reason: string;
}

export type CrmSpineActionKind =
  | 'render_now'
  | 'resolve_authorization'
  | 'create_schema'
  | 'migrate_existing_data'
  | 'seed_records'
  | 'defer_live_persistence';

export interface CrmSpineNextAction {
  priority: number;
  kind: CrmSpineActionKind;
  action: string;
}

export interface CrmSpineLaunchReadinessInput {
  /** The already-authorized, already-loaded relationship graph. */
  graph: CrmRelationshipGraphInput;
  /** Which spine entity record-sets have been authorized-loaded (rare this phase). */
  loadedEntities?: Partial<Record<CrmSpineEntityKey, boolean>>;
  /** Defaults to the build-time CRM_LIVE_PERSISTENCE_ENABLED flag (false). */
  liveCrmPersistenceEnabled?: boolean;
}

export interface CrmSalesforceSpineLaunchReadiness {
  modelVersion: string;
  launchStatus: CrmSpineLaunchStatus;

  // Safety literals — this engine performs no writes/schema/migration/seed.
  readOnly: true;
  liveWritePerformed: false;
  spineSeeded: false;
  schemaMutated: false;
  migrationExecuted: false;
  liveCrmPersistenceEnabled: boolean;

  entityReadiness: CrmSpineEntityReadiness[];

  // State buckets (the seven distinguished readiness states).
  renderableNow: CrmSpineEntityKey[];
  provisional: CrmSpineEntityKey[];
  seedRequired: CrmSpineEntityKey[];
  blocked: CrmSpineEntityKey[];
  authorizationRequired: CrmSpineEntityKey[];
  schemaRequired: CrmSpineEntityKey[];
  migrationRequired: CrmSpineEntityKey[];

  // Only data legitimately available now — never fabricated.
  provisionalAccount: CrmAccount | null;
  coverageTeam: CrmCoverageTeamMember[];
  relationshipHealth: CrmRelationshipHealth | null;
  sourceFacts: CrmSourceFact[];
  visibilityRequirements: CrmVisibilityRequirement[];

  seedPlan: CrmSpineSeedPlanItem[];
  rejectedFabrications: CrmSpineRejectedFabrication[];
  nextActions: CrmSpineNextAction[];
}

// Entities we explicitly refuse to synthesize — listed so the refusal is
// auditable rather than silent. None of these is ever materialized this phase.
const REJECTED_FABRICATIONS: ReadonlyArray<CrmSpineRejectedFabrication> = Object.freeze([
  { entity: 'account', reason: 'A full Account is never fabricated; only a provisional identity from the existing client stub is offered.' },
  { entity: 'contact', reason: 'No contacts are reachable until the spine is seeded or loaded; none are synthesized.' },
  { entity: 'relationshipRole', reason: 'Roles are never inferred from a single lookup; they require a seeded role-assignment spine.' },
  { entity: 'activity', reason: 'No activity records exist until seeded or loaded; none are synthesized.' },
  { entity: 'task', reason: 'No task table exists yet; tasks are never fabricated.' },
  { entity: 'timeline', reason: 'No timeline events exist until seeded or loaded; none are synthesized.' },
]);

interface AnchorContext {
  hasDeal: boolean;
  hasClient: boolean;
  hasBanker: boolean;
  hasTeam: boolean;
  tablePresent: (key: CrmSpineTableKey) => boolean;
  loaded: (key: CrmSpineEntityKey) => boolean;
}

function assessEntity(
  desc: CrmSpineEntityDescriptor,
  ctx: AnchorContext,
): { state: CrmSpineReadinessState; reason: string; requires: string[] } {
  const schemaStep = desc.backingTable ? `schema:${desc.backingTable}` : 'schema:new-table';

  switch (desc.key) {
    case 'sourceFact':
    case 'visibilityRequirement':
      return { state: 'renderable', reason: 'Provenance/policy metadata is always renderable.', requires: [] };

    case 'coverageTeamMember':
      return ctx.hasBanker || ctx.hasTeam
        ? { state: 'renderable', reason: 'Derived from the existing authorized banker/team facts.', requires: [] }
        : { state: 'authorization-required', reason: 'No authorized banker/team facts in context to derive coverage from.', requires: ['authorization'] };

    case 'dealRelationship':
      if (ctx.hasDeal && ctx.hasClient) {
        return { state: 'provisional', reason: 'Deal→account linkage from the cr664_loandeal.cr664_Client edge; account side is provisional.', requires: [] };
      }
      return { state: 'blocked', reason: 'No deal+client edge to link.', requires: ['anchor:deal+client'] };

    case 'relationshipHealth':
      return ctx.hasDeal
        ? { state: 'provisional', reason: 'Provisional health from edge-completeness signals; full health needs the seeded activity/role spine.', requires: [] }
        : { state: 'blocked', reason: 'No deal anchor to assess health against.', requires: ['anchor:deal'] };

    case 'account':
      if (!ctx.hasClient) {
        return { state: 'blocked', reason: 'No borrower/client stub linked to the deal — no account identity to project.', requires: ['anchor:client'] };
      }
      if (ctx.loaded('account')) {
        return { state: 'renderable', reason: 'A seeded organization record is loaded.', requires: [] };
      }
      if (ctx.tablePresent('organization')) {
        return { state: 'migration-required', reason: 'The organization table exists but the borrower/client stub has not been migrated into a real Account.', requires: ['migration:stub→organization', 'seed'] };
      }
      return { state: 'provisional', reason: 'Only a provisional Account identity is available (projected from the client stub); the full Account is schema/seed/migration-gated.', requires: [schemaStep, 'migration:stub→organization', 'seed'] };

    // Spine-seeded entities anchored on an account (the client stub).
    case 'contact':
    case 'accountContactRelationship':
    case 'relationshipRole':
      if (!ctx.hasClient) {
        return { state: 'blocked', reason: 'No account anchor (client stub) to attach this to.', requires: ['anchor:client'] };
      }
      return seedOrSchema(desc, ctx, schemaStep);

    // Spine-seeded entities anchored on a deal or account.
    case 'activity':
    case 'task':
      if (!ctx.hasDeal && !ctx.hasClient) {
        return { state: 'blocked', reason: 'No deal/account anchor to attach this to.', requires: ['anchor:deal-or-client'] };
      }
      return seedOrSchema(desc, ctx, schemaStep);
  }
}

function seedOrSchema(
  desc: CrmSpineEntityDescriptor,
  ctx: AnchorContext,
  schemaStep: string,
): { state: CrmSpineReadinessState; reason: string; requires: string[] } {
  if (ctx.loaded(desc.key)) {
    return { state: 'renderable', reason: 'Records have been authorized-loaded from the seeded spine.', requires: [] };
  }
  if (desc.spineTableKey === null) {
    return { state: 'schema-required', reason: `No planned table exists for ${desc.displayName}; the backing table must be created first.`, requires: [schemaStep] };
  }
  if (ctx.tablePresent(desc.spineTableKey)) {
    return { state: 'seed-required', reason: `The ${desc.backingTable} table exists but holds no records yet; it must be seeded or loaded.`, requires: ['seed'] };
  }
  return { state: 'schema-required', reason: `The ${desc.backingTable} table does not exist live; it must be created before any record can exist.`, requires: [schemaStep] };
}

function buildSourceFacts(graph: CrmRelationshipGraphInput): CrmSourceFact[] {
  const facts: CrmSourceFact[] = [];
  if (graph.deal) {
    facts.push({ id: 'fact-deal', statement: `Anchored on cr664_loandeal(${graph.deal.id}).`, sourceLogicalName: 'cr664_loandeal', sourceRecordId: graph.deal.id, classification: 'real-lookup' });
  } else {
    facts.push({ id: 'fact-deal', statement: 'No Loan Deal anchor supplied.', sourceLogicalName: null, sourceRecordId: null, classification: 'absent' });
  }
  if (graph.client) {
    facts.push({ id: 'fact-client', statement: `cr664_clientrelationship(${graph.client.id}) is a borrower/client stub → provisional Account only.`, sourceLogicalName: 'cr664_clientrelationship', sourceRecordId: graph.client.id, classification: 'provisional' });
  } else {
    facts.push({ id: 'fact-client', statement: 'No borrower/client stub linked.', sourceLogicalName: null, sourceRecordId: null, classification: 'absent' });
  }
  if (graph.assignedBanker) {
    facts.push({ id: 'fact-banker', statement: `Assigned banker(${graph.assignedBanker.id}) available as authorized coverage context.`, sourceLogicalName: 'cr664_banker', sourceRecordId: graph.assignedBanker.id, classification: 'authorized-context' });
  }
  if (graph.team) {
    facts.push({ id: 'fact-team', statement: `Owning team(${graph.team.id}) available as authorized coverage context.`, sourceLogicalName: 'cr664_team', sourceRecordId: graph.team.id, classification: 'authorized-context' });
  }
  facts.push({ id: 'fact-spine', statement: 'The Salesforce-style cr664_crm* spine is not seeded and not wired; contacts/roles/activities/tasks/timeline are unavailable until seeded.', sourceLogicalName: null, sourceRecordId: null, classification: 'absent' });
  return facts;
}

function buildVisibilityRequirements(ctx: AnchorContext): CrmVisibilityRequirement[] {
  return [
    { entity: 'account', requiredScope: 'deal-owner', authorizationFact: 'Viewer is authorized for the deal the account is linked to.', satisfiedByCurrentContext: ctx.hasClient, note: 'The provisional account identity is visible within the existing authorized deal context.' },
    { entity: 'coverageTeamMember', requiredScope: 'team-scoped', authorizationFact: 'Viewer is in/over the owning team.', satisfiedByCurrentContext: ctx.hasBanker || ctx.hasTeam, note: 'Coverage members come from the already-authorized banker/team facts.' },
    { entity: 'contact', requiredScope: 'crm-operator', authorizationFact: 'A seeded contact exists and the viewer is authorized for contact-level CRM data.', satisfiedByCurrentContext: false, note: 'No contacts exist until the spine is seeded; contact-level visibility is a separate authorization.' },
    { entity: 'relationshipRole', requiredScope: 'crm-operator', authorizationFact: 'A seeded role assignment exists and the viewer is authorized for it.', satisfiedByCurrentContext: false, note: 'Roles require the seeded role-assignment spine.' },
    { entity: 'activity', requiredScope: 'team-scoped', authorizationFact: 'A seeded activity/timeline exists for an entity the viewer can see.', satisfiedByCurrentContext: false, note: 'No activities exist until seeded or loaded.' },
  ];
}

export function deriveCrmSalesforceSpineLaunchReadiness(
  input: CrmSpineLaunchReadinessInput,
): CrmSalesforceSpineLaunchReadiness {
  const graph = input.graph;
  const presence = graph.spineTablePresence ?? {};
  const loadedEntities = input.loadedEntities ?? {};

  const ctx: AnchorContext = {
    hasDeal: graph.deal != null,
    hasClient: graph.client != null,
    hasBanker: graph.assignedBanker != null,
    hasTeam: graph.team != null,
    tablePresent: (key) => presence[key] === true,
    loaded: (key) => loadedEntities[key] === true,
  };

  const entityReadiness: CrmSpineEntityReadiness[] = CRM_SPINE_ENTITIES.map((desc) => {
    const { state, reason, requires } = assessEntity(desc, ctx);
    return { entity: desc.key, displayName: desc.displayName, state, reason, requires, backingTable: desc.backingTable };
  });

  const byState = (s: CrmSpineReadinessState) =>
    entityReadiness.filter((e) => e.state === s).map((e) => e.entity);

  const provisionalAccount = toProvisionalAccount(graph.client);
  const coverageTeam = coverageTeamFromAuthorizedFacts({ team: graph.team, assignedBanker: graph.assignedBanker });

  const relationshipHealth: CrmRelationshipHealth | null = graph.deal
    ? {
        subjectId: graph.deal.id,
        band: 'unknown',
        isProvisional: true,
        signals: [
          `client edge: ${graph.client ? 'present' : 'absent'}`,
          `team edge: ${graph.team ? 'present' : 'absent'}`,
          `banker edge: ${graph.assignedBanker ? 'present' : 'absent'}`,
        ],
        origin: 'authorized-fact',
      }
    : null;

  const seedPlan: CrmSpineSeedPlanItem[] = CRM_SPINE_ENTITIES.map((d) => ({
    entity: d.key,
    backingTable: d.backingTable,
    schemaRequired: d.schemaRequired,
    seedRequired: d.seedRequired,
    migrationRequired: d.migrationRequired,
  }));

  // --- launch status -------------------------------------------------------
  let launchStatus: CrmSpineLaunchStatus;
  if (!ctx.hasDeal && !ctx.hasClient) {
    launchStatus = 'blocked';
  } else if (
    entityReadiness.every((e) => e.state === 'renderable' || e.state === 'provisional')
  ) {
    launchStatus = entityReadiness.some((e) => e.state === 'provisional')
      ? 'provisional-foundation'
      : 'launch-ready';
  } else {
    launchStatus = 'provisional-foundation';
  }

  // --- next actions --------------------------------------------------------
  const nextActions: CrmSpineNextAction[] = [];
  let priority = 1;
  const renderableNow = byState('renderable');
  const provisional = byState('provisional');
  if (renderableNow.length > 0 || provisional.length > 0) {
    nextActions.push({
      priority: priority++,
      kind: 'render_now',
      action: `Render the available read-only foundation now (${[...renderableNow, ...provisional].join(', ')}) behind existing deal/workspace authorization.`,
    });
  }
  if (byState('authorization-required').length > 0) {
    nextActions.push({ priority: priority++, kind: 'resolve_authorization', action: `Resolve authorization for: ${byState('authorization-required').join(', ')}.` });
  }
  if (byState('schema-required').length > 0) {
    nextActions.push({ priority: priority++, kind: 'create_schema', action: `Create the missing cr664_crm* tables for: ${byState('schema-required').join(', ')} (guarded, inspect-first). Not part of this phase.` });
  }
  if (byState('migration-required').length > 0) {
    nextActions.push({ priority: priority++, kind: 'migrate_existing_data', action: `Migrate existing data (e.g. client stub → Account) for: ${byState('migration-required').join(', ')}. Not part of this phase.` });
  }
  if (byState('seed-required').length > 0) {
    nextActions.push({ priority: priority++, kind: 'seed_records', action: `Seed/load records for: ${byState('seed-required').join(', ')} once their tables exist. Not part of this phase.` });
  }
  nextActions.push({
    priority: priority++,
    kind: 'defer_live_persistence',
    action: 'Defer: flip CRM_LIVE_PERSISTENCE_ENABLED only after schema + migration + seed land behind a runtime schema gate. Not part of this phase.',
  });

  return {
    modelVersion: CRM_SPINE_LAUNCH_MODEL_VERSION,
    launchStatus,

    readOnly: true,
    liveWritePerformed: false,
    spineSeeded: false,
    schemaMutated: false,
    migrationExecuted: false,
    liveCrmPersistenceEnabled: input.liveCrmPersistenceEnabled ?? CRM_LIVE_PERSISTENCE_ENABLED,

    entityReadiness,
    renderableNow,
    provisional,
    seedRequired: byState('seed-required'),
    blocked: byState('blocked'),
    authorizationRequired: byState('authorization-required'),
    schemaRequired: byState('schema-required'),
    migrationRequired: byState('migration-required'),

    provisionalAccount,
    coverageTeam,
    relationshipHealth,
    sourceFacts: buildSourceFacts(graph),
    visibilityRequirements: buildVisibilityRequirements(ctx),

    seedPlan,
    rejectedFabrications: REJECTED_FABRICATIONS.map((r) => ({ ...r })),
    nextActions,
  };
}
