/**
 * Phase 189J — Salesforce-style CRM spine launch MODEL (canonical types).
 *
 * Pure model. READ-ONLY. No IO, no Dataverse calls, no writes, no schema
 * mutation, no fabricated records. This is the canonical typed foundation for a
 * real launch CRM spine — Account, Contact, account/contact relationships,
 * relationship roles, coverage team, deal linkage, activities, tasks,
 * relationship health, source facts, and visibility (authorization)
 * requirements — mapped onto the already-planned `cr664_crm*` Dataverse tables
 * (`crmDataverseSchemaPlan.ts`).
 *
 * Honesty rules (pinned by tests):
 *   - NOTHING here fabricates records. The only constructors are pure
 *     projections of facts the caller already holds:
 *       • `toProvisionalAccount` projects the existing borrower/client STUB
 *         (`cr664_clientrelationship`) into a PROVISIONAL account identity — not
 *         a full Salesforce Account. Full-account fields stay null.
 *       • `coverageTeamFromAuthorizedFacts` derives coverage members ONLY from
 *         the existing authorized banker/team facts.
 *   - Contacts, account/contact relationships, relationship roles, activities,
 *     tasks, and timeline records have NO constructor here — they are only ever
 *     loaded from a seeded spine, never synthesized.
 */

import type { CrmSpineTableKey, CrmCanonicalClientNode, CrmTeamNode, CrmBankerNode } from './crmRelationshipViewModel';

export const CRM_SPINE_LAUNCH_MODEL_VERSION = '189J.1';

// ---------------------------------------------------------------------------
// Entity keys + provenance
// ---------------------------------------------------------------------------

export type CrmSpineEntityKey =
  | 'account'
  | 'contact'
  | 'accountContactRelationship'
  | 'relationshipRole'
  | 'coverageTeamMember'
  | 'dealRelationship'
  | 'activity'
  | 'task'
  | 'relationshipHealth'
  | 'sourceFact'
  | 'visibilityRequirement';

/**
 * Where a record's data legitimately comes from. There is no "fabricated"
 * origin — synthesis is not representable in this model.
 */
export type CrmRecordOrigin =
  | 'seeded-spine' // loaded from the real cr664_crm* spine (not this phase)
  | 'provisional-stub' // projected from the existing borrower/client stub
  | 'authorized-fact' // derived from existing authorized banker/team/deal facts
  | 'policy'; // a non-data policy / requirement record

export type CrmFactClassification =
  | 'real-lookup'
  | 'provisional'
  | 'authorized-context'
  | 'absent';

// ---------------------------------------------------------------------------
// Source facts + visibility requirements (meta — always renderable)
// ---------------------------------------------------------------------------

export interface CrmSourceFact {
  id: string;
  statement: string;
  /** Logical name of the live row the fact is grounded in, if any. */
  sourceLogicalName: string | null;
  sourceRecordId: string | null;
  classification: CrmFactClassification;
}

export type CrmVisibilityScope =
  | 'deal-owner'
  | 'team-scoped'
  | 'manager'
  | 'executive'
  | 'crm-operator';

export interface CrmVisibilityRequirement {
  entity: CrmSpineEntityKey;
  /** Minimum scope required to view this entity. */
  requiredScope: CrmVisibilityScope;
  /** The authorization fact that must hold (human-readable). */
  authorizationFact: string;
  /** Whether the CURRENT authorized deal/workspace context already satisfies it. */
  satisfiedByCurrentContext: boolean;
  note: string;
}

// ---------------------------------------------------------------------------
// Core entities (canonical launch shapes)
// ---------------------------------------------------------------------------

export type CrmAccountType =
  | 'borrower'
  | 'guarantor-entity'
  | 'vendor'
  | 'advisor-firm'
  | 'internal'
  | 'unknown';

export interface CrmAccount {
  id: string;
  name: string | null;
  /** True when this is only a provisional identity from the stub. */
  isProvisional: boolean;
  origin: CrmRecordOrigin;
  backingLogicalName: 'cr664_crmorganization';
  /** The stub this provisional identity was projected from (if provisional). */
  provisionalFromLogicalName: string | null;
  provisionalFromRecordId: string | null;
  /** Full-account attributes — null until the real spine is seeded/loaded. */
  accountType: CrmAccountType | null;
  legalName: string | null;
  industry: string | null;
  relationshipStartDate: string | null;
}

export interface CrmContact {
  id: string;
  accountId: string | null;
  fullName: string | null;
  title: string | null;
  origin: CrmRecordOrigin;
  backingLogicalName: 'cr664_crmperson';
}

export type CrmAccountContactRelationshipType =
  | 'employee'
  | 'owner'
  | 'officer'
  | 'authorized-representative'
  | 'other';

export interface CrmAccountContactRelationship {
  id: string;
  accountId: string;
  contactId: string;
  relationshipType: CrmAccountContactRelationshipType;
  isPrimary: boolean;
  active: boolean;
  origin: CrmRecordOrigin;
  backingLogicalName: 'cr664_crmrelationship';
}

