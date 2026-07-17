import { describe, it, expect } from 'vitest';
import {
  capabilityAvailable,
  capabilityUnavailable,
  toOperationalCapabilityState,
  type CapabilityBlockingReason,
} from './capabilityAvailability';

const NOW = '2026-07-16T12:00:00.000Z';

const FORBIDDEN_REASON_PATTERNS: readonly RegExp[] = [
  /\bgated\b/i,
  /\bpilot\b/i,
  /\bcertification\b/i,
  /\bcertified\b/i,
  /pending certification/i,
  /\bfeature flag\b/i,
  /DRY_RUN/,
];

describe('capabilityAvailable / capabilityUnavailable', () => {
  it('capabilityAvailable() has no blocking reasons and available=true', () => {
    const a = capabilityAvailable('new-deal-create', NOW);
    expect(a).toEqual({ id: 'new-deal-create', available: true, blockingReasons: [], checkedAt: NOW });
  });

  it('capabilityUnavailable() carries the id, available=false, and the given reasons', () => {
    const reasons: CapabilityBlockingReason[] = [{ kind: 'audit-identity', detail: 'No resolved actor identity.' }];
    const a = capabilityUnavailable('crm-writes', reasons, NOW);
    expect(a).toEqual({ id: 'crm-writes', available: false, blockingReasons: reasons, checkedAt: NOW });
  });

  it('carries checkedAt verbatim from the injected timestamp (never computed internally)', () => {
    const a = capabilityAvailable('portfolio-boarding', '2020-01-01T00:00:00.000Z');
    expect(a.checkedAt).toBe('2020-01-01T00:00:00.000Z');
  });
});

describe('toOperationalCapabilityState', () => {
  it('an available capability projects to availableCapability()', () => {
    const state = toOperationalCapabilityState(capabilityAvailable('stage-advancement', NOW));
    expect(state).toEqual({ availability: 'available' });
  });

  it('an unavailable capability projects to temporarily_unavailable with the primary reason', () => {
    const a = capabilityUnavailable(
      'borrower-request-sends',
      [
        { kind: 'connector', detail: 'Email sending is unavailable.' },
        { kind: 'audit-identity', detail: 'No resolved actor identity.' },
      ],
      NOW,
    );
    const state = toOperationalCapabilityState(a, 'Send borrower email');
    expect(state).toEqual({
      availability: 'temporarily_unavailable',
      reason: 'Email sending is unavailable.',
      affectedAction: 'Send borrower email',
    });
  });

  it('falls back to a generic honest line if capabilityUnavailable was somehow given zero reasons', () => {
    const a = capabilityUnavailable('document-requirement-writes', [], NOW);
    const state = toOperationalCapabilityState(a);
    expect(state.reason).toBe('This is temporarily unavailable.');
  });
});

describe('CapabilityBlockingReasonKind taxonomy stays closed and honest', () => {
  it('the four reason kinds are the only ones used across the derivation modules this phase wires', () => {
    const KNOWN_KINDS = ['permission', 'connection', 'audit-identity', 'connector'];
    const reasons: CapabilityBlockingReason[] = [
      { kind: 'permission', detail: 'You are not authorized to create deals.' },
      { kind: 'connection', detail: 'The boarding connector is unavailable right now.' },
      { kind: 'audit-identity', detail: 'No Dataverse identity is available for the signed-in user.' },
      { kind: 'connector', detail: 'Email sending is unavailable. Copy the approved request instead.' },
    ];
    for (const r of reasons) {
      expect(KNOWN_KINDS).toContain(r.kind);
      for (const pattern of FORBIDDEN_REASON_PATTERNS) {
        expect(r.detail, `"${r.detail}" matched ${pattern}`).not.toMatch(pattern);
      }
    }
  });
});
