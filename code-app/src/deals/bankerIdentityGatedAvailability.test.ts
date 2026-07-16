import { describe, it, expect } from 'vitest';
import { deriveBankerIdentityGatedAvailability } from './bankerIdentityGatedAvailability';

const NOW = '2026-07-16T12:00:00.000Z';

describe('deriveBankerIdentityGatedAvailability', () => {
  it('a resolved identity with no writeDisabledReason is available', () => {
    const a = deriveBankerIdentityGatedAvailability(
      'document-requirement-writes',
      { systemUserId: 'sys-1' },
      NOW,
    );
    expect(a).toEqual({ id: 'document-requirement-writes', available: true, blockingReasons: [], checkedAt: NOW });
  });

  it('missing systemUserId is unavailable with an audit-identity reason', () => {
    const a = deriveBankerIdentityGatedAvailability('borrower-request-sends', {}, NOW);
    expect(a.available).toBe(false);
    expect(a.blockingReasons).toEqual([
      { kind: 'audit-identity', detail: 'No Dataverse identity is available for the signed-in user.' },
    ]);
  });

  it('a present systemUserId with a writeDisabledReason still reports unavailable, using the specific reason', () => {
    const a = deriveBankerIdentityGatedAvailability(
      'document-requirement-writes',
      { systemUserId: 'sys-1', writeDisabledReason: 'No Dataverse systemuser is provisioned for the current Entra identity.' },
      NOW,
    );
    expect(a.available).toBe(false);
    expect(a.blockingReasons).toEqual([
      { kind: 'audit-identity', detail: 'No Dataverse systemuser is provisioned for the current Entra identity.' },
    ]);
  });

  it('carries the requested CapabilityId and checkedAt verbatim', () => {
    const a = deriveBankerIdentityGatedAvailability('borrower-request-sends', { systemUserId: 'sys-1' }, '2020-01-01T00:00:00.000Z');
    expect(a.id).toBe('borrower-request-sends');
    expect(a.checkedAt).toBe('2020-01-01T00:00:00.000Z');
  });
});
