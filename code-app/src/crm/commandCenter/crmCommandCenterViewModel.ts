/**
 * Phase 146A — CRM Command Center view model.
 * Pure view model. Read-only. No writes. No external calls.
 *
 * Factory Arc Phase 8: this surface reports external CRM/lending-system
 * sync connector status, distinct from CRM record editing (which lives in
 * the CRM Hub and is already live/governed there). Copy here describes the
 * connector/sync state factually — no "dry-run," "gated," or "disabled by
 * launch phase" framing, since a banker reading this needs to know where
 * to make an edit, not which engineering flag is set. User-facing strings
 * use the neutral "CRM System" / "Lending Workflow" lane labels rather than
 * vendor product names (see crmVendorBrandCopyCertification.test.ts).
 */

import { CRM_SOURCE_OF_TRUTH_MAP } from '../sourceOfTruth/crmSourceOfTruthMap';

export interface CrmCommandCenterViewModel {
  title: string;
  subtitle: string;
  safetyCopy: string;

  // Safety booleans
  readOnly: true;
  previewOnly: true;
  dryRunOnly: true;
  liveWritePerformed: false;
  salesforceWritePerformed: false;
  ncinoWritePerformed: false;
  externalSystemChanged: false;
  allowedForLiveWriteNow: false;

  // KPI ribbon
  totalSourceOfTruthDomains: number;
  activatedDomains: number;
  disabledDomains: number;
  conflictDomains: number;

  // Lane summaries
  salesforceLane: CrmLaneSummary;
  ncinoLane: CrmLaneSummary;

  // Section summaries
  sourceOfTruthSummary: string;
  entityMatchingSummary: string;
  syncPreviewSummary: string;
  writebackPosture: string;
  relationshipTimelineSummary: string;
  nextSafeAction: string;
}

export interface CrmLaneSummary {
  provider: 'salesforce' | 'ncino';
  label: string;
  domainsOwned: number;
  domainsReadSource: number;
  connectorStatus: string;
  writebackStatus: string;
}

export function deriveCrmCommandCenterViewModel(): CrmCommandCenterViewModel {
  const domains = CRM_SOURCE_OF_TRUTH_MAP;
  const activated = domains.filter((d) => d.activationStatus !== 'disabled_by_default');
  const disabled = domains.filter((d) => d.activationStatus === 'disabled_by_default');
  const conflicts = domains.filter((d) => d.conflictRule === 'manual_review');

  const sfOwned = domains.filter((d) => d.salesforceOwner !== 'none' && d.salesforceOwner !== undefined);
  const sfRead = domains.filter((d) => d.proposedReadSource === 'salesforce');
  const ncOwned = domains.filter((d) => d.ncinoOwner !== 'none' && d.ncinoOwner !== undefined);
  const ncRead = domains.filter((d) => d.proposedReadSource === 'ncino');

  return {
    title: 'CRM Command Center',
    subtitle: 'External CRM and lending-system sync status',
    safetyCopy:
      'This page shows connector and sync status for the CRM System and Lending Workflow lanes below, plus source-of-truth and matching intelligence. It does not create, update, or link records — CRM record editing happens in the CRM Hub.',

    readOnly: true,
    previewOnly: true,
    dryRunOnly: true,
    liveWritePerformed: false,
    salesforceWritePerformed: false,
    ncinoWritePerformed: false,
    externalSystemChanged: false,
    allowedForLiveWriteNow: false,

    totalSourceOfTruthDomains: domains.length,
    activatedDomains: activated.length,
    disabledDomains: disabled.length,
    conflictDomains: conflicts.length,

    salesforceLane: {
      provider: 'salesforce',
      label: 'CRM System',
      domainsOwned: sfOwned.length,
      domainsReadSource: sfRead.length,
      connectorStatus: 'Not connected',
      writebackStatus: 'Manual only — automated sync not set up',
    },
    ncinoLane: {
      provider: 'ncino',
      label: 'Lending Workflow',
      domainsOwned: ncOwned.length,
      domainsReadSource: ncRead.length,
      connectorStatus: 'Not connected',
      writebackStatus: 'Manual only — automated sync not set up',
    },

    sourceOfTruthSummary: `${domains.length} domains mapped. ${disabled.length} disabled by default.`,
    entityMatchingSummary: 'Entity matching operates on authorized labels only. No auto-link.',
    syncPreviewSummary: 'Sync preview shows proposed matches only. No records created, updated, or linked.',
    writebackPosture: 'Automated writeback to the CRM System and Lending Workflow lanes is not set up. CRM edits are made manually in the CRM Hub.',
    relationshipTimelineSummary: 'Relationship timeline is read-only. No live CRM lookup performed.',
    nextSafeAction: 'Review source-of-truth map and connector status before proceeding.',
  };
}
