import { describe, expect, it, vi } from 'vitest';
import { mapDealDocumentToRequirements, type DealDocumentMappingPort } from './dealDocumentMappingAction';
import type { DealSharePointFileReference } from './dealDocumentStorageTypes';

const file: DealSharePointFileReference = { documentId: 'doc1', dealId: 'd1', requirementIds: ['r1'], storageProvider: 'SHAREPOINT', siteUrl: 'https://sp', libraryName: 'Shared Documents', folderPath: '/f', fileUrl: 'https://sp/f/doc', itemId: 'i1', originalFileName: 'doc.pdf', storedFileName: 'doc.pdf', mimeType: 'application/pdf', fileSizeBytes: 1, uploadStatus: 'SHAREPOINT_STORED', uploadedOn: '2026-01-01', uploadedBy: 'u1', verifiedOn: '2026-01-01', activeVersion: true };
function port(ownerDeal = 'd1'): DealDocumentMappingPort {
  return {
    loadActiveFile: vi.fn(async () => file),
    loadRequirementOwners: vi.fn(async (ids: readonly string[]) => ids.map((requirementId: string) => ({ requirementId, dealId: ownerDeal }))),
    persistMappings: vi.fn(async () => 'created' as const),
    emitAudit: vi.fn(),
  };
}
const input = { authorized: true, dealId: 'd1', documentId: 'doc1', requirementIds: ['r2', 'r1', 'r1'], actorId: 'u1', correlationId: 'c1' };
describe('explicit multi-requirement mapping', () => {
  it('deduplicates, persists, and audits explicit same-deal mappings', async () => {
    const p = port();
    expect(await mapDealDocumentToRequirements(input, p)).toEqual({ kind: 'mapped', result: 'created', requirementIds: ['r1', 'r2'] });
    expect(p.emitAudit).toHaveBeenCalledOnce();
  });
  it('rejects cross-deal requirements and files', async () => {
    expect(await mapDealDocumentToRequirements(input, port('d2'))).toMatchObject({ kind: 'blocked' });
    const p = port(); p.loadActiveFile = vi.fn(async () => ({ ...file, dealId: 'd2' }));
    expect(await mapDealDocumentToRequirements(input, p)).toMatchObject({ kind: 'blocked' });
  });
});
