import { describe, it, expect, vi } from 'vitest';
import { parseCsv, autoMapColumns, validateRows, parseAndValidateCsv } from './portfolioImportParser';
import { buildImportTemplateCsv, templateHeaders } from './portfolioImportColumns';
import { runPortfolioImport, type ImportRunnerDeps } from './portfolioImportRunner';
import type { ExistingLoanInput, BoardExistingLoanOutcome, ExistingLoanDeps } from './existingLoanEntryAdapter';

/**
 * Phase 261 (C) — portfolio bulk import: parser, validation, duplicate
 * detection, and governed-adapter batch boarding + import audit.
 */

const HEADER = 'Loan Number,Borrower Legal Name,Current Loan Status,Original Commitment Amount,Current Outstanding Principal,Booking Date,Watchlist Flag,Guarantor Name';

describe('parseCsv', () => {
  it('parses quoted fields with embedded commas, quotes, and newlines', () => {
    const csv = 'a,b,c\n"x,1","y ""q""","line1\nline2"';
    const rows = parseCsv(csv);
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['x,1', 'y "q"', 'line1\nline2'],
    ]);
  });

  it('handles CRLF line endings and a UTF-8 BOM, dropping blank lines', () => {
    const csv = '﻿a,b\r\n1,2\r\n\r\n3,4\r\n';
    expect(parseCsv(csv)).toEqual([['a', 'b'], ['1', '2'], ['3', '4']]);
  });
});

describe('autoMapColumns', () => {
  it('maps headers and aliases case-insensitively to canonical keys', () => {
    const m = autoMapColumns(['LOAN #', 'Obligor', 'Outstanding Principal', 'Guarantor']);
    expect(m.scalar.loanNumber).toBe(0);
    expect(m.scalar.borrowerLegalName).toBe(1);
    expect(m.scalar.currentOutstandingPrincipal).toBe(2);
    expect(m.child.guarantors).toBe(3);
  });
});

describe('validateRows', () => {
  it('accepts a clean row and maps numbers, booleans, and child cells', () => {
    const csv = `${HEADER}\nL-1,Acme LLC,Current,"$500,000","412,345.67",2022-03-15,No,Jane Doe; John Doe`;
    const parsed = parseAndValidateCsv(csv);
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.valid).toHaveLength(1);
    const v = parsed.valid[0];
    expect(v.loanNumber).toBe('L-1');
    expect(v.input.originalCommitmentAmount).toBe(500000);
    expect(v.input.currentOutstandingPrincipal).toBeCloseTo(412345.67);
    expect(v.input.watchlistFlag).toBe(false);
    expect(v.input.guarantors).toEqual([{ name: 'Jane Doe' }, { name: 'John Doe' }]);
  });

  it('rejects rows missing required fields with readable errors', () => {
    const csv = `${HEADER}\n,No Number Borrower,Current,,,,,`;
    const parsed = parseAndValidateCsv(csv);
    expect(parsed.valid).toHaveLength(0);
    expect(parsed.errors[0].messages.join(' ')).toMatch(/Loan Number is required/i);
  });

  it('rejects malformed numbers and dates', () => {
    const csv = `${HEADER}\nL-2,Beta LLC,Current,not-a-number,1000,99-99-9999,No,`;
    const parsed = parseAndValidateCsv(csv);
    expect(parsed.valid).toHaveLength(0);
    const msg = parsed.errors[0].messages.join(' ');
    expect(msg).toMatch(/not a valid number/i);
    expect(msg).toMatch(/not a valid date/i);
  });

  it('detects duplicates against the existing book and within the file', () => {
    const csv = `${HEADER}\nL-9,Acme,Current,1,1,2022-01-01,No,\nL-9,Acme Two,Current,1,1,2022-01-01,No,\nEXIST-1,Gamma,Current,1,1,2022-01-01,No,`;
    const parsed = parseAndValidateCsv(csv, ['exist-1']);
    // First L-9 is valid; second L-9 is an in-file duplicate; EXIST-1 collides with the book.
    expect(parsed.valid.map((v) => v.loanNumber)).toEqual(['L-9']);
    expect(parsed.duplicateInFile).toContain('L-9');
    expect(parsed.duplicateExisting).toContain('EXIST-1');
    expect(parsed.errors).toHaveLength(2);
  });
});

