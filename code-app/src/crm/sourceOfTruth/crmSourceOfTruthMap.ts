/**
 * Phase 143A — CRM activation source-of-truth map (constants + pure helpers).
 *
 * Declares, for each CRM-relevant domain, the current LOS/Dataverse owner, the
 * Salesforce owner, the nCino owner, the proposed read source / write target, the
 * conflict rule, and the activation status. CONSTANTS ONLY — no IO, no writes, no
 * live integration. Activation status defaults to disabled / read-only.
 */

export type CrmActivationStatus =
  | 'not_configured'
  | 'disabled_by_default'
  | 'read_only_preview'
  | 'dry_run_writeback'
  | 'allowlisted_writeback'
  | 'live_controlled';

export type CrmSystemOwner = 'los_dataverse' | 'salesforce' | 'ncino' | 'shared' | 'none';

export interface CrmSourceOfTruthEntry {
  domainKey: string;
  domainLabel: string;
  losOwner: CrmSystemOwner;
  salesforceOwner: CrmSystemOwner;
  ncinoOwner: CrmSystemOwner;
  proposedReadSource: CrmSystemOwner;
  proposedWriteTarget: CrmSystemOwner;
  conflictRule: string;
  activationStatus: CrmActivationStatus;
  notes: string;
}

function entry(
  domainKey: string,
  domainLabel: string,
  losOwner: CrmSystemOwner,
  salesforceOwner: CrmSystemOwner,
  ncinoOwner: CrmSystemOwner,
  proposedReadSource: CrmSystemOwner,
  proposedWriteTarget: CrmSystemOwner,
  conflictRule: string,
  notes = 'Read-only / disabled until the activation arc certifies a controlled writeback.',
): CrmSourceOfTruthEntry {
  return {
    domainKey, domainLabel, losOwner, salesforceOwner, ncinoOwner,
    proposedReadSource, proposedWriteTarget, conflictRule,
    activationStatus: 'disabled_by_default', notes,
  };
}

export const CRM_SOURCE_OF_TRUTH_MAP: readonly CrmSourceOfTruthEntry[] = Object.freeze([
  entry('borrower_client_identity', 'Borrower / client identity', 'los_dataverse', 'salesforce', 'ncino', 'los_dataverse', 'none', 'LOS is authoritative for borrower identity; CRM is a reference link only.'),
  entry('business_legal_name', 'Business legal name', 'los_dataverse', 'salesforce', 'ncino', 'los_dataverse', 'none', 'LOS authoritative; CRM mismatch is a conflict, never auto-overwritten.'),
  entry('dba_name', 'DBA name', 'los_dataverse', 'salesforce', 'ncino', 'los_dataverse', 'none', 'LOS authoritative; CRM mismatch is a conflict.'),
  entry('contacts', 'Contacts', 'los_dataverse', 'salesforce', 'ncino', 'shared', 'none', 'Contacts may sync read-only; no contact write in this arc.'),
  entry('relationship_managers', 'Relationship managers / bankers', 'los_dataverse', 'salesforce', 'ncino', 'los_dataverse', 'none', 'LOS authoritative for banker assignment.'),
  entry('deal_opportunity', 'Deal / opportunity', 'los_dataverse', 'salesforce', 'ncino', 'los_dataverse', 'none', 'LOS deal authoritative; Salesforce opportunity is a linked reference.'),
  entry('loan_amount', 'Loan amount', 'los_dataverse', 'none', 'ncino', 'los_dataverse', 'none', 'Amount is never written to CRM in this arc (allowlist-blocked field).'),
  entry('stage_status', 'Stage / status', 'los_dataverse', 'none', 'ncino', 'los_dataverse', 'none', 'Stage/status are lifecycle fields — blocked from any CRM writeback.'),
  entry('product_type', 'Product type', 'los_dataverse', 'none', 'ncino', 'los_dataverse', 'none', 'LOS authoritative.'),
  entry('loan_structure', 'Loan structure', 'los_dataverse', 'none', 'ncino', 'los_dataverse', 'none', 'LOS authoritative.'),
  entry('pricing_type', 'Pricing type', 'los_dataverse', 'none', 'ncino', 'los_dataverse', 'none', 'Pricing is blocked from CRM writeback.'),
  entry('tasks', 'Tasks', 'los_dataverse', 'salesforce', 'ncino', 'shared', 'none', 'Task references read-only; non-authoritative task note only in future pilot.'),
  entry('activities', 'Activities', 'los_dataverse', 'salesforce', 'ncino', 'shared', 'none', 'Activity references read-only.'),
  entry('emails_communications', 'Emails / communications', 'los_dataverse', 'salesforce', 'ncino', 'shared', 'none', 'Reference labels only; no email send.'),
  entry('documents', 'Documents', 'los_dataverse', 'salesforce', 'ncino', 'los_dataverse', 'none', 'LOS document store authoritative.'),
  entry('credit_memo', 'Credit memo', 'los_dataverse', 'none', 'ncino', 'los_dataverse', 'none', 'Credit memo authoritative in LOS.'),
  entry('committee_package', 'Committee package', 'los_dataverse', 'none', 'ncino', 'los_dataverse', 'none', 'Committee package authoritative in LOS; no CRM write.'),
  entry('closing_checklist', 'Closing checklist', 'los_dataverse', 'none', 'ncino', 'los_dataverse', 'none', 'LOS authoritative.'),
  entry('servicing_handoff', 'Servicing handoff', 'los_dataverse', 'none', 'ncino', 'los_dataverse', 'none', 'Servicing handoff read-only (142R mapper).'),
  entry('deposit_opportunity', 'Deposit opportunity', 'los_dataverse', 'salesforce', 'ncino', 'shared', 'none', 'Cross-sell reference only; no CRM write.'),
  entry('cross_sell_relationship_intelligence', 'Cross-sell / relationship intelligence', 'los_dataverse', 'salesforce', 'ncino', 'shared', 'none', 'Relationship intelligence note is the only future allowlisted candidate.'),
]);

export const CRM_SOURCE_OF_TRUTH_DOMAIN_KEYS: readonly string[] = Object.freeze(
  CRM_SOURCE_OF_TRUTH_MAP.map((e) => e.domainKey),
);

export function getCrmSourceOfTruthEntry(domainKey: string): CrmSourceOfTruthEntry | undefined {
  return CRM_SOURCE_OF_TRUTH_MAP.find((e) => e.domainKey === domainKey);
}

/** Every entry defaults to a non-live activation status. */
export function crmSourceOfTruthAllNonLive(): boolean {
  return CRM_SOURCE_OF_TRUTH_MAP.every((e) => e.activationStatus !== 'live_controlled' && e.proposedWriteTarget === 'none');
}
