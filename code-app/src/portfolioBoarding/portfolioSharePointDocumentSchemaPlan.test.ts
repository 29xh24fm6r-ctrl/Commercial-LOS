import { describe, it, expect } from 'vitest';
import {
  deriveLoanFolderPath,
  sanitizeSharePointPathSegment,
  DEFAULT_LIBRARY_ROOT_PATH,
  SHAREPOINT_SCHEMA_PLAN_VERSION,
} from './portfolioSharePointDocumentSchemaPlan';

describe('Phase 264 (P0) — sanitizeSharePointPathSegment', () => {
  it('replaces every SharePoint-forbidden character with a hyphen', () => {
    expect(sanitizeSharePointPathSegment('A/B\\C:D*E?F"G<H>I|J')).toBe('A-B-C-D-E-F-G-H-I-J');
  });

  it('collapses internal whitespace and trims', () => {
    expect(sanitizeSharePointPathSegment('  Acme    LLC  ')).toBe('Acme LLC');
  });

  it('never returns an empty string for blank input', () => {
    expect(sanitizeSharePointPathSegment('   ')).toBe('Unnamed');
    expect(sanitizeSharePointPathSegment('')).toBe('Unnamed');
  });

  it('replaces forbidden characters even when every character is forbidden (non-empty, if unattractive)', () => {
    expect(sanitizeSharePointPathSegment('///')).toBe('---');
  });

  it('truncates an implausibly long segment rather than failing', () => {
    const long = 'x'.repeat(500);
    expect(sanitizeSharePointPathSegment(long).length).toBeLessThanOrEqual(128);
  });

  it('strips control characters (built by char code, never a literal in source)', () => {
    const withControls = `Ac${String.fromCharCode(0)}me${String.fromCharCode(9)}${String.fromCharCode(31)}LLC${String.fromCharCode(127)}`;
    expect(sanitizeSharePointPathSegment(withControls)).toBe('AcmeLLC');
  });

  it('neutralizes `.` / `..` path-traversal (no navigable separator ever survives)', () => {
    expect(sanitizeSharePointPathSegment('.')).toBe('Unnamed');
    expect(sanitizeSharePointPathSegment('..')).toBe('Unnamed');
    // A slash-bearing traversal value collapses into a single safe segment — no `/` or `\` survive,
    // and the result is never a bare `.`/`..`.
    const out = sanitizeSharePointPathSegment('../../etc');
    expect(out).not.toMatch(/[/\\]/);
    expect(out).not.toBe('.');
    expect(out).not.toBe('..');
  });

  it('strips leading/trailing dots but preserves internal dots', () => {
    expect(sanitizeSharePointPathSegment('report.')).toBe('report');
    expect(sanitizeSharePointPathSegment('LN.1001')).toBe('LN.1001');
  });

  it('is deterministic — same input always yields the same output', () => {
    const input = 'Acme / Beta : Co ..';
    expect(sanitizeSharePointPathSegment(input)).toBe(sanitizeSharePointPathSegment(input));
  });
});

describe('Phase 264 (P0) — deriveLoanFolderPath', () => {
  it('builds one folder per loan under the default library root', () => {
    expect(deriveLoanFolderPath('LN-1001', 'Acme LLC')).toBe(`${DEFAULT_LIBRARY_ROOT_PATH}/LN-1001 - Acme LLC`);
  });

  it('falls back to just the loan number when no borrower name is available (never fabricates one)', () => {
    expect(deriveLoanFolderPath('LN-1001', undefined)).toBe(`${DEFAULT_LIBRARY_ROOT_PATH}/LN-1001`);
    expect(deriveLoanFolderPath('LN-1001', '')).toBe(`${DEFAULT_LIBRARY_ROOT_PATH}/LN-1001`);
  });

  it('respects a bank-supplied library root override, trimming stray slashes', () => {
    expect(deriveLoanFolderPath('LN-1001', 'Acme', '/Bank Documents/')).toBe('Bank Documents/LN-1001 - Acme');
  });

  it('sanitizes both the loan number and borrower name segments', () => {
    expect(deriveLoanFolderPath('LN/1001', 'Acme: The Co')).toBe(`${DEFAULT_LIBRARY_ROOT_PATH}/LN-1001 - Acme- The Co`);
  });

  it('falls back to the loan number alone when the borrower name sanitizes to nothing usable', () => {
    // A `.`/`..` or all-forbidden borrower value has no usable name → loan-number-only, never
    // "{loan} - Unnamed" and never a fabricated borrower.
    expect(deriveLoanFolderPath('LN-1001', '..')).toBe(`${DEFAULT_LIBRARY_ROOT_PATH}/LN-1001`);
    expect(deriveLoanFolderPath('LN-1001', '   ')).toBe(`${DEFAULT_LIBRARY_ROOT_PATH}/LN-1001`);
  });

  it('neutralizes path-traversal values in the loan number segment', () => {
    expect(deriveLoanFolderPath('..', 'Acme')).toBe(`${DEFAULT_LIBRARY_ROOT_PATH}/Unnamed - Acme`);
  });

  it('prevents a slash/backslash in either segment from creating a nested path', () => {
    expect(deriveLoanFolderPath('LN\\1001', 'Acme/Beta')).toBe(`${DEFAULT_LIBRARY_ROOT_PATH}/LN-1001 - Acme-Beta`);
  });

  it('is deterministic — same inputs always yield the same folder path', () => {
    const a = deriveLoanFolderPath('LN-1001', 'Acme LLC');
    const b = deriveLoanFolderPath('LN-1001', 'Acme LLC');
    expect(a).toBe(b);
  });

  it('declares a schema-plan version', () => {
    expect(SHAREPOINT_SCHEMA_PLAN_VERSION).toMatch(/^264\./);
  });
});
