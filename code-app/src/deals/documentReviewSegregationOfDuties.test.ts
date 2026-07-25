import { describe, it, expect } from 'vitest';
import {
  extractCoreUserId,
  isSameCoreUser,
  SEGREGATION_OF_DUTIES_BLOCK_REASON,
} from './documentReviewSegregationOfDuties';

describe('extractCoreUserId', () => {
  it('extracts the id out of a /cr664_users(<id>) bind', () => {
    expect(extractCoreUserId('/cr664_users(abc-123)')).toBe('abc-123');
  });

  it('lowercases the extracted id', () => {
    expect(extractCoreUserId('/cr664_users(ABC-123)')).toBe('abc-123');
  });

  it('returns undefined for an undefined bind', () => {
    expect(extractCoreUserId(undefined)).toBeUndefined();
  });

  it('returns undefined for a bind that does not match the expected shape', () => {
    expect(extractCoreUserId('/systemusers(abc-123)')).toBeUndefined();
    expect(extractCoreUserId('not a bind at all')).toBeUndefined();
    expect(extractCoreUserId('')).toBeUndefined();
  });
});

describe('isSameCoreUser', () => {
  it('is true for two identical ids', () => {
    expect(isSameCoreUser('abc-123', 'abc-123')).toBe(true);
  });

  it('is true for the same id in different casing', () => {
    expect(isSameCoreUser('ABC-123', 'abc-123')).toBe(true);
  });

  it('is false for two different ids', () => {
    expect(isSameCoreUser('abc-123', 'xyz-789')).toBe(false);
  });

  it('is false (never true) when either side is undefined', () => {
    expect(isSameCoreUser(undefined, 'abc-123')).toBe(false);
    expect(isSameCoreUser('abc-123', undefined)).toBe(false);
    expect(isSameCoreUser(undefined, undefined)).toBe(false);
  });

  it('is false for two empty strings — an unresolved identity is never "the same" as another unresolved identity', () => {
    expect(isSameCoreUser('', '')).toBe(false);
  });
});

describe('SEGREGATION_OF_DUTIES_BLOCK_REASON', () => {
  it('is a non-empty, banker-facing (no internal-identifier) message', () => {
    expect(SEGREGATION_OF_DUTIES_BLOCK_REASON.length).toBeGreaterThan(0);
    expect(SEGREGATION_OF_DUTIES_BLOCK_REASON).not.toMatch(/cr664_|guid|[0-9a-f]{8}-[0-9a-f]{4}/i);
  });
});
