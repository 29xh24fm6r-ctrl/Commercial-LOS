/**
 * Phase 140N — Portfolio Loan Boarding document/evidence persistence hook.
 * Phase 264 (P0) — SharePoint document upload.
 *
 * Document METADATA + evidence persistence over an injected document adapter,
 * PLUS (Phase 264) real binary upload over an injected SharePoint document
 * port (`portfolioSharePointDocumentAdapters.ts`). The safe path now exists:
 * DRY_RUN validates and records the attempt honestly with NO fake file link;
 * LIVE calls the real SharePoint connector once an operator wires one.
 * `uploadConfigured` reflects whether that safe path is enabled — it is no
 * longer hardcoded false.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - No IO of its own; all writes go through the injected adapters.
 *   - Document metadata gated by the document-metadata feature flag AND the
 *     adapter's own `enabled`. Upload gated by its OWN feature flag,
 *     independently of metadata persistence.
 *   - No fake file links, ever — DRY_RUN leaves fileReference undefined.
 *   - Unsupported operations fail honestly (`not_supported`), never pretend.
 */

import { useCallback, useState } from 'react';
import type {
  PortfolioLoanDocumentRecord,
  EvidenceLinkRecord,
  ExaminerNoteRecord,
} from '../shared/portfolioBoarding/portfolioLoanBoardingTypes';
import {
  dryRunSharePointDocumentAdapter,
} from './portfolioSharePointDocumentAdapters';
import type {
  PortfolioSharePointDocumentPort,
  SharePointDocumentUploadInput,
} from './portfolioSharePointDocumentPort';

export interface DocumentPersistenceResult {
  ok: boolean;
  operation: string;
  recordId?: string;
  errorCode?: string;
  message?: string;
}

export interface PortfolioBoardingDocumentAdapter {
  readonly enabled: boolean;
  /** Whether a safe binary-upload path is wired. Default: false. */
  readonly uploadConfigured: boolean;
  attachDocumentRecord(
    loanId: string,
    doc: PortfolioLoanDocumentRecord,
  ): Promise<DocumentPersistenceResult>;
  updateDocumentRecord(
    documentId: string,
    doc: PortfolioLoanDocumentRecord,
  ): Promise<DocumentPersistenceResult>;
  addEvidenceLink(
    loanId: string,
    evidence: EvidenceLinkRecord,
  ): Promise<DocumentPersistenceResult>;
  addExaminerNote(
    loanId: string,
    note: ExaminerNoteRecord,
  ): Promise<DocumentPersistenceResult>;
}

function notSupported(operation: string): Promise<DocumentPersistenceResult> {
  return Promise.resolve({
    ok: false,
    operation,
    errorCode: 'not_supported',
    message: 'Document/evidence persistence is not enabled.',
  });
}

/** The default document adapter: every operation fails closed. */
export function createDisabledPortfolioBoardingDocumentAdapter(): PortfolioBoardingDocumentAdapter {
  return {
    enabled: false,
    uploadConfigured: false,
    attachDocumentRecord: () => notSupported('attachDocumentRecord'),
    updateDocumentRecord: () => notSupported('updateDocumentRecord'),
    addEvidenceLink: () => notSupported('addEvidenceLink'),
    addExaminerNote: () => notSupported('addExaminerNote'),
  };
}

export type DocumentRequestState =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'success'; result: DocumentPersistenceResult }
  | { kind: 'failure'; errorCode: string | undefined; message: string | undefined };

/** Phase 264 (P0) — outcome of uploadDocument: a persistence result plus the storage location (if any). */
export interface DocumentUploadResult extends DocumentPersistenceResult {
  readonly fileReference?: string;
  readonly mode?: 'DRY_RUN' | 'LIVE';
}

export interface UsePortfolioLoanDocumentPersistence {
  enabled: boolean;
  /**
   * Whether the SharePoint upload FEATURE is enabled (its own flag is on). This is NOT the same as
   * a real connector being wired — see `connectorAvailable`. Phase 264: no longer hardcoded false.
   */
  uploadConfigured: boolean;
  /** DRY_RUN (validated, no real link) or LIVE (LIVE mode selected). */
  uploadMode: 'DRY_RUN' | 'LIVE';
  /**
   * Whether the injected SharePoint adapter can actually store a file (a connector is wired). Always
   * false for DRY_RUN (expected) and for the not-yet-registered LIVE adapter. The UI uses this to
   * distinguish "LIVE but no connector registered" (a fail-closed explanation) from a real live path.
   */
  connectorAvailable: boolean;
  state: DocumentRequestState;
  addDocument(loanId: string, doc: PortfolioLoanDocumentRecord): Promise<DocumentPersistenceResult>;
  updateDocument(
    documentId: string,
    doc: PortfolioLoanDocumentRecord,
  ): Promise<DocumentPersistenceResult>;
  addEvidence(loanId: string, evidence: EvidenceLinkRecord): Promise<DocumentPersistenceResult>;
  addExaminerNote(loanId: string, note: ExaminerNoteRecord): Promise<DocumentPersistenceResult>;
  /**
   * Phase 264 (P0) — uploads a document's bytes via the injected SharePoint
   * port, then (if document-metadata persistence is enabled) persists its
   * metadata row with the resulting fileReference. Fails closed with
   * `not_configured` when sharePointUploadEnabled is off; never invents a
   * fileReference.
   */
  uploadDocument(
    loanId: string,
    upload: SharePointDocumentUploadInput,
    doc: PortfolioLoanDocumentRecord,
  ): Promise<DocumentUploadResult>;
  reset(): void;
}

