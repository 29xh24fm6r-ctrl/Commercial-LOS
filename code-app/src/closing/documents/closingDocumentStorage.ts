import type { GeneratedClosingDocumentManifest } from './closingDocumentTypes';

/**
 * final-seven-workstreams Workstream 6 — the storage seam for generated closing-document
 * manifests + content.
 *
 * NO LIVE DATAVERSE FACTORY EXISTS for this module, and none is added by this pass — there is no
 * `cr664_closingdocument`-style table in this environment's schema. Building a live factory
 * against a table that doesn't exist would be exactly the kind of fabrication this whole
 * initiative exists to avoid. A future phase that wants to persist generated documents needs an
 * operator-authorized schema addition (mirroring the discipline in
 * `docs/final-seven-workstreams/05_DEAL_SCHEMA_EXPANSION.md`) before a `buildLiveClosingDocumentStorageDeps()`
 * can be written honestly.
 *
 * `createInMemoryClosingDocumentStore()` below is a real, working reference implementation — useful
 * for tests and for driving the UI panel in a durable-within-session way — but it is NOT
 * persistence; it is lost on page reload. Callers must not present it to a user as "saved."
 */
export interface ClosingDocumentStorageResult {
  readonly success: boolean;
  readonly id?: string;
  readonly error?: string;
}

export interface ClosingDocumentListResult {
  readonly success: boolean;
  readonly manifests?: readonly GeneratedClosingDocumentManifest[];
  readonly error?: string;
}

export interface ClosingDocumentStorageDeps {
  readonly createManifestRecord: (
    manifest: GeneratedClosingDocumentManifest,
    renderedContent: string,
  ) => Promise<ClosingDocumentStorageResult>;
  readonly listManifestsForDeal: (dealId: string) => Promise<ClosingDocumentListResult>;
}

export function createInMemoryClosingDocumentStore(): ClosingDocumentStorageDeps & {
  readonly all: () => readonly GeneratedClosingDocumentManifest[];
  readonly contentFor: (manifestId: string) => string | undefined;
} {
  const manifests: GeneratedClosingDocumentManifest[] = [];
  const content = new Map<string, string>();
  return {
    createManifestRecord: async (manifest, renderedContent) => {
      manifests.push(manifest);
      content.set(manifest.manifestId, renderedContent);
      return { success: true, id: manifest.manifestId };
    },
    listManifestsForDeal: async (dealId) => ({
      success: true,
      manifests: manifests.filter((m) => m.dealId === dealId),
    }),
    all: () => manifests,
    contentFor: (manifestId) => content.get(manifestId),
  };
}
