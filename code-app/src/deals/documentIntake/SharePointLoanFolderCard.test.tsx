// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SharePointLoanFolderCard } from './SharePointLoanFolderCard';
import type { DealSharePointFolderIdentity } from '../documentStorage/dealDocumentStorageTypes';

const folder: DealSharePointFolderIdentity = { dealId: 'd1', borrowerIdentity: 'b1', siteUrl: 'https://sp', libraryName: 'Shared Documents', annualFolderPath: '/(a) Loans/2026 Loans', companyFolderPath: '/(a) Loans/2026 Loans/Acme', folderUrl: 'https://sp/f', status: 'READY', createdOn: '2026-01-01', createdBy: 'u1', lastVerifiedOn: '2026-01-01', namingSource: 'BORROWER_LEGAL_NAME', configurationVersion: '1' };

describe('SharePoint loan folder card', () => {
  it('renders an honest configuration-required state with every file action disabled', () => {
    render(<SharePointLoanFolderCard status="CONFIGURATION_REQUIRED" canCreate={false} />);
    expect(screen.getByRole('heading', { name: 'Configuration Required' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open SharePoint Loan Folder' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Copy Folder Link' })).toBeDisabled();
  });

  it('exposes retry only for failure and never invokes it while unauthorized', () => {
    const retry = vi.fn();
    render(<SharePointLoanFolderCard status="FAILED" canCreate={false} onRetry={retry} />);
    const button = screen.getByRole('button', { name: 'Retry Folder Creation' });
    expect(button).toBeDisabled();
    button.click();
    expect(retry).not.toHaveBeenCalled();
  });

  it('shows the exact persisted folder path in ready state', () => {
    render(<SharePointLoanFolderCard status="READY" folder={folder} canCreate={false} />);
    expect(screen.getByText(folder.companyFolderPath)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open SharePoint Loan Folder' })).toBeEnabled();
  });

  it('labels DRY_RUN as validation-only and disables it until the generated boundary is available', () => {
    render(<SharePointLoanFolderCard status="CONFIGURATION_REQUIRED" canCreate={false} dryRun={{ available: false, detail: 'Generated client unavailable.' }} />);
    expect(screen.getByText(/DRY_RUN validation only/)).toBeInTheDocument();
    expect(screen.getByText(/Generated client unavailable/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Validate SharePoint Setup (No Write)' })).toBeDisabled();
  });
});
