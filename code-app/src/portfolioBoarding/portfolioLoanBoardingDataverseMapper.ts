/**
 * Phase 140B-H — Dataverse mapper.
 * Converts PortfolioLoanBoardingPackage to persistence payload and back.
 * Must not invent values. Must preserve nulls. Must preserve source markers.
 */
import type { PortfolioLoanBoardingPackage } from '../shared/portfolioBoarding/portfolioLoanBoardingTypes';

export interface PortfolioBoardingPersistencePayload {
  entityName: string;
  fields: Record<string, unknown>;
  source: string | undefined;
  childPayloads: readonly ChildPersistencePayload[];
}

export interface ChildPersistencePayload {
  entityName: string;
  fields: Record<string, unknown>;
}

export function mapPackageToPersistence(
  pkg: PortfolioLoanBoardingPackage,
): PortfolioBoardingPersistencePayload {
  const fields: Record<string, unknown> = {};

  // Identity
  if (pkg.identity.loanNumber !== undefined) fields['cr664_loannumber'] = pkg.identity.loanNumber;
  if (pkg.identity.dealName !== undefined) fields['cr664_dealname'] = pkg.identity.dealName;
  if (pkg.identity.borrowerLegalName !== undefined) fields['cr664_borrowerlegalname'] = pkg.identity.borrowerLegalName;
  if (pkg.identity.loanStatus !== undefined) fields['cr664_loanstatus'] = pkg.identity.loanStatus;
  if (pkg.identity.bookingDate !== undefined) fields['cr664_bookingdate'] = pkg.identity.bookingDate;
  if (pkg.identity.closingDate !== undefined) fields['cr664_closingdate'] = pkg.identity.closingDate;
  if (pkg.identity.maturityDate !== undefined) fields['cr664_maturitydate'] = pkg.identity.maturityDate;
  if (pkg.identity.portfolioManager !== undefined) fields['cr664_portfoliomanager'] = pkg.identity.portfolioManager;

  // Economics
  if (pkg.terms.originalCommitmentAmount !== undefined) fields['cr664_originalcommitment'] = pkg.terms.originalCommitmentAmount;
  if (pkg.terms.currentOutstandingPrincipal !== undefined) fields['cr664_currentoutstanding'] = pkg.terms.currentOutstandingPrincipal;
  if (pkg.terms.interestRateType !== undefined) fields['cr664_interestratetype'] = pkg.terms.interestRateType;

  // Servicing
  if (pkg.servicing.currentRiskRating !== undefined) fields['cr664_currentriskrating'] = pkg.servicing.currentRiskRating;
  if (pkg.servicing.accrualStatus !== undefined) fields['cr664_accrualstatus'] = pkg.servicing.accrualStatus;

  // Source
  if (pkg.source !== undefined) fields['cr664_boardingsource'] = pkg.source;

  // Metadata
  if (pkg.packageId !== undefined) fields['cr664_packageid'] = pkg.packageId;

  const childPayloads: ChildPersistencePayload[] = [];

  // Collateral children
  for (const item of pkg.collateral.items) {
    const childFields: Record<string, unknown> = {};
    if (item.collateralType !== undefined) childFields['cr664_collateraltype'] = item.collateralType;
    if (item.description !== undefined) childFields['cr664_description'] = item.description;
    if (item.lienPosition !== undefined) childFields['cr664_lienposition'] = item.lienPosition;
    childPayloads.push({ entityName: 'cr664_portfolioboardedloancollateral', fields: childFields });
  }

  // Guarantor children
  for (const g of pkg.guarantors.guarantors) {
    const childFields: Record<string, unknown> = {};
    if (g.guarantorName !== undefined) childFields['cr664_guarantorname'] = g.guarantorName;
    if (g.guarantorType !== undefined) childFields['cr664_guarantortype'] = g.guarantorType;
    if (g.guaranteeAmount !== undefined) childFields['cr664_guaranteeamount'] = g.guaranteeAmount;
    childPayloads.push({ entityName: 'cr664_portfolioboardedloanguarantor', fields: childFields });
  }

  return {
    entityName: 'cr664_portfolioboardedloan',
    fields,
    source: pkg.source,
    childPayloads,
  };
}

export function mapPersistenceToPackage(
  payload: PortfolioBoardingPersistencePayload,
): Partial<PortfolioLoanBoardingPackage> {
  const fields = payload.fields;
  return {
    source: (fields['cr664_boardingsource'] as 'manual_boarding' | 'originated_closed_deal' | undefined) ?? undefined,
    packageId: (fields['cr664_packageid'] as string | undefined) ?? undefined,
    identity: {
      loanNumber: (fields['cr664_loannumber'] as string | undefined) ?? undefined,
      dealName: (fields['cr664_dealname'] as string | undefined) ?? undefined,
      borrowerLegalName: (fields['cr664_borrowerlegalname'] as string | undefined) ?? undefined,
      loanStatus: (fields['cr664_loanstatus'] as any) ?? undefined,
      bookingDate: (fields['cr664_bookingdate'] as string | undefined) ?? undefined,
      closingDate: (fields['cr664_closingdate'] as string | undefined) ?? undefined,
      maturityDate: (fields['cr664_maturitydate'] as string | undefined) ?? undefined,
      portfolioManager: (fields['cr664_portfoliomanager'] as string | undefined) ?? undefined,
    },
  };
}
