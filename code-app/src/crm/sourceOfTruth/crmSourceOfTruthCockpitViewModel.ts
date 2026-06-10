/**
 * Phase 146B — CRM source-of-truth cockpit view model.
 * Read-only. No edits. No owner mutation. No source-of-truth switch.
 */

import { CRM_SOURCE_OF_TRUTH_MAP, type CrmSourceOfTruthEntry } from './crmSourceOfTruthMap';

export interface SourceOfTruthDomainRow {
  domain: string;
  losOwner: string;
  salesforceOwner: string;
  ncinoOwner: string;
  readSource: string;
  writeTarget: string;
  conflictRule: string;
  activationStatus: string;
  blocker: string | undefined;
  nextReviewStep: string;
}

export interface CrmSourceOfTruthCockpitViewModel {
  title: string;
  subtitle: string;
  readOnly: true;
  domains: readonly SourceOfTruthDomainRow[];
  totalDomains: number;
  activeDomains: number;
  disabledDomains: number;
  conflictDomains: number;
  safetyCopy: string;
}

export function deriveCrmSourceOfTruthCockpitViewModel(): CrmSourceOfTruthCockpitViewModel {
  const domains: SourceOfTruthDomainRow[] = CRM_SOURCE_OF_TRUTH_MAP.map((entry: CrmSourceOfTruthEntry) => ({
    domain: entry.domainLabel,
    losOwner: entry.losOwner ?? 'Not set',
    salesforceOwner: entry.salesforceOwner ?? 'None',
    ncinoOwner: entry.ncinoOwner ?? 'None',
    readSource: entry.proposedReadSource ?? 'Not set',
    writeTarget: entry.proposedWriteTarget ?? 'none',
    conflictRule: entry.conflictRule ?? 'Not set',
    activationStatus: entry.activationStatus ?? 'disabled_by_default',
    blocker: entry.activationStatus === 'disabled_by_default' ? 'Disabled by default' : undefined,
    nextReviewStep: entry.activationStatus === 'disabled_by_default'
      ? 'Enable activation before review'
      : 'Review source-of-truth ownership and conflict rule',
  }));

  const active = domains.filter((d) => d.activationStatus !== 'disabled_by_default');
  const disabled = domains.filter((d) => d.activationStatus === 'disabled_by_default');
  const conflicts = domains.filter((d) => d.conflictRule === 'manual_review');

  return {
    title: 'CRM Source of Truth',
    subtitle: 'Domain ownership and conflict rules',
    readOnly: true,
    domains,
    totalDomains: domains.length,
    activeDomains: active.length,
    disabledDomains: disabled.length,
    conflictDomains: conflicts.length,
    safetyCopy: 'Read-only view. No source-of-truth changes from this cockpit.',
  };
}
