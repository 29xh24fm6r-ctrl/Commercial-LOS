import { describe, expect, it, vi } from 'vitest';
import { uploadDealDocumentToSharePoint, type DealDocumentMetadataPort } from './dealSharePointUploadAction';
import type { DealSharePointDocumentPort } from './dealSharePointDocumentPort';
import type { DealSharePointFileReference, DealSharePointFolderIdentity } from './dealDocumentStorageTypes';

const folder: DealSharePointFolderIdentity = { dealId: 'deal-1', borrowerIdentity: 'b-1', siteUrl: 'https://bank.sharepoint.com/sites/BusinessLending', libraryName: 'Shared Documents', annualFolderPath: '/(a) Loans/2026 Loans', companyFolderPath: '/(a) Loans/2026 Loans/Acme', folderUrl: 'https://bank.sharepoint.com/folder', folderItemId: 'folder-1', status: 'READY', createdOn: '2026-01-01', createdBy: 'actor-1', lastVerifiedOn: '2026-01-01', namingSource: 'BORROWER_LEGAL_NAME', configurationVersion: '1' };
const reference: DealSharePointFileReference = { documentId: 'doc-1', dealId: 'deal-1', requirementIds: ['req-1'], storageProvider: 'SHAREPOINT', siteUrl: folder.siteUrl, libraryName: folder.libraryName, folderPath: folder.companyFolderPath, fileUrl: 'https://bank.sharepoint.com/file', itemId: 'item-1', originalFileName: 'tax.pdf', storedFileName: 'tax.pdf', mimeType: 'application/pdf', fileSizeBytes: 3, uploadStatus: 'SHAREPOINT_STORED', uploadedOn: '2026-01-01', uploadedBy: 'actor-1', verifiedOn: '2026-01-01', activeVersion: true };
function deps(overrides: Partial<DealSharePointDocumentPort> = {}, metadataOverrides: Partial<DealDocumentMetadataPort> = {}) {
  const storage: DealSharePointDocumentPort = { ensureFolder: vi.fn(), upload: vi.fn(async () => ({ ok: true as const, reference })), verifyFolder: vi.fn(async () => true), verifyFile: vi.fn(async () => true), ...overrides };
  const metadata: DealDocumentMetadataPort = { persistPending: vi.fn(), persistStored: vi.fn(), persistFailed: vi.fn(), emitAudit: vi.fn(), emitTimeline: vi.fn(), ...metadataOverrides };
  return { storage, metadata };
}
const input = { mode: 'LIVE' as const, authorized: true, actorSystemUserId: 'actor-1', dealId: 'deal-1', documentId: 'doc-1', requirementIds: ['req-1'], folder, file: { originalFileName: 'tax.pdf', mimeType: 'application/pdf', content: new Uint8Array([1, 2, 3]) }, correlationId: 'corr-1' };

describe('SharePoint requirement upload', () => {
  it('never stores or satisfies a DRY_RUN upload', async () => {
    const d = deps();
    expect(await uploadDealDocumentToSharePoint({ ...input, mode: 'DRY_RUN' }, d)).toMatchObject({ kind: 'dry_run' });
    expect(d.storage.upload).not.toHaveBeenCalled(); expect(d.metadata.persistStored).not.toHaveBeenCalled();
  });
  it('persists stored state only after real upload and verification', async () => {
    const d = deps();
    expect(await uploadDealDocumentToSharePoint(input, d)).toEqual({ kind: 'stored', reference });
    expect(d.metadata.persistPending).toHaveBeenCalledBefore(d.storage.upload as ReturnType<typeof vi.fn>);
    expect(d.metadata.persistStored).toHaveBeenCalledWith(reference, 'corr-1');
  });
  it('keeps the requirement unsatisfied on upload failure', async () => {
    const d = deps({ upload: vi.fn(async () => ({ ok: false as const, kind: 'failed' as const, reason: 'SharePoint unavailable' })) });
    expect(await uploadDealDocumentToSharePoint(input, d)).toMatchObject({ kind: 'blocked', fileMayExist: false });
    expect(d.metadata.persistFailed).toHaveBeenCalled(); expect(d.metadata.persistStored).not.toHaveBeenCalled();
  });
  it('preserves an ambiguous transport orphan signal and leaves the requirement unsatisfied', async () => {
    const d = deps({ upload: vi.fn(async () => ({ ok: false as const, kind: 'failed' as const, reason: 'Upload response lost', fileMayExist: true })) });
    expect(await uploadDealDocumentToSharePoint(input, d)).toMatchObject({ kind: 'blocked', fileMayExist: true });
    expect(d.metadata.persistFailed).toHaveBeenCalled(); expect(d.metadata.persistStored).not.toHaveBeenCalled();
  });
  it('reports possible orphan storage when metadata persistence fails', async () => {
    const d = deps({}, { persistStored: vi.fn(async () => { throw new Error('Dataverse failed'); }) });
    expect(await uploadDealDocumentToSharePoint(input, d)).toMatchObject({ kind: 'blocked', fileMayExist: true });
  });
  it('rejects cross-deal folders and references', async () => {
    const d = deps();
    expect(await uploadDealDocumentToSharePoint({ ...input, folder: { ...folder, dealId: 'other' } }, d)).toMatchObject({ kind: 'blocked' });
    const cross = deps({ upload: vi.fn(async () => ({ ok: true as const, reference: { ...reference, dealId: 'other' } })) });
    expect(await uploadDealDocumentToSharePoint(input, cross)).toMatchObject({ kind: 'blocked', fileMayExist: true });
  });
  it('stores an additional document without satisfying a requirement', async () => {
    const additionalReference = { ...reference, requirementIds: [] };
    const d = deps({ upload: vi.fn(async () => ({ ok: true as const, reference: additionalReference })) });
    expect(await uploadDealDocumentToSharePoint({ ...input, requirementIds: [], uploadKind: 'ADDITIONAL' }, d)).toEqual({ kind: 'stored', reference: additionalReference });
  });
  it('requires a verified active prior file for replacement', async () => {
    const d = deps();
    expect(await uploadDealDocumentToSharePoint({ ...input, replacesDocumentId: 'old-doc' }, d)).toMatchObject({ kind: 'blocked', fileMayExist: false });
    const old = { ...reference, documentId: 'old-doc' };
    expect(await uploadDealDocumentToSharePoint({ ...input, replacesDocumentId: 'old-doc', replacedReference: old }, d)).toMatchObject({ kind: 'stored' });
  });
});
