import { SystemusersService } from '../../generated/services/SystemusersService';

/**
 * Resolves the current authenticated user to a Dataverse systemuserid.
 *
 * The Power Apps SDK context surfaces only Entra identity values
 * (objectId, UPN, fullName). Dataverse writes that require a user
 * lookup — most notably `cr664_ChangedBy@odata.bind` on
 * cr664_AuditEvent — need a systemuserid.
 *
 * Lookup is by azureactivedirectoryobjectid, which mirrors the Entra
 * Object ID from getContext().user.objectId.
 *
 * Returns null if no systemuser is found for the current Entra OID
 * (e.g. local dev mock, or a user that hasn't been provisioned in this
 * environment yet). Callers must treat null as "writes unavailable"
 * rather than fabricating a placeholder.
 *
 * Phase 48: moved from src/admin/ to src/shared/governance/ so the
 * banker provider (and any future write-capable role provider) can
 * consume it without crossing a role boundary. The function body is
 * unchanged.
 */
export async function resolveCurrentSystemUserId(
  objectId: string | undefined,
): Promise<string | null> {
  if (!objectId) return null;
  const result = await SystemusersService.getAll({
    filter: `azureactivedirectoryobjectid eq '${objectId.replace(/'/g, "''")}'`,
    top: 1,
  });
  if (!result.success) {
    throw new Error(
      result.error?.message ?? 'Failed to look up current Dataverse systemuser',
    );
  }
  return result.data?.[0]?.systemuserid ?? null;
}
