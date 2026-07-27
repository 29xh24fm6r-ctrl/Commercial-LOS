import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  loadBoardedLoansWith,
  loadAllBoardedLoansWith,
  getExtendedColumnProvisioning,
  resetExtendedColumnProvisioningForTests,
  EXTENDED_SELECT_FOR_TESTS,
  type BoardedLoanReader,
  type BoardedLoanReadResponse,
  type ExtendedColumnCapabilityReader,
  type ExtendedColumnCapabilityResult,
} from './boardedLoansList';
import {
  EXTENDED_LOAN_ATTRIBUTES_COLUMN,
  serializeExtendedLoanAttributes,
  buildExtendedLoanAttributes,
} from './extendedLoanAttributes';

/**
 * Phase 264 (P1) — provisioning-aware boarded-loan read. The additive
 * `cr664_extendedloanattributes` column may not be provisioned; the reader must
 * fail CLOSED (omit the column, return rows) rather than surface the Dataverse
 * `0x80060888` "Could not find a property named ..." crash that broke both the
 * Existing Portfolio Loans and Variable Rate Control Center panels.
 *
 * Provisioning is now resolved from real Dataverse entity metadata (a
 * `checkCapability` reader), not by parsing a failed read's error text. The
 * old error-text match survives only as a defensive backstop — see the
 * "defensive backstop" describe block below — never as the primary contract.
 */

const MISSING_COLUMN_ERROR = `0x80060888 Could not find a property named '${EXTENDED_LOAN_ATTRIBUTES_COLUMN}' on type 'cr664_portfolioboardedloan'.`;

function ok(data: readonly Record<string, unknown>[]): BoardedLoanReadResponse {
  return { success: true, data: data as never };
}
function fail(message: string): BoardedLoanReadResponse {
  return { success: false, error: { message } };
}

/** Metadata says the additive column IS on the live entity. */
function capabilityPresent(): ExtendedColumnCapabilityReader {
  return vi.fn<ExtendedColumnCapabilityReader>(async () => ({
    success: true,
    attributeLogicalNames: ['cr664_loannumber', 'cr664_borrowerlegalname', EXTENDED_LOAN_ATTRIBUTES_COLUMN],
  }));
}

/** Metadata says the additive column is NOT on the live entity. */
function capabilityAbsent(): ExtendedColumnCapabilityReader {
  return vi.fn<ExtendedColumnCapabilityReader>(async () => ({
    success: true,
    attributeLogicalNames: ['cr664_loannumber', 'cr664_borrowerlegalname'],
  }));
}

/** The metadata call itself failed — must fail closed, never crash. */
function capabilityCheckFails(): ExtendedColumnCapabilityReader {
  return vi.fn<ExtendedColumnCapabilityReader>(async (): Promise<ExtendedColumnCapabilityResult> => ({ success: false }));
}

beforeEach(() => {
  resetExtendedColumnProvisioningForTests();
});

describe('loadBoardedLoansWith — metadata says the additive column is absent', () => {
  it('never requests the additive column and returns core rows', async () => {
    const checkCapability = capabilityAbsent();
    const read = vi.fn<BoardedLoanReader>(async () => ok([{ cr664_portfolioboardedloanid: 'a', cr664_loannumber: 'L-1' }]));

    const rows = await loadBoardedLoansWith(read, checkCapability);

    expect(rows).toHaveLength(1);
    expect(rows[0].extended).toBeNull();
    expect(read).toHaveBeenCalledTimes(1);
    expect(read.mock.calls[0][0]).not.toContain(EXTENDED_LOAN_ATTRIBUTES_COLUMN);
    expect(getExtendedColumnProvisioning()).toBe('absent');
  });

  it('caches the decision for the session — the capability check runs only once', async () => {
    const checkCapability = capabilityAbsent();
    const read = vi.fn<BoardedLoanReader>(async () => ok([{ cr664_portfolioboardedloanid: 'a', cr664_loannumber: 'L-1' }]));

    await loadBoardedLoansWith(read, checkCapability);
    await loadBoardedLoansWith(read, checkCapability);

    expect(checkCapability).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(2);
  });
});

