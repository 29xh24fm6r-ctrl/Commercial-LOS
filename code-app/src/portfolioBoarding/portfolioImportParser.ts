/**
 * Phase 261 (C) — portfolio bulk-import parser + validator.
 *
 * Pure, dependency-free: parses CSV text (RFC-4180-ish: quoted fields, escaped
 * quotes, embedded commas/newlines), auto-maps headers to the canonical column
 * registry, validates every row, and detects duplicate loan numbers (both
 * against the existing book and within the file). Produces ready-to-board
 * inputs for the governed `boardExistingLoan` adapter plus a readable per-row
 * error report. No record is ever created here — this is the preview/validation
 * stage only.
 */

import type { ExistingLoanInput, ExistingLoanChildInput } from './existingLoanEntryAdapter';
import {
  SCALAR_IMPORT_COLUMNS,
  CHILD_IMPORT_COLUMNS,
  type ScalarColumnKey,
} from './portfolioImportColumns';
import type { ExistingLoanChildKey } from './existingLoanEntryAdapter';

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

/** Parse CSV text into a matrix of trimmed string cells. Blank lines dropped. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  // Normalise BOM.
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      // End of line (handle \r\n by skipping the paired \n).
      if (ch === '\r' && s[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  // Flush trailing field/row.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop fully-empty rows (e.g. trailing newline).
  return rows
    .map((r) => r.map((c) => c.trim()))
    .filter((r) => r.some((c) => c.length > 0));
}

// ---------------------------------------------------------------------------
// Header mapping
// ---------------------------------------------------------------------------

export interface ColumnMapping {
  /** scalar column key -> source column index (undefined = unmapped) */
  readonly scalar: Partial<Record<ScalarColumnKey, number>>;
  /** child collection -> source column index */
  readonly child: Partial<Record<ExistingLoanChildKey, number>>;
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[_]+/g, ' ');
}

/** Auto-map a header row to canonical columns by header text + aliases. */
export function autoMapColumns(headers: readonly string[]): ColumnMapping {
  const norm = headers.map(normalizeHeader);
  const scalar: Partial<Record<ScalarColumnKey, number>> = {};
  const child: Partial<Record<ExistingLoanChildKey, number>> = {};

  const findIndex = (header: string, aliases: readonly string[]): number | undefined => {
    const candidates = new Set<string>([normalizeHeader(header), ...aliases.map(normalizeHeader)]);
    for (let i = 0; i < norm.length; i += 1) {
      if (candidates.has(norm[i])) return i;
    }
    return undefined;
  };

  for (const col of SCALAR_IMPORT_COLUMNS) {
    const idx = findIndex(col.header, col.aliases);
    if (idx !== undefined) scalar[col.key] = idx;
  }
  for (const col of CHILD_IMPORT_COLUMNS) {
    const idx = findIndex(col.header, col.aliases);
    if (idx !== undefined) child[col.child] = idx;
  }
  return { scalar, child };
}

// ---------------------------------------------------------------------------
// Validation + mapping to ExistingLoanInput (minus governance fields)
// ---------------------------------------------------------------------------

/** A parsed loan, ready to receive governance fields and be boarded. */
export type ParsedLoanInput = Omit<ExistingLoanInput, 'authorized' | 'actorEmail' | 'actorSystemUserId'>;

export interface ParsedLoanRow {
  /** 1-based source row number (excluding the header row). */
  readonly rowNumber: number;
  readonly loanNumber: string;
  readonly borrowerLegalName: string;
  readonly input: ParsedLoanInput;
}

export interface RowError {
  readonly rowNumber: number;
  readonly loanNumber: string | undefined;
  readonly messages: readonly string[];
}

export interface ParsedImport {
  readonly headers: readonly string[];
  readonly mapping: ColumnMapping;
  readonly valid: readonly ParsedLoanRow[];
  readonly errors: readonly RowError[];
  /** Loan numbers that collide with the existing book. */
  readonly duplicateExisting: readonly string[];
  /** Loan numbers duplicated within the file itself. */
  readonly duplicateInFile: readonly string[];
  readonly totalDataRows: number;
}

const NUMERIC_CLEAN = /[$,\s]/g;
const TRUE_VALUES = new Set(['true', 'yes', 'y', '1', 'on', 'watchlist']);
const FALSE_VALUES = new Set(['false', 'no', 'n', '0', 'off', '']);

function parseNumber(raw: string): { ok: true; value: number | undefined } | { ok: false } {
  const t = raw.trim();
  if (t.length === 0) return { ok: true, value: undefined };
  const cleaned = t.replace(NUMERIC_CLEAN, '');
  const negative = /^\(.*\)$/.test(t); // accounting negatives: (1,234)
  const n = Number(negative ? cleaned.replace(/[()]/g, '') : cleaned);
  if (Number.isNaN(n)) return { ok: false };
  return { ok: true, value: negative ? -n : n };
}

function parseBoolean(raw: string): { ok: true; value: boolean | undefined } | { ok: false } {
  const t = raw.trim().toLowerCase();
  if (t.length === 0) return { ok: true, value: undefined };
  if (TRUE_VALUES.has(t)) return { ok: true, value: true };
  if (FALSE_VALUES.has(t)) return { ok: true, value: false };
  return { ok: false };
}

