/**
 * Phase 140N — Portfolio Loan Boarding document/evidence persistence hook.
 *
 * Document METADATA + evidence persistence over an injected document adapter.
 * Binary/file upload is NOT implemented (no safe upload path exists yet) — the
 * hook reports `uploadConfigured: false` and never fakes a file link.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - No IO of its own; all writes go through the injected adapter.
 *   - Document metadata gated by the document-metadata feature flag AND the
 *     adapter's own `enabled`.
 *   - No binary upload occurs; no fake file links.
 *   - Unsupported operations fail honestly (`not_supported`), never pretend.
 */

import { useCallback, useState } from 'react';
import type {
  PortfolioLoanDocumentRecord,
  EvidenceLinkRecord,
  ExaminerNoteRecord,
} from '../shared/portfolioBoarding/portfolioLoanBoardingTypes';

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

export interface UsePortfolioLoanDocumentPersistence {
  enabled: boolean;
  uploadConfigured: boolean;
  state: DocumentRequestState;
  addDocument(loanId: string, doc: PortfolioLoanDocumentRecord): Promise<DocumentPersistenceResult>;
  updateDocument(
    documentId: string,
    doc: PortfolioLoanDocumentRecord,
  ): Promise<DocumentPersistenceResult>;
  addEvidence(loanId: string, evidence: EvidenceLinkRecord): Promise<DocumentPersistenceResult>;
  addExaminerNote(loanId: string, note: ExaminerNoteRecord): Promise<DocumentPersistenceResult>;
  reset(): void;
}

export interface DocumentPersistenceOptions {
  /** The document-metadata feature flag. Default off. */
  documentMetadataEnabled?: boolean;
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
): UsePortfolioLoanDocumentPersistence {
  const flagOn = options.documentMetadataEnabled === true;
  const enabled = flagOn && adapter.enabled;
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
  const reset = useCallback(() => setState({ kind: 'idle' }), []);

  return {
    enabled,
    uploadConfigured: adapter.uploadConfigured,
    state,
    addDocument,
    updateDocument,
    addEvidence,
    addExaminerNote,
    reset,
  };
}
