import { describe, it, expect, vi } from 'vitest';
import {
  buildExtendedLoanAttributes,
  serializeExtendedLoanAttributes,
  parseExtendedLoanAttributes,
  EXTENDED_LOAN_ATTRIBUTES_COLUMN,
} from './extendedLoanAttributes';
import { boardExistingLoan, type ExistingLoanDeps, type ExistingLoanInput } from './existingLoanEntryAdapter';
import { mapBoardedLoanRow } from './boardedLoansList';
import { parseAndValidateCsv } from './portfolioImportParser';
import { buildRateIndexBook } from '../portfolio/variableRate/rateIndexModel';
import { deriveVariableRateRows, deriveRateAlerts } from '../portfolio/variableRate/variableRateModel';

/**
 * Launch Phase 2 — extended-attributes persistence: contract round-trip, governed write
 * behind the default-off flag (fail-closed when the column is absent), readback parse,
 * alert re-derivation from the persisted blob, and CSV population.
 */

describe('extendedLoanAttributes contract', () => {
  it('build → serialize → parse round-trips real values, dropping empties', () => {
    const attrs = buildExtendedLoanAttributes({ product: 'C&I Term Loan', loanOfficer: 'Jane', branch: '', currentNoteRate: 6.5, firstResetPaymentNumber: 61, payment61Reset: true });
    const json = serializeExtendedLoanAttributes(attrs)!;
    const back = parseExtendedLoanAttributes(json)!;
    expect(back.schemaVersion).toBe(1);
    expect(back.product).toBe('C&I Term Loan');
    expect(back.currentNoteRate).toBe(6.5);
    expect(back.firstResetPaymentNumber).toBe(61);
    expect(back.payment61Reset).toBe(true);
    expect(back.branch).toBeUndefined();
  });

  it('serialize returns null when there is nothing to persist', () => {
    expect(serializeExtendedLoanAttributes(buildExtendedLoanAttributes({}))).toBeNull();
  });

  it('parse is null-safe for absent / malformed / unversioned data', () => {
    expect(parseExtendedLoanAttributes(undefined)).toBeNull();
    expect(parseExtendedLoanAttributes('')).toBeNull();
    expect(parseExtendedLoanAttributes('not-json')).toBeNull();
    expect(parseExtendedLoanAttributes('{"product":"x"}')).toBeNull(); // no schemaVersion
  });
});

function stubDeps(createRoot: ExistingLoanDeps['createRoot']): ExistingLoanDeps {
  return {
    loanNumberExists: vi.fn(async () => false),
    createRoot,
    readRoot: vi.fn(async () => ({ success: true, data: { cr664_loannumber: 'L-1' } })),
    createChild: vi.fn(async () => ({ success: true, id: 'c' })),
    emitAudit: vi.fn(async () => ({ success: true, id: 'au' })),
  };
}

const baseInput: ExistingLoanInput = {
  loanNumber: 'L-1',
  borrowerLegalName: 'Acme',
  authorized: true,
  actorEmail: 'op@bank.test',
  actorSystemUserId: 'sys-1',
  product: 'C&I Term Loan',
  loanOfficer: 'Jane Banker',
  currentNoteRate: 6.5,
  payment61Reset: true,
};

describe('boardExistingLoan extended-attributes persistence (fail-closed; default off)', () => {
  it('flag ON: writes the extended-attributes blob into the root payload', async () => {
    const createRoot = vi.fn<(payload: Record<string, unknown>) => Promise<{ success: boolean; id: string }>>(async () => ({ success: true, id: 'id-1' }));
    const outcome = await boardExistingLoan(baseInput, stubDeps(createRoot), { persistExtended: true });
    expect(outcome.kind).toBe('success');
    const payload = createRoot.mock.calls[0][0] as Record<string, unknown>;
    const blob = payload[EXTENDED_LOAN_ATTRIBUTES_COLUMN];
    expect(typeof blob).toBe('string');
    const back = parseExtendedLoanAttributes(blob as string);
    expect(back?.product).toBe('C&I Term Loan');
    expect(back?.currentNoteRate).toBe(6.5);
    expect(back?.payment61Reset).toBe(true);
  });

  it('flag OFF (default — column not provisioned): boards WITHOUT the blob, no crash, no silent failure', async () => {
    const createRoot = vi.fn<(payload: Record<string, unknown>) => Promise<{ success: boolean; id: string }>>(async () => ({ success: true, id: 'id-1' }));
    const outcome = await boardExistingLoan(baseInput, stubDeps(createRoot)); // default persistExtended=false
    expect(outcome.kind).toBe('success');
    const payload = createRoot.mock.calls[0][0] as Record<string, unknown>;
    expect(payload[EXTENDED_LOAN_ATTRIBUTES_COLUMN]).toBeUndefined();
  });
});

