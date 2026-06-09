import { describe, it, expect } from 'vitest';
import { PRODUCT_PROCESS_TEMPLATE_REGISTRY, getProductProcessTemplate } from './productProcessTemplateRegistry';

/**
 * Phase 142D — product/process template registry pins.
 */

const EXPECTED_KEYS = [
  'sba_7a_standard_template', 'commercial_term_loan_template', 'commercial_real_estate_template',
  'working_capital_line_template', 'construction_project_template', 'annual_review_standard_template',
  'annual_review_covenant_exception_template', 'portfolio_boarded_loan_review_template',
  'fdic_exam_prep_template', 'credit_committee_package_template',
];

describe('Phase 142D — template registry', () => {
  it('includes all 10 templates', () => {
    expect(PRODUCT_PROCESS_TEMPLATE_REGISTRY).toHaveLength(10);
    for (const k of EXPECTED_KEYS) expect(getProductProcessTemplate(k)).toBeDefined();
  });

  it('every template has a workflow default and requirement arrays', () => {
    for (const t of PRODUCT_PROCESS_TEMPLATE_REGISTRY) {
      expect(t.workflowDefaults.routeKey.length).toBeGreaterThan(0);
      expect(Array.isArray(t.documentRequirements)).toBe(true);
      expect(Array.isArray(t.covenantTemplates)).toBe(true);
      expect(Array.isArray(t.evidenceRequirements)).toBe(true);
    }
  });

  it('annual review templates connect to the 141M-P package outputs', () => {
    const ar = getProductProcessTemplate('annual_review_standard_template')!;
    expect(ar.packageRequirements.map((p) => p.packageType)).toContain('annual_review_credit_memo');
    const cov = getProductProcessTemplate('annual_review_covenant_exception_template')!;
    expect(cov.workflowDefaults.routeKey).toBe('annual_review_with_covenant_exception');
  });

  it('the credit committee template carries no approval / voting action', () => {
    const cc = getProductProcessTemplate('credit_committee_package_template')!;
    expect(cc.approvalCheckpoints.every((c) => c.finalApproval === false)).toBe(true);
    expect(JSON.stringify(cc)).not.toMatch(/votingEnabled:\s*true|approveCredit|recordVote/i);
  });

  it('every template is a static governed template with no live product write', () => {
    for (const t of PRODUCT_PROCESS_TEMPLATE_REGISTRY) {
      expect(t.source).toBe('static_governed_template');
      expect(t.auditSummary.containsLiveProductWrite).toBe(false);
      expect(t.auditSummary.containsCreditDecision).toBe(false);
    }
  });

  it('carries no fake borrower / product data', () => {
    const s = JSON.stringify(PRODUCT_PROCESS_TEMPLATE_REGISTRY);
    expect(s).not.toMatch(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
    expect(s).not.toMatch(/\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/);
    expect(s).not.toMatch(/\$\s*\d/);
    expect(s).not.toMatch(/\bAcme\b|\bContoso\b|\bJohn\s+Smith\b/i);
  });
});
