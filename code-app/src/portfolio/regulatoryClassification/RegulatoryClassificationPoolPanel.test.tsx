// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';

import { RegulatoryClassificationPoolPanel } from './RegulatoryClassificationPoolPanel';
import { deriveRegulatoryClassificationSnapshot } from './regulatoryClassification';
import { deriveDualRiskRating, type DualRatingRecord } from '../riskRating/dualRiskRating';

/**
 * Phase 264 (P3) — RegulatoryClassificationPoolPanel render tests.
 */

function rate(over: Parameters<typeof deriveDualRiskRating>[0]): DualRatingRecord {
  const out = deriveDualRiskRating(over);
  if (out.kind !== 'rated') throw new Error('expected a rated outcome');
  return out.record;
}

describe('Phase 264 (P3) — RegulatoryClassificationPoolPanel empty state', () => {
  it('shows an honest empty state, never a zeroed table, when there are no boarded loans', () => {
    const snapshot = deriveRegulatoryClassificationSnapshot([]);
    render(<RegulatoryClassificationPoolPanel snapshot={snapshot} />);
    const panel = screen.getByLabelText('Regulatory classification pooling');
    expect(panel).toHaveAttribute('data-regulatory-classification-pool', 'empty');
    expect(screen.getByText(/no boarded loans available to classify/i)).toBeInTheDocument();
    expect(panel.querySelector('table')).toBeNull();
  });
});

describe('Phase 264 (P3) — RegulatoryClassificationPoolPanel populated state', () => {
  const passRating = rate({ effectiveDate: '2026-01-01', obligorGrade: 2 });
  const subRating = rate({ effectiveDate: '2026-01-01', obligorGrade: 6 });

  const snapshot = deriveRegulatoryClassificationSnapshot([
    { loanId: 'A', borrowerName: 'Acme Co', exposure: 1_000_000, rating: passRating },
    { loanId: 'B', borrowerName: 'Beta Inc', exposure: 500_000, rating: subRating },
  ]);

  it('renders all 5 pools with correct labels and loan counts', () => {
    render(<RegulatoryClassificationPoolPanel snapshot={snapshot} />);
    const panel = screen.getByLabelText('Regulatory classification pooling');
    expect(panel).toHaveAttribute('data-regulatory-classification-pool', 'ready');

    for (const classification of ['Pass', 'Special Mention', 'Substandard', 'Doubtful', 'Loss']) {
      expect(panel.querySelector(`[data-classification-pool="${classification}"]`)).not.toBeNull();
    }

    const passRow = panel.querySelector('[data-classification-pool="Pass"]')!;
    expect(passRow.textContent).toContain('1');
    const subRow = panel.querySelector('[data-classification-pool="Substandard"]')!;
    expect(subRow.textContent).toContain('1');
  });

  it('renders the portfolio summary footer with totals and coverage ratio', () => {
    render(<RegulatoryClassificationPoolPanel snapshot={snapshot} />);
    expect(screen.getByText(/Total exposure:/i)).toBeInTheDocument();
    expect(screen.getByText(/Total estimated allowance:/i)).toBeInTheDocument();
    expect(screen.getByText(/Allowance coverage ratio:/i)).toBeInTheDocument();
    expect(screen.getByText(/Criticized exposure:/i)).toBeInTheDocument();
    expect(screen.getByText(/Classified exposure:/i)).toBeInTheDocument();
  });

  it('renders the non-regulatory disclaimer banner', () => {
    render(<RegulatoryClassificationPoolPanel snapshot={snapshot} />);
    expect(
      screen.getByText(/NOT a certified CECL\/ALLL calculation/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/no macro overlay/i)).toBeInTheDocument();
  });

  it('shows an "not available" allowance coverage ratio honestly when totalExposure is 0', () => {
    const zeroExposureSnapshot = deriveRegulatoryClassificationSnapshot([
      { loanId: 'zero', borrowerName: 'Zero Co', exposure: 0, rating: passRating },
    ]);
    render(<RegulatoryClassificationPoolPanel snapshot={zeroExposureSnapshot} />);
    // exposure: 0 is excluded, so this renders the empty state, not a fabricated ratio.
    const panel = screen.getByLabelText('Regulatory classification pooling');
    expect(panel).toHaveAttribute('data-regulatory-classification-pool', 'empty');
    expect(screen.getByText(/1 loan excluded/i)).toBeInTheDocument();
  });
});

describe('Phase 264 (P3) — RegulatoryClassificationPoolPanel renders no write affordances', () => {
  const src = readFileSync(resolve(__dirname, 'RegulatoryClassificationPoolPanel.tsx'), 'utf8');

  it('never renders a <button> or <form> in source', () => {
    expect(src).not.toMatch(/<button\b/i);
    expect(src).not.toMatch(/<form\b/i);
  });

  it('never renders a <button> or <form> in the DOM for the populated state', () => {
    const passRating = rate({ effectiveDate: '2026-01-01', obligorGrade: 2 });
    const snapshot = deriveRegulatoryClassificationSnapshot([
      { loanId: 'A', borrowerName: 'Acme Co', exposure: 1_000_000, rating: passRating },
    ]);
    render(<RegulatoryClassificationPoolPanel snapshot={snapshot} />);
    const panel = screen.getByLabelText('Regulatory classification pooling');
    expect(panel.querySelector('button')).toBeNull();
    expect(panel.querySelector('form')).toBeNull();
  });
});
