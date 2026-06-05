/**
 * Phase 140B — Portfolio Loan Boarding completeness deriver.
 *
 * A PURE, fail-closed function that measures how complete a closed-loan
 * boarding package is against the field and document catalogs, and whether it
 * is ready for FDIC review, board reporting, and portfolio monitoring.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - PURE. No IO, no React, no Dataverse, no network. Deterministic given its
 *     inputs (inject `now` for date-relative staleness).
 *   - NO fake fallbacks. Missing means missing; stale means stale.
 *   - Readiness is FAIL-CLOSED: any missing required field, missing required
 *     document, or stale required document makes the relevant readiness false.
 *   - The deriver never invents a value to satisfy a requirement.
 */

import type {
  PortfolioLoanBoardingPackage,
  PortfolioLoanDocumentType,
  PortfolioLoanDocumentRecord,
  BoardingCompletenessResult,
} from './portfolioLoanBoardingTypes';
import {
  PORTFOLIO_LOAN_BOARDING_FIELDS,
  fieldsRequiredForBoarding,
  fieldsRequiredForFDICReview,
  fieldsRequiredForBoardReporting,
  fieldsRequiredForPortfolioMonitoring,
  type BoardingFieldDefinition,
} from './portfolioLoanBoardingCatalog';
import {
  PORTFOLIO_LOAN_DOCUMENTS,
  getDocumentDefinition,
  type PortfolioDocumentDefinition,
  type DocumentRequirementCondition,
} from './portfolioLoanDocumentCatalog';

export interface BoardingCompletenessInput {
  package: PortfolioLoanBoardingPackage;
  /** Injectable clock for deterministic staleness. Defaults to now. */
  now?: Date;
}

const MS_PER_DAY = 86_400_000;

// ---------------------------------------------------------------------------
// Presence + path helpers
// ---------------------------------------------------------------------------

