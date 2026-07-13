import { describe, it, expect } from 'vitest';
import { SHAREPOINT_DOCUMENT_MODE } from './portfolioSharePointDocumentMode';

/**
 * Phase 264 (P0) — portfolioSharePointDocumentMode constant pin.
 *
 * The mode is read ONCE at module load from
 * import.meta.env.VITE_SHAREPOINT_MODE. Vitest does not set the variable, so
 * the test environment defaults to DRY_RUN — exactly the conservative
 * default the production code falls back to when the variable is missing or
 * misspelled.
 */

describe('Phase 264 (P0) — portfolioSharePointDocumentMode', () => {
  it('defaults to DRY_RUN when VITE_SHAREPOINT_MODE is unset (the vitest default)', () => {
    expect(SHAREPOINT_DOCUMENT_MODE).toBe('DRY_RUN');
  });

  it('is one of the two enum members', () => {
    expect(['DRY_RUN', 'LIVE']).toContain(SHAREPOINT_DOCUMENT_MODE);
  });
});
