import type { DealSharePointDocumentPort } from './dealSharePointDocumentPort';
import { unavailableDealSharePointDocumentPort } from './dealSharePointDocumentPort';

/**
 * The generated SDK currently contains no SharePoint Online service. This
 * repository-owned seam is intentionally fail-closed until Power Apps adds
 * the data source and regeneration exposes its real operation signatures.
 * Never add guessed operation names here.
 */
export interface DealSharePointConnectorRegistration {
  readonly registered: boolean;
  readonly generatedServiceName?: string;
  readonly inspectedOperations: readonly string[];
}
export const DEAL_SHAREPOINT_CONNECTOR_REGISTRATION: DealSharePointConnectorRegistration = Object.freeze({ registered: false, inspectedOperations: [] });
export function buildDealSharePointConnectorAdapter(): DealSharePointDocumentPort {
  return unavailableDealSharePointDocumentPort;
}
