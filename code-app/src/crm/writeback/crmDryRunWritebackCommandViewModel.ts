/**
 * Phase 146E — CRM dry-run writeback command center view model.
 * Dry-run only. No live writeback. No sync now. No push now.
 */

export interface DryRunWritebackPolicyRow {
  fieldKey: string;
  label: string;
  provider: 'salesforce' | 'ncino';
  policyStatus: 'blocked' | 'eligible_dry_run' | 'not_evaluated';
  blockedReason: string | undefined;
}

export interface CrmDryRunWritebackCommandViewModel {
  title: string;
  subtitle: string;
  safetyCopy: string;

  dryRunOnly: true;
  allowedForLiveWriteNow: false;
  liveWritePerformed: false;
  salesforceWritePerformed: false;
  ncinoWritePerformed: false;
  externalSystemChanged: false;

  policyGateStatus: string;
  allowlistStatus: string;
  blockedFields: readonly DryRunWritebackPolicyRow[];
  eligibleFutureFields: readonly DryRunWritebackPolicyRow[];
  dryRunProofSummary: string;
  auditSummary: string;
  rollbackPrerequisites: readonly string[];
  nextSafeAction: string;
}

export interface CrmDryRunWritebackCommandInput {
  blockedFields: readonly DryRunWritebackFieldInput[];
  eligibleFields: readonly DryRunWritebackFieldInput[];
  rollbackPrerequisites: readonly string[];
}

export interface DryRunWritebackFieldInput {
  fieldKey: string;
  label: string;
  provider: 'salesforce' | 'ncino';
  blockedReason?: string;
}

export function deriveCrmDryRunWritebackCommandViewModel(
  input: CrmDryRunWritebackCommandInput,
): CrmDryRunWritebackCommandViewModel {
  const blockedFields: DryRunWritebackPolicyRow[] = input.blockedFields.map((f) => ({
    fieldKey: f.fieldKey,
    label: f.label,
    provider: f.provider,
    policyStatus: 'blocked',
    blockedReason: f.blockedReason ?? 'Blocked by writeback policy',
  }));

  const eligibleFutureFields: DryRunWritebackPolicyRow[] = input.eligibleFields.map((f) => ({
    fieldKey: f.fieldKey,
    label: f.label,
    provider: f.provider,
    policyStatus: 'eligible_dry_run',
    blockedReason: undefined,
  }));

  return {
    title: 'CRM Dry-Run Writeback',
    subtitle: 'Policy gate and dry-run proof — no live writes',
    safetyCopy:
      'All writeback is dry-run only. No Salesforce or nCino records have been created, updated, or deleted. Live writes are disabled.',

    dryRunOnly: true,
    allowedForLiveWriteNow: false,
    liveWritePerformed: false,
    salesforceWritePerformed: false,
    ncinoWritePerformed: false,
    externalSystemChanged: false,

    policyGateStatus: 'All writeback disabled by default',
    allowlistStatus: 'No fields allowlisted for live write',
    blockedFields,
    eligibleFutureFields,
    dryRunProofSummary: `${blockedFields.length} fields blocked. ${eligibleFutureFields.length} fields eligible for future dry-run.`,
    auditSummary: 'No writeback audit entries. No writes performed.',
    rollbackPrerequisites: [...input.rollbackPrerequisites],
    nextSafeAction: 'Review blocked fields and eligible fields before proceeding to live activation.',
  };
}
