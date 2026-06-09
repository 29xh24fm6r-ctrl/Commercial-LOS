/**
 * Phase 142D — Product / process template READINESS deriver.
 *
 * PURE, READ-ONLY. Combines the template selection + merged requirements (+
 * optional package readiness) into a template readiness status. Missing product
 * blocks exact readiness; missing requirements block; package caveats produce
 * ready-with-caveats; a committee route requires package/evidence readiness. No
 * approval language, no final decision state.
 */

import type {
  ProductProcessTemplateDerivationResult,
  ProductProcessTemplateStatus,
  ProductProcessTemplateBlocker,
  ProductProcessTemplateWarning,
} from './productProcessTemplateTypes';
import type { ProductProcessRequirementsResult } from './deriveProductProcessRequirements';

export type ProductProcessTemplateReadinessStatus =
  | 'template_ready'
  | 'template_ready_with_caveats'
  | 'template_review_required'
  | 'template_blocked_missing_product'
  | 'template_blocked_missing_requirements'
  | 'template_disabled_not_configured';

export interface DeriveProductProcessTemplateReadinessInput {
  selection: ProductProcessTemplateDerivationResult;
  requirements: ProductProcessRequirementsResult;
  packageReadiness?: 'review_ready' | 'draft_ready_with_caveats' | 'blocked' | 'unknown';
  creditCommitteeRequired?: boolean;
}

export interface ProductProcessTemplateReadinessResult {
  readinessStatus: ProductProcessTemplateReadinessStatus;
  templateStatus: ProductProcessTemplateStatus;
  blockers: readonly ProductProcessTemplateBlocker[];
  warnings: readonly ProductProcessTemplateWarning[];
  nextBestActions: readonly { code: string; label: string }[];
  auditSummary: { primaryTemplateKey?: string; containsCreditDecision: false; readOnly: true };
}

export function deriveProductProcessTemplateReadiness(
  args: DeriveProductProcessTemplateReadinessInput,
): ProductProcessTemplateReadinessResult {
  const { selection, requirements } = args;
  const blockers: ProductProcessTemplateBlocker[] = [...selection.blockers, ...requirements.blockers];
  const warnings: ProductProcessTemplateWarning[] = [...selection.warnings];

  const committeeNotReady = args.creditCommitteeRequired === true && (args.packageReadiness === 'blocked' || args.packageReadiness === 'unknown');

  let readinessStatus: ProductProcessTemplateReadinessStatus;
  if (!selection.primaryTemplateKey) readinessStatus = 'template_blocked_missing_product';
  else if (requirements.blockers.length > 0 || committeeNotReady) readinessStatus = 'template_blocked_missing_requirements';
  else if (args.packageReadiness === 'draft_ready_with_caveats' || selection.warnings.length > 0) readinessStatus = 'template_ready_with_caveats';
  else readinessStatus = 'template_ready';

  if (committeeNotReady) blockers.push({ code: 'committee_materials_missing', message: 'Credit committee route requires package/evidence readiness.' });

  const nextBestActions: { code: string; label: string }[] = [];
  if (readinessStatus === 'template_blocked_missing_product') nextBestActions.push({ code: 'select_product', label: 'Confirm the product / loan structure.' });
  else if (readinessStatus === 'template_blocked_missing_requirements') nextBestActions.push({ code: 'complete_requirements', label: 'Complete the missing required documents / evidence.' });
  else if (readinessStatus === 'template_ready_with_caveats') nextBestActions.push({ code: 'review_caveats', label: 'Review the template caveats before proceeding.' });
  else nextBestActions.push({ code: 'proceed_template', label: 'Proceed with the template-guided workflow (read-only).' });

  return {
    readinessStatus,
    templateStatus: selection.status,
    blockers,
    warnings,
    nextBestActions,
    auditSummary: { primaryTemplateKey: selection.primaryTemplateKey, containsCreditDecision: false, readOnly: true },
  };
}
