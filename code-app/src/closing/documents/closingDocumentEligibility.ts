import type {
  ClosingDocumentEligibility,
  ClosingDocumentFactKey,
  ClosingDocumentFactModel,
  ClosingDocumentTemplate,
} from './closingDocumentTypes';
import { CLOSING_DOCUMENT_TEMPLATES } from './closingDocumentTemplateRegistry';

function hasFact(facts: ClosingDocumentFactModel, key: ClosingDocumentFactKey): boolean {
  const value = facts[key];
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true; // number/boolean present is present
}

/** Pure: which required facts (if any) are missing for this template, given known facts. */
export function findMissingFacts(
  template: ClosingDocumentTemplate,
  facts: ClosingDocumentFactModel,
): readonly ClosingDocumentFactKey[] {
  return template.requiredFacts.filter((key) => !hasFact(facts, key));
}

/**
 * Evaluate one template's eligibility for generation against known facts. Checks, in order:
 * approval, product applicability, jurisdiction applicability, required-fact completeness. The
 * first failing check wins — a template that is both wrong-product AND missing facts reports
 * wrong-product (fixing the product mismatch is the more fundamental blocker; the facts check
 * would need to be redone anyway once the product context changes).
 */
export function evaluateTemplateEligibility(
  template: ClosingDocumentTemplate,
  facts: ClosingDocumentFactModel,
): ClosingDocumentEligibility {
  if (!template.approved) return { kind: 'not_approved', template };

  if (template.applicableProducts && template.applicableProducts.length > 0) {
    if (!facts.product || !template.applicableProducts.includes(facts.product)) {
      return { kind: 'wrong_product', template, product: facts.product };
    }
  }

  if (template.applicableJurisdictions && template.applicableJurisdictions.length > 0) {
    if (!facts.jurisdiction || !template.applicableJurisdictions.includes(facts.jurisdiction)) {
      return { kind: 'wrong_jurisdiction', template, jurisdiction: facts.jurisdiction };
    }
  }

  const missingFacts = findMissingFacts(template, facts);
  if (missingFacts.length > 0) return { kind: 'missing_facts', template, missingFacts };

  return { kind: 'eligible', template };
}

/** Evaluate every template in the registry (or a supplied subset) against known facts. */
export function evaluateAllTemplates(
  facts: ClosingDocumentFactModel,
  templates: readonly ClosingDocumentTemplate[] = CLOSING_DOCUMENT_TEMPLATES,
): readonly ClosingDocumentEligibility[] {
  return templates.map((t) => evaluateTemplateEligibility(t, facts));
}
