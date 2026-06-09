// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CompetitiveReferencePlatformPanel } from './CompetitiveReferencePlatformPanel';

describe('Phase 142H — CompetitiveReferencePlatformPanel', () => {
  it('renders all reference platforms', () => {
    render(<CompetitiveReferencePlatformPanel />);
    expect(screen.getByText('Salesforce / nCino archetype')).toBeTruthy();
    expect(screen.getByText('OpenCBS LOS')).toBeTruthy();
    expect(screen.getByText('Frappe Lending')).toBeTruthy();
    expect(screen.getByText('Twenty CRM')).toBeTruthy();
    expect(screen.getByText('Corteza')).toBeTruthy();
  });

  it('caveats unknowns and renders limitations', () => {
    render(<CompetitiveReferencePlatformPanel />);
    expect(screen.getAllByText(/Limitations \/ caveats/i).length).toBeGreaterThanOrEqual(1);
  });

  it('renders no external links, iframe, or fetch, and no overclaim language', () => {
    const { container } = render(<CompetitiveReferencePlatformPanel />);
    expect(container.querySelectorAll('a, iframe').length).toBe(0);
    expect(container.innerHTML).not.toMatch(/https?:\/\//);
    expect((container.textContent ?? '').toLowerCase()).not.toMatch(/better than|superior to|beats ncino/);
  });
});
