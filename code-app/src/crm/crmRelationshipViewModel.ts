/**
 * Phase 189B — CRM Relationship view-model foundation.
 *
 * Pure view-model. READ-ONLY. No IO, no Dataverse calls, no writes, no schema
 * mutation, no route mounting. It accepts an already-authorized, already-loaded
 * relationship graph (the live edges Phase 189A proved exist around a Loan
 * Deal) and projects it into a shape a future CRM Relationship panel can render
 * behind the existing deal/workspace authorization.
 *
 * Honesty rules (pinned by tests):
 *   - The canonical CRM entity today is `cr664_clientrelationship`, a
 *     borrower/client STUB reached via `cr664_loandeal.cr664_Client`. This
 *     module labels it as a stub — never as a full Salesforce account/contact
 *     spine.
 *   - The richer Salesforce-style spine (organization / person / contact /
 *     relationship / role / activity) is modeled in
 *     `src/crm/crmDataverseSchemaPlan.ts` but is NOT seeded live. This module
 *     reports it as not-seeded / not-wired and fabricates NO contacts, org
 *     hierarchy, roles, activities, or timeline events.
 *   - Recommended next actions prefer rendering the existing borrower/client
 *     graph BEFORE seeding the full CRM spine.
 *
 * This phase intentionally ships NO live loader. The adapter shape is pure: a
 * caller that has already authorized and loaded the graph passes it in.
 */

import { CRM_LIVE_PERSISTENCE_ENABLED } from './crmFeatureFlags';

// ---------------------------------------------------------------------------
// Inputs — an already-authorized, already-loaded live relationship graph.
// ---------------------------------------------------------------------------

/**
 * How a relationship edge is carried in Dataverse, as classified by the Phase
 * 189A `--inspect-crm-relationship-graph` audit:
 *   - 'real-lookup'   — a genuine Dataverse lookup (`_<attr>_value` + Targets).
 *   - 'pseudo-scalar' — a GUID/text column with NO relational integrity.
 *   - 'missing'       — the relationship attribute does not exist.
 *   - 'unknown'       — the caller did not classify the edge.
 */
export type CrmEdgeLookupClassification =
  | 'real-lookup'
  | 'pseudo-scalar'
  | 'missing'
  | 'unknown';

export interface CrmDealNode {
  id: string;
  name: string | null;
}

export interface CrmCanonicalClientNode {
  /** cr664_clientrelationship row id. */
  id: string;
  /** cr664_clientname. */
  name: string | null;
  /** cr664_borrowertype (choice label), if loaded. */
  borrowerType?: string | null;
  /** Classification of the cr664_loandeal.cr664_Client edge. */
  lookupClassification?: CrmEdgeLookupClassification;
}

export interface CrmTeamNode {
  id: string;
  name: string | null;
  lookupClassification?: CrmEdgeLookupClassification;
}

export interface CrmBankerNode {
  id: string;
  name: string | null;
  email?: string | null;
  /** cr664_banker._cr664_team_value, for the banker -> team cross-check. */
  teamId?: string | null;
  lookupClassification?: CrmEdgeLookupClassification;
}

export interface CrmPlatformUserNode {
  id: string;
  name?: string | null;
  /** cr664_platformuser.cr664_CoreUser (audit-actor bridge). */
  coreUserId?: string | null;
  /** cr664_platformuser.cr664_primaryworkspace. */
  primaryWorkspaceId?: string | null;
  primaryWorkspaceName?: string | null;
}

/** Keys of the future Salesforce-style spine tables (Phase 141J-K plan). */
export type CrmSpineTableKey =
  | 'organization'
  | 'person'
  | 'contactPoint'
  | 'relationship'
  | 'roleAssignment'
  | 'communicationPreference'
  | 'contactAuthorization'
  | 'vendorProfile'
  | 'timelineEvent'
  | 'auditEntry';

export interface CrmRelationshipGraphInput {
  /** The anchor Loan Deal. Null means the graph cannot be anchored. */
  deal: CrmDealNode | null;
  /** The canonical CRM entity today (borrower/client stub). */
  client: CrmCanonicalClientNode | null;
  /** Owning team (cr664_loandeal.cr664_Team -> cr664_team). */
  team?: CrmTeamNode | null;
  /** Assigned banker (cr664_loandeal.cr664_AssignedTo, cross-checked to banker). */
  assignedBanker?: CrmBankerNode | null;
  /** Optional platform-user context (workspace / core-user bridge). */
  platformUser?: CrmPlatformUserNode | null;
  /**
   * Live presence of the future spine tables, as observed by a schema gate or
   * the 189A audit. Absent (the norm this phase) means "not seeded".
   */
  spineTablePresence?: Partial<Record<CrmSpineTableKey, boolean>>;
}

