// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PortfolioImportWizard } from './PortfolioImportWizard';
import type { ImportSummary } from './portfolioImportRunner';
import type { ParsedImport } from './portfolioImportParser';

/**
 * Phase 261 (C) — Upload Existing Portfolio wizard: upload → validate preview →
 * confirm → results, with the governed batch import injected.
 */

const CSV =
  'Loan Number,Borrower Legal Name,Current Loan Status,Current Outstanding Principal,Booking Date\n' +
  'L-1,Acme LLC,Current,500000,2022-03-15\n' +
  'L-2,Beta LLC,Current,250000,2022-06-01\n' +
  ',Missing Number,Current,1,2022-06-01\n';

function file(name: string, content: string): File {
  return new File([content], name, { type: 'text/csv' });
}

describe('PortfolioImportWizard', () => {
  it('previews valid + invalid rows, then imports through the injected governed runner', async () => {
    const runImport = vi.fn(
      async (
        rows: ParsedImport['valid'],
        _actor: { actorEmail: string | undefined; actorSystemUserId: string | undefined; authorized: boolean },
        fileName: string,
      ): Promise<ImportSummary> => ({
        correlationId: 'imp-1',
        fileName,
        rowCount: rows.length,
        successCount: rows.length,
        failureCount: 0,
        results: rows.map((r) => ({ rowNumber: r.rowNumber, loanNumber: r.loanNumber, outcome: { kind: 'success', loanId: 'x', loanNumber: r.loanNumber, correlationId: 'c', childCreated: 0, childErrors: [], auditId: 'a' }, boarded: true })),
        auditWritten: true,
        auditError: undefined,
      }),
    );
    const onImported = vi.fn();
    const user = userEvent.setup();

    const { container } = render(
      <PortfolioImportWizard
        authorized
        actorEmail="op@bank.test"
        actorSystemUserId="sys-1"
        existingLoanNumbers={[]}
        onImported={onImported}
        runImport={runImport}
      />,
    );

    await user.upload(container.querySelector('[data-portfolio-import-file]') as HTMLInputElement, file('book.csv', CSV));

    // Preview shows 2 ready, 1 needs attention.
    await waitFor(() => expect(container.querySelector('[data-portfolio-import-preview]')).not.toBeNull());
    expect(container.querySelector('[data-portfolio-import-valid-count]')?.textContent).toMatch(/2 ready/);
    expect(container.querySelector('[data-portfolio-import-error-count]')?.textContent).toMatch(/1 need attention/);
    expect(container.querySelector('[data-portfolio-import-errors]')?.textContent).toMatch(/Loan Number is required/i);

    // Confirm → the governed runner is called with exactly the 2 valid rows.
    await user.click(container.querySelector('[data-portfolio-import-confirm]') as HTMLElement);
    await waitFor(() => expect(container.querySelector('[data-portfolio-import-result]')).not.toBeNull());
    expect(runImport).toHaveBeenCalledTimes(1);
    expect(runImport.mock.calls[0][0]).toHaveLength(2);
    expect(runImport.mock.calls[0][1]).toMatchObject({ actorSystemUserId: 'sys-1', authorized: true });
    expect(screen.getByText(/Imported/i).textContent).toMatch(/2 of 2/);
    expect(onImported).toHaveBeenCalledTimes(1);
  });

  it('disables import for an unauthorized actor and exposes a template download button', () => {
    const { container } = render(
      <PortfolioImportWizard
        authorized={false}
        actorEmail={undefined}
        actorSystemUserId={undefined}
        existingLoanNumbers={[]}
      />,
    );
    expect(container.querySelector('[data-portfolio-import-disabled]')).not.toBeNull();
    expect((container.querySelector('[data-portfolio-import-file]') as HTMLInputElement).disabled).toBe(true);
    expect(container.querySelector('[data-portfolio-import-template]')).not.toBeNull();
  });
});