function validYmd(y: number, m: number, d: number): boolean {
  return y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31;
}

/** Lenient date check — accepts ISO + common slash formats with real component ranges. */
function isPlausibleDate(raw: string): boolean {
  const t = raw.trim();
  if (t.length === 0) return true;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (iso) return validYmd(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const md = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(t);
  if (md) {
    const yr = Number(md[3]);
    return validYmd(yr < 100 ? 2000 + yr : yr, Number(md[1]), Number(md[2]));
  }
  return !Number.isNaN(Date.parse(t));
}

function splitChildCell(raw: string): ExistingLoanChildInput[] {
  return raw
    .split(';')
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((name) => ({ name }));
}

function cell(row: readonly string[], idx: number | undefined): string {
  if (idx === undefined) return '';
  return (row[idx] ?? '').trim();
}

/**
 * Validate + map all data rows. `existingLoanNumbers` is the set of loan numbers
 * already boarded (case-insensitive) used for duplicate detection. Rows missing
 * a required field, with a malformed number/date, or that duplicate a loan
 * number (existing book or earlier in the file) are reported as errors and
 * excluded from `valid`.
 */
export function validateRows(
  rows: readonly string[][],
  existingLoanNumbers: Iterable<string> = [],
): ParsedImport {
  if (rows.length === 0) {
    return { headers: [], mapping: { scalar: {}, child: {} }, valid: [], errors: [], duplicateExisting: [], duplicateInFile: [], totalDataRows: 0 };
  }
  const headers = rows[0];
  const mapping = autoMapColumns(headers);
  const dataRows = rows.slice(1);

  const existing = new Set<string>();
  for (const n of existingLoanNumbers) existing.add(n.trim().toLowerCase());

  const valid: ParsedLoanRow[] = [];
  const errors: RowError[] = [];
  const duplicateExisting = new Set<string>();
  const duplicateInFile = new Set<string>();
  const seenInFile = new Set<string>();

  dataRows.forEach((row, i) => {
    const rowNumber = i + 1;
    const messages: string[] = [];
    const loanNumber = cell(row, mapping.scalar.loanNumber);
    const borrower = cell(row, mapping.scalar.borrowerLegalName);

    if (loanNumber.length === 0) messages.push('Loan Number is required.');
    if (borrower.length === 0) messages.push('Borrower Legal Name is required.');

    // Skip the sample/template row silently when it is clearly the example.
    // (We still validate it like any other row; it simply errors out if blank.)

    const scalarValues: Record<string, unknown> = {};
    for (const col of SCALAR_IMPORT_COLUMNS) {
      if (col.key === 'loanNumber' || col.key === 'borrowerLegalName') continue;
      const raw = cell(row, mapping.scalar[col.key]);
      if (raw.length === 0) continue;
      if (col.type === 'number') {
        const r = parseNumber(raw);
        if (!r.ok) messages.push(`${col.header} is not a valid number ("${raw}").`);
        else scalarValues[col.key] = r.value;
      } else if (col.type === 'boolean') {
        const r = parseBoolean(raw);
        if (!r.ok) messages.push(`${col.header} must be Yes/No ("${raw}").`);
        else scalarValues[col.key] = r.value;
      } else if (col.type === 'date') {
        if (!isPlausibleDate(raw)) messages.push(`${col.header} is not a valid date ("${raw}").`);
        else scalarValues[col.key] = raw;
      } else {
        scalarValues[col.key] = raw;
      }
    }

    // Duplicate detection (only meaningful once we have a loan number).
    const key = loanNumber.toLowerCase();
    if (loanNumber.length > 0) {
      if (existing.has(key)) {
        duplicateExisting.add(loanNumber);
        messages.push(`Loan Number ${loanNumber} already exists in the portfolio.`);
      }
      if (seenInFile.has(key)) {
        duplicateInFile.add(loanNumber);
        messages.push(`Loan Number ${loanNumber} is duplicated earlier in this file.`);
      }
      seenInFile.add(key);
    }

    if (messages.length > 0) {
      errors.push({ rowNumber, loanNumber: loanNumber || undefined, messages });
      return;
    }

    const children: Record<string, ExistingLoanChildInput[]> = {};
    for (const col of CHILD_IMPORT_COLUMNS) {
      const raw = cell(row, mapping.child[col.child]);
      const items = splitChildCell(raw);
      if (items.length > 0) children[col.child] = items;
    }

    const input: ParsedLoanInput = {
      loanNumber,
      borrowerLegalName: borrower,
      ...scalarValues,
      ...children,
    } as ParsedLoanInput;

    valid.push({ rowNumber, loanNumber, borrowerLegalName: borrower, input });
  });

  return {
    headers,
    mapping,
    valid,
    errors,
    duplicateExisting: Array.from(duplicateExisting),
    duplicateInFile: Array.from(duplicateInFile),
    totalDataRows: dataRows.length,
  };
}

/** Convenience: parse + validate raw CSV text in one step. */
export function parseAndValidateCsv(text: string, existingLoanNumbers: Iterable<string> = []): ParsedImport {
  return validateRows(parseCsv(text), existingLoanNumbers);
}
