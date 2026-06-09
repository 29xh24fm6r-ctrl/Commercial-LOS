/**
 * Phase 142A — Governed platform object model types.
 *
 * A Salesforce/Twenty/Corteza-inspired object model that is GOVERNED and
 * read-only in this phase. Metadata only — no dynamic Dataverse schema mutation,
 * no user-created fields, no writes enabled by the registry, and no arbitrary
 * entity/table names.
 */

export type PlatformWorkspace = 'banker' | 'team' | 'manager' | 'executive' | 'admin' | 'shared';

export type PlatformObjectAction =
  | 'read'
  | 'search'
  | 'create_draft'
  | 'update_draft'
  | 'preview';

export type PlatformObjectForbiddenAction =
  | 'delete'
  | 'schema_mutate'
  | 'create_custom_field'
  | 'final_approve'
  | 'covenant_waive'
  | 'borrower_outreach'
  | 'live_write_default';

export type PlatformAuditPolicy = 'full_audit' | 'audited_on_write' | 'read_audit' | 'none';
export type PlatformPiiPolicy = 'contains_pii_masked' | 'no_pii' | 'sensitive_redacted';
export type PlatformEvidencePolicy = 'evidence_backed' | 'evidence_optional' | 'not_applicable';

export interface PlatformObjectRelationship {
  toObjectKey: string;
  kind: 'lookup' | 'parent' | 'child' | 'reference';
}

export interface PlatformObjectDefinition {
  objectKey: string;
  displayName: string;
  domain: string;
  /** The governed cr664 source table, when one exists. Never an arbitrary name. */
  sourceTable?: string;
  sourceModule: string;
  ownerWorkspace: PlatformWorkspace;
  permissionScope: string;
  readModelAvailable: boolean;
  writeModelAvailable: boolean;
  /** Writes are NEVER enabled by the registry in this phase. */
  writeEnabledDefault: false;
  allowedActions: readonly PlatformObjectAction[];
  forbiddenActions: readonly PlatformObjectForbiddenAction[];
  relationships: readonly PlatformObjectRelationship[];
  primaryDisplayField: string;
  auditPolicy: PlatformAuditPolicy;
  piiPolicy: PlatformPiiPolicy;
  evidencePolicy: PlatformEvidencePolicy;
}

export interface PlatformObjectModel {
  objects: readonly PlatformObjectDefinition[];
}
