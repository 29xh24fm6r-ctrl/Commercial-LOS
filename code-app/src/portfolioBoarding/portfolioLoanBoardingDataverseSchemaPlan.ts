/**
 * Phase 140I — Portfolio Loan Boarding Dataverse schema PLAN constants.
 *
 * The canonical, declarative target schema for persisting the Phase 140B-H
 * portfolio loan boarding system of record into Dataverse. This file is
 * CONSTANTS ONLY — it makes no live calls, performs no writes, and creates
 * nothing. It is the plan the read-only inspect/plan script modes compare the
 * live environment against, and the contract a future guarded seed phase
 * (140J) would implement.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - No IO, no fetch, no Dataverse calls. Pure data.
 *   - No fake borrower names, loan names, or dollar values.
 *   - All logical names use the project publisher prefix `cr664_`.
 *   - Nothing here creates schema. Phase 140I inspects and plans only.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DataverseDataType =
  | 'String'
  | 'Memo'
  | 'Integer'
  | 'Decimal'
  | 'Money'
  | 'Boolean'
  | 'DateTime'
  | 'Lookup'
  | 'Picklist';

export type DataverseRequiredLevel = 'None' | 'Recommended' | 'ApplicationRequired';

export type DataverseOwnershipType = 'UserOwned' | 'OrganizationOwned';

export interface TargetTablePlan {
  logicalName: string;
  schemaName: string;
  displayName: string;
  pluralDisplayName: string;
  primaryNameColumn: string;
  ownershipType: DataverseOwnershipType;
  description: string;
  requiredForPhase: string;
  seedOrder: number;
  parentTableLogicalName?: string;
  sourceModelType: string;
  safetyNotes: string;
}

export interface TargetColumnPlan {
  tableLogicalName: string;
  logicalName: string;
  schemaName: string;
  displayName: string;
  dataType: DataverseDataType;
  requiredLevel: DataverseRequiredLevel;
  maxLength?: number;
  precision?: number;
  targets?: readonly string[];
  optionSetKey?: string;
  description: string;
  sourceModelPath: string;
  requiredForCreate: boolean;
  requiredForFDIC: boolean;
  requiredForBoard: boolean;
  requiredForPortfolioMonitoring: boolean;
}

export interface TargetRelationshipPlan {
  relationshipSchemaName: string;
  fromTable: string;
  fromColumn: string;
  toTable: string;
  cardinality: 'ManyToOne';
  required: boolean;
  cascadeBehavior: 'Parental' | 'Referential';
  description: string;
}

export interface TargetOptionSetPlan {
  key: string;
  displayName: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Version + logical names
// ---------------------------------------------------------------------------

export const PORTFOLIO_BOARDING_SCHEMA_VERSION = '140I.1';

export const PORTFOLIO_BOARDING_PUBLISHER_PREFIX = 'cr664';

const T = Object.freeze({
  loan: 'cr664_portfolioboardedloan',
  borrower: 'cr664_portfolioboardedloanborrower',
  collateral: 'cr664_portfolioboardedloancollateral',
  guarantor: 'cr664_portfolioboardedloanguarantor',
  covenant: 'cr664_portfolioboardedloancovenant',
  tickler: 'cr664_portfolioboardedloantickler',
  insurance: 'cr664_portfolioboardedloaninsurance',
  document: 'cr664_portfolioboardedloandocument',
  exception: 'cr664_portfolioboardedloanexception',
  review: 'cr664_portfolioboardedloanreview',
  evidence: 'cr664_portfolioboardedloanevidence',
  auditEntry: 'cr664_portfolioboardedloanauditentry',
  examinerNote: 'cr664_portfolioboardedloanexaminernote',
});

/** The root table every child lookup points back to. */
export const PORTFOLIO_BOARDING_ROOT_TABLE = T.loan;

/** The shared child→root lookup column schema name. */
export const PORTFOLIO_BOARDING_ROOT_LOOKUP_COLUMN = 'cr664_PortfolioBoardedLoan';

/** Existing project tables the boarded loan may reuse / link to. */
export const PORTFOLIO_BOARDING_RELATED_TABLES: readonly string[] = Object.freeze([
  'cr664_loandeal',
  'cr664_clientrelationship',
  'cr664_banker',
  'cr664_team',
  'cr664_platformuser',
]);

// ---------------------------------------------------------------------------
// Tables (13)
// ---------------------------------------------------------------------------

function table(
  logicalName: string,
  displayName: string,
  pluralDisplayName: string,
  seedOrder: number,
  sourceModelType: string,
  extra: Partial<TargetTablePlan> = {},
): TargetTablePlan {
  const short = logicalName.replace(/^cr664_/, '');
  return {
    logicalName,
    schemaName: `cr664_${short.charAt(0).toUpperCase()}${short.slice(1)}`,
    displayName,
    pluralDisplayName,
    primaryNameColumn: 'cr664_name',
    ownershipType: 'UserOwned',
    description: `${displayName} — portfolio boarding system-of-record table.`,
    requiredForPhase: '140I',
    seedOrder,
    sourceModelType,
    safetyNotes:
      'Inspect live metadata before any seed. Never create if an ambiguous or legacy artifact already exists under this name.',
    ...extra,
  };
}

