/**
 * Phase 142B — Platform view catalog deriver.
 *
 * PURE, READ-ONLY. Projects the Phase 142A view registry into a catalog scoped
 * to the viewer's workspace. Views stay read-only; a missing sourceDeriver marks
 * a view disabled_not_configured; a route is shown only if it already exists.
 * No user-created views, no arbitrary query strings, no fetch.
 */

import { PLATFORM_VIEW_REGISTRY, type PlatformViewDefinition } from './platformViewRegistry';
import { ALL_PLATFORM_OBJECT_KEYS, getPlatformObject } from './platformObjectRegistry';
import type {
  PlatformViewCatalogItem,
  PlatformViewerContext,
  PlatformSurfaceStatus,
} from './platformSurfaceTypes';

export function isViewVisibleToViewer(
  view: PlatformViewDefinition,
  ctx: PlatformViewerContext,
): boolean {
  if (ctx.workspace === 'admin' || ctx.workspace === 'strategy') return true;
  // Manager surfaces include portfolio/team-owned objects already mapped to manager.
  if (view.workspace === ctx.workspace) return true;
  if (ctx.permittedScopes?.includes(view.requiresPermission)) return true;
  return false;
}

export interface DerivePlatformViewCatalogInput {
  context: PlatformViewerContext;
  views?: readonly PlatformViewDefinition[];
}

export function derivePlatformViewCatalog(
  input: DerivePlatformViewCatalogInput,
): readonly PlatformViewCatalogItem[] {
  const views = input.views ?? PLATFORM_VIEW_REGISTRY;
  const knownObjects = new Set(ALL_PLATFORM_OBJECT_KEYS);

  return views
    .filter((v) => isViewVisibleToViewer(v, input.context))
    .map((v) => {
      const caveats: string[] = [];
      let status: PlatformSurfaceStatus = 'available_read_only';
      if (!v.sourceDeriver) {
        status = 'disabled_not_configured';
        caveats.push('No source deriver configured; view is not available.');
      }
      if (!knownObjects.has(v.objectKey)) {
        caveats.push('References an object not present in the catalog.');
      }
      // A route is only surfaced when it is explicitly declared (never invented).
      const objectOwner = getPlatformObject(v.objectKey)?.ownerWorkspace;
      if (objectOwner && objectOwner !== 'shared' && v.workspace !== objectOwner && v.workspace !== 'manager') {
        caveats.push('View workspace differs from the object owner workspace.');
      }
      return {
        viewKey: v.viewKey,
        objectKey: v.objectKey,
        displayName: v.displayName,
        workspace: v.workspace,
        columns: v.columns,
        filters: v.filters,
        sort: v.sort,
        riskClass: v.riskClass,
        requiresPermission: v.requiresPermission,
        sourceDeriver: v.sourceDeriver,
        route: v.route,
        readOnly: true,
        status,
        caveats,
      };
    });
}
