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
    state: 'PLANNED_SCHEMA',
    evidence: ['scripts/dataverse/provision-origination-document-storage.ps1'],
    blocker: 'Additive schema must be provisioned, published, read back, and followed by supported SDK regeneration.',
  },
  {
    id: 'origination-sharepoint-live-storage',
    state: 'BLOCKED_EXTERNAL',
    evidence: ['src/deals/documentStorage/dealSharePointConnectorAdapter.ts'],
    blocker: 'No generated SharePoint Online service exists; connector registration, consent, SDK regeneration, and a real-file smoke are required.',
  },
]);
