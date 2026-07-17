/**
 * Phase 140B-H — Dataverse mapper.
 * Converts PortfolioLoanBoardingPackage to persistence payload and back.
 * Must not invent values. Must preserve nulls. Must preserve source markers.
 *
 * Column-name convention (established by the original 140B-H mapper and
 * followed here for every added field): `cr664_` + the TS field name
 * lower-cased with no separators (e.g. `borrowerLegalName` ->
 * `cr664_borrowerlegalname`). Every field is included ONLY when it is
 * genuinely present on the package — `undefined` never becomes a payload key,
 * so a partially-populated package (e.g. an auto-boarded draft) never writes
 * a fabricated value.
 */
import type {
  PortfolioLoanBoardingPackage,
  CollateralItem,
  GuarantorRecord,
  CovenantRecord,
  TicklerRecord,
  InsurancePolicyRecord,
  PortfolioLoanDocumentRecord,
  RiskRatingRecord,
  ExceptionRecord,
  ReviewHistoryRecord,
  EvidenceLinkRecord,
} from '../shared/portfolioBoarding/portfolioLoanBoardingTypes';
import { PORTFOLIO_BOARDING_ENTITIES } from './portfolioLoanBoardingPersistenceTypes';

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

/** Set `fields[cr664_<key lowercased>] = value` only when `value` is genuinely present. */
function put(fields: Record<string, unknown>, key: string, value: unknown): void {
  if (value === undefined) return;
  fields[`cr664_${key.toLowerCase()}`] = value;
}

/** Apply `put` for every key in `obj`, skipping array-valued fields (mapped separately, if at all). */
function putAll(fields: Record<string, unknown>, obj: object): void {
  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) continue;
    put(fields, key, value);
  }
}

export function mapPackageToPersistence(
  pkg: PortfolioLoanBoardingPackage,
): PortfolioBoardingPersistencePayload {
  const fields: Record<string, unknown> = {};

  // A. Loan identity
  putAll(fields, pkg.identity);
  // C. Loan economics
  putAll(fields, pkg.terms);
  // Closing information
  putAll(fields, pkg.closing);
  // D. Credit approval (scalar fields only; sourcesAndUses is a structured
  // sub-array, not yet a persisted child — no live table exists for it).
  putAll(fields, pkg.creditApproval);
  // I. Servicing / portfolio monitoring
  putAll(fields, pkg.servicing);
  // Audit trail scalar fields (createdBy/At, boardingStatus, etc.) live on the
  // root record; the per-change audit-entry CHILD rows are separate.
  putAll(fields, pkg.audit);

  // Source + metadata
  if (pkg.source !== undefined) fields['cr664_boardingsource'] = pkg.source;
  if (pkg.packageId !== undefined) fields['cr664_packageid'] = pkg.packageId;

  const childPayloads: ChildPersistencePayload[] = [];

  // B. Borrower / obligor — a dedicated child entity exists
  // (cr664_portfolioboardedloanborrower); only emitted when at least one
  // borrower field is actually populated (never an empty placeholder row).
  const borrowerChild = mapChild(PORTFOLIO_BOARDING_ENTITIES.boardedLoanBorrower, pkg.borrower);
  if (Object.keys(borrowerChild.fields).length > 0) childPayloads.push(borrowerChild);

  for (const item of pkg.collateral.items) {
    childPayloads.push(mapChild<CollateralItem>(PORTFOLIO_BOARDING_ENTITIES.boardedLoanCollateral, item));
  }
  for (const g of pkg.guarantors.guarantors) {
    childPayloads.push(mapChild<GuarantorRecord>(PORTFOLIO_BOARDING_ENTITIES.boardedLoanGuarantor, g));
  }
  for (const c of pkg.covenants.covenants) {
    childPayloads.push(mapChild<CovenantRecord>(PORTFOLIO_BOARDING_ENTITIES.boardedLoanCovenant, c));
  }
  for (const t of pkg.ticklers.ticklers) {
    childPayloads.push(mapChild<TicklerRecord>(PORTFOLIO_BOARDING_ENTITIES.boardedLoanTickler, t));
  }
  for (const p of pkg.insurance.policies) {
    childPayloads.push(mapChild<InsurancePolicyRecord>(PORTFOLIO_BOARDING_ENTITIES.boardedLoanInsurance, p));
  }
  for (const d of pkg.documents.documents) {
    childPayloads.push(mapChild<PortfolioLoanDocumentRecord>(PORTFOLIO_BOARDING_ENTITIES.boardedLoanDocument, d));
  }
  // No dedicated risk-rating entity exists in the 12-entity persistence
  // allow-list (portfolioLoanBoardingPersistenceTypes.ts) — risk ratings route
  // to the review entity alongside reviewHistory (both are review-shaped
  // records). This is a documented assumption to confirm against the live
  // schema before the live-persistence gate is flipped, not a verified fact.
  for (const r of pkg.riskRatings) {
    childPayloads.push(mapChild<RiskRatingRecord>(PORTFOLIO_BOARDING_ENTITIES.boardedLoanReview, r));
  }
  for (const e of pkg.exceptions) {
    childPayloads.push(mapChild<ExceptionRecord>(PORTFOLIO_BOARDING_ENTITIES.boardedLoanException, e));
  }
  for (const rh of pkg.reviewHistory) {
    childPayloads.push(mapChild<ReviewHistoryRecord>(PORTFOLIO_BOARDING_ENTITIES.boardedLoanReview, rh));
  }
  for (const ev of pkg.evidenceLinks) {
    childPayloads.push(mapChild<EvidenceLinkRecord>(PORTFOLIO_BOARDING_ENTITIES.boardedLoanEvidence, ev));
  }

  return {
    entityName: PORTFOLIO_BOARDING_ENTITIES.boardedLoan,
    fields,
    source: pkg.source,
    childPayloads,
  };
}

