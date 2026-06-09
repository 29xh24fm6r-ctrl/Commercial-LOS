/**
 * Phase 142A — Governed platform object registry (constants only).
 *
 * A metadata registry of the platform's governed objects, aligned to the current
 * cr664 schema and app modules. No writes are enabled here, no UI schema
 * mutation, no user-created fields, and no arbitrary table names.
 */

import type {
  PlatformObjectDefinition,
  PlatformObjectAction,
  PlatformObjectForbiddenAction,
  PlatformWorkspace,
  PlatformAuditPolicy,
  PlatformPiiPolicy,
  PlatformEvidencePolicy,
  PlatformObjectRelationship,
} from './platformObjectModelTypes';

const READ_ONLY: readonly PlatformObjectAction[] = ['read', 'search'];
const READ_PREVIEW: readonly PlatformObjectAction[] = ['read', 'search', 'preview'];
const READ_DRAFT: readonly PlatformObjectAction[] = ['read', 'search', 'create_draft', 'update_draft'];

const BASE_FORBIDDEN: readonly PlatformObjectForbiddenAction[] = [
  'delete', 'schema_mutate', 'create_custom_field', 'final_approve', 'covenant_waive', 'borrower_outreach', 'live_write_default',
];

interface ObjOpts {
  sourceTable?: string;
  ownerWorkspace?: PlatformWorkspace;
  permissionScope?: string;
  allowedActions?: readonly PlatformObjectAction[];
  writeModelAvailable?: boolean;
  relationships?: readonly PlatformObjectRelationship[];
  primaryDisplayField?: string;
  auditPolicy?: PlatformAuditPolicy;
  piiPolicy?: PlatformPiiPolicy;
  evidencePolicy?: PlatformEvidencePolicy;
}

function obj(objectKey: string, displayName: string, domain: string, sourceModule: string, opts: ObjOpts = {}): PlatformObjectDefinition {
  return {
    objectKey,
    displayName,
    domain,
    sourceTable: opts.sourceTable,
    sourceModule,
    ownerWorkspace: opts.ownerWorkspace ?? 'shared',
    permissionScope: opts.permissionScope ?? `${opts.ownerWorkspace ?? 'shared'}:${objectKey}`,
    readModelAvailable: true,
    writeModelAvailable: opts.writeModelAvailable ?? false,
    writeEnabledDefault: false,
    allowedActions: opts.allowedActions ?? READ_ONLY,
    forbiddenActions: BASE_FORBIDDEN,
    relationships: opts.relationships ?? [],
    primaryDisplayField: opts.primaryDisplayField ?? 'name',
    auditPolicy: opts.auditPolicy ?? 'read_audit',
    piiPolicy: opts.piiPolicy ?? 'no_pii',
    evidencePolicy: opts.evidencePolicy ?? 'not_applicable',
  };
}

