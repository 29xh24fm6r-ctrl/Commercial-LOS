import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GeneratedClosingDocumentManifest } from './closingDocumentTypes';

const { createMock, getAllMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  getAllMock: vi.fn(),
}));

vi.mock('../../generated/services/Cr664_closingdocumentmanifestsService', () => ({
  get Cr664_closingdocumentmanifestsService() {
    return { create: createMock, getAll: getAllMock };
  },
}));

import { createDataverseClosingDocumentStore, __internal } from './closingDocumentStorage';

const { mapRowToManifest, manifestToRow } = __internal;

function fullRow(overrides: Record<string, unknown> = {}) {
  return {
    cr664_manifestid: 'cdm-1',
    cr664_dealid: 'deal-1',
    cr664_templatekey: 'closing_checklist',
    cr664_templateversion: '1.0.0',
    cr664_generatedatiso: '2026-07-24T10:00:00.000Z',
    cr664_generatedbyactoremail: 'closer@bank.test',
    cr664_contenthash: 'hash-abc',
    cr664_correlationid: 'cd-corr-1',
    cr664_status: 'final',
    cr664_supersedesmanifestid: undefined,
    ...overrides,
  };
}

function fullManifest(overrides: Partial<GeneratedClosingDocumentManifest> = {}): GeneratedClosingDocumentManifest {
  return {
    manifestId: 'cdm-1',
    templateKey: 'closing_checklist',
    templateVersion: '1.0.0',
    dealId: 'deal-1',
    generatedAtIso: '2026-07-24T10:00:00.000Z',
    generatedByActorEmail: 'closer@bank.test',
    contentHash: 'hash-abc',
    correlationId: 'cd-corr-1',
    status: 'final',
    ...overrides,
  };
}

beforeEach(() => {
  createMock.mockReset();
  getAllMock.mockReset();
});

describe('closingDocumentDataverseStore — row <-> manifest mapping', () => {
  it('maps a well-formed Dataverse row to the domain manifest', () => {
    const result = mapRowToManifest(fullRow() as never);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(fullManifest());
  });

  it('carries supersedesManifestId through when present', () => {
    const result = mapRowToManifest(fullRow({ cr664_supersedesmanifestid: 'cdm-0' }) as never);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.supersedesManifestId).toBe('cdm-0');
  });

  it('fails closed on an unrecognized template key rather than fabricating one', () => {
    const result = mapRowToManifest(fullRow({ cr664_templatekey: 'not_a_real_template' }) as never);
    expect(result.ok).toBe(false);
  });

  it('fails closed on an unrecognized status rather than fabricating one', () => {
    const result = mapRowToManifest(fullRow({ cr664_status: 'archived' }) as never);
    expect(result.ok).toBe(false);
  });

  it('fails closed on a missing required field', () => {
    for (const field of ['cr664_manifestid', 'cr664_dealid', 'cr664_generatedatiso', 'cr664_correlationid']) {
      const result = mapRowToManifest(fullRow({ [field]: undefined }) as never);
      expect(result.ok).toBe(false);
    }
  });

  it('manifestToRow is the exact inverse, plus the rendered content column', () => {
    const row = manifestToRow(fullManifest(), 'the rendered document text');
    expect(row.cr664_manifestid).toBe('cdm-1');
    expect(row.cr664_dealid).toBe('deal-1');
    expect(row.cr664_renderedcontent).toBe('the rendered document text');
  });
});