export const PORTFOLIO_BOARDING_TARGET_TABLES: readonly TargetTablePlan[] =
  Object.freeze([
    table(
      T.loan,
      'Portfolio Boarded Loan',
      'Portfolio Boarded Loans',
      1,
      'PortfolioLoanBoardingPackage',
      {
        description:
          'Primary record for a manually boarded closed loan (portfolio system of record).',
      },
    ),
    table(T.borrower, 'Portfolio Boarded Loan Borrower', 'Portfolio Boarded Loan Borrowers', 2, 'BorrowerProfile', {
      parentTableLogicalName: T.loan,
    }),
    table(T.collateral, 'Portfolio Boarded Loan Collateral', 'Portfolio Boarded Loan Collateral', 3, 'CollateralItem', {
      parentTableLogicalName: T.loan,
    }),
    table(T.guarantor, 'Portfolio Boarded Loan Guarantor', 'Portfolio Boarded Loan Guarantors', 4, 'GuarantorRecord', {
      parentTableLogicalName: T.loan,
    }),
    table(T.covenant, 'Portfolio Boarded Loan Covenant', 'Portfolio Boarded Loan Covenants', 5, 'CovenantRecord', {
      parentTableLogicalName: T.loan,
    }),
    table(T.tickler, 'Portfolio Boarded Loan Tickler', 'Portfolio Boarded Loan Ticklers', 6, 'TicklerRecord', {
      parentTableLogicalName: T.loan,
    }),
    table(T.insurance, 'Portfolio Boarded Loan Insurance', 'Portfolio Boarded Loan Insurance', 7, 'InsurancePolicyRecord', {
      parentTableLogicalName: T.loan,
    }),
    table(T.document, 'Portfolio Boarded Loan Document', 'Portfolio Boarded Loan Documents', 8, 'PortfolioLoanDocumentRecord', {
      parentTableLogicalName: T.loan,
    }),
    table(T.exception, 'Portfolio Boarded Loan Exception', 'Portfolio Boarded Loan Exceptions', 9, 'ExceptionRecord', {
      parentTableLogicalName: T.loan,
    }),
    table(T.review, 'Portfolio Boarded Loan Review', 'Portfolio Boarded Loan Reviews', 10, 'ReviewHistoryRecord', {
      parentTableLogicalName: T.loan,
    }),
    table(T.evidence, 'Portfolio Boarded Loan Evidence', 'Portfolio Boarded Loan Evidence', 11, 'EvidenceRecord', {
      parentTableLogicalName: T.loan,
    }),
    table(T.auditEntry, 'Portfolio Boarded Loan Audit Entry', 'Portfolio Boarded Loan Audit Entries', 12, 'AuditTrailRecord', {
      parentTableLogicalName: T.loan,
    }),
    table(T.examinerNote, 'Portfolio Boarded Loan Examiner Note', 'Portfolio Boarded Loan Examiner Notes', 13, 'ExaminerNoteRecord', {
      parentTableLogicalName: T.loan,
    }),
  ]);

// ---------------------------------------------------------------------------
// Column builder
// ---------------------------------------------------------------------------

function col(
  tableLogicalName: string,
  shortName: string,
  displayName: string,
  dataType: DataverseDataType,
  extra: Partial<TargetColumnPlan> = {},
): TargetColumnPlan {
  return {
    tableLogicalName,
    logicalName: `cr664_${shortName}`,
    schemaName: `cr664_${shortName.charAt(0).toUpperCase()}${shortName.slice(1)}`,
    displayName,
    dataType,
    requiredLevel: 'None',
    description: displayName,
    sourceModelPath: '',
    requiredForCreate: false,
    requiredForFDIC: false,
    requiredForBoard: false,
    requiredForPortfolioMonitoring: false,
    ...extra,
  };
}

/** The primary name column every table carries. */
function primaryName(tableLogicalName: string): TargetColumnPlan {
  return col(tableLogicalName, 'name', 'Name', 'String', {
    requiredLevel: 'ApplicationRequired',
    requiredForCreate: true,
    maxLength: 200,
    description: 'Primary name (operator-supplied label for the record).',
  });
}

