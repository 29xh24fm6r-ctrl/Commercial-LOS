// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PortfolioLoanBoardingDocumentUploadPanel } from './PortfolioLoanBoardingDocumentUploadPanel';

vi.mock('../shared/Card', () => ({
  Card: ({ children }: any) => <div data-testid="card">{children}</div>,
  CardHeader: ({ title, subtitle }: any) => <div data-testid="card-header"><span>{title}</span>{subtitle && <span>{subtitle}</span>}</div>,
  CardFooter: ({ children }: any) => <div data-testid="card-footer">{children}</div>,
}));

describe('Phase 140B-H — PortfolioLoanBoardingDocumentUploadPanel', () => {
  it('shows upload not configured when no adapter', () => {
    render(<PortfolioLoanBoardingDocumentUploadPanel />);
    expect(screen.getByText('Document upload not configured')).toBeInTheDocument();
  });

  it('shows upload adapter not configured subtitle', () => {
    render(<PortfolioLoanBoardingDocumentUploadPanel />);
    expect(screen.getByText(/Upload adapter not configured/)).toBeInTheDocument();
  });
});
