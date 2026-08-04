import { describe, expect, it, vi } from 'vitest';
import { listDealSharePointFiles } from './dealSharePointReadAction';
import type { DealSharePointFileReference, DealSharePointFolderIdentity } from './dealDocumentStorageTypes';

const folder: DealSharePointFolderIdentity = { dealId: 'd1', borrowerIdentity: 'b1', siteUrl: 'https://sp', libraryName: 'Shared Documents', annualFolderPath: '/(a) Loans/2026 Loans', companyFolderPath: '/(a) Loans/2026 Loans/Acme', folderUrl: 'https://sp/f', status: 'READY', createdOn: '2026-01-01', createdBy: 'u1', lastVerifiedOn: '2026-01-01', namingSource: 'BORROWER_LEGAL_NAME', configurationVersion: '1' };
const file: DealSharePointFileReference = { documentId: 'doc1', dealId: 'd1', requirementIds: [], storageProvider: 'SHAREPOINT', siteUrl: 'https://sp', libraryName: 'Shared Documents', folderPath: folder.companyFolderPath, fileUrl: 'https://sp/f/doc', itemId: 'i1', originalFileName: 'doc.pdf', storedFileName: 'doc.pdf', mimeType: 'application/pdf', fileSizeBytes: 1, uploadStatus: 'SHAREPOINT_STORED', uploadedOn: '2026-01-01', uploadedBy: 'u1', verifiedOn: '2026-01-01', activeVersion: true };

describe('deal SharePoint read action', () => {
  it('returns only authorized same-deal folder contents', async () => {
    const port = { listFiles: vi.fn(async () => ({ ok: true as const, files: [file] })) };
    expect(await listDealSharePointFiles({ authorized: true, dealId: 'd1', folder }, port)).toEqual({ kind: 'ready', files: [file] });
  });
  it('fails closed for unavailable, unauthorized, and cross-deal results', async () => {
    const unavailable = { listFiles: vi.fn(async () => ({ ok: false as const, reason: 'Connector unavailable' })) };
    expect(await listDealSharePointFiles({ authorized: true, dealId: 'd1', folder }, unavailable)).toMatchObject({ kind: 'blocked' });
    expect(await listDealSharePointFiles({ authorized: false, dealId: 'd1', folder }, unavailable)).toMatchObject({ kind: 'blocked' });
    const cross = { listFiles: vi.fn(async () => ({ ok: true as const, files: [{ ...file, dealId: 'd2' }] })) };
    expect(await listDealSharePointFiles({ authorized: true, dealId: 'd1', folder }, cross)).toMatchObject({ kind: 'blocked' });
  });
});
