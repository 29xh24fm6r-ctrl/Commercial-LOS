/**
 * Phase 141L — CRM live Dataverse adapter.
 *
 * The first real app-runtime write adapter for the CRM Relationship Master. It
 * maps CRM domain records to Dataverse payloads (via the Phase 141L mapper) and
 * performs create / read / update / search against ONLY the `cr664_crm*` schema,
 * through an INJECTED transport seam.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - The adapter performs NO IO itself: no `fetch`, no Dataverse SDK import.
 *     All access goes through the injected `CrmDataverseTransport`.
 *   - It only ever touches `cr664_crm*` entity sets; any other table fails closed.
 *   - There is NO delete path — the transport seam exposes no delete.
 *   - Fail-closed gate order: live flag → schema ready → transport present →
 *     authorization. Disabled by default.
 *   - Never invents values; raw tax ids throw; sensitive audit values redacted.
 */

import type {
  CrmOrganization,
  CrmPerson,
  CrmContactPoint,
  CrmRelationship,
  CrmRoleAssignment,
  CrmCommunicationPreference,
  CrmContactAuthorization,
  CrmVendorProfile,
  CrmTimelineEvent,
  CrmAuditEntry,
} from '../shared/crm/crmTypes';
import {
  CRM_PERSISTENCE_ERROR_CODES,
  type CrmLivePersistenceAdapter,
  type CrmLiveResult,
  type CrmPersistenceErrorCode,
} from './crmPersistenceTypes';
import type { CrmFeatureFlagState } from './crmFeatureFlags';
import type { CrmRuntimeSchemaGateResult } from './crmRuntimeSchemaGate';
import {
  crmEntitySetForLogicalName,
  type CrmDataverseTransport,
} from './crmLiveDataverseTransport';
import {
  CrmSensitiveValueError,
  type CrmDataversePayload,
  mapOrganizationToDataverse,
  mapPersonToDataverse,
  mapContactPointToDataverse,
  mapRelationshipToDataverse,
  mapRoleAssignmentToDataverse,
  mapCommunicationPreferenceToDataverse,
  mapContactAuthorizationToDataverse,
  mapVendorProfileToDataverse,
  mapTimelineEventToDataverse,
  mapAuditEntryToDataverse,
  mapDataverseToOrganization,
  mapDataverseToPerson,
  mapDataverseToContactPoint,
  mapDataverseToRelationship,
  mapDataverseToRoleAssignment,
  mapDataverseToVendorProfile,
  mapDataverseToTimelineEvent,
} from './crmDataverseMapper';

const E = CRM_PERSISTENCE_ERROR_CODES;

export interface CrmLiveAdapterAuthorization {
  isAuthorizedOperator?: boolean;
}

export interface CrmLiveAdapterOptions {
  /** The injected transport. Absent → adapter fails closed with not_configured. */
  transport?: CrmDataverseTransport;
  featureFlags: CrmFeatureFlagState;
  schemaGate: CrmRuntimeSchemaGateResult;
  /** Operator authorization context. Absent → unauthorized (fail closed). */
  authorization?: CrmLiveAdapterAuthorization;
  /** Injected clock for deterministic tests. */
  clock?: () => string;
}

function fail(
  operation: string,
  errorCode: CrmPersistenceErrorCode,
  message?: string,
): CrmLiveResult {
  return { ok: false, operation, errorCode, message };
}

// ---------------------------------------------------------------------------
// Disabled adapter (default)
// ---------------------------------------------------------------------------

export function createDisabledCrmLiveDataverseAdapter(): CrmLivePersistenceAdapter {
  const blocked = (operation: string): Promise<CrmLiveResult<never>> =>
    Promise.resolve(
      fail(operation, E.notConfigured, 'CRM live persistence is not enabled.') as CrmLiveResult<never>,
    );
  return {
    enabled: false,
    searchOrganizations: () => blocked('searchOrganizations'),
    readOrganization: () => blocked('readOrganization'),
    searchPeople: () => blocked('searchPeople'),
    readPerson: () => blocked('readPerson'),
    searchContactPoints: () => blocked('searchContactPoints'),
    searchRelationships: () => blocked('searchRelationships'),
    searchRoleAssignments: () => blocked('searchRoleAssignments'),
    searchVendorProfiles: () => blocked('searchVendorProfiles'),
    searchTimelineEvents: () => blocked('searchTimelineEvents'),
    saveOrganization: () => blocked('saveOrganization'),
    savePerson: () => blocked('savePerson'),
    saveContactPoint: () => blocked('saveContactPoint'),
    saveRelationship: () => blocked('saveRelationship'),
    saveRoleAssignment: () => blocked('saveRoleAssignment'),
    saveCommunicationPreference: () => blocked('saveCommunicationPreference'),
    saveContactAuthorization: () => blocked('saveContactAuthorization'),
    saveVendorProfile: () => blocked('saveVendorProfile'),
    addTimelineEvent: () => blocked('addTimelineEvent'),
    addAuditEntry: () => blocked('addAuditEntry'),
  };
}

// ---------------------------------------------------------------------------
// Live adapter (constructed only with an injected transport)
// ---------------------------------------------------------------------------

