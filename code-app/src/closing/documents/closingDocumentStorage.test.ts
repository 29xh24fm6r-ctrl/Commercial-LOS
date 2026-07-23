import { describe, it, expect } from 'vitest';
import { createInMemoryClosingDocumentStore } from './closingDocumentStorage';
import type { GeneratedClosingDocumentManifest } from './closingDocumentTypes';

function manifest(over: Partial<GeneratedClosingDocumentManifest> = {}): GeneratedClosingDocumentManifest {
  return {
    manifestId: 'm-1',
    templateKey: 'closing_checklist',
    templateVersion: '1.0.0',
    dealId: 'deal-1',
    generatedAtIso: '2026-07-01T00:00:00.000Z',
    generatedByActorEmail: 'banker@bank.test',
    contentHash: 'abcd1234',
    correlationId: 'corr-1',
    status: 'final',
    ...over,
  };
}

describe('createInMemoryClosingDocumentStore', () => {
  it('stores and retrieves manifests + content by manifest id', async () => {
    const store = createInMemoryClosingDocumentStore();
    const m = manifest();
    const result = await store.createManifestRecord(m, 'rendered body');
    expect(result).toEqual({ success: true, id: 'm-1' });
    expect(store.all()).toEqual([m]);
    expect(store.contentFor('m-1')).toBe('rendered body');
  });

  it('lists only manifests for the requested deal', async () => {
    const store = createInMemoryClosingDocumentStore();
    await store.createManifestRecord(manifest({ manifestId: 'a', dealId: 'deal-1' }), 'x');
    await store.createManifestRecord(manifest({ manifestId: 'b', dealId: 'deal-2' }), 'y');
    const result = await store.listManifestsForDeal('deal-1');
    expect(result.success).toBe(true);
    expect(result.manifests?.map((m) => m.manifestId)).toEqual(['a']);
  });

  it('returns undefined content for an unknown manifest id (never fabricates content)', () => {
    const store = createInMemoryClosingDocumentStore();
    expect(store.contentFor('does-not-exist')).toBeUndefined();
  });
});
