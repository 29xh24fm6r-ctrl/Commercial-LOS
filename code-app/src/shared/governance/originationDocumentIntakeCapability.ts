export type OriginationDocumentIntakeCapabilityState = 'IMPLEMENTED' | 'PLANNED_SCHEMA' | 'BLOCKED_EXTERNAL';

export interface OriginationDocumentIntakeCapabilityEntry {
  readonly id: string;
  readonly state: OriginationDocumentIntakeCapabilityState;
  readonly evidence: readonly string[];
  readonly blocker?: string;
}

/**
 * Static release inventory for the origination document-intake subsystem.
 * This reports repository facts only; it cannot enable schema, a connector,
 * or LIVE storage and therefore cannot be mistaken for runtime certification.
 */
export const ORIGINATION_DOCUMENT_INTAKE_CAPABILITIES: readonly OriginationDocumentIntakeCapabilityEntry[] = Object.freeze([
  {
    id: 'canonical-underwriting-requirements',
    state: 'IMPLEMENTED',
    evidence: ['src/deals/documentIntake/documentIntakeRequirements.ts'],
  },
  {
    id: 'underwriting-intake-readiness',
    state: 'IMPLEMENTED',
    evidence: ['src/deals/documentIntake/documentIntakeReadiness.ts'],
  },
  {
    id: 'due-diligence-definition-catalog',
    state: 'IMPLEMENTED',
    evidence: ['src/deals/documentIntake/dueDiligenceCatalog.ts'],
  },
  {
    id: 'origination-document-storage-schema',
    state: 'IMPLEMENTED',
    evidence: ['scripts/dataverse/provision-origination-document-storage.ps1', 'src/generated/models/Cr664_documentrequirementfilemapsModel.ts'],
  },
  {
    id: 'origination-sharepoint-live-storage',
    state: 'BLOCKED_EXTERNAL',
    evidence: ['src/deals/documentStorage/dealSharePointConnectorAdapter.ts', 'src/generated/services/DocumentsService.ts', 'src/deals/documentStorage/dealSharePointNativeTransport.ts', 'microsoft365/sharepoint-transport/host/sharePointTransportHost.ts', 'scripts/microsoft365/resolve-origination-sharepoint-identifiers.ps1'],
    blocker: 'The authenticated server transport is implemented, but immutable Graph IDs, permission evidence, connector generation/binding, certified configuration, and a real-file smoke remain external requirements before LIVE.',
  },
]);
