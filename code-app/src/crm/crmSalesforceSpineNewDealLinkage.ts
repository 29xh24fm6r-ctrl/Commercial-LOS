/**
 * Phase 193 — Controlled New Deal → CRM linkage.
 *
 * The gated foundation for linking an ALREADY-CREATED New Deal to a CRM
 * provisional Account + Deal relationship. This runs AFTER the existing,
 * already-governed deal create — it never creates a deal and never alters the
 * existing create behavior. When the gate is off it is inert.
 *
 * Honesty rules (pinned by tests):
 *   - No fabricated records. The provisional Account is projected from the deal's
 *     borrower/client stub; a deal with no client name is REJECTED, not invented.
 *   - If the Account links but the Deal relationship fails, the result is
 *     `partial_success` with full audit — never a silent roll-forward and never a
 *     claimed success without a real persistence response.
 *   - Default/dry-run is no-write.
 */

import {
  persistCrmSpineRecords,
  type CrmSpinePersistMode,
  type CrmSpineRecordResult,
  type CrmSpineWriteRequest,
} from './crmSalesforceSpinePersistenceAdapter';
import { evaluateCrmSpinePersistenceGate, type CrmSpineLiveGateConfig } from './crmSalesforceSpineLiveGates';
import { buildCrmSpineAuditPayload, type CrmSpineAuditPayload, type CrmSpineSourceFactRef } from './crmSalesforceSpineAudit';
import type { CrmDataverseTransport } from './crmLiveDataverseTransport';

export interface CrmNewDealInput {
  /** The already-created deal (from the governed create path). */
  dealId: string;
  dealName: string;
  /** The borrower/client stub on the deal, if any. */
  clientId?: string | null;
  clientName?: string | null;
}

export type CrmNewDealLinkageMode = 'dry-run' | 'live';

export type CrmNewDealLinkageOutcome =
  | 'linked'
  | 'partial_success'
  | 'blocked_gate_not_satisfied'
  | 'skipped_missing_required_data'
  | 'failed_dataverse'
  | 'dry_run';

export interface CrmNewDealLinkageInput {
  mode: CrmNewDealLinkageMode;
  deal: CrmNewDealInput;
  actor: string;
  correlationId: string;
  gate?: CrmSpineLiveGateConfig;
  transport?: CrmDataverseTransport;
  occurredAt?: string | null;
}

export interface CrmNewDealLinkageResult {
  linkageAttempted: boolean;
  mode: CrmNewDealLinkageMode;
  outcome: CrmNewDealLinkageOutcome;
  accountResult: CrmSpineRecordResult | null;
  dealRelationshipResult: CrmSpineRecordResult | null;
  blockedReason: string | null;
  audit: CrmSpineAuditPayload[];
}

function linkageAudit(
  input: CrmNewDealLinkageInput,
  outcome: CrmNewDealLinkageOutcome,
  error: string | null,
  facts: CrmSpineSourceFactRef[],
): CrmSpineAuditPayload {
  return buildCrmSpineAuditPayload({
    correlationId: input.correlationId,
    actor: input.actor,
    targetEntity: 'cr664_loandeal->cr664_crmorganization',
    targetRecordId: input.deal.dealId,
    action: 'new-deal-link',
    outcome,
    dryRun: input.mode === 'dry-run',
    sourceFacts: facts,
    occurredAt: input.occurredAt ?? null,
    error,
  });
}