describe('buildImportTemplateCsv', () => {
  it('round-trips through the parser with every template header present', () => {
    const csv = buildImportTemplateCsv();
    const rows = parseCsv(csv);
    expect(rows[0]).toEqual(templateHeaders());
    // The sample row validates cleanly (it is a well-formed example).
    const parsed = validateRows(rows);
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.valid).toHaveLength(1);
    expect(parsed.valid[0].loanNumber).toBe('SAMPLE-1001');
  });

  it('includes the Phase 262 rate + CRM + officer/branch columns', () => {
    const headers = templateHeaders();
    for (const h of [
      'Interest Rate Type', 'Index', 'Spread', 'Floor Rate', 'Ceiling Rate', 'Current Note Rate',
      'Loan Product', 'Assigned Loan Officer', 'Assigned Portfolio Manager', 'Branch Number', 'Loan Purpose',
      'First Reset Date', 'First Reset Payment Number', 'Reset Frequency', 'Next Rate Change Date', 'Payment 61 Reset',
      'CRM Primary Contact', 'Guarantor Email', 'Guarantor Phone',
    ]) {
      expect(headers).toContain(h);
    }
  });
});

describe('Phase 262 — rate validation', () => {
  const RATE_HEADER = 'Loan Number,Borrower Legal Name,Interest Rate Type,Index,Spread,Payment 61 Reset,First Reset Date';

  it('rejects a Variable loan missing index or spread', () => {
    const csv = `${RATE_HEADER}\nV-1,Acme,Variable,,,,`;
    const parsed = parseAndValidateCsv(csv);
    expect(parsed.valid).toHaveLength(0);
    const msg = parsed.errors[0].messages.join(' ');
    expect(msg).toMatch(/require an Index/i);
    expect(msg).toMatch(/require a Spread/i);
  });

  it('accepts a Variable loan with index + spread, persisting them', () => {
    const csv = `${RATE_HEADER}\nV-2,Acme,Variable,Prime,1.5,,`;
    const parsed = parseAndValidateCsv(csv);
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.valid).toHaveLength(1);
    expect(parsed.valid[0].input.index).toBe('Prime');
    expect(parsed.valid[0].input.spread).toBe(1.5);
  });

  it('does NOT require index/spread for a Fixed loan', () => {
    const csv = `${RATE_HEADER}\nF-1,Acme,Fixed,,,,`;
    const parsed = parseAndValidateCsv(csv);
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.valid).toHaveLength(1);
  });

  it('requires reset terms when Payment 61 Reset is Yes', () => {
    const csv = `${RATE_HEADER}\nP-1,Acme,Fixed,,,Yes,`;
    const parsed = parseAndValidateCsv(csv);
    expect(parsed.valid).toHaveLength(0);
    expect(parsed.errors[0].messages.join(' ')).toMatch(/Payment-61 reset loans require reset terms/i);
  });

  it('accepts Payment 61 Reset = Yes when a reset term is provided', () => {
    const csv = `${RATE_HEADER}\nP-2,Acme,Fixed,,,Yes,2027-03-15`;
    const parsed = parseAndValidateCsv(csv);
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.valid).toHaveLength(1);
  });
});

