/**
 * Phase 140B-H — Portfolio loan document upload adapter.
 * Disabled by default. No real upload.
 */

export interface UploadResult {
  ok: boolean;
  reason?: string;
  documentId?: string;
}

export interface PortfolioLoanDocumentUploadAdapter {
  readonly enabled: boolean;
  upload(file: unknown, metadata: unknown): UploadResult;
}

export interface DisabledPortfolioLoanDocumentUploadAdapter extends PortfolioLoanDocumentUploadAdapter {
  readonly enabled: false;
}

export function createDisabledPortfolioLoanDocumentUploadAdapter(): DisabledPortfolioLoanDocumentUploadAdapter {
  return {
    enabled: false,
    upload() {
      return {
        ok: false,
        reason: 'portfolio_document_upload_adapter_not_configured',
      };
    },
  };
}