// ---------------------------------------------------------------------------
// Output — a render-ready, honest projection.
// ---------------------------------------------------------------------------

export type CrmRelationshipStatus = 'ready' | 'partial' | 'blocked';

export interface CrmCanonicalClientView {
  id: string;
  name: string | null;
  borrowerType: string | null;
  /** Always the stub kind in this phase — never a full account/contact. */
  kind: 'borrower_client_stub';
  logicalName: 'cr664_clientrelationship';
  note: string;
}

export interface CrmDealRelationshipSummary {
  dealId: string | null;
  dealName: string | null;
  /** Human labels for each live edge actually present. */
  presentEdges: string[];
  presentEdgeCount: number;
  /** Canonical edges a complete current-spine graph expects. */
  expectedCanonicalEdgeCount: number;
}

export interface CrmBankerView {
  id: string;
  name: string | null;
  email: string | null;
  teamMatchesDeal: boolean | null;
}

export interface CrmTeamView {
  id: string;
  name: string | null;
}

export interface CrmPlatformUserContextView {
  id: string;
  name: string | null;
  coreUserId: string | null;
  primaryWorkspaceId: string | null;
  primaryWorkspaceName: string | null;
}

export type CrmEdgeSeverity = 'blocking' | 'degraded' | 'informational';

export interface CrmMissingRelationshipEdge {
  edge: string;
  target: string;
  severity: CrmEdgeSeverity;
  detail: string;
}

export interface CrmPseudoLookupWarning {
  edge: string;
  logicalColumn: string;
  detail: string;
}

export type CrmRecommendedActionKind =
  | 'render_existing_graph'
  | 'resolve_missing_edge'
  | 'seed_full_spine_later';

export interface CrmRecommendedAction {
  /** 1 = do first. Lower runs first. */
  priority: number;
  kind: CrmRecommendedActionKind;
  action: string;
}

export interface CrmFutureSpineTableView {
  key: CrmSpineTableKey;
  logicalName: string;
  present: boolean;
  status: 'not_seeded' | 'present_not_wired';
}

export interface CrmFutureSpineView {
  /** This phase never seeds the spine. */
  seeded: false;
  /** Even if a table were present, no runtime is wired to it this phase. */
  wired: false;
  liveSpinePersistenceEnabled: boolean;
  tables: CrmFutureSpineTableView[];
  note: string;
}

export interface CrmRelationshipViewModel {
  title: string;
  subtitle: string;
  safetyCopy: string;

  // Safety booleans (literal — this view-model performs no writes).
  readOnly: true;
  liveWritePerformed: false;
  externalSystemChanged: false;
  spineSeeded: false;
  liveSpinePersistenceEnabled: boolean;

  relationshipStatus: CrmRelationshipStatus;
  canonicalClient: CrmCanonicalClientView | null;
  dealRelationshipSummary: CrmDealRelationshipSummary;
  assignedBanker: CrmBankerView | null;
  team: CrmTeamView | null;
  platformUserContext: CrmPlatformUserContextView | null;

