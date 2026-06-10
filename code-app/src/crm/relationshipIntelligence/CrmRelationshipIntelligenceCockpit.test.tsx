// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CrmRelationshipIntelligenceCockpit } from './CrmRelationshipIntelligenceCockpit';
import { deriveCrmRelationshipIntelligenceViewModel } from './crmRelationshipIntelligenceViewModel';

const VM = deriveCrmRelationshipIntelligenceViewModel({});

describe('Phase 143H — CrmRelationshipIntelligenceCockpit', () => {
  it('renders the cockpit title, banner, and all sections', () => {
    render(<CrmRelationshipIntelligenceCockpit viewModel={VM} />);
    expect(screen.getByText('CRM Relationship Intelligence Cockpit')).toBeTruthy();
    expect(screen.getByText(/No record is synced, pushed, or written/i)).toBeTruthy();
    expect(screen.getByText('Salesforce readiness')).toBeTruthy();
    expect(screen.getByText('nCino readiness')).toBeTruthy();
    expect(screen.getByText('Writeback policy status')).toBeTruthy();
  });

  it('renders the next safe step', () => {
    render(<CrmRelationshipIntelligenceCockpit viewModel={VM} />);
    expect(screen.getByText(/Next safe CRM activation step:/i)).toBeTruthy();
  });

  it('renders an honest unavailable state', () => {
    render(<CrmRelationshipIntelligenceCockpit />);
    expect(screen.getByText(/CRM relationship intelligence is unavailable/i)).toBeTruthy();
  });

  it('exposes no sync / push / write buttons or forms', () => {
    const { container } = render(<CrmRelationshipIntelligenceCockpit viewModel={VM} />);
    expect(container.querySelectorAll('button, form, input').length).toBe(0);
    const text = (container.textContent ?? '').toLowerCase();
    for (const w of ['sync now', 'push now', 'write now', 'synced successfully', 'salesforce updated', 'ncino updated']) {
      expect(text).not.toContain(w);
    }
  });
});
