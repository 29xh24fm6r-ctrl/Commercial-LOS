/**
 * Phase 142J — Admin configuration Dataverse schema PLAN (constants only).
 *
 * The declarative target schema for a FUTURE audit-backed persistence path for
 * Phase 142G admin configuration proposals / decisions / audit entries. CONSTANTS
 * ONLY — no IO, no fetch, no Dataverse calls, NO schema creation, NO seed mode.
 * This file is what a future read-only inspection compares the live environment
 * against. All logical names use the project publisher prefix `cr664_`.
 */

export type DataverseDataType = 'String' | 'Memo' | 'DateTime' | 'Lookup' | 'Picklist';
export type DataverseRequiredLevel = 'None' | 'Recommended' | 'ApplicationRequired';

export interface AdminConfigTargetTablePlan {
  logicalName: string;
  schemaName: string;
  displayName: string;
  pluralDisplayName: string;
  primaryNameColumn: string;
  description: string;
  sourceModelType: string;
  safetyNotes: string;
}

export interface AdminConfigTargetColumnPlan {
  tableLogicalName: string;
  logicalName: string;
  displayName: string;
  dataType: DataverseDataType;
  requiredLevel: DataverseRequiredLevel;
  description: string;
}

export interface AdminConfigTargetRelationshipPlan {
  relationshipSchemaName: string;
  fromTable: string;
  fromColumn: string;
  toTable: string;
  cardinality: 'ManyToOne';
  required: boolean;
  description: string;
}

export const ADMIN_CONFIG_PERSISTENCE_SCHEMA_VERSION = '142J.1';
export const ADMIN_CONFIG_PERSISTENCE_PUBLISHER_PREFIX = 'cr664';

const T = Object.freeze({
  proposal: 'cr664_adminconfigurationproposal',
  reviewDecision: 'cr664_adminconfigurationreviewdecision',
  auditEntry: 'cr664_adminconfigurationauditentry',
});

/** Entity-set names (plural) — the ONLY sets a future live adapter may touch. */
export const ADMIN_CONFIG_PERSISTENCE_ENTITY_SETS = Object.freeze({
  proposal: 'cr664_adminconfigurationproposals',
  reviewDecision: 'cr664_adminconfigurationreviewdecisions',
  auditEntry: 'cr664_adminconfigurationauditentries',
});

export const ADMIN_CONFIG_PERSISTENCE_ENTITY_SET_ALLOWLIST: readonly string[] = Object.freeze([
  ADMIN_CONFIG_PERSISTENCE_ENTITY_SETS.proposal,
  ADMIN_CONFIG_PERSISTENCE_ENTITY_SETS.reviewDecision,
  ADMIN_CONFIG_PERSISTENCE_ENTITY_SETS.auditEntry,
]);

function table(
  logicalName: string,
  displayName: string,
  pluralDisplayName: string,
  sourceModelType: string,
): AdminConfigTargetTablePlan {
  const short = logicalName.replace(/^cr664_/, '');
  return {
    logicalName,
    schemaName: `cr664_${short.charAt(0).toUpperCase()}${short.slice(1)}`,
    displayName,
    pluralDisplayName,
    primaryNameColumn: 'cr664_name',
    description: `${displayName} — admin configuration persistence table (future, disabled).`,
    sourceModelType,
    safetyNotes: 'Inspect live metadata before any future seed. Never create if a conflicting artifact already exists under this name.',
  };
}

export const ADMIN_CONFIG_TARGET_TABLES: readonly AdminConfigTargetTablePlan[] = Object.freeze([
  table(T.proposal, 'Admin Configuration Proposal', 'Admin Configuration Proposals', 'AdminConfigurationProposal'),
  table(T.reviewDecision, 'Admin Configuration Review Decision', 'Admin Configuration Review Decisions', 'AdminConfigurationReviewDecision'),
  table(T.auditEntry, 'Admin Configuration Audit Entry', 'Admin Configuration Audit Entries', 'AdminConfigurationAuditSummary'),
]);

function col(
  tableLogicalName: string,
  logicalName: string,
  displayName: string,
  dataType: DataverseDataType,
  requiredLevel: DataverseRequiredLevel = 'None',
): AdminConfigTargetColumnPlan {
  return { tableLogicalName, logicalName, displayName, dataType, requiredLevel, description: displayName };
}