describe('createDataverseClosingDocumentStore — createManifestRecord', () => {
  it('creates a real Dataverse row and returns the manifest id on success', async () => {
    createMock.mockResolvedValue({ success: true });
    const store = createDataverseClosingDocumentStore();
    const result = await store.createManifestRecord(fullManifest(), 'rendered content');
    expect(result).toEqual({ success: true, id: 'cdm-1' });
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ cr664_manifestid: 'cdm-1', cr664_renderedcontent: 'rendered content' }));
  });

  it('surfaces an honest failure (never fabricated success) when the live create fails', async () => {
    createMock.mockResolvedValue({ success: false, error: { message: 'Table does not exist' } });
    const store = createDataverseClosingDocumentStore();
    const result = await store.createManifestRecord(fullManifest(), 'content');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Table does not exist');
  });

  it('surfaces an honest failure when the create call throws', async () => {
    createMock.mockRejectedValue(new Error('network down'));
    const store = createDataverseClosingDocumentStore();
    const result = await store.createManifestRecord(fullManifest(), 'content');
    expect(result.success).toBe(false);
    expect(result.error).toBe('network down');
  });
});

describe('createDataverseClosingDocumentStore — listManifestsForDeal', () => {
  it('lists and maps every row for the deal', async () => {
    getAllMock.mockResolvedValue({ success: true, data: [fullRow(), fullRow({ cr664_manifestid: 'cdm-2' })] });
    const store = createDataverseClosingDocumentStore();
    const result = await store.listManifestsForDeal('deal-1');
    expect(result.success).toBe(true);
    expect(result.manifests?.map((m) => m.manifestId)).toEqual(['cdm-1', 'cdm-2']);
  });

  it('skips (does not fail the whole list on) a single malformed row — each manifest stands on its own', async () => {
    getAllMock.mockResolvedValue({
      success: true,
      data: [fullRow(), fullRow({ cr664_manifestid: 'bad', cr664_templatekey: 'not_real' })],
    });
    const store = createDataverseClosingDocumentStore();
    const result = await store.listManifestsForDeal('deal-1');
    expect(result.success).toBe(true);
    expect(result.manifests?.map((m) => m.manifestId)).toEqual(['cdm-1']);
  });

  it('surfaces an honest failure when the live read fails', async () => {
    getAllMock.mockResolvedValue({ success: false, error: { message: 'Table does not exist' } });
    const store = createDataverseClosingDocumentStore();
    const result = await store.listManifestsForDeal('deal-1');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Table does not exist');
  });
});

/**
 * Factory mission PR C — before getManifestContent existed, listManifestsForDeal's SELECT_FIELDS
 * (used above) never included cr664_renderedcontent, and there was no other read path at all — a
 * genuinely persisted manifest's content was structurally unreachable once the generating browser
 * tab closed. This is the dedicated single-record content read that closes that gap.
 */
describe('createDataverseClosingDocumentStore — getManifestContent', () => {
  it('reads back the persisted content for an existing manifest id', async () => {
    getAllMock.mockResolvedValue({
      success: true,
      data: [{ cr664_manifestid: 'cdm-1', cr664_renderedcontent: 'the full rendered document' }],
    });
    const store = createDataverseClosingDocumentStore();
    const result = await store.getManifestContent('cdm-1');
    expect(result).toEqual({ success: true, content: 'the full rendered document' });
    expect(getAllMock).toHaveBeenCalledWith(
      expect.objectContaining({ select: ['cr664_manifestid', 'cr664_renderedcontent'] }),
    );
  });

  it('fails closed (never fabricates content) when no row matches the manifest id', async () => {
    getAllMock.mockResolvedValue({ success: true, data: [] });
    const store = createDataverseClosingDocumentStore();
    const result = await store.getManifestContent('does-not-exist');
    expect(result.success).toBe(false);
    expect(result.content).toBeUndefined();
  });

  it('fails closed when the row has no recorded content', async () => {
    getAllMock.mockResolvedValue({ success: true, data: [{ cr664_manifestid: 'cdm-1', cr664_renderedcontent: '' }] });
    const store = createDataverseClosingDocumentStore();
    const result = await store.getManifestContent('cdm-1');
    expect(result.success).toBe(false);
  });

  it('surfaces an honest failure when the live read fails', async () => {
    getAllMock.mockResolvedValue({ success: false, error: { message: 'Table does not exist' } });
    const store = createDataverseClosingDocumentStore();
    const result = await store.getManifestContent('cdm-1');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Table does not exist');
  });
});
