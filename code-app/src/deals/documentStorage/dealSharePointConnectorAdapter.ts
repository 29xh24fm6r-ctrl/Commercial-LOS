import type { DealSharePointDocumentPort } from './dealSharePointDocumentPort';
import { unavailableDealSharePointDocumentPort } from './dealSharePointDocumentPort';

/**
 * The registered SharePoint Documents data source generated DocumentsService,
 * but that service exposes list-item CRUD only. It cannot create folders or
 * upload binary content. This factory therefore remains deliberately
 * unavailable until the separately governed Power Automate or Azure transport
 * is configured, generated, inspected, and read back. Data-source registration
 * is not binary file transport. Never use DocumentsService.create as a binary
 * upload mechanism and never add guessed operation names here.
 */
export interface DealSharePointConnectorRegistration {
  readonly dataSourceRegistered: boolean;
  readonly binaryTransportConfigured: boolean;
  readonly generatedServiceName?: string;
  readonly inspectedOperations: readonly string[];
}
export const DEAL_SHAREPOINT_CONNECTOR_REGISTRATION: DealSharePointConnectorRegistration = Object.freeze({
  dataSourceRegistered: true,
  binaryTransportConfigured: false,
  generatedServiceName: 'DocumentsService',
  inspectedOperations: ['create', 'update', 'delete', 'get', 'getAll', 'getReferencedEntity'],
});
export function buildDealSharePointConnectorAdapter(): DealSharePointDocumentPort {
  return unavailableDealSharePointDocumentPort;
}
