import { describe, it, expect } from 'vitest';
import { deriveProductProcessTemplateReadiness } from './deriveProductProcessTemplateReadiness';
import { deriveProductProcessTemplateSelection } from './deriveProductProcessTemplateSelection';
import { deriveProductProcessRequirements } from './deriveProductProcessRequirements';
import { getProductProcessTemplate } from './productProcessTemplateRegistry';
import type { ProductProcessTemplateDerivationInput } from './productProcessTemplateTypes';
import type { LiveDocumentRequirement } from './deriveProductProcessRequirements';

function readiness(input: ProductProcessTemplateDerivationInput, live: LiveDocumentRequirement[] = [], opts: { packageReadiness?: 'review_ready' | 'draft_ready_with_caveats' | 'blocked' | 'unknown'; creditCommitteeRequired?: boolean } = {}) {
  const selection = deriveProductProcessTemplateSelection({ input });
  const templates = [selection.primaryTemplateKey, ...selection.companionTemplateKeys].filter(Boolean).map((k) => getProductProcessTemplate(k as string)!).filter(Boolean);
  const requirements = deriveProductProcessRequirements({ templates, liveDocumentRequirements: live });
  return deriveProductProcessTemplateReadiness({ selection, requirements, ...opts });
}

describe('Phase 142D — template readiness', () => {
  it('ready when exact template and requirements complete', () => {
    const r = readiness({ productFamily: 'commercial', loanStructure: 'term_loan' }, [{ documentType: 'annual_financial_statements', required: true, accepted: true }]);
    expect(r.readinessStatus).toBe('template_ready');
  });

  it('review_required when the product is ambiguous', () => {
    expect(readiness({}).readinessStatus).toBe('template_blocked_missing_product');
  });

  it('blocked when required requirements are missing', () => {
    const r = readiness({ productFamily: 'commercial', loanStructure: 'term_loan' }, [{ documentType: 'annual_financial_statements', required: true, accepted: false }]);
    expect(r.readinessStatus).toBe('template_blocked_missing_requirements');
  });

  it('ready_with_caveats for package caveats', () => {
    const r = readiness({ productFamily: 'commercial', loanStructure: 'term_loan' }, [], { packageReadiness: 'draft_ready_with_caveats' });
    expect(r.readinessStatus).toBe('template_ready_with_caveats');
  });

  it('blocks committee readiness when package/evidence is missing', () => {
    const r = readiness({ productFamily: 'commercial', creditCommitteeRequired: true }, [], { creditCommitteeRequired: true, packageReadiness: 'blocked' });
    expect(r.readinessStatus).toBe('template_blocked_missing_requirements');
  });

  it('uses no approval language', () => {
    const r = readiness({ productFamily: 'commercial', loanStructure: 'term_loan' }, [{ documentType: 'annual_financial_statements', required: true, accepted: true }]);
    expect(JSON.stringify(r)).not.toMatch(/\bapprove\b|\bdecline\b|recommend approval/i);
  });
});
