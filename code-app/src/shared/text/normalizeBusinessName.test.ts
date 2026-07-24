import { describe, it, expect } from 'vitest';
import { normalizeBusinessName } from './normalizeBusinessName';

describe('normalizeBusinessName', () => {
  it('normalizes case, punctuation, and common legal suffixes to the same key', () => {
    expect(normalizeBusinessName('Acme LLC')).toBe(normalizeBusinessName('ACME, L.L.C.'));
    expect(normalizeBusinessName('Acme LLC')).toBe(normalizeBusinessName('acme llc'));
    expect(normalizeBusinessName('Acme Corp')).toBe(normalizeBusinessName('Acme Corporation'));
  });

  it('collapses extra whitespace', () => {
    expect(normalizeBusinessName('Acme   Foods')).toBe(normalizeBusinessName('Acme Foods'));
  });

  it('treats undefined as an empty string', () => {
    expect(normalizeBusinessName(undefined)).toBe('');
  });

  it('does not conflate distinct businesses that merely share a suffix', () => {
    expect(normalizeBusinessName('Acme LLC')).not.toBe(normalizeBusinessName('Zenith LLC'));
  });
});
