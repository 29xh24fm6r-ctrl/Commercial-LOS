import type { DealSharePointDocumentPort, DealSharePointFolderRequest } from './dealSharePointDocumentPort';
import type { DealDocumentStorageMode, DealSharePointFolderIdentity } from './dealDocumentStorageTypes';
import type { DealDocumentStoragePersistence } from './dealDocumentStoragePersistence';
import type { DealSharePointDryRunEvidence, DealSharePointDryRunPort } from './dealSharePointDryRunPort';

export type EnsureDealFolderOutcome =
  | { readonly kind: 'ready'; readonly folder: DealSharePointFolderIdentity; readonly created: boolean }
  | { readonly kind: 'dry_run'; readonly reason: string; readonly evidence: DealSharePointDryRunEvidence }
  | { readonly kind: 'blocked'; readonly reason: string };
export async function ensureDealSharePointFolder(
  input: { readonly mode: DealDocumentStorageMode; readonly authorized: boolean; readonly request: DealSharePointFolderRequest },
  deps: { readonly connector: DealSharePointDocumentPort; readonly persistence: DealDocumentStoragePersistence; readonly dryRun?: DealSharePointDryRunPort },
): Promise<EnsureDealFolderOutcome> {
  if (!input.authorized || !input.request.actorSystemUserId) return { kind: 'blocked', reason: 'Authenticated deal access is required.' };
  const persisted = await deps.persistence.loadFolder(input.request.dealId);
  if (persisted?.borrowerIdentity !== undefined && persisted.borrowerIdentity !== input.request.borrowerIdentity) return { kind: 'blocked', reason: 'Persisted folder borrower identity does not match the deal.' };
  if (input.mode === 'LIVE' && persisted) {
    return (await deps.connector.verifyFolder(persisted)) ? { kind: 'ready', folder: { ...persisted, lastVerifiedOn: new Date().toISOString() }, created: false } : { kind: 'blocked', reason: 'The persisted SharePoint folder reference could not be verified.' };
  }
  const owner = await deps.persistence.findFolderOwner(input.request.companyFolderPath);
  if (owner && (owner.dealId !== input.request.dealId || owner.borrowerIdentity !== input.request.borrowerIdentity)) return { kind: 'blocked', reason: 'The requested company folder is already bound to another deal or borrower.' };
  if (input.mode === 'DRY_RUN') {
    if (!deps.dryRun) return { kind: 'blocked', reason: 'The governed DRY_RUN transport is not configured.' };
    const result = await deps.dryRun.validateFolder(input.request);
    return result.ok
      ? { kind: 'dry_run', reason: 'Validation completed; no SharePoint folder or Dataverse folder identity was created.', evidence: result.evidence }
      : { kind: 'blocked', reason: result.reason };
  }
  const result = await deps.connector.ensureFolder(input.request);
  if (!result.ok) return { kind: 'blocked', reason: result.reason };
  if (result.folder.dealId !== input.request.dealId || result.folder.borrowerIdentity !== input.request.borrowerIdentity) return { kind: 'blocked', reason: 'SharePoint returned a cross-deal folder identity.' };
  await deps.persistence.persistFolder(result.folder, input.request.correlationId);
  const readback = await deps.persistence.loadFolder(input.request.dealId);
  if (!readback || readback.companyFolderPath !== result.folder.companyFolderPath) return { kind: 'blocked', reason: 'Folder identity persistence readback failed.' };
  return { kind: 'ready', folder: readback, created: result.created };
}
