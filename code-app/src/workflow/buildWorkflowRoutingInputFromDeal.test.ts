// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { buildWorkflowRoutingInputFromDeal } from './buildWorkflowRoutingInputFromDeal';
import type { DealDetail } from '../deals/dealQueries';

function deal(over: Partial<DealDetail> = {}): DealDetail {
  return {
    id: 'deal-1', name: 'Test Deal', clientName: 'Test Client', stage: 'Intake', status: 'Active',
    amount: 500_000, bankerName: 'Banker', targetCloseDate: undefined, productType: undefined,
    loanStructure: 'Senior Secured', customerType: 'C&I', industry: 'Manufacturing', guarantorStructure: undefined,
    pricingType: undefined, spreadIndex: undefined, spreadMargin: undefined, collateralSummary: undefined,
    createdOn: undefined, stageEntryDate: undefined, isClosed: false,
    ...over,
  };
}

describe('ARC Phase 3 — buildWorkflowRoutingInputFromDeal (live routing-engine wiring)', () => {
  it('maps the honestly-known fields straight through', () => {
    const input = buildWorkflowRoutingInputFromDeal(deal({ amount: 1_200_000, loanStructure: 'Senior Secured', guarantorStructure: 'Full recourse' }));
    expect(input.dealId).toBe('deal-1');
    expect(input.amount).toBe(1_200_000);
    expect(input.loanStructure).toBe('Senior Secured');
    expect(input.guarantorStructure).toBe('Full recourse');
    expect(input.status).toBe('Active');
  });

  it('an unrecognized free-text product type maps to unknown rather than a guess', () => {
    expect(buildWorkflowRoutingInputFromDeal(deal({ productType: 'Term Loan' })).productType).toBe('unknown');
    expect(buildWorkflowRoutingInputFromDeal(deal({ productType: undefined })).productType).toBe('unknown');
  });

  it('unambiguous product-type keywords map to the closed taxonomy', () => {
    expect(buildWorkflowRoutingInputFromDeal(deal({ productType: 'SBA 7(a) Term Loan' })).productType).toBe('sba_7a');
    expect(buildWorkflowRoutingInputFromDeal(deal({ productType: 'Construction Loan' })).productType).toBe('construction');
    expect(buildWorkflowRoutingInputFromDeal(deal({ productType: 'Commercial Real Estate' })).productType).toBe('cre');
    expect(buildWorkflowRoutingInputFromDeal(deal({ productType: 'Working Capital Line' })).productType).toBe('working_capital');
    expect(buildWorkflowRoutingInputFromDeal(deal({ productType: 'Small Business Term Loan' })).productType).toBe('small_business');
  });

  it('an SBA product that is not 7(a) (e.g. SBA 504) does not get misclassified as sba_7a', () => {
    expect(buildWorkflowRoutingInputFromDeal(deal({ productType: 'SBA 504' })).productType).toBe('unknown');
  });

  it('stage is lowercased/underscored best-effort; unmapped stage vocabulary is harmless', () => {
    expect(buildWorkflowRoutingInputFromDeal(deal({ stage: 'Intake' })).stage).toBe('intake');
    expect(buildWorkflowRoutingInputFromDeal(deal({ stage: 'Credit Approval' })).stage).toBe('credit_approval');
    expect(buildWorkflowRoutingInputFromDeal(deal({ stage: undefined })).stage).toBeUndefined();
  });

  it('does not fabricate document / annual-review / covenant / package / portfolio data the DealDetail model does not carry', () => {
    const input = buildWorkflowRoutingInputFromDeal(deal());
    expect(input.documentReadiness).toBeUndefined();
    expect(input.annualReviewDueStatus).toBeUndefined();
    expect(input.covenantStatus).toBeUndefined();
    expect(input.packageReadiness).toBeUndefined();
    expect(input.portfolioBoardingStatus).toBeUndefined();
    expect(input.exceptionStatus).toBeUndefined();
  });

  it('customerType is left unset — DealDetail.customerType is an industry/segment choice, not the routing model\'s new-vs-existing relationship field', () => {
    expect(buildWorkflowRoutingInputFromDeal(deal({ customerType: 'C&I' })).customerType).toBeUndefined();
  });
});