export function createCrmLiveDataverseAdapter(
  options: CrmLiveAdapterOptions,
): CrmLivePersistenceAdapter {
  const { transport, featureFlags, schemaGate, authorization } = options;

  /** Fail-closed gate, in the spec's precedence order. */
  function guard(operation: string): CrmLiveResult | null {
    if (featureFlags.CRM_LIVE_PERSISTENCE_ENABLED !== true) {
      return fail(operation, E.livePersistenceDisabled, 'CRM live persistence flag is off.');
    }
    if (!schemaGate.schemaReady) {
      return fail(operation, E.schemaNotReady, 'CRM schema is not verified ready.');
    }
    if (!transport) {
      return fail(operation, E.notConfigured, 'No CRM transport is configured.');
    }
    if (authorization?.isAuthorizedOperator !== true) {
      return fail(operation, E.permissionDenied, 'Operator is not authorized for CRM writes.');
    }
    return null;
  }

  async function write(
    operation: string,
    build: () => CrmDataversePayload,
  ): Promise<CrmLiveResult> {
    const blocked = guard(operation);
    if (blocked) return blocked;

    let payload: CrmDataversePayload;
    try {
      payload = build();
    } catch (err) {
      if (err instanceof CrmSensitiveValueError) {
        return fail(operation, E.sensitiveValueBlocked, err.message);
      }
      return fail(operation, E.validationFailed, (err as Error).message);
    }

    const entitySet = crmEntitySetForLogicalName(payload.entityName);
    if (!entitySet) {
      return fail(operation, E.disallowedTable, payload.entityName);
    }
    const res = await transport!.createRecord(entitySet, payload.fields);
    if (!res.ok) {
      return fail(operation, E.transportFailed, res.error);
    }
    return { ok: true, operation, recordId: res.id };
  }

  async function search<T>(
    operation: string,
    logicalName: string,
    query: string | undefined,
    mapBack: (fields: Record<string, unknown>) => T,
  ): Promise<CrmLiveResult<T>> {
    const blocked = guard(operation);
    if (blocked) return blocked as CrmLiveResult<T>;
    const entitySet = crmEntitySetForLogicalName(logicalName);
    if (!entitySet) return fail(operation, E.disallowedTable, logicalName) as CrmLiveResult<T>;
    const res = await transport!.searchRecords(entitySet, query);
    if (!res.ok || !res.records) {
      return fail(operation, E.transportFailed, res.error) as CrmLiveResult<T>;
    }
    return { ok: true, operation, records: res.records.map(mapBack) };
  }

  async function read<T>(
    operation: string,
    logicalName: string,
    recordId: string,
    mapBack: (fields: Record<string, unknown>) => T,
  ): Promise<CrmLiveResult<T>> {
    const blocked = guard(operation);
    if (blocked) return blocked as CrmLiveResult<T>;
    const entitySet = crmEntitySetForLogicalName(logicalName);
    if (!entitySet) return fail(operation, E.disallowedTable, logicalName) as CrmLiveResult<T>;
    const res = await transport!.readRecord(entitySet, recordId);
    if (!res.ok || !res.record) {
      return fail(operation, E.transportFailed, res.error) as CrmLiveResult<T>;
    }
    return { ok: true, operation, recordId, data: mapBack(res.record) };
  }

  return {
    enabled: true,

    // Reads / searches
    searchOrganizations: (query?: string) =>
      search<CrmOrganization>('searchOrganizations', 'cr664_crmorganization', query, mapDataverseToOrganization),
    readOrganization: (recordId: string) =>
      read<CrmOrganization>('readOrganization', 'cr664_crmorganization', recordId, mapDataverseToOrganization),
    searchPeople: (query?: string) =>
      search<CrmPerson>('searchPeople', 'cr664_crmperson', query, mapDataverseToPerson),
    readPerson: (recordId: string) =>
      read<CrmPerson>('readPerson', 'cr664_crmperson', recordId, mapDataverseToPerson),
    searchContactPoints: (query?: string) =>
      search<CrmContactPoint>('searchContactPoints', 'cr664_crmcontactpoint', query, mapDataverseToContactPoint),
    searchRelationships: (query?: string) =>
      search<CrmRelationship>('searchRelationships', 'cr664_crmrelationship', query, mapDataverseToRelationship),
    searchRoleAssignments: (query?: string) =>
      search<CrmRoleAssignment>('searchRoleAssignments', 'cr664_crmroleassignment', query, mapDataverseToRoleAssignment),
    searchVendorProfiles: (query?: string) =>
      search<CrmVendorProfile>('searchVendorProfiles', 'cr664_crmvendorprofile', query, mapDataverseToVendorProfile),
    searchTimelineEvents: (query?: string) =>
      search<CrmTimelineEvent>('searchTimelineEvents', 'cr664_crmtimelineevent', query, mapDataverseToTimelineEvent),

    // Writes
    saveOrganization: (org: CrmOrganization) =>
      write('saveOrganization', () => mapOrganizationToDataverse(org)),
    savePerson: (person: CrmPerson) =>
      write('savePerson', () => mapPersonToDataverse(person)),
    saveContactPoint: (cp: CrmContactPoint) =>
      write('saveContactPoint', () => mapContactPointToDataverse(cp)),
    saveRelationship: (rel: CrmRelationship) =>
      write('saveRelationship', () => mapRelationshipToDataverse(rel)),
    saveRoleAssignment: (role: CrmRoleAssignment) =>
      write('saveRoleAssignment', () => mapRoleAssignmentToDataverse(role)),
    saveCommunicationPreference: (pref: CrmCommunicationPreference) =>
      write('saveCommunicationPreference', () => mapCommunicationPreferenceToDataverse(pref)),
    saveContactAuthorization: (auth: CrmContactAuthorization) =>
      write('saveContactAuthorization', () => mapContactAuthorizationToDataverse(auth)),
    saveVendorProfile: (vendor: CrmVendorProfile) =>
      write('saveVendorProfile', () => mapVendorProfileToDataverse(vendor)),
    addTimelineEvent: (event: CrmTimelineEvent) =>
      write('addTimelineEvent', () => mapTimelineEventToDataverse(event)),
    addAuditEntry: (entry: CrmAuditEntry) =>
      write('addAuditEntry', () => mapAuditEntryToDataverse(entry)),
  };
}
