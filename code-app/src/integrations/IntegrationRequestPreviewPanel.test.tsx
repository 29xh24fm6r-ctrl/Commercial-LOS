// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IntegrationRequestPreviewPanel } from './IntegrationRequestPreviewPanel';
import { getIntegrationProvider } from './integrationProviderRegistry';
import type { IntegrationAdapterDefinition } from './integrationAdapterTypes';

const bureau = getIntegrationProvider('credit_bureau_provider') as IntegrationAdapterDefinition;

describe('Phase 142F — IntegrationRequestPreviewPanel', () => {
  it('renders a preview-only banner and the approval / permissible-purpose requirements', () => {
    render(<IntegrationRequestPreviewPanel provider={bureau} request={{ providerKey: bureau.providerKey, capability: 'retrieve_credit_report_summary' }} />);
    expect(screen.getAllByText(/Preview only/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Required approval')).toBeTruthy();
    expect(screen.getByText('Permissible purpose')).toBeTruthy();
  });

  it('redacts the subject reference (no raw PII echoed)', () => {
    const { container } = render(
      <IntegrationRequestPreviewPanel provider={bureau} request={{ providerKey: bureau.providerKey, capability: 'retrieve_credit_report_summary', subjectRef: 'ssn-000-00-0000' }} />,
    );
    expect(container.textContent ?? '').not.toContain('ssn-000-00-0000');
    expect(screen.getByText(/Contains PII: false/)).toBeTruthy();
  });

  it('exposes no submit / run control and no external URL', () => {
    const { container } = render(<IntegrationRequestPreviewPanel provider={bureau} request={{ providerKey: bureau.providerKey, capability: 'retrieve_credit_report_summary' }} />);
    expect(container.querySelectorAll('button').length).toBe(0);
    const text = (container.textContent ?? '').toLowerCase();
    expect(text).not.toContain('submit request');
    expect(text).not.toContain('run request');
    expect(container.innerHTML).not.toMatch(/https?:\/\//);
  });
});