  missingRelationshipEdges: CrmMissingRelationshipEdge[];
  unsafePseudoLookupWarnings: CrmPseudoLookupWarning[];
  recommendedNextActions: CrmRecommendedAction[];
  sourceFacts: string[];
  futureSpine: CrmFutureSpineView;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** The future Salesforce-style spine tables (modeled, not live this phase). */
const CRM_SPINE_TABLES: ReadonlyArray<{ key: CrmSpineTableKey; logicalName: string }> =
  Object.freeze([
    { key: 'organization', logicalName: 'cr664_crmorganization' },
    { key: 'person', logicalName: 'cr664_crmperson' },
    { key: 'contactPoint', logicalName: 'cr664_crmcontactpoint' },
    { key: 'relationship', logicalName: 'cr664_crmrelationship' },
    { key: 'roleAssignment', logicalName: 'cr664_crmroleassignment' },
    { key: 'communicationPreference', logicalName: 'cr664_crmcommunicationpreference' },
    { key: 'contactAuthorization', logicalName: 'cr664_crmcontactauthorization' },
    { key: 'vendorProfile', logicalName: 'cr664_crmvendorprofile' },
    { key: 'timelineEvent', logicalName: 'cr664_crmtimelineevent' },
    { key: 'auditEntry', logicalName: 'cr664_crmauditentry' },
  ]);

// The canonical edges a COMPLETE current (borrower/client) spine expects.
const EXPECTED_CANONICAL_EDGE_COUNT = 3; // client, team, assignedBanker

function isPseudo(c: CrmEdgeLookupClassification | undefined): boolean {
  return c === 'pseudo-scalar';
}

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

export function deriveCrmRelationshipViewModel(
  input: CrmRelationshipGraphInput,
): CrmRelationshipViewModel {
  const sourceFacts: string[] = [];
  const presentEdges: string[] = [];
  const missing: CrmMissingRelationshipEdge[] = [];
  const pseudoWarnings: CrmPseudoLookupWarning[] = [];

  const deal = input.deal ?? null;
  const client = input.client ?? null;
  const team = input.team ?? null;
  const banker = input.assignedBanker ?? null;
  const platformUser = input.platformUser ?? null;

  // --- Deal anchor ---------------------------------------------------------
  if (deal) {
    sourceFacts.push(
      `cr664_loandeal(${deal.id}) resolved${deal.name ? `: "${deal.name}"` : ''}.`,
    );
  } else {
    sourceFacts.push('No Loan Deal supplied — the relationship graph cannot be anchored.');
  }

  // --- Canonical client (the de-facto CRM entity today) --------------------
  let canonicalClient: CrmCanonicalClientView | null = null;
  if (client) {
    canonicalClient = {
      id: client.id,
      name: client.name ?? null,
      borrowerType: client.borrowerType ?? null,
      kind: 'borrower_client_stub',
      logicalName: 'cr664_clientrelationship',
      note:
        'cr664_clientrelationship is a borrower/client stub reached via ' +
        'cr664_loandeal.cr664_Client. It is NOT a Salesforce-style account/contact spine.',
    };
    presentEdges.push('Deal → Client (cr664_Client)');
    sourceFacts.push(
      `cr664_Client → cr664_clientrelationship(${client.id})` +
        ` [${client.lookupClassification ?? 'unknown'}].`,
    );
    if (isPseudo(client.lookupClassification)) {
      pseudoWarnings.push({
        edge: 'Deal → Client',
        logicalColumn: 'cr664_client',
        detail:
          'The Client edge is carried by a pseudo GUID/text column, not a real ' +
          'Dataverse lookup. The borrower/client identity has no relational integrity.',
      });
    }
  } else {
    missing.push({
      edge: 'Deal → Client',
      target: 'cr664_clientrelationship',
      severity: 'blocking',
      detail:
        'No canonical CRM entity is reachable: cr664_loandeal.cr664_Client is unset, ' +
        'so there is no borrower/client graph to render.',
    });
  }

  // --- Team ----------------------------------------------------------------
  let teamView: CrmTeamView | null = null;
  if (team) {
    teamView = { id: team.id, name: team.name ?? null };
    presentEdges.push('Deal → Team (cr664_Team)');
    sourceFacts.push(
      `cr664_Team → cr664_team(${team.id}) [${team.lookupClassification ?? 'unknown'}].`,
    );
    if (isPseudo(team.lookupClassification)) {
      pseudoWarnings.push({
        edge: 'Deal → Team',
        logicalColumn: 'cr664_team',
        detail: 'The Team edge is carried by a pseudo GUID/text column, not a real lookup.',
      });
    }
  } else {
    missing.push({
      edge: 'Deal → Team',
      target: 'cr664_team',
      severity: 'degraded',
      detail: 'The owning Team edge (cr664_loandeal.cr664_Team) is unset.',
    });
  }

  // --- Assigned banker -----------------------------------------------------
  let bankerView: CrmBankerView | null = null;
  if (banker) {
    const teamMatchesDeal =
      banker.teamId != null && team?.id != null ? banker.teamId === team.id : null;
    bankerView = {
      id: banker.id,
      name: banker.name ?? null,
      email: banker.email ?? null,
      teamMatchesDeal,
    };
    presentEdges.push('Deal → Assigned banker (cr664_AssignedTo)');
    sourceFacts.push(
      `cr664_AssignedTo → banker(${banker.id})` +
        ` [${banker.lookupClassification ?? 'unknown'}]` +
        (teamMatchesDeal === null
          ? '.'
          : `; banker team ${teamMatchesDeal ? 'matches' : 'does NOT match'} deal team.`),
    );
    if (isPseudo(banker.lookupClassification)) {
      pseudoWarnings.push({
        edge: 'Deal → Assigned banker',
        logicalColumn: 'cr664_assignedto',
        detail:
          'The Assigned-banker edge is carried by a pseudo GUID/text column, not a real lookup.',
      });
    }
  } else {
    missing.push({
      edge: 'Deal → Assigned banker',
      target: 'cr664_banker / systemuser',
      severity: 'degraded',
      detail: 'The assigned-banker edge (cr664_loandeal.cr664_AssignedTo) is unset.',
    });
  }

  // --- Platform-user context (optional) ------------------------------------
  let platformUserContext: CrmPlatformUserContextView | null = null;
  if (platformUser) {
    platformUserContext = {
      id: platformUser.id,
      name: platformUser.name ?? null,
      coreUserId: platformUser.coreUserId ?? null,
      primaryWorkspaceId: platformUser.primaryWorkspaceId ?? null,
      primaryWorkspaceName: platformUser.primaryWorkspaceName ?? null,
    };
    presentEdges.push('PlatformUser → CoreUser / Workspace');
    sourceFacts.push(
      `cr664_platformuser(${platformUser.id})` +
        (platformUser.primaryWorkspaceId
          ? ` → workspace(${platformUser.primaryWorkspaceId})`
          : '') +
        (platformUser.coreUserId ? ` → coreUser(${platformUser.coreUserId})` : '') +
        '.',
    );
  }

  // --- Future Salesforce-style spine (honest: not seeded / not wired) ------
  const presence = input.spineTablePresence ?? {};
  const futureSpine: CrmFutureSpineView = {
    seeded: false,
    wired: false,
    liveSpinePersistenceEnabled: CRM_LIVE_PERSISTENCE_ENABLED,
    tables: CRM_SPINE_TABLES.map((t) => {
      const present = presence[t.key] === true;
      return {
        key: t.key,
        logicalName: t.logicalName,
        present,
        status: present ? ('present_not_wired' as const) : ('not_seeded' as const),
      };
    }),
    note:
      'The Salesforce-style CRM spine (organization / person / contact / relationship / ' +
      'role / activity) is modeled in crmDataverseSchemaPlan.ts but is not seeded live and ' +
      'no runtime is wired to it. No contacts, org hierarchy, roles, or activities are synthesized.',
  };

  // --- Status (precedence: blocked > partial > ready) ----------------------
  let relationshipStatus: CrmRelationshipStatus;
  if (!deal || !client) {
    relationshipStatus = 'blocked';
  } else if (
    missing.some((m) => m.severity === 'degraded') ||
    pseudoWarnings.length > 0
  ) {
    relationshipStatus = 'partial';
  } else {
    relationshipStatus = 'ready';
  }

  // --- Recommended next actions (render existing BEFORE seeding spine) ------
  const recommendedNextActions: CrmRecommendedAction[] = [];
  let priority = 1;
  if (relationshipStatus === 'blocked') {
    recommendedNextActions.push({
      priority: priority++,
      kind: 'resolve_missing_edge',
      action:
        'Link the canonical client first: set cr664_loandeal.cr664_Client to a ' +
        'cr664_clientrelationship before rendering any CRM relationship surface.',
    });
  } else {
    // The existing live borrower/client graph is renderable now — do that first.
    recommendedNextActions.push({
      priority: priority++,
      kind: 'render_existing_graph',
      action:
        'Render the existing borrower/client relationship graph (read-only) in a CRM ' +
        'panel behind the existing deal/workspace authorization.',
    });
    for (const m of missing.filter((e) => e.severity === 'degraded')) {
      recommendedNextActions.push({
        priority: priority++,
        kind: 'resolve_missing_edge',
        action: `Resolve missing edge "${m.edge}" (${m.target}): ${m.detail}`,
      });
    }
    for (const w of pseudoWarnings) {
      recommendedNextActions.push({
        priority: priority++,
        kind: 'resolve_missing_edge',
        action: `Repair pseudo lookup on "${w.edge}" (${w.logicalColumn}) to a real Dataverse lookup.`,
      });
    }
  }
  // Always last: seeding the full spine is deferred behind a runtime schema gate.
  recommendedNextActions.push({
    priority: priority++,
    kind: 'seed_full_spine_later',
    action:
      'Defer: seed the full Salesforce-style CRM spine only AFTER a runtime schema gate ' +
      'confirms the cr664_crm* tables exist live. Not part of this phase.',
  });

  return {
    title: 'CRM Relationship',
    subtitle: 'Read-only relationship graph over the existing borrower/client spine',
    safetyCopy:
      'This is a read-only projection of the live relationship graph around a Loan Deal. ' +
      'No Dataverse writes, no schema changes, no external system contact. The full ' +
      'Salesforce-style CRM spine is not seeded and not wired.',

    readOnly: true,
    liveWritePerformed: false,
    externalSystemChanged: false,
    spineSeeded: false,
    liveSpinePersistenceEnabled: CRM_LIVE_PERSISTENCE_ENABLED,

    relationshipStatus,
    canonicalClient,
    dealRelationshipSummary: {
      dealId: deal?.id ?? null,
      dealName: deal?.name ?? null,
      presentEdges,
      presentEdgeCount: presentEdges.length,
      expectedCanonicalEdgeCount: EXPECTED_CANONICAL_EDGE_COUNT,
    },
    assignedBanker: bankerView,
    team: teamView,
    platformUserContext,

    missingRelationshipEdges: missing,
    unsafePseudoLookupWarnings: pseudoWarnings,
    recommendedNextActions,
    sourceFacts,
    futureSpine,
  };
}
