import { describe, it, expect } from 'vitest';
import { EMAIL_MODE } from './emailMode';

/**
 * Phase 61: emailMode constant pins.
 *
 * The mode is read ONCE at module load from
 * import.meta.env.VITE_EMAIL_MODE. Vitest does not set the variable,
 * so the test environment defaults to DRY_RUN — which is exactly the
 * conservative default the production code falls back to when the
 * variable is missing.
 *
 * The point of this file is to pin BOTH that the default is DRY_RUN
 * AND that the value is one of the two enum strings. A future
 * regression where a typo'd env var silently flips into LIVE would
 * fail here because the export type would no longer be the narrowed
 * 'DRY_RUN' | 'LIVE' union.
 */

describe('Phase 61 — emailMode', () => {
  it('defaults to DRY_RUN when VITE_EMAIL_MODE is unset (the vitest default)', () => {
    expect(EMAIL_MODE).toBe('DRY_RUN');
  });

  it('is one of the two enum members', () => {
    expect(['DRY_RUN', 'LIVE']).toContain(EMAIL_MODE);
  });
});