export interface DocumentPersistenceOptions {
  /** The document-metadata feature flag. Default off. */
  documentMetadataEnabled?: boolean;
  /** The SharePoint document-upload feature flag. Default off. Independent of documentMetadataEnabled. */
  sharePointUploadEnabled?: boolean;
}

const DISABLED: DocumentPersistenceResult = {
  ok: false,
  operation: 'disabled',
  errorCode: 'not_configured',
  message: 'Document metadata persistence is not enabled.',
};

export function usePortfolioLoanDocumentPersistence(
  adapter: PortfolioBoardingDocumentAdapter,
  options: DocumentPersistenceOptions = {},
  sharePointAdapter: PortfolioSharePointDocumentPort = dryRunSharePointDocumentAdapter,
): UsePortfolioLoanDocumentPersistence {
  const flagOn = options.documentMetadataEnabled === true;
  const enabled = flagOn && adapter.enabled;
  const uploadConfigured = options.sharePointUploadEnabled === true;
  const connectorAvailable = sharePointAdapter.configured === true;
  const [state, setState] = useState<DocumentRequestState>({ kind: 'idle' });

  const run = useCallback(
    async (
      op: () => Promise<DocumentPersistenceResult>,
    ): Promise<DocumentPersistenceResult> => {
      if (!enabled) {
        setState({ kind: 'failure', errorCode: DISABLED.errorCode, message: DISABLED.message });
        return DISABLED;
      }
      setState({ kind: 'pending' });
      const result = await op();
      if (result.ok) setState({ kind: 'success', result });
      else setState({ kind: 'failure', errorCode: result.errorCode, message: result.message });
      return result;
    },
    [enabled],
  );

  const addDocument = useCallback(
    (loanId: string, doc: PortfolioLoanDocumentRecord) =>
      run(() => adapter.attachDocumentRecord(loanId, doc)),
    [adapter, run],
  );
  const updateDocument = useCallback(
    (documentId: string, doc: PortfolioLoanDocumentRecord) =>
      run(() => adapter.updateDocumentRecord(documentId, doc)),
    [adapter, run],
  );
  const addEvidence = useCallback(
    (loanId: string, evidence: EvidenceLinkRecord) =>
      run(() => adapter.addEvidenceLink(loanId, evidence)),
    [adapter, run],
  );
  const addExaminerNote = useCallback(
    (loanId: string, note: ExaminerNoteRecord) =>
      run(() => adapter.addExaminerNote(loanId, note)),
    [adapter, run],
  );
  const uploadDocument = useCallback(
    async (
      loanId: string,
      upload: SharePointDocumentUploadInput,
      doc: PortfolioLoanDocumentRecord,
    ): Promise<DocumentUploadResult> => {
      if (!uploadConfigured) {
        const failure: DocumentUploadResult = {
          ok: false,
          operation: 'uploadDocument',
          errorCode: 'not_configured',
          message: 'SharePoint document upload is not enabled.',
          mode: sharePointAdapter.mode,
        };
        setState({ kind: 'failure', errorCode: failure.errorCode, message: failure.message });
        return failure;
      }

      setState({ kind: 'pending' });
      const uploadResult = await sharePointAdapter.upload(upload);

      if (uploadResult.kind !== 'uploaded') {
        const failure: DocumentUploadResult = {
          ok: false,
          operation: 'uploadDocument',
          errorCode: uploadResult.kind,
          message: uploadResult.reason,
          mode: sharePointAdapter.mode,
        };
        setState({ kind: 'failure', errorCode: failure.errorCode, message: failure.message });
        return failure;
      }

      // Persist the metadata row's fileReference ONLY for a LIVE upload — a file was genuinely
      // stored and a real URL exists — AND only when metadata persistence is separately enabled.
      // DRY_RUN never writes a "stored" metadata row and never a fileReference: no phantom record,
      // no fake link, the document is never marked physically stored.
      if (enabled && uploadResult.mode === 'LIVE') {
        const metaResult = await adapter.attachDocumentRecord(loanId, {
          ...doc,
          fileReference: uploadResult.webUrl,
        });
        const combined: DocumentUploadResult = {
          ...metaResult,
          fileReference: uploadResult.webUrl,
          mode: uploadResult.mode,
        };
        if (combined.ok) setState({ kind: 'success', result: combined });
        else setState({ kind: 'failure', errorCode: combined.errorCode, message: combined.message });
        return combined;
      }

      const result: DocumentUploadResult = {
        ok: true,
        operation: 'uploadDocument',
        fileReference: uploadResult.webUrl,
        mode: uploadResult.mode,
      };
      setState({ kind: 'success', result });
      return result;
    },
    [adapter, enabled, sharePointAdapter, uploadConfigured],
  );

  const reset = useCallback(() => setState({ kind: 'idle' }), []);

  return {
    enabled,
    uploadConfigured,
    uploadMode: sharePointAdapter.mode,
    connectorAvailable,
    state,
    addDocument,
    updateDocument,
    addEvidence,
    addExaminerNote,
    uploadDocument,
    reset,
  };
}