export const PLATFORM_OBJECT_REGISTRY: readonly PlatformObjectDefinition[] = Object.freeze([
  obj('deal', 'Deal', 'origination', 'deals', { sourceTable: 'cr664_loandeal', ownerWorkspace: 'banker', permissionScope: 'banker:deal', primaryDisplayField: 'dealName', auditPolicy: 'full_audit' }),
  obj('crm_organization', 'CRM Organization', 'crm', 'crm', { sourceTable: 'cr664_crmorganization', ownerWorkspace: 'banker', permissionScope: 'banker:crm', primaryDisplayField: 'legalName', piiPolicy: 'no_pii', relationships: [{ toObjectKey: 'crm_person', kind: 'child' }] }),
  obj('crm_person', 'CRM Person', 'crm', 'crm', { sourceTable: 'cr664_crmperson', ownerWorkspace: 'banker', permissionScope: 'banker:crm', primaryDisplayField: 'fullName', piiPolicy: 'contains_pii_masked' }),
  obj('crm_contact_point', 'CRM Contact Point', 'crm', 'crm', { sourceTable: 'cr664_crmcontactpoint', ownerWorkspace: 'banker', permissionScope: 'banker:crm', primaryDisplayField: 'label', piiPolicy: 'sensitive_redacted' }),
  obj('crm_relationship', 'CRM Relationship', 'crm', 'crm', { sourceTable: 'cr664_crmrelationship', ownerWorkspace: 'banker', permissionScope: 'banker:crm', primaryDisplayField: 'relationshipType' }),
  obj('annual_review', 'Annual Review', 'annual_review', 'annualReview', { ownerWorkspace: 'banker', permissionScope: 'banker:annual_review', primaryDisplayField: 'annualReviewId', evidencePolicy: 'evidence_backed', auditPolicy: 'full_audit' }),
  obj('borrower_request', 'Borrower Request', 'annual_review', 'annualReview', { ownerWorkspace: 'banker', permissionScope: 'banker:annual_review', allowedActions: READ_PREVIEW, primaryDisplayField: 'packageId', piiPolicy: 'sensitive_redacted' }),
  obj('delivery_adapter_state', 'Delivery Adapter State', 'annual_review', 'annualReview', { ownerWorkspace: 'banker', permissionScope: 'banker:annual_review', allowedActions: READ_ONLY, primaryDisplayField: 'channel' }),
  obj('financial_spread_snapshot', 'Financial Spread Snapshot', 'annual_review', 'annualReview', { ownerWorkspace: 'banker', permissionScope: 'banker:annual_review', primaryDisplayField: 'annualReviewId', evidencePolicy: 'evidence_backed' }),
  obj('covenant_test_result', 'Covenant Test Result', 'annual_review', 'annualReview', { ownerWorkspace: 'banker', permissionScope: 'banker:annual_review', primaryDisplayField: 'covenantId', evidencePolicy: 'evidence_backed' }),
  obj('memo_package', 'Memo Package', 'annual_review', 'annualReview', { ownerWorkspace: 'banker', permissionScope: 'banker:annual_review', allowedActions: READ_PREVIEW, primaryDisplayField: 'packageType', evidencePolicy: 'evidence_backed' }),
  obj('board_package', 'Board Package', 'annual_review', 'annualReview', { ownerWorkspace: 'manager', permissionScope: 'manager:annual_review', allowedActions: READ_PREVIEW, primaryDisplayField: 'packageType', evidencePolicy: 'evidence_backed' }),
  obj('fdic_package', 'FDIC Package', 'annual_review', 'annualReview', { ownerWorkspace: 'manager', permissionScope: 'manager:annual_review', allowedActions: READ_PREVIEW, primaryDisplayField: 'packageType', evidencePolicy: 'evidence_backed' }),
  obj('portfolio_boarded_loan', 'Portfolio Boarded Loan', 'portfolio_boarding', 'portfolioBoarding', { sourceTable: 'cr664_portfolioboardedloan', ownerWorkspace: 'manager', permissionScope: 'manager:portfolio', primaryDisplayField: 'loanNumber', auditPolicy: 'full_audit', evidencePolicy: 'evidence_backed' }),
  obj('document', 'Document', 'documents', 'documents', { ownerWorkspace: 'banker', permissionScope: 'banker:documents', allowedActions: READ_DRAFT, writeModelAvailable: true, primaryDisplayField: 'documentName', evidencePolicy: 'evidence_backed' }),
  obj('evidence', 'Evidence', 'documents', 'documents', { ownerWorkspace: 'banker', permissionScope: 'banker:documents', primaryDisplayField: 'evidenceId', evidencePolicy: 'evidence_backed' }),
  obj('task', 'Task', 'tasking', 'tasks', { ownerWorkspace: 'banker', permissionScope: 'banker:tasks', allowedActions: READ_DRAFT, writeModelAvailable: true, primaryDisplayField: 'title' }),
  obj('exception', 'Exception', 'monitoring', 'portfolioBoarding', { ownerWorkspace: 'manager', permissionScope: 'manager:exceptions', primaryDisplayField: 'exceptionId' }),
  obj('tickler', 'Tickler', 'monitoring', 'portfolioBoarding', { ownerWorkspace: 'manager', permissionScope: 'manager:portfolio', primaryDisplayField: 'ticklerId' }),
  obj('collateral', 'Collateral', 'monitoring', 'portfolioBoarding', { ownerWorkspace: 'manager', permissionScope: 'manager:portfolio', primaryDisplayField: 'collateralId' }),
  obj('insurance', 'Insurance', 'monitoring', 'portfolioBoarding', { ownerWorkspace: 'manager', permissionScope: 'manager:portfolio', primaryDisplayField: 'policyNumber' }),
  obj('user_role_workspace', 'User / Role / Workspace', 'security', 'identity', { sourceTable: 'cr664_platformuser', ownerWorkspace: 'admin', permissionScope: 'admin:identity', primaryDisplayField: 'displayName', piiPolicy: 'contains_pii_masked' }),
]);

export const ALL_PLATFORM_OBJECT_KEYS: readonly string[] = Object.freeze(
  PLATFORM_OBJECT_REGISTRY.map((o) => o.objectKey),
);

export function getPlatformObject(objectKey: string): PlatformObjectDefinition | undefined {
  return PLATFORM_OBJECT_REGISTRY.find((o) => o.objectKey === objectKey);
}