describe('runPortfolioImport', () => {
  function okOutcome(loanNumber: string): BoardExistingLoanOutcome {
    return { kind: 'success', loanId: `id-${loanNumber}`, loanNumber, correlationId: 'c', childCreated: 0, childErrors: [], auditId: 'a' };
  }
  function stubDeps(): ImportRunnerDeps {
    return {
      loanNumberExists: vi.fn(async () => false),
      createRoot: vi.fn(async () => ({ success: true, id: 'x' })),
      readRoot: vi.fn(async () => ({ success: true, data: { cr664_loannumber: 'x' } })),
      createChild: vi.fn(async () => ({ success: true, id: 'c' })),
      emitAudit: vi.fn(async () => ({ success: true, id: 'au' })),
      emitImportAudit: vi.fn(async () => ({ success: true, id: 'imp-audit' })),
    };
  }

  it('boards each valid row through the governed adapter and writes one import audit', async () => {
    const csv = `${HEADER}\nL-1,Acme,Current,1,1,2022-01-01,No,\nL-2,Beta,Current,1,1,2022-01-01,No,`;
    const { valid } = parseAndValidateCsv(csv);
    const deps = stubDeps();
    const boardFn = vi.fn(async (input: ExistingLoanInput): Promise<BoardExistingLoanOutcome> => okOutcome(input.loanNumber));

    const summary = await runPortfolioImport(
      valid,
      { actorEmail: 'op@bank.test', actorSystemUserId: 'sys-1', authorized: true },
      deps,
      'book.csv',
      boardFn,
    );

    expect(boardFn).toHaveBeenCalledTimes(2);
    // Governance fields are injected onto every boarded row.
    expect(boardFn.mock.calls[0][0].authorized).toBe(true);
    expect(boardFn.mock.calls[0][0].actorSystemUserId).toBe('sys-1');
    expect(summary.successCount).toBe(2);
    expect(summary.failureCount).toBe(0);
    expect(summary.auditWritten).toBe(true);
    expect(deps.emitImportAudit).toHaveBeenCalledTimes(1);
    const auditPayload = (deps.emitImportAudit as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(auditPayload.cr664_action).toBe('portfolio-bulk-import');
    expect(String(auditPayload.cr664_reason)).toMatch(/2 boarded/);
  });

  it('reports per-row failures without hiding them, and still writes the summary audit', async () => {
    const csv = `${HEADER}\nL-1,Acme,Current,1,1,2022-01-01,No,\nL-2,Beta,Current,1,1,2022-01-01,No,`;
    const { valid } = parseAndValidateCsv(csv);
    const deps = stubDeps();
    const boardFn = vi.fn(async (input: ExistingLoanInput): Promise<BoardExistingLoanOutcome> =>
      input.loanNumber === 'L-2'
        ? { kind: 'write-failed', error: 'boom', correlationId: 'c' }
        : okOutcome(input.loanNumber),
    );

    const summary = await runPortfolioImport(
      valid,
      { actorEmail: 'op@bank.test', actorSystemUserId: 'sys-1', authorized: true },
      deps,
      'book.csv',
      boardFn,
    );

    expect(summary.successCount).toBe(1);
    expect(summary.failureCount).toBe(1);
    const failed = summary.results.find((r) => r.loanNumber === 'L-2');
    expect(failed?.boarded).toBe(false);
    expect(failed?.outcome.kind).toBe('write-failed');
    expect(summary.auditWritten).toBe(true);
  });

  it('fails closed: an unauthorized actor boards nothing (adapter returns unauthorized)', async () => {
    const csv = `${HEADER}\nL-1,Acme,Current,1,1,2022-01-01,No,`;
    const { valid } = parseAndValidateCsv(csv);
    const deps = stubDeps();
    // Use the REAL adapter via default boardFn semantics by injecting a board
    // function that mirrors the unauthorized short-circuit.
    const boardFn = vi.fn(async (input: ExistingLoanInput, _d: ExistingLoanDeps): Promise<BoardExistingLoanOutcome> =>
      input.authorized ? okOutcome(input.loanNumber) : { kind: 'unauthorized', reason: 'not authorized' },
    );

    const summary = await runPortfolioImport(
      valid,
      { actorEmail: undefined, actorSystemUserId: undefined, authorized: false },
      deps,
      'book.csv',
      boardFn,
    );

    expect(summary.successCount).toBe(0);
    expect(summary.results[0].outcome.kind).toBe('unauthorized');
  });
});