describe('mapBoardedLoanRow reads back the persisted blob', () => {
  it('parses the extended attributes column', () => {
    const blob = serializeExtendedLoanAttributes(buildExtendedLoanAttributes({ currentNoteRate: 6.5, nextRateChangeDate: '2027-03-15', payment61Reset: true }))!;
    const row = mapBoardedLoanRow({ cr664_portfolioboardedloanid: 'x', cr664_loannumber: 'L-1', cr664_extendedloanattributes: blob });
    expect(row.extended?.currentNoteRate).toBe(6.5);
    expect(row.extended?.nextRateChangeDate).toBe('2027-03-15');
    expect(row.extended?.payment61Reset).toBe(true);
  });

  it('extended is null when the column is absent (not provisioned)', () => {
    const row = mapBoardedLoanRow({ cr664_portfolioboardedloanid: 'x', cr664_loannumber: 'L-1' });
    expect(row.extended).toBeNull();
  });
});

describe('rate alerts re-derive from the persisted blob across a reload', () => {
  it('a persisted note rate that differs from the fully-indexed rate yields a rate-mismatch alert', () => {
    // Persisted blob carries the note rate; on reload the reader + control-center mapping
    // re-derive the alert (not only at entry).
    const blob = serializeExtendedLoanAttributes(buildExtendedLoanAttributes({ currentNoteRate: 6.0 }))!;
    const row = mapBoardedLoanRow({
      cr664_portfolioboardedloanid: 'x', cr664_loannumber: 'V-1',
      cr664_interestratetype: 'Variable', cr664_index: 'Prime', cr664_spread: 1.5,
      cr664_extendedloanattributes: blob,
    });
    const input = {
      loanNumber: 'V-1', borrower: undefined, interestRateType: row.interestRateType,
      index: row.index, spread: row.spread, currentNoteRate: row.extended?.currentNoteRate,
      floor: row.floor, ceiling: row.ceiling, nextRateChangeDate: row.extended?.nextRateChangeDate,
    };
    const book = buildRateIndexBook([{ indexType: 'Prime', value: 5.5, effectiveDate: '2026-06-20', source: 'WSJ' }]);
    const rows = deriveVariableRateRows([input], book, new Date('2026-06-26T00:00:00Z')); // FI = 5.5+1.5 = 7.0
    const alerts = deriveRateAlerts(rows);
    expect(rows[0].currentNoteRate).toBe(6.0);
    expect(rows[0].fullyIndexedRate).toBe(7.0);
    expect(alerts.some((a) => a.type === 'rate-mismatch')).toBe(true);
  });
});

describe('CSV import populates the extended fields', () => {
  it('maps informational columns into the extended input', () => {
    const csv =
      'Loan Number,Borrower Legal Name,Current Note Rate,Payment 61 Reset,First Reset Date,Assigned Loan Officer,Loan Product\n' +
      'L-1,Acme,6.5,Yes,2027-03-15,Jane Banker,C&I Term Loan';
    const parsed = parseAndValidateCsv(csv);
    expect(parsed.valid).toHaveLength(1);
    const input = parsed.valid[0].input as ExistingLoanInput;
    expect(input.currentNoteRate).toBe(6.5);
    expect(input.payment61Reset).toBe(true);
    expect(input.firstResetDate).toBe('2027-03-15');
    expect(input.loanOfficer).toBe('Jane Banker');
    expect(input.product).toBe('C&I Term Loan');
  });
});
