import { describe, it, expect } from 'vitest';
import { maskRecipient } from './recipientMasking';

describe('Phase 61 — maskRecipient', () => {
  it('keeps the first character of the local part and replaces the rest with ***', () => {
    expect(maskRecipient('borrower@example.com')).toBe('b***@e***.com');
  });

  it('preserves the TLD verbatim', () => {
    expect(maskRecipient('jdoe@bigcorp.com')).toBe('j***@b***.com');
  });

  it('preserves multi-label TLDs (.co.uk)', () => {
    expect(maskRecipient('alice@example.co.uk')).toBe('a***@e***.co.uk');
  });

  it('returns *** for inputs without an @', () => {
    expect(maskRecipient('not-an-email')).toBe('***');
  });

  it('returns *** for inputs with more than one @', () => {
    expect(maskRecipient('two@@signs.com')).toBe('***');
  });

  it('returns *** for empty input', () => {
    expect(maskRecipient('')).toBe('***');
  });

  it('handles a domain without a dot conservatively (masks the whole domain)', () => {
    expect(maskRecipient('user@localhost')).toBe('u***@***');
  });

  it('does not leak the original length in the masked output', () => {
    // Two addresses of very different local-part lengths produce the
    // same masked form when their first char + domain match. Pinned as
    // a guarantee — if someone "improves" the masker to keep the length,
    // this test surfaces the change.
    expect(maskRecipient('a@example.com')).toBe('a***@e***.com');
    expect(maskRecipient('aaaaaaaaaaaaa@example.com')).toBe('a***@e***.com');
  });

  it('trims leading/trailing whitespace before masking', () => {
    expect(maskRecipient('  borrower@example.com  ')).toBe('b***@e***.com');
  });
});
