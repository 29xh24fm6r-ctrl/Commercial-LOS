// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CrmRelationshipIntelligenceCockpit } from './CrmRelationshipIntelligenceCockpit';
import { deriveCrmRelationshipIntelligenceViewModel } from './crmRelationshipIntelligenceViewModel';

const VM = deriveCrmRelationshipIntelligenceViewModel({});

function renderCrm(props: { viewModel?: typeof VM } = {}, path = '/crm') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <CrmRelationshipIntelligenceCockpit {...props} />
    </MemoryRouter>,
  );
}

describe('Phase 143H — CrmRelationshipIntelligenceCockpit', () => {
  it('renders the cockpit title, banner, and all sections', () => {
    renderCrm({ viewModel: VM });
    expect(screen.getByText('CRM Relationship Intelligence Cockpit')).toBeTruthy();
    expect(screen.getByText(/No record is synced, pushed, or written/i)).toBeTruthy();
    expect(screen.getByText('Salesforce readiness')).toBeTruthy();
    expect(screen.getByText('nCino readiness')).toBeTruthy();
    expect(screen.getByText('Writeback policy status')).toBeTruthy();
  });

  it('renders the next safe step', () => {
    renderCrm({ viewModel: VM });
    expect(screen.getByText(/Next safe CRM activation step:/i)).toBeTruthy();
  });

  it('renders an honest unavailable state', () => {
    renderCrm({});
    expect(screen.getByText(/CRM relationship intelligence is unavailable/i)).toBeTruthy();
  });

  it('exposes no sync / push / write buttons or forms', () => {
    const { container } = renderCrm({ viewModel: VM });
    expect(container.querySelectorAll('button, form, input').length).toBe(0);
    const text = (container.textContent ?? '').toLowerCase();
    for (const w of ['sync now', 'push now', 'write now', 'synced successfully', 'salesforce updated', 'ncino updated']) {
      expect(text).not.toContain(w);
    }
  });
});

describe('Phase 144E — CRM cockpit drill-through deep-link', () => {
  it('opens the matching section panel when ?drill=<target id> is present', () => {
    const { container } = renderCrm({ viewModel: VM }, '/crm?drill=crm-rel-salesforce_readiness');
    const openDetails = container.querySelectorAll('details[open]');
    expect(openDetails.length).toBe(1);
    // Heading comes from the local target payload, not the raw URL id.
    expect(
      within(openDetails[0] as HTMLElement).getByRole('heading', { name: 'Salesforce readiness — details' }),
    ).toBeTruthy();
  });

  it('fails closed for an unsafe drill param (no panel opens, no URL-sourced payload)', () => {
    const { container } = renderCrm({ viewModel: VM }, '/crm?drill=javascript:alert');
    expect(container.querySelectorAll('details[open]').length).toBe(0);
    expect((container.textContent ?? '').toLowerCase()).not.toContain('javascript:alert');
  });

  it('leaves sections closed and adds no write controls when no drill param is present', () => {
    const { container } = renderCrm({ viewModel: VM }, '/crm');
    expect(container.querySelectorAll('details[open]').length).toBe(0);
    expect(container.querySelectorAll('button, form, input').length).toBe(0);
  });
});
