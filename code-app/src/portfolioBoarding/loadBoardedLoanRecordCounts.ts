/**
 * Factory Arc Phase 9 — the SDK-touching loader for per-loan record completeness.
 * Reads the real row COUNT for each of the ten child groups the governed
 * "Board existing loan" write path can create (existingLoanEntryAdapter.ts),
 * filtered to the one boarded loan. Dynamic-import-only (no static SDK import in
 * this module's top level), same convention as loadBoardingHandoffForDeal.ts.
 *
 * FAIL-CLOSED per group: a failed read reports `null` for that group (never a
 * fabricated 0) so the caller can distinguish "confirmed empty" from "could not
 * be read right now".
 */

import { EXISTING_LOAN_CHILD_KEYS, type ExistingLoanChildKey } from './existingLoanEntryAdapter';

/** Service module path + export name for each child group, keyed the same way as EXISTING_LOAN_CHILD_ENTITY_SETS. */
const CHILD_SERVICE_MODULE: Readonly<Record<ExistingLoanChildKey, { path: string; exportName: string; idField: string }>> = Object.freeze({
  borrowers: { path: '../generated/services/Cr664_portfolioboardedloanborrowersService', exportName: 'Cr664_portfolioboardedloanborrowersService', idField: 'cr664_portfolioboardedloanborrowerid' },
  collateral: { path: '../generated/services/Cr664_portfolioboardedloancollateralsService', exportName: 'Cr664_portfolioboardedloancollateralsService', idField: 'cr664_portfolioboardedloancollateralid' },
  guarantors: { path: '../generated/services/Cr664_portfolioboardedloanguarantorsService', exportName: 'Cr664_portfolioboardedloanguarantorsService', idField: 'cr664_portfolioboardedloanguarantorid' },
  covenants: { path: '../generated/services/Cr664_portfolioboardedloancovenantsService', exportName: 'Cr664_portfolioboardedloancovenantsService', idField: 'cr664_portfolioboardedloancovenantid' },
  ticklers: { path: '../generated/services/Cr664_portfolioboardedloanticklersService', exportName: 'Cr664_portfolioboardedloanticklersService', idField: 'cr664_portfolioboardedloanticklerid' },
  insurance: { path: '../generated/services/Cr664_portfolioboardedloaninsurancesService', exportName: 'Cr664_portfolioboardedloaninsurancesService', idField: 'cr664_portfolioboardedloaninsuranceid' },
  documents: { path: '../generated/services/Cr664_portfolioboardedloandocumentsService', exportName: 'Cr664_portfolioboardedloandocumentsService', idField: 'cr664_portfolioboardedloandocumentid' },
  exceptions: { path: '../generated/services/Cr664_portfolioboardedloanexceptionsService', exportName: 'Cr664_portfolioboardedloanexceptionsService', idField: 'cr664_portfolioboardedloanexceptionid' },
  reviews: { path: '../generated/services/Cr664_portfolioboardedloanreviewsService', exportName: 'Cr664_portfolioboardedloanreviewsService', idField: 'cr664_portfolioboardedloanreviewid' },
  examinerNotes: { path: '../generated/services/Cr664_portfolioboardedloanexaminernotesService', exportName: 'Cr664_portfolioboardedloanexaminernotesService', idField: 'cr664_portfolioboardedloanexaminernoteid' },
});

export type BoardedLoanChildCounts = Partial<Record<ExistingLoanChildKey, number | null>>;

async function countChildGroup(key: ExistingLoanChildKey, loanId: string): Promise<number | null> {
  const spec = CHILD_SERVICE_MODULE[key];
  try {
    const mod = (await import(spec.path)) as Record<string, { getAll: (options?: unknown) => Promise<{ success: boolean; data?: unknown[] }> }>;
    const service = mod[spec.exportName];
    const res = await service.getAll({
      select: [spec.idField],
      filter: `_cr664_portfolioboardedloan_value eq ${loanId}`,
    });
    if (!res.success || !Array.isArray(res.data)) return null;
    return res.data.length;
  } catch {
    return null;
  }
}

/** Reads all ten child-group counts for one boarded loan, in parallel, each failing closed independently. */
export async function loadBoardedLoanRecordCounts(loanId: string): Promise<BoardedLoanChildCounts> {
  const entries = await Promise.all(
    EXISTING_LOAN_CHILD_KEYS.map(async (key) => [key, await countChildGroup(key, loanId)] as const),
  );
  return Object.fromEntries(entries) as BoardedLoanChildCounts;
}
