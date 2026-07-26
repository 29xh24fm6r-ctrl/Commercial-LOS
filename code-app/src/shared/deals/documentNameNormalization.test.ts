import { describe, it, expect } from 'vitest';
import { normalizeDocumentName } from './documentNameNormalization';

describe('normalizeDocumentName (N-11 — the one shared implementation)', () => {
  it('trims, lowercases, and collapses separators/whitespace', () => {
    expect(normalizeDocumentName('  Personal Financial Statement  ')).toBe('personal financial statement');
    expect(normalizeDocumentName('Business-Tax_Returns')).toBe('business tax returns');
    expect(normalizeDocumentName('Debt   Schedule')).toBe('debt schedule');
  });

  it('treats hyphens, underscores, and slashes as separators, not part of the word', () => {
    expect(normalizeDocumentName('Equipment List/Invoices')).toBe('equipment list invoices');
  });

  it('is idempotent', () => {
    const once = normalizeDocumentName('Business Tax Returns');
    expect(normalizeDocumentName(once)).toBe(once);
  });

  it('the exact reported N-11 mismatch: "Business Tax Returns" and "Tax returns" normalize to DIFFERENT strings (documented, not silently unified)', () => {
    expect(normalizeDocumentName('Business Tax Returns')).not.toBe(normalizeDocumentName('Tax returns'));
  });
});
