// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DocumentIntakeWorkspace } from './DocumentIntakeWorkspace';
const readiness = { status: 'CONFIGURATION_REQUIRED' as const, totalApplicable: 11, received: 0, pendingReview: 0, outstanding: 11, approvedExceptions: 0, blockers: ['connector'] };
describe('Document Intake workspace', () => {
  it('renders summary, honest SharePoint state, existing workflow, and collapsed due diligence', () => {
    render(<DocumentIntakeWorkspace companyLegalName="Acme LLC" dealNumber="10428" readiness={readiness}><div>Existing governed document workflow</div></DocumentIntakeWorkspace>);
    expect(screen.getByRole('region', { name: 'Document Intake' })).toBeInTheDocument();
    expect(screen.getByText('Configuration Required')).toBeInTheDocument();
    expect(screen.getByText('Existing governed document workflow')).toBeInTheDocument();
    expect(screen.getByText('Due Diligence and Closing')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open SharePoint Loan Folder' })).toBeDisabled();
  });
});
