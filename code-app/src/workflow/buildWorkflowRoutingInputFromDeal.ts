/**
 * Phase 142C (live wiring) — maps a live DealDetail to the routing engine's
 * WorkflowRoutingInput.
 *
 * PURE. No fetch, no writes. Deliberately conservative: `productType` is a
 * free-text Dataverse reference lookup the operator configures (there is no
 * fixed enum backing it), so it is mapped to the engine's closed taxonomy only
 * on an unambiguous keyword match — anything else stays 'unknown' rather than
 * guessed, so a mis-typed or unrecognized product never silently produces a
 * wrong route. Fields the DealDetail model does not carry (document readiness,
 * annual-review / covenant / portfolio-boarding / package status, etc.) are
 * left undefined rather than defaulted, so the engine sees an honest "not yet
 * known" instead of a fabricated value.
 */

import type { DealDetail } from '../deals/dealQueries';
import type { WorkflowRoutingInput } from './workflowRoutingConfigTypes';
import type { WorkflowProductType } from './workflowRoutingTypes';

const PRODUCT_TYPE_MATCHERS: ReadonlyArray<readonly [RegExp, WorkflowProductType]> = [
  [/\bsba\b.*7\s*\(?a\)?|7\s*\(?a\)?.*\bsba\b/i, 'sba_7a'],
  [/construction|project[- ]based/i, 'construction'],
  [/commercial real estate|\bcre\b/i, 'cre'],
  [/working capital|revolv|line of credit/i, 'working_capital'],
  [/small business/i, 'small_business'],
];

function mapProductType(raw: string | undefined): WorkflowProductType {
  if (!raw) return 'unknown';
  for (const [pattern, type] of PRODUCT_TYPE_MATCHERS) {
    if (pattern.test(raw)) return type;
  }
  return 'unknown';
}

function mapStage(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  return raw.trim().toLowerCase().replace(/\s+/g, '_');
}

export function buildWorkflowRoutingInputFromDeal(deal: DealDetail): WorkflowRoutingInput {
  return {
    dealId: deal.id,
    productType: mapProductType(deal.productType),
    loanStructure: deal.loanStructure,
    amount: deal.amount,
    guarantorStructure: deal.guarantorStructure,
    stage: mapStage(deal.stage),
    status: deal.status,
  };
}