export type CrmRelationshipRoleType =
  | 'borrower-contact'
  | 'guarantor-contact'
  | 'authorized-signer'
  | 'financial-request-contact'
  | 'relationship-manager'
  | 'servicing-owner'
  | 'portfolio-manager'
  | 'other';

export interface CrmRelationshipRole {
  id: string;
  /** The entity the role is about (account or contact id). */
  subjectId: string;
  roleType: CrmRelationshipRoleType;
  /** Who/what the role is assigned to (e.g. a loan, a contact). */
  scopeEntityType: string | null;
  scopeEntityId: string | null;
  active: boolean;
  origin: CrmRecordOrigin;
  backingLogicalName: 'cr664_crmroleassignment';
}

export type CrmCoverageRole =
  | 'assigned-banker'
  | 'coverage-team'
  | 'relationship-manager'
  | 'portfolio-manager';

export interface CrmCoverageTeamMember {
  id: string;
  /** A coverage member is derived from authorized banker/team facts only. */
  memberType: 'banker' | 'team';
  name: string | null;
  coverageRole: CrmCoverageRole;
  /** The authorized source row (cr664_banker / cr664_team). */
  sourceLogicalName: string;
  sourceRecordId: string;
  origin: CrmRecordOrigin;
}

export interface CrmDealRelationship {
  id: string;
  dealId: string;
  /** The account this deal links to (provisional from the stub this phase). */
  accountId: string | null;
  /** True while the account side is only a provisional stub identity. */
  accountIsProvisional: boolean;
  origin: CrmRecordOrigin;
}

export type CrmActivityType =
  | 'call'
  | 'meeting'
  | 'email'
  | 'note'
  | 'document-exchange'
  | 'other';

export interface CrmActivity {
  id: string;
  subjectEntityType: string;
  subjectEntityId: string;
  activityType: CrmActivityType;
  occurredAt: string | null;
  summary: string | null;
  origin: CrmRecordOrigin;
  backingLogicalName: 'cr664_crmtimelineevent';
}

export type CrmTaskStatus = 'open' | 'in-progress' | 'completed' | 'cancelled';

export interface CrmTask {
  id: string;
  subjectEntityType: string;
  subjectEntityId: string;
  title: string | null;
  status: CrmTaskStatus;
  dueDate: string | null;
  origin: CrmRecordOrigin;
  /** No task table exists in the current schema plan yet. */
  backingLogicalName: 'cr664_crmtask';
}

export type CrmHealthBand = 'healthy' | 'watch' | 'at-risk' | 'unknown';

export interface CrmRelationshipHealth {
  subjectId: string;
  band: CrmHealthBand;
  /** True while computed only from the provisional/authorized facts on hand. */
  isProvisional: boolean;
  /** Signals available now (edge completeness etc.) — never fabricated scores. */
  signals: string[];
  origin: CrmRecordOrigin;
}

// ---------------------------------------------------------------------------
// Entity registry — launch requirements per entity
// ---------------------------------------------------------------------------

export type CrmSpineSourceKind =
  | 'seeded-spine'
  | 'provisional-stub'
  | 'authorized-fact'
  | 'policy';

export interface CrmSpineEntityDescriptor {
  key: CrmSpineEntityKey;
  displayName: string;
  /** Backing cr664_crm* table logical name, or null if derived/meta. */
  backingTable: string | null;
  /** The schema-plan presence key, or null if this entity has no planned table. */
  spineTableKey: CrmSpineTableKey | null;
  sourceKind: CrmSpineSourceKind;
  /** Launch needs the backing table seeded with records. */
  seedRequired: boolean;
  /** Launch needs the backing table created (schema metadata). */
  schemaRequired: boolean;
  /** Launch needs existing data migrated into it. */
  migrationRequired: boolean;
  description: string;
}

