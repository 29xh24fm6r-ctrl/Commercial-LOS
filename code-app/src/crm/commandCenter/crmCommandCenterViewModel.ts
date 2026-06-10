/**
 * Phase 146A — CRM Command Center view model.
 * Pure view model. Read-only. No writes. No external calls.
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
    subtitle: 'Salesforce and nCino intelligence, preview-only and controlled',
    safetyCopy:
      'Live Salesforce and nCino writes are disabled. This cockpit shows read-only intelligence, matching, source-of-truth, sync preview, and dry-run readiness only.',

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
      label: 'Salesforce',
      domainsOwned: sfOwned.length,
      domainsReadSource: sfRead.length,
      connectorStatus: 'not_configured',
      writebackStatus: 'disabled',
    },
    ncinoLane: {
      provider: 'ncino',
      label: 'nCino',
      domainsOwned: ncOwned.length,
      domainsReadSource: ncRead.length,
      connectorStatus: 'not_configured',
      writebackStatus: 'disabled',
    },

    sourceOfTruthSummary: `${domains.length} domains mapped. ${disabled.length} disabled by default.`,
    entityMatchingSummary: 'Entity matching operates on authorized labels only. No auto-link.',
    syncPreviewSummary: 'Sync preview is preview-only. No records created, updated, or linked.',
    writebackPosture: 'All writeback is dry-run only. Live writes disabled.',
    relationshipTimelineSummary: 'Relationship timeline is read-only. No live CRM lookup performed.',
    nextSafeAction: 'Review source-of-truth map and connector readiness before proceeding.',
  };
}
