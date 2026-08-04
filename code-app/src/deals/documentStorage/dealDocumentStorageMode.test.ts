import { describe, expect, it } from 'vitest';
import { resolveDealDocumentStorageMode } from './dealDocumentStorageMode';

describe('deal document storage mode', () => {
  it('enables LIVE only for the exact explicit value', () => {
    expect(resolveDealDocumentStorageMode('LIVE')).toBe('LIVE');
    expect(resolveDealDocumentStorageMode('live')).toBe('DRY_RUN');
    expect(resolveDealDocumentStorageMode(undefined)).toBe('DRY_RUN');
  });
});
