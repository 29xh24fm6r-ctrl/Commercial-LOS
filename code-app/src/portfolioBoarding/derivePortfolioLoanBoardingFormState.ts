/**
 * Phase 140B-H — Derives form state from a boarding package.
 * Pure function. No IO.
 */
import type { PortfolioLoanBoardingPackage } from '../shared/portfolioBoarding/portfolioLoanBoardingTypes';
import { derivePortfolioLoanBoardingCompleteness } from '../shared/portfolioBoarding/derivePortfolioLoanBoardingCompleteness';
import type { BoardingFormSection } from './portfolioLoanBoardingFormModel';

export interface BoardingFormState {
  isDirty: boolean;
  missingFieldsBySection: Record<BoardingFormSection, readonly string[]>;
  fdicReady: boolean;
  boardReady: boolean;
  portfolioMonitoringReady: boolean;
  blockers: readonly string[];
}

export function derivePortfolioLoanBoardingFormState(
  pkg: PortfolioLoanBoardingPackage,
): BoardingFormState {
  const completeness = derivePortfolioLoanBoardingCompleteness({ package: pkg });

  const missingBySection: Record<BoardingFormSection, string[]> = {
    loanIdentity: [],
    borrowerProfile: [],
    loanTerms: [],
    closingInformation: [],
    creditApproval: [],
    collateral: [],
    guarantors: [],
    covenants: [],
    ticklers: [],
    insurance: [],
    documents: [],
    servicing: [],
    riskRating: [],
    exceptions: [],
    reviews: [],
    examinerNotes: [],
  };

  for (const field of completeness.missingRequiredFields) {
    const root = field.split('.')[0];
    if (root === 'identity') missingBySection.loanIdentity.push(field);
    else if (root === 'borrower') missingBySection.borrowerProfile.push(field);
    else if (root === 'terms') missingBySection.loanTerms.push(field);
    else if (root === 'closing') missingBySection.closingInformation.push(field);
    else if (root === 'creditApproval') missingBySection.creditApproval.push(field);
    else if (root === 'servicing') missingBySection.servicing.push(field);
  }

  return {
    isDirty: false,
    missingFieldsBySection: missingBySection,
    fdicReady: completeness.fdicReady,
    boardReady: completeness.boardReady,
    portfolioMonitoringReady: completeness.portfolioMonitoringReady,
    blockers: [...completeness.blockers],
  };
}
