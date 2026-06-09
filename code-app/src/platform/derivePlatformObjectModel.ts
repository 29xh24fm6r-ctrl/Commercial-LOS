/**
 * Phase 142A — Governed platform object model deriver.
 *
 * PURE. Projects the object registry into a model with integrity checks: every
 * object has an owner workspace + permission scope, writes are never enabled by
 * default, no arbitrary table names appear, and no schema mutation is permitted.
 */

import {
  PLATFORM_OBJECT_REGISTRY,
} from './platformObjectRegistry';
import type { PlatformObjectDefinition, PlatformObjectModel } from './platformObjectModelTypes';

/** Only governed cr664 tables (or no source table) are permitted. */
function isGovernedTable(t: string | undefined): boolean {
  return t === undefined || t.startsWith('cr664_') || t === 'systemuser';
}

export interface PlatformObjectModelIntegrity {
  allHaveOwnerWorkspace: boolean;
  allHavePermissionScope: boolean;
  noWritesEnabledByDefault: boolean;
  noArbitraryTableNames: boolean;
  schemaMutationForbidden: boolean;
  violations: readonly string[];
}

export interface PlatformObjectModelResult {
  model: PlatformObjectModel;
  integrity: PlatformObjectModelIntegrity;
}

export function derivePlatformObjectModel(
  objects: readonly PlatformObjectDefinition[] = PLATFORM_OBJECT_REGISTRY,
): PlatformObjectModelResult {
  const violations: string[] = [];

  for (const o of objects) {
    if (!o.ownerWorkspace) violations.push(`${o.objectKey}: missing owner workspace.`);
    if (!o.permissionScope) violations.push(`${o.objectKey}: missing permission scope.`);
    if ((o.writeEnabledDefault as boolean) === true) violations.push(`${o.objectKey}: write enabled by default (forbidden).`);
    if (!isGovernedTable(o.sourceTable)) violations.push(`${o.objectKey}: non-governed table "${o.sourceTable}".`);
    if (!o.forbiddenActions.includes('schema_mutate')) violations.push(`${o.objectKey}: schema mutation not forbidden.`);
    if (!o.forbiddenActions.includes('create_custom_field')) violations.push(`${o.objectKey}: custom field creation not forbidden.`);
  }

  return {
    model: { objects },
    integrity: {
      allHaveOwnerWorkspace: objects.every((o) => !!o.ownerWorkspace),
      allHavePermissionScope: objects.every((o) => !!o.permissionScope),
      noWritesEnabledByDefault: objects.every((o) => (o.writeEnabledDefault as boolean) === false),
      noArbitraryTableNames: objects.every((o) => isGovernedTable(o.sourceTable)),
      schemaMutationForbidden: objects.every((o) => o.forbiddenActions.includes('schema_mutate')),
      violations,
    },
  };
}