function getByPath(root: unknown, path: string): unknown {
  let current: unknown = root;
  for (const segment of path.split('.')) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/** A value is present unless it is undefined, null, an empty string, or an empty array. */
function isPresent(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true; // booleans (incl. false) and numbers (incl. 0) are present
}

// ---------------------------------------------------------------------------
// Package context (drives conditional document requirements)
// ---------------------------------------------------------------------------

interface PackageContext {
  hasCollateral: boolean;
  hasRealEstateCollateral: boolean;
  collateralRequiresInsurance: boolean;
  hasGuarantors: boolean;
  isBorrowingBase: boolean;
  isSba: boolean;
  isActiveMonitored: boolean;
  boardApprovalRequired: boolean;
}

function buildContext(pkg: PortfolioLoanBoardingPackage): PackageContext {
  const items = pkg.collateral?.items ?? [];
  return {
    hasCollateral: items.length > 0,
    hasRealEstateCollateral: items.some((i) => i.collateralType === 'real_estate'),
    collateralRequiresInsurance: items.some((i) => i.insuranceRequired === true),
    hasGuarantors: (pkg.guarantors?.guarantors ?? []).length > 0,
    isBorrowingBase: pkg.terms?.borrowingBaseLoan === true,
    isSba: pkg.terms?.sbaLoan === true,
    isActiveMonitored: pkg.identity?.loanStatus === 'active',
    boardApprovalRequired: pkg.creditApproval?.boardApprovalRequired === true,
  };
}

function isConditionMet(
  condition: DocumentRequirementCondition,
  ctx: PackageContext,
): boolean {
  switch (condition) {
    case 'always':
      return true;
    case 'when_collateral':
      return ctx.hasCollateral;
    case 'when_real_estate_collateral':
      return ctx.hasRealEstateCollateral;
    case 'when_collateral_requires_insurance':
      return ctx.collateralRequiresInsurance;
    case 'when_guarantors':
      return ctx.hasGuarantors;
    case 'when_borrowing_base':
      return ctx.isBorrowingBase;
    case 'when_sba':
      return ctx.isSba;
    case 'when_active_monitored':
      return ctx.isActiveMonitored;
    case 'when_board_approval_required':
      return ctx.boardApprovalRequired;
    case 'optional':
      return false;
  }
}

function isDocumentRequired(
  def: PortfolioDocumentDefinition,
  ctx: PackageContext,
): boolean {
  return isConditionMet(def.requiredWhen, ctx);
}

// ---------------------------------------------------------------------------
// Document receipt + staleness
// ---------------------------------------------------------------------------

function findReceivedDocument(
  pkg: PortfolioLoanBoardingPackage,
  documentType: PortfolioLoanDocumentType,
): PortfolioLoanDocumentRecord | undefined {
  return (pkg.documents?.documents ?? []).find(
    (d) =>
      d.documentType === documentType &&
      d.missing !== true &&
      (d.status === 'received' || isPresent(d.receivedDate)),
  );
}

function parseDate(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? undefined : ms;
}

/**
 * A received document is stale when its definition sets `staleAfterDays` and
 * it cannot be proven fresh: either its reference date is older than the
 * threshold, or it has no parseable reference date at all (fail-closed).
 */
function isDocumentStale(
  def: PortfolioDocumentDefinition,
  doc: PortfolioLoanDocumentRecord,
  now: Date,
): boolean {
  if (def.staleAfterDays === undefined) return false;
  const refMs =
    parseDate(doc.effectiveDate) ??
    parseDate(doc.periodEndDate) ??
    parseDate(doc.receivedDate);
  if (refMs === undefined) return true; // cannot prove freshness
  const ageDays = (now.getTime() - refMs) / MS_PER_DAY;
  return ageDays > def.staleAfterDays;
}

// ---------------------------------------------------------------------------
// Main deriver
// ---------------------------------------------------------------------------

export function derivePortfolioLoanBoardingCompleteness(
  input: BoardingCompletenessInput,
): BoardingCompletenessResult {
  const pkg = input.package;
  const now = input.now ?? new Date();
  const ctx = buildContext(pkg);

  // --- Field presence ----------------------------------------------------
  const missingFieldKeys = new Set<string>();
  const labelByKey = new Map<string, string>();
  for (const field of PORTFOLIO_LOAN_BOARDING_FIELDS) {
    labelByKey.set(field.key, field.label);
    if (!isPresent(getByPath(pkg, field.key))) missingFieldKeys.add(field.key);
  }

  const boardingRequired = fieldsRequiredForBoarding();
  const missingRequiredFields = boardingRequired
    .filter((f) => missingFieldKeys.has(f.key))
    .map((f) => f.key);
  const totalRequiredFields = boardingRequired.length;
  const completedRequiredFields = totalRequiredFields - missingRequiredFields.length;

  const allFieldsPresent = (defs: readonly BoardingFieldDefinition[]): boolean =>
    defs.every((f) => !missingFieldKeys.has(f.key));

  // --- Required documents (given context) --------------------------------
  const requiredDocs = PORTFOLIO_LOAN_DOCUMENTS.filter((d) =>
    isDocumentRequired(d, ctx),
  );
  const missingRequiredDocuments: PortfolioLoanDocumentType[] = [];
  let receivedRequiredDocuments = 0;
  for (const def of requiredDocs) {
    const received = findReceivedDocument(pkg, def.documentType);
    if (received) receivedRequiredDocuments += 1;
    else missingRequiredDocuments.push(def.documentType);
  }

  // --- Stale documents (any received doc whose definition tracks freshness)
  const staleSet = new Set<PortfolioLoanDocumentType>();
  for (const doc of pkg.documents?.documents ?? []) {
    if (doc.documentType === undefined) continue;
    if (doc.missing === true) continue;
    if (!(doc.status === 'received' || isPresent(doc.receivedDate))) continue;
    const def = getDocumentDefinition(doc.documentType);
    if (def && isDocumentStale(def, doc, now)) staleSet.add(doc.documentType);
  }
  const staleDocuments = [...staleSet];

  /** True only if a required doc is received AND not stale (fail-closed). */
  const docReadyForReview = (
    predicate: (d: PortfolioDocumentDefinition) => boolean,
  ): boolean =>
    requiredDocs
      .filter(predicate)
      .every(
        (def) =>
          findReceivedDocument(pkg, def.documentType) !== undefined &&
          !staleSet.has(def.documentType),
      );

  // --- Exceptions --------------------------------------------------------
  const openExceptions = (pkg.exceptions ?? []).filter(
    (e) => e.status !== 'cleared',
  );
  const exceptionCount = openExceptions.length;
  const highSeverityExceptionCount = openExceptions.filter(
    (e) => e.severity === 'high',
  ).length;

  // --- Readiness (all fail-closed) ---------------------------------------
  const fdicReady =
    allFieldsPresent(fieldsRequiredForFDICReview()) &&
    docReadyForReview((d) => d.requiredForFDICReview);

  const boardApprovalSatisfied =
    !ctx.boardApprovalRequired ||
    isPresent(pkg.creditApproval?.boardApprovalDate);

  const boardReady =
    allFieldsPresent(fieldsRequiredForBoardReporting()) &&
    docReadyForReview((d) => d.requiredForBoardReview) &&
    boardApprovalSatisfied;

  const annualReviewSatisfied =
    !ctx.isActiveMonitored ||
    (findReceivedDocument(pkg, 'annual_review') !== undefined &&
      !staleSet.has('annual_review'));

  const portfolioMonitoringReady =
    allFieldsPresent(fieldsRequiredForPortfolioMonitoring()) &&
    annualReviewSatisfied;

  // --- Blockers (human-readable) -----------------------------------------
  const blockers: string[] = [];

  // Missing fields across every required lens (deduped, labeled).
  const requiredFieldKeys = new Set<string>([
    ...fieldsRequiredForBoarding().map((f) => f.key),
    ...fieldsRequiredForFDICReview().map((f) => f.key),
    ...fieldsRequiredForBoardReporting().map((f) => f.key),
    ...fieldsRequiredForPortfolioMonitoring().map((f) => f.key),
  ]);
  for (const key of requiredFieldKeys) {
    if (missingFieldKeys.has(key)) {
      blockers.push(`Missing required field: ${labelByKey.get(key) ?? key}`);
    }
  }

  for (const documentType of missingRequiredDocuments) {
    const def = getDocumentDefinition(documentType);
    blockers.push(`Missing required document: ${def?.label ?? documentType}`);
  }
  for (const documentType of staleDocuments) {
    const def = getDocumentDefinition(documentType);
    blockers.push(`Stale document: ${def?.label ?? documentType}`);
  }

  if (ctx.boardApprovalRequired && !isPresent(pkg.creditApproval?.boardApprovalDate)) {
    blockers.push('Board approval date missing for a board-approval-required loan.');
  }

  // Guarantor financial info (PFS date) per guarantor.
  if (ctx.hasGuarantors) {
    (pkg.guarantors?.guarantors ?? []).forEach((g, i) => {
      if (!isPresent(g.personalFinancialStatementDate)) {
        blockers.push(
          `Guarantor financial statement date missing: ${g.guarantorName ?? `guarantor #${i + 1}`}`,
        );
      }
    });
  }

  if (highSeverityExceptionCount > 0) {
    blockers.push(`${highSeverityExceptionCount} high-severity exception(s) open.`);
  }

  return {
    totalRequiredFields,
    completedRequiredFields,
    missingRequiredFields,
    totalRequiredDocuments: requiredDocs.length,
    receivedRequiredDocuments,
    missingRequiredDocuments,
    staleDocuments,
    exceptionCount,
    highSeverityExceptionCount,
    fdicReady,
    boardReady,
    portfolioMonitoringReady,
    blockers,
  };
}
