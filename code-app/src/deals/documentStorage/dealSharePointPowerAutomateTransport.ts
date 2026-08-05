import type { DealSharePointDocumentPort } from './dealSharePointDocumentPort';
import { unavailableDealSharePointDocumentPort } from './dealSharePointDocumentPort';

export const DEAL_SHAREPOINT_POWER_AUTOMATE_WORKFLOW_ID = '9448ac11-f490-f111-8076-7ced8d3bafd4';
export const DEAL_SHAREPOINT_POWER_AUTOMATE_OPERATIONS = Object.freeze(['ensureFolder', 'upload', 'verifyFolder', 'verifyFile'] as const);
export type DealSharePointTransportProvider = 'AZURE_FUNCTION' | 'POWER_AUTOMATE';

export interface DealSharePointPowerAutomateRegistration {
  readonly provider: DealSharePointTransportProvider;
  readonly workflowId: typeof DEAL_SHAREPOINT_POWER_AUTOMATE_WORKFLOW_ID;
  readonly generatedServiceName?: string;
  readonly generatedRunMethod?: string;
  readonly generatedParameterNames?: readonly string[];
  readonly connectionReferenceBound: boolean;
  readonly environmentConfigurationVerified: boolean;
  readonly authenticatedActorResolutionVerified: boolean;
  readonly serverAuthorizationVerified: boolean;
  readonly idempotencyLedgerVerified: boolean;
  readonly sharePointReadbackVerified: boolean;
  readonly reconciliationVerified: boolean;
}
export interface DealSharePointPowerAutomateSelection {
  readonly requestedProvider?: string;
  readonly storageMode?: string;
  readonly registration?: Partial<DealSharePointPowerAutomateRegistration>;
}

export function verifyDealSharePointPowerAutomateRegistration(selection: DealSharePointPowerAutomateSelection) {
  const reasons: string[] = [];
  const registration = selection.registration;
  if (selection.storageMode !== 'LIVE') reasons.push('Document storage mode is not LIVE.');
  if (selection.requestedProvider !== 'POWER_AUTOMATE') reasons.push('Power Automate was not explicitly selected.');
  if (registration?.provider !== 'POWER_AUTOMATE') reasons.push('The registered provider is not Power Automate.');
  if (registration?.workflowId !== DEAL_SHAREPOINT_POWER_AUTOMATE_WORKFLOW_ID) reasons.push('The approved workflow ID is not registered.');
  if (!registration?.generatedServiceName?.trim()) reasons.push('The generated flow service has not been inspected.');
  if (!registration?.generatedRunMethod?.trim()) reasons.push('The generated flow Run method has not been inspected.');
  if (!registration?.generatedParameterNames?.length) reasons.push('The generated flow parameter contract has not been inspected.');
  if (!registration?.connectionReferenceBound) reasons.push('The flow connection reference is not verified as bound.');
  if (!registration?.environmentConfigurationVerified) reasons.push('The immutable environment configuration is not verified.');
  if (!registration?.authenticatedActorResolutionVerified) reasons.push('Authenticated actor resolution is not verified.');
  if (!registration?.serverAuthorizationVerified) reasons.push('Server-side deal authorization is not verified.');
  if (!registration?.idempotencyLedgerVerified) reasons.push('The durable idempotency ledger is not verified.');
  if (!registration?.sharePointReadbackVerified) reasons.push('SharePoint readback is not verified.');
  if (!registration?.reconciliationVerified) reasons.push('Reconciliation is not verified.');
  return reasons.length
    ? { ready: false as const, reasons }
    : { ready: true as const, registration: registration as DealSharePointPowerAutomateRegistration };
}

/** Generated client names remain deliberately absent until Power Apps integration emits and exposes the exact Run signature. */
export function buildDealSharePointPowerAutomateTransport(
  selection: DealSharePointPowerAutomateSelection,
  generatedAdapter?: DealSharePointDocumentPort,
): DealSharePointDocumentPort {
  const readiness = verifyDealSharePointPowerAutomateRegistration(selection);
  return readiness.ready && generatedAdapter ? generatedAdapter : unavailableDealSharePointDocumentPort;
}