function mapChild<T extends object>(entityName: string, record: T): ChildPersistencePayload {
  const fields: Record<string, unknown> = {};
  putAll(fields, record);
  return { entityName, fields };
}

export function mapPersistenceToPackage(
  payload: PortfolioBoardingPersistencePayload,
): Partial<PortfolioLoanBoardingPackage> {
  const fields = payload.fields;
  const get = <T>(key: string): T | undefined => (fields[`cr664_${key.toLowerCase()}`] as T | undefined) ?? undefined;

  return {
    source: get('boardingsource'),
    packageId: get('packageid'),
    identity: {
      loanNumber: get('loannumber'),
      dealName: get('dealname'),
      borrowerLegalName: get('borrowerlegalname'),
      borrowerDba: get('borrowerdba'),
      relationshipName: get('relationshipname'),
      originatingBanker: get('originatingbanker'),
      portfolioManager: get('portfoliomanager'),
      servicingOwner: get('servicingowner'),
      branchMarket: get('branchmarket'),
      loanStatus: get('loanstatus'),
      bookingDate: get('bookingdate'),
      closingDate: get('closingdate'),
      maturityDate: get('maturitydate'),
      renewalDate: get('renewaldate'),
      paidOffDate: get('paidoffdate'),
      originatedDealId: get('originateddealid'),
      boardedLoanId: get('boardedloanid'),
      legacySystemId: get('legacysystemid'),
      coreSystemLoanId: get('coresystemloanid'),
    },
    borrower: {
      legalEntityType: get('legalentitytype'),
      taxIdentifier: get('taxidentifier'),
      naicsIndustry: get('naicsindustry'),
      address: get('address'),
      stateOfFormation: get('stateofformation'),
      ownershipSummary: get('ownershipsummary'),
      managementSummary: get('managementsummary'),
      depositRelationshipSummary: get('depositrelationshipsummary'),
    },
    terms: {
      originalCommitmentAmount: get('originalcommitmentamount'),
      currentOutstandingPrincipal: get('currentoutstandingprincipal'),
      availableBalance: get('availablebalance'),
      interestRateType: get('interestratetype'),
      index: get('index'),
      spread: get('spread'),
      floor: get('floor'),
      ceiling: get('ceiling'),
      paymentFrequency: get('paymentfrequency'),
      amortization: get('amortization'),
      term: get('term'),
      fees: get('fees'),
      prepaymentTerms: get('prepaymentterms'),
      unusedLineFee: get('unusedlinefee'),
      revolvingLine: get('revolvingline'),
      borrowingBaseLoan: get('borrowingbaseloan'),
      sbaLoan: get('sbaloan'),
      participationLoan: get('participationloan'),
      guaranteeInformation: get('guaranteeinformation'),
    },
    closing: {
      closingDate: get('closingdate'),
      fundedDate: get('fundeddate'),
      closingAgent: get('closingagent'),
      closingConditionsCleared: get('closingconditionscleared'),
      fundingAmount: get('fundingamount'),
      notes: get('notes'),
    },
    creditApproval: {
      approvalAuthority: get('approvalauthority'),
      approvalDate: get('approvaldate'),
      approvedStructure: get('approvedstructure'),
      approvedPurpose: get('approvedpurpose'),
      approvedSourcesAndUses: get('approvedsourcesanduses'),
      approvedCollateral: get('approvedcollateral'),
      approvedGuarantors: get('approvedguarantors'),
      boardApprovalRequired: get('boardapprovalrequired'),
      boardApprovalDate: get('boardapprovaldate'),
      approvalMemoDocumentId: get('approvalmemodocumentid'),
      creditMemoDocumentId: get('creditmemodocumentid'),
    },
    servicing: {
      currentRiskRating: get('currentriskrating'),
      priorRiskRating: get('priorriskrating'),
      riskRatingDate: get('riskratingdate'),
      nextReviewDate: get('nextreviewdate'),
      annualReviewStatus: get('annualreviewstatus'),
      watchlistFlag: get('watchlistflag'),
      criticizedClassifiedStatus: get('criticizedclassifiedstatus'),
      accrualStatus: get('accrualstatus'),
      pastDueDays: get('pastduedays'),
      paymentStatus: get('paymentstatus'),
      covenantStatus: get('covenantstatus'),
      collateralMonitoringStatus: get('collateralmonitoringstatus'),
      insuranceStatus: get('insurancestatus'),
      financialReportingStatus: get('financialreportingstatus'),
      borrowingBaseStatus: get('borrowingbasestatus'),
      exceptionCount: get('exceptioncount'),
      highSeverityExceptionCount: get('highseverityexceptioncount'),
    },
  };
}