const PROPOSAL_COLUMNS: readonly AdminConfigTargetColumnPlan[] = [
  col(T.proposal, 'cr664_name', 'Name', 'String', 'ApplicationRequired'),
  col(T.proposal, 'cr664_proposalidtext', 'Proposal id', 'String', 'ApplicationRequired'),
  col(T.proposal, 'cr664_proposaltype', 'Proposal type', 'Picklist'),
  col(T.proposal, 'cr664_title', 'Title', 'String'),
  col(T.proposal, 'cr664_summary', 'Summary', 'Memo'),
  col(T.proposal, 'cr664_requestedby', 'Requested by', 'String'),
  col(T.proposal, 'cr664_requestedat', 'Requested at', 'DateTime'),
  col(T.proposal, 'cr664_targetdomain', 'Target domain', 'Picklist'),
  col(T.proposal, 'cr664_targetkey', 'Target key', 'String'),
  col(T.proposal, 'cr664_riskclass', 'Risk class', 'Picklist'),
  col(T.proposal, 'cr664_status', 'Status', 'Picklist'),
  col(T.proposal, 'cr664_validationstatus', 'Validation status', 'Picklist'),
  col(T.proposal, 'cr664_blockersjson', 'Blockers JSON', 'Memo'),
  col(T.proposal, 'cr664_warningsjson', 'Warnings JSON', 'Memo'),
  col(T.proposal, 'cr664_impactsnapshotjson', 'Impact snapshot JSON', 'Memo'),
  col(T.proposal, 'cr664_redactedauditsummaryjson', 'Redacted audit summary JSON', 'Memo'),
  col(T.proposal, 'cr664_createdat', 'Created at', 'DateTime'),
  col(T.proposal, 'cr664_updatedat', 'Updated at', 'DateTime'),
];

const REVIEW_DECISION_COLUMNS: readonly AdminConfigTargetColumnPlan[] = [
  col(T.reviewDecision, 'cr664_name', 'Name', 'String', 'ApplicationRequired'),
  col(T.reviewDecision, 'cr664_decisionidtext', 'Decision id', 'String', 'ApplicationRequired'),
  col(T.reviewDecision, 'cr664_proposalidtext', 'Proposal id', 'String'),
  col(T.reviewDecision, 'cr664_decisiontype', 'Decision type', 'Picklist'),
  col(T.reviewDecision, 'cr664_decisionstatus', 'Decision status', 'Picklist'),
  col(T.reviewDecision, 'cr664_reviewer', 'Reviewer', 'String'),
  col(T.reviewDecision, 'cr664_reviewedat', 'Reviewed at', 'DateTime'),
  col(T.reviewDecision, 'cr664_reviewernotesredacted', 'Reviewer notes (redacted)', 'Memo'),
  col(T.reviewDecision, 'cr664_blockersjson', 'Blockers JSON', 'Memo'),
  col(T.reviewDecision, 'cr664_warningsjson', 'Warnings JSON', 'Memo'),
  col(T.reviewDecision, 'cr664_redactedauditsummaryjson', 'Redacted audit summary JSON', 'Memo'),
];

const AUDIT_COLUMNS: readonly AdminConfigTargetColumnPlan[] = [
  col(T.auditEntry, 'cr664_name', 'Name', 'String', 'ApplicationRequired'),
  col(T.auditEntry, 'cr664_auditidtext', 'Audit id', 'String', 'ApplicationRequired'),
  col(T.auditEntry, 'cr664_proposalidtext', 'Proposal id', 'String'),
  col(T.auditEntry, 'cr664_action', 'Action', 'String'),
  col(T.auditEntry, 'cr664_actor', 'Actor', 'String'),
  col(T.auditEntry, 'cr664_timestamp', 'Timestamp', 'DateTime'),
  col(T.auditEntry, 'cr664_redactedsnapshotjson', 'Redacted snapshot JSON', 'Memo'),
  col(T.auditEntry, 'cr664_reason', 'Reason', 'Memo'),
  col(T.auditEntry, 'cr664_blockersjson', 'Blockers JSON', 'Memo'),
  col(T.auditEntry, 'cr664_warningsjson', 'Warnings JSON', 'Memo'),
];

export const ADMIN_CONFIG_TARGET_COLUMNS: readonly AdminConfigTargetColumnPlan[] = Object.freeze([
  ...PROPOSAL_COLUMNS,
  ...REVIEW_DECISION_COLUMNS,
  ...AUDIT_COLUMNS,
]);

export const ADMIN_CONFIG_TARGET_RELATIONSHIPS: readonly AdminConfigTargetRelationshipPlan[] = Object.freeze([
  {
    relationshipSchemaName: 'cr664_adminconfigreviewdecision_proposal',
    fromTable: T.reviewDecision,
    fromColumn: 'cr664_proposalidtext',
    toTable: T.proposal,
    cardinality: 'ManyToOne',
    required: false,
    description: 'A review decision references its proposal (by proposal id text).',
  },
  {
    relationshipSchemaName: 'cr664_adminconfigauditentry_proposal',
    fromTable: T.auditEntry,
    fromColumn: 'cr664_proposalidtext',
    toTable: T.proposal,
    cardinality: 'ManyToOne',
    required: false,
    description: 'An audit entry references its proposal (by proposal id text).',
  },
]);

export const ALL_ADMIN_CONFIG_TARGET_TABLE_LOGICAL_NAMES: readonly string[] = Object.freeze(
  ADMIN_CONFIG_TARGET_TABLES.map((t) => t.logicalName),
);

export function adminConfigTargetColumnsForTable(logicalName: string): readonly AdminConfigTargetColumnPlan[] {
  return ADMIN_CONFIG_TARGET_COLUMNS.filter((c) => c.tableLogicalName === logicalName);
}