describe('loadBoardedLoansWith — metadata says the additive column is present', () => {
  it('includes additive book columns and round-trips the persisted blob', async () => {
    const checkCapability = capabilityPresent();
    const blob = serializeExtendedLoanAttributes(
      buildExtendedLoanAttributes({ currentNoteRate: 6.5, product: 'C&I Term Loan' }),
    )!;
    const read = vi.fn<BoardedLoanReader>(async () =>
      ok([{
        cr664_portfolioboardedloanid: 'a',
        cr664_loannumber: 'L-1',
        _cr664_originatedloandeal_value: 'deal-42',
        cr664_pastduedays: 15,
        cr664_accrualstatus: 'Accruing',
        cr664_nextreviewdate: '2026-08-01',
        // WI-1: real column name is cr664_originalcommitmentamount (not …commitment).
        cr664_originalcommitmentamount: 2_000_000,
        cr664_bookingdate: '2025-02-01',
        cr664_closingdate: '2025-01-15',
        // WI-2: portfolio manager is a lookup — the display name arrives on the
        // `_value` FormattedValue annotation, not a plain cr664_portfoliomanager column.
        _cr664_portfoliomanager_value: 'sysuser-guid-1',
        '_cr664_portfoliomanager_value@OData.Community.Display.V1.FormattedValue': 'Jordan Banker',
        [EXTENDED_LOAN_ATTRIBUTES_COLUMN]: blob,
      }]),
    );

    const rows = await loadBoardedLoansWith(read, checkCapability);

    expect(read).toHaveBeenCalledTimes(1);
    expect(read.mock.calls[0][0]).toContain(EXTENDED_LOAN_ATTRIBUTES_COLUMN);
    // The selectable lookup column is the `_value`, never the raw nav property.
    expect(read.mock.calls[0][0]).toContain('_cr664_portfoliomanager_value');
    expect(read.mock.calls[0][0]).not.toContain('cr664_portfoliomanager '); // guard against a bare-nav select
    expect(rows[0].extended?.currentNoteRate).toBe(6.5);
    expect(rows[0].extended?.product).toBe('C&I Term Loan');
    expect(rows[0]).toMatchObject({
      pastDueDays: 15,
      accrualStatus: 'Accruing',
      nextReviewDate: '2026-08-01',
      originalCommitment: 2_000_000,
      bookingDate: '2025-02-01',
      closingDate: '2025-01-15',
      portfolioManager: 'Jordan Banker',
      originatedDealId: 'deal-42',
    });
    // Child-sourced fields are never populated from the main row (WI-6, deferred).
    expect(rows[0].collateralType).toBeUndefined();
    expect(rows[0].lienPosition).toBeUndefined();
    expect(rows[0].guaranteeAmount).toBeUndefined();
    expect(getExtendedColumnProvisioning()).toBe('present');
  });

  it('maps the portfolio-manager name from the shadow field when the annotation is absent', async () => {
    const read = vi.fn<BoardedLoanReader>(async () =>
      ok([{
        cr664_portfolioboardedloanid: 'a',
        cr664_loannumber: 'L-1',
        _cr664_portfoliomanager_value: 'sysuser-guid-1',
        cr664_portfoliomanagername: 'Dana Manager',
      }]),
    );

    const rows = await loadBoardedLoansWith(read, capabilityPresent());

    expect(rows[0].portfolioManager).toBe('Dana Manager');
  });

  describe('defensive backstop — live read still disagrees with metadata', () => {
    it('strips the column, retries core-only, returns rows, and never throws 0x80060888', async () => {
      const checkCapability = capabilityPresent();
      const read = vi.fn<BoardedLoanReader>(async (select) =>
        select.includes(EXTENDED_LOAN_ATTRIBUTES_COLUMN)
          ? fail(MISSING_COLUMN_ERROR)
          : ok([{ cr664_portfolioboardedloanid: 'a', cr664_loannumber: 'L-1' }]),
      );

      const rows = await loadBoardedLoansWith(read, checkCapability);

      expect(rows).toHaveLength(1);
      expect(rows[0].extended).toBeNull();
      // First call included the column (metadata said present); the retry dropped it.
      expect(read).toHaveBeenCalledTimes(2);
      expect(read.mock.calls[0][0]).toContain(EXTENDED_LOAN_ATTRIBUTES_COLUMN);
      expect(read.mock.calls[1][0]).not.toContain(EXTENDED_LOAN_ATTRIBUTES_COLUMN);
      // The backstop corrects the cached decision so later reads never repeat this.
      expect(getExtendedColumnProvisioning()).toBe('absent');
    });

    it('strips only the extended blob — core book columns survive', async () => {
      const read = vi.fn<BoardedLoanReader>(async (select) =>
        select.includes(EXTENDED_LOAN_ATTRIBUTES_COLUMN)
          ? fail(MISSING_COLUMN_ERROR)
          : ok([{
              cr664_portfolioboardedloanid: 'a',
              cr664_loannumber: 'L-1',
              cr664_pastduedays: 15,
              '_cr664_portfoliomanager_value@OData.Community.Display.V1.FormattedValue': 'Jordan Banker',
            }]),
      );

      const rows = await loadBoardedLoansWith(read, capabilityPresent());

      expect(rows).toHaveLength(1);
      expect(read).toHaveBeenCalledTimes(2);
      expect(read.mock.calls[1][0]).not.toContain(EXTENDED_LOAN_ATTRIBUTES_COLUMN);
      expect(read.mock.calls[1][0]).toContain('cr664_pastduedays');
      expect(read.mock.calls[1][0]).toContain('_cr664_portfoliomanager_value');
      expect(rows[0].pastDueDays).toBe(15);
      expect(rows[0].portfolioManager).toBe('Jordan Banker');
      expect(rows[0].extended).toBeNull();
    });
  });
});

