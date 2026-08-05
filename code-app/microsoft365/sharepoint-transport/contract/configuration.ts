import { createHash } from 'node:crypto';
import {
  CONTRACT_VERSION,
  TARGET_LIBRARY_ID,
  TARGET_ROOT_PATH,
  TARGET_SITE_URL,
  type SharePointTransportConfiguration,
} from './types.js';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/;

export type ConfigurationValidation =
  | { readonly valid: true; readonly configuration: SharePointTransportConfiguration }
  | { readonly valid: false; readonly reasons: readonly string[] };

export function canonicalConfigurationFields(config: Omit<SharePointTransportConfiguration, 'configurationHash'>): Readonly<Record<string, string>> {
  return Object.freeze({
    tenantId: config.tenantId,
    graphSiteId: config.graphSiteId,
    graphDriveId: config.graphDriveId,
    governedRootItemId: config.governedRootItemId ?? '',
    verifiedRootPath: config.verifiedRootPath ?? '',
    siteUrl: config.siteUrl,
    libraryId: config.libraryId,
    contractVersion: config.contractVersion,
    connectorIdentity: config.connectorIdentity,
    runtimeIdentity: config.runtimeIdentity,
    permissionGrantEvidenceId: config.permissionGrantEvidenceId,
    configurationVersion: config.configurationVersion,
  });
}

export function configurationHash(config: Omit<SharePointTransportConfiguration, 'configurationHash'>): string {
  return createHash('sha256').update(JSON.stringify(canonicalConfigurationFields(config))).digest('hex');
}

export function validateConfiguration(value: Partial<SharePointTransportConfiguration> | undefined): ConfigurationValidation {
  const reasons: string[] = [];
  if (!value || !GUID.test(value.tenantId ?? '')) reasons.push('tenantId must be an immutable Entra tenant GUID.');
  if (!value?.graphSiteId?.trim()) reasons.push('graphSiteId is unresolved.');
  if (!value?.graphDriveId?.trim()) reasons.push('graphDriveId is unresolved.');
  if (!value?.governedRootItemId?.trim() && value?.verifiedRootPath !== TARGET_ROOT_PATH) reasons.push('A governed root item ID or the verified governed root path is required.');
  if (value?.verifiedRootPath && value.verifiedRootPath !== TARGET_ROOT_PATH) reasons.push('verifiedRootPath is not the approved governed root.');
  if (value?.siteUrl !== TARGET_SITE_URL) reasons.push('siteUrl is not the approved Business Lending site.');
  if (value?.libraryId !== TARGET_LIBRARY_ID) reasons.push('libraryId is not the approved SharePoint library/list ID.');
  if (value?.contractVersion !== CONTRACT_VERSION) reasons.push('contractVersion is not approved.');
  for (const field of ['connectorIdentity', 'runtimeIdentity', 'permissionGrantEvidenceId', 'configurationVersion'] as const) {
    if (!value?.[field]?.trim()) reasons.push(`${field} is unresolved.`);
  }
  if (!HASH.test(value?.configurationHash ?? '')) reasons.push('configurationHash is missing or malformed.');
  if (!reasons.length) {
    const supplied = value as SharePointTransportConfiguration;
    const { configurationHash: suppliedHash, ...hashFields } = supplied;
    if (configurationHash(hashFields) !== suppliedHash) reasons.push('configurationHash does not match the immutable activation fields.');
  }
  return reasons.length ? { valid: false, reasons } : { valid: true, configuration: value as SharePointTransportConfiguration };
}
