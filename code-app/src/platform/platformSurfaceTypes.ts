/**
 * Phase 142B — Governed platform metadata surface types.
 *
 * Read-only catalog/surface types over the Phase 142A object/view registries.
 * Expose metadata; never mutate it. No write-enabled defaults, no schema
 * mutation state, no user-created objects, no external source URLs, and missing
 * derivers are surfaced as disabled/planned (never faked available).
 */

import type {
  PlatformObjectAction,
  PlatformObjectForbiddenAction,
  PlatformWorkspace,
  PlatformAuditPolicy,
  PlatformPiiPolicy,
  PlatformEvidencePolicy,
} from './platformObjectModelTypes';
import type { PlatformViewFilter } from './platformViewRegistry';

export type PlatformSurfaceStatus =
  | 'available_read_only'
  | 'available_write_gated'
  | 'planned'
  | 'blocked_missing_permission'
  | 'blocked_missing_deriver'
  | 'disabled_not_configured';

/** Who is viewing the metadata surface. `admin` / `strategy` see the full catalog. */
export type PlatformViewerWorkspace = PlatformWorkspace | 'strategy';

export interface PlatformViewerContext {
  workspace: PlatformViewerWorkspace;
  /** Optional explicit permission scopes; widens nothing beyond the registry. */
  permittedScopes?: readonly string[];
}

export interface PlatformObjectCatalogItem {
  objectKey: string;
  displayName: string;
  domain: string;
  sourceModule: string;
  sourceTable?: string;
  ownerWorkspace: PlatformWorkspace;
  permissionScope: string;
  readModelAvailable: boolean;
  writeModelAvailable: boolean;
  writeEnabledDefault: false;
  allowedActions: readonly PlatformObjectAction[];
  forbiddenActions: readonly PlatformObjectForbiddenAction[];
  relationshipCount: number;
  viewCount: number;
  piiPolicy: PlatformPiiPolicy;
  evidencePolicy: PlatformEvidencePolicy;
  auditPolicy: PlatformAuditPolicy;
  status: PlatformSurfaceStatus;
  caveats: readonly string[];
}

export interface PlatformViewCatalogItem {
  viewKey: string;
  objectKey: string;
  displayName: string;
  workspace: string;
  columns: readonly string[];
  filters: readonly PlatformViewFilter[];
  sort: readonly { field: string; direction: 'asc' | 'desc' }[];
  riskClass: string;
  requiresPermission: string;
  sourceDeriver: string;
  route?: string;
  readOnly: true;
  status: PlatformSurfaceStatus;
  caveats: readonly string[];
}

export interface PlatformObjectRelationshipEdge {
  fromObjectKey: string;
  toObjectKey: string;
  relationshipType: string;
  label: string;
  direction: 'outbound' | 'inbound';
  source: string;
  required: boolean;
  visible: boolean;
  caveats: readonly string[];
}

export interface PlatformWorkspaceCapabilityGroup {
  groupKey: string;
  displayName: string;
  objects: readonly string[];
  views: readonly string[];
  workflowRoutes: readonly string[];
  productProfiles: readonly string[];
  shippedCapabilities: readonly string[];
  plannedCapabilities: readonly string[];
  blockers: readonly string[];
  nextRecommendedPhases: readonly string[];
}

export interface PlatformMetadataBlocker {
  code: string;
  message: string;
}

export interface PlatformMetadataReadiness {
  objectCount: number;
  viewCount: number;
  edgeCount: number;
  readOnlyCount: number;
  writeGatedCount: number;
  plannedCount: number;
  disabledCount: number;
}

export interface PlatformMetadataAuditSummary {
  generatedForWorkspace: PlatformViewerWorkspace;
  objectCount: number;
  viewCount: number;
  /** STRUCTURAL: the metadata surface carries no record data and no PII. */
  containsRecordData: false;
  containsPii: false;
}

export interface PlatformMetadataSurfaceState {
  objects: readonly PlatformObjectCatalogItem[];
  views: readonly PlatformViewCatalogItem[];
  relationshipEdges: readonly PlatformObjectRelationshipEdge[];
  workspaceGroups: readonly PlatformWorkspaceCapabilityGroup[];
  readiness: PlatformMetadataReadiness;
  blockers: readonly PlatformMetadataBlocker[];
  warnings: readonly string[];
  auditSummary: PlatformMetadataAuditSummary;
}
