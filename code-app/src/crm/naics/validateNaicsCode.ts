import type { NaicsRow } from './naicsSearch';

/**
 * NAICS code entry — pure validation helpers.
 *
 * Format normalization + a fail-closed check against the already-loaded internal
 * `cr664_naicscodes` reference rows (the single validation source of truth). Pure and
 * side-effect-free: the caller supplies the loaded rows (from `naicsSearch`'s loader),
 * so this never touches the SDK, the network, or a token. Never fabricates a title.
 */

/** Strip everything that isn't a digit and cap at six (e.g. "561422abc" → "561422"). */
export function normalizeNaicsCode(input: string): string {
  return input.replace(/\D/g, '').slice(0, 6);
}

/** True only for an exactly-six-digit string (format only; not sector-aware). */
export function isSixDigitNaicsCode(input: string): boolean {
  return /^\d{6}$/.test(input);
}

export interface NaicsValidation {
  /** The normalized six-digit code (or the normalized partial if the format is invalid). */
  readonly code: string;
  /** The official title from the internal reference table, or null when not found. */
  readonly title: string | null;
  /** Whether `code` is a well-formed six-digit code. */
  readonly validFormat: boolean;
  /** Whether the code exists in the internal `cr664_naicscodes` rows. */
  readonly found: boolean;
  /** Convenience: a valid, found code (the "confirmed" state). */
  readonly valid: boolean;
}

/**
 * Validate a user-entered code against the internal reference rows. FAIL-CLOSED: an
 * ill-formed code is `validFormat:false`; a well-formed code absent from the rows is
 * `found:false` (never coerced to a title). Rows are the app's loaded `cr664_naicscodes`.
 */
export function validateNaicsCode(input: string, rows: readonly NaicsRow[]): NaicsValidation {
  const code = normalizeNaicsCode(input);
  const validFormat = isSixDigitNaicsCode(code);
  if (!validFormat) {
    return { code, title: null, validFormat: false, found: false, valid: false };
  }
  const match = rows.find((r) => String(r.cr664_code ?? '').trim() === code);
  const title = match?.cr664_title ? String(match.cr664_title).trim() : null;
  const found = title !== null;
  return { code, title, validFormat: true, found, valid: found };
}