/** The shared child→root lookup column. */
function rootLookup(tableLogicalName: string): TargetColumnPlan {
  return col(tableLogicalName, 'portfolioboardedloan', 'Portfolio Boarded Loan', 'Lookup', {
    schemaName: PORTFOLIO_BOARDING_ROOT_LOOKUP_COLUMN,
    requiredLevel: 'ApplicationRequired',
    requiredForCreate: true,
    targets: [PORTFOLIO_BOARDING_ROOT_TABLE],
    description: 'Parent boarded-loan record this child row belongs to.',
  });
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

const LOAN_COLUMNS: readonly TargetColumnPlan[] = [
  primaryName(T.loan),
  col(T.loan, 'loannumber', 'Loan number', 'String', {
    requiredLevel: 'ApplicationRequired',
    requiredForCreate: true,
    requiredForFDIC: true,
    requiredForBoard: true,
    requiredForPortfolioMonitoring: true,
    sourceModelPath: 'identity.loanNumber',
  }),
  col(T.loan, 'borrowerlegalname', 'Borrower legal name', 'String', {
    requiredForFDIC: true,
    requiredForBoard: true,
    requiredForPortfolioMonitoring: true,
    sourceModelPath: 'identity.borrowerLegalName',
  }),
  col(T.loan, 'borrowerdba', 'Borrower DBA', 'String', { sourceModelPath: 'identity.borrowerDba' }),
  col(T.loan, 'relationshipname', 'Relationship name', 'String', { sourceModelPath: 'identity.relationshipName' }),
  col(T.loan, 'loanstatus', 'Loan status', 'Picklist', {
    optionSetKey: 'loanStatus',
    requiredForFDIC: true,
    requiredForBoard: true,
    requiredForPortfolioMonitoring: true,
    sourceModelPath: 'identity.loanStatus',
  }),
  col(T.loan, 'boardingstatus', 'Boarding status', 'Picklist', {
    optionSetKey: 'boardingStatus',
    sourceModelPath: 'audit.boardingStatus',
  }),
  col(T.loan, 'boardingsource', 'Boarding source', 'Picklist', {
    optionSetKey: 'boardingSource',
    description: 'Distinguishes a manually boarded loan from an originated-deal promotion.',
    sourceModelPath: 'audit.sourceSystem',
  }),
  col(T.loan, 'originateddealid', 'Originated deal id', 'String', { sourceModelPath: 'identity.originatedDealId' }),
  col(T.loan, 'legacysystemid', 'Legacy system id', 'String', { sourceModelPath: 'identity.legacySystemId' }),
  col(T.loan, 'coresystemloanid', 'Core system loan id', 'String', { sourceModelPath: 'identity.coreSystemLoanId' }),
  col(T.loan, 'originalcommitmentamount', 'Original commitment amount', 'Money', {
    requiredForFDIC: true,
    requiredForBoard: true,
    sourceModelPath: 'terms.originalCommitmentAmount',
  }),
  col(T.loan, 'currentoutstandingprincipal', 'Current outstanding principal', 'Money', {
    requiredForFDIC: true,
    requiredForBoard: true,
    requiredForPortfolioMonitoring: true,
    sourceModelPath: 'terms.currentOutstandingPrincipal',
  }),
  col(T.loan, 'availablebalance', 'Available balance', 'Money', { sourceModelPath: 'terms.availableBalance' }),
  col(T.loan, 'interestratetype', 'Interest rate type', 'String', { sourceModelPath: 'terms.interestRateType' }),
  col(T.loan, 'index', 'Index', 'String', { sourceModelPath: 'terms.index' }),
  col(T.loan, 'spread', 'Spread', 'Decimal', { precision: 4, sourceModelPath: 'terms.spread' }),
  col(T.loan, 'floor', 'Floor', 'Decimal', { precision: 4, sourceModelPath: 'terms.floor' }),
  col(T.loan, 'ceiling', 'Ceiling', 'Decimal', { precision: 4, sourceModelPath: 'terms.ceiling' }),
  col(T.loan, 'paymentfrequency', 'Payment frequency', 'String', { sourceModelPath: 'terms.paymentFrequency' }),
  col(T.loan, 'amortizationmonths', 'Amortization months', 'Integer', { sourceModelPath: 'terms.amortization' }),
  col(T.loan, 'termmonths', 'Term months', 'Integer', { sourceModelPath: 'terms.term' }),
  col(T.loan, 'bookingdate', 'Booking date', 'DateTime', { requiredForFDIC: true, sourceModelPath: 'identity.bookingDate' }),
  col(T.loan, 'closingdate', 'Closing date', 'DateTime', { requiredForFDIC: true, sourceModelPath: 'identity.closingDate' }),
  col(T.loan, 'maturitydate', 'Maturity date', 'DateTime', {
    requiredForFDIC: true,
    requiredForBoard: true,
    requiredForPortfolioMonitoring: true,
    sourceModelPath: 'identity.maturityDate',
  }),
  col(T.loan, 'renewaldate', 'Renewal date', 'DateTime', { sourceModelPath: 'identity.renewalDate' }),
  col(T.loan, 'paidoffdate', 'Paid off date', 'DateTime', { sourceModelPath: 'identity.paidOffDate' }),
  col(T.loan, 'currentriskrating', 'Current risk rating', 'String', {
    requiredForFDIC: true,
    requiredForBoard: true,
    requiredForPortfolioMonitoring: true,
    sourceModelPath: 'servicing.currentRiskRating',
  }),
  col(T.loan, 'priorriskrating', 'Prior risk rating', 'String', { sourceModelPath: 'servicing.priorRiskRating' }),
  col(T.loan, 'riskratingdate', 'Risk rating date', 'DateTime', {
    requiredForFDIC: true,
    requiredForPortfolioMonitoring: true,
    sourceModelPath: 'servicing.riskRatingDate',
  }),
  col(T.loan, 'nextreviewdate', 'Next review date', 'DateTime', {
    requiredForPortfolioMonitoring: true,
    sourceModelPath: 'servicing.nextReviewDate',
  }),
  col(T.loan, 'watchlistflag', 'Watchlist flag', 'Boolean', { sourceModelPath: 'servicing.watchlistFlag' }),
  col(T.loan, 'criticizedclassifiedstatus', 'Criticized/classified status', 'String', {
    sourceModelPath: 'servicing.criticizedClassifiedStatus',
  }),
  col(T.loan, 'accrualstatus', 'Accrual status', 'String', {
    requiredForFDIC: true,
    requiredForBoard: true,
    requiredForPortfolioMonitoring: true,
    sourceModelPath: 'servicing.accrualStatus',
  }),
  col(T.loan, 'pastduedays', 'Past due days', 'Integer', {
    requiredForPortfolioMonitoring: true,
    sourceModelPath: 'servicing.pastDueDays',
  }),
  col(T.loan, 'exceptioncount', 'Exception count', 'Integer', { sourceModelPath: 'servicing.exceptionCount' }),
  col(T.loan, 'highseverityexceptioncount', 'High severity exception count', 'Integer', {
    sourceModelPath: 'servicing.highSeverityExceptionCount',
  }),
  col(T.loan, 'fdicready', 'FDIC ready', 'Boolean', { requiredForFDIC: true, sourceModelPath: 'completeness.fdicReady' }),
  col(T.loan, 'boardready', 'Board ready', 'Boolean', { requiredForBoard: true, sourceModelPath: 'completeness.boardReady' }),
  col(T.loan, 'portfoliomonitoringready', 'Portfolio monitoring ready', 'Boolean', {
    requiredForPortfolioMonitoring: true,
    sourceModelPath: 'completeness.portfolioMonitoringReady',
  }),
  col(T.loan, 'boardingready', 'Boarding ready', 'Boolean', { sourceModelPath: 'completeness.boardingReady' }),
  col(T.loan, 'readinessjson', 'Readiness JSON', 'Memo', { sourceModelPath: 'completeness' }),
  col(T.loan, 'snapshotjson', 'Snapshot JSON', 'Memo', { sourceModelPath: 'snapshot' }),
  // Lookup candidates (targets confirmed by live inspection).
  col(T.loan, 'originatedloandeal', 'Originated loan deal', 'Lookup', {
    schemaName: 'cr664_OriginatedLoanDeal',
    targets: ['cr664_loandeal'],
    description: 'Optional link to the originating Loan Deal, when boarded from a closed deal.',
  }),
  col(T.loan, 'client', 'Client', 'Lookup', {
    schemaName: 'cr664_Client',
    targets: ['cr664_clientrelationship'],
    description: 'Optional link to the Client / Relationship record.',
  }),
  col(T.loan, 'portfoliomanager', 'Portfolio manager', 'Lookup', {
    schemaName: 'cr664_PortfolioManager',
    targets: ['systemuser', 'cr664_banker'],
    description: 'Portfolio manager — target confirmed by inspection (systemuser vs banker table).',
  }),
  col(T.loan, 'assignedservicingowner', 'Assigned servicing owner', 'Lookup', {
    schemaName: 'cr664_AssignedServicingOwner',
    targets: ['systemuser', 'cr664_banker'],
    description: 'Servicing owner — target confirmed by inspection (systemuser vs banker table).',
  }),
  col(T.loan, 'team', 'Team', 'Lookup', {
    schemaName: 'cr664_Team',
    targets: ['cr664_team'],
    description: 'Optional link to the owning Team, if a Team table exists.',
  }),
];

const BORROWER_COLUMNS: readonly TargetColumnPlan[] = [
  primaryName(T.borrower),
  rootLookup(T.borrower),
  col(T.borrower, 'legalentitytype', 'Legal entity type', 'String', {
    requiredForFDIC: true,
    sourceModelPath: 'borrower.legalEntityType',
  }),
  col(T.borrower, 'taxidentifier', 'Tax identifier', 'String', {
    description: 'Placeholder field only — never seeded with a sample value.',
    sourceModelPath: 'borrower.taxIdentifier',
  }),
  col(T.borrower, 'naicsindustry', 'NAICS / industry', 'String', {
    requiredForFDIC: true,
    sourceModelPath: 'borrower.naicsIndustry',
  }),
  col(T.borrower, 'address', 'Address', 'Memo', { sourceModelPath: 'borrower.address' }),
  col(T.borrower, 'stateofformation', 'State of formation', 'String', { sourceModelPath: 'borrower.stateOfFormation' }),
  col(T.borrower, 'ownershipsummary', 'Ownership summary', 'Memo', { sourceModelPath: 'borrower.ownershipSummary' }),
  col(T.borrower, 'managementsummary', 'Management summary', 'Memo', { sourceModelPath: 'borrower.managementSummary' }),
  col(T.borrower, 'depositrelationshipsummary', 'Deposit relationship summary', 'Memo', {
    sourceModelPath: 'borrower.depositRelationshipSummary',
  }),
];

const COLLATERAL_COLUMNS: readonly TargetColumnPlan[] = [
  primaryName(T.collateral),
  rootLookup(T.collateral),
  col(T.collateral, 'collateralid', 'Collateral id', 'String'),
  col(T.collateral, 'collateraltype', 'Collateral type', 'Picklist', { optionSetKey: 'collateralType' }),
  col(T.collateral, 'description', 'Description', 'Memo'),
  col(T.collateral, 'lienposition', 'Lien position', 'String'),
  col(T.collateral, 'perfected', 'Perfected', 'Boolean'),
  col(T.collateral, 'perfectionmethod', 'Perfection method', 'String'),
  col(T.collateral, 'uccfilingnumber', 'UCC filing number', 'String'),
  col(T.collateral, 'uccfilingdate', 'UCC filing date', 'DateTime'),
  col(T.collateral, 'ucccontinuationdate', 'UCC continuation date', 'DateTime'),
  col(T.collateral, 'mortgageinstrumentnumber', 'Mortgage instrument number', 'String'),
  col(T.collateral, 'deedoftrustinstrumentnumber', 'Deed of trust instrument number', 'String'),
  col(T.collateral, 'titlepolicynumber', 'Title policy number', 'String'),
  col(T.collateral, 'titlepolicyamount', 'Title policy amount', 'Money'),
  col(T.collateral, 'appraisalrequired', 'Appraisal required', 'Boolean'),
  col(T.collateral, 'appraisaldate', 'Appraisal date', 'DateTime'),
  col(T.collateral, 'appraisedvalue', 'Appraised value', 'Money'),
  col(T.collateral, 'valuationdate', 'Valuation date', 'DateTime'),
  col(T.collateral, 'valuationamount', 'Valuation amount', 'Money'),
  col(T.collateral, 'advancerate', 'Advance rate', 'Decimal', { precision: 4 }),
  col(T.collateral, 'environmentalstatus', 'Environmental status', 'String'),
  col(T.collateral, 'flooddeterminationstatus', 'Flood determination status', 'String'),
  col(T.collateral, 'insurancerequired', 'Insurance required', 'Boolean'),
  col(T.collateral, 'collateralexceptionsjson', 'Collateral exceptions JSON', 'Memo'),
  col(T.collateral, 'releasestatus', 'Release status', 'String'),
];

const GUARANTOR_COLUMNS: readonly TargetColumnPlan[] = [
  primaryName(T.guarantor),
  rootLookup(T.guarantor),
  col(T.guarantor, 'guarantorid', 'Guarantor id', 'String'),
  col(T.guarantor, 'guarantorname', 'Guarantor name', 'String'),
  col(T.guarantor, 'guarantortype', 'Guarantor type', 'String'),
  col(T.guarantor, 'guaranteetype', 'Guarantee type', 'Picklist', { optionSetKey: 'guaranteeType' }),
  col(T.guarantor, 'limitedorunlimited', 'Limited or unlimited', 'String'),
  col(T.guarantor, 'guaranteeamount', 'Guarantee amount', 'Money'),
  col(T.guarantor, 'spouseconsentrequired', 'Spouse consent required', 'Boolean'),
  col(T.guarantor, 'spouseconsentreceived', 'Spouse consent received', 'Boolean'),
  col(T.guarantor, 'pfsdate', 'PFS date', 'DateTime'),
  col(T.guarantor, 'liquidity', 'Liquidity', 'Money'),
  col(T.guarantor, 'networth', 'Net worth', 'Money'),
  col(T.guarantor, 'contingentliabilitiessummary', 'Contingent liabilities summary', 'Memo'),
  col(T.guarantor, 'globaldebtservicesupportnotes', 'Global debt service support notes', 'Memo'),
  col(T.guarantor, 'exceptionsjson', 'Exceptions JSON', 'Memo'),
];

const COVENANT_COLUMNS: readonly TargetColumnPlan[] = [
  primaryName(T.covenant),
  rootLookup(T.covenant),
  col(T.covenant, 'covenantid', 'Covenant id', 'String'),
  col(T.covenant, 'covenantname', 'Covenant name', 'String'),
  col(T.covenant, 'covenanttype', 'Covenant type', 'String'),
  col(T.covenant, 'testingfrequency', 'Testing frequency', 'String'),
  col(T.covenant, 'nextduedate', 'Next due date', 'DateTime'),
  col(T.covenant, 'requiredthreshold', 'Required threshold', 'String'),
  col(T.covenant, 'currentstatus', 'Current status', 'Picklist', { optionSetKey: 'covenantStatus' }),
  col(T.covenant, 'lasttesteddate', 'Last tested date', 'DateTime'),
  col(T.covenant, 'lastreportedvalue', 'Last reported value', 'String'),
  col(T.covenant, 'waiverhistoryjson', 'Waiver history JSON', 'Memo'),
  col(T.covenant, 'breachhistoryjson', 'Breach history JSON', 'Memo'),
  col(T.covenant, 'owner', 'Owner', 'String'),
  col(T.covenant, 'severity', 'Severity', 'Picklist', { optionSetKey: 'exceptionSeverity' }),
  col(T.covenant, 'evidencedocumentidsjson', 'Evidence document ids JSON', 'Memo'),
];

const TICKLER_COLUMNS: readonly TargetColumnPlan[] = [
  primaryName(T.tickler),
  rootLookup(T.tickler),
  col(T.tickler, 'ticklerid', 'Tickler id', 'String'),
  col(T.tickler, 'ticklername', 'Tickler name', 'String'),
  col(T.tickler, 'ticklertype', 'Tickler type', 'String'),
  col(T.tickler, 'owner', 'Owner', 'String'),
  col(T.tickler, 'duedate', 'Due date', 'DateTime'),
  col(T.tickler, 'frequency', 'Frequency', 'String'),
  col(T.tickler, 'status', 'Status', 'Picklist', { optionSetKey: 'ticklerStatus' }),
  col(T.tickler, 'severity', 'Severity', 'Picklist', { optionSetKey: 'exceptionSeverity' }),
  col(T.tickler, 'relateddocumenttype', 'Related document type', 'String'),
  col(T.tickler, 'relatedcovenantid', 'Related covenant id', 'String'),
  col(T.tickler, 'notes', 'Notes', 'Memo'),
];

const INSURANCE_COLUMNS: readonly TargetColumnPlan[] = [
  primaryName(T.insurance),
  rootLookup(T.insurance),
  col(T.insurance, 'insuranceid', 'Insurance id', 'String'),
  col(T.insurance, 'insurancetype', 'Insurance type', 'String'),
  col(T.insurance, 'carrier', 'Carrier', 'String'),
  col(T.insurance, 'policynumber', 'Policy number', 'String'),
  col(T.insurance, 'coverageamount', 'Coverage amount', 'Money'),
  col(T.insurance, 'effectivedate', 'Effective date', 'DateTime'),
  col(T.insurance, 'expirationdate', 'Expiration date', 'DateTime'),
  col(T.insurance, 'requiredcoverageamount', 'Required coverage amount', 'Money'),
  col(T.insurance, 'evidencedocumentid', 'Evidence document id', 'String'),
  col(T.insurance, 'status', 'Status', 'Picklist', { optionSetKey: 'insuranceStatus' }),
  col(T.insurance, 'stale', 'Stale', 'Boolean'),
  col(T.insurance, 'exception', 'Exception', 'Boolean'),
];

const DOCUMENT_COLUMNS: readonly TargetColumnPlan[] = [
  primaryName(T.document),
  rootLookup(T.document),
  col(T.document, 'documentid', 'Document id', 'String'),
  col(T.document, 'documenttype', 'Document type', 'Picklist', { optionSetKey: 'documentType', requiredForFDIC: true }),
  col(T.document, 'documentname', 'Document name', 'String'),
  col(T.document, 'category', 'Category', 'String'),
  col(T.document, 'borrowerorobligorassociation', 'Borrower / obligor association', 'String'),
  col(T.document, 'effectivedate', 'Effective date', 'DateTime'),
  col(T.document, 'periodenddate', 'Period end date', 'DateTime'),
  col(T.document, 'receiveddate', 'Received date', 'DateTime'),
  col(T.document, 'revieweddate', 'Reviewed date', 'DateTime'),
  col(T.document, 'reviewer', 'Reviewer', 'String'),
  col(T.document, 'source', 'Source', 'String'),
  col(T.document, 'status', 'Status', 'Picklist', { optionSetKey: 'documentStatus' }),
  col(T.document, 'exceptionflag', 'Exception flag', 'Boolean'),
  col(T.document, 'missingflag', 'Missing flag', 'Boolean'),
  col(T.document, 'staleflag', 'Stale flag', 'Boolean'),
  col(T.document, 'filereference', 'File reference', 'String'),
  col(T.document, 'extractedfactidsjson', 'Extracted fact ids JSON', 'Memo'),
  col(T.document, 'evidencelinkidsjson', 'Evidence link ids JSON', 'Memo'),
  col(T.document, 'notes', 'Notes', 'Memo'),
];

const EXCEPTION_COLUMNS: readonly TargetColumnPlan[] = [
  primaryName(T.exception),
  rootLookup(T.exception),
  col(T.exception, 'exceptionid', 'Exception id', 'String'),
  col(T.exception, 'exceptiontype', 'Exception type', 'String'),
  col(T.exception, 'severity', 'Severity', 'Picklist', { optionSetKey: 'exceptionSeverity' }),
  col(T.exception, 'status', 'Status', 'Picklist', { optionSetKey: 'exceptionStatus' }),
  col(T.exception, 'openeddate', 'Opened date', 'DateTime'),
  col(T.exception, 'duedate', 'Due date', 'DateTime'),
  col(T.exception, 'resolveddate', 'Resolved date', 'DateTime'),
  col(T.exception, 'owner', 'Owner', 'String'),
  col(T.exception, 'description', 'Description', 'Memo'),
  col(T.exception, 'remediationplan', 'Remediation plan', 'Memo'),
  col(T.exception, 'evidencedocumentidsjson', 'Evidence document ids JSON', 'Memo'),
];

const REVIEW_COLUMNS: readonly TargetColumnPlan[] = [
  primaryName(T.review),
  rootLookup(T.review),
  col(T.review, 'reviewid', 'Review id', 'String'),
  col(T.review, 'reviewtype', 'Review type', 'Picklist', { optionSetKey: 'reviewType' }),
  col(T.review, 'reviewer', 'Reviewer', 'String'),
  col(T.review, 'reviewdate', 'Review date', 'DateTime'),
  col(T.review, 'outcome', 'Outcome', 'String'),
  col(T.review, 'notes', 'Notes', 'Memo'),
  col(T.review, 'nextreviewdate', 'Next review date', 'DateTime'),
  col(T.review, 'evidencedocumentidsjson', 'Evidence document ids JSON', 'Memo'),
];

const EVIDENCE_COLUMNS: readonly TargetColumnPlan[] = [
  primaryName(T.evidence),
  rootLookup(T.evidence),
  col(T.evidence, 'evidenceid', 'Evidence id', 'String'),
  col(T.evidence, 'sourcetype', 'Source type', 'String'),
  col(T.evidence, 'sourceid', 'Source id', 'String'),
  col(T.evidence, 'documentid', 'Document id', 'String'),
  col(T.evidence, 'factkey', 'Fact key', 'String'),
  col(T.evidence, 'description', 'Description', 'Memo'),
  col(T.evidence, 'createdbytext', 'Created by (text)', 'String'),
  col(T.evidence, 'createdat', 'Created at', 'DateTime'),
  // Optional link to the document this evidence references.
  col(T.evidence, 'portfolioboardedloandocument', 'Portfolio Boarded Loan Document', 'Lookup', {
    schemaName: 'cr664_PortfolioBoardedLoanDocument',
    targets: [T.document],
    description: 'Optional link to the document this evidence row was extracted from.',
  }),
];

const AUDIT_COLUMNS: readonly TargetColumnPlan[] = [
  primaryName(T.auditEntry),
  rootLookup(T.auditEntry),
  col(T.auditEntry, 'auditid', 'Audit id', 'String'),
  col(T.auditEntry, 'actor', 'Actor', 'String'),
  col(T.auditEntry, 'action', 'Action', 'String'),
  col(T.auditEntry, 'timestamp', 'Timestamp', 'DateTime'),
  col(T.auditEntry, 'fieldkey', 'Field key', 'String'),
  col(T.auditEntry, 'previousvaluesummary', 'Previous value summary', 'Memo'),
  col(T.auditEntry, 'newvaluesummary', 'New value summary', 'Memo'),
  col(T.auditEntry, 'reason', 'Reason', 'Memo'),
  col(T.auditEntry, 'evidencelinkidsjson', 'Evidence link ids JSON', 'Memo'),
];

const EXAMINER_NOTE_COLUMNS: readonly TargetColumnPlan[] = [
  primaryName(T.examinerNote),
  rootLookup(T.examinerNote),
  col(T.examinerNote, 'noteid', 'Note id', 'String'),
  col(T.examinerNote, 'examinerrequestid', 'Examiner request id', 'String'),
  col(T.examinerNote, 'note', 'Note', 'Memo'),
  col(T.examinerNote, 'responsestatus', 'Response status', 'String'),
  col(T.examinerNote, 'owner', 'Owner', 'String'),
  col(T.examinerNote, 'createdat', 'Created at', 'DateTime'),
  col(T.examinerNote, 'updatedat', 'Updated at', 'DateTime'),
  col(T.examinerNote, 'relatedevidenceidsjson', 'Related evidence ids JSON', 'Memo'),
];

export const PORTFOLIO_BOARDING_TARGET_COLUMNS: readonly TargetColumnPlan[] =
  Object.freeze([
    ...LOAN_COLUMNS,
    ...BORROWER_COLUMNS,
    ...COLLATERAL_COLUMNS,
    ...GUARANTOR_COLUMNS,
    ...COVENANT_COLUMNS,
    ...TICKLER_COLUMNS,
    ...INSURANCE_COLUMNS,
    ...DOCUMENT_COLUMNS,
    ...EXCEPTION_COLUMNS,
    ...REVIEW_COLUMNS,
    ...EVIDENCE_COLUMNS,
    ...AUDIT_COLUMNS,
    ...EXAMINER_NOTE_COLUMNS,
  ]);

// ---------------------------------------------------------------------------
// Relationships
// ---------------------------------------------------------------------------

function childToRoot(childTable: string, relName: string): TargetRelationshipPlan {
  return {
    relationshipSchemaName: relName,
    fromTable: childTable,
    fromColumn: PORTFOLIO_BOARDING_ROOT_LOOKUP_COLUMN,
    toTable: PORTFOLIO_BOARDING_ROOT_TABLE,
    cardinality: 'ManyToOne',
    required: true,
    cascadeBehavior: 'Parental',
    description: `${childTable} rows belong to one ${PORTFOLIO_BOARDING_ROOT_TABLE}.`,
  };
}

export const PORTFOLIO_BOARDING_TARGET_RELATIONSHIPS: readonly TargetRelationshipPlan[] =
  Object.freeze([
    childToRoot(T.borrower, 'cr664_portfolioboardedloan_borrower'),
    childToRoot(T.collateral, 'cr664_portfolioboardedloan_collateral'),
    childToRoot(T.guarantor, 'cr664_portfolioboardedloan_guarantor'),
    childToRoot(T.covenant, 'cr664_portfolioboardedloan_covenant'),
    childToRoot(T.tickler, 'cr664_portfolioboardedloan_tickler'),
    childToRoot(T.insurance, 'cr664_portfolioboardedloan_insurance'),
    childToRoot(T.document, 'cr664_portfolioboardedloan_document'),
    childToRoot(T.exception, 'cr664_portfolioboardedloan_exception'),
    childToRoot(T.review, 'cr664_portfolioboardedloan_review'),
    childToRoot(T.evidence, 'cr664_portfolioboardedloan_evidence'),
    childToRoot(T.auditEntry, 'cr664_portfolioboardedloan_auditentry'),
    childToRoot(T.examinerNote, 'cr664_portfolioboardedloan_examinernote'),
    {
      relationshipSchemaName: 'cr664_portfolioboardedloandocument_evidence',
      fromTable: T.evidence,
      fromColumn: 'cr664_PortfolioBoardedLoanDocument',
      toTable: T.document,
      cardinality: 'ManyToOne',
      required: false,
      cascadeBehavior: 'Referential',
      description: 'Optional link from an evidence row to the document it was drawn from.',
    },
    {
      relationshipSchemaName: 'cr664_portfolioboardedloan_originatedloandeal',
      fromTable: T.loan,
      fromColumn: 'cr664_OriginatedLoanDeal',
      toTable: 'cr664_loandeal',
      cardinality: 'ManyToOne',
      required: false,
      cascadeBehavior: 'Referential',
      description: 'Optional link to the originating Loan Deal when boarded from a closed deal.',
    },
    {
      relationshipSchemaName: 'cr664_portfolioboardedloan_client',
      fromTable: T.loan,
      fromColumn: 'cr664_Client',
      toTable: 'cr664_clientrelationship',
      cardinality: 'ManyToOne',
      required: false,
      cascadeBehavior: 'Referential',
      description: 'Optional link to the Client / Relationship record.',
    },
    {
      relationshipSchemaName: 'cr664_portfolioboardedloan_portfoliomanager',
      fromTable: T.loan,
      fromColumn: 'cr664_PortfolioManager',
      toTable: 'systemuser',
      cardinality: 'ManyToOne',
      required: false,
      cascadeBehavior: 'Referential',
      description: 'Optional link to the portfolio manager (systemuser).',
    },
    {
      relationshipSchemaName: 'cr664_portfolioboardedloan_assignedservicingowner',
      fromTable: T.loan,
      fromColumn: 'cr664_AssignedServicingOwner',
      toTable: 'systemuser',
      cardinality: 'ManyToOne',
      required: false,
      cascadeBehavior: 'Referential',
      description: 'Optional link to the assigned servicing owner (systemuser).',
    },
    {
      relationshipSchemaName: 'cr664_portfolioboardedloan_team',
      fromTable: T.loan,
      fromColumn: 'cr664_Team',
      toTable: 'cr664_team',
      cardinality: 'ManyToOne',
      required: false,
      cascadeBehavior: 'Referential',
      description: 'Optional link to the owning Team, if a Team table exists.',
    },
  ]);

// ---------------------------------------------------------------------------
// Option sets (metadata plan only — NOT created in Phase 140I)
// ---------------------------------------------------------------------------

export const PORTFOLIO_BOARDING_TARGET_OPTION_SETS: readonly TargetOptionSetPlan[] =
  Object.freeze([
    { key: 'boardingStatus', displayName: 'Boarding status', description: 'Draft / in review / boarded / needs correction.' },
    { key: 'boardingSource', displayName: 'Boarding source', description: 'Manual entry vs originated-deal promotion.' },
    { key: 'loanStatus', displayName: 'Loan status', description: 'Active / matured / renewed / paid off / charged off / closed.' },
    { key: 'documentType', displayName: 'Document type', description: 'Canonical portfolio loan document types.' },
    { key: 'documentStatus', displayName: 'Document status', description: 'Received / pending / waived / not applicable.' },
    { key: 'exceptionSeverity', displayName: 'Exception severity', description: 'Low / medium / high.' },
    { key: 'exceptionStatus', displayName: 'Exception status', description: 'Open / cleared.' },
    { key: 'reviewType', displayName: 'Review type', description: 'Annual review / risk rating review / site visit / other.' },
    { key: 'readinessStatus', displayName: 'Readiness status', description: 'Readiness state for FDIC / board / monitoring lenses.' },
    { key: 'collateralType', displayName: 'Collateral type', description: 'Real estate / equipment / AR / inventory / etc.' },
    { key: 'guaranteeType', displayName: 'Guarantee type', description: 'Limited / unlimited / specific.' },
    { key: 'covenantStatus', displayName: 'Covenant status', description: 'In compliance / breach / waived / not tested.' },
    { key: 'ticklerStatus', displayName: 'Tickler status', description: 'Open / completed / overdue.' },
    { key: 'insuranceStatus', displayName: 'Insurance status', description: 'Current / expired / pending.' },
  ]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const ALL_TARGET_TABLE_LOGICAL_NAMES: readonly string[] = Object.freeze(
  PORTFOLIO_BOARDING_TARGET_TABLES.map((t) => t.logicalName),
);

export function getTargetTable(logicalName: string): TargetTablePlan | undefined {
  return PORTFOLIO_BOARDING_TARGET_TABLES.find((t) => t.logicalName === logicalName);
}

export function targetColumnsForTable(
  logicalName: string,
): readonly TargetColumnPlan[] {
  return PORTFOLIO_BOARDING_TARGET_COLUMNS.filter(
    (c) => c.tableLogicalName === logicalName,
  );
}

export function childTableRelationships(): readonly TargetRelationshipPlan[] {
  return PORTFOLIO_BOARDING_TARGET_RELATIONSHIPS.filter(
    (r) => r.toTable === PORTFOLIO_BOARDING_ROOT_TABLE,
  );
}
