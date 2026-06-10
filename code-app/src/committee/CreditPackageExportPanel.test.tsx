// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CreditPackageExportPanel } from './CreditPackageExportPanel';
import { prepareCreditPackageExportRequest, submitCreditPackageExport } from './creditPackageExportAdapter';

const CLOCK = '2026-06-10T00:00:00.000Z';
const RESULT = submitCreditPackageExport(prepareCreditPackageExportRequest({ dealId: 'D1', dealName: 'Deal One', clientName: 'Client A', evidenceCount: 6, blockerCount: 0, requestedByDisplayName: 'admin-1', requestedAt: CLOCK }));
const IDENTITY = { dealName: 'Deal One', clientName: 'Client A', readinessStatus: 'ready_for_review', evidenceCount: 6, blockerCount: 0, missingEvidenceCount: 0 };

describe('Phase 142N — CreditPackageExportPanel', () => {
  it('renders the title and disabled-by-default status', () => {
    render(<CreditPackageExportPanel identity={IDENTITY} result={RESULT} />);
    expect(screen.getByText('Package Export Adapter')).toBeTruthy();
    expect(screen.getByText('Disabled by default')).toBeTruthy();
  });

  it('renders the not-enabled body copy', () => {
    render(<CreditPackageExportPanel identity={IDENTITY} result={RESULT} />);
    expect(screen.getAllByText(/Live package export is not enabled/i).length).toBeGreaterThanOrEqual(1);
  });

  it('shows the package / deal / readiness summary', () => {
    render(<CreditPackageExportPanel identity={IDENTITY} result={RESULT} />);
    expect(screen.getByText('Deal')).toBeTruthy();
    expect(screen.getByText('Client')).toBeTruthy();
    expect(screen.getByText('Committee readiness')).toBeTruthy();
    expect(screen.getByText(/Live export performed: false/)).toBeTruthy();
  });

  it('renders an honest empty state when no identity is provided', () => {
    render(<CreditPackageExportPanel />);
    expect(screen.getByText(/No package identity provided/i)).toBeTruthy();
  });

  it('exposes no export / send / upload / submit / deliver / approve / deny / vote buttons or forms', () => {
    const { container } = render(<CreditPackageExportPanel identity={IDENTITY} result={RESULT} />);
    expect(container.querySelectorAll('button, form, input').length).toBe(0);
    const text = (container.textContent ?? '').toLowerCase();
    for (const w of ['export package', 'send package', 'upload package', 'submit export', 'deliver package', 'approve package', 'deny package', 'cast vote', 'exported successfully', 'delivered successfully']) {
      expect(text).not.toContain(w);
    }
  });

  it('renders no external URL', () => {
    const { container } = render(<CreditPackageExportPanel identity={IDENTITY} result={RESULT} />);
    expect(container.innerHTML).not.toMatch(/https?:\/\//);
  });
});
