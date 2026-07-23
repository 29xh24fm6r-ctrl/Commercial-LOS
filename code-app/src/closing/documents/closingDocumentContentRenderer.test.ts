import { describe, it, expect } from 'vitest';
import { hashClosingDocumentContent, renderClosingDocumentContent } from './closingDocumentContentRenderer';
import { findClosingDocumentTemplate } from './closingDocumentTemplateRegistry';

describe('renderClosingDocumentContent', () => {
  it('includes only the facts actually supplied — never a fabricated field', () => {
    const template = findClosingDocumentTemplate('closing_checklist')!;
    const content = renderClosingDocumentContent(template, { dealName: 'Acme Expansion' });
    expect(content).toContain('Closing Checklist (template v1.0.0)');
    expect(content).toContain('Acme Expansion');
    expect(content).not.toMatch(/Borrower:|Product:|Jurisdiction:/);
  });

  it('falls back to dealId when dealName is absent', () => {
    const template = findClosingDocumentTemplate('closing_checklist')!;
    const content = renderClosingDocumentContent(template, { dealId: 'deal-1' });
    expect(content).toContain('Deal: deal-1');
  });

  it('renders a false conditionsPrecedentResolved honestly (not omitted as if false meant absent)', () => {
    const template = findClosingDocumentTemplate('conditions_precedent_certification')!;
    const content = renderClosingDocumentContent(template, { conditionsPrecedentResolved: false });
    expect(content).toContain('Conditions precedent resolved: No');
  });
});

describe('hashClosingDocumentContent', () => {
  it('is deterministic for identical content', () => {
    expect(hashClosingDocumentContent('abc')).toBe(hashClosingDocumentContent('abc'));
  });

  it('differs for different content', () => {
    expect(hashClosingDocumentContent('abc')).not.toBe(hashClosingDocumentContent('abd'));
  });

  it('is always an 8-character lowercase hex string', () => {
    expect(hashClosingDocumentContent('')).toMatch(/^[0-9a-f]{8}$/);
    expect(hashClosingDocumentContent('x'.repeat(500))).toMatch(/^[0-9a-f]{8}$/);
  });
});
