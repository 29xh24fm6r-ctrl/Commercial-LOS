// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PortfolioLoanBoardingPreview } from './PortfolioLoanBoardingPreview';
import { createEmptyPortfolioLoanBoardingPackage } from '../shared/portfolioBoarding/portfolioLoanBoardingTypes';

vi.mock('../shared/Card', () => ({
  Card: ({ children }: any) => <div data-testid="card">{children}</div>,
  CardHeader: ({ title, subtitle, trailing }: any) => <div data-testid="card-header"><span>{title}</span>{subtitle && <span>{subtitle}</span>}{trailing}</div>,
  CardFooter: ({ children }: any) => <div data-testid="card-footer">{children}</div>,
}));

vi.mock('./PortfolioLoanBoardingReadOnlySections', () => ({
  PortfolioLoanBoardingReadOnlySections: () => <div data-testid="readonly-sections" />,
}));
vi.mock('./PortfolioLoanBoardingReadinessPanel', () => ({
  PortfolioLoanBoardingReadinessPanel: () => <div data-testid="readiness-panel" />,
}));
vi.mock('./PortfolioLoanBoardingDocumentInventory', () => ({
  PortfolioLoanBoardingDocumentInventory: () => <div data-testid="doc-inventory" />,
}));
vi.mock('./PortfolioLoanBoardingEvidencePanel', () => ({
  PortfolioLoanBoardingEvidencePanel: () => <div data-testid="evidence-panel" />,
}));

describe('Phase 140B-H — PortfolioLoanBoardingPreview', () => {
  it('renders honest empty state for empty package', () => {
    const pkg = createEmptyPortfolioLoanBoardingPackage();
    render(<PortfolioLoanBoardingPreview package={pkg} />);
    expect(screen.getByText('Loan name not set')).toBeInTheDocument();
    expect(screen.getByText('Borrower not set')).toBeInTheDocument();
  });

  it('renders loan name when populated', () => {
    const pkg = createEmptyPortfolioLoanBoardingPackage();
    pkg.identity.dealName = 'Test Loan';
    pkg.identity.borrowerLegalName = 'Test Borrower';
    render(<PortfolioLoanBoardingPreview package={pkg} />);
    expect(screen.getByText('Test Loan')).toBeInTheDocument();
    expect(screen.getByText('Test Borrower')).toBeInTheDocument();
  });

  it('renders read-only footer', () => {
    const pkg = createEmptyPortfolioLoanBoardingPackage();
    render(<PortfolioLoanBoardingPreview package={pkg} />);
    expect(screen.getByText(/Read-only preview/)).toBeInTheDocument();
  });

  it('renders source badge', () => {
    const pkg = createEmptyPortfolioLoanBoardingPackage();
    pkg.source = 'manual_boarding';
    render(<PortfolioLoanBoardingPreview package={pkg} />);
    expect(screen.getByText('Manual boarding')).toBeInTheDocument();
  });
});
