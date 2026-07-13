import type { CSSProperties } from 'react';
import { spacing } from '../shared/theme';
import type { PortfolioLoanBoardingPackage } from '../shared/portfolioBoarding/portfolioLoanBoardingTypes';
import { derivePortfolioLoanBoardingSnapshot } from '../shared/portfolioBoarding/portfolioLoanBoardingSnapshot';
import { PortfolioLoanBoardingPreview } from './PortfolioLoanBoardingPreview';
import { PortfolioLoanBoardingReadinessPanel } from './PortfolioLoanBoardingReadinessPanel';
import { PortfolioLoanBoardingDocumentInventory } from './PortfolioLoanBoardingDocumentInventory';
import { PortfolioLoanBoardingEvidencePanel } from './PortfolioLoanBoardingEvidencePanel';
import { FdicExaminerPackagePreview } from './FdicExaminerPackagePreview';
import { PortfolioLoanBoardingValidationSummary } from './PortfolioLoanBoardingValidationSummary';
import { PortfolioLoanBoardingDocumentUploadPanel } from './PortfolioLoanBoardingDocumentUploadPanel';
import {
  usePortfolioLoanDocumentPersistence,
  createDisabledPortfolioBoardingDocumentAdapter,
  type PortfolioBoardingDocumentAdapter,
} from './usePortfolioLoanDocumentPersistence';

interface Props {
  package: PortfolioLoanBoardingPackage;
  /** The document-metadata feature flag, resolved by the workspace root. Default off. */
  documentMetadataEnabled?: boolean;
  /** The SharePoint document-upload feature flag, resolved by the workspace root. Default off. */
  sharePointUploadEnabled?: boolean;
  /** Injected for testability; defaults to the disabled (fail-closed) adapter. */
  documentAdapter?: PortfolioBoardingDocumentAdapter;
}

/**
 * Phase 140M — boarded-loan detail. Composes the existing Phase 140B-H
 * read-only views + the validation summary. All derivers are pure; this
 * component performs no IO of its own — the document upload panel's IO goes
 * through the injected adapters (Phase 264).
 */
export function PortfolioLoanBoardingDetail({
  package: pkg,
  documentMetadataEnabled = false,
  sharePointUploadEnabled = false,
  documentAdapter = createDisabledPortfolioBoardingDocumentAdapter(),
}: Props) {
  const snapshot = derivePortfolioLoanBoardingSnapshot({ package: pkg });
  const docs = usePortfolioLoanDocumentPersistence(documentAdapter, {
    documentMetadataEnabled,
    sharePointUploadEnabled,
  });
  return (
    <div style={stackStyle}>
      <PortfolioLoanBoardingPreview package={pkg} />
      <PortfolioLoanBoardingReadinessPanel snapshot={snapshot} />
      <PortfolioLoanBoardingValidationSummary package={pkg} />
      <PortfolioLoanBoardingDocumentInventory package={pkg} />
      <PortfolioLoanBoardingEvidencePanel package={pkg} />
      {/* Phase 264 (P3) — real (DRY_RUN by default) SharePoint document
          upload, one folder per loan. */}
      <PortfolioLoanBoardingDocumentUploadPanel
        loanId={pkg.packageId}
        loanNumber={pkg.identity.loanNumber}
        borrowerLegalName={pkg.identity.borrowerLegalName}
        uploadConfigured={docs.uploadConfigured}
        uploadMode={docs.uploadMode}
        uploadDocument={docs.uploadDocument}
      />
      <FdicExaminerPackagePreview package={pkg} />
    </div>
  );
}

const stackStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: spacing.lg };
