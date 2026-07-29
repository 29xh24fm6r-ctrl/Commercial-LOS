// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EliteCrmLosActivationReadinessPanel } from './EliteCrmLosActivationReadinessPanel';

describe('Phase 231 — Elite CRM + LOS full activation readiness panel', () => {
  it('renders the cross-system elite readiness console', () => {
    render(<EliteCrmLosActivationReadinessPanel />);
    expect(
      screen.getByRole('region', { name: /Elite CRM and LOS full activation readiness/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Elite CRM \+ LOS Full Activation Readiness/i)).toBeInTheDocument();
    expect(screen.getByText('Activation readiness')).toBeInTheDocument();
  });

  it('shows all major CRM and LOS domains in one operating layer', () => {
    render(<EliteCrmLosActivationReadinessPanel />);
    const region = screen.getByRole('region', {
      name: /Elite CRM and LOS full activation readiness/i,
    });

    for (const label of [
      'Internal OGB CRM operating layer',
      'nCino-style internal loan workflow layer',
      'CRM writeback / live persistence',
      'New Deal create / origination gate',
      'Document checklist generation',
      'Portfolio boarding / booked loan handoff',
    ]) {
      expect(within(region).getByText(label)).toBeInTheDocument();
    }
  });

  it('makes gated write categories and operator actions visible', () => {
    render(<EliteCrmLosActivationReadinessPanel />);
    expect(screen.getByRole('region', { name: /Remaining blockers/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /Operator actions/i })).toBeInTheDocument();
    expect(screen.getByText(/No hidden live writes are enabled/i)).toBeInTheDocument();
    expect(screen.getByText(/No external Salesforce or nCino dependency is implied/i)).toBeInTheDocument();
  });

  it('source remains read-only and introduces no write primitive', () => {
    const src = readFileSync(resolve(__dirname, 'EliteCrmLosActivationReadinessPanel.tsx'), 'utf8');
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/XMLHttpRequest/);
    expect(src).not.toMatch(/\bcreateRecord\b|\bupdateRecord\b|\bdeleteRecord\b/i);
  });
});