export async function linkNewDealToCrm(
  input: CrmNewDealLinkageInput,
): Promise<CrmNewDealLinkageResult> {
  const deal = input.deal;
  const baseFacts: CrmSpineSourceFactRef[] = [
    { statement: `Loan deal ${deal.dealId} created via the governed create path.`, sourceLogicalName: 'cr664_loandeal', sourceRecordId: deal.dealId },
  ];
  if (deal.clientId) {
    baseFacts.push({ statement: `Borrower/client stub ${deal.clientId} linked on the deal.`, sourceLogicalName: 'cr664_clientrelationship', sourceRecordId: deal.clientId });
  }

  // Live mode requires the persistence gate; otherwise inert (no attempt).
  if (input.mode === 'live') {
    const gate = evaluateCrmSpinePersistenceGate({ ...input.gate, correlationId: input.gate?.correlationId ?? input.correlationId });
    if (!gate.satisfied || !input.transport) {
      const blockedReason = gate.satisfied
        ? 'No transport wired for live CRM linkage.'
        : `Persistence gate not satisfied: ${gate.blockers.join('; ')}.`;
      return {
        linkageAttempted: false,
        mode: 'live',
        outcome: 'blocked_gate_not_satisfied',
        accountResult: null,
        dealRelationshipResult: null,
        blockedReason,
        audit: [linkageAudit(input, 'blocked_gate_not_satisfied', blockedReason, baseFacts)],
      };
    }
  }

  // Step 1 — provisional Account from the client stub (name required, never invented).
  const accountReq: CrmSpineWriteRequest = {
    entity: 'account',
    fields: { cr664_name: deal.clientName ?? '', cr664_sourcerecordid: deal.clientId ?? '' },
    sourceFacts: baseFacts,
  };
  const accountPersist = await persistCrmSpineRecords({
    mode: input.mode as CrmSpinePersistMode,
    requests: [accountReq],
    actor: input.actor,
    correlationId: input.correlationId,
    gate: input.gate,
    transport: input.transport,
    occurredAt: input.occurredAt,
  });
  const accountResult = accountPersist.results[0] ?? null;

  const accountOk = accountResult?.outcome === 'created' || accountResult?.outcome === 'updated';
  const accountDryRun = accountResult?.outcome === 'dry_run_only';

  // If the account didn't link (and we're not in dry-run), stop — never roll forward.
  if (!accountOk && !accountDryRun) {
    const outcome: CrmNewDealLinkageOutcome =
      accountResult?.outcome === 'skipped_missing_required_data'
        ? 'skipped_missing_required_data'
        : accountResult?.outcome === 'blocked_gate_not_satisfied'
          ? 'blocked_gate_not_satisfied'
          : 'failed_dataverse';
    return {
      linkageAttempted: input.mode === 'live',
      mode: input.mode,
      outcome,
      accountResult,
      dealRelationshipResult: null,
      blockedReason: accountResult?.error ?? null,
      audit: [...accountPersist.audit, linkageAudit(input, outcome, accountResult?.error ?? null, baseFacts)],
    };
  }

  // Step 2 — Deal ↔ Account relationship.
  const accountId = accountResult?.recordId ?? null;
  const relReq: CrmSpineWriteRequest = {
    entity: 'accountContactRelationship',
    fields: {
      cr664_name: `${deal.dealName} deal relationship`,
      cr664_sourceentitytype: 'cr664_loandeal',
      cr664_sourceentityid: deal.dealId,
      cr664_targetentitytype: 'cr664_crmorganization',
      cr664_targetentityid: accountId ?? '',
    },
    sourceFacts: baseFacts,
  };
  const relPersist = await persistCrmSpineRecords({
    mode: input.mode as CrmSpinePersistMode,
    requests: [relReq],
    actor: input.actor,
    correlationId: input.correlationId,
    gate: input.gate,
    transport: input.transport,
    occurredAt: input.occurredAt,
  });
  const dealRelationshipResult = relPersist.results[0] ?? null;
  const relOk = dealRelationshipResult?.outcome === 'created' || dealRelationshipResult?.outcome === 'updated';
  const relDryRun = dealRelationshipResult?.outcome === 'dry_run_only';

  let outcome: CrmNewDealLinkageOutcome;
  if (input.mode === 'dry-run') {
    outcome = 'dry_run';
  } else if (accountOk && relOk) {
    outcome = 'linked';
  } else {
    // Account linked but the relationship did not — partial, never silent.
    outcome = 'partial_success';
  }

  return {
    linkageAttempted: input.mode === 'live',
    mode: input.mode,
    outcome,
    accountResult,
    dealRelationshipResult,
    blockedReason: relOk || relDryRun ? null : (dealRelationshipResult?.error ?? null),
    audit: [
      ...accountPersist.audit,
      ...relPersist.audit,
      linkageAudit(input, outcome, relOk || relDryRun ? null : (dealRelationshipResult?.error ?? null), baseFacts),
    ],
  };
}