export const CRM_SPINE_ENTITIES: readonly CrmSpineEntityDescriptor[] = Object.freeze([
  {
    key: 'account',
    displayName: 'Account',
    backingTable: 'cr664_crmorganization',
    spineTableKey: 'organization',
    sourceKind: 'provisional-stub',
    seedRequired: true,
    schemaRequired: true,
    migrationRequired: true,
    description:
      'Canonical organization/account. Today only a PROVISIONAL identity is available, projected from the cr664_clientrelationship borrower/client stub; the full Account requires the seeded spine and a stub→organization migration.',
  },
  {
    key: 'contact',
    displayName: 'Contact',
    backingTable: 'cr664_crmperson',
    spineTableKey: 'person',
    sourceKind: 'seeded-spine',
    seedRequired: true,
    schemaRequired: true,
    migrationRequired: false,
    description: 'Person/contact. No contacts exist until the spine is seeded or loaded; never fabricated.',
  },
  {
    key: 'accountContactRelationship',
    displayName: 'Account-Contact relationship',
    backingTable: 'cr664_crmrelationship',
    spineTableKey: 'relationship',
    sourceKind: 'seeded-spine',
    seedRequired: true,
    schemaRequired: true,
    migrationRequired: false,
    description: 'Edge linking an account to a contact. Loaded only from a seeded spine.',
  },
  {
    key: 'relationshipRole',
    displayName: 'Relationship role',
    backingTable: 'cr664_crmroleassignment',
    spineTableKey: 'roleAssignment',
    sourceKind: 'seeded-spine',
    seedRequired: true,
    schemaRequired: true,
    migrationRequired: false,
    description: 'Role assignment (borrower contact, authorized signer, etc.). Never inferred from a single lookup.',
  },
  {
    key: 'coverageTeamMember',
    displayName: 'Coverage team member',
    backingTable: null,
    spineTableKey: null,
    sourceKind: 'authorized-fact',
    seedRequired: false,
    schemaRequired: false,
    migrationRequired: false,
    description: 'Derived ONLY from the existing authorized banker/team facts (cr664_banker / cr664_team).',
  },
  {
    key: 'dealRelationship',
    displayName: 'Deal relationship',
    backingTable: null,
    spineTableKey: null,
    sourceKind: 'authorized-fact',
    seedRequired: false,
    schemaRequired: false,
    migrationRequired: false,
    description: 'Deal→account linkage derived from the existing cr664_loandeal.cr664_Client edge (provisional account side).',
  },
  {
    key: 'activity',
    displayName: 'Activity',
    backingTable: 'cr664_crmtimelineevent',
    spineTableKey: 'timelineEvent',
    sourceKind: 'seeded-spine',
    seedRequired: true,
    schemaRequired: true,
    migrationRequired: false,
    description: 'CRM activity / timeline event. No activities exist until seeded or loaded; never fabricated.',
  },
  {
    key: 'task',
    displayName: 'Task',
    backingTable: 'cr664_crmtask',
    spineTableKey: null,
    sourceKind: 'seeded-spine',
    seedRequired: true,
    schemaRequired: true,
    migrationRequired: false,
    description: 'CRM task. No task table exists in the current schema plan — schema creation is required before any task can exist.',
  },
  {
    key: 'relationshipHealth',
    displayName: 'Relationship health',
    backingTable: null,
    spineTableKey: null,
    sourceKind: 'authorized-fact',
    seedRequired: false,
    schemaRequired: false,
    migrationRequired: false,
    description: 'Provisional health computed from edge-completeness signals on hand. Full health requires the seeded activity/role spine.',
  },
  {
    key: 'sourceFact',
    displayName: 'Source fact',
    backingTable: null,
    spineTableKey: null,
    sourceKind: 'policy',
    seedRequired: false,
    schemaRequired: false,
    migrationRequired: false,
    description: 'Provenance statements grounding what is known. Always renderable.',
  },
  {
    key: 'visibilityRequirement',
    displayName: 'Visibility requirement',
    backingTable: null,
    spineTableKey: null,
    sourceKind: 'policy',
    seedRequired: false,
    schemaRequired: false,
    migrationRequired: false,
    description: 'Authorization/visibility policy per entity. Always renderable.',
  },
]);

export function getCrmSpineEntity(key: CrmSpineEntityKey): CrmSpineEntityDescriptor {
  const found = CRM_SPINE_ENTITIES.find((e) => e.key === key);
  if (!found) {
    // Unreachable: the union and the registry are kept in lockstep.
    throw new Error(`Unknown CRM spine entity: ${key}`);
  }
  return found;
}

// ---------------------------------------------------------------------------
// Pure projections of facts already held (NOT fabrication)
// ---------------------------------------------------------------------------

/**
 * Project the existing borrower/client stub into a PROVISIONAL account identity.
 * This is not a full Account: every full-account attribute stays null and
 * `isProvisional` is true. Returns null when there is no stub to project.
 */
export function toProvisionalAccount(
  client: CrmCanonicalClientNode | null | undefined,
): CrmAccount | null {
  if (!client) return null;
  return {
    id: client.id,
    name: client.name ?? null,
    isProvisional: true,
    origin: 'provisional-stub',
    backingLogicalName: 'cr664_crmorganization',
    provisionalFromLogicalName: 'cr664_clientrelationship',
    provisionalFromRecordId: client.id,
    accountType: null,
    legalName: null,
    industry: null,
    relationshipStartDate: null,
  };
}

/**
 * Derive coverage team members ONLY from the existing authorized banker/team
 * facts. No other source is consulted; returns [] when neither is present.
 */
export function coverageTeamFromAuthorizedFacts(facts: {
  team?: CrmTeamNode | null;
  assignedBanker?: CrmBankerNode | null;
}): CrmCoverageTeamMember[] {
  const members: CrmCoverageTeamMember[] = [];
  const banker = facts.assignedBanker ?? null;
  const team = facts.team ?? null;
  if (banker) {
    members.push({
      id: banker.id,
      memberType: 'banker',
      name: banker.name ?? null,
      coverageRole: 'assigned-banker',
      sourceLogicalName: 'cr664_banker',
      sourceRecordId: banker.id,
      origin: 'authorized-fact',
    });
  }
  if (team) {
    members.push({
      id: team.id,
      memberType: 'team',
      name: team.name ?? null,
      coverageRole: 'coverage-team',
      sourceLogicalName: 'cr664_team',
      sourceRecordId: team.id,
      origin: 'authorized-fact',
    });
  }
  return members;
}
