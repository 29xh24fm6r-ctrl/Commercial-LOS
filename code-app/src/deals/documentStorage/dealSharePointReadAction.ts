import type { DealSharePointFileReference, DealSharePointFolderIdentity } from './dealDocumentStorageTypes';

export interface DealSharePointReadPort {
  listFiles(folder: DealSharePointFolderIdentity): Promise<
    | { readonly ok: true; readonly files: readonly DealSharePointFileReference[] }
    | { readonly ok: false; readonly reason: string }
  >;
}

export type DealSharePointReadOutcome =
  | { readonly kind: 'ready'; readonly files: readonly DealSharePointFileReference[] }
  | { readonly kind: 'blocked'; readonly reason: string };

export async function listDealSharePointFiles(input: {
  readonly authorized: boolean;
  readonly dealId: string;
  readonly folder: DealSharePointFolderIdentity | undefined;
}, port: DealSharePointReadPort): Promise<DealSharePointReadOutcome> {
  if (!input.authorized) return { kind: 'blocked', reason: 'Authenticated deal access is required.' };
  if (!input.folder || input.folder.status !== 'READY') return { kind: 'blocked', reason: 'The persisted SharePoint loan folder is not ready.' };
  if (input.folder.dealId !== input.dealId) return { kind: 'blocked', reason: 'The SharePoint folder does not belong to this deal.' };
  const result = await port.listFiles(input.folder);
  if (!result.ok) return { kind: 'blocked', reason: result.reason };
  if (result.files.some((file) => file.dealId !== input.dealId || file.folderPath !== input.folder?.companyFolderPath)) {
    return { kind: 'blocked', reason: 'SharePoint returned a cross-deal or cross-folder file reference.' };
  }
  return { kind: 'ready', files: result.files };
}
