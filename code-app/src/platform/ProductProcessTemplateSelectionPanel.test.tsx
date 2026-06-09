// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProductProcessTemplateSelectionPanel } from './ProductProcessTemplateSelectionPanel';
import { deriveProductProcessTemplateSelection } from './deriveProductProcessTemplateSelection';
import { deriveProductProcessRequirements } from './deriveProductProcessRequirements';
import { getProductProcessTemplate } from './productProcessTemplateRegistry';
import type { ProductProcessTemplateDerivationInput } from './productProcessTemplateTypes';

function build(input: ProductProcessTemplateDerivationInput) {
  const selection = deriveProductProcessTemplateSelection({ input });
  const templates = [selection.primaryTemplateKey, ...selection.companionTemplateKeys].filter(Boolean).map((k) => getProductProcessTemplate(k as string)!).filter(Boolean);
  const requirements = deriveProductProcessRequirements({ templates });
  return { selection, requirements };
}

describe('Phase 142D — template selection panel', () => {
  it('renders the selected primary + companion templates and workflow alignment', () => {
    const { selection, requirements } = build({ productFamily: 'commercial', creditCommitteeRequired: true });
    render(<ProductProcessTemplateSelectionPanel selection={selection} requirements={requirements} workflowRouteKey="small_business_standard" />);
    expect(screen.getByText('commercial_term_loan_template')).toBeInTheDocument();
    expect(screen.getByText(/credit_committee_package_template/)).toBeInTheDocument();
    expect(screen.getByText('small_business_standard')).toBeInTheDocument();
  });

  it('renders the missing-product blocker', () => {
    const { selection } = build({});
    render(<ProductProcessTemplateSelectionPanel selection={selection} />);
    expect(screen.getByText(/Missing product/i)).toBeInTheDocument();
  });

  it('has no apply / update / create controls and no fetch', () => {
    const { selection, requirements } = build({ productFamily: 'commercial', loanStructure: 'term_loan' });
    const { container } = render(<ProductProcessTemplateSelectionPanel selection={selection} requirements={requirements} />);
    expect(container.querySelectorAll('button').length).toBe(0);
    const text = (container.textContent ?? '').toLowerCase();
    for (const w of ['apply template', 'update deal', 'update route', 'create requirements', 'approve committee']) {
      expect(text).not.toContain(w);
    }
  });
});
