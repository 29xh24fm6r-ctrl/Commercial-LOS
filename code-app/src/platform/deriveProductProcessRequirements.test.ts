import { describe, it, expect } from 'vitest';
import { deriveProductProcessRequirements } from './deriveProductProcessRequirements';
import { getProductProcessTemplate } from './productProcessTemplateRegistry';

/**
 * Phase 142D — requirement merge pins.
 */

const sba = getProductProcessTemplate('sba_7a_standard_template')!;
const cre = getProductProcessTemplate('commercial_real_estate_template')!;

describe('Phase 142D — requirement merge', () => {
  it('merges two templates without duplicate documents', () => {
    const r = deriveProductProcessRequirements({ templates: [sba, cre] });
    const types = r.mergedDocumentRequirements.map((d) => d.documentType);
    // annual_financial_statements appears in both → single merged entry.
    expect(types.filter((t) => t === 'annual_financial_statements')).toHaveLength(1);
  });

  it('preserves source template keys', () => {
    const r = deriveProductProcessRequirements({ templates: [sba, cre] });
    const afs = r.mergedDocumentRequirements.find((d) => d.documentType === 'annual_financial_statements')!;
    expect(afs.sourceTemplateKeys.length).toBeGreaterThanOrEqual(2);
  });

  it('live / evidence requirements outrank the generic template', () => {
    const r = deriveProductProcessRequirements({ templates: [sba], liveDocumentRequirements: [{ documentType: 'tax_returns', required: true, accepted: true }] });
    const tr = r.mergedDocumentRequirements.find((d) => d.documentType === 'tax_returns')!;
    expect(tr.source).toBe('live');
    expect(tr.satisfied).toBe(true);
  });

  it('a missing required document becomes a blocker', () => {
    const r = deriveProductProcessRequirements({ templates: [sba], liveDocumentRequirements: [{ documentType: 'tax_returns', required: true, accepted: false }] });
    expect(r.blockers.some((b) => b.code === 'missing_required_document')).toBe(true);
  });

  it('creates no documents / tasks and fabricates no evidence', () => {
    const r = deriveProductProcessRequirements({ templates: [sba, cre] });
    expect(r.auditSummary.containsFakeEvidence).toBe(false);
    expect(JSON.stringify(r)).not.toMatch(/createRecord|createTask|createDocument/);
  });
});