describe('loadBoardedLoansWith — the metadata call itself fails', () => {
  it('fails closed to core-only rather than crash on an inconclusive capability answer', async () => {
    const read = vi.fn<BoardedLoanReader>(async () => ok([{ cr664_portfolioboardedloanid: 'a', cr664_loannumber: 'L-1' }]));

    const rows = await loadBoardedLoansWith(read, capabilityCheckFails());

    expect(rows).toHaveLength(1);
    expect(read.mock.calls[0][0]).not.toContain(EXTENDED_LOAN_ATTRIBUTES_COLUMN);
    expect(getExtendedColumnProvisioning()).toBe('absent');
  });
});

describe('WI-1 select-coverage guard — every mapped column is projected', () => {
  // Columns the mapper reads defensively WITHOUT selecting them: denormalized
  // lookup shadow fields the live SDK may or may not populate. They can never be
  // the source of the "$select gap" bug because they carry no data we depend on
  // (the authoritative value comes from the selected `_value` + its annotation).
  const READ_WITHOUT_SELECT_ALLOWLIST = new Set(['cr664_portfoliomanagername']);

  const SRC = readFileSync(resolve(__dirname, 'boardedLoansList.ts'), 'utf8');

  it('projects every cr664_* / _cr664_*_value column the mapper reads off the raw row', () => {
    // Scan for `r.cr664_…` and `r._cr664_…_value` reads (the mapper + helpers
    // access the raw row via the `r` parameter). Annotation keys are read via a
    // bracketed string, not `r.<ident>`, so they are correctly ignored here.
    const referenced = new Set<string>();
    for (const m of SRC.matchAll(/\br\.(_?cr664_[a-z0-9_]+)/g)) {
      referenced.add(m[1]);
    }
    // Sanity: the scan actually found the reads (guards against a regex that
    // silently matches nothing and passes vacuously).
    expect(referenced.has('cr664_loannumber')).toBe(true);
    expect(referenced.has('_cr664_portfoliomanager_value')).toBe(true);
    expect(referenced.has('_cr664_originatedloandeal_value')).toBe(true);

    const projected = new Set(EXTENDED_SELECT_FOR_TESTS);
    const gaps = [...referenced].filter(
      (col) => !projected.has(col) && !READ_WITHOUT_SELECT_ALLOWLIST.has(col),
    );
    expect(gaps).toEqual([]);
  });

  it('never selects the raw portfolio-manager navigation property (would throw 0x80060888)', () => {
    // The bare `cr664_portfoliomanager` lookup nav property is not selectable.
    expect(EXTENDED_SELECT_FOR_TESTS).not.toContain('cr664_portfoliomanager');
    expect(EXTENDED_SELECT_FOR_TESTS).toContain('_cr664_portfoliomanager_value');
  });

  it('projects the originating-deal lookup value as a core column', () => {
    expect(EXTENDED_SELECT_FOR_TESTS).toContain('_cr664_originatedloandeal_value');
  });

  it('does not select columns that live only on child entities (WI-6, deferred)', () => {
    for (const childCol of ['cr664_collateraltype', 'cr664_lienposition', 'cr664_guaranteeamount']) {
      expect(EXTENDED_SELECT_FOR_TESTS).not.toContain(childCol);
    }
  });
});

describe('loadBoardedLoansWith — unrelated failures surface honestly', () => {
  it('rethrows a non-provisioning error without a silent retry', async () => {
    const read = vi.fn<BoardedLoanReader>(async () => fail('Timeout contacting Dataverse'));

    await expect(loadBoardedLoansWith(read, capabilityPresent())).rejects.toThrow(/Timeout contacting Dataverse/);
    // No strip-and-retry for errors that are not the missing extended column.
    expect(read).toHaveBeenCalledTimes(1);
  });
});

/**
 * Phase 264 (P1) — pagination. Replaces the old silent `$top=200` cap: every
 * boarded loan must load, walking Dataverse skip-token pages, with a generous
 * (MAX_PAGES) safety ceiling reported via `truncated` rather than a silent drop.
 */
