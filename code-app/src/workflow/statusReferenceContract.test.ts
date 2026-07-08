import { describe, it, expect } from 'vitest';
import {
  resolveStatusReferences,
  isCanonicalStatusCode,
  CANONICAL_STATUS_CODES,
  type StatusReferenceRow,
} from './statusReferenceContract';

/**
 * Canonical STATUS reference contract. Pins: fail-closed on a missing, inactive,
 * duplicate, or non-canonical status; a complete active set resolves ready.
 */

function row(code: string, active = true, name = ''): StatusReferenceRow {
  return { cr664_code: code, cr664_name: name || code, cr664_activeflag: active };
}

const ALL: StatusReferenceRow[] = CANONICAL_STATUS_CODES.map((c) => row(c));

describe('CANONICAL_STATUS_CODES', () => {
  it('is the five disposition statuses', () => {
    expect([...CANONICAL_STATUS_CODES]).toEqual(['OPEN', 'ON_HOLD', 'DECLINED', 'WITHDRAWN', 'BOARDED']);
    expect(isCanonicalStatusCode('OPEN')).toBe(true);
    expect(isCanonicalStatusCode('NOPE')).toBe(false);
  });
});

describe('resolveStatusReferences', () => {
  it('resolves ready when all five canonical statuses are active', () => {
    const r = resolveStatusReferences(ALL);
    expect(r.status).toBe('ready');
    if (r.status === 'ready') expect(r.statuses.map((s) => s.code)).toEqual(['OPEN', 'ON_HOLD', 'DECLINED', 'WITHDRAWN', 'BOARDED']);
  });

  it('blocks when a status is missing', () => {
    const r = resolveStatusReferences(ALL.filter((x) => x.cr664_code !== 'BOARDED'));
    expect(r.status).toBe('unavailable');
    if (r.status === 'unavailable') expect(r.reasons.join(' ')).toMatch(/missing status BOARDED/);
  });

  it('blocks when a status is inactive (treated as not seeded)', () => {
    const rows = ALL.map((x) => (x.cr664_code === 'ON_HOLD' ? row('ON_HOLD', false) : x));
    const r = resolveStatusReferences(rows);
    expect(r.status).toBe('unavailable');
    if (r.status === 'unavailable') expect(r.reasons.join(' ')).toMatch(/missing status ON_HOLD/);
  });

  it('blocks on a duplicate active status', () => {
    const r = resolveStatusReferences([...ALL, row('OPEN')]);
    expect(r.status).toBe('unavailable');
    if (r.status === 'unavailable') expect(r.reasons.join(' ')).toMatch(/duplicate status OPEN/);
  });

  it('blocks on an unexpected non-canonical status', () => {
    const r = resolveStatusReferences([...ALL, row('FROZEN')]);
    expect(r.status).toBe('unavailable');
    if (r.status === 'unavailable') expect(r.reasons.join(' ')).toMatch(/non-canonical status code "FROZEN"/);
  });

  it('is unavailable for an empty table', () => {
    expect(resolveStatusReferences([]).status).toBe('unavailable');
  });
});
