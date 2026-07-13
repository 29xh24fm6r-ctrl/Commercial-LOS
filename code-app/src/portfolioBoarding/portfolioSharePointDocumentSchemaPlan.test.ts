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

  it('declares a schema-plan version', () => {
    expect(SHAREPOINT_SCHEMA_PLAN_VERSION).toMatch(/^264\./);
  });
});
