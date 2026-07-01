// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { RiskRatingCard } from './RiskRatingCard';
import { PortfolioClassificationPanel } from './PortfolioClassificationPanel';
import { deriveDualRiskRating, type DualRatingRecord } from './dualRiskRating';

function rate(over: Parameters<typeof deriveDualRiskRating>[0]): DualRatingRecord {
  const out = deriveDualRiskRating(over);
  if (out.kind !== 'rated') throw new Error('rated');
  return out.record;
}

describe('RiskRatingCard', () => {
  it('shows honest absence when there is no rating', () => {
    render(<RiskRatingCard />);
    const card = screen.getByLabelText('Risk rating');
    expect(card).toHaveAttribute('data-risk-rating', 'unavailable');
    expect(within(card).getByText(/No dual risk rating yet/i)).toBeInTheDocument();
  });

  it('renders obligor/facility/blended grades, classification, and a downgrade migration', () => {
    const prior = rate({ effectiveDate: '2026-01-01', obligorGrade: 3 });
    const r = rate({
      effectiveDate: '2026-06-30',
      obligorGrade: 6,
      facility: { collateralValue: 500_000, exposure: 1_000_000 },
      drivers: ['DSCR < 1.0x'],
      prior,
    });
    render(<RiskRatingCard rating={r} />);
    const card = screen.getByLabelText('Risk rating');
    expect(card).toHaveAttribute('data-risk-rating', 'Substandard');
    expect(card.querySelector('[data-risk-classification="Substandard"]')).not.toBeNull();
    expect(card.querySelector('[data-risk-migration="downgrade"]')).not.toBeNull();
    expect(within(card).getByText('DSCR < 1.0x')).toBeInTheDocument();
  });

  it('shows the override justification when the grade was overridden', () => {
    const r = rate({
      effectiveDate: '2026-06-30',
      obligorGrade: 4,
      override: { blendedGrade: 2, justification: 'Full cash collateral securing the facility.' },
    });
    render(<RiskRatingCard rating={r} />);
    const card = screen.getByLabelText('Risk rating');
    expect(card.querySelector('[data-risk-override]')).not.toBeNull();
    expect(within(card).getByText(/Full cash collateral/i)).toBeInTheDocument();
  });
});

describe('PortfolioClassificationPanel', () => {
  it('shows guidance when there are no ratings', () => {
    render(<PortfolioClassificationPanel ratings={[]} />);
    const panel = screen.getByLabelText('Regulatory classification');
    expect(panel).toHaveAttribute('data-portfolio-classification', 'empty');
  });

  it('renders the distribution + criticized/classified totals', () => {
    const ratings = [
      rate({ effectiveDate: '2026-06-30', obligorGrade: 3 }),
      rate({ effectiveDate: '2026-06-30', obligorGrade: 5 }),
      rate({ effectiveDate: '2026-06-30', obligorGrade: 6 }),
    ];
    render(<PortfolioClassificationPanel ratings={ratings} />);
    const panel = screen.getByLabelText('Regulatory classification');
    expect(panel).toHaveAttribute('data-portfolio-classification', 'ready');
    expect(panel.querySelector('[data-classification-bucket="Substandard"]')).not.toBeNull();
    // criticized = grades 5 & 6 = 2
    expect(within(panel.querySelector('[data-classification-hero="Criticized (≥5)"]') as HTMLElement).getByText('2')).toBeInTheDocument();
  });
});
