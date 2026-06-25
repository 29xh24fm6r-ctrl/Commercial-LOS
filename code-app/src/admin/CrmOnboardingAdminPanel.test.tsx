// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { CrmOnboardingAdminPanel } from './CrmOnboardingAdminPanel';

/**
 * Phase 169E -- CRM Onboarding admin panel (Case B, disabled-by-default).
 */

describe('Phase 169E -- CRM Onboarding admin panel', () => {
  it('renders the panel marked Live persistence ON with the fail-closed reason', () => {
    const { container } = render(<CrmOnboardingAdminPanel />);
    expect(
      screen.getByRole('region', { name: 'CRM Onboarding' }),
    ).toBeInTheDocument();
    // Status badge (exact text), distinct from the longer note copy.
    expect(screen.getByText('Live persistence ON')).toBeInTheDocument();
    const reason = container.querySelector('[data-admin-crm-disabled-reason]');
    expect(reason?.textContent).toMatch(/disabled by default/i);
    expect(reason?.textContent).toMatch(/fails closed/i);
  });

  it('reports the external CRM connector as not configured / disabled by default', () => {
    const { container } = render(<CrmOnboardingAdminPanel />);
    const connector = container.querySelector('[data-admin-crm-connector]');
    expect(connector?.textContent).toMatch(/Not configured \(disabled by default\)/i);
  });

  it('shows all ten required CRM data groups', () => {
    const { container } = render(<CrmOnboardingAdminPanel />);
    const groups = container.querySelector('[data-admin-crm-data-groups]') as HTMLElement;
    expect(groups.querySelectorAll('li').length).toBe(10);
    for (const label of [
      'Organizations',
      'People',
      'Contact points',
      'Relationships',
      'Role assignments',
      'Communication preferences',
      'Contact authorizations',
      'Vendor profiles',
      'Timeline events',
      'Audit entries',
    ]) {
      expect(within(groups).getByText(label)).toBeInTheDocument();
    }
  });

  it('shows readiness and the five next safe steps', () => {
    const { container } = render(<CrmOnboardingAdminPanel />);
    expect(container.querySelector('[data-admin-crm-readiness]')).not.toBeNull();
    const steps = container.querySelector('[data-admin-crm-next-steps]') as HTMLElement;
    expect(steps.querySelectorAll('li').length).toBe(5);
  });

  it('keeps create / import / sync actions all disabled', () => {
    const { container } = render(<CrmOnboardingAdminPanel />);
    const actions = container.querySelectorAll('[data-admin-crm-action]');
    expect(actions.length).toBe(3);
    for (const a of Array.from(actions)) {
      expect(a).toBeDisabled();
      expect(a.getAttribute('aria-disabled')).toBe('true');
    }
    expect(screen.getByText('CRM create disabled')).toBeInTheDocument();
    expect(screen.getByText('CRM import disabled')).toBeInTheDocument();
    expect(screen.getByText('CRM sync disabled')).toBeInTheDocument();
  });

  it('shows the explicit no-record / no-sync note', () => {
    const { container } = render(<CrmOnboardingAdminPanel />);
    const note = container.querySelector('[data-admin-crm-no-record-note]');
    expect(note?.textContent).toMatch(/does not create CRM records or sync external CRM data until live persistence is explicitly enabled and certified/i);
  });

  it('renders no fabricated CRM record', () => {
    const { container } = render(<CrmOnboardingAdminPanel />);
    const text = (container.textContent ?? '').toLowerCase();
    for (const banned of ['record created', 'synced successfully', 'imported successfully', 'contact added', 'organization created']) {
      expect(text).not.toContain(banned);
    }
  });

  it('has no enabled button anywhere in the panel', () => {
    const { container } = render(<CrmOnboardingAdminPanel />);
    for (const b of Array.from(container.querySelectorAll('button'))) {
      expect(b).toBeDisabled();
    }
  });
});

describe('Phase 169E -- panel source discipline', () => {
  const SRC = readFileSync(resolve(__dirname, 'CrmOnboardingAdminPanel.tsx'), 'utf8');

  it('introduces no fetch / XHR / Graph / Dataverse write/create and no GUID', () => {
    expect(SRC).not.toMatch(/\bfetch\s*\(/);
    expect(SRC).not.toMatch(/XMLHttpRequest/);
    expect(SRC).not.toMatch(/graph\.microsoft\.com/i);
    expect(SRC).not.toMatch(/createRecordAsync|updateRecordAsync|deleteRecordAsync/);
    expect(SRC).not.toMatch(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
  });
});
