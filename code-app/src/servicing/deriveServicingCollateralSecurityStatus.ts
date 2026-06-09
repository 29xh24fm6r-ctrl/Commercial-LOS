/**
 * Phase 142E — Servicing COLLATERAL / SECURITY status deriver.
 *
 * PURE, READ-ONLY. Reports collateral/security coverage from evidence-backed
 * collateral context. It values no collateral and computes no LTV unless value
 * facts exist; missing collateral docs stay missing; exceptions are findings,
 * never waivers/approvals.
 */

import type {
  ServicingCollateralSecurityStatus,
  ServicingCollateralStatusValue,
  ServicingLifecycleBlocker,
  ServicingLifecycleWarning,
} from './servicingLifecycleTypes';

export interface ServicingCollateralItemContext {
  collateralId: string;
  type?: string;
  perfected?: boolean;
  hasEvidence?: boolean;
}

export interface DeriveServicingCollateralSecurityStatusInput {
  collateralItems?: readonly ServicingCollateralItemContext[];
  requiresCollateral?: boolean;
  evidenceDocumentIds?: readonly string[];
}

export function deriveServicingCollateralSecurityStatus(
  input: DeriveServicingCollateralSecurityStatusInput,
): ServicingCollateralSecurityStatus {
  const blockers: ServicingLifecycleBlocker[] = [];
  const warnings: ServicingLifecycleWarning[] = [];
  const items = input.collateralItems;

  if (items === undefined) {
    return { status: 'unknown_missing_data', collateralItems: [], evidenceCoverage: 0, missingEvidence: [], exceptions: [], blockers, warnings, nextBestAction: { code: 'gather_collateral', label: 'Gather collateral / security context.' } };
  }
  if (items.length === 0) {
    const status: ServicingCollateralStatusValue = input.requiresCollateral ? 'unknown_missing_data' : 'not_applicable';
    return { status, collateralItems: [], evidenceCoverage: 0, missingEvidence: [], exceptions: [], blockers, warnings, nextBestAction: { code: 'review_collateral', label: 'Review collateral applicability.' } };
  }

  const missingEvidence = items.filter((i) => i.hasEvidence !== true).map((i) => i.collateralId);
  const exceptions = items.filter((i) => i.perfected === false).map((i) => i.collateralId);
  const evidenceCoverage = (items.length - missingEvidence.length) / items.length;

  let status: ServicingCollateralStatusValue;
  if (missingEvidence.length > 0) {
    status = 'missing_evidence';
    blockers.push({ code: 'missing_collateral_evidence', message: `${missingEvidence.length} collateral item(s) lack evidence.` });
  } else if (exceptions.length > 0) {
    status = 'exception_active';
    warnings.push({ code: 'unperfected_collateral', message: `${exceptions.length} collateral item(s) are not perfected (finding).` });
  } else {
    status = 'complete';
  }

  return {
    status,
    collateralItems: items.map((i) => ({ collateralId: i.collateralId, type: i.type, perfected: i.perfected })),
    evidenceCoverage,
    missingEvidence,
    exceptions,
    blockers,
    warnings,
    nextBestAction: status === 'complete'
      ? { code: 'monitor_collateral', label: 'Continue collateral monitoring (read-only).' }
      : { code: 'resolve_collateral', label: 'Resolve missing collateral evidence / perfection findings.' },
  };
}
