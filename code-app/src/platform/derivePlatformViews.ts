/**
 * Phase 142A — Governed view model deriver.
 *
 * PURE. Projects the view registry with integrity checks: every view has a
 * workspace + permission + structured (non-string) filters + an honest empty
 * state, every view is read-only, and every view references a known object.
 */

import { PLATFORM_VIEW_REGISTRY, type PlatformViewDefinition } from './platformViewRegistry';
import { ALL_PLATFORM_OBJECT_KEYS } from './platformObjectRegistry';

export interface PlatformViewModelIntegrity {
  allHaveWorkspace: boolean;
  allHavePermission: boolean;
  allReadOnly: boolean;
  allReferenceKnownObject: boolean;
  noRawQueryStrings: boolean;
  allHaveEmptyState: boolean;
  violations: readonly string[];
}

export interface PlatformViewModelResult {
  views: readonly PlatformViewDefinition[];
  integrity: PlatformViewModelIntegrity;
}

/** A filter is "raw" (forbidden) if any value smuggles a SQL/OData fragment. */
function hasRawQueryString(v: PlatformViewDefinition): boolean {
  return v.filters.some((f) => {
    const vals = Array.isArray(f.value) ? f.value : [f.value];
    return vals.some((x) => typeof x === 'string' && /\b(select|where|filter=|\$filter|odata|;|--)\b/i.test(x));
  });
}

export function derivePlatformViews(
  views: readonly PlatformViewDefinition[] = PLATFORM_VIEW_REGISTRY,
): PlatformViewModelResult {
  const knownObjects = new Set(ALL_PLATFORM_OBJECT_KEYS);
  const violations: string[] = [];

  for (const v of views) {
    if (!v.workspace) violations.push(`${v.viewKey}: missing workspace.`);
    if (!v.requiresPermission) violations.push(`${v.viewKey}: missing permission.`);
    if (v.riskClass !== 'runtime_read') violations.push(`${v.viewKey}: not read-only.`);
    if (!knownObjects.has(v.objectKey)) violations.push(`${v.viewKey}: references unknown object "${v.objectKey}".`);
    if (hasRawQueryString(v)) violations.push(`${v.viewKey}: contains a raw query string.`);
    if (!v.emptyState) violations.push(`${v.viewKey}: missing empty state.`);
  }

  return {
    views,
    integrity: {
      allHaveWorkspace: views.every((v) => !!v.workspace),
      allHavePermission: views.every((v) => !!v.requiresPermission),
      allReadOnly: views.every((v) => v.riskClass === 'runtime_read'),
      allReferenceKnownObject: views.every((v) => knownObjects.has(v.objectKey)),
      noRawQueryStrings: !views.some(hasRawQueryString),
      allHaveEmptyState: views.every((v) => !!v.emptyState),
      violations,
    },
  };
}
