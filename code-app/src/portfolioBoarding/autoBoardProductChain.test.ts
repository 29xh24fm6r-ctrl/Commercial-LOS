import { describe, it, expect, vi } from 'vitest';
import type { DealDetail } from '../deals/dealQueries';
import { mapDealToExistingLoanInput } from './mapDealToExistingLoanInput';
import { boardExistingLoan, type ExistingLoanDeps } from './existingLoanEntryAdapter';
import { parseExtendedLoanAttributes } from './extendedLoanAttributes';

/**
 * Workstream K — locks in the finding that `product` already flows end to
 * end through auto-boarding: deal.productType -> mapDealToExistingLoanInput
 * -> boardExistingLoan -> the persisted cr664_extendedloanattributes blob.
 * This is the SAME live path buildLiveStageAdvanceDeps.ts's onDealBoarded
 * uses (no override of persistExtended, so it defaults to enabled).
 */

function deal(overrides: Partial<DealDetail> = {}): DealDetail {
  return {
    id: 'deal-42',
    name: 'Acme Expansion',
    clientName: 'Acme Manufacturing LLC',
    stage: 'BOARDED',
    status: 'Active',
    amount: 3_500_000,
    bankerName: 'Banker',
    targetCloseDate: '2026-08-31',
    productType: 'Term Loan',
    loanStructure: 'Senior secured',
    customerType: 'C&I',
    industry: 'Manufacturing',
    guarantorStructure: 'Corporate',
    pricingType: 'Floating',
    spreadIndex: 'SOFR',
    spreadMargin: 250,
    collateralSummary: 'Equipment',
    createdOn: '2026-01-01',
    stageEntryDate: '2026-06-01',
    isClosed: true,
    ...overrides,
  };
}

function deps(over: Partial<ExistingLoanDeps> = {}): ExistingLoanDeps {
  return {
    loanNumberExists: vi.fn(async () => false),
    createRoot: vi.fn(async () => ({ success: true, id: 'loan-1' })),
    readRoot: vi.fn(async () => ({ success: true, data: { cr664_loannumber: 'deal-42' } })),
    createChild: vi.fn(async () => ({ success: true, id: 'child-1' })),
    emitAudit: vi.fn(async () => ({ success: true, id: 'audit-1' })),
    ...over,
  };
}

describe('Workstream K — auto-board product persistence chain', () => {
  it('carries deal.productType through the full auto-board write into the extended-attributes blob', async () => {
    const input = mapDealToExistingLoanInput({
      deal: deal({ productType: 'SBA 7(a)' }),
      authorized: true,
      actorEmail: 'banker@oldglorybank.com',
      actorSystemUserId: 'sys-1',
    });
    expect(input).not.toBeNull();
    expect(input!.product).toBe('SBA 7(a)');

    const createRoot = vi.fn(async (_p: Record<string, unknown>) => ({ success: true, id: 'loan-1' }));
    const d = deps({ createRoot });

    // Same call shape as buildLiveStageAdvanceDeps.ts's onDealBoarded: no
    // options override, so persistExtended defaults to enabled.
    const out = await boardExistingLoan(input!, d);
    expect(out.kind).toBe('success');

    const payload = createRoot.mock.calls[0]![0] as Record<string, unknown>;
    const blobRaw = payload['cr664_extendedloanattributes'] as string | undefined;
    expect(blobRaw).toBeDefined();
    const attrs = parseExtendedLoanAttributes(blobRaw ?? null);
    expect(attrs).not.toBeNull();
    expect(attrs!.product).toBe('SBA 7(a)');
  });

  it('never fabricates risk rating or portfolio manager during auto-board (both genuinely absent upstream)', async () => {
    const input = mapDealToExistingLoanInput({
      deal: deal(),
      authorized: true,
      actorEmail: 'banker@oldglorybank.com',
      actorSystemUserId: 'sys-1',
    });
    expect(input).not.toBeNull();
    expect(input!.currentRiskRating).toBeUndefined();
    expect(input!.portfolioManagerId).toBeUndefined();

    const createRoot = vi.fn(async (_p: Record<string, unknown>) => ({ success: true, id: 'loan-1' }));
    const d = deps({ createRoot });
    const out = await boardExistingLoan(input!, d);
    expect(out.kind).toBe('success');

    const payload = createRoot.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload['cr664_currentriskrating']).toBeUndefined();
    expect(payload['cr664_PortfolioManager@odata.bind']).toBeUndefined();
  });
});
