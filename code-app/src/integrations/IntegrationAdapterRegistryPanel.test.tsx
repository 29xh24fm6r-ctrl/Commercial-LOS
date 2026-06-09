// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IntegrationAdapterRegistryPanel } from './IntegrationAdapterRegistryPanel';
import { deriveIntegrationReadiness } from './deriveIntegrationReadiness';

describe('Phase 142F — IntegrationAdapterRegistryPanel', () => {
  it('renders the provider registry with the disabled banner', () => {
    render(<IntegrationAdapterRegistryPanel />);
    expect(screen.getByText(/Read-only integration registry/i)).toBeTruthy();
    expect(screen.getAllByText('AML / KYC Provider').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Credit Bureau Provider')).toBeTruthy();
  });

  it('shows disabled mode and risk / sensitivity', () => {
    render(<IntegrationAdapterRegistryPanel readiness={deriveIntegrationReadiness({ templateRequiresCreditBureau: true })} />);
    // Mode chips render the disabled mode.
    expect(screen.getAllByText('disabled').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Risk class/i).length).toBeGreaterThanOrEqual(1);
  });

  it('exposes no configure / enable / run / pull / score / lookup / post / send controls', () => {
    const { container } = render(<IntegrationAdapterRegistryPanel readiness={deriveIntegrationReadiness({ servicingStage: 'booked_active' })} />);
    expect(container.querySelectorAll('button').length).toBe(0);
    const text = (container.textContent ?? '').toLowerCase();
    for (const w of ['enable provider', 'configure provider', 'run aml', 'pull credit', 'run score', 'post payment', 'disburse funds', 'send envelope', 'generate upload']) {
      expect(text).not.toContain(w);
    }
  });

  it('renders no external URLs', () => {
    const { container } = render(<IntegrationAdapterRegistryPanel />);
    expect(container.innerHTML).not.toMatch(/https?:\/\//);
  });
});