describe('loadAllBoardedLoansWith — pagination', () => {
  it('walks every page until the server reports no further skipToken', async () => {
    const pages: Record<string, readonly Record<string, unknown>[]> = {
      START: [{ cr664_portfolioboardedloanid: 'a', cr664_loannumber: 'L-1' }],
      'page-2': [{ cr664_portfolioboardedloanid: 'b', cr664_loannumber: 'L-2' }],
      'page-3': [{ cr664_portfolioboardedloanid: 'c', cr664_loannumber: 'L-3' }],
    };
    const nextToken: Record<string, string | undefined> = { START: 'page-2', 'page-2': 'page-3', 'page-3': undefined };

    const read = vi.fn<BoardedLoanReader>(async (_select, skipToken) => {
      const key = skipToken ?? 'START';
      return { success: true, data: pages[key] as never, skipToken: nextToken[key] };
    });

    const result = await loadAllBoardedLoansWith(read, capabilityPresent());

    expect(result.truncated).toBe(false);
    expect(result.rows.map((r) => r.loanNumber)).toEqual(['L-1', 'L-2', 'L-3']);
    expect(read).toHaveBeenCalledTimes(3);
    // Second/third calls carry the prior page's skipToken through to the reader.
    expect(read.mock.calls[1][1]).toBe('page-2');
    expect(read.mock.calls[2][1]).toBe('page-3');
  });

  it('a single page with no skipToken loads in one call (the common case)', async () => {
    const read = vi.fn<BoardedLoanReader>(async () => ok([{ cr664_portfolioboardedloanid: 'a', cr664_loannumber: 'L-1' }]));

    const result = await loadAllBoardedLoansWith(read, capabilityPresent());

    expect(read).toHaveBeenCalledTimes(1);
    expect(result.truncated).toBe(false);
    expect(result.rows).toHaveLength(1);
  });

  it('reports truncated=true (never a silent drop) when the safety ceiling is hit', async () => {
    let call = 0;
    const read = vi.fn<BoardedLoanReader>(async () => {
      call += 1;
      // Always returns another skipToken — an unbounded/pathological server response.
      return { success: true, data: [{ cr664_portfolioboardedloanid: `id-${call}`, cr664_loannumber: `L-${call}` }] as never, skipToken: `tok-${call}` };
    });

    const result = await loadAllBoardedLoansWith(read, capabilityPresent());

    expect(result.truncated).toBe(true);
    expect(result.rows.length).toBe(50); // MAX_PAGES ceiling, one row per page
  });

  it('resolves the capability check only once, across every page', async () => {
    const checkCapability = capabilityAbsent();
    const read = vi.fn<BoardedLoanReader>(async (_select, skipToken) => {
      const key = skipToken ?? 'START';
      if (key === 'START') {
        return { success: true, data: [{ cr664_portfolioboardedloanid: 'a', cr664_loannumber: 'L-1' }] as never, skipToken: 'page-2' };
      }
      return { success: true, data: [{ cr664_portfolioboardedloanid: 'b', cr664_loannumber: 'L-2' }] as never };
    });

    const result = await loadAllBoardedLoansWith(read, checkCapability);

    expect(result.rows).toHaveLength(2);
    expect(checkCapability).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(2);
    expect(read.mock.calls[0][0]).not.toContain(EXTENDED_LOAN_ATTRIBUTES_COLUMN);
    expect(read.mock.calls[1][0]).not.toContain(EXTENDED_LOAN_ATTRIBUTES_COLUMN);
  });

  it('propagates a defensive-backstop strip decision across every subsequent page', async () => {
    const read = vi.fn<BoardedLoanReader>(async (select, skipToken) => {
      if (select.includes(EXTENDED_LOAN_ATTRIBUTES_COLUMN)) return fail(MISSING_COLUMN_ERROR);
      const key = skipToken ?? 'START';
      if (key === 'START') {
        return { success: true, data: [{ cr664_portfolioboardedloanid: 'a', cr664_loannumber: 'L-1' }] as never, skipToken: 'page-2' };
      }
      return { success: true, data: [{ cr664_portfolioboardedloanid: 'b', cr664_loannumber: 'L-2' }] as never };
    });

    const result = await loadAllBoardedLoansWith(read, capabilityPresent());

    expect(result.rows).toHaveLength(2);
    // First page probes-and-strips (2 calls); second page reuses the cached "absent" (1 call).
    expect(read).toHaveBeenCalledTimes(3);
    expect(getExtendedColumnProvisioning()).toBe('absent');
  });
});
