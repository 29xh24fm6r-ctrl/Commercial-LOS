/**
 * Phase 142D — Product / process template SELECTION deriver.
 *
 * PURE, READ-ONLY. Selects a primary template (+ companions) from product /
 * loan-structure / annual-review / portfolio / committee / FDIC context. It
 * invents no product type, mutates no deal, alters no workflow route, and writes
 * nothing. Missing product/loan-structure yields review_required with candidates.
 */

import { PRODUCT_PROCESS_TEMPLATE_REGISTRY } from './productProcessTemplateRegistry';
import type { ProductProcessTemplate } from './productProcessTemplateTypes';
import type {
  ProductProcessTemplateDerivationInput,
  ProductProcessTemplateDerivationResult,
  ProductProcessTemplateBlocker,
  ProductProcessTemplateWarning,
} from './productProcessTemplateTypes';

function findLoanProductTemplate(input: ProductProcessTemplateDerivationInput): string | undefined {
  const fam = input.productFamily?.toLowerCase();
  const ls = input.loanStructure?.toLowerCase();
  if (fam === 'sba') return 'sba_7a_standard_template';
  if (fam === 'cre') return 'commercial_real_estate_template';
  if (fam === 'construction') return 'construction_project_template';
  if (fam === 'commercial' && ls === 'revolving_line') return 'working_capital_line_template';
  if (fam === 'commercial') return 'commercial_term_loan_template';
  return undefined;
}

export interface DeriveProductProcessTemplateSelectionInput {
  input: ProductProcessTemplateDerivationInput;
  templates?: readonly ProductProcessTemplate[];
}

export function deriveProductProcessTemplateSelection(
  args: DeriveProductProcessTemplateSelectionInput,
): ProductProcessTemplateDerivationResult {
  const { input } = args;
  const templates = args.templates ?? PRODUCT_PROCESS_TEMPLATE_REGISTRY;
  const known = new Set(templates.map((t) => t.templateKey));
  const blockers: ProductProcessTemplateBlocker[] = [];
  const warnings: ProductProcessTemplateWarning[] = [];

  let primaryTemplateKey: string | undefined;
  if (input.annualReviewId) {
    primaryTemplateKey = input.covenantStatus === 'breach' || input.covenantStatus === 'review_required'
      ? 'annual_review_covenant_exception_template'
      : 'annual_review_standard_template';
  } else if (input.portfolioBoardingStatus === 'boarded') {
    primaryTemplateKey = 'portfolio_boarded_loan_review_template';
  } else {
    primaryTemplateKey = findLoanProductTemplate(input);
  }

  const companionTemplateKeys: string[] = [];
  if (input.fdicPackageRequired) companionTemplateKeys.push('fdic_exam_prep_template');
  if (input.creditCommitteeRequired) companionTemplateKeys.push('credit_committee_package_template');

  if (primaryTemplateKey && !known.has(primaryTemplateKey)) primaryTemplateKey = undefined;
  const companions = companionTemplateKeys.filter((k) => known.has(k));

  if (!primaryTemplateKey) {
    return {
      primaryTemplateKey: undefined,
      companionTemplateKeys: companions,
      candidateTemplateKeys: templates.filter((t) => t.templateType === 'loan_product' || t.templateType === 'loan_structure').map((t) => t.templateKey),
      confidence: 'low',
      status: 'review_required',
      blockers: [{ code: 'missing_product', message: 'Missing product / loan structure; choose a candidate template.' }],
      warnings,
      nextBestActions: [{ code: 'select_product', label: 'Confirm the product / loan structure to select a template.' }],
      readOnly: true,
    };
  }

  if (input.covenantStatus === 'breach' || input.covenantStatus === 'review_required') {
    warnings.push({ code: 'covenant_exception', message: 'Covenant exception present; routed to the covenant-exception template (no waiver).' });
  }

  return {
    primaryTemplateKey,
    companionTemplateKeys: companions,
    candidateTemplateKeys: [primaryTemplateKey, ...companions],
    confidence: 'high',
    status: 'active_template',
    blockers,
    warnings,
    nextBestActions: [{ code: 'review_template_requirements', label: 'Review the template requirements and workflow alignment (read-only).' }],
    readOnly: true,
  };
}
