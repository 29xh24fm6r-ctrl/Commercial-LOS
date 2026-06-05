// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PortfolioLoanBoardingEditor } from './PortfolioLoanBoardingEditor';
import { createEmptyPortfolioLoanBoardingPackage } from '../shared/portfolioBoarding/portfolioLoanBoardingTypes';

vi.mock('../shared/Card', () => ({
  Card: ({ children }: any) => <div data-testid="card">{children}</div>,
  CardHeader: ({ title, subtitle }: any) => <div data-testid="card-header"><span>{title}</span>{subtitle && <span>{subtitle}</span>}</div>,
  CardFooter: ({ children }: any) => <div data-testid="card-footer">{children}</div>,
}));

describe('Phase 140B-H — PortfolioLoanBoardingEditor', () => {
  it('shows adapter-not-configured when no write adapter', () => {
    const pkg = createEmptyPortfolioLoanBoardingPackage();
    render(<PortfolioLoanBoardingEditor package={pkg} />);
    const matches = screen.getAllByText(/Save adapter not configured/);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('shows section navigation', () => {
    const pkg = createEmptyPortfolioLoanBoardingPackage();
    render(<PortfolioLoanBoardingEditor package={pkg} />);
    // Section buttons render the labels
    const identityMatches = screen.getAllByText('Loan Identity');
    expect(identityMatches.length).toBeGreaterThanOrEqual(1);
    const borrowerMatches = screen.getAllByText('Borrower Profile');
    expect(borrowerMatches.length).toBeGreaterThanOrEqual(1);
  });

  it('shows readiness flags', () => {
    const pkg = createEmptyPortfolioLoanBoardingPackage();
    render(<PortfolioLoanBoardingEditor package={pkg} />);
    expect(screen.getByText('FDIC')).toBeInTheDocument();
    expect(screen.getByText('Board')).toBeInTheDocument();
    expect(screen.getByText('Portfolio')).toBeInTheDocument();
  });

  it('says read-only when adapter not configured', () => {
    const pkg = createEmptyPortfolioLoanBoardingPackage();
    render(<PortfolioLoanBoardingEditor package={pkg} />);
    expect(screen.getByText(/Save adapter not configured. Read-only mode/)).toBeInTheDocument();
  });
});
