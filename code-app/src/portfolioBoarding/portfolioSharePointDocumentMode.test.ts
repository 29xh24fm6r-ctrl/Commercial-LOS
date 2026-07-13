import { describe, it, expect } from 'vitest';
import {
  SHAREPOINT_DOCUMENT_MODE,
  resolveSharePointDocumentMode,
} from './portfolioSharePointDocumentMode';

/**
 * Phase 264 (P0) — portfolioSharePointDocumentMode.
 *
 * The exported constant is read ONCE at module load from
 * import.meta.env.VITE_SHAREPOINT_MODE (Vitest does not set it → DRY_RUN). The
 * pure `resolveSharePointDocumentMode` is the STRICT, fail-closed resolver:
 * only the EXACT literal "LIVE" selects LIVE — lowercase / mixed-case / unset /
 * blank / unrelated all resolve to DRY_RUN so a typo can never enable a live call.
 */

describe('Phase 264 (P0) — portfolioSharePointDocumentMode constant', () => {
  it('defaults to DRY_RUN when VITE_SHAREPOINT_MODE is unset (the vitest default)', () => {
    expect(SHAREPOINT_DOCUMENT_MODE).toBe('DRY_RUN');
  });

  it('is one of the two enum members', () => {
    expect(['DRY_RUN', 'LIVE']).toContain(SHAREPOINT_DOCUMENT_MODE);
  });
});

describe('Phase 264 (P0) — resolveSharePointDocumentMode (strict, fail-closed)', () => {
  it('undefined (unset) resolves to DRY_RUN', () => {
    expect(resolveSharePointDocumentMode(undefined)).toBe('DRY_RUN');
    expect(resolveSharePointDocumentMode(null)).toBe('DRY_RUN');
  });

  it('blank / whitespace-only resolves to DRY_RUN', () => {
    expect(resolveSharePointDocumentMode('')).toBe('DRY_RUN');
    expect(resolveSharePointDocumentMode('   ')).toBe('DRY_RUN');
  });

  it('the literal "DRY_RUN" resolves to DRY_RUN', () => {
    expect(resolveSharePointDocumentMode('DRY_RUN')).toBe('DRY_RUN');
  });

  it('ONLY the exact literal "LIVE" selects LIVE (surrounding whitespace trimmed)', () => {
    expect(resolveSharePointDocumentMode('LIVE')).toBe('LIVE');
    expect(resolveSharePointDocumentMode('  LIVE  ')).toBe('LIVE');
  });

  it('lowercase and mixed-case variants do NOT select LIVE', () => {
    for (const v of ['live', 'Live', 'lIVE', 'LiVe', 'LIVE_']) {
      expect(resolveSharePointDocumentMode(v)).toBe('DRY_RUN');
    }
  });

  it('unrelated / malformed values fail closed to DRY_RUN', () => {
    for (const v of ['TRUE', '1', 'yes', 'PROD', 'LIVE LIVE', 'REAL']) {
      expect(resolveSharePointDocumentMode(v)).toBe('DRY_RUN');
    }
  });
});
