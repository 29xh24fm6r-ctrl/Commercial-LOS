/**
 * Phase 143C — CRM identity / entity matching model (READ-ONLY).
 *
 * PURE. Compares LOS deal/client data against Salesforce-shaped and nCino-shaped
 * CANDIDATE records (labels only) and reports a match band for HUMAN review. It
 * performs NO live lookup, NO auto-linking, and stores NO CRM id. Every outcome
 * keeps `readOnly` true and `crmRecordLinked` / `externalSystemChanged` false. No
 * deterministic result implies an authoritative match without human review.
 */

import { crmHasSensitiveKey } from '../activation/crmActivationSafety';

export interface CrmMatchLosEntity {
  dealId?: string;
  dealName?: string;
  clientName?: string;
  borrowerLabel?: string;
  bankerName?: string;
  productType?: string;
  amount?: number;
}

export interface CrmMatchSalesforceCandidate {
  accountIdLabel?: string;
  accountName?: string;
  opportunityName?: string;
  ownerName?: string;
}

export interface CrmMatchNcinoCandidate {
  relationshipLabel?: string;
  loanLabel?: string;
  borrowerName?: string;
  ownerName?: string;
}

export interface CrmEntityMatchInput {
  los?: CrmMatchLosEntity;
  salesforce?: CrmMatchSalesforceCandidate;
  ncino?: CrmMatchNcinoCandidate;
}

export type CrmMatchStatus = 'no_candidates' | 'possible_match' | 'strong_match' | 'conflict' | 'unknown';
export type CrmConfidenceBand = 'low' | 'medium' | 'high' | 'unknown';

export interface CrmEntityMatchResult {
  matchStatus: CrmMatchStatus;
  confidenceBand: CrmConfidenceBand;
  matchedProviderLabels: readonly string[];
  conflicts: readonly string[];
  warnings: readonly string[];
  recommendedReviewStep: string;
  readOnly: true;
  crmRecordLinked: false;
  externalSystemChanged: false;
}

function norm(...values: ReadonlyArray<string | undefined>): string {
  const first = values.find((v) => typeof v === 'string' && v.trim().length > 0);
  return (first ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

type Level = 'exact' | 'partial' | 'none';
function level(a: string, b: string): Level {
  if (a.length === 0 || b.length === 0) return 'none';
  if (a === b) return 'exact';
  if (a.includes(b) || b.includes(a)) return 'partial';
  return 'none';
}

const REVIEW_STEP = 'Human review is required before linking any CRM record — no record is auto-linked.';

function result(
  matchStatus: CrmMatchStatus,
  confidenceBand: CrmConfidenceBand,
  matchedProviderLabels: string[],
  conflicts: string[],
  warnings: string[],
): CrmEntityMatchResult {
  return {
    matchStatus, confidenceBand, matchedProviderLabels, conflicts, warnings,
    recommendedReviewStep: REVIEW_STEP,
    readOnly: true, crmRecordLinked: false, externalSystemChanged: false,
  };
}

export function deriveCrmEntityMatch(input: CrmEntityMatchInput | null | undefined): CrmEntityMatchResult {
  if (!input) return result('unknown', 'unknown', [], [], ['No matching input provided.']);
  if (crmHasSensitiveKey(input.los) || crmHasSensitiveKey(input.salesforce) || crmHasSensitiveKey(input.ncino)) {
    return result('unknown', 'unknown', [], [], ['Rejected: sensitive identifiers are not accepted by the matching model.']);
  }

  const losName = norm(input.los?.clientName, input.los?.borrowerLabel, input.los?.dealName);
  const sf = input.salesforce;
  const nc = input.ncino;
  const sfName = norm(sf?.accountName, sf?.opportunityName);
  const ncName = norm(nc?.borrowerName, nc?.relationshipLabel, nc?.loanLabel);

  const sfPresent = sfName.length > 0;
  const ncPresent = ncName.length > 0;

  if (!sfPresent && !ncPresent) {
    return result('no_candidates', 'low', [], [], ['No Salesforce or nCino candidate records were provided.']);
  }

  const conflicts: string[] = [];
  const warnings: string[] = [];
  const matchedProviderLabels: string[] = [];

  const sfLevel = sfPresent ? level(losName, sfName) : 'none';
  const ncLevel = ncPresent ? level(losName, ncName) : 'none';
  if (sfLevel !== 'none') matchedProviderLabels.push('salesforce');
  if (ncLevel !== 'none') matchedProviderLabels.push('ncino');

  if (sfPresent && sfLevel === 'none') conflicts.push('Salesforce candidate name does not match the LOS entity.');
  if (ncPresent && ncLevel === 'none') conflicts.push('nCino candidate name does not match the LOS entity.');
  if (sfPresent && ncPresent && level(sfName, ncName) === 'none') conflicts.push('Salesforce and nCino candidate names disagree.');

  warnings.push('Match is decision support for human review only; no record is linked.');

  let matchStatus: CrmMatchStatus;
  let confidenceBand: CrmConfidenceBand;
  if (sfLevel === 'exact' || ncLevel === 'exact') {
    if (conflicts.length > 0) { matchStatus = 'conflict'; confidenceBand = 'low'; }
    else { matchStatus = 'strong_match'; confidenceBand = 'high'; }
  } else if (sfLevel === 'partial' || ncLevel === 'partial') {
    matchStatus = conflicts.length > 0 ? 'conflict' : 'possible_match';
    confidenceBand = conflicts.length > 0 ? 'low' : 'medium';
  } else {
    // Candidates present but no name overlap with LOS.
    matchStatus = 'conflict';
    confidenceBand = 'low';
  }

  return result(matchStatus, confidenceBand, matchedProviderLabels, conflicts, warnings);
}
