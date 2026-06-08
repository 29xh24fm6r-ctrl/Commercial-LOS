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

interface Props {
  package: PortfolioLoanBoardingPackage;
}

/**
 * Phase 140M — boarded-loan detail. Composes the existing Phase 140B-H
 * read-only views + the validation summary. All derivers are pure; this
 * component performs no IO.
 */
export function PortfolioLoanBoardingDetail({ package: pkg }: Props) {
  const snapshot = derivePortfolioLoanBoardingSnapshot({ package: pkg });
  return (
    <div style={stackStyle}>
      <PortfolioLoanBoardingPreview package={pkg} />
      <PortfolioLoanBoardingReadinessPanel snapshot={snapshot} />
      <PortfolioLoanBoardingValidationSummary package={pkg} />
      <PortfolioLoanBoardingDocumentInventory package={pkg} />
      <PortfolioLoanBoardingEvidencePanel package={pkg} />
      <FdicExaminerPackagePreview package={pkg} />
    </div>
  );
}

const stackStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: spacing.lg };
