import type { DealDocumentStorageMode } from './dealDocumentStorageTypes';

export function resolveDealDocumentStorageMode(value: string | undefined): DealDocumentStorageMode {
  return value === 'LIVE' ? 'LIVE' : 'DRY_RUN';
}

export const DEAL_DOCUMENT_STORAGE_MODE = resolveDealDocumentStorageMode(
  import.meta.env.VITE_DEAL_DOCUMENT_STORAGE_MODE,
);
