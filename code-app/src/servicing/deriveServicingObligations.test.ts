import { describe, it, expect } from 'vitest';
import { deriveServicingObligations } from './deriveServicingObligations';
import { getProductProcessTemplate } from '../platform/productProcessTemplateRegistry';

/**
 * Phase 142E — servicing obligation pins.
 */

describe('Phase 142E — servicing obligations', () => {
  it('derives an annual review obligation', () => {
    const o = deriveServicingObligations({ annualReviewDueStatus: 'due' });
    expect(o.some((x) => x.category === 'annual_review' && x.status === 'due_soon')).toBe(true);
  });

  it('derives covenant compliance obligations from real covenant results', () => {
    const o = deriveServicingObligations({ covenantResults: [{ covenantId: 'C1', status: 'pass' }, { covenantId: 'C2', status: 'fail' }] });
    expect(o.some((x) => x.category === 'covenant_compliance' && x.status === 'satisfied')).toBe(true);
    expect(o.some((x) => x.category === 'covenant_compliance' && x.status === 'review_required')).toBe(true);
  });

  it('derives an insurance renewal obligation', () => {
    const o = deriveServicingObligations({ insuranceStatus: 'current' });
    expect(o.some((x) => x.category === 'insurance_renewal' && x.status === 'satisfied')).toBe(true);
  });

  it('marks missing evidence as missing_evidence', () => {
    const o = deriveServicingObligations({ liveDocuments: [{ documentType: 'tax_returns', required: true, accepted: false }] });
    expect(o.some((x) => x.category === 'tax_return_delivery' && x.status === 'missing_evidence')).toBe(true);
  });

  it('marks overdue based on the clock', () => {
    const o = deriveServicingObligations({ liveDocuments: [{ documentType: 'annual_financial_statements', required: true, accepted: false, dueDate: '2020-01-01' }], asOfDate: '2026-06-09' });
    expect(o.some((x) => x.status === 'overdue')).toBe(true);
  });

  it('marks a template-only requirement as guidance', () => {
    const sba = getProductProcessTemplate('sba_7a_standard_template')!;
    const o = deriveServicingObligations({ templates: [sba] });
    const guidance = o.filter((x) => x.source === 'template_guidance');
    expect(guidance.length).toBeGreaterThan(0);
    expect(guidance.every((x) => x.status === 'review_required')).toBe(true);
  });

  it('creates no tasks / outreach / writes', () => {
    const o = deriveServicingObligations({ annualReviewDueStatus: 'due' });
    expect(JSON.stringify(o)).not.toMatch(/createTask|sendEmail|createRecord|mailto:/);
  });
});
