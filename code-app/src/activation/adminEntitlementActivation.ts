import {
  ADMIN_ENTITLEMENT_WRITE_ENABLED,
  type EntitlementWriteTransport,
  type EntitlementWritePayload,
  type EntitlementAuditSink,
  type AdminEntitlementAuditPayload,
} from '../access/adminEntitlementGrantAdapter';
import {
  ADMIN_ENTITLEMENT_REVOKE_ENABLED,
  type EntitlementRevokeTransport,
  type EntitlementRevokeAuditSink,
  type AdminEntitlementRevokeAuditPayload,
} from '../access/adminEntitlementRevokeAdapter';
import {
  deriveCapabilitySmokeReadiness,
  type SmokeEvidenceRegistryInput,
} from '../access/operatorSmokeEvidenceRegistry';
import { evaluateLaunchGates, type CapabilityReadiness } from './launchReadiness';

/**
 * Phase 212 — Admin Grant/Revoke live transport WIRING.
 *
 * The Phase 208/209 adapters already model every governance gate over INJECTED
 * transport + audit seams (disabled by default, fail-closed, audit partial-success,
 * deactivate-never-delete, last-admin guard). Phase 212 supplies the concrete
 * Dataverse transport seams + audit sink seam they accept, and a readiness model
 * that reports — against the Phase 211 smoke evidence — exactly what still blocks a
 * live grant/revoke. It NEVER flips a gate and performs NO write here; the Dataverse
 * transports only call the SDK when actually invoked at runtime (never in tests).
 *
 * This manages LOS app-level access only. It does NOT manage Microsoft tenant
 * access, Entra role assignments, or Dataverse security roles, and the copy must
 * never imply it does.
 */

export const ADMIN_ENTITLEMENT_SCOPE_NOTICE =
  'Manages LOS app-level workspace entitlements only. Microsoft tenant access, ' +
  'Entra role assignments, and Dataverse security roles are managed outside this console.';

/**
 * Build a Dataverse-backed GRANT transport. The generated service is loaded via
 * dynamic import so this module's static graph stays SDK-free; `createEntitlement`
 * is only reached when the governed adapter actually performs a live grant.
 */
export function createDataverseEntitlementGrantTransport(): EntitlementWriteTransport {
  return {
    async createEntitlement(payload: EntitlementWritePayload) {
      try {
        const { Cr664_workspaceentitlementsesService } = await import(
          '../generated/services/Cr664_workspaceentitlementsesService'
        );
        const res = await Cr664_workspaceentitlementsesService.create({
          cr664_entitlementname: `${payload.accessLevelName} entitlement`,
          cr664_accesslevel: payload.accessLevelValue as never,
          'cr664_LOSUserProfile@odata.bind': undefined,
          'cr664_Workspace@odata.bind': `/cr664_platformworkspaces(${payload.workspaceId})`,
          statecode: 0 as never,
        } as never);
        return res.success
          ? { ok: true, id: res.data?.cr664_workspaceentitlementsid }
          : { ok: false, error: res.error?.message ?? 'create_failed' };
      } catch (err: unknown) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

/**
 * Build a Dataverse-backed REVOKE transport. Revoke DEACTIVATES (sets statecode to
 * Inactive) — it NEVER deletes an entitlement row.
 */
export function createDataverseEntitlementRevokeTransport(): EntitlementRevokeTransport {
  return {
    async deactivateEntitlement(entitlementId: string) {
      try {
        const { Cr664_workspaceentitlementsesService } = await import(
          '../generated/services/Cr664_workspaceentitlementsesService'
        );
        // Deactivate = update statecode to 1 (Inactive). No delete is ever called.
        const res = await Cr664_workspaceentitlementsesService.update(entitlementId, {
          statecode: 1 as never,
        });
        return res.success ? { ok: true } : { ok: false, error: res.error?.message ?? 'deactivate_failed' };
      } catch (err: unknown) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

/** A grant audit sink backed by an injected audit-writer (a Dataverse audit table when wired). */
export function createEntitlementGrantAuditSink(
  write: (audit: AdminEntitlementAuditPayload) => Promise<{ ok: boolean; error?: string }>,
): EntitlementAuditSink {
  return { write };
}
export function createEntitlementRevokeAuditSink(
  write: (audit: AdminEntitlementRevokeAuditPayload) => Promise<{ ok: boolean; error?: string }>,
): EntitlementRevokeAuditSink {
  return { write };
}

export interface AdminEntitlementActivationInput {
  /** Live config flags (default to the build-time OFF constants). */
  readonly grantWriteEnabled?: boolean;
  readonly revokeEnabled?: boolean;
  readonly singleRecordSmokeEnabled: boolean;
  readonly actorIsSuperAdmin: boolean;
  /** True once a Dataverse transport + audit sink are injected for each side. */
  readonly grantTransportWired: boolean;
  readonly grantAuditWired: boolean;
  readonly revokeTransportWired: boolean;
  readonly revokeAuditWired: boolean;
  /** Phase 211 smoke evidence. */
  readonly evidence: SmokeEvidenceRegistryInput;
}

export interface AdminEntitlementActivationReadiness {
  readonly grant: CapabilityReadiness;
  readonly revoke: CapabilityReadiness;
  readonly scopeNotice: string;
}

/** Readiness for both grant and revoke, integrating the 211 smoke evidence. */
export function deriveAdminEntitlementActivation(
  input: AdminEntitlementActivationInput,
): AdminEntitlementActivationReadiness {
  const readiness = deriveCapabilitySmokeReadiness(input.evidence);
  const grantSmoke = readiness.find((r) => r.capability === 'admin-entitlement-grant')!;
  const revokeSmoke = readiness.find((r) => r.capability === 'admin-entitlement-revoke')!;

  const grant = evaluateLaunchGates('admin-entitlement-grant', [
    { name: 'ADMIN_ENTITLEMENT_WRITE_ENABLED', satisfied: (input.grantWriteEnabled ?? (ADMIN_ENTITLEMENT_WRITE_ENABLED as boolean)) === true },
    { name: 'singleRecordSmokeEnabled', satisfied: input.singleRecordSmokeEnabled === true },
    { name: 'actor is Super Admin', satisfied: input.actorIsSuperAdmin === true },
    { name: 'Dataverse grant transport wired', satisfied: input.grantTransportWired === true },
    { name: 'grant audit sink wired', satisfied: input.grantAuditWired === true },
    { name: 'grant smoke passed + rollback verified', satisfied: !grantSmoke.blocksGo, detail: grantSmoke.blockReason ?? undefined },
  ]);

  const revoke = evaluateLaunchGates('admin-entitlement-revoke', [
    { name: 'ADMIN_ENTITLEMENT_REVOKE_ENABLED', satisfied: (input.revokeEnabled ?? (ADMIN_ENTITLEMENT_REVOKE_ENABLED as boolean)) === true },
    { name: 'singleRecordSmokeEnabled', satisfied: input.singleRecordSmokeEnabled === true },
    { name: 'actor is Super Admin', satisfied: input.actorIsSuperAdmin === true },
    { name: 'Dataverse revoke (deactivate) transport wired', satisfied: input.revokeTransportWired === true },
    { name: 'revoke audit sink wired', satisfied: input.revokeAuditWired === true },
    { name: 'revoke smoke passed + rollback verified', satisfied: !revokeSmoke.blocksGo, detail: revokeSmoke.blockReason ?? undefined },
  ]);

  return { grant, revoke, scopeNotice: ADMIN_ENTITLEMENT_SCOPE_NOTICE };
}
