import { createHash } from 'node:crypto';
import { CONTRACT_VERSION, TARGET_LIBRARY_ID, TARGET_ROOT_PATH, TARGET_SITE_URL, type SharePointTransportConfiguration } from '../../contract/types.js';

const TENANT_ID = 'e5d2be43-2e2c-4968-b5f3-c73dd825ee80';
const SITE_ID = 'oldglory22.sharepoint.com,fcef8a95-b6b8-4c7f-85d9-d30c4d13aa8a,2c7f7bf5-9995-48b2-93a4-137bc741cf48';
const DRIVE_ID = 'b!lYrv_Li2f0yF2dMMTROqivV7fyyVmbJIk6QTe8dBz0gxIabBRnm5RLtMtGN6Fvg8';
const ROOT_ID = '01GLFG6KONJ5W27MKUD5AZRKTJWP2MGT5P';
const HASH = /^[0-9a-f]{64}$/;
const unresolved = (value: string | undefined) => !value?.trim() || value === 'UNRESOLVED';

export interface RuntimeConfiguration extends SharePointTransportConfiguration {
  readonly functionResourceId: string;
  readonly functionHostname: string;
  readonly managedIdentityClientId?: string;
  readonly idempotencyTable: string;
  readonly orphanTable: string;
  readonly dataverseAuthorizationAdapter: string;
}

export function canonicalRuntimeConfiguration(value: Omit<RuntimeConfiguration, 'configurationHash'>): Record<string, string> {
  return {
    tenantId: value.tenantId, graphSiteId: value.graphSiteId, graphDriveId: value.graphDriveId,
    governedRootItemId: value.governedRootItemId ?? '', governedRootPath: value.verifiedRootPath ?? '',
    siteUrl: value.siteUrl, libraryId: value.libraryId, contractVersion: value.contractVersion,
    configurationVersion: value.configurationVersion, functionResourceId: value.functionResourceId,
    functionHostname: value.functionHostname, connectorIdentity: value.connectorIdentity,
    runtimeIdentity: value.runtimeIdentity, permissionGrantEvidenceId: value.permissionGrantEvidenceId,
  };
}

export function calculateRuntimeConfigurationHash(value: Omit<RuntimeConfiguration, 'configurationHash'>): string {
  const fields = canonicalRuntimeConfiguration(value);
  if (Object.values(fields).some(unresolved)) throw new Error('RUNTIME_CONFIGURATION_UNRESOLVED');
  return createHash('sha256').update(JSON.stringify(fields)).digest('hex');
}

export function loadRuntimeConfiguration(env: NodeJS.ProcessEnv): RuntimeConfiguration {
  const value: RuntimeConfiguration = {
    tenantId: env.SP_TENANT_ID ?? '', graphSiteId: env.SP_GRAPH_SITE_ID ?? '', graphDriveId: env.SP_GRAPH_DRIVE_ID ?? '',
    governedRootItemId: env.SP_GOVERNED_ROOT_ITEM_ID, verifiedRootPath: env.SP_GOVERNED_ROOT_PATH as typeof TARGET_ROOT_PATH,
    siteUrl: env.SP_SITE_URL as typeof TARGET_SITE_URL, libraryId: env.SP_LIBRARY_ID as typeof TARGET_LIBRARY_ID,
    contractVersion: env.SP_CONTRACT_VERSION as typeof CONTRACT_VERSION, configurationVersion: env.SP_CONFIGURATION_VERSION ?? '',
    functionResourceId: env.SP_FUNCTION_RESOURCE_ID ?? '', functionHostname: env.SP_FUNCTION_HOSTNAME ?? '',
    connectorIdentity: env.SP_CONNECTOR_IDENTITY ?? '', runtimeIdentity: env.SP_RUNTIME_IDENTITY ?? '',
    managedIdentityClientId: env.SP_MANAGED_IDENTITY_CLIENT_ID || undefined,
    permissionGrantEvidenceId: env.SP_PERMISSION_GRANT_EVIDENCE_ID ?? '', configurationHash: env.SP_CONFIGURATION_HASH ?? '',
    idempotencyTable: env.SP_IDEMPOTENCY_TABLE ?? '', orphanTable: env.SP_ORPHAN_TABLE ?? '',
    dataverseAuthorizationAdapter: env.SP_DATAVERSE_AUTHORIZATION_ADAPTER ?? '',
  };
  const pinned = value.tenantId === TENANT_ID && value.graphSiteId === SITE_ID && value.graphDriveId === DRIVE_ID && value.governedRootItemId === ROOT_ID && value.verifiedRootPath === TARGET_ROOT_PATH && value.siteUrl === TARGET_SITE_URL && value.libraryId === TARGET_LIBRARY_ID && value.contractVersion === CONTRACT_VERSION;
  const required = [value.configurationVersion, value.functionResourceId, value.functionHostname, value.connectorIdentity, value.runtimeIdentity, value.permissionGrantEvidenceId, value.idempotencyTable, value.orphanTable, value.dataverseAuthorizationAdapter];
  if (!pinned || required.some(unresolved) || !HASH.test(value.configurationHash)) throw new Error('RUNTIME_CONFIGURATION_INVALID');
  const { configurationHash, ...fields } = value;
  if (calculateRuntimeConfigurationHash(fields) !== configurationHash) throw new Error('RUNTIME_CONFIGURATION_HASH_MISMATCH');
  return Object.freeze(value);
}
