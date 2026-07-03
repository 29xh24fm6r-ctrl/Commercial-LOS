import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadBoardedLoansWith,
  getExtendedColumnProvisioning,
  resetExtendedColumnProvisioningForTests,
  type BoardedLoanReader,
  type BoardedLoanReadResponse,
} from './boardedLoansList';
import {
  EXTENDED_LOAN_ATTRIBUTES_COLUMN,
  serializeExtendedLoanAttributes,
  buildExtendedLoanAttributes,
} from './extendedLoanAttributes';

/**
 * PE-0A — provisioning-aware boarded-loan read. The additive
 * `cr664_extendedloanattributes` column may not be provisioned; the reader must
 * fail CLOSED (strip the column, return rows) rather than surface the Dataverse
 * `0x80060888` "Could not find a property named ..." crash that broke both the
 * Existing Portfolio Loans and Variable Rate Control Center panels.
 */

const MISSING_COLUMN_ERROR = `0x80060888 Could not find a property named '${EXTENDED_LOAN_ATTRIBUTES_COLUMN}' on type 'cr664_portfolioboardedloan'.`;
const MISSING_PORTFOLIO_MANAGER_ERROR = "0x80060888 Could not find a property named 'cr664_portfoliomanager' on type 'cr664_portfolioboardedloan'.";

function ok(data: readonly Record<string, unknown>[]): BoardedLoanReadResponse {
  return { success: true, data: data as never };
}
function fail(message: string): BoardedLoanReadResponse {
  return { success: false, error: { message } };
}

beforeEach(() => {
  resetExtendedColumnProvisioningForTests();
});

describe('loadBoardedLoansWith — extended-attributes column not provisioned', () => {
  it('strips the column, retries core-only, returns rows, and never throws 0x80060888', async () => {
    const read = vi.fn<BoardedLoanReader>(async (select) =>
      select.includes(EXTENDED_LOAN_ATTRIBUTES_COLUMN)
        ? fail(MISSING_COLUMN_ERROR)
        : ok([{ cr664_portfolioboardedloanid: 'a', cr664_loannumber: 'L-1' }]),
    );

    const rows = await loadBoardedLoansWith(read);

    expect(rows).toHaveLength(1);
    expect(rows[0].loanNumber).toBe('L-1');
    expect(rows[0].extended).toBeNull();
    // First call included the column; the retry dropped it.
    expect(read).toHaveBeenCalledTimes(2);
    expect(read.mock.calls[0][0]).toContain(EXTENDED_LOAN_ATTRIBUTES_COLUMN);
    expect(read.mock.calls[1][0]).not.toContain(EXTENDED_LOAN_ATTRIBUTES_COLUMN);
    expect(getExtendedColumnProvisioning()).toBe('absent');
  });

  it('caches "absent" for the session — subsequent reads never re-request the column', async () => {
    const read = vi.fn<BoardedLoanReader>(async (select) =>
      select.includes(EXTENDED_LOAN_ATTRIBUTES_COLUMN)
        ? fail(MISSING_COLUMN_ERROR)
        : ok([{ cr664_portfolioboardedloanid: 'a', cr664_loannumber: 'L-1' }]),
    );

    await loadBoardedLoansWith(read); // probes: 2 calls
    read.mockClear();
    const rows = await loadBoardedLoansWith(read); // cached absent: 1 core-only call

    expect(rows).toHaveLength(1);
    expect(read).toHaveBeenCalledTimes(1);
    expect(read.mock.calls[0][0]).not.toContain(EXTENDED_LOAN_ATTRIBUTES_COLUMN);
  });
});

describe('loadBoardedLoansWith — extended-attributes column provisioned', () => {
  it('includes additive book columns and round-trips the persisted blob', async () => {
    const blob = serializeExtendedLoanAttributes(
      buildExtendedLoanAttributes({ currentNoteRate: 6.5, product: 'C&I Term Loan' }),
    )!;
    const read = vi.fn<BoardedLoanReader>(async () =>
      ok([{
        cr664_portfolioboardedloanid: 'a',
        cr664_loannumber: 'L-1',
        cr664_pastduedays: 15,
        cr664_accrualstatus: 'Accruing',
        cr664_nextreviewdate: '2026-08-01',
        cr664_originalcommitment: 2_000_000,
        cr664_bookingdate: '2025-02-01',
        cr664_closingdate: '2025-01-15',
        cr664_collateraltype: 'CRE',
        cr664_lienposition: 'first',
        cr664_guaranteeamount: 500_000,
        cr664_portfoliomanager: 'Jordan Banker',
        [EXTENDED_LOAN_ATTRIBUTES_COLUMN]: blob,
      }]),
    );

    const rows = await loadBoardedLoansWith(read);

    expect(read).toHaveBeenCalledTimes(1);
    expect(read.mock.calls[0][0]).toContain(EXTENDED_LOAN_ATTRIBUTES_COLUMN);
    expect(read.mock.calls[0][0]).toContain('cr664_portfoliomanager');
    expect(rows[0].extended?.currentNoteRate).toBe(6.5);
    expect(rows[0].extended?.product).toBe('C&I Term Loan');
    expect(rows[0]).toMatchObject({
      pastDueDays: 15,
      accrualStatus: 'Accruing',
      nextReviewDate: '2026-08-01',
      originalCommitment: 2_000_000,
      bookingDate: '2025-02-01',
      closingDate: '2025-01-15',
      collateralType: 'CRE',
      lienPosition: 'first',
      guaranteeAmount: 500_000,
      portfolioManager: 'Jordan Banker',
    });
    expect(getExtendedColumnProvisioning()).toBe('present');
  });

  it('strips all additive book columns when any additive column is not provisioned', async () => {
    const read = vi.fn<BoardedLoanReader>(async (select) =>
      select.includes('cr664_portfoliomanager')
        ? fail(MISSING_PORTFOLIO_MANAGER_ERROR)
        : ok([{ cr664_portfolioboardedloanid: 'a', cr664_loannumber: 'L-1' }]),
    );

    const rows = await loadBoardedLoansWith(read);

    expect(rows).toHaveLength(1);
    expect(read).toHaveBeenCalledTimes(2);
    expect(read.mock.calls[0][0]).toContain('cr664_portfoliomanager');
    expect(read.mock.calls[1][0]).not.toContain('cr664_portfoliomanager');
    expect(read.mock.calls[1][0]).not.toContain(EXTENDED_LOAN_ATTRIBUTES_COLUMN);
    expect(getExtendedColumnProvisioning()).toBe('absent');
  });
});

describe('loadBoardedLoansWith — unrelated failures surface honestly', () => {
  it('rethrows a non-provisioning error without a silent retry', async () => {
    const read = vi.fn<BoardedLoanReader>(async () => fail('Timeout contacting Dataverse'));

    await expect(loadBoardedLoansWith(read)).rejects.toThrow(/Timeout contacting Dataverse/);
    // No strip-and-retry for errors that are not the missing extended column.
    expect(read).toHaveBeenCalledTimes(1);
    expect(getExtendedColumnProvisioning()).toBe('unknown');
  });
});
