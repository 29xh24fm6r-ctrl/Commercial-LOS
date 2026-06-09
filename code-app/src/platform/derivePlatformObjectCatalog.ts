/**
 * Phase 142B — Platform object catalog deriver.
 *
 * PURE, READ-ONLY. Projects the Phase 142A object registry into a catalog scoped
 * to the viewer's workspace/permission context. Object visibility is METADATA
 * only — it never implies data visibility, never fetches, never writes, never
 * mutates metadata, and never invents routes or source tables.
 */

import { PLATFORM_OBJECT_REGISTRY } from './platformObjectRegistry';
import { PLATFORM_VIEW_REGISTRY } from './platformViewRegistry';
import type { PlatformObjectDefinition } from './platformObjectModelTypes';
import type {
  PlatformObjectCatalogItem,
  PlatformViewerContext,
  PlatformSurfaceStatus,
} from './platformSurfaceTypes';

export function isObjectVisibleToViewer(
  obj: PlatformObjectDefinition,
  ctx: PlatformViewerContext,
): boolean {
  if (ctx.workspace === 'admin' || ctx.workspace === 'strategy') return true;
  if (obj.ownerWorkspace === 'shared') return true;
  if (obj.ownerWorkspace === ctx.workspace) return true;
  if (ctx.permittedScopes?.includes(obj.permissionScope)) return true;
  return false;
}

export interface DerivePlatformObjectCatalogInput {
  context: PlatformViewerContext;
  objects?: readonly PlatformObjectDefinition[];
}

export function derivePlatformObjectCatalog(
  input: DerivePlatformObjectCatalogInput,
): readonly PlatformObjectCatalogItem[] {
  const objects = input.objects ?? PLATFORM_OBJECT_REGISTRY;
  const viewCounts = new Map<string, number>();
  for (const v of PLATFORM_VIEW_REGISTRY) {
    viewCounts.set(v.objectKey, (viewCounts.get(v.objectKey) ?? 0) + 1);
  }

  return objects
    .filter((o) => isObjectVisibleToViewer(o, input.context))
    .map((o) => {
      const status: PlatformSurfaceStatus = o.writeModelAvailable ? 'available_write_gated' : 'available_read_only';
      const caveats: string[] = [];
      if (o.writeModelAvailable) caveats.push('A write model exists but writes are disabled by default (governed).');
      return {
        objectKey: o.objectKey,
        displayName: o.displayName,
        domain: o.domain,
        sourceModule: o.sourceModule,
        sourceTable: o.sourceTable,
        ownerWorkspace: o.ownerWorkspace,
        permissionScope: o.permissionScope,
        readModelAvailable: o.readModelAvailable,
        writeModelAvailable: o.writeModelAvailable,
        writeEnabledDefault: false,
        allowedActions: o.allowedActions,
        forbiddenActions: o.forbiddenActions,
        relationshipCount: o.relationships.length,
        viewCount: viewCounts.get(o.objectKey) ?? 0,
        piiPolicy: o.piiPolicy,
        evidencePolicy: o.evidencePolicy,
        auditPolicy: o.auditPolicy,
        status,
        caveats,
      };
    });
}
