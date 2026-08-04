import type { DealSharePointFileReference, DealSharePointFolderIdentity } from './dealDocumentStorageTypes';
import type { DocumentExceptionRecord } from '../documentIntake/documentExceptionWorkflow';

export interface DealDocumentStoragePersistence {
  loadFolder(dealId: string): Promise<DealSharePointFolderIdentity | undefined>;
  findFolderOwner(companyFolderPath: string): Promise<{ dealId: string; borrowerIdentity: string } | undefined>;
  persistFolder(folder: DealSharePointFolderIdentity, correlationId: string): Promise<void>;
  loadActiveFile(documentId: string): Promise<DealSharePointFileReference | undefined>;
  persistFile(reference: DealSharePointFileReference, correlationId: string): Promise<void>;
  mapFileToRequirements(input: { dealId: string; documentId: string; requirementIds: readonly string[]; correlationId: string; actorId: string }): Promise<void>;
  loadExceptions(dealId: string): Promise<readonly DocumentExceptionRecord[]>;
}
