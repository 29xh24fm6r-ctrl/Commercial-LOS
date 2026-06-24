// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BankerOperatingCommandCenter } from './BankerOperatingCommandCenter';

describe('Phase 232 — Banker Operating Command Center', () => {
  it('renders a unified CRM + LOS banker operating cockpit', () => {
    render(<BankerOperatingCommandCenter />);

    expect(
      screen.getByRole('region', { name: /Banker Operating Command Center/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('CRM + LOS active')).toBeInTheDocument();
    expect(screen.getByText(/Unified CRM \+ LOS workflow cockpit/i)).toBeInTheDocument();
  });

  it('shows all major banker operating domains', () => {
    render(<BankerOperatingCommandCenter />);
    const region = screen.getByRole('region', { name: /Banker Operating Command Center/i });

    for (const label of [
      'CRM relationship intelligence',
      'Loan workflow cockpit',
      'Daily banker action queue',
      'New Deal intake',
      'Document checklist readiness',
      'Borrower communications',
      'CRM writeback',
      'Portfolio boarding handoff',
    ]) {
      expect(within(region).getByText(label)).toBeInTheDocument();
    }
  });

  it('points bankers to existing deal cockpit anchors', () => {
    render(<BankerOperatingCommandCenter />);
    const anchors = screen.getByRole('region', { name: /Deal cockpit anchors/i });

    for (const anchor of [
      'loan-workflow-command-center',
      'workstreams',
      'crm-relationship',
      'credit-memo',
      'tasks',
      'documents',
    ]) {
      expect(within(anchors).getByText(anchor)).toBeInTheDocument();
    }
  });

  it('renders no action controls and introduces no write primitive', () => {
    render(<BankerOperatingCommandCenter />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    const src = readFileSync(resolve(__dirname, 'BankerOperatingCommandCenter.tsx'), 'utf8');
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/XMLHttpRequest/);
    expect(src).not.toMatch(/\bcreateRecord\b|\bupdateRecord\b|\bdeleteRecord\b/i);
  });
});