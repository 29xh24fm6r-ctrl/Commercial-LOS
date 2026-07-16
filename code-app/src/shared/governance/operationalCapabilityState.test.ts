import { describe, it, expect } from 'vitest';
import {
  availableCapability,
  temporarilyUnavailable,
  notConfigured,
  isCapabilityAvailable,
  describeUnavailability,
} from './operationalCapabilityState';

/** Mirrors bankerFacingLaunchLanguageGuard.test.ts's forbidden vocabulary — a `reason` string is
 *  the exact surface a banker reads, so it must never regress into release-program language. */
const FORBIDDEN_REASON_PATTERNS: readonly RegExp[] = [
  /\bgated\b/i,
  /\bpilot\b/i,
  /\bcertification\b/i,
  /\bcertified\b/i,
  /pending certification/i,
  /\bfeature flag\b/i,
  /DRY_RUN/,
];

describe('OperationalCapabilityState helpers', () => {
  it('availableCapability() is always available with no reason', () => {
    expect(availableCapability()).toEqual({ availability: 'available' });
    expect(isCapabilityAvailable(availableCapability())).toBe(true);
    expect(describeUnavailability(availableCapability())).toBeUndefined();
  });

  it('temporarilyUnavailable() carries a plain-language reason and optional affected action', () => {
    const state = temporarilyUnavailable('The Dataverse connection is unavailable.', 'Send borrower email');
    expect(state).toEqual({
      availability: 'temporarily_unavailable',
      reason: 'The Dataverse connection is unavailable.',
      affectedAction: 'Send borrower email',
    });
    expect(isCapabilityAvailable(state)).toBe(false);
    expect(describeUnavailability(state)).toBe('The Dataverse connection is unavailable.');
  });

  it('notConfigured() carries a plain-language reason', () => {
    const state = notConfigured('Borrower email is not configured.');
    expect(state.availability).toBe('not_configured');
    expect(describeUnavailability(state)).toBe('Borrower email is not configured.');
  });

  it('describeUnavailability falls back to a generic plain-language line when no reason is supplied', () => {
    expect(describeUnavailability({ availability: 'temporarily_unavailable' })).toBe('This is temporarily unavailable.');
    expect(describeUnavailability({ availability: 'not_configured' })).toBe('This is not configured for your workspace.');
  });

  it('none of the example reasons in this test file use release-program vocabulary', () => {
    const examples = [
      'The Dataverse connection is unavailable.',
      'Send borrower email',
      'Borrower email is not configured.',
      'This is temporarily unavailable.',
      'This is not configured for your workspace.',
    ];
    for (const text of examples) {
      for (const pattern of FORBIDDEN_REASON_PATTERNS) {
        expect(text, `"${text}" matched ${pattern}`).not.toMatch(pattern);
      }
    }
  });
});
